"""Appunti di studio: note strutturate legate a libro, capitolo e argomento.

Ogni appunto può contenere un "riferimento": un brano di testo, un link a
un'altra risorsa o un collegamento profondo a MyBooks (`mybooks://libro/<id>?pagina=N`).
"""
from __future__ import annotations

import re
from typing import Any

from . import db

LINK_PATTERN = re.compile(r"mybooks://libro/(\d+)(?:\?pagina=(\d+))?(?:\&capitolo=(\d+))?", re.IGNORECASE)


def _dict(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data["tags"] = [t for t in (data.get("tags") or "").split(",") if t.strip()]
    data["pinned"] = bool(data.get("pinned"))
    data["link"] = parse_link(data.get("reference") or "")
    return data


def parse_link(reference: str) -> dict[str, Any] | None:
    """Riconosce un eventuale collegamento profondo dentro il riferimento."""
    if not reference:
        return None
    match = LINK_PATTERN.search(reference)
    if not match:
        return None
    return {
        "book_id": int(match.group(1)),
        "page": int(match.group(2)) if match.group(2) else 0,
        "chapter": int(match.group(3)) if match.group(3) else None,
        "raw": match.group(0),
    }


def build_link(book_id: int, page: int = 0, chapter: int | None = None) -> str:
    url = f"mybooks://libro/{book_id}?pagina={page}"
    if chapter is not None:
        url += f"&capitolo={chapter}"
    return url


def list_notes(book_id: int | None = None, search: str = "") -> list[dict[str, Any]]:
    sql = "SELECT * FROM study_notes WHERE 1=1"
    params: list[Any] = []
    if book_id is not None:
        sql += " AND book_id = ?"
        params.append(book_id)
    if search:
        sql += " AND (title LIKE ? OR body LIKE ? OR topic LIKE ? OR chapter LIKE ? OR reference LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like, like, like, like])
    sql += " ORDER BY pinned DESC, updated_at DESC"
    return [_dict(r) for r in db.query(sql, params)]


def get_note(note_id: int) -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM study_notes WHERE id = ?", (note_id,))
    return _dict(row) if row else None


def create_note(data: dict[str, Any]) -> dict[str, Any]:
    stamp = db.now()
    tags = data.get("tags")
    if isinstance(tags, list):
        tags = ",".join(tags)
    cur = db.execute(
        "INSERT INTO study_notes(book_id, chapter, topic, title, body, reference, page, location,"
        " color, tags, pinned, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            int(data["book_id"]) if data.get("book_id") else None,
            str(data.get("chapter") or ""),
            str(data.get("topic") or ""),
            str(data.get("title") or ""),
            str(data.get("body") or ""),
            str(data.get("reference") or ""),
            int(data.get("page") or 0),
            str(data.get("location") or ""),
            str(data.get("color") or "#F4EBDD"),
            tags or "",
            1 if data.get("pinned") else 0,
            stamp,
            stamp,
        ),
    )
    return get_note(cur.lastrowid)  # type: ignore[return-value]


def update_note(note_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    fields = []
    params: list[Any] = []
    for key in ("book_id", "page", "location", "title", "body", "chapter", "topic", "reference", "color"):
        if key in data:
            fields.append(f"{key} = ?")
            value = data[key]
            if key == "book_id":
                params.append(int(value) if value else None)
            elif key == "page":
                params.append(int(value or 0))
            else:
                params.append(str(value))
    if "tags" in data:
        tags = data["tags"]
        fields.append("tags = ?")
        params.append(",".join(tags) if isinstance(tags, list) else str(tags or ""))
    if "pinned" in data:
        fields.append("pinned = ?")
        params.append(1 if data["pinned"] else 0)
    if not fields:
        return get_note(note_id)
    fields.append("updated_at = ?")
    params.append(db.now())
    params.append(note_id)
    db.execute(f"UPDATE study_notes SET {', '.join(fields)} WHERE id = ?", params)
    return get_note(note_id)


def delete_note(note_id: int) -> None:
    db.execute("DELETE FROM study_notes WHERE id = ?", (note_id,))
