import math
import os
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


class TechniqueGenerator:
    """Render presentation formats that sit on top of the shared source/depth pipeline."""

    @staticmethod
    def _fill_holes(image: np.ndarray) -> np.ndarray:
        mask = np.all(image == -1, axis=-1).astype(np.uint8) * 255
        return cv2.inpaint(image.astype(np.uint8), mask, 1, cv2.INPAINT_TELEA)

    def generate_view(
        self,
        image: np.ndarray,
        depth_map: np.ndarray,
        offset: float,
        pop_out: bool = False,
        strength: float = 2.0,
    ) -> np.ndarray:
        """Synthesize one virtual viewpoint; offset -1..1 spans the stereo baseline."""
        height, width = image.shape[:2]
        depth = depth_map if pop_out else 1.0 - depth_map
        max_shift = (strength / 100.0 * width) / 2.0
        shifts = np.rint(offset * max_shift * depth).astype(np.int32)
        cols = np.arange(width)
        target_cols = np.clip(cols + shifts, 0, width - 1)
        rows = np.arange(height).reshape(height, 1)
        result = np.full_like(image, -1, dtype=np.int16)
        if offset < 0:
            result[rows, target_cols[:, ::-1]] = image[:, ::-1]
        else:
            result[rows, target_cols] = image
        return self._fill_holes(result)

    @staticmethod
    def _fit_bgr(image: np.ndarray, width: int, height: int, background=(0, 0, 0)) -> np.ndarray:
        canvas = np.full((height, width, 3), background, dtype=np.uint8)
        source_h, source_w = image.shape[:2]
        scale = min(width / source_w, height / source_h)
        new_w = max(1, int(round(source_w * scale)))
        new_h = max(1, int(round(source_h * scale)))
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
        x = (width - new_w) // 2
        y = (height - new_h) // 2
        canvas[y:y + new_h, x:x + new_w] = resized
        return canvas

    @staticmethod
    def _crop_resize_pair(image: np.ndarray, depth: np.ndarray, width: int, height: int):
        source_h, source_w = image.shape[:2]
        source_ratio = source_w / source_h
        target_ratio = width / height
        if source_ratio > target_ratio:
            crop_w = int(round(source_h * target_ratio))
            x0 = (source_w - crop_w) // 2
            image = image[:, x0:x0 + crop_w]
            depth = depth[:, x0:x0 + crop_w]
        elif source_ratio < target_ratio:
            crop_h = int(round(source_w / target_ratio))
            y0 = (source_h - crop_h) // 2
            image = image[y0:y0 + crop_h, :]
            depth = depth[y0:y0 + crop_h, :]
        image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)
        depth = cv2.resize(depth.astype(np.float32), (width, height), interpolation=cv2.INTER_CUBIC)
        return image, np.clip(depth, 0.0, 1.0).astype(np.float32)

    def chromadepth(self, image: np.ndarray, depth: np.ndarray, color_strength: float = 0.9, reverse: bool = False) -> np.ndarray:
        # Depth Anything V2's relative disparity is larger for nearer subjects.
        # ChromaDepth convention maps near toward red and far toward blue.
        depth_use = depth if reverse else 1.0 - depth
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV).astype(np.float32)
        # OpenCV hue: red=0, blue≈120.
        target_hue = np.clip(depth_use * 120.0, 0, 120)
        amount = max(0.0, min(1.0, color_strength))
        hsv[:, :, 0] = target_hue
        hsv[:, :, 1] = hsv[:, :, 1] * (1.0 - amount) + 255.0 * amount
        return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)

    def cardboard(
        self,
        left: np.ndarray,
        right: np.ndarray,
        output_width: int = 1920,
        output_height: int = 1080,
        screen_width_mm: float = 121.0,
        lens_separation_mm: float = 63.0,
        image_scale: float = 0.92,
    ) -> np.ndarray:
        output_width = max(640, min(5000, int(output_width)))
        output_height = max(360, min(3000, int(output_height)))
        screen_width_mm = max(70.0, min(200.0, float(screen_width_mm)))
        lens_separation_mm = max(45.0, min(80.0, float(lens_separation_mm)))
        image_scale = max(0.3, min(1.0, float(image_scale)))
        canvas = np.zeros((output_height, output_width, 3), dtype=np.uint8)
        px_per_mm = output_width / screen_width_mm
        center = output_width / 2.0
        centers = (
            center - lens_separation_mm * px_per_mm / 2.0,
            center + lens_separation_mm * px_per_mm / 2.0,
        )
        box_w = max(1, int(output_width * 0.48 * image_scale))
        box_h = max(1, int(output_height * 0.96 * image_scale))
        for source, eye_center in ((left, centers[0]), (right, centers[1])):
            fitted = self._fit_bgr(source, box_w, box_h)
            x0 = int(round(eye_center - box_w / 2))
            y0 = (output_height - box_h) // 2
            src_x0 = max(0, -x0)
            dst_x0 = max(0, x0)
            copy_w = min(box_w - src_x0, output_width - dst_x0)
            if copy_w > 0:
                canvas[y0:y0 + box_h, dst_x0:dst_x0 + copy_w] = fitted[:, src_x0:src_x0 + copy_w]
        return canvas

    @staticmethod
    def _font(size: int, bold: bool = False, serif: bool = False):
        if serif:
            candidates = [
                "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
                "/System/Library/Fonts/Supplemental/Georgia Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Georgia.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
            ]
        else:
            candidates = [
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
                "/System/Library/Fonts/Helvetica.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            ]
        for path in candidates:
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, max(8, int(size)))
                except OSError:
                    continue
        return ImageFont.load_default()

    @staticmethod
    def _arched_top(width: int, arch_depth: int):
        """Return a flat crown with visibly rounded upper shoulders."""
        if arch_depth <= 0:
            return [(x, 0) for x in range(width)]
        shoulder = max(1, min(width // 3, max(arch_depth * 2, int(round(width * 0.14)))))
        points = []
        for x in range(width):
            edge_distance = min(x, width - 1 - x)
            if edge_distance >= shoulder:
                y = 0
            else:
                normalized = 1.0 - edge_distance / shoulder
                curve = 1.0 - math.sqrt(max(0.0, 1.0 - normalized * normalized))
                y = int(round(arch_depth * curve))
            points.append((x, y))
        return points

    @classmethod
    def _arched_mask(cls, width: int, height: int, arch_depth: int) -> Image.Image:
        mask = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(mask)
        arch_depth = max(0, min(height // 3, arch_depth))
        points = cls._arched_top(width, arch_depth)
        points.extend([(width - 1, height - 1), (0, height - 1)])
        draw.polygon(points, fill=255)
        return mask

    @staticmethod
    def _paper_background(width: int, height: int, color):
        """Render solid white/black cards; retain subtle grain only for legacy colored mounts."""
        color = tuple(int(channel) for channel in color)
        if color == (255, 255, 255) or max(color) < 80:
            return Image.new("RGB", (width, height), color)
        base = np.empty((height, width, 3), dtype=np.int16)
        base[:] = np.array(color, dtype=np.int16)
        rng = np.random.default_rng(1862)
        grain = rng.normal(0.0, 1.6, size=(height, width, 1))
        base = np.clip(base + grain, 0, 255).astype(np.uint8)
        return Image.fromarray(base, "RGB")

    def stereoscope_card(
        self,
        left: np.ndarray,
        right: np.ndarray,
        dpi: int = 300,
        card_width_in: float = 7.0,
        card_height_in: float = 3.5,
        image_width_in: float = 2.85,
        image_height_in: float = 2.55,
        gap_in: float = 0.35,
        arch_in: float = 0.22,
        title: str = "STEREOSCOPIC VIEW",
        caption: str = "Generated from a single photograph",
        publisher: str = "Anaglyph & Friends",
        card_tone: str = "white",
    ) -> np.ndarray:
        dpi = max(72, min(1200, int(dpi)))
        cw = max(600, int(round(card_width_in * dpi)))
        ch = max(300, int(round(card_height_in * dpi)))
        iw = max(120, int(round(image_width_in * dpi)))
        ih = max(120, int(round(image_height_in * dpi)))
        gap = max(0, int(round(gap_in * dpi)))
        arch = max(0, int(round(arch_in * dpi)))
        tones = {
            "cream": (229, 213, 170),
            "tan": (194, 167, 123),
            "gray": (188, 187, 179),
            "black": (0, 0, 0),
            "white": (255, 255, 255),
        }
        tone = card_tone.lower()
        bg = tones.get(tone, tones["white"])
        dark = tone == "black"
        fg = (255, 255, 255) if dark else (0, 0, 0)
        rule = (178, 178, 178) if dark else (76, 76, 76)
        keyline = (220, 220, 220) if dark else (32, 32, 32)
        card = self._paper_background(cw, ch, bg)
        draw = ImageDraw.Draw(card)

        inset = max(2, int(round(0.045 * dpi)))
        draw.rectangle((inset, inset, cw - inset - 1, ch - inset - 1), outline=rule, width=max(1, dpi // 300))

        total_width = iw * 2 + gap
        x0 = max(0, (cw - total_width) // 2)
        y0 = max(inset + 2, int(round(0.16 * dpi)))
        mask = self._arched_mask(iw, ih, arch)
        arch_points = self._arched_top(iw, min(ih // 3, arch))
        outline_width = max(1, int(round(dpi / 180)))

        for source, x in ((left, x0), (right, x0 + iw + gap)):
            rgb = cv2.cvtColor(source, cv2.COLOR_BGR2RGB)
            fitted = ImageOps.fit(Image.fromarray(rgb), (iw, ih), method=Image.Resampling.LANCZOS)
            card.paste(fitted, (x, y0), mask)
            translated_top = [(x + px, y0 + py) for px, py in arch_points]
            outline = translated_top + [(x + iw - 1, y0 + ih - 1), (x, y0 + ih - 1), translated_top[0]]
            draw.line(outline, fill=keyline, width=outline_width, joint="curve")

        text_top = min(ch - int(0.60 * dpi), y0 + ih + int(0.08 * dpi))
        title_font = self._font(int(0.135 * dpi), bold=True, serif=True)
        caption_font = self._font(int(0.095 * dpi), serif=True)
        publisher_font = self._font(int(0.075 * dpi), serif=True)
        number_font = self._font(int(0.072 * dpi), serif=True)

        def centered(text: str, y: int, font):
            if not text:
                return
            box = draw.textbbox((0, 0), text, font=font)
            draw.text(((cw - (box[2] - box[0])) / 2, y), text, fill=fg, font=font)

        centered(title[:100], text_top, title_font)
        centered(caption[:160], text_top + int(0.17 * dpi), caption_font)
        lower_y = min(ch - int(0.16 * dpi), text_top + int(0.34 * dpi))
        draw.text((x0, lower_y), "No. 1", fill=fg, font=number_font)
        if publisher:
            text = publisher[:120]
            box = draw.textbbox((0, 0), text, font=publisher_font)
            draw.text((cw - x0 - (box[2] - box[0]), lower_y), text, fill=fg, font=publisher_font)
        return cv2.cvtColor(np.array(card), cv2.COLOR_RGB2BGR)

    def mirror_stereoscope(
        self,
        left: np.ndarray,
        right: np.ndarray,
        dpi: int = 300,
        card_width_in: float = 8.0,
        card_height_in: float = 4.0,
        image_width_in: float = 3.0,
        image_height_in: float = 3.0,
        mirror_gap_in: float = 0.5,
        reflected_eye: str = "right",
        show_guide: bool = True,
    ) -> np.ndarray:
        """Lay out a stereo pair for viewing with a single vertical mirror.

        One eye image is horizontally reversed so the mirror restores its normal
        orientation. Geometry is deliberately generic rather than claiming to
        reproduce a particular commercial/book viewer.
        """
        dpi = max(72, min(1200, int(dpi)))
        cw = max(1, int(round(max(2.0, card_width_in) * dpi)))
        ch = max(1, int(round(max(2.0, card_height_in) * dpi)))
        iw = max(120, int(round(max(0.5, image_width_in) * dpi)))
        ih = max(120, int(round(max(0.5, image_height_in) * dpi)))
        gap = max(0, int(round(max(0.0, mirror_gap_in) * dpi)))

        total = iw * 2 + gap
        if total > cw:
            scale = cw / total
            iw = max(1, int(round(iw * scale)))
            ih = max(1, int(round(ih * scale)))
            gap = max(0, int(round(gap * scale)))
            total = iw * 2 + gap

        canvas = np.full((ch, cw, 3), 255, dtype=np.uint8)
        x0 = max(0, (cw - total) // 2)
        y0 = max(0, (ch - ih) // 2)
        reflected_eye = "left" if str(reflected_eye).lower() == "left" else "right"

        left_use = cv2.flip(left, 1) if reflected_eye == "left" else left
        right_use = cv2.flip(right, 1) if reflected_eye == "right" else right
        canvas[y0:y0 + ih, x0:x0 + iw] = self._fit_bgr(left_use, iw, ih, background=(255, 255, 255))
        right_x = x0 + iw + gap
        canvas[y0:y0 + ih, right_x:right_x + iw] = self._fit_bgr(right_use, iw, ih, background=(255, 255, 255))

        if show_guide:
            center = x0 + iw + gap // 2
            line = max(1, int(round(dpi / 150)))
            cv2.line(canvas, (center, max(0, y0 - int(.18 * dpi))), (center, min(ch - 1, y0 + ih + int(.18 * dpi))), (128, 128, 128), line, cv2.LINE_AA)
            if gap > 0:
                cv2.line(canvas, (x0 + iw, y0), (x0 + iw, y0 + ih), (210, 210, 210), line)
                cv2.line(canvas, (right_x, y0), (right_x, y0 + ih), (210, 210, 210), line)
        return canvas

    @staticmethod
    def _default_pattern(height: int, width: int, style: str = "houndstooth") -> np.ndarray:
        if style == "checker":
            tile = max(4, width // 12)
            yy, xx = np.indices((height, width))
            checker = ((xx // tile + yy // tile) % 2) * 255
            return cv2.cvtColor(checker.astype(np.uint8), cv2.COLOR_GRAY2BGR)

        unit = 48
        tile = np.full((unit, unit, 3), (224, 218, 201), dtype=np.uint8)
        dark = (43, 48, 55)
        accent = (98, 91, 78)
        shapes = [
            np.array([(0, 0), (20, 0), (20, 7), (29, 7), (29, 15), (21, 15), (21, 24), (13, 24), (13, 16), (0, 16)], dtype=np.int32),
            np.array([(24, 24), (44, 24), (44, 31), (48, 31), (48, 40), (45, 40), (45, 48), (37, 48), (37, 40), (24, 40)], dtype=np.int32),
        ]
        for shape in shapes:
            cv2.fillPoly(tile, [shape], dark)
        cv2.line(tile, (0, 24), (24, 48), accent, 2)
        cv2.line(tile, (24, 0), (48, 24), accent, 2)
        repeats_y = max(1, math.ceil(height / unit))
        repeats_x = max(1, math.ceil(width / unit))
        tiled = np.tile(tile, (repeats_y, repeats_x, 1))
        return tiled[:height, :width]

    @staticmethod
    def _add_fusion_guides(image: np.ndarray, separation: int) -> np.ndarray:
        height, width = image.shape[:2]
        guide_h = max(38, min(96, int(round(height * 0.085))))
        bar = np.full((guide_h, width, 3), 244, dtype=np.uint8)
        center = width // 2
        half_sep = separation // 2
        y = guide_h // 2
        radius = max(4, min(10, width // 180))
        cv2.circle(bar, (max(radius + 2, center - half_sep), y), radius, (24, 24, 24), -1, lineType=cv2.LINE_AA)
        cv2.circle(bar, (min(width - radius - 2, center + half_sep), y), radius, (24, 24, 24), -1, lineType=cv2.LINE_AA)
        return np.vstack((bar, image))

    def autostereogram(
        self,
        depth: np.ndarray,
        style: str = "random",
        separation_percent: float = 8.0,
        depth_percent: float = 2.3,
        dot_size: int = 3,
        viewing: str = "parallel",
        pattern: Optional[np.ndarray] = None,
        color: bool = False,
    ) -> np.ndarray:
        height, width = depth.shape[:2]
        separation = max(16, int(round(width * separation_percent / 100.0)))
        max_shift = max(1, int(round(width * depth_percent / 100.0)))
        max_shift = min(max_shift, separation - 2)
        if style == "pattern":
            if pattern is None:
                base = self._default_pattern(height, separation, "houndstooth")
            else:
                source_h, source_w = pattern.shape[:2]
                scale = max(height / source_h, separation / source_w)
                resized = cv2.resize(pattern, (max(separation, int(source_w * scale)), max(height, int(source_h * scale))), interpolation=cv2.INTER_AREA)
                base = resized[:height, :separation]
        else:
            dot_size = max(1, min(12, int(dot_size)))
            rng = np.random.default_rng()
            small_h = max(1, math.ceil(height / dot_size))
            small_w = max(1, math.ceil(separation / dot_size))
            if color:
                seed = rng.integers(0, 256, size=(small_h, small_w, 3), dtype=np.uint8)
            else:
                seed = (rng.integers(0, 2, size=(small_h, small_w, 1), dtype=np.uint8) * 255)
                seed = np.repeat(seed, 3, axis=2)
            base = cv2.resize(seed, (separation, height), interpolation=cv2.INTER_NEAREST)

        output = np.zeros((height, width, 3), dtype=np.uint8)
        output[:, :separation] = base
        rows = np.arange(height)

        viewing_mode = "cross" if viewing.startswith("cross") else "parallel"
        depth_use = 1.0 - depth if viewing_mode == "cross" else depth
        for x in range(separation, width):
            sep = separation - np.rint(depth_use[:, x] * max_shift).astype(np.int32)
            source_x = np.clip(x - sep, 0, x - 1)
            output[:, x] = output[rows, source_x]

        show_guides = viewing.endswith("-guides")
        return self._add_fusion_guides(output, separation) if show_guides else output

    def wiggle_frames(
        self,
        image: np.ndarray,
        depth: np.ndarray,
        frame_count: int = 7,
        strength: float = 2.0,
        pop_out: bool = False,
    ):
        frame_count = max(2, min(15, int(frame_count)))
        offsets = np.linspace(-1.0, 1.0, frame_count)
        frames = [self.generate_view(image, depth, float(offset), pop_out, strength) for offset in offsets]
        if len(frames) > 2:
            frames = frames + frames[-2:0:-1]
        return frames

    def lenticular(
        self,
        image: np.ndarray,
        depth: np.ndarray,
        output_width: int,
        output_height: int,
        dpi: int = 600,
        lpi: float = 60.0,
        views: int = 6,
        slant_degrees: float = 0.0,
        strength: float = 2.0,
        pop_out: bool = False,
    ) -> np.ndarray:
        output_width = max(300, min(10000, int(output_width)))
        output_height = max(200, min(10000, int(output_height)))
        dpi = max(150, min(2400, int(dpi)))
        lpi = max(10.0, min(200.0, float(lpi)))
        views = max(2, min(16, int(views)))
        image, depth = self._crop_resize_pair(image, depth, output_width, output_height)
        pitch = dpi / lpi
        yy, xx = np.indices((output_height, output_width), dtype=np.float32)
        slant = math.tan(math.radians(max(-10.0, min(10.0, slant_degrees))))
        phase = np.mod((xx + yy * slant) / pitch, 1.0)
        view_index = np.minimum(views - 1, np.floor(phase * views).astype(np.int16))
        output = np.zeros_like(image)
        for index, offset in enumerate(np.linspace(-1.0, 1.0, views)):
            view = self.generate_view(image, depth, float(offset), pop_out, strength)
            mask = view_index == index
            output[mask] = view[mask]
        return output

    def lenticular_calibration(
        self,
        dpi: int = 600,
        nominal_lpi: float = 60.0,
        span: float = 0.5,
        step: float = 0.1,
        width_in: float = 8.0,
        band_height_in: float = 0.35,
    ) -> Image.Image:
        dpi = max(150, min(2400, int(dpi)))
        step = max(0.02, min(1.0, float(step)))
        span = max(step, min(5.0, float(span)))
        values = np.arange(nominal_lpi - span, nominal_lpi + span + step / 2.0, step)
        width = int(round(width_in * dpi))
        band_h = max(80, int(round(band_height_in * dpi)))
        label_w = int(round(0.9 * dpi))
        canvas = Image.new("RGB", (width, band_h * len(values)), "white")
        draw = ImageDraw.Draw(canvas)
        font = self._font(int(0.11 * dpi), bold=True)
        for row, value in enumerate(values):
            y0 = row * band_h
            pitch = dpi / max(1.0, value)
            stripe_width = width - label_w
            x = np.arange(stripe_width, dtype=np.float32)
            stripes = (np.mod(x, pitch) < pitch / 2.0).astype(np.uint8) * 255
            band = np.repeat(stripes[np.newaxis, :], band_h, axis=0)
            rgb = np.repeat(band[:, :, np.newaxis], 3, axis=2)
            canvas.paste(Image.fromarray(rgb), (label_w, y0))
            draw.rectangle((0, y0, label_w, y0 + band_h), fill="white")
            draw.text((int(0.08 * dpi), y0 + int(0.09 * dpi)), f"{value:.2f} LPI", fill="black", font=font)
            draw.line((0, y0, width, y0), fill=(150, 150, 150), width=max(1, dpi // 300))
        return canvas


technique_generator = TechniqueGenerator()