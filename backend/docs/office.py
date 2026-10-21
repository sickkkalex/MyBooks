"""Gestori per documenti "office" e testo semplice (reflowable)."""
from __future__ import annotations

import html as html_mod
import re
from pathlib import Path
from typing import Any

from .base import BaseDocument, Chapter, DocumentError

try:  # pragma: no cover
    import docx
except Exception:  # pragma: no cover
    docx = None

try:  # pragma: no cover
    from pptx import Presentation
except Exception:  # pragma: no cover
    Presentation = None


def _esc(text: str) -> str:
    return html_mod.escape(text or "")


class DocxDocument(BaseDocument):
    format = "docx"

    def __init__(self, path: str | Path):
        super().__init__(path)
        if docx is None:
            raise DocumentError("python-docx non è installato")
        try:
            self.doc = docx.Document(str(self.path))
        except Exception as exc:
            raise DocumentError(f"Impossibile aprire il DOCX: {exc}") from exc

    def metadata(self) -> dict[str, Any]:
        props = self.doc.core_properties
        title = (props.title or "").strip() or self.path.stem
        author = (props.author or "").strip()
        return {
            "title": title,
            "author": author,
            "subject": (props.subject or "").strip(),
            "keywords": (props.keywords or "").strip(),
            "page_count": len(self.doc.paragraphs),
        }

    def outline(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        index = 0
        for para in self.doc.paragraphs:
            style = (para.style.name or "").lower() if para.style else ""
            if style.startswith("heading") and para.text.strip():
                out.append(
                    {"title": para.text.strip(), "page": index, "children": []}
                )
            index += 1
        if out:
            return out
        return [{"title": "Documento", "page": 0, "children": []}]

    def chapters(self) -> list[Chapter]:
        blocks: list[str] = []
        texts: list[str] = []
        for para in self.doc.paragraphs:
            text = para.text.rstrip()
            style = (para.style.name or "").lower() if para.style else ""
            if not text.strip():
                blocks.append("<p>&nbsp;</p>")
                continue
            if style.startswith("heading 1"):
                blocks.append(f"<h1>{_esc(text)}</h1>")
            elif style.startswith("heading 2"):
                blocks.append(f"<h2>{_esc(text)}</h2>")
            elif style.startswith("heading 3"):
                blocks.append(f"<h3>{_esc(text)}</h3>")
            elif style.startswith("list") or style.startswith("bullet"):
                blocks.append(f"<li>{_esc(text)}</li>")
            elif style.startswith("quote"):
                blocks.append(f"<blockquote>{_esc(text)}</blockquote>")
            else:
                blocks.append(f"<p>{_esc(text)}</p>")
            texts.append(text)
        if not blocks:
            blocks = ["<p>Documento vuoto.</p>"]
        return [
            Chapter(
                title=self.metadata()["title"],
                html="".join(blocks),
                href="document",
                text="\n".join(texts),
            )
        ]

    def plain_text(self) -> str:
        return "\n".join(p.text for p in self.doc.paragraphs)


class PptxDocument(BaseDocument):
    format = "pptx"

    def __init__(self, path: str | Path):
        super().__init__(path)
        if Presentation is None:
            raise DocumentError("python-pptx non è installato")
        try:
            self.prs = Presentation(str(self.path))
        except Exception as exc:
            raise DocumentError(f"Impossibile aprire il PPTX: {exc}") from exc

    def metadata(self) -> dict[str, Any]:
        props = self.prs.core_properties
        title = (props.title or "").strip() or self.path.stem
        author = (props.author or "").strip()
        return {
            "title": title,
            "author": author,
            "page_count": len(self.prs.slides),
        }

    def outline(self) -> list[dict[str, Any]]:
        out = []
        for index, slide in enumerate(self.prs.slides):
            title = ""
            for shape in slide.shapes:
                if shape.has_text_frame and shape == slide.shapes.title:
                    title = shape.text_frame.text.strip()
                    break
            out.append({"title": title or f"Slide {index + 1}", "page": index, "children": []})
        return out

    def chapters(self) -> list[Chapter]:
        chapters: list[Chapter] = []
        for index, slide in enumerate(self.prs.slides):
            title = ""
            bullets: list[str] = []
            notes = ""
            for shape in slide.shapes:
                if shape.has_text_frame:
                    txt = shape.text_frame.text.strip()
                    if not txt:
                        continue
                    if shape == slide.shapes.title and not title:
                        title = txt
                    else:
                        bullets.append(txt)
                if shape.has_notes_slide:
                    notes = shape.notes_slide.notes_text_frame.text.strip()
            html_parts = [f"<h2>{_esc(title or f'Slide {index + 1}')}</h2>"]
            for bullet in bullets:
                html_parts.append(f"<p>{_esc(bullet).replace(chr(10), '<br>')}</p>")
            if notes:
                html_parts.append(f"<blockquote>{_esc(notes)}</blockquote>")
            chapters.append(
                Chapter(
                    title=title or f"Slide {index + 1}",
                    html="".join(html_parts),
                    href=f"slide{index + 1}",
                    text="\n".join([title, *bullets, notes]),
                )
            )
        return chapters or [Chapter(title="Presentazione vuota", html="<p>Nessuna slide.</p>")]

    def plain_text(self) -> str:
        return "\n\n".join(ch.text for ch in self.chapters())
