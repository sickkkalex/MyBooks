"""Gestore documenti EPUB (ebooklib).

L'EPUB viene convertito in "capitoli" reflowable con HTML pronto per il
visualizzatore a colonne (stile Apple Books). Le immagini vengono incorporate
come data-URI per evitare richieste aggiuntive.
"""
from __future__ import annotations

import base64
import html as html_mod
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any

from .base import BaseDocument, Chapter, DocumentError

try:  # pragma: no cover - dipendenza opzionale
    import ebooklib
    from ebooklib import epub

    _HAS_EBOOKLIB = True
except Exception:  # pragma: no cover
    _HAS_EBOOKLIB = False


def _clean_html(raw: str) -> str:
    """Rimuove script/style e attributi non necessari, mantiene la struttura."""
    raw = re.sub(r"(?is)<script.*?</script>", "", raw)
    raw = re.sub(r"(?is)<style.*?</style>", "", raw)
    raw = re.sub(r"(?is)<head.*?</head>", "", raw)
    raw = re.sub(r"(?is)<!--.*?-->", "", raw)
    raw = re.sub(r"\s+on\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", raw)
    raw = re.sub(r"(?i)\s+(href|src)\s*=\s*(\"javascript:[^\"]*\"|'javascript:[^']*')", "", raw)
    return raw.strip()


