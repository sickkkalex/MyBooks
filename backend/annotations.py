"""Annotazioni, note, segnalibri e flashcard."""
from __future__ import annotations

from typing import Any

from . import db

ANNOTATION_TYPES = {
    "highlight",
    "underline",
    "strikeout",
    "square",
    "circle",
    "ink",
    "text",
    "postit",
}


def _annotation_dict(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data["rects"] = db.loads(data.get("rects"), [])
    data["points"] = db.loads(data.get("points"), [])
    data["anchor"] = db.loads(data.get("anchor"), {})
    return data


def list_annotations(book_id: int, page: int | None = None) -> list[dict[str, Any]]:
    if page is None:
        rows = db.query(
            "SELECT * FROM annotations WHERE book_id = ? ORDER BY page ASC, id ASC", (book_id,)
        )
    else:
        rows = db.query(
            "SELECT * FROM annotations WHERE book_id = ? AND page = ? ORDER BY id ASC",
            (book_id, page),
        )
    return [_annotation_dict(r) for r in rows]


def create_annotation(data: dict[str, Any]) -> dict[str, Any]:
    stamp = db.now()
    cur = db.execute(
        "INSERT INTO annotations(book_id, type, page, location, color, rects, points, text, anchor,"
        " comment, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            int(data["book_id"]),
            data.get("type") or "highlight",
            int(data.get("page") or 0),
            str(data.get("location") or ""),
            str(data.get("color") or "#E9C46A"),
            db.dumps(data.get("rects") or []),
            db.dumps(data.get("points") or []),
            str(data.get("text") or ""),
            db.dumps(data.get("anchor") or {}),
            str(data.get("comment") or ""),
            stamp,
            stamp,
        ),
    )
    return get_annotation(cur.lastrowid)  # type: ignore[return-value]


def get_annotation(annotation_id: int) -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM annotations WHERE id = ?", (annotation_id,))
    return _annotation_dict(row) if row else None


def update_annotation(annotation_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    fields = []
    params: list[Any] = []
    for key in ("type", "page", "location", "color", "text", "comment"):
        if key in data:
            fields.append(f"{key} = ?")
            value = data[key]
            params.append(int(value) if key == "page" else str(value))
    for key in ("rects", "points", "anchor"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(db.dumps(data[key]))
    if not fields:
        return get_annotation(annotation_id)
    fields.append("updated_at = ?")
    params.append(db.now())
    params.append(annotation_id)
    db.execute(f"UPDATE annotations SET {', '.join(fields)} WHERE id = ?", params)
    return get_annotation(annotation_id)


def delete_annotation(annotation_id: int) -> None:
    db.execute("DELETE FROM annotations WHERE id = ?", (annotation_id,))


# ---------------------------------------------------------------- note ----
def _note_dict(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data["tags"] = [t for t in (data.get("tags") or "").split(",") if t.strip()]
    data["pinned"] = bool(data.get("pinned"))
    return data


def list_notes(book_id: int | None = None, search: str = "") -> list[dict[str, Any]]:
    sql = "SELECT * FROM notes WHERE 1=1"
    params: list[Any] = []
    if book_id is not None:
        sql += " AND book_id = ?"
        params.append(book_id)
    if search:
        sql += " AND (title LIKE ? OR body LIKE ? OR tags LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like, like])
    sql += " ORDER BY pinned DESC, updated_at DESC"
    return [_note_dict(r) for r in db.query(sql, params)]


def get_note(note_id: int) -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM notes WHERE id = ?", (note_id,))
    return _note_dict(row) if row else None


def create_note(data: dict[str, Any]) -> dict[str, Any]:
    stamp = db.now()
    tags = data.get("tags")
    if isinstance(tags, list):
        tags = ",".join(tags)
    cur = db.execute(
        "INSERT INTO notes(book_id, page, location, title, body, color, tags, pinned, created_at,"
        " updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (
            int(data["book_id"]) if data.get("book_id") else None,
            int(data.get("page") or 0),
            str(data.get("location") or ""),
            str(data.get("title") or ""),
            str(data.get("body") or ""),
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
    for key in ("book_id", "page", "location", "title", "body", "color"):
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
    db.execute(f"UPDATE notes SET {', '.join(fields)} WHERE id = ?", params)
    return get_note(note_id)


def delete_note(note_id: int) -> None:
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))


# ---------------------------------------------------------- segnalibri ----
def list_bookmarks(book_id: int) -> list[dict[str, Any]]:
    return db.query("SELECT * FROM bookmarks WHERE book_id = ? ORDER BY page ASC", (book_id,))


def create_bookmark(data: dict[str, Any]) -> dict[str, Any]:
    cur = db.execute(
        "INSERT INTO bookmarks(book_id, page, location, label, created_at) VALUES(?,?,?,?,?)",
        (
            int(data["book_id"]),
            int(data.get("page") or 0),
            str(data.get("location") or ""),
            str(data.get("label") or ""),
            db.now(),
        ),
    )
    row = db.query_one("SELECT * FROM bookmarks WHERE id = ?", (cur.lastrowid,))
    return dict(row) if row else {}


def delete_bookmark(bookmark_id: int) -> None:
    db.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))


