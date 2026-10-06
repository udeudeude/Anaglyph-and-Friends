"""Standalone local edition: bundled Python, frontend and V2 model; no Node server."""

import io
import os
from pathlib import Path
import queue
import secrets
import sys
import tempfile
import threading
import time
import traceback
import urllib.request
import webbrowser

# A stable origin keeps browser-saved printer/filter/viewer profiles available
# across launches and updates. Never silently switch ports on a conflict.
DESKTOP_PORT = 8765


def configure_runtime(data_dir=None):
    bundle = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    data = Path(data_dir or Path.home() / "Library/Application Support/Anaglyph-and-Friends/Desktop")
    data.mkdir(parents=True, exist_ok=True)
    # Never write inside an app bundle (including Gatekeeper's translocated copy).
    os.environ["AAF_SESSION_DATA_FOLDER"] = str(data / "sessions")
    os.environ["AAF_FRONTEND_DIST"] = str(bundle / "frontend/dist")
    os.environ["AAF_DEPTH_MODEL_DIR"] = str(bundle / "ai_models/checkpoints" if hasattr(sys, "_MEIPASS")
                                            else bundle / "backend/ai_models/checkpoints")
    os.environ["AAF_BROWSER_DEPTH"] = "false"
    os.environ["FLASK_SECRET_KEY"] = secrets.token_hex(32)
    os.environ["FLASK_DEBUG"] = "false"
    if not hasattr(sys, "_MEIPASS"):
        sys.path.insert(0, str(bundle / "backend"))
    return data


def create_server():
    from flask import abort, request
    from production import app
    from werkzeug.serving import make_server

    server = make_server("127.0.0.1", DESKTOP_PORT, app, threaded=True)
    origin = f"http://127.0.0.1:{server.server_port}"

    @app.before_request
    def local_requests_only():
        if request.host != f"127.0.0.1:{server.server_port}":
            abort(400)
        if request.headers.get("Origin") not in (None, origin):
            abort(403)
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            abort(403)

    return server, origin


def smoke_test():
    """Executed inside the frozen app on each cloud Mac before publishing."""
    with tempfile.TemporaryDirectory(prefix="aaf-desktop-smoke-") as folder:
        configure_runtime(folder)
        os.environ["AAF_TORCH_DEVICE"] = "cpu"
        from PIL import Image
        from production import app, FRONTEND_DIST

        assert Path(FRONTEND_DIST, "index.html").is_file()
        server, origin = create_server()
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(origin + "/healthz", timeout=10) as response:
                assert response.read() == b"ok"
            with urllib.request.urlopen(origin, timeout=10) as response:
                assert b"<!doctype html>" in response.read().lower()
            client = app.test_client()
            headers = {"Host": f"127.0.0.1:{server.server_port}"}
            assert client.get("/healthz", headers={"Host": "evil.example"}).status_code == 400
            assert client.get("/healthz", headers={**headers, "Origin": "https://evil.example"}).status_code == 403
            source = io.BytesIO()
            image = Image.new("RGB", (80, 60), "white")
            for x in range(20, 60):
                for y in range(15, 45):
                    image.putpixel((x, y), (x * 3, y * 4, 80))
            image.save(source, "PNG")
            source.seek(0)
            assert client.post("/image", headers=headers, data={"file": (source, "source.png")}).status_code == 200
            depth = client.get("/depth-map?generator=automatic", headers=headers)
            assert depth.status_code == 200, depth.data
            output = client.get("/output/anaglyph?scope=full&download=true", headers=headers)
            assert output.status_code == 200, output.data
            assert Image.open(io.BytesIO(output.data)).size == (80, 60)
            assert client.get("/stereo/source", headers=headers).status_code == 200
            plane = client.post("/stereo/screen-depth", headers=headers, json={"x": .5, "y": .5})
            assert plane.status_code == 200 and 0 <= plane.json["screen_depth"] <= 1
            query = "?screen_depth=" + str(plane.json["screen_depth"])
            assert client.get("/render" + query, headers=headers).status_code == 200
            assert client.get("/output/anaglyph" + query + "&repairs=true", headers=headers).status_code == 200
            assert client.post("/depth-map/edit", headers=headers, json={"operation": "brush", "points": [{"x": .5, "y": .5}], "radius": .1, "delta": .1}).status_code == 200
            assert client.post("/depth-map/edit", headers=headers, json={"operation": "undo"}).status_code == 200
            assert client.post("/depth-map/edit", headers=headers, json={"operation": "redo"}).status_code == 200
            print("Frozen desktop: frontend, loopback server, bundled V2 inference, full-resolution export, depth undo/redo and origin guard passed")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=10)


