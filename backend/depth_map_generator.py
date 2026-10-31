"""Depth Anything V2 inference adapter for Anaglyph & Friends.

Retains the independently licensed Depth Anything V2 model, model checkpoints,
and existing API while replacing the former application-specific wrapper.
Model code and weights retain their upstream licenses.
"""
from __future__ import annotations

import os
import platform
import time

import cv2
import numpy as np

# Set this before torch is imported on Intel macOS systems.
_INTEL_MAC = platform.system() == "Darwin" and platform.machine().lower() in ("x86_64", "amd64", "i386")
if _INTEL_MAC:
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import torch
import torch.nn.functional as F
from ai_models.Depth_Anything_V2.depth_anything_v2.dpt import DepthAnythingV2
from ai_models.Depth_Anything_V2.depth_anything_v2.util.transform import (
    NormalizeImage, PrepareForNet, Resize,
)
from torchvision.transforms import Compose


_MODEL_CONFIGS = {
    "vits": (64, [48, 96, 192, 384]),
    "vitb": (128, [96, 192, 384, 768]),
    "vitl": (256, [256, 512, 1024, 1024]),
    "vitg": (384, [1536, 1536, 1536, 1536]),
}


def choose_torch_device() -> str:
    requested = os.getenv("AAF_TORCH_DEVICE", "").strip().lower()
    available = {"cpu": True, "cuda": torch.cuda.is_available(),
                 "mps": bool(torch.backends.mps.is_available())}
    if requested in available:
        return requested if available[requested] else "cpu"
    return "cuda" if available["cuda"] else ("mps" if available["mps"] else "cpu")


class DepthMapGenerator:
    def __init__(self, encoder="vits"):
        if encoder not in _MODEL_CONFIGS:
            raise ValueError("Unsupported Depth Anything V2 encoder")
        self.encoder = encoder
        self.model = None
        self.device = "cpu"
        self._loaded_encoder = None

    def load_model(self, encoder=None):
        encoder = encoder or self.encoder
        if encoder not in _MODEL_CONFIGS:
            raise ValueError("Unsupported Depth Anything V2 encoder")
        features, channels = _MODEL_CONFIGS[encoder]
        checkpoint_dir = os.getenv("AAF_DEPTH_MODEL_DIR", "ai_models/checkpoints")
        path = os.path.join(checkpoint_dir, f"depth_anything_v2_{encoder}.pth")
        device = choose_torch_device()
        model = DepthAnythingV2(encoder=encoder, features=features, out_channels=channels)
        weights = torch.load(path, map_location="cpu", weights_only=True)
        model.load_state_dict(weights)
        self.model = model.to(device).eval()
        self.device = device
        self._loaded_encoder = encoder

    @staticmethod
    def normalise(depth_map):
        data = np.asarray(depth_map, dtype=np.float32)
        minimum, maximum = float(np.min(data)), float(np.max(data))
        if maximum - minimum < 1e-12:
            return np.zeros_like(data, dtype=np.float32)
        return (data - minimum) / (maximum - minimum)

    def generate_depth_map(self, image):
        if image.ndim != 3 or image.shape[2] != 3:
            raise ValueError("Depth inference expects a BGR image")
        if self.model is None:
            self.load_model()
        height, width = image.shape[:2]
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        preprocessing = Compose([
            Resize(width=518, height=518, resize_target=False,
                   keep_aspect_ratio=True, ensure_multiple_of=14,
                   resize_method="lower_bound",
                   image_interpolation_method=cv2.INTER_CUBIC),
            NormalizeImage(mean=[0.485, 0.456, 0.406],
                           std=[0.229, 0.224, 0.225]),
            PrepareForNet(),
        ])
        prepared = preprocessing({"image": rgb})["image"]
        tensor = torch.from_numpy(prepared).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            prediction = self.model(tensor)
            prediction = F.interpolate(
                prediction[:, None], size=(height, width),
                mode="bilinear", align_corners=True)[0, 0]
        return self.normalise(prediction.cpu().numpy()).astype(np.float32)

    @staticmethod
    def downscale_image(image, width, height):
        return cv2.resize(image, (int(width), int(height)), interpolation=cv2.INTER_AREA)

    @staticmethod
    def upscale_depth_map(depth_map, width, height):
        return cv2.resize(np.asarray(depth_map, dtype=np.float32),
                          (int(width), int(height)), interpolation=cv2.INTER_CUBIC)

    def generate_depth_map_performant(self, image, intermediateWidth, intermediateHeight):
        height, width = image.shape[:2]
        factor = min(float(intermediateWidth) / width, float(intermediateHeight) / height)
        small = self.downscale_image(image, max(1, round(width * factor)),
                                     max(1, round(height * factor)))
        result = self.generate_depth_map(small)
        return np.clip(self.upscale_depth_map(result, width, height), 0, 1).astype(np.float32)

    @staticmethod
    def colour_depth_map(depth_map):
        gray = np.rint(np.clip(depth_map, 0, 1) * 255).astype(np.uint8)
        return cv2.applyColorMap(gray, cv2.COLORMAP_JET)

    @staticmethod
    def blur_depth_map(depth_map, kernel_width):
        return cv2.blur(np.asarray(depth_map, dtype=np.float32),
                        (int(kernel_width), 1)).astype(np.float32)


depth_map_generator = DepthMapGenerator()
