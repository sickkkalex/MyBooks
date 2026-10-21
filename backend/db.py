"""Accesso al database SQLite di MyBooks.

Lo schema viene creato automaticamente e migrato in modo incrementale
tramite `schema_version`.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable

from .config import DB_PATH, ensure_dirs

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS collections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT NOT NULL DEFAULT '#7B2233',
    icon        TEXT NOT NULL DEFAULT 'books',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    author         TEXT NOT NULL DEFAULT '',
    format         TEXT NOT NULL DEFAULT 'pdf',
    path           TEXT NOT NULL,
    cover          TEXT DEFAULT '',
    tags           TEXT NOT NULL DEFAULT '',
    collection_id  INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    state          TEXT NOT NULL DEFAULT 'unread',
    current_page   INTEGER NOT NULL DEFAULT 0,
    total_pages    INTEGER NOT NULL DEFAULT 0,
    progress       REAL NOT NULL DEFAULT 0,
    metadata       TEXT NOT NULL DEFAULT '{}',
    added_at       TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    last_opened    TEXT
);

CREATE TABLE IF NOT EXISTS annotations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    page        INTEGER NOT NULL DEFAULT 0,
    location    TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#E9C46A',
    rects       TEXT NOT NULL DEFAULT '[]',
    points      TEXT NOT NULL DEFAULT '[]',
    text        TEXT NOT NULL DEFAULT '',
    anchor      TEXT NOT NULL DEFAULT '{}',
    comment     TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER REFERENCES books(id) ON DELETE CASCADE,
    page        INTEGER NOT NULL DEFAULT 0,
    location    TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#F4EBDD',
    tags        TEXT NOT NULL DEFAULT '',
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page        INTEGER NOT NULL DEFAULT 0,
    location    TEXT NOT NULL DEFAULT '',
    label       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER REFERENCES books(id) ON DELETE CASCADE,
    chapter     TEXT NOT NULL DEFAULT '',
    topic       TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    reference   TEXT NOT NULL DEFAULT '',
    page        INTEGER NOT NULL DEFAULT 0,
    location    TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#F4EBDD',
    tags        TEXT NOT NULL DEFAULT '',
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flashcards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER REFERENCES books(id) ON DELETE CASCADE,
    front       TEXT NOT NULL DEFAULT '',
    back        TEXT NOT NULL DEFAULT '',
    source      TEXT NOT NULL DEFAULT '',
    page        INTEGER NOT NULL DEFAULT 0,
    deck        TEXT NOT NULL DEFAULT 'Default',
    ease        REAL NOT NULL DEFAULT 2.5,
    interval    INTEGER NOT NULL DEFAULT 0,
    reps        INTEGER NOT NULL DEFAULT 0,
    lapses      INTEGER NOT NULL DEFAULT 0,
    due         TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER REFERENCES books(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    seconds     INTEGER NOT NULL DEFAULT 0,
    pages       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_unique ON reading_sessions(book_id, day);
CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id, page);
CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id);
CREATE INDEX IF NOT EXISTS idx_study_notes_book ON study_notes(book_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_due ON flashcards(due);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5("
            "book_id UNINDEXED, kind UNINDEXED, ref UNINDEXED, title, body, tokenize='unicode61')"
        )
        conn.commit()
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def loads(value: Any, fallback: Any) -> Any:
    if not value:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def query(sql: str, params: Iterable[Any] = (), conn: sqlite3.Connection | None = None) -> list[dict]:
    owned = conn is None
    conn = conn or connect()
    try:
        cur = conn.execute(sql, tuple(params))
        return [dict(r) for r in cur.fetchall()]
    finally:
        if owned:
            conn.close()


def query_one(sql: str, params: Iterable[Any] = (), conn: sqlite3.Connection | None = None) -> dict | None:
    rows = query(sql, params, conn)
    return rows[0] if rows else None


def execute(sql: str, params: Iterable[Any] = (), conn: sqlite3.Connection | None = None):
    owned = conn is None
    conn = conn or connect()
    try:
        cur = conn.execute(sql, tuple(params))
        conn.commit()
        return cur
    finally:
        if owned:
            conn.close()


def get_setting(key: str, default: str = "") -> str:
    row = query_one("SELECT value FROM settings WHERE key = ?", (key,))
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
