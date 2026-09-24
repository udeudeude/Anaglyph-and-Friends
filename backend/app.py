from flask import Flask, jsonify, request, session, send_file
from flask_cors import CORS
import uuid
import os
import io
import json
import time
from PIL import Image, ImageOps
import cv2
import numpy as np

from anaglyph_generator import anaglyph_generator
from technique_generator import technique_generator
from phantogram_generator import calibration_ruler, fit_to_print, render_phantogram
from depth_sources import align_depth, load_depth_upload
from stereo_formats import compatibility_stereo, make_anaglyph
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from werkzeug.utils import send_from_directory

app = Flask(__name__)
CORS(app, supports_credentials=True)

load_dotenv()
host = os.getenv("FLASK_HOST", "0.0.0.0")
port = int(os.getenv("FLASK_PORT", 8000))
app.secret_key = os.getenv("FLASK_SECRET_KEY", "local-anaglyph-and-friends")

KERNEL_WIDTH = 15
PREVIEW_MAX_DIMENSION = 1600
SESSION_DATA_FOLDER = "resources/session_data"
os.makedirs(SESSION_DATA_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "bmp", "dib", "jpeg", "jpg", "jpe", "jp2", "png", "webp",
    "pbm", "pgm", "ppm", "pxm", "pnm", "sr", "ras", "tiff", "tif",
    "exr", "hdr", "pic"
}


@app.route("/")
def hello_world():
    return "Anaglyph & Friends backend"


@app.before_request
def assign_session_id():
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())


def session_namespace() -> str:
    workspace = request.headers.get("X-AAF-Workspace", "").strip().lower()
    safe_workspace = "".join(char for char in workspace if char.isalnum() or char in "-_")[:32]
    if not safe_workspace:
        return session["session_id"]
    return f"{session['session_id']}__{safe_workspace}"


def session_path(suffix: str) -> str:
    return os.path.join(SESSION_DATA_FOLDER, f"{session_namespace()}_{suffix}")


def clear_session_products():
    prefix = f"{session_namespace()}_"
    for filename in os.listdir(SESSION_DATA_FOLDER):
        if filename.startswith(prefix):
            try:
                os.remove(os.path.join(SESSION_DATA_FOLDER, filename))
            except FileNotFoundError:
                pass


def clear_stereo_cache():
    for suffix in (
        "preview_left.png", "preview_right.png", "preview_stereo.json",
        "full_left.png", "full_right.png", "full_stereo.json",
    ):
        try:
            os.remove(session_path(suffix))
        except FileNotFoundError:
            pass


def clear_old_session_files():
    current_time = time.time()
    session_files_cleared = 0
    for filename in os.listdir(SESSION_DATA_FOLDER):
        path = os.path.join(SESSION_DATA_FOLDER, filename)
        if os.path.isfile(path) and current_time - os.path.getmtime(path) > 60 * 60:
            os.remove(path)
            session_files_cleared += 1
    print(f"Session files cleared: {session_files_cleared}")


clean_up_scheduler = BackgroundScheduler()
clean_up_scheduler.add_job(clear_old_session_files, "interval", hours=1)
clean_up_scheduler.start()


def parse_render_parameters():
    pop_out = request.args.get("pop_out", default="false").lower() == "true"
    max_disparity_percentage = float(request.args.get("max_disparity_percentage", default=2))
    max_disparity_percentage = max(0.0, min(6.0, max_disparity_percentage))
    return pop_out, max_disparity_percentage


def parse_swap_eyes():
    return request.args.get("swap_eyes", default="false").lower() == "true"


def resize_image_and_depth(image, depth_map, max_dimension):
    height, width = image.shape[:2]
    scale = min(1.0, max_dimension / max(height, width))
    if scale >= 1.0:
        return image, depth_map
    new_width = max(1, int(round(width * scale)))
    new_height = max(1, int(round(height * scale)))
    image_resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
    depth_resized = cv2.resize(depth_map.astype(np.float32), (new_width, new_height), interpolation=cv2.INTER_CUBIC)
    return image_resized, np.clip(depth_resized, 0.0, 1.0).astype(np.float32)


