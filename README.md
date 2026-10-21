# MyBooks

Libreria digitale per leggere, annotare e studiare materiale universitario.
Interfaccia in stile **Apple Books**, backend in **Python** (Flask + SQLite),
frontend in **HTML/CSS/JS** vanilla (nessun build step).

Tono visivo: **bianco, beige e bordeaux**, con animazioni e transizioni ispirate
a macOS/iOS (spring easing, glass morphism, transizioni morbide).

---

## Funzionalità

### Libreria
- Import di **PDF, EPUB, DOCX, PPTX, TXT, MD, HTML** (drag & drop, selettore file o indicizzazione di una cartella).
- **Copertine automatiche**:
  - PDF → prima pagina renderizzata, con ritaglio automatico dei margini bianchi;
  - EPUB → copertina reale letta dall'OPF (`meta name="cover"`, `properties="cover-image"`, pagina di copertina XHTML) o prima immagine dell'archivio;
  - in assenza di copertina → copertina generata in stile bordeaux/beige con titolo e autore.
- Griglia con animazione a cascata, vista a elenco, filtri per **formato**, **collezioni** e **stato di lettura** (da leggere / in corso / completati).
- Ricerca globale: titoli, autori, tag, note, evidenziazioni e **testo interno dei documenti** (indice FTS5).
- Collezioni personalizzate con colore; tag per materia/argomento.
- Schede di dettaglio con metadati, progressione e copertura.

### Lettore PDF
- Rendering ad alta risoluzione (fino a 4×) con **layer di testo invisibile** perfettamente sovrapposto: si seleziona e si evidenzia esattamente come in un editor di testo.
- Strumenti di annotazione: **evidenziatore**, **sottolineatura**, **barrato**, **penna a mano libera** (3 spessori), **forme** (rettangolo, ellisse, linea), **caselle di testo**, **post-it**, **gomma**.
- 8 colori di annotazione, commenti su ogni annotazione, menu contestuale con cambio colore ed eliminazione.
- **Undo/redo** completo (⌘Z / ⇧⌘Z).
- Zoom, navigazione a pagine, indice del documento, segnalibri, barra di avanzamento con indicatori delle annotazioni.

### Lettore EPUB / DOCX / PPTX / TXT
- Impaginazione a **colonne** con scorrimento orizzontale (come Apple Books), navigazione per "pagine".
- Tipografia regolabile: dimensione del testo, carattere (serif/sans/mono), interlinea, **temi pagina** (bianco / beige / notte).
- Evidenziazioni ancorate al **testo esatto** (offset + citazione): restano allineate anche cambiando carattere o dimensione.
- Indice del documento, capitoli navigabili.

