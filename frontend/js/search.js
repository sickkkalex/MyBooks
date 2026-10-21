/* MyBooks — ricerca globale */
(function (global) {
  'use strict';

  const Search = {
    scope: 'all',
    query: '',

    init() {
      const input = Utils.$('#global-search');
      input.addEventListener('input', Utils.debounce((event) => {
        Search.query = event.target.value.trim();
        Search.run();
      }, 260));

      Utils.$$('#search-scope .chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          Utils.$$('#search-scope .chip').forEach((c) => c.classList.remove('is-active'));
          chip.classList.add('is-active');
          Search.scope = chip.dataset.scope;
          Search.run();
        });
      });
    },

    focus() {
      const input = Utils.$('#global-search');
      input.focus();
      input.select();
    },

    async run() {
      const host = Utils.$('#search-results');
      if (!Search.query) {
        host.innerHTML = '';
        host.appendChild(
          Utils.el('div', { class: 'empty-state' },
            Utils.el('h2', { text: 'Ricerca globale' }),
            Utils.el('p', { text: 'Cerca tra titoli, autori, note, evidenziazioni e l’intero testo dei documenti importati.' })
          )
        );
        return;
      }
      host.innerHTML = '';
      host.appendChild(Utils.el('div', { class: 'spinner' }));

      let results;
      try {
        results = await API.search(Search.query);
      } catch (err) {
        host.innerHTML = '';
        UI.toast('Ricerca non riuscita', 'err');
        return;
      }
      host.innerHTML = '';

      const show = (scope) => Search.scope === 'all' || Search.scope === scope;

      if (show('books') && results.books.length) {
        host.appendChild(Search.group('Libri', results.books.map((book) => {
          const item = Utils.el('div', { class: 'result' },
            Utils.el('img', { class: 'result__thumb', src: API.coverUrl(book.id), alt: '' }),
            Utils.el('div', { class: 'result__body' },
              Utils.el('div', { class: 'result__title', html: Utils.highlight(book.title, Search.query) }),
              Utils.el('div', { class: 'result__snippet', html: Utils.highlight(book.author || '', Search.query) }),
              Utils.el('div', { class: 'result__meta', text: `${book.format.toUpperCase()} · ${book.total_pages || 0} pagine` })
            )
          );
          item.addEventListener('click', () => global.Reader.open(book));
          return item;
        })));
      }

      if (show('notes') && results.notes.length) {        host.appendChild(Search.group('Note', results.notes.map((note) => {
          const book = Store.bookById(note.book_id);
          const item = Utils.el('div', { class: 'result' },
            Utils.el('div', { class: 'result__body' },
              Utils.el('div', { class: 'result__title', html: Utils.highlight(note.title || 'Senza titolo', Search.query) }),
              Utils.el('div', { class: 'result__snippet', html: Utils.highlight(note.body || '', Search.query) }),
              Utils.el('div', { class: 'result__meta', text: book ? book.title : 'Nota personale' })
            )
          );
          item.addEventListener('click', () => {
            const view = Utils.$('#view-notes');
            if (book) global.Reader.open(book);
            else {
              App.showView('notes');
              view.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
          return item;
        })));
      }

      if (show('notes') && results.annotations.length) {
        host.appendChild(Search.group('Evidenziazioni', results.annotations.map((mark) => {
          const book = Store.bookById(mark.book_id);
          const item = Utils.el('div', { class: 'result' },
            Utils.el('div', { class: 'result__body' },
              Utils.el('div', { class: 'result__title', html: Utils.highlight(mark.text || '(annotazione)', Search.query) }),
              Utils.el('div', { class: 'result__meta', text: `${mark.book_title || ''} · pagina ${(mark.page || 0) + 1}` })
            )
          );
          item.addEventListener('click', () => {
            if (!book) return;
            global.Reader.open(book).then(() => {
              setTimeout(() => global.Reader.jumpToPage(mark.page || 0), 500);
            });
          });
          return item;
        })));
      }

      if (show('appunti') && results.appunti && results.appunti.length) {
        host.appendChild(Search.group('Appunti', results.appunti.map((note) => {
          const book = Store.bookById(note.book_id);
          const item = Utils.el('div', { class: 'result' },
            Utils.el('div', { class: 'result__body' },
              Utils.el('div', { class: 'result__title', html: Utils.highlight(note.title || 'Senza titolo', Search.query) }),
              Utils.el('div', { class: 'result__snippet', html: Utils.highlight(note.body || '', Search.query) }),
              Utils.el('div', { class: 'result__meta', text: [book ? book.title : '', note.chapter, note.topic].filter(Boolean).join(' · ') })
            )
          );
          item.addEventListener('click', () => {
            global.App.showView('appunti');
            if (global.Appunti) global.Appunti.edit(note);
          });
          return item;
        })));
      }

      if (show('passages') && results.passages.length) {
        host.appendChild(Search.group('Nel testo dei documenti', results.passages.map((passage) => {
          const book = Store.bookById(passage.book_id);
          const item = Utils.el('div', { class: 'result' },
            Utils.el('div', { class: 'result__body' },
              Utils.el('div', { class: 'result__title', html: Utils.highlight(book ? book.title : 'Documento', Search.query) }),
              Utils.el('div', { class: 'result__snippet', html: Utils.highlight(passage.snippet || '', Search.query) })
            )
          );
          item.addEventListener('click', () => {
            if (!book) return;
            global.Reader.open(book);
          });
          return item;
        })));
      }

      if (!host.children.length) {
        host.appendChild(
          Utils.el('div', { class: 'empty-state' },
            Utils.el('h2', { text: 'Nessun risultato' }),
            Utils.el('p', { text: `Non abbiamo trovato nulla per "${Search.query}".` })
          )
        );
      }
    },

    group(title, items) {
      return Utils.el('div', { class: 'search-group' },
        Utils.el('div', { class: 'search-group__title', text: title }),
        Utils.el('div', { class: 'result-list' }, items)
      );
    },
  };

  global.Search = Search;
})(window);
