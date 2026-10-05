from pathlib import Path

root = Path(SPECPATH).parent
a = Analysis(
    [str(root / "macos/desktop.py")],
    pathex=[str(root / "backend")],
    binaries=[],
    datas=[
        (str(root / "frontend/dist"), "frontend/dist"),
        (str(root / "backend/ai_models/checkpoints"), "ai_models/checkpoints"),
        (str(root / "macos/THIRD-PARTY-NOTICES.md"), "."),
        (str(root / "backend/ai_models/Depth_Anything_V2/LICENSE"), "licenses/Depth-Anything-V2"),
        (str(root / "build/desktop-licenses"), "licenses/dependencies"),
    ],
    hiddenimports=["production", "depth_map_generator"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["matplotlib", "IPython", "pytest", "torchaudio", "tensorboard"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="Anaglyph & Friends",
          debug=False, strip=False, upx=False, console=False, argv_emulation=False)
collection = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="Anaglyph & Friends")
app = BUNDLE(collection, name="Anaglyph & Friends.app", bundle_identifier="io.github.udeudeude.anaglyph-friends",
             version="1.0.0", info_plist={"NSHighResolutionCapable": True})
