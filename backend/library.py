"""Gestione della libreria: importazione, metadati, copertine, sincronizzazione."""
from __future__ import annotations

import io
import random
import shutil
import uuid
from pathlib import Path
from typing import Any

from . import db
from .config import BOOKS_DIR, COVERS_DIR, SUPPORTED_FORMATS
from .docs import DocumentError, open_document

try:  # pragma: no cover
    from PIL import Image, ImageDraw, ImageFont
except Exception:  # pragma: no cover
    Image = ImageDraw = ImageFont = None

def _detect_format(path: Path) -> str:
    return SUPPORTED_FORMATS.get(path.suffix.lower(), "")


def _cover_name(book_id: int) -> str:
    return f"book_{book_id}.jpg"


PALETTE = [
    ("#7B2233", "#3C1019"),
    ("#6E1E2E", "#380D18"),
    ("#8E2B3F", "#481221"),
    ("#5B1A2B", "#2C0A13"),
    ("#A03A4C", "#521722"),
    ("#8A6A4E", "#463322"),
]

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/liberation-serif-fonts/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/stix-two-text/STIXTwoText-Regular.ttf",
    "/usr/share/fonts/adobe-source-serif-pro-fonts/SourceSerifPro-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    "C:/Windows/Fonts/georgia.ttf",
]


def _serif_font_path() -> str | None:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return candidate
    try:
        for pattern in ("*Serif*.ttf", "*Serif*.otf", "*Roman*.ttf"):
            for path in Path("/usr/share/fonts").rglob(pattern):
                return str(path)
    except Exception:
        pass
    return None


def _load_font(size: int) -> Any:
    if ImageFont is None:
        return None
    path = _serif_font_path()
    try:
        if path:
            return ImageFont.truetype(path, size)
        return ImageFont.load_default(size)
    except Exception:
        try:
            return ImageFont.load_default()
        except Exception:
            return None


def _text_width(font: Any, text: str) -> int:
    if font is None:
        return 0
    try:
        bbox = font.getbbox(text)
        return bbox[2] - bbox[0]
    except Exception:
        return int(len(text) * getattr(font, "size", 10) * 0.55)


def _wrap(text: str, font: Any, max_width: int, max_lines: int = 4) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if _text_width(font, candidate) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
            if len(lines) >= max_lines:
                break
    if current and len(lines) < max_lines:
        lines.append(current)
    if not lines:
        lines = [text[:60]]
    # tronco l'ultima riga se troppo lunga
    if len(lines) == max_lines and len(words) > 0:
        last = lines[-1]
        while _text_width(font, last + "…") > max_width and last:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


def make_placeholder_cover(title: str, author: str, seed: str = "") -> bytes:
    """Genera una copertina stilizzata (bordaux/beige) per i libri senza copertina."""
    if Image is None:
        return b""
    width, height = 600, 900
    rnd = random.Random(seed or title)
    start, end = PALETTE[rnd.randrange(len(PALETTE))]
    image = Image.new("RGB", (width, height), start)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = y / height
        color = tuple(
            int(int(start[i:i + 2], 16) + (int(end[i:i + 2], 16) - int(start[i:i + 2], 16)) * ratio)
            for i in (1, 3, 5)
        )
        draw.line([(0, y), (width, y)], fill=color)

    # costa del libro
    draw.rectangle([0, 0, 26, height], fill=(255, 255, 255, 12))
    draw.line([(26, 0), (26, height)], fill=(0, 0, 0), width=2)

    # cornice beige
    draw.rectangle([54, 54, width - 54, height - 54], outline="#E8D9C2", width=3)
    draw.rectangle([64, 64, width - 64, height - 64], outline="#E8D9C2", width=1)

    max_width = width - 150
    title_font = _load_font(46)
    while title_font is not None and _text_width(title_font, title or "Senza titolo") > max_width and getattr(title_font, "size", 46) > 20:
        title_font = _load_font(int(getattr(title_font, "size", 46)) - 3)

    lines = _wrap(title or "Senza titolo", title_font, max_width)
    line_height = int(getattr(title_font, "size", 40) * 1.22)
    block_height = line_height * len(lines)
    y = (height - block_height) / 2 - 30

    for line in lines:
        draw.text(((width - _text_width(title_font, line)) / 2, y), line, font=title_font, fill="#FBF3E7")
        y += line_height

    # regola decorativa
    draw.line([(width / 2 - 40, y + 18), (width / 2 + 40, y + 18)], fill="#E8D9C2", width=2)

    if author:
        author_font = _load_font(24)
        for line in _wrap(author, author_font, max_width, 2):
            draw.text(
                ((width - _text_width(author_font, line)) / 2, y + 38),
                line,
                font=author_font,
                fill="#E0CBB4",
            )
            y += 30

    draw.text((width / 2 - 38, height - 118), "M Y B O O K S", fill="#D9C3AA")

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def _save_cover(book_id: int, payload: bytes) -> str:
    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    name = _cover_name(book_id)
    (COVERS_DIR / name).write_bytes(payload)
    return name


