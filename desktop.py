#!/usr/bin/env python3
"""MyBooks — applicazione desktop (pywebview + backend Flask).

Avvia il server locale e apre la finestra nativa puntando all'interfaccia web.
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app  # noqa: E402
from backend.config import DATA_DIR, ensure_dirs  # noqa: E402


def find_free_port(preferred: int = 8770) -> int:
    for port in [preferred, *range(preferred + 1, preferred + 25)]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_server(port: int, timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.4)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.15)
    return False


class DesktopApi:
    """Ponte tra l'interfaccia web e il sistema operativo."""

    def __init__(self) -> None:
        self.window = None

    def choose_folder(self) -> str:
        if not self.window:
            return ""
        result = self.window.create_file_dialog(webview.FOLDER_DIALOG)
        if result:
            return str(result[0])
        return ""

    def choose_files(self) -> list[str]:
        if not self.window:
            return []
        result = self.window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=True,
            file_types=("Documenti (*.pdf;*.epub;*.docx;*.pptx;*.txt;*.md)",),
        )
        return [str(path) for path in result] if result else []

    def open_data_folder(self) -> str:
        path = str(DATA_DIR)
        try:
            if sys.platform.startswith("darwin"):
                os.system(f'open "{path}"')
            elif os.name == "nt":
                os.startfile(path)  # type: ignore[attr-defined]
            else:
                os.system(f'xdg-open "{path}" >/dev/null 2>&1 &')
        except Exception:
            pass
        return path


def main() -> int:
    ensure_dirs()
    import webview

    port = int(os.environ.get("MYBOOKS_PORT", "8770"))
    port = find_free_port(port)
    app = create_app()

    thread = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False),
        daemon=True,
    )
    thread.start()

    if not wait_for_server(port):
        print(f"MyBooks: il server non è partito sulla porta {port}", file=sys.stderr)
        return 1

    api = DesktopApi()
    window = webview.create_window(
        "MyBooks",
        url=f"http://127.0.0.1:{port}",
        js_api=api,
        width=1320,
        height=880,
        min_size=(920, 620),
        background_color="#f4eee3",
        text_select=True,
    )
    api.window = window
    webview.start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
