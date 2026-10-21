#!/usr/bin/env python3
"""MyBooks — server locale (per uso nel browser o come backend remoto).

    python run.py --port 8770
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="MyBooks server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("MYBOOKS_PORT", "8770")))
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    app = create_app()
    print(f"MyBooks in ascolto su http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=args.debug, threaded=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
