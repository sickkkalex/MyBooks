# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller — MyBooks (desktop)."""
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = []

for package in ("pymupdf", "ebooklib", "docx", "pptx", "flask", "webview"):
    try:
        tmp = collect_all(package)
        datas += tmp[0]
        binaries += tmp[1]
        hiddenimports += tmp[2]
    except Exception:
        pass

datas += [("frontend", "frontend")]

a = Analysis(
    ["desktop.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="MyBooks",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="frontend/public/icon.png",
)
