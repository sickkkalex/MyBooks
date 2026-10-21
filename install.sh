#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  MyBooks — installazione come app desktop (Linux)
#
#  Installa l'eseguibile in ~/.local/bin, la voce nel menu applicazioni
#  e l'icona, quindi prepara la cartella dati dell'utente.
#
#      ./install.sh              # installa
#      ./install.sh --uninstall  # rimuove
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_NAME="MyBooks"
BIN_NAME="mybooks"
VERSION="1.0.0"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICONS_DIR="$HOME/.local/share/icons/hicolor"
DATA_DIR="${MYBOOKS_DATA_DIR:-$HOME/.local/share/MyBooks}"
SOURCE_BIN="$ROOT/dist/$APP_NAME"

info()  { printf '\033[1;35m▸\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; exit 1; }

uninstall() {
  info "Rimozione di $APP_NAME…"
  rm -f "$BIN_DIR/$BIN_NAME" "$APPS_DIR/$BIN_NAME.desktop"
  rm -f "$ICONS_DIR/scalable/apps/$BIN_NAME.svg" "$ICONS_DIR/256x256/apps/$BIN_NAME.png"
  command -v update-desktop-database >/dev/null && update-desktop-database "$APPS_DIR" || true
  command -v gtk-update-icon-cache  >/dev/null && gtk-update-icon-cache -f -t "$ICONS_DIR" >/dev/null 2>&1 || true
  ok "Applicazione rimossa. I tuoi dati restano in $DATA_DIR"
  exit 0
}

[ "${1:-}" = "--uninstall" ] && uninstall

# ── 1. eseguibile ────────────────────────────────────────────────────────────
if [ -f "$SOURCE_BIN" ]; then
  info "Installazione dell'eseguibile in $BIN_DIR"
  mkdir -p "$BIN_DIR"
  install -m 755 "$SOURCE_BIN" "$BIN_DIR/$BIN_NAME"
elif [ -f "$BIN_DIR/$BIN_NAME" ]; then
  warn " Eseguibile già presente, lo riutilizzo"
else
  fail "dist/$APP_NAME non trovato. Generalo prima con: venv/bin/pyinstaller main.spec --noconfirm"
fi

# ── 2. icona ─────────────────────────────────────────────────────────────────
info "Installazione dell'icona"
mkdir -p "$ICONS_DIR/scalable/apps" "$ICONS_DIR/256x256/apps"
install -m 644 "$ROOT/frontend/public/logo.svg" "$ICONS_DIR/scalable/apps/$BIN_NAME.svg"
[ -f "$ROOT/frontend/public/icon.png" ] && install -m 644 "$ROOT/frontend/public/icon.png" "$ICONS_DIR/256x256/apps/$BIN_NAME.png"

# ── 3. voce nel menu applicazioni ───────────────────────────────────────────
info "Creazione della voce nel menu applicazioni"
mkdir -p "$APPS_DIR"
cat > "$APPS_DIR/$BIN_NAME.desktop" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=$APP_NAME
GenericName=Libreria e annotazioni
Comment=Leggi, annota e studia PDF, EPUB e documenti universitari
Exec=$BIN_DIR/$BIN_NAME
Icon=$BIN_NAME
Terminal=false
Categories=Education;
Keywords=pdf;epub;ebook;reader;viewer;notes;study;annotations;university;office;
MimeType=application/pdf;application/epub+zip;application/x-mobipocket-ebook;text/plain;text/markdown;application/vnd.openxmlformats-officedocument.wordprocessingml.document;application/vnd.openxmlformats-officedocument.presentationml.presentation;
StartupNotify=true
StartupWMClass=$APP_NAME
DESKTOP
chmod 644 "$APPS_DIR/$BIN_NAME.desktop"

# ── 4. cartella dati ────────────────────────────────────────────────────────
info "Preparazione della libreria in $DATA_DIR"
mkdir -p "$DATA_DIR/books" "$DATA_DIR/covers"

# ── 5. cache icone e menu ───────────────────────────────────────────────────
command -v update-desktop-database >/dev/null && update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
command -v gtk-update-icon-cache  >/dev/null && gtk-update-icon-cache -f -t "$ICONS_DIR" >/dev/null 2>&1 || true

ok "$APP_NAME $VERSION installato"
echo
echo "  Avvio:            $BIN_NAME            (oppure dalla lista applicazioni)"
echo "  Applicazioni:     cerca «MyBooks» nel menu"
echo "  Libreria:         $DATA_DIR"
echo "  Aggiornamento:    git pull && venv/bin/pyinstaller main.spec --noconfirm && ./install.sh"
