"""Gestore per file di testo semplice (.txt, .md, .html) con supporto Markdown."""
from __future__ import annotations

import html as html_mod
import re
from pathlib import Path
from typing import Any

from .base import BaseDocument, Chapter, DocumentError


def _esc(text: str) -> str:
    return html_mod.escape(text or "")


class PlainDocument(BaseDocument):
    format = "txt"

    def __init__(self, path: str | Path):
        super().__init__(path)
        try:
            self.content = self.path.read_text(encoding="utf-8", errors="ignore")
        except Exception as exc:
            raise DocumentError(f"Impossibile leggere il file: {exc}") from exc

    def metadata(self) -> dict[str, Any]:
        return {"title": self.path.stem, "author": "", "page_count": 1}

    def _render(self) -> str:
        suffix = self.path.suffix.lower()
        if suffix in {".md", ".markdown"}:
            return self._markdown(self.content)
        if suffix in {".html", ".htm"}:
            body = re.sub(r"(?is)<head.*?</head>", "", self.content)
            body = re.sub(r"(?is)<script.*?</script>", "", body)
            body = re.sub(r"(?is)<style.*?</style>", "", body)
            return body.strip()
        paragraphs = re.split(r"\n\s*\n", self.content)
        return "".join(f"<p>{_esc(p).replace(chr(10), '<br>')}</p>" for p in paragraphs)

    def _markdown(self, text: str) -> str:
        out: list[str] = []
        for block in re.split(r"\n\s*\n", text):
            stripped = block.strip()
            if not stripped:
                continue
            if stripped.startswith("#"):
                level = min(len(stripped) - len(stripped.lstrip("#")), 4)
                out.append(f"<h{level}>{_esc(stripped.lstrip('#').strip())}</h{level}>")
            elif stripped.startswith("- ") or stripped.startswith("* "):
                items = [
                    f"<li>{_esc(line.lstrip('-* ').strip())}</li>"
                    for line in stripped.splitlines()
                    if line.strip()
                ]
                out.append(f"<ul>{''.join(items)}</ul>")
            elif stripped.startswith(">"):
                out.append(f"<blockquote>{_esc(stripped.lstrip('> ').strip())}</blockquote>")
            else:
                inline = _esc(stripped)
                inline = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", inline)
                inline = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", inline)
                inline = re.sub(r"`([^`]+)`", r"<code>\1</code>", inline)
                out.append(f"<p>{inline.replace(chr(10), '<br>')}</p>")
        return "".join(out)

    def chapters(self) -> list[Chapter]:
        return [
            Chapter(
                title=self.path.stem,
                html=self._render(),
                href="text",
                text=self.content,
            )
        ]

    def plain_text(self) -> str:
        return self.content
