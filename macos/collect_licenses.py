"""Collect installed dependency notices into the standalone app, not hosted image."""

from importlib import metadata
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parents[1]
output = root / "build/desktop-licenses"
output.mkdir(parents=True, exist_ok=True)
for distribution in metadata.distributions():
    name = distribution.metadata.get("Name", "unknown")
    for entry in distribution.files or []:
        if any(word in entry.name.lower() for word in ("license", "copying", "notice")):
            source = Path(distribution.locate_file(entry))
            if source.is_file():
                destination = output / name / str(entry).replace("..", "_")
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
for source in (Path(sys.base_prefix) / "LICENSE.txt", Path(sys.base_prefix) / "LICENSE"):
    if source.is_file():
        shutil.copyfile(source, output / "Python-LICENSE.txt")
for source in (root / "frontend/node_modules").rglob("*"):
    if source.is_file() and source.name.lower().startswith(("license", "notice", "copying")):
        destination = output / "frontend" / source.relative_to(root / "frontend/node_modules")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
