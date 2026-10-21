/* MyBooks — controller del lettore */
(function (global) {
  'use strict';

  const Reader = {
    state: {
      book: null,
      doc: null,
      annotations: [],
      notes: [],
      cards: [],
      bookmarks: [],
      page: 0,
      total: 1,
      tool: 'pointer',
      color: '#f3d36b',
      penWidth: 2.6,
      shape: 'rect',
      panel: 'toc',
      panelOpen: false,
      sessionStart: 0,
      pagesRead: 0,
      settings: {
        fontSize: 100,
        fontFamily: 'serif',
        leading: 'normal',
        pageTheme: 'paper',
      },
    },
    history: { undo: [], redo: [] },
    zoomSteps: [0.75, 0.9, 1.1, 1.45, 1.8, 2.2, 2.8, 3.4],

    init() {
      PdfView.init();
      ReflowView.init();

      Utils.$('#btn-reader-close').addEventListener('click', () => Reader.close());
      Utils.$('#btn-prev').addEventListener('click', () => Reader.prev());
      Utils.$('#btn-next').addEventListener('click', () => Reader.next());
      Utils.$('#btn-toc').addEventListener('click', () => Reader.togglePanel('toc'));
      Utils.$('#btn-notes-panel').addEventListener('click', () => Reader.togglePanel('notes'));
      Utils.$('#btn-bookmark').addEventListener('click', () => Reader.toggleBookmark());
      Utils.$('#btn-typography').addEventListener('click', (event) => {
        event.stopPropagation();
        Utils.$('#typography-popover').hidden = !Utils.$('#typography-popover').hidden;
      });
      Utils.$('#btn-theme-toggle').addEventListener('click', () => Reader.cyclePageTheme());
      Utils.$('#btn-zoom-in').addEventListener('click', () => Reader.zoom(1));
      Utils.$('#btn-zoom-out').addEventListener('click', () => Reader.zoom(-1));
      Utils.$('#btn-undo').addEventListener('click', () => Reader.undo());
      Utils.$('#btn-redo').addEventListener('click', () => Reader.redo());
      Utils.$('#btn-appunto').addEventListener('click', () => Reader.createAppunto());
      Utils.$$('[data-zoom]').forEach((button) => {
        button.addEventListener('click', () => Reader.zoom(button.dataset.zoom === 'in' ? 1 : -1));
      });

      Utils.$$('#toolbox .tool[data-tool]').forEach((button) => {
        button.addEventListener('click', () => Reader.setTool(button.dataset.tool));
      });

      Reader.renderPalette();

      Utils.$$('#palette-widths .width-opt').forEach((button) => {
        button.addEventListener('click', () => {
          const width = parseFloat(button.dataset.width);
          Reader.state.penWidth = width;
          PdfView.penWidth = width;
          Utils.$$('#palette-widths .width-opt').forEach((b) => b.classList.remove('is-active'));
          button.classList.add('is-active');
        });
      });

      Utils.$('#opt-shape-rect').addEventListener('click', () => Reader.setShape('rect'));
      Utils.$('#opt-shape-ellipse').addEventListener('click', () => Reader.setShape('ellipse'));
      Utils.$('#opt-shape-line').addEventListener('click', () => Reader.setShape('line'));
      Utils.$('#opt-undo').addEventListener('click', () => Reader.undo());

      Utils.$$('.popover__choice[data-font]').forEach((button) => {
        button.addEventListener('click', () => {
          Utils.$$('.popover__choice[data-font]').forEach((b) => b.classList.remove('is-active'));
          button.classList.add('is-active');
          Reader.applyTypography({ fontFamily: button.dataset.font });
        });
      });
      Utils.$$('.popover__choice[data-leading]').forEach((button) => {
        button.addEventListener('click', () => {
          Utils.$$('.popover__choice[data-leading]').forEach((b) => b.classList.remove('is-active'));
          button.classList.add('is-active');
          Reader.applyTypography({ leading: button.dataset.leading });
        });
      });
      Utils.$$('.page-theme').forEach((button) => {
        button.addEventListener('click', () => {
          Utils.$$('.page-theme').forEach((b) => b.classList.remove('is-active'));
          button.classList.add('is-active');
          Reader.applyTypography({ pageTheme: button.dataset.pageTheme });
        });
      });
      Utils.$('[data-typo="font-larger"]').addEventListener('click', () => Reader.changeFontSize(8));
      Utils.$('[data-typo="font-smaller"]').addEventListener('click', () => Reader.changeFontSize(-8));

      Utils.$$('.panel__tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          Utils.$$('.panel__tab').forEach((t) => t.classList.remove('is-active'));
          tab.classList.add('is-active');
          Reader.state.panel = tab.dataset.panel;
          Reader.renderPanel();
        });
      });

      Reader.initScrubber();

      document.addEventListener('keydown', (event) => {
        if (Utils.$('#reader').hidden) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        const meta = event.metaKey || event.ctrlKey;
        if (meta && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) Reader.redo();
          else Reader.undo();
          return;
        }
        switch (event.key) {
          case 'ArrowRight': case 'PageDown': case ' ': event.preventDefault(); Reader.next(); break;
          case 'ArrowLeft': case 'PageUp': event.preventDefault(); Reader.prev(); break;
          case 'Escape': Reader.close(); break;
          case 'v': case 'V': Reader.setTool('pointer'); break;
          case 'h': case 'H': Reader.setTool('highlight'); break;
          case 'u': case 'U': Reader.setTool('underline'); break;
          case 's': case 'S': Reader.setTool('strikeout'); break;
          case 'r': case 'R': Reader.setTool('shape'); break;
          case 'p': case 'P': Reader.setTool('pen'); break;
          case 't': case 'T': Reader.setTool('text'); break;
          case 'n': case 'N': Reader.setTool('postit'); break;
          case 'e': case 'E': Reader.setTool('eraser'); break;
          default: break;
        }
      });

      window.addEventListener('beforeunload', () => Reader.saveSession());
      setInterval(() => {
        if (!Utils.$('#reader').hidden) Reader.saveSession();
      }, 30000);
    },

    /* ------------------------------------------------------- apertura */
    async open(book) {
      const reader = Utils.$('#reader');
      reader.hidden = false;
      reader.classList.remove('is-closing');
      Reader.state.book = book;
      Reader.state.settings = Object.assign({}, Reader.state.settings, Store.state.settings);
      Reader.state.sessionStart = Date.now();
      Reader.state.pagesRead = 0;
      Reader.history = { undo: [], redo: [] };
      Reader.syncHistory();

      Utils.$('#reader-book-title').textContent = book.title;

      let doc;
      try {
        doc = await API.document(book.id);
      } catch (err) {
        UI.toast('Impossibile aprire il documento', 'err');
        reader.hidden = true;
        return;
      }
      Reader.state.doc = doc;
      Reader.state.total = doc.page_count || 1;

      const isFixed = !!doc.is_fixed;
      Utils.$('#reader').dataset.mode = isFixed ? 'pdf' : 'reflow';
      Utils.$('#page-wrap').hidden = !isFixed;
      Utils.$('#reflow').hidden = isFixed;
      Utils.$('#stage').classList.toggle('is-reflow', !isFixed);
      Utils.$('#btn-zoom-in').disabled = !isFixed;
      Utils.$('#btn-zoom-out').disabled = !isFixed;
      Utils.$('#typography-hint').textContent = isFixed
        ? 'Nei PDF il testo fa parte dell\'immagine: usa lo zoom e l\'aspetto della pagina.'
        : 'Regola la tipografia per leggere con comfort.';

      if (isFixed) {
        const start = Math.min(book.current_page || 0, Math.max(doc.page_count - 1, 0));
        Reader.state.page = start;
        PdfView.scale = Reader.zoomSteps[3];
        await PdfView.renderPage(start);
      } else {
        Reader.state.page = Math.min(book.current_page || 0, Math.max(doc.page_count - 1, 0));
        await ReflowView.open(book, doc);
      }
      Reader.applyPageTheme();
      Reader.syncZoom();

      await Reader.loadBookData();
      Reader.renderScrubber();
      Reader.renderPanel();
      Reader.onLocationChanged();
    },

    async loadBookData() {
      const book = Reader.state.book;
      const [annotations, notes, cards, bookmarks] = await Promise.all([
        API.annotations(book.id),
        API.notes({ book_id: book.id }),
        API.flashcards({ book_id: book.id }),
        API.bookmarks(book.id),
      ]);
      Reader.state.annotations = annotations;
      Reader.state.notes = notes;
      Reader.state.cards = cards;
      Reader.state.bookmarks = bookmarks;
      PdfView.setAnnotations(annotations);
      ReflowView.setAnnotations(annotations);
    },

    close() {
      Reader.saveSession();
      Reader.saveProgress();
      const reader = Utils.$('#reader');
      reader.classList.add('is-closing');
      setTimeout(() => {
        reader.hidden = true;
        reader.classList.remove('is-closing');
        Utils.$('#typography-popover').hidden = true;
        Utils.$('#palette').hidden = true;
      }, 260);
      Store.loadBooks();
    },

    /* ---------------------------------------------------- navigazione */
    next() {
      const doc = Reader.state.doc;
      if (!doc) return;
      if (doc.is_fixed) {
        if (Reader.state.page + 1 >= doc.page_count) {
          UI.toast('Sei alla fine del documento');
          return;
        }
        Reader.goToPage(Reader.state.page + 1, 'next');
      } else {
        ReflowView.nextPage();
      }
    },

    prev() {
      const doc = Reader.state.doc;
      if (!doc) return;
      if (doc.is_fixed) {
        if (Reader.state.page <= 0) return;
        Reader.goToPage(Reader.state.page - 1, 'prev');
      } else {
        ReflowView.prevPage();
      }
    },

    async goToPage(page, direction = 'next') {
      const wrap = Utils.$('#page-wrap');
      wrap.classList.remove('is-turning', 'is-turning-next');
      wrap.classList.add(direction === 'prev' ? 'is-turning' : 'is-turning-next');
      await new Promise((resolve) => setTimeout(resolve, 130));
      await PdfView.renderPage(page);
      wrap.classList.remove('is-turning', 'is-turning-next');
      Reader.state.page = page;
      Reader.state.pagesRead += 1;
      Reader.onLocationChanged();
      Reader.renderScrubber();
      Reader.scheduleProgress();
    },

    jumpToPage(page) {
      if (Reader.state.doc && !Reader.state.doc.is_fixed) {
        const index = Utils.clamp(page, 0, Reader.state.doc.page_count - 1);
        ReflowView.showChapter(index);
        Reader.state.page = index;
        Reader.onLocationChanged();
        Reader.scheduleProgress();
        return;
      }
      Reader.goToPage(Utils.clamp(page, 0, Reader.state.doc.page_count - 1));
    },

    /** Salva la progressione con un piccolo ritardo (evita troppe chiamate). */
    scheduleProgress() {
      clearTimeout(Reader._progressTimer);
      Reader._progressTimer = setTimeout(() => Reader.saveProgress(), 700);
    },

    onLocationChanged() {
      const doc = Reader.state.doc;
      if (!doc) return;
      const location = Utils.$('#reader-location');
      const progressText = Utils.$('#reader-progress-text');
      if (doc.is_fixed) {
        const page = Reader.state.page + 1;
        location.textContent = `Pagina ${page} di ${doc.page_count}`;
        progressText.textContent = `${page} / ${doc.page_count}`;
      } else {
        const chapter = ReflowView.chapter + 1;
        location.textContent = `Capitolo ${chapter} di ${doc.page_count}`;
        const pages = ReflowView.pageCount || 1;
        progressText.textContent = `${chapter} / ${doc.page_count} · pag. ${ReflowView.page + 1}/${pages}`;
      }
      Reader.renderScrubber();
    },

    /* ----------------------------------------------------- strumenti */
    setTool(tool) {
      Reader.state.tool = tool;
      Utils.$$('#toolbox .tool[data-tool]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tool === tool);
      });
      const needsPalette = ['highlight', 'underline', 'strikeout', 'shape', 'pen', 'text', 'postit'].includes(tool);
      Utils.$('#palette').hidden = !needsPalette;
      Utils.$('#palette-shapes').style.display = tool === 'shape' ? 'flex' : 'none';
      Utils.$('#palette-widths').style.display = tool === 'pen' ? 'flex' : 'none';
      PdfView.setTool(tool);
    },

    syncTool(tool) {
      Utils.$$('#toolbox .tool[data-tool]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tool === tool);
      });
    },

    syncColor(color) {
      Reader.state.color = color;
      Utils.$$('#palette-colors .swatch').forEach((swatch) => {
        swatch.classList.toggle('is-active', swatch.dataset.color === color);
      });
    },

    setShape(shape) {
      Reader.state.shape = shape;
      PdfView.shape = shape;
      Utils.$('#opt-shape-rect').classList.toggle('is-active', shape === 'rect');
      Utils.$('#opt-shape-ellipse').classList.toggle('is-active', shape === 'ellipse');
      Utils.$('#opt-shape-line').classList.toggle('is-active', shape === 'line');
    },

    renderPalette() {
      const host = Utils.$('#palette-colors');
      host.innerHTML = '';
      PdfView.ANNOTATION_COLORS.forEach((entry) => {
        const swatch = Utils.el('button', {
          class: `swatch${entry.value === Reader.state.color ? ' is-active' : ''}`,
          style: { background: entry.value },
          title: entry.label,
          dataset: { color: entry.value },
          onClick: () => {
            Reader.syncColor(entry.value);
            PdfView.setColor(entry.value);
          },
        });
        host.appendChild(swatch);
      });
    },

    /* -------------------------------------------------- annotazioni */
    async addAnnotation(data, options = {}) {
      const book = Reader.state.book;
      try {
        const created = await API.createAnnotation(book.id, data);
        Reader.state.annotations.push(created);
        PdfView.setAnnotations(Reader.state.annotations);
        ReflowView.setAnnotations(Reader.state.annotations);
        if (!options.skipHistory) Reader.pushHistory({ type: 'create', annotation: created });
        if (!options.silent) UI.toast('Annotazione salvata', 'ok');
        Reader.renderPanel();
        Reader.renderScrubber();
        return created;
      } catch (err) {
        UI.toast('Salvataggio non riuscito', 'err');
        return null;
      }
    },

    async updateAnnotation(id, patch) {
      const updated = await API.updateAnnotation(id, patch);
      const index = Reader.state.annotations.findIndex((a) => a.id === id);
      if (index >= 0) Reader.state.annotations[index] = updated;
      PdfView.setAnnotations(Reader.state.annotations);
      ReflowView.setAnnotations(Reader.state.annotations);
      return updated;
    },

    async removeAnnotation(id, options = {}) {
      const index = Reader.state.annotations.findIndex((a) => a.id === id);
      const annotation = index >= 0 ? Reader.state.annotations[index] : null;
      await API.deleteAnnotation(id);
      if (index >= 0) Reader.state.annotations.splice(index, 1);
      PdfView.setAnnotations(Reader.state.annotations);
      ReflowView.setAnnotations(Reader.state.annotations);
      if (annotation && !options.silent) Reader.pushHistory({ type: 'delete', annotation });
      if (!options.silent) UI.toast('Annotazione eliminata');
      Reader.renderPanel();
      Reader.renderScrubber();
    },

    async restoreAnnotation(annotation) {
      const payload = {
        type: annotation.type,
        page: annotation.page,
        color: annotation.color,
        rects: annotation.rects,
        points: annotation.points,
        text: annotation.text,
        anchor: annotation.anchor,
        comment: annotation.comment,
      };
      const created = await Reader.addAnnotation(payload, { silent: true, skipHistory: true });
      return created;
    },

    pushHistory(action) {
      Reader.history.undo.push(action);
      if (Reader.history.undo.length > 120) Reader.history.undo.shift();
      Reader.history.redo.length = 0;
      Reader.syncHistory();
    },

    syncHistory() {
      Utils.$('#btn-undo').disabled = Reader.history.undo.length === 0;
      Utils.$('#btn-redo').disabled = Reader.history.redo.length === 0;
    },

    async undo() {
      const action = Reader.history.undo.pop();
      if (!action) return;
      if (action.type === 'create') {
        await Reader.removeAnnotation(action.annotation.id, { silent: true });
      } else if (action.type === 'delete') {
        action.annotation = await Reader.restoreAnnotation(action.annotation);
      }
      Reader.history.redo.push(action);
      Reader.syncHistory();
    },

    async redo() {
      const action = Reader.history.redo.pop();
      if (!action) return;
      if (action.type === 'create') {
        action.annotation = await Reader.restoreAnnotation(action.annotation);
      } else if (action.type === 'delete') {
        await Reader.removeAnnotation(action.annotation.id, { silent: true });
      }
      Reader.history.undo.push(action);
      Reader.syncHistory();
    },

    /* ---------------------------------------------------- pannelli */
    togglePanel(tab) {
      const panel = Utils.$('#panel');
      const body = Utils.$('#reader').querySelector('.reader__body');
      const isOpen = !panel.hidden;
      if (isOpen && Reader.state.panel === tab) {
        panel.hidden = true;
        body.classList.remove('has-panel');
        Reader.state.panelOpen = false;
        return;
      }
      if (tab) {
        Utils.$$('.panel__tab').forEach((t) => t.classList.toggle('is-active', t.dataset.panel === tab));
        Reader.state.panel = tab;
      }
      panel.hidden = false;
      body.classList.add('has-panel');
      Reader.state.panelOpen = true;
      Reader.renderPanel();
    },

    renderPanel() {
      const host = Utils.$('#panel-body');
      if (!host) return;
      const panel = Reader.state.panel;
      host.innerHTML = '';

      if (panel === 'toc') Reader.renderToc(host);
      else if (panel === 'notes') Reader.renderNotesPanel(host);
      else if (panel === 'marks') Reader.renderMarksPanel(host);
      else if (panel === 'cards') Reader.renderCardsPanel(host);
    },

    renderToc(host) {
      const outline = (Reader.state.doc && Reader.state.doc.outline) || [];
      if (!outline.length) {
        host.appendChild(Utils.el('div', { class: 'panel-empty', text: 'Nessun indice disponibile' }));
        return;
      }
      const walk = (nodes, depth) => {
        nodes.forEach((node) => {
          const item = Utils.el('button', {
            class: `toc-item${depth ? ' toc-item--child' : ''}`,
            text: node.title || 'Sezione',
            onClick: () => Reader.jumpToPage(node.page || 0),
          });
          host.appendChild(item);
          if (node.children && node.children.length) walk(node.children, depth + 1);
        });
      };
      walk(outline, 0);
    },

    renderNotesPanel(host) {
      const add = Utils.el('button', { class: 'btn btn--primary btn--sm', text: '+ Nuova nota', onClick: () => Reader.newNote() });
      host.appendChild(add);
      const list = Utils.el('div', { style: { marginTop: '12px' } });
      host.appendChild(list);

      if (!Reader.state.notes.length) {
        list.appendChild(Utils.el('div', { class: 'panel-empty', text: 'Nessuna nota per questo libro' }));
        return;
      }
      Reader.state.notes.forEach((note) => {
        list.appendChild(
          Utils.el('div', { class: 'panel-card' },
            Utils.el('div', { class: 'panel-card__head' },
              Utils.el('span', { class: 'panel-card__title', text: note.title || 'Nota' }),
              Utils.el('button', {
                class: 'icon-btn icon-btn--tiny',
                html: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
                onClick: async () => {
                  await API.deleteNote(note.id);
                  Reader.state.notes = Reader.state.notes.filter((n) => n.id !== note.id);
                  Reader.renderPanel();
                  UI.toast('Nota eliminata');
                },
              })
            ),
            Utils.el('div', { class: 'panel-card__text', text: note.body || '' }),
            Utils.el('div', { class: 'panel-card__meta' },
              Utils.el('span', { text: `Pagina ${(note.page || 0) + 1}` }),
              Utils.el('span', { text: Utils.formatDate(note.updated_at) })
            )
          )
        );
      });
    },

    renderMarksPanel(host) {
      const marks = Reader.state.annotations.filter((a) =>
        ['highlight', 'underline', 'strikeout', 'postit', 'text', 'square', 'circle', 'ink'].includes(a.type)
      );
      const add = Utils.el('button', {
        class: 'btn btn--ghost btn--sm',
        text: '+ Scheda di studio',
        onClick: () => Reader.newFlashcard(),
      });
      host.appendChild(add);
      const list = Utils.el('div', { style: { marginTop: '12px' } });
      host.appendChild(list);

      if (!marks.length) {
        list.appendChild(Utils.el('div', { class: 'panel-empty', text: 'Nessuna annotazione' }));
        return;
      }
      marks.forEach((mark) => {
        const card = Utils.el('div', { class: 'panel-card' },
          Utils.el('div', { class: 'panel-card__head' },
            Utils.el('span', { class: 'panel-card__title', text: Reader.annotationType(mark.type) }),
            Utils.el('button', {
              class: 'icon-btn icon-btn--tiny',
              html: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
              onClick: async () => {
                await Reader.removeAnnotation(mark.id);
                Reader.renderPanel();
              },
            })
          )
        );
        if (mark.text) card.appendChild(Utils.el('div', { class: 'panel-card__text panel-card__quote', text: mark.text }));
        if (mark.comment) card.appendChild(Utils.el('div', { class: 'panel-card__text', text: mark.comment }));
        const actions = Utils.el('div', { class: 'panel-card__meta' },
          Utils.el('span', { text: `Pagina ${(mark.page || 0) + 1}` }),
          Utils.el('button', {
            class: 'btn btn--sm btn--ghost',
            text: 'Vai',
            onClick: () => Reader.jumpToPage(mark.page || 0),
          })
        );
        if (mark.text) {
          actions.appendChild(
            Utils.el('button', {
              class: 'btn btn--sm btn--ghost',
              text: '→ scheda',
              title: 'Crea una scheda di studio da questa evidenziazione',
              onClick: () => Reader.newFlashcard(mark),
            })
          );
        }
        card.appendChild(actions);
        list.appendChild(card);
      });
    },

    renderCardsPanel(host) {
      const add = Utils.el('button', { class: 'btn btn--primary btn--sm', text: '+ Nuova scheda', onClick: () => Reader.newFlashcard() });
      host.appendChild(add);
      const list = Utils.el('div', { style: { marginTop: '12px' } });
      host.appendChild(list);
      if (!Reader.state.cards.length) {
        list.appendChild(Utils.el('div', { class: 'panel-empty', text: 'Nessuna scheda. Crea schede dalle evidenziazioni!' }));
        return;
      }
      Reader.state.cards.forEach((card) => {
        list.appendChild(
          Utils.el('div', { class: 'panel-card' },
            Utils.el('div', { class: 'panel-card__title', text: card.front }),
            Utils.el('div', { class: 'panel-card__text', text: card.back }),
            Utils.el('div', { class: 'panel-card__meta' },
              Utils.el('span', { text: `ripetizioni: ${card.reps || 0}` })
            )
          )
        );
      });
    },

    annotationType(type) {
      return {
        highlight: 'Evidenziazione', underline: 'Sottolineatura', strikeout: 'Barrato',
        square: 'Forma', circle: 'Ellisse', line: 'Linea', ink: 'Inchiostro',
        text: 'Testo', postit: 'Post-it',
      }[type] || type;
    },

    async newNote() {
      const title = await UI.prompt('Nuova nota', { label: 'Titolo', placeholder: 'Titolo della nota' });
      if (title === null) return;
      const body = await UI.prompt('Nuova nota', { label: 'Contenuto', multiline: true, placeholder: 'Scrivi la nota…' });
      if (body === null) return;
      const note = await API.createNote({
        book_id: Reader.state.book.id,
        page: Reader.state.page,
        title,
        body,
      });
      Reader.state.notes.unshift(note);
      Reader.renderPanel();
      UI.toast('Nota salvata', 'ok');
    },

    async newFlashcard(source) {
      const selection = Reader.state.lastSelection;
      const defaultFront = source && source.text
        ? source.text
        : selection && selection.text
          ? selection.text
          : '';
      const front = await UI.prompt('Nuova scheda', {
        label: 'Domanda (fronte)',
        value: defaultFront,
        placeholder: 'Scrivi o incolla la domanda',
      });
      if (front === null) return;
      const back = await UI.prompt('Nuova scheda', {
        label: 'Risposta (retro)',
        multiline: true,
        placeholder: 'La risposta che vuoi ricordare',
      });
      if (back === null) return;
      const page = source ? source.page : selection ? selection.page : Reader.state.page;
      const card = await API.createCard({
        book_id: Reader.state.book.id,
        front,
        back,
        page,
        source: source ? 'evidenziazione' : 'manuale',
        deck: 'Default',
      });
      Reader.state.cards.unshift(card);
      Reader.renderPanel();
      UI.toast('Scheda creata', 'ok');
    },

    /* ---------------------------------------------------- segnalibri */
    async toggleBookmark() {
      const book = Reader.state.book;
      const existing = Reader.state.bookmarks.find((b) => (b.page || 0) === Reader.state.page);
      if (existing) {
        await API.deleteBookmark(existing.id);
        Reader.state.bookmarks = Reader.state.bookmarks.filter((b) => b.id !== existing.id);
        UI.toast('Segnalibro rimosso');
      } else {
        const bookmark = await API.createBookmark(book.id, { page: Reader.state.page, label: '' });
        Reader.state.bookmarks.push(bookmark);
        UI.toast('Segnalibro aggiunto', 'ok');
      }
      Utils.$('#btn-bookmark').classList.toggle('is-active', !existing);
    },

    /* ------------------------------------------------------ zoom */
    zoom(direction) {
      const steps = Reader.zoomSteps;
      let index = steps.findIndex((value) => Math.abs(value - PdfView.scale) < 0.02);
      if (index === -1) index = 3;
      index = Utils.clamp(index + direction, 0, steps.length - 1);
      PdfView.scale = steps[index];
      PdfView.renderPage(PdfView.currentPage, true);
      Reader.syncZoom();
    },

    syncZoom() {
      const value = Utils.$('#zoom-value');
      if (value) value.textContent = `${Math.round((PdfView.scale / 1.45) * 100)}%`;
    },

    /** Aspetto della pagina: bianco, beige o notte (filtro sui PDF). */
    applyPageTheme() {
      const theme = Reader.state.settings.pageTheme || 'paper';
      const page = Utils.$('#page');
      const styles = {
        paper: { filter: 'none', bg: '#FBF6EC' },
        sepia: { filter: 'sepia(.55) saturate(1.2) brightness(.96) contrast(1.02)', bg: '#EFE2CC' },
        night: { filter: 'invert(.88) hue-rotate(180deg) brightness(.92) contrast(.92)', bg: '#241C1E' },
      };
      const choice = styles[theme] || styles.paper;
      page.style.setProperty('--page-filter', choice.filter);
      page.style.setProperty('--page-bg', choice.bg);
      Utils.$('#stage').style.setProperty('--page-bg', choice.bg);
    },

    /** Crea un appunto di studio sulla posizione corrente. */
    async createAppunto() {
      const book = Reader.state.book;
      if (!book) return;
      const doc = Reader.state.doc || {};
      const selection = Reader.state.lastSelection;
      let chapterTitle = '';
      if (!doc.is_fixed) {
        const chapter = (doc.chapters || [])[Reader.state.page];
        chapterTitle = chapter ? chapter.title : '';
      } else {
        const node = Reader.findOutlineNode(Reader.state.page);
        chapterTitle = node ? node.title : `Pagina ${Reader.state.page + 1}`;
      }
      const link = await API.buildLink(book.id, Reader.state.page);
      const reference = selection && selection.text
        ? `${selection.text}\n\n${link}`
        : link;
      // chiude il lettore: l'appunto si scrive nella sezione Appunti
      Reader.close();
      setTimeout(() => {
        if (global.Appunti) {
          global.Appunti.fromReader(book, Reader.state.page, chapterTitle, reference);
        }
      }, 300);
    },

    findOutlineNode(page) {
      const outline = (Reader.state.doc && Reader.state.doc.outline) || [];
      let found = null;
      const walk = (nodes) => {
        nodes.forEach((node) => {
          if (node.page === page) found = node;
          if (node.children && node.children.length) walk(node.children);
        });
      };
      walk(outline);
      return found;
    },

    cyclePageTheme() {
      const themes = ['paper', 'sepia', 'night'];
      const current = Reader.state.settings.pageTheme || 'paper';
      const next = themes[(themes.indexOf(current) + 1) % themes.length];
      Reader.applyTypography({ pageTheme: next });
      Utils.$$('.page-theme').forEach((b) => b.classList.toggle('is-active', b.dataset.pageTheme === next));
    },

    async changeFontSize(delta) {
      const current = Number(Reader.state.settings.fontSize) || 100;
      const next = Utils.clamp(current + delta, 70, 180);
      await Reader.applyTypography({ fontSize: next });
      Utils.$('#typo-size').textContent = `${next}%`;
    },

    async applyTypography(patch) {
      const settings = await Store.saveSettings(patch);
      Reader.state.settings = Object.assign({}, Reader.state.settings, settings);
      Utils.$('#typo-size').textContent = `${settings.fontSize}%`;
      Reader.applyPageTheme();
      if (Reader.state.doc && !Reader.state.doc.is_fixed && ReflowView.ready) {
        const chapter = ReflowView.chapter;
        const page = ReflowView.page;
        await ReflowView.showChapter(chapter);
        // mantiene la posizione di lettura dopo il cambio di tipografia
        if (ReflowView.pageCount > 1) ReflowView.goToPage(Math.min(page, ReflowView.pageCount - 1));
      }
    },

    /* --------------------------------------------------- scrubber */
    initScrubber() {
      const track = Utils.$('#scrubber-track');
      const jump = (event) => {
        const rect = track.getBoundingClientRect();
        const ratio = Utils.clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const doc = Reader.state.doc;
        if (!doc) return;
        const total = doc.is_fixed ? doc.page_count : doc.page_count;
        Reader.jumpToPage(Math.round(ratio * (total - 1)));
      };
      track.addEventListener('click', jump);
    },

    renderScrubber() {
      const doc = Reader.state.doc;
      if (!doc) return;
      const total = doc.page_count || 1;
      const current = Reader.state.page;
      const fill = Utils.$('#scrubber-fill');
      const thumb = Utils.$('#scrubber-thumb');
      fill.style.width = `${((current + 1) / total) * 100}%`;
      thumb.style.left = `${((current + 1) / total) * 100}%`;

      const thumbs = Utils.$('#scrubber-thumbs');
      thumbs.innerHTML = '';
      const pagesWithMarks = new Set(Reader.state.annotations.map((a) => a.page));
      pagesWithMarks.forEach((page) => {
        if (page === undefined || page === null) return;
        thumbs.appendChild(
          Utils.el('div', {
            class: 'scrubber__mini has-mark',
            style: { left: `${((page + 1) / total) * 100}%` },
          })
        );
      });
    },

    /* -------------------------------------------------- progresso */
    saveProgress() {
      const book = Reader.state.book;
      const doc = Reader.state.doc;
      if (!book || !doc) return;
      API.progress(book.id, Reader.state.page, doc.page_count).catch(() => {});
    },

    saveSession() {
      const book = Reader.state.book;
      if (!book) return;
      const seconds = Math.round((Date.now() - Reader.state.sessionStart) / 1000);
      if (seconds < 5) return;
      Reader.state.sessionStart = Date.now();
      API.session(book.id, seconds, Reader.state.pagesRead).catch(() => {});
    },
  };

  global.Reader = Reader;
})(window);
