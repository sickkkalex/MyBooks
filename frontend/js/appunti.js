/* MyBooks — sezione Appunti (note strutturate per capitolo/argomento) */
(function (global) {
  'use strict';

  const Appunti = {
    notes: [],
    current: null,
    dirty: false,

    init() {
      Utils.$('#btn-new-appunto').addEventListener('click', () => Appunti.edit(null));
      Utils.$('#appunti-search').addEventListener(
        'input',
        Utils.debounce((event) => {
          Appunti.query = event.target.value.trim();
          Appunti.renderList();
        }, 200)
      );
      Store.on('appunti', () => Appunti.renderList());
    },

    async load() {
      Appunti.notes = await API.studyNotes();
      Store.state.appunti = Appunti.notes;
      Store.emit('appunti', Appunti.notes);
      const badge = Utils.$('#badge-appunti');
      badge.textContent = Appunti.notes.length || '';
      badge.classList.toggle('is-on', Appunti.notes.length > 0);
      return Appunti.notes;
    },

    /* --------------------------------------------------------- lista */
    renderList() {
      const host = Utils.$('#appunti-list');
      host.innerHTML = '';
      const query = (Appunti.query || '').toLowerCase();
      const items = Appunti.notes.filter((note) => {
        if (!query) return true;
        return [note.title, note.body, note.topic, note.chapter, note.reference, note.book_title]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });

      if (!items.length) {
        host.appendChild(
          Utils.el('div', { class: 'appunto-empty' },
            Utils.el('h3', { text: Appunti.notes.length ? 'Nessun appunto trovato' : 'Ancora nessun appunto' }),
            Utils.el('p', {
              style: { fontSize: '12.5px', lineHeight: '1.6' },
              text: Appunti.notes.length
                ? 'Prova con un altro termine di ricerca.'
                : 'Crea un appunto per capitolo e argomento, incolla il brano o il collegamento a cui si riferisce.',
            })
          )
        );
        return;
      }

      items.forEach((note) => {
        const book = Store.bookById(note.book_id);
        const meta = Utils.el('div', { class: 'appunto-item__meta' });
        if (book) meta.appendChild(Utils.el('span', { class: 'appunto-item__chip', text: book.title }));
        if (note.chapter) meta.appendChild(Utils.el('span', { text: note.chapter }));
        if (note.topic) meta.appendChild(Utils.el('span', { class: 'appunto-item__chip', text: note.topic }));
        meta.appendChild(Utils.el('span', { text: Utils.formatDate(note.updated_at) }));

        const item = Utils.el('button', {
          class: `appunto-item${Appunti.current && Appunti.current.id === note.id ? ' is-active' : ''}`,
          onClick: () => Appunti.edit(note),
        },
          Utils.el('div', { class: 'appunto-item__title', text: note.title || 'Senza titolo' }),
          meta,
          note.body ? Utils.el('div', { class: 'appunto-item__excerpt', text: note.body }) : null
        );
        host.appendChild(item);
      });
    },

    /* -------------------------------------------------------- editor */
    edit(note) {
      Appunti.current = note;
      Appunti.dirty = false;
      const host = Utils.$('#appunti-editor');
      host.innerHTML = '';

      const book = note ? Store.bookById(note.book_id) : null;
      const draft = {
        book_id: note ? note.book_id : null,
        chapter: note ? note.chapter : '',
        topic: note ? note.topic : '',
        title: note ? note.title : '',
        body: note ? note.body : '',
        reference: note ? note.reference : '',
        page: note ? note.page : 0,
        color: note ? note.color : '#F4EBDD',
      };

      host.appendChild(
        Utils.el('div', { class: 'appunti-editor__title', text: note ? 'Modifica appunto' : 'Nuovo appunto' })
      );
      host.appendChild(
        Utils.el('div', { class: 'appunti-editor__sub', text: 'Appunto legato a un capitolo e a un argomento: puoi incollare il brano di testo o il collegamento esatto da cui deriva.' })
      );

      const bookSelect = Utils.el('select', { class: 'select' });
      bookSelect.appendChild(Utils.el('option', { value: '', text: '— Nessun libro —' }));
      Store.state.books.forEach((b) => {
        const option = Utils.el('option', { value: b.id, text: b.title });
        if (draft.book_id === b.id) option.selected = true;
        bookSelect.appendChild(option);
      });
      bookSelect.addEventListener('change', () => {
        draft.book_id = bookSelect.value ? Number(bookSelect.value) : null;
        Appunti.renderChapters();
      });

      const chapterInput = Utils.el('input', { class: 'input', type: 'text', value: draft.chapter, placeholder: 'Es. Capitolo 3 — Le fonti del diritto' });
      chapterInput.addEventListener('input', () => { draft.chapter = chapterInput.value; });
      const topicInput = Utils.el('input', { class: 'input', type: 'text', value: draft.topic, placeholder: 'Es. Efficacia degli atti amministrativi' });
      topicInput.addEventListener('input', () => { draft.topic = topicInput.value; });
      const titleInput = Utils.el('input', { class: 'input', type: 'text', value: draft.title, placeholder: 'Titolo dell appunto' });
      titleInput.addEventListener('input', () => { draft.title = titleInput.value; });
      const bodyInput = Utils.el('textarea', { class: 'textarea', style: { minHeight: '180px' }, placeholder: 'Scrivi qui i tuoi appunti…' });
      bodyInput.value = draft.body;
      bodyInput.addEventListener('input', () => { draft.body = bodyInput.value; });

      const referenceInput = Utils.el('textarea', {
        class: 'textarea',
        style: { minHeight: '96px' },
        placeholder: 'Incolla qui il brano di testo, il link a una risorsa o il collegamento MyBooks (mybooks://libro/12?pagina=34)',
      });
      referenceInput.value = draft.reference;
      referenceInput.addEventListener('input', () => {
        draft.reference = referenceInput.value;
        Appunti.renderLinkPill();
      });

      const linkPill = Utils.el('div', { class: 'appunti-reference__tools' });
      const referenceBlock = Utils.el('div', { class: 'field' },
        Utils.el('label', { text: 'Riferimento (testo, link o collegamento al libro)' }),
        Utils.el('div', { class: 'appunti-reference' }, referenceInput, linkPill)
      );

      const chapterBlock = Utils.el('div', { class: 'field' },
        Utils.el('label', { text: 'Capitolo' }),
        chapterInput
      );
      const chaptersHost = Utils.el('div', { class: 'chapter-list' });
      chapterBlock.appendChild(chaptersHost);

      host.appendChild(Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Libro' }), bookSelect));
      host.appendChild(
        Utils.el('div', { class: 'field-row' },
          chapterBlock,
          Utils.el('div', { class: 'field' },
            Utils.el('label', { text: 'Argomento' }),
            topicInput
          )
        )
      );
      host.appendChild(Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Titolo' }), titleInput));
      host.appendChild(Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Contenuto' }), bodyInput));
      host.appendChild(referenceBlock);

      Appunti.chaptersHost = chaptersHost;
      Appunti.linkPill = linkPill;
      Appunti.draft = draft;
      Appunti.renderChapters();
      Appunti.renderLinkPill();

      // azioni
      const foot = Utils.el('div', { class: 'appunti-editor__foot' });
      const left = Utils.el('div', { class: 'appunti-editor__foot-actions' });

      left.appendChild(
        Utils.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: 'Incolla',
          title: 'Incolla dagli appunti di sistema',
          onClick: async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text) {
                referenceInput.value = text;
                draft.reference = text;
                Appunti.renderLinkPill();
                referenceInput.focus();
              } else {
                UI.toast('Appunti di sistema vuoti', 'warn');
              }
            } catch (err) {
              UI.toast('Impossibile accedere agli appunti', 'warn');
            }
          },
        })
      );

      left.appendChild(
        Utils.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: 'Copia collegamento',
          title: 'Copia il collegamento a questa posizione del libro',
          onClick: async () => {
            if (!draft.book_id) {
              UI.toast('Scegli prima un libro', 'warn');
              return;
            }
            const link = await API.buildLink(draft.book_id, draft.page || 0);
            try {
              await navigator.clipboard.writeText(link);
              UI.toast('Collegamento copiato', 'ok');
            } catch (err) {
              referenceInput.value = link;
              draft.reference = link;
              Appunti.renderLinkPill();
            }
          },
        })
      );

      left.appendChild(
        Utils.el('button', {
          class: 'btn btn--ghost btn--sm',
          text: 'Apri nel libro',
          onClick: () => {
            if (!draft.book_id) {
              UI.toast('Scegli prima un libro', 'warn');
              return;
            }
            Appunti.openInBook(draft);
          },
        })
      );

      if (note) {
        left.appendChild(
          Utils.el('button', {
            class: 'btn btn--danger btn--sm',
            text: 'Elimina',
            onClick: async () => {
              const ok = await UI.confirm('Eliminare appunto', 'Eliminare definitivamente questo appunto?', { danger: true, okLabel: 'Elimina' });
              if (!ok) return;
              await API.deleteStudyNote(note.id);
              Appunti.current = null;
              await Appunti.load();
              Appunti.edit(null);
              UI.toast('Appunto eliminato');
            },
          })
        );
      }

      const actions = Utils.el('div', { class: 'appunti-editor__foot-actions' });
      actions.appendChild(
        Utils.el('button', {
          class: 'btn btn--primary btn--sm',
          text: 'Salva appunto',
          onClick: async () => {
            if (!draft.title.trim() && !draft.body.trim()) {
              UI.toast('Scrivi un titolo o un contenuto', 'warn');
              return;
            }
            const payload = {
              book_id: draft.book_id,
              chapter: draft.chapter,
              topic: draft.topic,
              title: draft.title,
              body: draft.body,
              reference: draft.reference,
              page: draft.page,
              color: draft.color,
            };
            if (note) await API.updateStudyNote(note.id, payload);
            else await API.createStudyNote(payload);
            await Appunti.load();
            Appunti.current = { ...payload, id: note ? note.id : Date.now() };
            Appunti.renderList();
            const title = Utils.$('.appunti-editor__title');
            if (title) title.textContent = 'Appunto salvato';
            UI.toast('Appunto salvato', 'ok');
          },
        })
      );

      foot.appendChild(left);
      foot.appendChild(actions);
      host.appendChild(foot);
    },

    /** Mostra i capitoli del libro selezionato come suggerimenti rapidi. */
    async renderChapters() {
      const host = Appunti.chaptersHost;
      if (!host) return;
      host.innerHTML = '';
      const bookId = Appunti.draft ? Appunti.draft.book_id : null;
      if (!bookId) return;
      const book = Store.bookById(bookId);
      if (!book) return;
      let outline = book.outline || [];
      if (!outline.length) {
        try {
          outline = await API.outline(bookId);
        } catch (err) {
          outline = [];
        }
      }
      outline.slice(0, 12).forEach((node) => {
        host.appendChild(
          Utils.el('button', {
            class: 'chapter-chip',
            text: node.title,
            onClick: () => {
              Appunti.draft.chapter = node.title;
              const input = host.parentElement.querySelector('input');
              if (input) input.value = node.title;
            },
          })
        );
      });
    },

    /** Riconosce un collegamento MyBooks dentro il riferimento. */
    renderLinkPill() {
      const host = Appunti.linkPill;
      if (!host) return;
      host.innerHTML = '';
      const reference = Appunti.draft ? Appunti.draft.reference : '';
      const match = /mybooks:\/\/libro\/(\d+)(?:\?pagina=(\d+))?/i.exec(reference || '');
      if (!match) return;
      host.appendChild(
        Utils.el('span', { class: 'link-pill' },
          Utils.el('span', { text: 'Collegamento interno' }),
          Utils.el('button', {
            class: 'icon-btn icon-btn--tiny',
            title: 'Apri nel libro',
            html: '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M8 5h11v11M19 5 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            onClick: () => Appunti.openInBook({ book_id: Number(match[1]), page: Number(match[2] || 0) }),
          })
        )
      );
    },

    openInBook(draft) {
      const book = Store.bookById(draft.book_id);
      if (!book) {
        UI.toast('Libro non trovato', 'err');
        return;
      }
      global.Reader.open(book).then(() => {
        if (draft.page) setTimeout(() => global.Reader.jumpToPage(draft.page), 450);
      });
    },

    /** Apre un appunto nuovo a partire dalla posizione corrente del lettore. */
    fromReader(book, page, chapterTitle, reference) {
      Appunti.showView();
      Appunti.edit(null);
      Appunti.draft.book_id = book.id;
      Appunti.draft.page = page;
      Appunti.draft.chapter = chapterTitle || '';
      Appunti.draft.reference = reference || '';
      const select = Utils.$('#appunti-editor select');
      if (select) select.value = String(book.id);
      const inputs = Utils.$$('#appunti-editor input');
      if (inputs[0]) inputs[0].value = Appunti.draft.chapter;
      if (inputs[1]) inputs[1].value = Appunti.draft.topic;
      if (inputs[2]) inputs[2].value = Appunti.draft.title;
      const areas = Utils.$$('#appunti-editor textarea');
      if (areas[0]) areas[0].value = Appunti.draft.body;
      if (areas[1]) areas[1].value = Appunti.draft.reference;
      Appunti.renderChapters();
      Appunti.renderLinkPill();
    },

    showView() {
      if (global.App) global.App.showView('appunti');
    },
  };

  global.Appunti = Appunti;
})(window);