# ---------------------------------------------------------- flashcard ----
def list_flashcards(book_id: int | None = None, deck: str = "") -> list[dict[str, Any]]:
    sql = "SELECT * FROM flashcards WHERE 1=1"
    params: list[Any] = []
    if book_id is not None:
        sql += " AND book_id = ?"
        params.append(book_id)
    if deck:
        sql += " AND deck = ?"
        params.append(deck)
    sql += " ORDER BY id DESC"
    return db.query(sql, params)


def create_flashcard(data: dict[str, Any]) -> dict[str, Any]:
    stamp = db.now()
    cur = db.execute(
        "INSERT INTO flashcards(book_id, front, back, source, page, deck, due, created_at, updated_at)"
        " VALUES(?,?,?,?,?,?,?,?,?)",
        (
            int(data["book_id"]) if data.get("book_id") else None,
            str(data.get("front") or ""),
            str(data.get("back") or ""),
            str(data.get("source") or ""),
            int(data.get("page") or 0),
            str(data.get("deck") or "Default"),
            db.now(),
            stamp,
            stamp,
        ),
    )
    row = db.query_one("SELECT * FROM flashcards WHERE id = ?", (cur.lastrowid,))
    return dict(row) if row else {}


def update_flashcard(card_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    fields = []
    params: list[Any] = []
    for key in ("front", "back", "source", "deck"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(str(data[key]))
    for key in ("ease", "interval", "reps", "lapses"):
        if key in data:
            fields.append(f"{key} = ?")
            params.append(float(data[key]) if key == "ease" else int(data[key]))
    if "due" in data:
        fields.append("due = ?")
        params.append(str(data["due"]))
    if not fields:
        row = db.query_one("SELECT * FROM flashcards WHERE id = ?", (card_id,))
        return dict(row) if row else None
    fields.append("updated_at = ?")
    params.append(db.now())
    params.append(card_id)
    db.execute(f"UPDATE flashcards SET {', '.join(fields)} WHERE id = ?", params)
    row = db.query_one("SELECT * FROM flashcards WHERE id = ?", (card_id,))
    return dict(row) if row else None


def delete_flashcard(card_id: int) -> None:
    db.execute("DELETE FROM flashcards WHERE id = ?", (card_id,))


def review_flashcard(card_id: int, quality: int) -> dict[str, Any] | None:
    """Algoritmo SM-2 semplificato per la ripetizione dilazionata."""
    card = db.query_one("SELECT * FROM flashcards WHERE id = ?", (card_id,))
    if not card:
        return None
    quality = max(0, min(int(quality), 5))
    ease = float(card["ease"])
    interval = int(card["interval"])
    reps = int(card["reps"])
    lapses = int(card["lapses"])

    if quality < 3:
        reps = 0
        interval = 1
        lapses += 1
        ease = max(1.3, ease - 0.2)
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = max(1, round(interval * ease))
        reps += 1
        ease = max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

    from datetime import datetime, timedelta, timezone

    due = (datetime.now(timezone.utc) + timedelta(days=interval)).isoformat(timespec="seconds")
    return update_flashcard(
        card_id,
        {"ease": round(ease, 3), "interval": interval, "reps": reps, "lapses": lapses, "due": due},
    )