def _html_to_text(raw: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html_mod.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


class EpubDocument(BaseDocument):
    format = "epub"

    def __init__(self, path: str | Path):
        super().__init__(path)
        if not _HAS_EBOOKLIB:
            raise DocumentError("ebooklib non è installato")
        try:
            self.book = epub.read_epub(str(self.path), options={"ignore_ncx": True})
        except Exception as exc:
            raise DocumentError(f"Impossibile aprire l'EPUB: {exc}") from exc
        self._images = self._build_image_map()
        self._chapters: list[Chapter] | None = None

    # --- risorse --------------------------------------------------------
    def _build_image_map(self) -> dict[str, str]:
        images: dict[str, str] = {}
        for item in self.book.get_items():
            if getattr(item, "get_type", lambda: None)() != ebooklib.ITEM_IMAGE:
                continue
            name = item.get_name()
            payload = item.get_content()
            if not payload:
                continue
            mime = item.media_type or "image/jpeg"
            if mime == "image/svg+xml":
                svg = payload.decode("utf-8", "ignore")
                uri = "data:image/svg+xml;base64," + base64.b64encode(payload).decode()
            else:
                uri = f"data:{mime};base64,{base64.b64encode(payload).decode()}"
            images[name] = uri
            images[name.split("/")[-1]] = uri
        return images

    def _inline_images(self, raw: str) -> str:
        def repl(match: re.Match) -> str:
            src = match.group(2)
            if src.startswith("data:"):
                return match.group(0)
            key = src.lstrip("./")
            for candidate in (src, key, key.split("/")[-1]):
                if candidate in self._images:
                    return f'{match.group(1)}="{self._images[candidate]}"'
            return match.group(0)

        return re.sub(r'(src|href)\s*=\s*"([^"]+)"', repl, raw)

    # ------------------------------------------------------ copertina ---
    def _opf_path(self) -> str | None:
        """Percorso del file OPF all'interno dell'archivio EPUB."""
        try:
            with zipfile.ZipFile(self.path) as archive:
                names = archive.namelist()
                if "META-INF/container.xml" not in names:
                    return None
                root = ET.fromstring(archive.read("META-INF/container.xml"))
                for node in root.iter():
                    if node.tag.endswith("rootfile") and node.get("full-path"):
                        return node.get("full-path")
        except Exception:
            return None
        return None

    @staticmethod
    def _read_zip_member(archive: zipfile.ZipFile, name: str) -> bytes | None:
        if name in archive.namelist():
            return archive.read(name)
        return None

    def cover_bytes(self) -> bytes | None:
        """Restituisce i byte dell'immagine di copertina, se esiste.

        Cerca, in ordine: meta `cover` nell'OPF, item con
        `properties="cover-image"`, item il cui id/href contiene "cover",
        pagina di copertina XHTML che contiene un'immagine, infine la
        prima immagine presente nell'archivio.
        """
        opf = self._opf_path()
        if opf:
            try:
                with zipfile.ZipFile(self.path) as archive:
                    raw = self._read_zip_member(archive, opf)
                    if raw:
                        root = ET.fromstring(raw)
                        base = posixpath.dirname(opf)
                        items: dict[str, dict[str, str]] = {}
                        for node in root.iter():
                            if node.tag.endswith("item") and node.get("id"):
                                items[node["id"]] = dict(node.attrib)

                        cover_id = None
                        for node in root.iter():
                            if node.tag.endswith("meta") and (node.get("name") or "").lower() == "cover":
                                cover_id = node.get("content")
                        chosen = items.get(cover_id) if cover_id else None

                        if chosen is None:
                            for item in items.values():
                                if "cover-image" in (item.get("properties") or ""):
                                    chosen = item
                                    break
                        if chosen is None:
                            for item in items.values():
                                media = item.get("media-type") or ""
                                ident = (item.get("id") or "").lower()
                                href = (item.get("href") or "").lower()
                                if "image" in media and ("cover" in ident or "cover" in href):
                                    chosen = item
                                    break
                        if chosen is not None:
                            payload = self._read_zip_member(
                                archive, posixpath.normpath(posixpath.join(base, chosen.get("href", "")))
                            )
                            if payload:
                                return payload

                        # pagina di copertina in XHTML con immagine incorporata
                        for item in items.values():
                            href = (item.get("href") or "").lower()
                            media = item.get("media-type") or ""
                            if "cover" not in href or "html" not in media:
                                continue
                            page = self._read_zip_member(
                                archive, posixpath.normpath(posixpath.join(base, item.get("href", "")))
                            )
                            if not page:
                                continue
                            match = re.search(rb'src\s*=\s*["\']([^"\']+)["\']', page, re.IGNORECASE)
                            if match:
                                src = match.group(1).decode("utf-8", "ignore")
                                if src.startswith("data:"):
                                    return None
                                payload = self._read_zip_member(
                                    archive, posixpath.normpath(posixpath.join(base, src))
                                )
                                if payload:
                                    return payload
            except Exception:
                pass

        # ultima risorsa: la prima immagine nell'archivio
        try:
            with zipfile.ZipFile(self.path) as archive:
                for name in archive.namelist():
                    if re.search(r"\.(jpe?g|png|gif|webp|svg)$", name, re.IGNORECASE):
                        payload = archive.read(name)
                        if len(payload) > 1500:
                            return payload
        except Exception:
            pass
        return None

    # --- metadati -------------------------------------------------------
    def metadata(self) -> dict[str, Any]:
        def meta(name: str) -> str:
            values = self.book.get_metadata("DC", name)
            if not values:
                return ""
            first = values[0]
            return str(first[0]) if isinstance(first, (list, tuple)) else str(first)

        title = meta("title").strip() or self.path.stem
        author = meta("creator").strip()
        language = meta("language").strip()
        publisher = meta("publisher").strip()
        description = meta("description").strip()
        identifier = meta("identifier").strip()
        return {
            "title": title,
            "author": author,
            "description": description,
            "language": language,
            "publisher": publisher,
            "identifier": identifier,
            "page_count": len(self._spine()),
        }

    def _spine(self) -> list[Any]:
        """Elementi dello spine, escludendo le risorse marcate `linear="no"`
        (pagine di copertina, front matter non lineare)."""
        try:
            entries = list(self.book.spine)
            items = []
            for entry in entries:
                if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                    idref, linear = entry[0], entry[1]
                    if str(linear).lower() == "no":
                        continue
                    items.append(self.book.get_item_with_id(idref))
                else:
                    items.append(self.book.get_item_with_id(entry))
            return [item for item in items if item is not None]
        except Exception:
            items = list(self.book.get_items_of_type(ebooklib.ITEM_DOCUMENT))
            return items

    def outline(self) -> list[dict[str, Any]]:
        tree: list[dict[str, Any]] = []
        index = 0
        try:
            entries = list(self.book.toc)
        except Exception:
            entries = []
        for entry in entries:
            title, href, children = self._link_parts(entry)
            node = {"title": title or "Sezione", "page": index, "children": []}
            tree.append(node)
            index += 1
            for child in children:
                child_title, _, _ = self._link_parts(child)
                node["children"].append({"title": child_title or "Sezione", "page": index, "children": []})
                index += 1
        if tree:
            return tree
        # Fallback: un capitolo per ogni elemento dello spine
        return [
            {"title": f"Capitolo {i + 1}", "page": i, "children": []}
            for i in range(len(self._spine()))
        ]

    @staticmethod
    def _link_parts(entry: Any) -> tuple[str, str, list]:
        """Estrae (titolo, href, figli) da un Link di ebooklib o da una tupla."""
        title = getattr(entry, "title", None)
        href = getattr(entry, "href", None)
        children = getattr(entry, "children", None)
        if title is None or href is None:
            try:
                title = entry[1]
            except (TypeError, IndexError, KeyError):
                title = ""
            try:
                href = entry[2]
            except (TypeError, IndexError, KeyError):
                href = ""
        return str(title or "").strip(), str(href or ""), list(children or [])

    # --- contenuto -------------------------------------------------------
    def chapters(self) -> list[Chapter]:
        if self._chapters is not None:
            return self._chapters
        toc_titles = self._toc_map()
        chapters: list[Chapter] = []
        spine = self._spine()
        counter = 0
        for item in spine:
            if item is None:
                continue
            try:
                content = item.get_content()
                raw = content.decode("utf-8", "ignore") if isinstance(content, bytes) else str(content)
            except Exception:
                continue
            body = _clean_html(raw)
            body = self._inline_images(body)
            name = item.get_name()
            href = name.split("/")[-1]
            title = toc_titles.get(href) or toc_titles.get(name) or ""
            if not title:
                heading = re.search(r"(?is)<h[1-3][^>]*>(.*?)</h[1-3]>", body)
                title = _html_to_text(heading.group(1)) if heading else f"Capitolo {counter + 1}"
            chapters.append(
                Chapter(
                    title=title.strip() or f"Capitolo {counter + 1}",
                    html=body,
                    href=href,
                    text=_html_to_text(body),
                )
            )
            counter += 1
        if not chapters:
            chapters = [Chapter(title="Documento vuoto", html="<p>Nessun contenuto.</p>")]
        self._chapters = chapters
        return chapters

    def _toc_map(self) -> dict[str, str]:
        mapping: dict[str, str] = {}

        def walk(entries) -> None:
            for entry in entries:
                title, href, children = self._link_parts(entry)
                if href:
                    mapping[href.split("#")[0].split("/")[-1]] = title
                if children:
                    walk(children)

        try:
            walk(list(self.book.toc))
        except Exception:
            pass
        return mapping

    def plain_text(self) -> str:
        return "\n\n".join(ch.text for ch in self.chapters())

    def close(self) -> None:
        self._chapters = None
