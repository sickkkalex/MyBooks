<div align="center">

<img src="frontend/public/logo.svg" alt="MyBooks Logo" width="110" />

# MyBooks

**La tua libreria per leggere, annotare e studiare. Locale, elegante, sempre con te.**

[![Python](https://img.shields.io/badge/Python-3.11+-3178C6?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![PyMuPDF](https://img.shields.io/badge/PyMuPDF-1.24-FFD43B?style=flat-square&logo=python&logoColor=white)](https://pymupdf.readthedocs.io/)
[![pywebview](https://img.shields.io/badge/pywebview-5.0-8C4BFF?style=flat-square&logo=pywebview&logoColor=white)](https://pywebview.flowrl.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?style=flat-square&logo=javascript&logoColor=white)](https://developer.mozilla.org/)
[![Playwright](https://img.shields.io/badge/tests-Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white)](https://playwright.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[Demo](#) · [Segnala un Bug](issues) · [Richiedi una Feature](issues)

</div>

---

## ✨ Panoramica

**MyBooks** è una libreria digitale full-stack per materiale universitario: importi PDF, EPUB e documenti, li leggi con un'interfaccia in stile Apple Books, li annoti scrivendoci sopra, sottolineando, evidenziando e fissando post-it, e ne ricavi appunti e schede di studio pronti per il ripasso. Backend Python, frontend HTML/CSS/JS, tutto in locale.

> 🏠 **Niente account, niente cloud.** I tuoi documenti, le tue annotazioni e i tuoi appunti restano sul tuo computer.

---

## 🚀 Funzionalità

| Funzionalità | Descrizione |
|---|---|
| 📚 **Libreria multi-formato** | Import di PDF, EPUB, DOCX, PPTX, TXT, MD e HTML via drag & drop, selettore file o indicizzazione di una cartella |
| 🖼️ **Copertine automatiche** | Ritaglio dei margini bianchi per i PDF, lettura della copertina dall'OPF per gli EPUB, generazione bordeaux/beige per i formati senza copertina |
| ✍️ **Evidenziatore & sottolineatura** | Selezione del testo perfettamente allineata al PDF (layer di testo invisibile con font metricamente compatibili) |
| 🖊️ **Penna a mano libera** | Scrittura libera sul documento con 3 spessori, colore e gomma, in coordinate indipendenti dallo zoom |
| 📌 **Post-it & forme** | Post-it con testo, rettangoli, ellissi, linee, caselle di testo modificabili e commenti su ogni annotazione |
| 📝 **Sezione Appunti** | Appunti per **capitolo** e **argomento**, con il brano di testo o il collegamento a quella porzione del libro |
| 🔗 **Collegamenti profondi** | `mybooks://libro/12?pagina=34` per puntare a una pagina esatta; `#libro/12/34` apre il libro dal browser |
| 🧠 **Ripetizione dilazionata** | Schede di studio con algoritmo SM-2, creabili con un click da un'evidenziazione |
| 🔍 **Ricerca full-text** | Motore FTS5 su titoli, note, annotazioni, appunti e **testo interno dei documenti** |
| 📖 **Impaginazione a colonne** | E-book con scorrimento orizzontale pagina per pagina, indice e temi pagina |
| 🎨 **Tema chiaro e scuro** | Interfaccia bordeaux/beige/bianco ispirata a macOS, con animazioni e transizioni fluide |
| ✒️ **Tipografia regolabile** | Dimensione, carattere (serif/sans/mono), interlinea e aspetto pagina (bianco/beige/notte) |
| 📊 **Statistiche di studio** | Libri, evidenziazioni, note, minuti di studio e grafico giornaliero |
| ↩️ **Undo / Redo** | Storia completa delle annotazioni con scorciatoie `⌘Z` e `⇧⌘Z` |
| 💾 **Pacchetto standalone** | Compilazione in un unico eseguibile con PyInstaller |
| ⌨️ **Scorciatoie** | 10 combinazioni per strumenti, navigazione, ricerca e importazione |

---

## 🛠️ Stack Tecnologico

### Frontend
```
HTML5 + CSS3 (custom properties, glassmorphism, animazioni spring)
JavaScript ES6 vanilla — zero build step, zero dipendenze
Canvas API (inchiostro) · iframe con impaginazione a colonne
pywebview (ponte nativo per i dialog di sistema)
```

### Backend
```
Python 3.11+ · Flask 3 (API REST + hosting del frontend)
SQLite 3 con WAL e indice FTS5 (ricerca full-text)
PyMuPDF (render PDF, layer di testo, indice) · ebooklib (EPUB)
python-docx · python-pptx · Pillow (copertine)
```

### Infrastruttura
```
pywebview — finestra desktop nativa (Linux/macOS/Windows)
PyInstaller — pacchetto standalone `dist/MyBooks`
Flask dev server — modalità browser per lo sviluppo
```

---

## 🏗️ Architettura

```
Books/
├── backend/                    # API Python (Flask)
│   ├── app.py                  # 50 route: libreria, lettore, annotazioni, studio, export
│   ├── db.py                   # schema SQLite + FTS5
│   ├── library.py              # import, metadati, copertine, progressione
│   ├── annotations.py          # annotazioni, note, segnalibri, flashcard (SM-2)
│   ├── study.py                # appunti di studio + collegamenti profondi
│   ├── docstore.py             # cache dei documenti aperti
│   ├── config.py               # percorsi e costanti
│   └── docs/                   # gestori per formato
│       ├── base.py             # interfaccia comune
│       ├── pdf.py              # rendering, layer di testo, indice
│       ├── epub.py             # capitoli, indice, immagini, copertina
│       ├── office.py           # DOCX e PPTX
│       └── plain.py            # TXT / MD / HTML
├── frontend/                   # interfaccia (vanilla JS, zero build)
│   ├── index.html              # shell dell'applicazione
│   ├── public/logo.svg         # logo
│   ├── css/
│   │   ├── theme.css           # token, colori, animazioni, modali
│   │   ├── library.css         # griglia, schede, lista, statistiche
│   │   ├── reader.css          # lettore, toolbox, annotazioni, pannelli
│   │   └── study.css           # note, appunti, schede, revisione
│   └── js/
│       ├── api.js              # client HTTP
│       ├── utils.js            # helper DOM e formattazione
│       ├── ui.js               # modali, toast, conferme
│       ├── store.js            # stato applicativo + bus eventi
│       ├── library.js          # vista libreria
│       ├── notes.js            # sezione note
│       ├── appunti.js          # sezione appunti
│       ├── flashcards.js       # schede e ripetizione dilazionata
│       ├── search.js           # ricerca globale
│       ├── pdfview.js          # rendering PDF + strumenti annotazione
│       ├── reflow.js           # lettore a colonne (EPUB/DOCX/PPTX)
│       ├── reader.js           # controller del lettore
│       └── app.js              # routing e avvio
├── desktop.py                  # app desktop (pywebview + Flask in background)
├── run.py                      # solo server, per il browser
├── main.spec                   # pacchetto PyInstaller
├── install.sh                  # installazione come app desktop (Linux)
├── make_samples.py             # genera PDF/EPUB di prova
├── tests/                      # suite end-to-end Playwright
└── data/                       # runtime: database, libri, copertine
```

---

## 📊 Schema Database

```sql
CREATE TABLE books (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    author        TEXT NOT NULL DEFAULT '',
    format        TEXT NOT NULL DEFAULT 'pdf',   -- pdf | epub | docx | pptx | txt
    path          TEXT NOT NULL,
    cover         TEXT DEFAULT '',
    tags          TEXT NOT NULL DEFAULT '',
    collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    state         TEXT NOT NULL DEFAULT 'unread', -- unread | reading | finished
    current_page  INTEGER NOT NULL DEFAULT 0,
    total_pages   INTEGER NOT NULL DEFAULT 0,
    progress      REAL NOT NULL DEFAULT 0,
    metadata      TEXT NOT NULL DEFAULT '{}',
    added_at      TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    last_opened   TEXT
);

CREATE TABLE annotations (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id   INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    type      TEXT NOT NULL,   -- highlight | underline | strikeout | square
                             -- | circle | ink | text | postit
    page      INTEGER NOT NULL DEFAULT 0,
    color     TEXT NOT NULL DEFAULT '#E9C46A',
    rects     TEXT NOT NULL DEFAULT '[]',  -- bounding box in punti PDF
    points    TEXT NOT NULL DEFAULT '[]',  -- tracciato della penna
    text      TEXT NOT NULL DEFAULT '',    -- testo selezionato
    anchor    TEXT NOT NULL DEFAULT '{}',  -- offset nel capitolo (e-book)
    comment   TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE study_notes (        -- Appunti: capitolo + argomento
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id   INTEGER REFERENCES books(id) ON DELETE CASCADE,
    chapter   TEXT NOT NULL DEFAULT '',
    topic     TEXT NOT NULL DEFAULT '',
    title     TEXT NOT NULL DEFAULT '',
    body      TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',   -- brano, link o mybooks://
    page      INTEGER NOT NULL DEFAULT 0,
    color     TEXT NOT NULL DEFAULT '#F4EBDD',
    tags      TEXT NOT NULL DEFAULT '',
    pinned    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE notes ( ... );     -- note per libro e note personali
CREATE TABLE bookmarks ( ... );  -- segnalibri
CREATE TABLE flashcards ( ... ); -- schede SM-2: ease, interval, reps, due
CREATE TABLE collections ( ... );
CREATE TABLE reading_sessions ( ... );  -- minuti di studio per giorno
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT );
CREATE VIRTUAL TABLE search_fts USING fts5(
    book_id UNINDEXED, kind UNINDEXED, ref UNINDEXED, title, body
);
```

---

## ⚡ Avvio Rapido

### Prerequisiti
- [Python 3.11+](https://www.python.org/downloads/)
- Un display per la modalità desktop (opzionale: si può usare nel browser)

### 1. Clona il repository

```bash
git clone https://github.com/sickkkalex/MyBooks.git
cd MyBooks
```

### 2. Prepara l'ambiente

```bash
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

### 3. Avvia l'app desktop

```bash
venv/bin/python desktop.py
```

Si apre la finestra nativa con la libreria vuota. Il server locale si avvia automaticamente su una porta libera.

### 4. Oppure: modalità browser (sviluppo)

```bash
venv/bin/python run.py --port 8770
```

Apri [http://127.0.0.1:8770](http://127.0.0.1:8770) nel browser.

> 🔁 **Prova subito:** genera documenti di prova (PDF + EPUB con copertina) con
> ```bash
> venv/bin/python make_samples.py
> ```
> e importali con **Importa libri** oppure trascinandoli nella finestra.

### 5. Installazione come app desktop (Linux)

```bash
venv/bin/pip install pyinstaller
venv/bin/pyinstaller main.spec --noconfirm   # → dist/MyBooks
./install.sh                                  # installa e crea la voce nel menu
```

Lo script `install.sh` si occupa di tutto:

| Cosa | Dove |
|---|---|
| Eseguibile | `~/.local/bin/mybooks` |
| Voce nel menu applicazioni | `~/.local/share/applications/mybooks.desktop` |
| Icona (SVG + PNG 256px) | `~/.local/share/icons/hicolor/` |
| Libreria e database | `~/.local/share/MyBooks` |

Dopo l'installazione **MyBooks** compare nel menu applicazioni (categoria *Istruzione*)
e si avvia con `mybooks` da terminale. Per rimuoverlo:

```bash
./install.sh --uninstall
```

> 💡 I dati dell'app compilata stanno in `~/.local/share/MyBooks`, **fuori** dal pacchetto:
> re-installare o ricompilare non fa perdere nulla.

### 6. Test end-to-end

```bash
venv/bin/pip install playwright
venv/bin/python make_samples.py
./dev-server.sh                    # server in background
venv/bin/python tests/smoke.py     # libreria, lettore PDF ed EPUB
venv/bin/python tests/test_annotate.py
venv/bin/python tests/test_appunti.py
venv/bin/python tests/test_settings.py
venv/bin/python tests/test_study.py
venv/bin/python tests/test_progress.py
venv/bin/python tests/gallery.py   # screenshot di tutte le viste
```

---

## ⚙️ Variabili d'Ambiente

| Variabile | Default | Descrizione |
|---|---|---|
| `MYBOOKS_PORT` | `8770` | Porta del server locale |
| `MYBOOKS_DATA_DIR` | `./data` | Cartella di database, libri importati e copertine |
| `MYBOOKS_FRONTEND_DIR` | `./frontend` | Percorso dell'interfaccia web |

```bash
# Esempio: libreria su un disco esterno
MYBOOKS_DATA_DIR=/mnt/disco/MyBooks venv/bin/python desktop.py
```

> **Nota:** tutto ciò che non viene escluso da `.gitignore` finisce nel repository.
> `data/`, `venv/`, `build/`, `dist/` e `samples/` sono già esclusi.

---

## 📡 API Reference

Tutte le risposte sono JSON. Il backend è locale e non espone dati di autenticazione.

### Libreria
| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/api/books` | Lista i libri (filtri `q`, `state`, `collection`, `sort`) |
| `POST` | `/api/books/import` | Importa file (multipart) |
| `POST` | `/api/books/scan` | Indicizza una cartella |
| `GET` | `/api/books/:id` | Dettagli di un libro |
| `PATCH` | `/api/books/:id` | Modifica titolo, autore, tag, collezione, stato |
| `DELETE` | `/api/books/:id` | Elimina libro e annotazioni |
| `GET` | `/api/books/:id/cover` | Copertina (JPEG) |
| `GET` | `/api/books/:id/file` | File originale |
| `POST` | `/api/books/:id/progress` | Salva la posizione di lettura |

### Lettore
| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/api/books/:id/document` | Metadati, indice, pagine o capitoli |
| `GET` | `/api/books/:id/page/:n` | Pagina renderizzata (PNG, `?zoom=`) |
| `GET` | `/api/books/:id/thumbnail/:n` | Miniatura (JPEG) |
| `GET` | `/api/books/:id/text/:n` | Layer di testo con bounding box |
| `GET` | `/api/books/:id/chapter/:i` | HTML del capitolo (e-book) |
| `GET` | `/api/books/:id/chapter/:i/text` | Testo semplice del capitolo |
| `GET` | `/api/books/:id/outline` | Indice del documento |

### Annotazioni
| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/api/books/:id/annotations` | Annotazioni (filtro `?page=`) |
| `POST` | `/api/books/:id/annotations` | Crea annotazione |
| `PATCH` | `/api/annotations/:aid` | Modifica colore, commento, testo |
| `DELETE` | `/api/annotations/:aid` | Elimina annotazione |
| `POST` | `/api/books/:id/annotations/clear` | Svuota le annotazioni di una pagina |

### Studio
| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/api/study-notes` | Appunti (filtri `book_id`, `q`) |
| `POST` | `/api/study-notes` | Crea appunto |
| `PATCH` | `/api/study-notes/:id` | Modifica appunto |
| `DELETE` | `/api/study-notes/:id` | Elimina appunto |
| `GET` | `/api/study-notes/link` | Genera un collegamento profondo |
| `GET` | `/api/notes` · `POST` · `PATCH` · `DELETE` | Note per libro e personali |
| `GET` | `/api/flashcards` · `POST` · `PATCH` · `DELETE` | Schede di studio |
| `POST` | `/api/flashcards/:id/review` | Valuta una scheda (SM-2) |
| `GET` | `/api/books/:id/bookmarks` · `POST` · `DELETE` | Segnalibri |
| `GET` | `/api/search?q=` | Ricerca globale |
| `GET` | `/api/stats` | Statistiche di studio |
| `GET` | `/api/export?format=markdown\|json` | Esporta note ed evidenziazioni |

### Sistema
| Metodo | Endpoint | Descrizione |
|---|---|---|
| `GET` | `/api/settings` · `PUT` | Impostazioni (tema, tipografia, accento) |
| `GET` | `/api/collections` · `POST` · `PATCH` · `DELETE` | Collezioni |
| `POST` | `/api/session` | Registra minuti di studio |

---

## 🗺️ Roadmap

- [x] Lettore PDF con layer di testo e annotazioni complete
- [x] Lettore EPUB/DOCX/PPTX con impaginazione a colonne
- [x] Sezione Appunti con collegamenti profondi
- [x] Schede di studio con ripetizione dilazionata (SM-2)
- [x] Ricerca full-text sui documenti (FTS5)
- [x] Tema chiaro/scuro e tipografia regolabile
- [x] Pacchetto standalone (PyInstaller)
- [ ] Drag & drop delle note tra libri e collezioni
- [ ] Esportazione in PDF con annotazioni incluse
- [ ] Sincronizzazione opzionale via WebDAV
- [ ] Riconoscimento ottico (OCR) per PDF scansionati
- [ ] Sottotitoli e trascrizione per le lezioni audio
- [ ] Modo presentazione a schermo intero
- [ ] Plugin per dizionario e Wikipedia contestuale

---

## 🤝 Contribuire

I contributi sono i benvenuti! Per proporre una modifica:

1. Fai un **fork** del repository
2. Crea un branch: `git checkout -b feature/nuova-feature`
3. Committa le modifiche: `git commit -m 'feat: aggiungi nuova feature'`
4. Pusha il branch: `git push origin feature/nuova-feature`
5. Apri una **Pull Request**

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Vedi [`LICENSE`](LICENSE) per maggiori dettagli.

---

<div align="center">

Fatto con ❤️ da **Alessio**

*MyBooks — Leggi, annota, studia. Tutto sul tuo computer.*

</div>
