"""Configurazione centrale di MyBooks."""
from __future__ import annotations

import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = Path(os.environ.get("MYBOOKS_FRONTEND_DIR", ROOT_DIR / "frontend")).expanduser()
DATA_DIR = Path(os.environ.get("MYBOOKS_DATA_DIR", ROOT_DIR / "data")).expanduser()
BOOKS_DIR = DATA_DIR / "books"
COVERS_DIR = DATA_DIR / "covers"
EXPORTS_DIR = DATA_DIR / "exports"
DB_PATH = DATA_DIR / "mybooks.db"

# Cartelle monitorate per l'importazione automatica della libreria.
# L'utente può aggiungerne altre da /api/settings
DEFAULT_LIBRARY_DIRS = [str(Path.home() / "Documents" / "MyBooks")]

SUPPORTED_FORMATS = {
    ".pdf": "pdf",
    ".epub": "epub",
    ".docx": "docx",
    ".pptx": "pptx",
    ".txt": "txt",
    ".md": "txt",
    ".markdown": "txt",
    ".html": "txt",
    ".htm": "txt",
}

MAX_UPLOAD_BYTES = 512 * 1024 * 1024


def ensure_dirs() -> None:
    for directory in (DATA_DIR, BOOKS_DIR, COVERS_DIR, EXPORTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)