def _autocrop(payload: bytes) -> bytes:
    """Ritaglia i margini bianchi della copertina (aspetto più "libro")."""
    if Image is None:
        return payload
    try:
        image = Image.open(io.BytesIO(payload)).convert("RGB")
        width, height = image.size
        mask = image.convert("L").point(lambda value: 255 if value < 242 else 0)
        bbox = mask.getbbox()
        if not bbox:
            return payload
        left, top, right, bottom = bbox
        if right - left < width * 0.55 or bottom - top < height * 0.55:
            return payload  # la pagina non ha margini significativi
        ratio = (right - left) / max(bottom - top, 1)
        if ratio < 0.55:
            return payload  # ritaglio troppo panoramico
        pad = int(min(width, height) * 0.015)
        box = (
            max(0, left - pad),
            max(0, top - pad),
            min(width, right + pad),
            min(height, bottom + pad),
        )
        buffer = io.BytesIO()
        image.crop(box).save(buffer, format="JPEG", quality=90)
        return buffer.getvalue()
    except Exception:
        return payload


def _extract_cover_from_epub(doc: Any) -> bytes | None:
    getter = getattr(doc, "cover_bytes", None)
    if callable(getter):
        try:
            payload = getter()
            if payload:
                return payload
        except Exception:
            pass
    try:
        import ebooklib

        for item in doc.book.get_items():
            if getattr(item, "get_type", lambda: None)() != ebooklib.ITEM_IMAGE:
                continue
            payload = item.get_content()
            if payload and len(payload) > 2000:
                return payload
    except Exception:
        pass
    return None


def _extract_cover_from_pdf(doc: Any) -> bytes | None:
    try:
        payload = doc.render_cover()
    except Exception:
        return None
    if payload:
        return _autocrop(payload)
    return None


def generate_cover(book_id: int, fmt: str, path: Path, title: str, author: str) -> str:
    """Crea (una sola volta) la copertina di un libro e ne restituisce il nome."""
    existing = COVERS_DIR / _cover_name(book_id)
    if existing.exists():
        return existing.name
    payload: bytes | None = None
    try:
        doc = open_document(path, fmt)
    except DocumentError:
        doc = None
    if doc is not None:
        try:
            if fmt == "epub":
                payload = _extract_cover_from_epub(doc)
            elif fmt == "pdf":
                payload = _extract_cover_from_pdf(doc)
        finally:
            doc.close()
    if not payload:
        payload = make_placeholder_cover(title, author, seed=str(path))
    if not payload:
        return ""
    try:
        image = Image.open(io.BytesIO(payload))
        image = image.convert("RGB")
        image.thumbnail((800, 1200))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=88)
        payload = buffer.getvalue()
    except Exception:
        pass
    return _save_cover(book_id, payload)


def import_book(src: Path, collection_id: int | None = None, copy: bool = True) -> dict[str, Any]:
    """Importa un file nella libreria e restituisce il record del libro."""
    src = Path(src)
    fmt = _detect_format(src)
    if not fmt:
        raise DocumentError(f"Formato non supportato: {src.suffix}")

    BOOKS_DIR.mkdir(parents=True, exist_ok=True)
    target = BOOKS_DIR / src.name
    if copy and src.resolve() != target.resolve():
        if target.exists():
            stem, suffix = target.stem, target.suffix
            target = BOOKS_DIR / f"{stem}-{uuid.uuid4().hex[:6]}{suffix}"
        shutil.copy2(src, target)
    else:
        target = src

    doc = open_document(target, fmt)
    try:
        meta = doc.metadata()
        total = int(meta.get("page_count") or 0)
    finally:
        doc.close()

    stamp = db.now()
    cur = db.execute(
        "INSERT INTO books(title, author, format, path, tags, collection_id, state, current_page,"
        " total_pages, progress, metadata, added_at, updated_at)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            meta.get("title") or target.stem,
            meta.get("author") or "",
            fmt,
            str(target),
            "",
            collection_id,
            "unread",
            0,
            total,
            0.0,
            db.dumps(meta),
            stamp,
            stamp,
        ),
    )
    book_id = cur.lastrowid
    cover = generate_cover(book_id, fmt, target, meta.get("title") or target.stem, meta.get("author") or "")
    if cover:
        db.execute("UPDATE books SET cover = ? WHERE id = ?", (cover, book_id))
    index_book_text(book_id, target, fmt)
    return get_book(book_id)  # type: ignore[return-value]


