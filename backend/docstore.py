"""Cache dei documenti aperti.

Mantiene in memoria i documenti attualmente in lettura per evitare di
riaprire (e rielaborare) PDF ed EPUB a ogni richiesta HTTP.
"""
from __future__ import annotations

import threading
from collections import OrderedDict
from pathlib import Path
from typing import Any

from .docs import BaseDocument, DocumentError, open_document


class DocumentStore:
    def __init__(self, max_items: int = 8):
        self._items: "OrderedDict[str, BaseDocument]" = OrderedDict()
        self._lock = threading.RLock()
        self._max_items = max_items

    def get(self, path: str | Path, fmt: str | None = None) -> BaseDocument:
        key = str(Path(path).resolve())
        with self._lock:
            doc = self._items.get(key)
            if doc is not None:
                self._items.move_to_end(key)
                return doc
            doc = open_document(key, fmt)
            self._items[key] = doc
            while len(self._items) > self._max_items:
                _, old = self._items.popitem(last=False)
                try:
                    old.close()
                except Exception:
                    pass
            return doc

    def invalidate(self, path: str | Path) -> None:
        key = str(Path(path).resolve())
        with self._lock:
            doc = self._items.pop(key, None)
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass

    def clear(self) -> None:
        with self._lock:
            for doc in self._items.values():
                try:
                    doc.close()
                except Exception:
                    pass
            self._items.clear()


store = DocumentStore()


def get_document(path: str | Path, fmt: str | None = None) -> BaseDocument:
    try:
        return store.get(path, fmt)
    except DocumentError:
        raise
    except Exception as exc:  # pragma: no cover
        raise DocumentError(str(exc)) from exc