### Studio
- **Appunti**: sezione dedicata per scrivere appunti legati a un **capitolo** e a un **argomento** di un libro.
  - Editor con libro, capitolo (con suggerimenti dall'indice), argomento, titolo, contenuto e **riferimento**.
  - Il riferimento può contenere il brano di testo selezionato, un link esterno o un **collegamento profondo** `mybooks://libro/12?pagina=34`; l'app lo riconosce e offre "Apri nel libro".
  - Pulsante **Appunto** nella barra del lettore: precompila libro, capitolo, posizione e il testo selezionato, poi ti porta nella sezione Appunti.
  - Pulsanti "Incolla" (dagli appunti di sistema) e "Copia collegamento" (genera il link alla posizione corrente).
  - Ricerca e filtro per argomento/capitolo; gli appunti sono anche inclusi nella ricerca globale.
- **Note** per libro (con colore, argomenti, preferito) e note personali.
- **Schede di studio** con ripetizione dilazionata (algoritmo SM-2 semplificato): creazione diretta da un'evidenziazione con un click.
- **Statistiche**: libri, evidenziazioni, note, minuti di studio, pagine lette, grafico giornaliero.
- **Esportazione** di note ed evidenziazioni in Markdown o JSON.

---

## Personalizzazione

| Impostazione | Dove | Effetto |
|---|---|---|
| Tema chiaro / scuro | pulsante sole/luna nella barra in alto, oppure Impostazioni | si applica **immediatamente** |
| Colore d'accento | Impostazioni | bordeaux, verde, blu, viola, grafite |
| Dimensione carattere | lettore (Aa) | 70–180% |
| Carattere (serif/sans/mono) | lettore (Aa) | solo per e-book |
| Interlinea | lettore (Aa) | stretto / normale / ampio |
| Aspetto pagina | lettore (Aa) | bianco / beige / notte — per i PDF è un filtro applicato alla pagina |
| Zoom pagina | lettore (Aa) o barra in basso | 75%–340% |

Nei PDF il testo fa parte dell'immagine: per questo motivo il pannello tipografico mostra
lo zoom e l'aspetto della pagina invece dei controlli sul carattere.

---

## Struttura del progetto

```
Books/
├── backend/                 # API Python
│   ├── app.py               # routes Flask (libreria, lettore, annotazioni, studio, export)
│   ├── db.py                # schema SQLite + FTS5
│   ├── library.py           # import, metadati, copertine, progressione
│   ├── annotations.py       # annotazioni, note, segnalibri, flashcard
│   ├── study.py             # appunti di studio + collegamenti profondi
│   ├── docstore.py          # cache dei documenti aperti
│   ├── config.py            # percorsi e costanti
│   └── docs/                # gestori per formato
│       ├── base.py          # interfaccia comune
│       ├── pdf.py           # PyMuPDF: rendering, layer di testo, indice
│       ├── epub.py          # ebooklib: capitoli, indice, immagini, copertina
│       ├── office.py        # DOCX e PPTX
│       └── plain.py         # TXT / MD / HTML
├── frontend/                # interfaccia (vanilla JS, zero build)
│   ├── index.html
│   ├── css/  theme · library · reader · study
│   └── js/   api · utils · ui · store · library · notes · appunti
│             flashcards · search · pdfview · reflow · reader · app
├── desktop.py               # app desktop (pywebview + Flask in background)
├── run.py                   # solo server (per il browser)
├── tests/                   # smoke test Playwright
├── make_samples.py          # genera PDF/EPUB di prova
└── data/                    # database, libri importati, copertine (runtime)
```

---

## Avvio

### Desktop (finestra nativa)
```bash
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python desktop.py
```

### Server + browser
```bash
venv/bin/python run.py --port 8770     # http://127.0.0.1:8770
```

### Sviluppo
```bash
venv/bin/python make_samples.py         # documenti di prova in samples/
./dev-server.sh                         # riavvia il server in background
venv/bin/python tests/smoke.py          # smoke test end-to-end (Playwright)
venv/bin/python tests/test_annotate.py  # selezione del testo ed evidenziazioni
venv/bin/python tests/test_appunti.py   # sezione Appunti e collegamenti profondi
venv/bin/python tests/test_settings.py   # tema, tipografia, copertine
venv/bin/python tests/test_study.py      # ricerca, schede, ripetizione dilazionata
venv/bin/python tests/test_progress.py   # salvataggio della progressione
venv/bin/python tests/gallery.py        # screenshot di tutte le viste
```

> I test usano Playwright con il Chromium di sistema: `venv/bin/pip install playwright`.

### Pacchetto standalone (PyInstaller)
```bash
venv/bin/pyinstaller main.spec --noconfirm
# → dist/MyBooks
```

---

## Scorciatoie

| Tasto | Azione |
|---|---|
| `V` | seleziona / sposta |
| `H` | evidenzia |
| `U` | sottolinea |
| `S` | barrato |
| `R` | forma |
| `P` | penna |
| `T` | casella di testo |
| `N` | post-it |
| `E` | gomma |
| `←` `→` / spazio | pagina precedente / successiva |
| `⌘Z` / `⇧⌘Z` | annulla / ripeti |
| `⌘K` | ricerca globale |
| `⌘O` | importa libri |
| `Esc` | chiudi il lettore |

---

## Appunti e collegamenti

Ogni appunto può puntare a una porzione precisa del libro:

```
mybooks://libro/12?pagina=34
```

- nel lettore, il pulsante **Appunto** (icona foglio) crea l'appunto già compilato con libro, capitolo, posizione e il testo selezionato;
- il campo **Riferimento** accetta il brano, un link esterno o il collegamento profondo: l'app lo riconosce e mostra il pulsante "Apri nel libro";
- l'indirizzo del browser accetta la forma `#libro/12/34` e apre il libro alla pagina 34.

---

## Dati

Tutto è locale: SQLite (`data/mybooks.db`), documenti importati in `data/books/`,
copertine in `data/covers/`. Per spostare la libreria basta copiare la cartella `data/`
oppure impostare `MYBOOKS_DATA_DIR`.

---

## Note tecniche

- Le coordinate delle annotazioni sono espresse in **punti PDF** (indipendenti dallo zoom) e trasformate in pixel al momento del rendering: le annotazioni restano allineate a qualunque livello di zoom.
- Il layer di testo del PDF usa la famiglia di font **metricamente compatibile** con quella del documento (Helvetica/Arial, Times/Liberation Serif, Courier) così la selezione cade esattamente sulle parole.
- Il testo selezionato dentro l'EPUB viene ancorato tramite **offset assoluto + citazione**: se l'offset non è più valido si ripiega sulla ricerca del testo.
- I documenti aperti restano in cache (`docstore`) per evitare di rileggere gli EPUB a ogni richiesta.
