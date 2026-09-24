import os
import platform
import time

# PyTorch reads this fallback flag during import. On Intel Macs that expose MPS,
# let supported operations stay on the GPU while unsupported MPS operations fall
# back to CPU. AAF_TORCH_DEVICE=cpu remains available as a conservative override.
_INTEL_MAC = platform.system() == "Darwin" and platform.machine().lower() in {"x86_64", "amd64", "i386"}
if _INTEL_MAC:
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

start_import_time = time.time()
import cv2
import torch
import torch.nn.functional as F
import numpy as np
from torchvision.transforms import Compose
from ai_models.Depth_Anything_V2.depth_anything_v2.dpt import DepthAnythingV2
from ai_models.Depth_Anything_V2.depth_anything_v2.util.transform import Resize, NormalizeImage, PrepareForNet
end_import_time = time.time()
print(f"Elapsed time for imports: {end_import_time - start_import_time:.4f} seconds")


def choose_torch_device() -> str:
    """Choose a device for Depth Anything V2.

    CUDA is preferred when available. MPS is used when available on Macs. On
    Intel Macs, PYTORCH_ENABLE_MPS_FALLBACK=1 is enabled before importing torch,
    so unsupported MPS operations can fall back to CPU without distorting the
    model input. AAF_TORCH_DEVICE=cpu|mps|cuda can override the default.
    """
    forced = os.getenv("AAF_TORCH_DEVICE", "").strip().lower()
    if forced in {"cpu", "mps", "cuda"}:
        if forced == "cuda" and not torch.cuda.is_available():
            print("AAF_TORCH_DEVICE=cuda requested, but CUDA is unavailable; using CPU")
            return "cpu"
        if forced == "mps" and not torch.backends.mps.is_available():
            print("AAF_TORCH_DEVICE=mps requested, but MPS is unavailable; using CPU")
            return "cpu"
        return forced

    if torch.cuda.is_available():
        return "cuda"

    if torch.backends.mps.is_available():
        if _INTEL_MAC:
            print("MPS detected on an Intel Mac; trying MPS with CPU fallback for unsupported operations")
        return "mps"

    return "cpu"


class DepthMapGenerator:
    _instance = None
    model = None
    device = "cpu"

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(DepthMapGenerator, cls).__new__(cls)
        return cls._instance

    def __init__(self, encoder="vits"):
        self.encoder = encoder

    def load_model(self, encoder=None):
        encoder = encoder or self.encoder
        print("Loading model")
        self.device = choose_torch_device()
        model_configs = {
            'vits': {'encoder': 'vits', 'features': 64, 'out_channels': [48, 96, 192, 384]},
            'vitb': {'encoder': 'vitb', 'features': 128, 'out_channels': [96, 192, 384, 768]},
            'vitl': {'encoder': 'vitl', 'features': 256, 'out_channels': [256, 512, 1024, 1024]},
            'vitg': {'encoder': 'vitg', 'features': 384, 'out_channels': [1536, 1536, 1536, 1536]}
        }
        self.model = DepthAnythingV2(**model_configs[encoder])
        self.model.load_state_dict(torch.load(f'ai_models/checkpoints/depth_anything_v2_{encoder}.pth', map_location='cpu'))
        self.model = self.model.to(self.device).eval()
        print(f"Loaded model on {self.device}")

    def generate_depth_map(self, image: np.ndarray) -> np.ndarray:
        """Generate depth while keeping both model weights and input tensor on our selected device.

        Depth Anything V2's stock image2tensor() independently chooses CUDA/MPS/CPU.
        Reproducing its preprocessing here lets Anaglyph & Friends make one
        consistent device decision and preserve the source aspect ratio.
        """
        started = time.time()
        if self.model is None:
            self.load_model()
        input_size = 518
        transform = Compose([
            Resize(
                width=input_size,
                height=input_size,
                resize_target=False,
                keep_aspect_ratio=True,
                ensure_multiple_of=14,
                resize_method='lower_bound',
                image_interpolation_method=cv2.INTER_CUBIC,
            ),
            NormalizeImage(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            PrepareForNet(),
        ])

        h, w = image.shape[:2]
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB) / 255.0
        prepared = transform({'image': rgb})['image']
        tensor = torch.from_numpy(prepared).unsqueeze(0).to(self.device)

        with torch.no_grad():
            depth = self.model(tensor)
            depth = F.interpolate(depth[:, None], (h, w), mode="bilinear", align_corners=True)[0, 0]

        result = self.normalise(depth.cpu().numpy()).astype(np.float32)
        print(f"Depth inference on {self.device}: {time.time() - started:.3f} seconds")
        return result

    def normalise(self, depth_map: np.ndarray) -> np.ndarray:
        minimum = float(np.min(depth_map))
        maximum = float(np.max(depth_map))
        span = maximum - minimum
        if span <= 1e-12:
            return np.zeros_like(depth_map, dtype=np.float32)
        return ((depth_map - minimum) / span).astype(np.float32)

    def downscale_image(self, image: np.ndarray, width: int, height: int):
        return cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)

    def upscale_depth_map(self, depth_map: np.ndarray, width: int, height: int):
        """Resize floating-point depth without quantizing it to 8-bit first."""
        return cv2.resize(depth_map.astype(np.float32), (width, height), interpolation=cv2.INTER_CUBIC)

    def generate_depth_map_performant(self, image: np.ndarray, intermediateWidth: int, intermediateHeight: int) -> np.ndarray:
        """Legacy helper that preserves source aspect ratio and depth precision."""
        start_time = time.time()
        height, width = image.shape[:2]
        scale = min(intermediateWidth / width, intermediateHeight / height)
        scaled_width = max(1, int(round(width * scale)))
        scaled_height = max(1, int(round(height * scale)))
        image_downscaled = self.downscale_image(image, scaled_width, scaled_height)
        depth_map_downscaled = self.generate_depth_map(image_downscaled)
        depth_map_upscaled = self.upscale_depth_map(depth_map_downscaled, width, height)
        print(f"Elapsed time for depth map generation (performant): {time.time() - start_time:.4f} seconds")
        return np.clip(depth_map_upscaled, 0.0, 1.0).astype(np.float32)

    def colour_depth_map(self, depth_map: np.ndarray) -> np.ndarray:
        depth_map_scaled = (np.clip(depth_map, 0.0, 1.0) * 255).astype(np.uint8)
        return cv2.applyColorMap(depth_map_scaled, cv2.COLORMAP_JET)

    def blur_depth_map(self, depth_map: np.ndarray, kernel_width: int) -> np.ndarray:
        """Blur horizontally while retaining floating-point depth precision."""
        return cv2.blur(depth_map.astype(np.float32), (kernel_width, 1)).astype(np.float32)


depth_map_generator = DepthMapGenerator(encoder="vits")