def source_and_depth(scope="preview", max_dimension=PREVIEW_MAX_DIMENSION):
    ensure_depth_maps()
    image = cv2.imread(session_path("image.png"))
    depth = np.load(session_path("depth_map.npy"), allow_pickle=False).astype(np.float32)
    if image is None:
        raise FileNotFoundError("No uploaded source image is available")
    if scope == "preview":
        image, depth = resize_image_and_depth(image, depth, max_dimension)
    return image, depth


def send_cv_image(image, filename, output_format="png", quality=95, download=False):
    output_format = output_format.lower()
    quality = max(40, min(100, int(quality)))
    if output_format in ("jpeg", "jpg"):
        ok, encoded = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        mimetype = "image/jpeg"
        extension = "jpg"
    else:
        ok, encoded = cv2.imencode(".png", image)
        mimetype = "image/png"
        extension = "png"
    if not ok:
        raise RuntimeError("Could not encode output image")
    base = filename.rsplit(".", 1)[0]
    return send_file(io.BytesIO(encoded.tobytes()), mimetype=mimetype, as_attachment=download, download_name=f"{base}.{extension}")


def send_pil_png(image: Image.Image, filename: str, dpi: int, download=True):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", dpi=(dpi, dpi))
    buffer.seek(0)
    return send_file(buffer, mimetype="image/png", as_attachment=download, download_name=filename)


@app.route("/image", methods=["POST"])
def upload_image():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    image = request.files["file"]
    if image.filename == "":
        return jsonify({"error": "No selected file"}), 400
    extension = image.filename.rsplit(".", 1)[-1].lower() if "." in image.filename else ""
    if extension not in ALLOWED_EXTENSIONS:
        return jsonify({"error": "Invalid file type"}), 400

    try:
        pillow_image = Image.open(image)
        pillow_image = ImageOps.exif_transpose(pillow_image).convert("RGB")
        clear_session_products()
        original_path = session_path("image.png")
        pillow_image.save(original_path, format="PNG", optimize=False)
        return jsonify({
            "success": True,
            "width": pillow_image.width,
            "height": pillow_image.height,
            "full_resolution": True,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e) + " Note: transparent background not allowed"}), 400