def main():
    if "--smoke-test" in sys.argv:
        smoke_test()
        return
    import tkinter as tk
    from tkinter import ttk

    ui_test = "--ui-smoke-test" in sys.argv

    log_dir = Path.home() / "Library/Logs/Anaglyph-and-Friends"
    log_dir.mkdir(parents=True, exist_ok=True)
    log = open(log_dir / "desktop.log", "a", buffering=1)
    sys.stdout = sys.stderr = log
    configure_runtime()
    root = tk.Tk()
    root.title("Anaglyph & Friends")
    root.geometry("480x270")
    root.resizable(False, False)
    frame = ttk.Frame(root, padding=24)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Anaglyph & Friends", font=("Helvetica", 21, "bold")).pack(anchor="w")
    status = tk.StringVar(value="Starting your local workspace…")
    ttk.Label(frame, textvariable=status, wraplength=430).pack(anchor="w", pady=(12, 8))
    progress = ttk.Progressbar(frame, mode="indeterminate")
    progress.pack(fill="x", pady=(0, 12))
    progress.start(15)
    ttk.Label(frame, text="Your images are processed on this Mac.\nKeep this window open while using the browser.").pack(anchor="w")
    events = queue.Queue()
    state = {"server": None, "origin": None, "closing": False}
    open_button = ttk.Button(frame, text="Open workspace", state="disabled",
                             command=lambda: webbrowser.open(state["origin"]))
    open_button.pack(side="left", pady=16)

    def stop():
        state["closing"] = True
        if state["server"] is not None:
            threading.Thread(target=state["server"].shutdown, daemon=True).start()
        root.destroy()

    ttk.Button(frame, text="Quit", command=stop).pack(side="right", pady=16)
    root.protocol("WM_DELETE_WINDOW", stop)
    root.createcommand("tk::mac::Quit", stop)

    def start():
        try:
            started = time.monotonic()
            print("Desktop window open; loading local rendering runtime", flush=True)
            server, origin = create_server()
            print(f"Local workspace ready after {time.monotonic() - started:.1f}s", flush=True)
            state["server"] = server
            if state["closing"]:
                server.server_close()
                return
            events.put(("ready", origin))
            server.serve_forever()
            server.server_close()
        except (Exception, SystemExit):
            traceback.print_exc()
            events.put(("error", "Could not start. Close any other copy of this app. Port 8765 must be free. Details: ~/Library/Logs/Anaglyph-and-Friends/desktop.log"))

    def poll():
        try:
            kind, detail = events.get_nowait()
            progress.stop()
            progress.pack_forget()
            if kind == "ready":
                state["origin"] = detail
                status.set("Ready — the workspace opens in your browser.")
                open_button.configure(state="normal")
                if ui_test:
                    root.after(500, stop)
                else:
                    webbrowser.open(detail)
            else:
                status.set(detail)
                if ui_test:
                    root.after(500, stop)
        except queue.Empty:
            pass
        root.after(150, poll)

    threading.Thread(target=start, daemon=True).start()
    root.after(150, poll)
    if ui_test:
        def timed_out():
            print("Native-window test timed out before server readiness (180 seconds)", flush=True)
            stop()
        root.after(180000, timed_out)
    root.mainloop()
    if ui_test and state["origin"] is None:
        sys.exit(1)


if __name__ == "__main__":
    main()
