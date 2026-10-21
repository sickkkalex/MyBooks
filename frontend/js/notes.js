/* MyBooks — vista note */
(function (global) {
  'use strict';

  const NOTE_COLORS = ['#F4EBDD', '#FBE7C7', '#DCEBCF', '#DCE7F3', '#F2DDE6', '#EADCF2'];

  const Notes = {
    notes: [],

    init() {
      Utils.$('#btn-new-note').addEventListener('click', () => Notes.edit(null));
      Utils.$('#btn-export-notes').addEventListener('click', () => {
        const link = Utils.el('a', { href: '/api/export?format=markdown', download: 'mybooks-appunti.md' });
        document.body.appendChild(link);
        link.click();
        link.remove();
        UI.toast('Esportazione avviata', 'ok');
      });
      Store.on('notes', () => Notes.render());
    },

    async load() {
      Notes.notes = await API.notes();
      Store.state.notes = Notes.notes;
      Store.emit('notes', Notes.notes);
      const badge = Utils.$('#badge-notes');
      badge.textContent = Notes.notes.length || '';
      badge.classList.toggle('is-on', Notes.notes.length > 0);
      return Notes.notes;
    },

    render() {
      const grid = Utils.$('#notes-grid');
      grid.innerHTML = '';
      if (!Notes.notes.length) {
        grid.appendChild(
          Utils.el('div', { class: 'empty-state' },
            Utils.el('h2', { text: 'Nessuna nota' }),
            Utils.el('p', { text: 'Crea note durante la lettura o clicca "Nuova nota".' })
          )
        );
        return;
      }
      Notes.notes.forEach((note, index) => grid.appendChild(Notes.card(note, index)));
    },

    card(note, index) {
      const book = Store.bookById(note.book_id);
      const card = Utils.el('div', {
        class: 'note-card',
        style: { '--i': index, '--note-color': note.color || '#6e1e2e' },
      });

      card.appendChild(
        Utils.el('div', { class: 'note-card__title', text: note.title || 'Senza titolo' })
      );
      card.appendChild(Utils.el('div', { class: 'note-card__body', text: note.body || '' }));

      const actions = Utils.el('div', { class: 'note-card__actions' });
      actions.appendChild(
        Utils.el('button', {
          class: 'icon-btn icon-btn--tiny',
          title: note.pinned ? 'Rimuovi dalla preferiti' : 'Fissa in alto',
          html: note.pinned
            ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 3h6l-1 6 3.5 3.5H6.5L10 9zM12 12.5V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 3h6l-1 6 3.5 3.5H6.5L10 9zM12 12.5V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" opacity=".5"/></svg>',
          onClick: async (event) => {
            event.stopPropagation();
            await API.updateNote(note.id, { pinned: !note.pinned });
            await Notes.load();
          },
        })
      );
      actions.appendChild(
        Utils.el('button', {
          class: 'icon-btn icon-btn--tiny',
          title: 'Modifica',
          html: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
          onClick: (event) => {
            event.stopPropagation();
            Notes.edit(note);
          },
        })
      );
      actions.appendChild(
        Utils.el('button', {
          class: 'icon-btn icon-btn--tiny',
          title: 'Elimina',
          html: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
          onClick: async (event) => {
            event.stopPropagation();
            const ok = await UI.confirm('Eliminare nota', 'Eliminare definitivamente questa nota?', { danger: true, okLabel: 'Elimina' });
            if (!ok) return;
            await API.deleteNote(note.id);
            await Notes.load();
          },
        })
      );

      const foot = Utils.el('div', { class: 'note-card__foot' });
      foot.appendChild(
        Utils.el('span', {
          text: book ? book.title : 'Nota personale',
        })
      );
      foot.appendChild(actions);
      card.appendChild(foot);

      card.addEventListener('click', () => {
        if (book) {
          global.Reader.open(book);
        } else {
          Notes.edit(note);
        }
      });
      return card;
    },

    edit(note) {
      const titleInput = Utils.el('input', { class: 'input', type: 'text', value: note ? note.title : '', placeholder: 'Titolo' });
      const bodyInput = Utils.el('textarea', { class: 'textarea', placeholder: 'Scrivi la nota…' });
      bodyInput.value = note ? note.body || '' : '';
      const tagsInput = Utils.el('input', { class: 'input', type: 'text', value: note ? (note.tags || []).join(', ') : '', placeholder: 'argomenti, esame…' });
      let color = note ? note.color || NOTE_COLORS[0] : NOTE_COLORS[0];
      let bookId = note ? note.book_id : null;

      const colors = Utils.el('div', { class: 'note-colors' });
      NOTE_COLORS.forEach((value) => {
        const swatch = Utils.el('button', {
          class: `note-color${value === color ? ' is-active' : ''}`,
          style: { background: value },
          onClick: () => {
            color = value;
            Utils.$$('.note-color', colors).forEach((s) => s.classList.remove('is-active'));
            swatch.classList.add('is-active');
          },
        });
        colors.appendChild(swatch);
      });

      const select = Utils.el('select', { class: 'select' });
      select.appendChild(Utils.el('option', { value: '', text: '— Nessun libro —' }));
      Store.state.books.forEach((book) => {
        const option = Utils.el('option', { value: book.id, text: book.title });
        if (bookId === book.id) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        bookId = select.value ? Number(select.value) : null;
      });

      const body = Utils.el('div', {},
        Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Titolo' }), titleInput),
        Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Contenuto' }), bodyInput),
        Utils.el('div', { class: 'field-row' },
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Colore' }), colors),
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Libro' }), select)
        ),
        Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Argomenti' }), tagsInput)
      );

      UI.modal({
        title: note ? 'Modifica nota' : 'Nuova nota',
        body,
        actions: [
          { label: 'Annulla' },
          {
            label: 'Salva',
            variant: 'primary',
            onClick: async () => {
              const payload = {
                title: titleInput.value.trim(),
                body: bodyInput.value,
                color,
                tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
                book_id: bookId,
                page: note ? note.page : 0,
              };
              if (note) await API.updateNote(note.id, payload);
              else await API.createNote(payload);
              await Notes.load();
              UI.toast('Nota salvata', 'ok');
              return true;
            },
          },
        ],
      });
    },
  };

  global.Notes = Notes;
})(window);
