"""MyBooks - server Flask (API + hosting del frontend)."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory

from . import annotations as anno
from . import db, library, study
from .config import (
    BOOKS_DIR,
    COVERS_DIR,
    FRONTEND_DIR,
    MAX_UPLOAD_BYTES,
    SUPPORTED_FORMATS,
    ensure_dirs,
)
from .docstore import get_document, store
from .docs import DocumentError


def create_app() -> Flask:
    ensure_dirs()
    db.init_db()

    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
    app.config["JSON_SORT_KEYS"] = False

    # ------------------------------------------------------------ utils --
    def book_or_404(book_id: int) -> dict[str, Any] | None:
        return library.get_book(book_id)

    def json_error(message: str, status: int = 400):
        return jsonify({"error": message}), status

    # ---------------------------------------------------------- libreria --
    @app.get("/api/books")
    def api_books():
        collection = request.args.get("collection", type=int)
        state = request.args.get("state", "")
        search = request.args.get("q", "")
        sort = request.args.get("sort", "recent")
        return jsonify(
            {
                "books": library.list_books(
                    search=search,
                    collection_id=collection,
                    state=state,
                    sort=sort,
                )
            }
        )

    @app.post("/api/books/import")
    def api_import():
        uploaded = request.files.getlist("files")
        results: list[dict[str, Any]] = []
        errors: list[str] = []
        for item in uploaded:
            name = item.filename or "documento"
            suffix = Path(name).suffix.lower()
            if suffix not in SUPPORTED_FORMATS:
                errors.append(f"{name}: formato non supportato")
                continue
            target = BOOKS_DIR / Path(name).name
            if target.exists():
                target = BOOKS_DIR / f"{target.stem}-{os.urandom(3).hex()}{suffix}"
            item.save(target)
            try:
                book = library.import_book(target, copy=False)
                results.append(book)
            except DocumentError as exc:
                errors.append(f"{name}: {exc}")
                target.unlink(missing_ok=True)
        if not results and errors:
            return json_error("; ".join(errors), 422)
        return jsonify({"books": results, "errors": errors})

    @app.post("/api/books/scan")
    def api_scan():
        payload = request.get_json(silent=True) or {}
        folder = Path(payload.get("path") or "").expanduser()
        if not folder.is_dir():
            return json_error("Cartella non valida", 404)
        collection = payload.get("collection_id")
        added: list[dict] = []
        errors: list[str] = []
        known = {b["path"] for b in library.list_books()}
        for file in sorted(folder.rglob("*")):
            if not file.is_file() or file.suffix.lower() not in SUPPORTED_FORMATS:
                continue
            if str(file) in known:
                continue
            try:
                added.append(library.import_book(file, collection_id=collection))
            except DocumentError as exc:
                errors.append(f"{file.name}: {exc}")
        return jsonify({"books": added, "errors": errors})

    @app.get("/api/books/<int:book_id>")
    def api_book(book_id: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        return jsonify(book)

    @app.patch("/api/books/<int:book_id>")
    def api_update_book(book_id: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        data = request.get_json(silent=True) or {}
        fields = []
        params: list[Any] = []
        for key in ("title", "author"):
            if key in data:
                fields.append(f"{key} = ?")
                params.append(str(data[key]))
        if "tags" in data:
            tags = data["tags"]
            fields.append("tags = ?")
            params.append(",".join(tags) if isinstance(tags, list) else str(tags or ""))
        if "collection_id" in data:
            fields.append("collection_id = ?")
            params.append(int(data["collection_id"]) if data["collection_id"] else None)
        if "state" in data:
            fields.append("state = ?")
            params.append(str(data["state"]))
        if fields:
            fields.append("updated_at = ?")
            params.extend([db.now(), book_id])
            db.execute(f"UPDATE books SET {', '.join(fields)} WHERE id = ?", params)
        return jsonify(book_or_404(book_id))

    @app.delete("/api/books/<int:book_id>")
    def api_delete_book(book_id: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        library.delete_book(book_id)
        return jsonify({"ok": True})

    @app.get("/api/books/<int:book_id>/cover")
    def api_cover(book_id: int):
        book = book_or_404(book_id)
        if not book or not book.get("cover"):
            return json_error("Copertina non disponibile", 404)
        return send_from_directory(COVERS_DIR, book["cover"], max_age=86400)

    @app.get("/api/books/<int:book_id>/file")
    def api_file(book_id: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        path = Path(book["path"])
        if not path.exists():
            return json_error("File non trovato", 404)
        return send_from_directory(path.parent, path.name, as_attachment=True)

    @app.post("/api/books/<int:book_id>/progress")
    def api_progress(book_id: int):
        data = request.get_json(silent=True) or {}
        total = int(data.get("total") or 0)
        if not total:
            book = book_or_404(book_id)
            total = int((book or {}).get("total_pages") or 1)
        library.update_progress(book_id, int(data.get("page") or 0), total)
        return jsonify(book_or_404(book_id))

    # ------------------------------------------------------------ reader --
    @app.get("/api/books/<int:book_id>/document")
    def api_document(book_id: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        try:
            doc = get_document(book["path"], book["format"])
        except DocumentError as exc:
            return json_error(str(exc), 422)
        outline = doc.outline()
        payload = {
            "id": book["id"],
            "title": book["title"],
            "format": book["format"],
            "is_fixed": doc.is_fixed_layout,
            "page_count": doc.page_count,
            "outline": outline,
            "metadata": book.get("metadata") or {},
        }
        if doc.is_fixed_layout:
            sizes = []
            for index in range(doc.page_count):
                sizes.append(doc.page_size(index))
            payload["pages"] = sizes
        else:
            chapters = doc.chapters()
            payload["chapters"] = [
                {"index": i, "title": ch.title, "length": len(ch.text)}
                for i, ch in enumerate(chapters)
            ]
        return jsonify(payload)

    @app.get("/api/books/<int:book_id>/page/<int:page>")
    def api_page(book_id: int, page: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        zoom = max(0.3, min(float(request.args.get("zoom", 1.6)), 4.0))
        try:
            doc = get_document(book["path"], book["format"])
            payload = doc.page_image(page, zoom)
        except DocumentError as exc:
            return json_error(str(exc), 422)
        response = Response(payload, mimetype="image/png")
        response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    @app.get("/api/books/<int:book_id>/thumbnail/<int:page>")
    def api_thumbnail(book_id: int, page: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        try:
            doc = get_document(book["path"], book["format"])
            if hasattr(doc, "page_thumbnail"):
                payload = doc.page_thumbnail(page, 240)
            else:
                payload = doc.page_image(page, 0.5)
        except DocumentError as exc:
            return json_error(str(exc), 422)
        response = Response(payload, mimetype="image/jpeg")
        response.headers["Cache-Control"] = "public, max-age=86400"
        return response

    @app.get("/api/books/<int:book_id>/text/<int:page>")
    def api_text_layer(book_id: int, page: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        try:
            doc = get_document(book["path"], book["format"])
            lines = doc.text_layer(page)
        except DocumentError as exc:
            return json_error(str(exc), 422)
        return jsonify({"lines": lines})

    @app.get("/api/books/<int:book_id>/chapter/<int:index>")
    def api_chapter(book_id: int, index: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        try:
            doc = get_document(book["path"], book["format"])
            chapters = doc.chapters()
        except DocumentError as exc:
            return json_error(str(exc), 422)
        if index < 0 or index >= len(chapters):
            return json_error("Capitolo non trovato", 404)
        chapter = chapters[index]
        return jsonify({"title": chapter.title, "html": chapter.html, "index": index})

    @app.get("/api/books/<int:book_id>/chapter/<int:index>/text")
    def api_chapter_text(book_id: int, index: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        try:
            doc = get_document(book["path"], book["format"])
            chapters = doc.chapters()
        except DocumentError as exc:
            return json_error(str(exc), 422)
        if index < 0 or index >= len(chapters):
            return json_error("Capitolo non trovato", 404)
        return jsonify({"text": chapters[index].text})

    @app.get("/api/books/<int:book_id>/outline")
    def api_outline(book_id: int):
        book = book_or_404(book_id)
        if not book:
            return json_error("Libro non trovato", 404)
        try:
            doc = get_document(book["path"], book["format"])
            return jsonify({"outline": doc.outline()})
        except DocumentError as exc:
            return json_error(str(exc), 422)

    # ------------------------------------------------------- annotazioni --
    @app.get("/api/books/<int:book_id>/annotations")
    def api_annotations(book_id: int):
        page = request.args.get("page", type=int)
        return jsonify({"annotations": anno.list_annotations(book_id, page)})

    @app.post("/api/books/<int:book_id>/annotations")
    def api_create_annotation(book_id: int):
        data = request.get_json(silent=True) or {}
        data["book_id"] = book_id
        if not data.get("type"):
            return json_error("Tipo di annotazione mancante")
        if data["type"] not in anno.ANNOTATION_TYPES:
            return json_error("Tipo di annotazione non valido")
        return jsonify(anno.create_annotation(data)), 201

    @app.patch("/api/annotations/<int:annotation_id>")
    def api_update_annotation(annotation_id: int):
        data = request.get_json(silent=True) or {}
        updated = anno.update_annotation(annotation_id, data)
        if not updated:
            return json_error("Annotazione non trovata", 404)
        return jsonify(updated)

    @app.delete("/api/annotations/<int:annotation_id>")
    def api_delete_annotation(annotation_id: int):
        anno.delete_annotation(annotation_id)
        return jsonify({"ok": True})

    @app.post("/api/books/<int:book_id>/annotations/clear")
    def api_clear_annotations(book_id: int):
        page = request.args.get("page", type=int)
        items = anno.list_annotations(book_id, page)
        for item in items:
            anno.delete_annotation(item["id"])
        return jsonify({"removed": len(items)})

    # -------------------------------------------------------------- note --
    @app.get("/api/notes")
    def api_notes():
        book_id = request.args.get("book_id", type=int)
        search = request.args.get("q", "")
        return jsonify({"notes": anno.list_notes(book_id, search)})

    @app.post("/api/notes")
    def api_create_note():
        data = request.get_json(silent=True) or {}
        return jsonify(anno.create_note(data)), 201

    @app.patch("/api/notes/<int:note_id>")
    def api_update_note(note_id: int):
        data = request.get_json(silent=True) or {}
        updated = anno.update_note(note_id, data)
        if not updated:
            return json_error("Nota non trovata", 404)
        return jsonify(updated)

    @app.delete("/api/notes/<int:note_id>")
    def api_delete_note(note_id: int):
        anno.delete_note(note_id)
        return jsonify({"ok": True})

    # ------------------------------------------------------- segnalibri ---
    @app.get("/api/books/<int:book_id>/bookmarks")
    def api_bookmarks(book_id: int):
        return jsonify({"bookmarks": anno.list_bookmarks(book_id)})

    @app.post("/api/books/<int:book_id>/bookmarks")
    def api_create_bookmark(book_id: int):
        data = request.get_json(silent=True) or {}
        data["book_id"] = book_id
        return jsonify(anno.create_bookmark(data)), 201

    @app.delete("/api/bookmarks/<int:bookmark_id>")
    def api_delete_bookmark(bookmark_id: int):
        anno.delete_bookmark(bookmark_id)
        return jsonify({"ok": True})

    # -------------------------------------------------------- flashcard ---
    @app.get("/api/flashcards")
    def api_flashcards():
        book_id = request.args.get("book_id", type=int)
        deck = request.args.get("deck", "")
        return jsonify({"cards": anno.list_flashcards(book_id, deck)})

    @app.post("/api/flashcards")
    def api_create_flashcard():
        data = request.get_json(silent=True) or {}
        return jsonify(anno.create_flashcard(data)), 201

    @app.patch("/api/flashcards/<int:card_id>")
    def api_update_flashcard(card_id: int):
        data = request.get_json(silent=True) or {}
        updated = anno.update_flashcard(card_id, data)
        if not updated:
            return json_error("Scheda non trovata", 404)
        return jsonify(updated)

    @app.delete("/api/flashcards/<int:card_id>")
    def api_delete_flashcard(card_id: int):
        anno.delete_flashcard(card_id)
        return jsonify({"ok": True})

    @app.post("/api/flashcards/<int:card_id>/review")
    def api_review_flashcard(card_id: int):
        data = request.get_json(silent=True) or {}
        updated = anno.review_flashcard(card_id, int(data.get("quality", 3)))
        if not updated:
            return json_error("Scheda non trovata", 404)
        return jsonify(updated)

    # ------------------------------------------------------ collezioni ----
    @app.get("/api/collections")
    def api_collections():
        return jsonify({"collections": db.query("SELECT * FROM collections ORDER BY name")})

    @app.post("/api/collections")
    def api_create_collection():
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return json_error("Nome mancante")
        try:
            cur = db.execute(
                "INSERT INTO collections(name, color, icon, created_at) VALUES(?,?,?,?)",
                (name, data.get("color") or "#7B2233", data.get("icon") or "books", db.now()),
            )
        except Exception:
            return json_error("Collezione già esistente", 409)
        row = db.query_one("SELECT * FROM collections WHERE id = ?", (cur.lastrowid,))
        return jsonify(row), 201

    @app.patch("/api/collections/<int:collection_id>")
    def api_update_collection(collection_id: int):
        data = request.get_json(silent=True) or {}
        fields = []
        params: list[Any] = []
        for key in ("name", "color", "icon"):
            if key in data:
                fields.append(f"{key} = ?")
                params.append(str(data[key]))
        if fields:
            params.append(collection_id)
            db.execute(f"UPDATE collections SET {', '.join(fields)} WHERE id = ?", params)
        row = db.query_one("SELECT * FROM collections WHERE id = ?", (collection_id,))
        return jsonify(row or {})

    @app.delete("/api/collections/<int:collection_id>")
    def api_delete_collection(collection_id: int):
        db.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
        return jsonify({"ok": True})

    # --------------------------------------------------------- appunti --
    @app.get("/api/study-notes")
    def api_study_notes():
        book_id = request.args.get("book_id", type=int)
        search = request.args.get("q", "")
        return jsonify({"notes": study.list_notes(book_id, search)})

    @app.post("/api/study-notes")
    def api_create_study_note():
        data = request.get_json(silent=True) or {}
        return jsonify(study.create_note(data)), 201

    @app.patch("/api/study-notes/<int:note_id>")
    def api_update_study_note(note_id: int):
        data = request.get_json(silent=True) or {}
        updated = study.update_note(note_id, data)
        if not updated:
            return json_error("Appunto non trovato", 404)
        return jsonify(updated)

    @app.delete("/api/study-notes/<int:note_id>")
    def api_delete_study_note(note_id: int):
        study.delete_note(note_id)
        return jsonify({"ok": True})

    @app.get("/api/study-notes/link")
    def api_build_link():
        book_id = int(request.args.get("book_id") or 0)
        page = int(request.args.get("page") or 0)
        chapter = request.args.get("chapter", type=int)
        return jsonify({"link": study.build_link(book_id, page, chapter)})

    # ---------------------------------------------------------- ricerca ---
    @app.get("/api/search")
    def api_search():
        query = (request.args.get("q") or "").strip()
        if not query:
            return jsonify({"books": [], "notes": [], "annotations": [], "passages": []})
        like = f"%{query}%"
        books = library.list_books(search=query)
        notes = anno.list_notes(search=query)
        annotations = db.query(
            "SELECT a.*, b.title AS book_title FROM annotations a"
            " JOIN books b ON b.id = a.book_id"
            " WHERE a.text LIKE ? OR a.comment LIKE ? ORDER BY a.id DESC LIMIT 60",
            (like, like),
        )
        passages = db.query(
            "SELECT book_id, ref, body FROM search_fts WHERE body LIKE ? LIMIT 40", (like,)
        )
        for passage in passages:
            body = passage["body"] or ""
            index = body.lower().find(query.lower())
            if index >= 0:
                start = max(0, index - 90)
                end = min(len(body), index + len(query) + 130)
                passage["snippet"] = ("…" if start else "") + body[start:end].replace("\n", " ") + ("…" if end < len(body) else "")
            else:
                passage["snippet"] = body[:200]
        appunti = study.list_notes(search=query)
        return jsonify(
            {
                "books": books,
                "notes": notes,
                "annotations": annotations,
                "passages": passages,
                "appunti": appunti,
            }
        )

    # --------------------------------------------------------- impostazioni
    @app.get("/api/settings")
    def api_get_settings():
        rows = db.query("SELECT key, value FROM settings")
        return jsonify({r["key"]: r["value"] for r in rows})

    @app.put("/api/settings")
    def api_put_settings():
        data = request.get_json(silent=True) or {}
        for key, value in data.items():
            db.set_setting(str(key), str(value))
        return jsonify({"ok": True})

    @app.get("/api/stats")
    def api_stats():
        books = db.query_one("SELECT COUNT(*) AS total FROM books") or {"total": 0}
        notes = db.query_one("SELECT COUNT(*) AS total FROM notes") or {"total": 0}
        highlights = db.query_one(
            "SELECT COUNT(*) AS total FROM annotations WHERE type IN ('highlight','underline')"
        ) or {"total": 0}
        minutes = db.query_one(
            "SELECT COALESCE(SUM(seconds),0) AS s FROM reading_sessions"
        ) or {"s": 0}
        pages = db.query_one(
            "SELECT COALESCE(SUM(pages),0) AS p FROM reading_sessions"
        ) or {"p": 0}
        finished = db.query_one("SELECT COUNT(*) AS total FROM books WHERE state = 'finished'") or {
            "total": 0
        }
        week = db.query(
            "SELECT day, SUM(seconds) AS seconds FROM reading_sessions"
            " GROUP BY day ORDER BY day DESC LIMIT 30"
        )
        return jsonify(
            {
                "books": books["total"],
                "notes": notes["total"],
                "highlights": highlights["total"],
                "minutes": round(int(minutes["s"]) / 60),
                "pages": int(pages["p"]),
                "finished": finished["total"],
                "history": list(reversed(week)),
            }
        )

    @app.post("/api/session")
    def api_session():
        data = request.get_json(silent=True) or {}
        library.record_session(
            int(data.get("book_id") or 0), int(data.get("seconds") or 0), int(data.get("pages") or 0)
        )
        return jsonify({"ok": True})

    # --------------------------------------------------------- export ---
    @app.get("/api/export")
    def api_export():
        """Esporta note ed evidenziazioni in JSON o Markdown."""
        fmt = (request.args.get("format") or "markdown").lower()
        rows = db.query(
            "SELECT a.*, b.title AS book_title, b.author AS book_author"
            " FROM annotations a JOIN books b ON b.id = a.book_id"
            " WHERE a.type IN ('highlight','underline','strikeout') ORDER BY b.title, a.page"
        )
        notes = db.query(
            "SELECT n.*, b.title AS book_title FROM notes n"
            " LEFT JOIN books b ON b.id = n.book_id ORDER BY n.updated_at DESC"
        )
        if fmt == "json":
            payload = json.dumps({"notes": notes, "annotations": rows}, ensure_ascii=False, indent=2)
            response = Response(payload, mimetype="application/json")
            response.headers["Content-Disposition"] = 'attachment; filename="mybooks-export.json"'
            return response

        lines = ["# MyBooks — appunti ed evidenziazioni", ""]
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            grouped.setdefault(row["book_title"] or "Senza libro", []).append(row)
        for title, items in grouped.items():
            lines.append(f"## {title}")
            lines.append("")
            for item in items:
                quote = (item.get("text") or "").strip().replace("\n", " ")
                marker = {"highlight": "Evidenzia", "underline": "Sottolinea", "strikeout": "Barrato"}.get(
                    item["type"], "Evidenzia"
                )
                lines.append(f"- **[p. {int(item.get('page') or 0) + 1}]** {marker}: {quote}")
                if item.get("comment"):
                    lines.append(f"  - _{item['comment']}_")
            lines.append("")
        if notes:
            lines.append("## Note")
            lines.append("")
            for note in notes:
                lines.append(f"### {note.get('title') or 'Senza titolo'}")
                lines.append("")
                lines.append(note.get("body") or "")
                lines.append("")
        payload = "\n".join(lines)
        response = Response(payload, mimetype="text/markdown; charset=utf-8")
        response.headers["Content-Disposition"] = 'attachment; filename="mybooks-appunti.md"'
        return response

    # ---------------------------------------------------------- frontend --
    @app.get("/")
    def index():
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.get("/<path:filename>")
    def static_files(filename: str):
        target = FRONTEND_DIR / filename
        if target.is_file():
            return send_from_directory(FRONTEND_DIR, filename)
        return send_from_directory(FRONTEND_DIR, "index.html")

    @app.errorhandler(413)
    def too_large(_error):
        return json_error("File troppo grande", 413)

    @app.errorhandler(DocumentError)
    def document_error(exc: DocumentError):
        return json_error(str(exc), 422)

    @app.teardown_appcontext
    def _shutdown(_exc):  # pragma: no cover
        return None

    return app


app = create_app()


if __name__ == "__main__":  # pragma: no cover
    port = int(os.environ.get("MYBOOKS_PORT", "8770"))
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
