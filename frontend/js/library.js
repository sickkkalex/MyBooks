/* MyBooks — vista libreria */
(function (global) {
  'use strict';

  const FORMAT_LABEL = {
    pdf: 'PDF', epub: 'EPUB', docx: 'DOCX', pptx: 'PPTX', txt: 'Testo',
  };

  const Library = {
    grid: null,
    empty: null,

    init() {
      Library.grid = Utils.$('#library-grid');
      Library.empty = Utils.$('#library-empty');

      Store.on('books', () => {
        Library.render();
        Library.renderReading();
      });
      Store.on('collections', () => Library.renderCollections());
      Store.on('filter', () => Library.render());

      Utils.$('#library-search').addEventListener('input', Utils.debounce((event) => {
        const value = event.target.value.trim();
        Utils.$('#search-field').classList.toggle('has-value', !!value);
        Store.state.filter.search = value;
        Store.emit('filter');
      }, 220));

      Utils.$('#search-clear').addEventListener('click', () => {
        const input = Utils.$('#library-search');
        input.value = '';
        Utils.$('#search-field').classList.remove('has-value');
        Store.state.filter.search = '';
        Store.emit('filter');
      });

      Utils.$$('#segmented .segmented__item').forEach((button) => {
        button.addEventListener('click', () => {
          Utils.$$('#segmented .segmented__item').forEach((b) => b.classList.remove('is-active'));
          button.classList.add('is-active');
          Store.state.filter.state = button.dataset.filter === 'all' ? '' : button.dataset.filter;
          Store.emit('filter');
        });
      });

      Utils.$$('#view-toggle .icon-btn').forEach((button) => {
        button.addEventListener('click', () => {
          Utils.$$('#view-toggle .icon-btn').forEach((b) => b.classList.remove('is-active'));
          button.classList.add('is-active');
          Store.state.layout = button.dataset.layout;
          Library.render();
        });
      });

      Utils.$$('#format-list .chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const active = chip.classList.contains('is-active');
          Utils.$$('#format-list .chip').forEach((c) => c.classList.remove('is-active'));
          if (!active) chip.classList.add('is-active');
          Store.state.filter.format = active ? '' : chip.dataset.format;
          Store.emit('filter');
        });
      });

      Utils.$('#btn-import').addEventListener('click', Library.importDialog);
      Utils.$('#btn-import-empty').addEventListener('click', Library.importDialog);
      Utils.$('#btn-scan-empty').addEventListener('click', Library.scanDialog);
      Utils.$('#btn-new-collection').addEventListener('click', Library.newCollection);

      Utils.$('#btn-sidebar').addEventListener('click', () => {
        Utils.$('#app').classList.toggle('is-collapsed');
      });
      Utils.$('#btn-collapse').addEventListener('click', () => {
        Utils.$('#app').classList.toggle('is-collapsed');
      });
    },

    /* ---------------------------------------------------------- render */
    render() {
      const books = Store.filteredBooks();
      Library.grid.innerHTML = '';
      const isList = Store.state.layout === 'list';
      Library.grid.classList.toggle('is-list', isList);

      books.forEach((book, index) => {
        Library.grid.appendChild(Library.card(book, index));
      });

      Library.empty.hidden = books.length > 0;
      if (books.length === 0 && Store.state.books.length > 0) {
        Library.empty.querySelector('h2').textContent = 'Nessun libro corrisponde ai filtri';
        Library.empty.querySelector('p').textContent = 'Prova a modificare la ricerca o il formato selezionato.';
      } else {
        Library.empty.querySelector('h2').textContent = 'La tua libreria è vuota';
        Library.empty.querySelector('p').textContent =
          'Importa PDF, EPUB, DOCX, PPTX o documenti di testo per iniziare a leggere, annotare e studiare.';
      }
    },

    renderReading() {
      const grid = Utils.$('#reading-grid');
      const empty = Utils.$('#reading-empty');
      const books = Store.state.books.filter((b) => b.state === 'reading');
      grid.innerHTML = '';
      books.forEach((book, index) => grid.appendChild(Library.card(book, index, true)));
      empty.hidden = books.length > 0;
      const badge = Utils.$('#badge-reading');
      badge.textContent = books.length || '';
      badge.classList.toggle('is-on', books.length > 0);
    },

    card(book, index, compact = false) {
      const progress = Math.round((book.progress || 0) * 100);
      const cover = Utils.el('img', {
        class: 'book-card__cover',
        src: API.coverUrl(book.id),
        alt: book.title,
        loading: 'lazy',
        onError: (event) => {
          event.target.style.display = 'none';
          event.target.parentElement.style.background =
            'linear-gradient(140deg, #6e1e2e, #a83a4f)';
        },
      });

      const wrap = Utils.el('div', { class: 'book-card__cover-wrap' }, cover);

      if (book.state === 'finished') {
        wrap.appendChild(Utils.el('span', { class: 'book-card__badge', text: 'Finito' }));
      } else if (book.state === 'reading') {
        wrap.appendChild(Utils.el('span', { class: 'book-card__badge', text: FORMAT_LABEL[book.format] || book.format }));
      }

      if (progress > 0 && progress < 100) {
        wrap.appendChild(
          Utils.el('div', { class: 'book-card__progress' }, Utils.el('span', { style: { width: `${progress}%` } }))
        );
      }

      const overlay = Utils.el('div', { class: 'book-card__overlay' });
      const quick = Utils.el('div', { class: 'book-card__quick' });
      quick.appendChild(
        Utils.el('button', {
          class: 'quick-btn',
          title: 'Apri il libro',
          html: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
          onClick: (event) => {
            event.stopPropagation();
            global.Reader.open(book);
          },
        })
      );
      quick.appendChild(
        Utils.el('button', {
          class: 'quick-btn',
          title: 'Dettagli',
          html: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
          onClick: (event) => {
            event.stopPropagation();
            Library.detail(book);
          },
        })
      );
      overlay.appendChild(quick);
      wrap.appendChild(overlay);

      const meta = Utils.el('div', { class: 'book-card__meta' },
        Utils.el('div', { class: 'book-card__title', text: book.title }),
        Utils.el('div', { class: 'book-card__author', text: book.author || 'Autore sconosciuto' })
      );

      const card = Utils.el('div', { class: 'book-card', style: { '--i': index } }, wrap, meta);

      if (Store.state.layout === 'list' && !compact) {
        const side = Utils.el('div', { class: 'book-card__side' },
          Utils.el('span', { text: FORMAT_LABEL[book.format] || book.format }),
          Utils.el('div', { class: 'list-progress' }, Utils.el('span', { style: { width: `${progress}%` } })),
          Utils.el('span', { text: `${progress}%` })
        );
        card.appendChild(side);
      }

      card.addEventListener('click', () => global.Reader.open(book));
      card.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        Library.detail(book);
      });
      return card;
    },

    renderCollections() {
      const host = Utils.$('#collection-list');
      host.innerHTML = '';
      const collections = Store.state.collections;
      const active = Store.state.filter.collection;

      collections.forEach((collection) => {
        const count = Store.state.books.filter((b) => b.collection_id === collection.id).length;
        const item = Utils.el('div', { class: `collection-item${active === collection.id ? ' is-active' : ''}` },
          Utils.el('span', { class: 'collection-item__dot', style: { background: collection.color } }),
          Utils.el('span', { class: 'collection-item__name', text: collection.name }),
          Utils.el('span', { class: 'collection-item__count', text: count })
        );
        item.addEventListener('click', () => {
          const next = active === collection.id ? null : collection.id;
          Store.state.filter.collection = next;
          Utils.$$('#format-list .chip').forEach((c) => c.classList.remove('is-active'));
          Store.state.filter.format = '';
          Store.emit('filter');
          Library.renderCollections();
        });
        item.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          const ok = await UI.confirm('Eliminare collezione', `Eliminare "${collection.name}"? I libri resteranno in libreria.`, { danger: true, okLabel: 'Elimina' });
          if (!ok) return;
          await API.deleteCollection(collection.id);
          await Store.loadCollections();
        });
        host.appendChild(item);
      });

      if (!collections.length) {
        host.appendChild(
          Utils.el('div', { class: 'panel-empty', style: { padding: '10px' }, text: 'Nessuna collezione' })
        );
      }
    },

    /* -------------------------------------------------------- dettagli */
    detail(book) {
      const meta = book.metadata || {};
      const progress = Math.round((book.progress || 0) * 100);
      const body = Utils.el('div', {});

      body.appendChild(
        Utils.el('div', { class: 'book-detail' },
          Utils.el('img', { class: 'book-detail__cover', src: API.coverUrl(book.id), alt: book.title }),
          Utils.el('div', { class: 'book-detail__info' },
            Utils.el('div', { class: 'book-detail__title', text: book.title }),
            Utils.el('div', { class: 'book-detail__author', text: book.author || 'Autore sconosciuto' }),
            Utils.el('div', { class: 'progress-bar' }, Utils.el('span', { style: { width: `${progress}%` } })),
            Utils.el('div', { style: { fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' },
              text: `${FORMAT_LABEL[book.format] || book.format} · ${book.total_pages || 0} ${book.format === 'pdf' ? 'pagine' : 'sezioni'} · ${progress}%` })
          )
        )
      );

      const titleInput = Utils.el('input', { class: 'input', type: 'text', value: book.title });
      const authorInput = Utils.el('input', { class: 'input', type: 'text', value: book.author || '' });
      const tagsInput = Utils.el('input', {
        class: 'input', type: 'text', value: (book.tags || []).join(', '),
        placeholder: 'università, diritto, economia…',
      });

      const collectionSelect = Utils.el('select', { class: 'select' });
      collectionSelect.appendChild(Utils.el('option', { value: '', text: '— Nessuna —' }));
      Store.state.collections.forEach((c) => {
        const option = Utils.el('option', { value: c.id, text: c.name });
        if (book.collection_id === c.id) option.selected = true;
        collectionSelect.appendChild(option);
      });

      const stateSelect = Utils.el('select', { class: 'select' });
      [['unread', 'Da leggere'], ['reading', 'In corso'], ['finished', 'Completato']].forEach(([value, label]) => {
        const option = Utils.el('option', { value, text: label });
        if (book.state === value) option.selected = true;
        stateSelect.appendChild(option);
      });

      body.appendChild(
        Utils.el('div', { class: 'field-row' },
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Titolo' }), titleInput),
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Autore' }), authorInput)
        )
      );
      body.appendChild(
        Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Tag' }), tagsInput)
      );
      body.appendChild(
        Utils.el('div', { class: 'field-row' },
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Collezione' }), collectionSelect),
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Stato' }), stateSelect)
        )
      );

      if (meta.description) {
        body.appendChild(
          Utils.el('div', { class: 'field' },
            Utils.el('label', { text: 'Descrizione' }),
            Utils.el('div', { class: 'book-detail__desc', text: meta.description })
          )
        );
      }
      if ((book.tags || []).length) {
        const tagList = Utils.el('div', { class: 'tag-list' });
        book.tags.forEach((tag) => tagList.appendChild(Utils.el('span', { class: 'tag', text: tag })));
        body.appendChild(tagList);
      }

      UI.modal({
        title: 'Dettagli del libro',
        body,
        actions: [
          {
            label: 'Elimina',
            variant: 'danger',
            onClick: async () => {
              const ok = await UI.confirm('Eliminare libro', `Eliminare "${book.title}" e tutte le sue annotazioni?`, { danger: true, okLabel: 'Elimina' });
              if (!ok) return false;
              await API.deleteBook(book.id);
              await Store.loadBooks();
              UI.toast('Libro eliminato', 'ok');
              return true;
            },
          },
          { label: 'Annulla' },
          {
            label: 'Salva',
            variant: 'primary',
            onClick: async () => {
              await API.updateBook(book.id, {
                title: titleInput.value.trim() || book.title,
                author: authorInput.value.trim(),
                tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
                collection_id: collectionSelect.value ? Number(collectionSelect.value) : null,
                state: stateSelect.value,
              });
              await Store.loadBooks();
              UI.toast('Salvato', 'ok');
              return true;
            },
          },
        ],
      });
    },

    /* -------------------------------------------------------- import */
    importDialog() {
      const picker = Utils.el('input', { type: 'file', multiple: true, accept: '.pdf,.epub,.docx,.pptx,.txt,.md,.html' });
      picker.style.display = 'none';
      const pathInput = Utils.el('input', {
        class: 'input', type: 'text',
        placeholder: '/home/utente/Documenti/Libri',
      });
      const body = Utils.el('div', {},
        Utils.el('p', {
          style: { fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.6', marginBottom: '14px' },
          text: 'Seleziona i documenti dal computer oppure indica una cartella da indicizzare.',
        }),
        picker,
        Utils.el('button', { class: 'btn btn--primary', style: { width: '100%', marginBottom: '16px' }, text: 'Scegli file…', onClick: () => picker.click() }),
        Utils.el('div', { class: 'field' },
          Utils.el('label', { text: 'Oppure indicizza una cartella' }),
          pathInput
        )
      );

      // In app desktop (pywebview) usiamo il selettore di cartelle nativo
      if (global.pywebview && global.pywebview.api && global.pywebview.api.choose_folder) {
        const folderButton = Utils.el('button', {
          class: 'btn btn--ghost',
          style: { width: '100%', marginBottom: '10px' },
          text: 'Sfoglia cartelle…',
          onClick: async () => {
            const path = await global.pywebview.api.choose_folder();
            if (path) pathInput.value = path;
          },
        });
        body.insertBefore(folderButton, pathInput.parentElement);
      }

      UI.modal({
        title: 'Importa libri',
        body,
        actions: [
          { label: 'Annulla' },
          {
            label: 'Importa',
            variant: 'primary',
            onClick: async () => {
              const files = Array.from(picker.files || []);
              const path = pathInput.value.trim();
              if (!files.length && !path) {
                UI.toast('Scegli dei file o una cartella', 'warn');
                return false;
              }
              if (files.length) {
                const result = await API.importFiles(files);
                if (result.errors && result.errors.length) {
                  UI.toast(result.errors[0], 'err');
                }
                if (result.books.length) UI.toast(`${result.books.length} libro/i importati`, 'ok');
              }
              if (path) {
                const result = await API.scanFolder(path);
                if (result.books.length) UI.toast(`${result.books.length} libro/i trovati`, 'ok');
                else if (!files.length) UI.toast('Nessun nuovo libro trovato', 'warn');
              }
              await Store.loadBooks();
              return true;
            },
          },
        ],
      });
    },

    scanDialog() {
      const pathInput = Utils.el('input', { class: 'input', type: 'text', placeholder: '/home/utente/Documenti/Libri' });
      UI.modal({
        title: 'Aggiungi cartella',
        body: Utils.el('div', { class: 'field' },
          Utils.el('label', { text: 'Percorso della cartella' }),
          pathInput
        ),
        actions: [
          { label: 'Annulla' },
          {
            label: 'Indicizza',
            variant: 'primary',
            onClick: async () => {
              if (!pathInput.value.trim()) {
                UI.toast('Inserisci un percorso', 'warn');
                return false;
              }
              const result = await API.scanFolder(pathInput.value.trim());
              UI.toast(`${result.books.length} libro/i importati`, result.books.length ? 'ok' : 'warn');
              await Store.loadBooks();
              return true;
            },
          },
        ],
      });
    },

    newCollection() {
      const nameInput = Utils.el('input', { class: 'input', type: 'text', placeholder: 'Nome collezione' });
      const colors = ['#6e1e2e', '#8e2b3f', '#3f4a3c', '#2f4858', '#5a4632', '#46324f'];
      let color = colors[0];
      const swatches = Utils.el('div', { class: 'note-colors' });
      colors.forEach((value, index) => {
        const swatch = Utils.el('button', {
          class: `note-color${index === 0 ? ' is-active' : ''}`,
          style: { background: value },
          onClick: () => {
            color = value;
            Utils.$$('.note-color', swatches).forEach((s) => s.classList.remove('is-active'));
            swatch.classList.add('is-active');
          },
        });
        swatches.appendChild(swatch);
      });

      UI.modal({
        title: 'Nuova collezione',
        body: Utils.el('div', {},
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Nome' }), nameInput),
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Colore' }), swatches)
        ),
        actions: [
          { label: 'Annulla' },
          {
            label: 'Crea',
            variant: 'primary',
            onClick: async () => {
              if (!nameInput.value.trim()) {
                UI.toast('Inserisci un nome', 'warn');
                return false;
              }
              await API.createCollection({ name: nameInput.value.trim(), color });
              await Store.loadCollections();
              UI.toast('Collezione creata', 'ok');
              return true;
            },
          },
        ],
      });
    },
  };

  global.Library = Library;
})(window);
