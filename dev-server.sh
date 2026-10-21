#!/usr/bin/env bash
# Riavvia il server MyBooks di sviluppo in background.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="/tmp/opencode/mybooks.pid"
LOG="/tmp/opencode/mybooks.log"
PORT="${MYBOOKS_PORT:-8770}"

if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null || true)
  if [ -n "${OLD:-}" ] && kill -0 "$OLD" 2>/dev/null; then
    kill "$OLD" 2>/dev/null || true
    sleep 1
  fi
fi

cd "$ROOT"
setsid nohup "$ROOT/venv/bin/python" run.py --port "$PORT" > "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDFILE"
sleep 3
if curl -s -o /dev/null "http://127.0.0.1:${PORT}/api/books"; then
  echo "MyBooks attivo su http://127.0.0.1:${PORT} (pid $(cat $PIDFILE))"
else
  echo "Avvio non riuscito — log:"; tail -30 "$LOG"; exit 1
fi