def index_book_text(book_id: int, path: Path, fmt: str) -> None:
    """Popola l'indice full-text del libro."""
    try:
        doc = open_document(path, fmt)
    except DocumentError:
        return
    try:
        text = doc.plain_text()
    except Exception:
        text = ""
    finally:
        doc.close()
    if not text:
        return
    conn = db.connect()
    try:
        conn.execute("DELETE FROM search_fts WHERE book_id = ?", (book_id,))
        chunk = 1800
        ref = 0
        for start in range(0, len(text), chunk):
            piece = text[start : start + chunk]
            conn.execute(
                "INSERT INTO search_fts(book_id, kind, ref, title, body) VALUES(?,?,?,?,?)",
                (book_id, "book", ref, "", piece),
            )
            ref += 1
        conn.commit()
    finally:
        conn.close()


def get_book(book_id: int) -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM books WHERE id = ?", (book_id,))
    return book_to_dict(row) if row else None


def book_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data["metadata"] = db.loads(data.get("metadata"), {})
    data["tags"] = [t for t in (data.get("tags") or "").split(",") if t.strip()]
    data["cover_url"] = f"/api/books/{data['id']}/cover" if data.get("cover") else ""
    data["path"] = str(data.get("path") or "")
    return data


def list_books(
    search: str = "",
    collection_id: int | None = None,
    state: str = "",
    sort: str = "recent",
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM books WHERE 1=1"
    params: list[Any] = []
    if collection_id is not None:
        sql += " AND collection_id = ?"
        params.append(collection_id)
    if state:
        sql += " AND state = ?"
        params.append(state)
    if search:
        sql += " AND (title LIKE ? OR author LIKE ? OR tags LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like, like])
    order = {
        "recent": "last_opened IS NULL, added_at DESC",
        "added": "added_at DESC",
        "title": "title COLLATE NOCASE ASC",
        "author": "author COLLATE NOCASE ASC",
        "progress": "progress DESC",
    }.get(sort, "added_at DESC")
    sql += f" ORDER BY {order}"
    return [book_to_dict(r) for r in db.query(sql, params)]


def delete_book(book_id: int) -> None:
    row = db.query_one("SELECT cover, path FROM books WHERE id = ?", (book_id,))
    if row:
        cover = COVERS_DIR / row["cover"] if row.get("cover") else None
        if cover and cover.exists() and cover.parent == COVERS_DIR:
            cover.unlink(missing_ok=True)
    db.execute("DELETE FROM search_fts WHERE book_id = ?", (book_id,))
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))


def update_progress(book_id: int, page: int, total: int) -> None:
    total = max(int(total or 0), 1)
    page = max(0, min(int(page or 0), total - 1))
    progress = min(round((page + 1) / total, 4), 1.0)
    state = "unread"
    if progress > 0.01:
        state = "reading"
    if progress >= 0.995:
        state = "finished"
    db.execute(
        "UPDATE books SET current_page = ?, total_pages = ?, progress = ?, state = ?,"
        " last_opened = ?, updated_at = ? WHERE id = ?",
        (page, total, progress, state, db.now(), db.now(), book_id),
    )


def record_session(book_id: int, seconds: int, pages: int = 0) -> None:
    day = db.now()[:10]
    conn = db.connect()
    try:
        conn.execute(
            "INSERT INTO reading_sessions(book_id, day, seconds, pages) VALUES(?,?,?,?)"
            " ON CONFLICT(book_id, day) DO UPDATE SET seconds = seconds + excluded.seconds,"
            " pages = pages + excluded.pages",
            (book_id, day, max(int(seconds), 0), max(int(pages), 0)),
        )
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()
