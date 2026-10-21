"""Gestore documenti PDF (PyMuPDF).

Offre:
- rendering delle pagine come immagini PNG
- layer di testo posizionato (per selezione/sottolineatura)
- indice del documento, metadati e testo per la ricerca
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import Any

import pymupdf

from .base import BaseDocument, DocumentError, TextLine


def _int_to_hex(color: int) -> str:
    return f"#{color & 0xFFFFFF:06x}"


def _css_family(font_name: str) -> str:
    """Familie CSS metricamente compatibile con il font del PDF."""
    name = (font_name or "").lower()
    if "courier" in name or "mono" in name:
        return '"Courier New", Courier, "Liberation Mono", monospace'
    if any(token in name for token in ("times", "roman", "serif", "georgia", "garamond", "book")):
        return '"Times New Roman", Times, "Liberation Serif", serif'
    return 'Helvetica, Arial, "Liberation Sans", sans-serif'


class PdfDocument(BaseDocument):
    format = "pdf"

    def __init__(self, path: str | Path):
        super().__init__(path)
        try:
            self.doc = pymupdf.open(str(self.path))
        except Exception as exc:  # pragma: no cover - file corrotto
            raise DocumentError(f"Impossibile aprire il PDF: {exc}") from exc
        if self.doc.is_encrypted:
            try:
                self.doc.authenticate("")
            except Exception as exc:
                raise DocumentError("PDF protetto da password") from exc

    # --- metadati -------------------------------------------------------
    def metadata(self) -> dict[str, Any]:
        info = self.doc.metadata or {}
        title = (info.get("title") or "").strip()
        author = (info.get("author") or "").strip()
        if not title:
            title = self.path.stem
        return {
            "title": title,
            "author": author,
            "subject": (info.get("subject") or "").strip(),
            "keywords": (info.get("keywords") or "").strip(),
            "page_count": self.doc.page_count,
            "publisher": "",
            "created": info.get("creationDate") or "",
            "modified": info.get("modDate") or "",
            "language": (info.get("language") or "").strip(),
        }

    def outline(self) -> list[dict[str, Any]]:
        try:
            toc = self.doc.get_toc(simple=False)
        except Exception:
            return []
        tree: list[dict[str, Any]] = []
        stack: list[tuple[int, dict[str, Any]]] = []
        for entry in toc:
            if isinstance(entry, dict):
                level = int(entry.get("level", 1))
                title = entry.get("title", "")
                page = int(entry.get("page", 1))
            else:  # [livello, titolo, pagina, dettagli]
                level = int(entry[0]) if len(entry) > 0 else 1
                title = entry[1] if len(entry) > 1 else ""
                page = int(entry[2]) if len(entry) > 2 else 1
            node = {
                "title": str(title).strip() or "Sezione",
                "page": max(page - 1, 0),
                "children": [],
            }
            while stack and stack[-1][0] >= level:
                stack.pop()
            if stack:
                stack[-1][1]["children"].append(node)
            else:
                tree.append(node)
            stack.append((level, node))
        return tree

    # --- rendering ------------------------------------------------------
    @property
    def is_fixed_layout(self) -> bool:
        return True

    def page_size(self, page: int) -> dict[str, float]:
        rect = self.doc.load_page(page).rect
        return {"width": rect.width, "height": rect.height}

    def page_image(self, page: int, zoom: float = 2.0) -> bytes:
        if page < 0 or page >= self.doc.page_count:
            raise DocumentError("Pagina fuori intervallo")
        page_obj = self.doc.load_page(page)
        matrix = pymupdf.Matrix(zoom, zoom)
        pix = page_obj.get_pixmap(matrix=matrix, alpha=False)
        return pix.tobytes("png")

    def page_thumbnail(self, page: int, width: int = 220) -> bytes:
        page_obj = self.doc.load_page(page)
        scale = width / max(page_obj.rect.width, 1)
        pix = page_obj.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        return pix.tobytes("jpeg" if pix.n == 3 else "png")

    def text_layer(self, page: int) -> list[dict[str, Any]]:
        """Righe di testo con bounding box, per la selezione nel frontend."""
        if page < 0 or page >= self.doc.page_count:
            return []
        page_obj = self.doc.load_page(page)
        data = page_obj.get_text("dict", flags=pymupdf.TEXTFLAGS_TEXT)
        lines: list[TextLine] = []
        for block in data.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                if not spans:
                    continue
                text = "".join(s.get("text", "") for s in spans)
                if not text.strip():
                    continue
                x0 = min(s["bbox"][0] for s in spans)
                y0 = min(s["bbox"][1] for s in spans)
                x1 = max(s["bbox"][2] for s in spans)
                y1 = max(s["bbox"][3] for s in spans)
                size = max(float(s.get("size", 10)) for s in spans)
                color = _int_to_hex(spans[0].get("color", 0))
                font = (spans[0].get("font", "") or "").lower()
                lines.append(
                    TextLine(
                        x=x0,
                        y=y0,
                        w=x1 - x0,
                        h=max(y1 - y0, size),
                        size=size,
                        text=text,
                        color=color,
                        bold="bold" in font or "black" in font,
                        italic="italic" in font or "oblique" in font,
                        family=_css_family(spans[0].get("font", "")),
                    )
                )
        return [ln.as_dict() for ln in lines]

    def words(self, page: int) -> list[tuple]:
        if page < 0 or page >= self.doc.page_count:
            return []
        return self.doc.load_page(page).get_text("words")

    def plain_text(self) -> str:
        chunks = []
        for index in range(self.doc.page_count):
            chunks.append(f"\n\n=== Pagina {index + 1} ===\n")
            chunks.append(self.doc.load_page(index).get_text("text"))
        return "".join(chunks)

    def page_text(self, page: int) -> str:
        if page < 0 or page >= self.doc.page_count:
            return ""
        return self.doc.load_page(page).get_text("text")

    def render_cover(self, width: int = 600) -> bytes | None:
        if self.doc.page_count == 0:
            return None
        page_obj = self.doc.load_page(0)
        scale = width / max(page_obj.rect.width, 1)
        pix = page_obj.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        return pix.tobytes("png")

    def close(self) -> None:
        try:
            self.doc.close()
        except Exception:
            pass
