"""Interfaccia comune ai gestori di documenti.

Ogni formato espone:
- `metadata()`  -> dizionario con titolo, autore, copertina, ecc.
- `outline()`   -> indice (alberato) del documento
- `page_count`  -> numero di pagine/sezioni
- `page_image(page, zoom)` -> PNG/JPEG renderizzato (solo formati fissi)
- `text_layer(page)` -> righe di testo con bounding box (solo formati fissi)
- `chapters()`  -> sezioni reflowable (EPUB, DOCX, PPTX, TXT)

Un documento può essere "fixed" (PDF) oppure "reflowable" (EPUB/DOCX/…):
i due tipi condividono lo stesso visualizzatore lato frontend.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class TextLine:
    """Una riga di testo con la sua posizione in coordinate documento (pt)."""

    x: float
    y: float
    w: float
    h: float
    size: float
    text: str
    color: str = "#000000"
    bold: bool = False
    italic: bool = False
    family: str = "Helvetica, Arial, sans-serif"

    def as_dict(self) -> dict[str, Any]:
        return {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "w": round(self.w, 2),
            "h": round(self.h, 2),
            "size": round(self.size, 2),
            "text": self.text,
            "color": self.color,
            "bold": self.bold,
            "italic": self.italic,
            "family": self.family,
        }


@dataclass
class Chapter:
    """Sezione reflowable: HTML pronto da inserire in un iframe."""

    title: str
    html: str
    href: str = ""
    text: str = ""
    images: list[str] = field(default_factory=list)


class DocumentError(Exception):
    """Errore leggibile mostrato all'utente."""


class BaseDocument:
    format = "base"

    def __init__(self, path: str | Path):
        self.path = Path(path)
        if not self.path.exists():
            raise DocumentError(f"File non trovato: {self.path}")

    # --- metadati -------------------------------------------------------
    def metadata(self) -> dict[str, Any]:
        return {"title": self.path.stem, "author": "", "page_count": 0}

    def outline(self) -> list[dict[str, Any]]:
        return []

    # --- contenuto -------------------------------------------------------
    @property
    def page_count(self) -> int:
        return int(self.metadata().get("page_count") or 0)

    @property
    def is_fixed_layout(self) -> bool:
        return False

    def page_image(self, page: int, zoom: float = 2.0) -> bytes:
        raise DocumentError("Formato non renderizzabile")

    def text_layer(self, page: int) -> list[dict[str, Any]]:
        return []

    def chapters(self) -> list[Chapter]:
        return []

    def plain_text(self) -> str:
        return ""

    def close(self) -> None:  # pragma: no cover - hook per subclass
        pass


def open_document(path: str | Path, fmt: str | None = None) -> BaseDocument:
    """Apre un documento scegliendo il gestore adatto al formato."""
    from .office import DocxDocument, PptxDocument
    from .pdf import PdfDocument
    from .epub import EpubDocument
    from .plain import PlainDocument

    p = Path(path)
    fmt = (fmt or p.suffix.lstrip(".")).lower()
    if fmt == "pdf":
        return PdfDocument(p)
    if fmt == "epub":
        return EpubDocument(p)
    if fmt == "docx":
        return DocxDocument(p)
    if fmt == "pptx":
        return PptxDocument(p)
    if fmt in {"txt", "md", "markdown", "html", "htm"}:
        return PlainDocument(p)
    raise DocumentError(f"Formato non supportato: {fmt}")