@app.route("/pattern", methods=["POST"])
def upload_pattern():
    if "file" not in request.files:
        return jsonify({"error": "No pattern file"}), 400
    try:
        pattern = ImageOps.exif_transpose(Image.open(request.files["file"])).convert("RGB")
        pattern.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        pattern.save(session_path("pattern.png"), format="PNG")
        return jsonify({"success": True, "width": pattern.width, "height": pattern.height}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


def colour_depth_map_lightweight(depth_map):
    gray = np.clip(depth_map * 255.0, 0, 255).astype(np.uint8)
    return cv2.applyColorMap(gray, cv2.COLORMAP_TURBO)


def save_active_depth(depth_map):
    depth_map = np.clip(depth_map, 0.0, 1.0).astype(np.float32)
    np.save(session_path("depth_map.npy"), depth_map, allow_pickle=False)
    coloured = colour_depth_map_lightweight(depth_map)
    coloured_preview, _ = resize_image_and_depth(coloured, depth_map, PREVIEW_MAX_DIMENSION)
    cv2.imwrite(session_path("depth_map_coloured.jpg"), coloured_preview, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    gray16 = np.round(depth_map * 65535.0).astype(np.uint16)
    cv2.imwrite(session_path("depth_map_gray16.png"), gray16)
    clear_stereo_cache()


def get_ai_depth():
    ai_path = session_path("depth_map_ai.npy")
    if os.path.exists(ai_path):
        return np.load(ai_path, allow_pickle=False).astype(np.float32)
    if os.getenv("AAF_BROWSER_DEPTH", "false").lower() == "true":
        raise RuntimeError("Hosted mode expects Depth Anything V2 to run in the user's browser")
    image = cv2.imread(session_path("image.png"))
    if image is None:
        raise FileNotFoundError("No uploaded source image is available")
    from depth_map_generator import depth_map_generator
    depth_map = depth_map_generator.generate_depth_map(image)
    depth_map = np.clip(depth_map_generator.blur_depth_map(depth_map, KERNEL_WIDTH), 0.0, 1.0).astype(np.float32)
    np.save(ai_path, depth_map, allow_pickle=False)
    return depth_map


def ensure_depth_maps():
    depth_path = session_path("depth_map.npy")
    coloured_path = session_path("depth_map_coloured.jpg")
    gray16_path = session_path("depth_map_gray16.png")
    if os.path.exists(depth_path) and os.path.exists(coloured_path) and os.path.exists(gray16_path):
        return
    save_active_depth(get_ai_depth())


@app.route("/depth-map", methods=["GET"])
def get_depth_map():
    try:
        ensure_depth_maps()
        return send_from_directory(SESSION_DATA_FOLDER, os.path.basename(session_path("depth_map_coloured.jpg")), request.environ)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/depth-map/ai-import", methods=["POST"])
def import_ai_depth_map():
    if "file" not in request.files:
        return jsonify({"error": "No AI depth map file"}), 400
    try:
        source = cv2.imread(session_path("image.png"))
        if source is None:
            raise FileNotFoundError("Upload a source image before importing browser AI depth")
        imported = load_depth_upload(request.files["file"])
        aligned = align_depth(imported, source.shape[1], source.shape[0], "stretch")
        aligned = np.clip(aligned, 0.0, 1.0).astype(np.float32)
        np.save(session_path("depth_map_ai.npy"), aligned, allow_pickle=False)
        invert = request.form.get("invert", "false").lower() == "true"
        save_active_depth(1.0 - aligned if invert else aligned)
        return jsonify({
            "success": True,
            "depth_width": int(imported.shape[1]),
            "depth_height": int(imported.shape[0]),
            "source_width": int(source.shape[1]),
            "source_height": int(source.shape[0]),
            "invert": invert,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/depth-map/import", methods=["POST"])
def import_depth_map():
    if "file" not in request.files:
        return jsonify({"error": "No depth map file"}), 400
    try:
        source = cv2.imread(session_path("image.png"))
        if source is None:
            raise FileNotFoundError("Upload a source image before importing a depth map")
        imported = load_depth_upload(request.files["file"])
        np.save(session_path("depth_map_import.npy"), imported, allow_pickle=False)
        mode = request.form.get("mode", "crop").lower()
        invert = request.form.get("invert", "false").lower() == "true"
        aligned = align_depth(imported, source.shape[1], source.shape[0], mode)
        if invert:
            aligned = 1.0 - aligned
        save_active_depth(aligned)
        return jsonify({
            "success": True,
            "depth_width": int(imported.shape[1]),
            "depth_height": int(imported.shape[0]),
            "source_width": int(source.shape[1]),
            "source_height": int(source.shape[0]),
            "mode": mode,
            "invert": invert,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/depth-map/source", methods=["POST"])
def set_depth_source():
    try:
        payload = request.get_json(silent=True) or request.form
        source_name = str(payload.get("source", "ai")).lower()
        mode = str(payload.get("mode", "crop")).lower()
        invert = str(payload.get("invert", "false")).lower() == "true"
        source = cv2.imread(session_path("image.png"))
        if source is None:
            raise FileNotFoundError("No uploaded source image is available")
        if source_name == "ai":
            depth = get_ai_depth()
        elif source_name == "imported":
            import_path = session_path("depth_map_import.npy")
            if not os.path.exists(import_path):
                return jsonify({"error": "No imported depth map is available"}), 404
            imported = np.load(import_path, allow_pickle=False).astype(np.float32)
            depth = align_depth(imported, source.shape[1], source.shape[0], mode)
        else:
            return jsonify({"error": "source must be ai or imported"}), 400
        if invert:
            depth = 1.0 - depth
        save_active_depth(depth)
        return jsonify({"success": True, "source": source_name, "mode": mode, "invert": invert}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/depth-map/download", methods=["GET"])
def download_depth_map():
    try:
        ensure_depth_maps()
        kind = request.args.get("kind", "gray16").lower()
        if kind == "gray16":
            return send_file(session_path("depth_map_gray16.png"), as_attachment=True, download_name="depth-map-16bit.png", mimetype="image/png")
        if kind == "npy":
            return send_file(session_path("depth_map.npy"), as_attachment=True, download_name="depth-map-float32.npy", mimetype="application/octet-stream")
        if kind == "color":
            depth_map = np.load(session_path("depth_map.npy"), allow_pickle=False).astype(np.float32)
            coloured = colour_depth_map_lightweight(depth_map)
            ok, encoded = cv2.imencode(".png", coloured)
            if not ok:
                raise RuntimeError("Could not encode color depth map")
            return send_file(io.BytesIO(encoded.tobytes()), as_attachment=True, download_name="depth-map-color.png", mimetype="image/png")
        return jsonify({"error": "kind must be gray16, color, or npy"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


def cache_paths(scope):
    if scope not in ("preview", "full"):
        raise ValueError("scope must be preview or full")
    return {
        "left": session_path(f"{scope}_left.png"),
        "right": session_path(f"{scope}_right.png"),
        "meta": session_path(f"{scope}_stereo.json"),
    }


def cache_matches(meta_path, pop_out, max_disparity_percentage):
    try:
        with open(meta_path, "r", encoding="utf-8") as handle:
            meta = json.load(handle)
        return (
            bool(meta.get("pop_out")) == bool(pop_out)
            and abs(float(meta.get("max_disparity_percentage")) - float(max_disparity_percentage)) < 1e-9
        )
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return False


def ensure_stereo_pair(scope, pop_out, max_disparity_percentage):
    ensure_depth_maps()
    paths = cache_paths(scope)
    if os.path.exists(paths["left"]) and os.path.exists(paths["right"]) and cache_matches(paths["meta"], pop_out, max_disparity_percentage):
        return paths

    image = cv2.imread(session_path("image.png"))
    depth_map = np.load(session_path("depth_map.npy"), allow_pickle=False).astype(np.float32)
    if image is None:
        raise FileNotFoundError("No uploaded source image is available")

    if scope == "preview":
        image, depth_map = resize_image_and_depth(image, depth_map, PREVIEW_MAX_DIMENSION)

    left_image, right_image = anaglyph_generator.generate_stereo_images(
        image, depth_map, pop_out, max_disparity_percentage
    )
    cv2.imwrite(paths["left"], left_image)
    cv2.imwrite(paths["right"], right_image)
    with open(paths["meta"], "w", encoding="utf-8") as handle:
        json.dump({
            "pop_out": pop_out,
            "max_disparity_percentage": max_disparity_percentage,
            "width": int(image.shape[1]),
            "height": int(image.shape[0]),
        }, handle)
    return paths


def stereo_arrays(scope, pop_out, strength, swap_eyes=False):
    paths = ensure_stereo_pair(scope, pop_out, strength)
    left = cv2.imread(paths["left"])
    right = cv2.imread(paths["right"])
    if left is None or right is None:
        raise FileNotFoundError("Stereo render cache is unavailable")
    return (right, left) if swap_eyes else (left, right)


@app.route("/render", methods=["GET"])
def render_preview_stereo():
    try:
        pop_out, strength = parse_render_parameters()
        paths = ensure_stereo_pair("preview", pop_out, strength)
        with open(paths["meta"], "r", encoding="utf-8") as handle:
            meta = json.load(handle)
        return jsonify({"success": True, "scope": "preview", **meta})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/prepare-full", methods=["GET"])
def prepare_full_stereo():
    try:
        pop_out, strength = parse_render_parameters()
        paths = ensure_stereo_pair("full", pop_out, strength)
        with open(paths["meta"], "r", encoding="utf-8") as handle:
            meta = json.load(handle)
        return jsonify({"success": True, "scope": "full", **meta})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


def build_output(kind, scope, pop_out, strength, optimised, swap_eyes=False, anaglyph_type="red-cyan", anaglyph_color="full", anaglyph_left_color="#ff0000", anaglyph_right_color="#00ffff", anaglyph_left_gain=100.0, anaglyph_right_gain=100.0):
    left_image, right_image = stereo_arrays(scope, pop_out, strength, swap_eyes)

    if kind == "left":
        return left_image
    if kind == "right":
        return right_image
    if kind == "parallel":
        return np.hstack((left_image, right_image))
    if kind == "cross":
        return np.hstack((right_image, left_image))
    if kind == "anaglyph":
        if optimised and anaglyph_type == "red-cyan" and anaglyph_color == "full":
            return anaglyph_generator.generate_optimised_RR_anaglyph(left_image, right_image)
        return make_anaglyph(left_image, right_image, anaglyph_type, anaglyph_color, anaglyph_left_color, anaglyph_right_color, anaglyph_left_gain, anaglyph_right_gain)
    if kind in {"topbottom", "halfsbs", "rowinterlaced", "columninterlaced", "checkerboard"}:
        return compatibility_stereo(left_image, right_image, kind)
    raise ValueError("Unknown stereo output kind")


@app.route("/output/<kind>", methods=["GET"])
def get_output(kind):
    try:
        scope = request.args.get("scope", "preview").lower()
        pop_out, strength = parse_render_parameters()
        optimised = request.args.get("optimised_RR_anaglyph", default="false").lower() == "true"
        swap_eyes = parse_swap_eyes()
        anaglyph_type = request.args.get("anaglyph_type", "red-cyan").lower()
        anaglyph_color = request.args.get("anaglyph_color", "full").lower()
        anaglyph_left_color = request.args.get("anaglyph_left_color", "#ff0000")
        anaglyph_right_color = request.args.get("anaglyph_right_color", "#00ffff")
        anaglyph_left_gain = float(request.args.get("anaglyph_left_gain", 100))
        anaglyph_right_gain = float(request.args.get("anaglyph_right_gain", 100))
        output_format = request.args.get("format", "jpeg").lower()
        quality = int(request.args.get("quality", 95))
        download = request.args.get("download", "false").lower() == "true"
        if output_format not in ("jpeg", "jpg", "png"):
            return jsonify({"error": "format must be jpeg or png"}), 400
        output = build_output(kind.lower(), scope, pop_out, strength, optimised, swap_eyes, anaglyph_type, anaglyph_color, anaglyph_left_color, anaglyph_right_color, anaglyph_left_gain, anaglyph_right_gain)
        names = {
            "anaglyph": f"{anaglyph_type}-anaglyph",
            "parallel": "parallel-stereo",
            "cross": "cross-eyed-stereo",
            "left": "left-eye",
            "right": "right-eye",
            "topbottom": "top-bottom-stereo",
            "halfsbs": "half-width-side-by-side",
            "rowinterlaced": "row-interlaced-stereo",
            "columninterlaced": "column-interlaced-stereo",
            "checkerboard": "checkerboard-stereo",
        }
        return send_cv_image(output, names.get(kind.lower(), kind.lower()), output_format, quality, download)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/special/chromadepth", methods=["GET"])
def special_chromadepth():
    try:
        scope = request.args.get("scope", "preview").lower()
        amount = float(request.args.get("color_strength", 90)) / 100.0
        reverse = request.args.get("reverse", "false").lower() == "true"
        image, depth = source_and_depth(scope)
        output = technique_generator.chromadepth(image, depth, amount, reverse)
        return send_cv_image(output, "chromadepth", request.args.get("format", "png"), request.args.get("quality", 95), request.args.get("download", "false").lower() == "true")
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/special/cardboard", methods=["GET"])
def special_cardboard():
    try:
        scope = request.args.get("scope", "preview").lower()
        pop_out, strength = parse_render_parameters()
        left, right = stereo_arrays(scope, pop_out, strength, parse_swap_eyes())
        output = technique_generator.cardboard(
            left, right,
            int(request.args.get("width", 1920)),
            int(request.args.get("height", 1080)),
            float(request.args.get("screen_width_mm", 121)),
            float(request.args.get("lens_separation_mm", 63)),
            float(request.args.get("image_scale", 92)) / 100.0,
        )
        return send_cv_image(output, "cardboard-stereo", request.args.get("format", "png"), request.args.get("quality", 95), request.args.get("download", "false").lower() == "true")
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/special/stereoscope", methods=["GET"])
def special_stereoscope():
    try:
        pop_out, strength = parse_render_parameters()
        scope = request.args.get("scope", "preview").lower()
        dpi = int(request.args.get("dpi", 300))
        render_dpi = min(dpi, 180) if scope == "preview" else dpi
        left, right = stereo_arrays("preview" if scope == "preview" else "full", pop_out, strength, parse_swap_eyes())
        output = technique_generator.stereoscope_card(
            left, right,
            dpi=render_dpi,
            card_width_in=float(request.args.get("card_width", 7.0)),
            card_height_in=float(request.args.get("card_height", 3.5)),
            image_width_in=float(request.args.get("image_width", 2.85)),
            image_height_in=float(request.args.get("image_height", 2.55)),
            gap_in=float(request.args.get("gap", 0.35)),
            arch_in=float(request.args.get("arch", 0.22)),
            title=request.args.get("title", "STEREOSCOPIC VIEW"),
            caption=request.args.get("caption", "Generated from a single photograph"),
            publisher=request.args.get("publisher", "Anaglyph & Friends"),
            card_tone=request.args.get("card_tone", "cream"),
        )
        return send_cv_image(output, "stereoscope-card", "png", 100, request.args.get("download", "false").lower() == "true")
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/special/autostereogram", methods=["GET"])
def special_autostereogram():
    try:
        scope = request.args.get("scope", "preview").lower()
        style = request.args.get("style", "random").lower()
        image, depth = source_and_depth(scope)
        pattern = None
        if style == "pattern" and os.path.exists(session_path("pattern.png")):
            pattern = cv2.imread(session_path("pattern.png"))
        output = technique_generator.autostereogram(
            depth,
            style=style,
            separation_percent=float(request.args.get("separation", 8.0)),
            depth_percent=float(request.args.get("depth_strength", 2.3)),
            dot_size=int(request.args.get("dot_size", 3)),
            viewing=(request.args.get("viewing", "parallel").lower() + ("-guides" if request.args.get("guides", "true").lower() == "true" else "")),
            pattern=pattern,
            color=request.args.get("color", "false").lower() == "true",
        )
        return send_cv_image(output, f"{style}-stereogram", request.args.get("format", "png"), request.args.get("quality", 95), request.args.get("download", "false").lower() == "true")
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/special/wiggle", methods=["GET"])
def special_wiggle():
    try:
        scope = request.args.get("scope", "preview").lower()
        pop_out, strength = parse_render_parameters()
        if parse_swap_eyes():
            strength = -strength
        image, depth = source_and_depth("preview", 1100)
        frame_count = int(request.args.get("frames", 7))
        duration = max(40, min(1000, int(request.args.get("duration", 75))))
        frames = technique_generator.wiggle_frames(image, depth, frame_count, strength, pop_out)
        pil_frames = [Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)) for frame in frames]
        buffer = io.BytesIO()
        pil_frames[0].save(buffer, format="GIF", save_all=True, append_images=pil_frames[1:], duration=duration, loop=0, disposal=2, optimize=False)
        buffer.seek(0)
        return send_file(buffer, mimetype="image/gif", as_attachment=request.args.get("download", "false").lower() == "true", download_name="wiggle-gram.gif")
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/special/lenticular", methods=["GET"])
def special_lenticular():
    try:
        scope = request.args.get("scope", "preview").lower()
        pop_out, strength = parse_render_parameters()
        if parse_swap_eyes():
            strength = -strength
        dpi = int(request.args.get("dpi", 600))
        lpi = float(request.args.get("lpi", 60.0))
        width_in = float(request.args.get("width_in", 6.0))
        height_in = float(request.args.get("height_in", 4.0))
        views = int(request.args.get("views", 6))
        slant = float(request.args.get("slant", 0.0))
        full_w = max(300, int(round(width_in * dpi)))
        full_h = max(200, int(round(height_in * dpi)))
        image, depth = source_and_depth("full")
        if scope == "preview":
            scale = min(1.0, 1200.0 / max(full_w, full_h))
            output_w = max(300, int(round(full_w * scale)))
            output_h = max(200, int(round(full_h * scale)))
            effective_dpi = max(72, int(round(dpi * scale)))
        else:
            output_w, output_h, effective_dpi = full_w, full_h, dpi
        output = technique_generator.lenticular(image, depth, output_w, output_h, effective_dpi, lpi, views, slant, strength, pop_out)
        return send_cv_image(output, "lenticular-interlaced", "png", 100, request.args.get("download", "false").lower() == "true")
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/special/phantogram", methods=["GET"])
def special_phantogram():
    try:
        scope = request.args.get("scope", "preview").lower()
        if scope not in ("preview", "full"):
            return jsonify({"error": "scope must be preview or full"}), 400
        dpi = max(72, min(600, int(request.args.get("dpi", 300))))
        width_in = max(2.0, min(16.0, float(request.args.get("width_in", 8.0))))
        height_in = max(2.0, min(16.0, float(request.args.get("height_in", 6.0))))
        view_distance_in = max(4.0, min(72.0, float(request.args.get("view_distance_in", 20.0))))
        eye_height_in = max(4.0, min(72.0, float(request.args.get("eye_height_in", 14.0))))
        ipd_mm = max(45.0, min(80.0, float(request.args.get("ipd_mm", 63.0))))
        relief_mm = max(0.0, min(100.0, float(request.args.get("relief_mm", 35.0))))
        glasses = request.args.get("glasses", "red-cyan").lower()
        if glasses not in ("red-cyan", "red-green", "red-blue"):
            return jsonify({"error": "glasses must be red-cyan, red-green, or red-blue"}), 400
        reverse_depth = request.args.get("reverse_depth", "false").lower() == "true"

        image, depth = source_and_depth("full")
        full_w = max(300, int(round(width_in * dpi)))
        full_h = max(300, int(round(height_in * dpi)))
        if scope == "preview":
            scale = min(1.0, 1200.0 / max(full_w, full_h))
            output_w = max(300, int(round(full_w * scale)))
            output_h = max(300, int(round(full_h * scale)))
        else:
            output_w, output_h = full_w, full_h
        image, depth = fit_to_print(image, depth, output_w, output_h)
        output, _, _ = render_phantogram(
            image,
            depth,
            print_width_mm=width_in * 25.4,
            print_height_mm=height_in * 25.4,
            view_distance_mm=view_distance_in * 25.4,
            eye_height_mm=eye_height_in * 25.4,
            ipd_mm=ipd_mm,
            relief_mm=relief_mm,
            glasses=glasses,
            reverse_depth=reverse_depth,
        )
        if scope == "full":
            pil = Image.fromarray(cv2.cvtColor(output, cv2.COLOR_BGR2RGB))
            return send_pil_png(pil, f"phantogram-{glasses}-{width_in:g}x{height_in:g}in.png", dpi, True)
        return send_cv_image(output, f"phantogram-{glasses}", "png", 100, False)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/phantogram/calibration", methods=["GET"])
def phantogram_calibration():
    try:
        dpi = max(72, min(1200, int(request.args.get("dpi", 300))))
        return send_pil_png(calibration_ruler(dpi), "phantogram-100mm-print-check.png", dpi, True)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/lenticular/calibration", methods=["GET"])
def lenticular_calibration():
    try:
        dpi = int(request.args.get("dpi", 600))
        image = technique_generator.lenticular_calibration(
            dpi=dpi,
            nominal_lpi=float(request.args.get("lpi", 60.0)),
            span=float(request.args.get("span", 0.5)),
            step=float(request.args.get("step", 0.1)),
            width_in=float(request.args.get("width_in", 8.0)),
        )
        return send_pil_png(image, "lenticular-calibration.png", dpi, True)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/anaglyph", methods=["GET"])
def legacy_anaglyph():
    return get_output("anaglyph")


@app.route("/stereo-pair", methods=["GET"])
def legacy_stereo_pair():
    mode = request.args.get("mode", "parallel").lower()
    if mode not in ("parallel", "cross"):
        return jsonify({"error": "mode must be parallel or cross"}), 400
    return get_output(mode)


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug, host=host, port=port)