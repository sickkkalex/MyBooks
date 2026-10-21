/* MyBooks — stato applicativo e bus eventi */
(function (global) {
  'use strict';

  const listeners = new Map();

  const Store = {
    state: {
      view: 'library',
      books: [],
      collections: [],
      notes: [],
      cards: [],
      filter: {
        state: '',
        format: '',
        collection: null,
        search: '',
        sort: 'recent',
      },
      layout: 'grid',
      settings: {
        theme: 'light',
        pageTheme: 'paper',
        fontSize: 100,
        fontFamily: 'serif',
        leading: 'normal',
        accent: '#6e1e2e',
      },
      reader: null,
    },

    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event).delete(handler);
    },

    emit(event, payload) {
      (listeners.get(event) || []).forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[MyBooks] listener "${event}"`, err);
        }
      });
    },

    set(patch) {
      Object.assign(Store.state, patch);
      Store.emit('state', Store.state);
    },

    /** Libri filtrati in base ai filtri attivi. */
    filteredBooks() {
      const { filter } = Store.state;
      let books = Store.state.books.slice();
      if (filter.state) books = books.filter((b) => b.state === filter.state);
      if (filter.format) books = books.filter((b) => b.format === filter.format);
      if (filter.collection !== null && filter.collection !== undefined) {
        books = books.filter((b) => b.collection_id === filter.collection);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        books = books.filter(
          (b) =>
            (b.title || '').toLowerCase().includes(q) ||
            (b.author || '').toLowerCase().includes(q) ||
            (b.tags || []).some((t) => String(t).toLowerCase().includes(q))
        );
      }
      const sorters = {
        recent: (a, b) => (b.last_opened || b.added_at || '').localeCompare(a.last_opened || a.added_at || ''),
        added: (a, b) => (b.added_at || '').localeCompare(a.added_at || ''),
        title: (a, b) => (a.title || '').localeCompare(b.title || '', 'it'),
        author: (a, b) => (a.author || '').localeCompare(b.author || '', 'it'),
        progress: (a, b) => (b.progress || 0) - (a.progress || 0),
      };
      books.sort(sorters[Store.state.filter.sort] || sorters.recent);
      return books;
    },

    bookById(id) {
      return Store.state.books.find((b) => b.id === Number(id)) || null;
    },

    async loadBooks() {
      Store.state.books = await API.books();
      Store.emit('books', Store.state.books);
      return Store.state.books;
    },

    async loadCollections() {
      Store.state.collections = await API.collections();
      Store.emit('collections', Store.state.collections);
      return Store.state.collections;
    },

    async loadSettings() {
      const stored = await API.settings();
      const settings = Object.assign({}, Store.state.settings, stored);
      // i valori salvati su SQLite sono stringhe: i numeri vanno convertiti
      ['fontSize'].forEach((key) => {
        if (settings[key] !== undefined && settings[key] !== null && settings[key] !== '') {
          const value = Number(settings[key]);
          settings[key] = Number.isFinite(value) ? value : Store.state.settings[key];
        }
      });
      Store.state.settings = settings;
      applySettings(settings);
      return settings;
    },

    async saveSettings(patch) {
      const settings = Object.assign({}, Store.state.settings, patch);
      Store.state.settings = settings;
      applySettings(settings);
      await API.saveSettings(patch);
      return settings;
    },
  };

  function applySettings(settings) {
    document.documentElement.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.style.setProperty('--bordeaux', settings.accent || '#6e1e2e');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', settings.accent || '#6e1e2e');
  }

  global.Store = Store;
})(window);
