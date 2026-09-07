"""Production entrypoint for Anaglyph & Friends.

Local development continues to run app.py on :8000 and Vite on :5173.
A production build places the compiled Vite frontend at ../frontend/dist;
this wrapper serves those files from the same Flask/Gunicorn process as the API.
"""

import os

from flask import send_from_directory

from app import app


FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)


def serve_index():
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if not os.path.isfile(index_path):
        return "Anaglyph & Friends backend (frontend build not installed)", 200
    return send_from_directory(FRONTEND_DIST, "index.html")


# app.py already owns `/` through the hello_world endpoint. Replace only the
# endpoint function in production, leaving local app.py behavior unchanged.
app.view_functions["hello_world"] = serve_index


@app.route("/<path:path>")
def serve_frontend(path: str):
    candidate = os.path.join(FRONTEND_DIST, path)
    if path and os.path.isfile(candidate):
        return send_from_directory(FRONTEND_DIST, path)
    return serve_index()
