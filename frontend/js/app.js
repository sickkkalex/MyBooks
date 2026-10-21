/* MyBooks — avvio e routing dell'applicazione */
(function (global) {
  'use strict';

  const App = {
    async boot() {
      Library.init();
      Notes.init();
      Appunti.init();
      Flashcards.init();
      Search.init();
      Reader.init();

      App.initNav();
      App.initShortcuts();
      App.initDropzone();

      Utils.$('#btn-settings').addEventListener('click', App.openSettings);
      Utils.$('#btn-theme').addEventListener('click', App.toggleTheme);

      try {
        await Store.loadSettings();
        await Store.loadCollections();
        await Store.loadBooks();
        await Notes.load();
        await Appunti.load();
        await Flashcards.load();
        App.syncTypography();
      } catch (err) {
        console.error(err);
        UI.toast('Impossibile caricare la libreria', 'err');
      }

      App.showView('library');
      App.handleHash();
      window.addEventListener('hashchange', App.handleHash);
    },

    /** Passa da tema chiaro a scuro (e viceversa). */
    async toggleTheme() {
      const current = Store.state.settings.theme === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      await Store.saveSettings({ theme: next });
      App.syncThemeButton();
      UI.toast(next === 'dark' ? 'Tema scuro' : 'Tema chiaro');
    },

    syncThemeButton() {
      const button = Utils.$('#btn-theme');
      if (!button) return;
      const dark = Store.state.settings.theme === 'dark';
      button.querySelector('.icon-sun').style.display = dark ? 'none' : '';
      button.querySelector('.icon-moon').style.display = dark ? '' : 'none';
      button.title = dark ? 'Passa al tema chiaro' : 'Passa al tema scuro';
    },

    /** Apre un libro da un collegamento profondo (#libro/<id>/<pagina>). */
    async handleHash() {
      const hash = window.location.hash.replace(/^#/, '');
      const match = /^libro\/(\d+)(?:\/(\d+))?/.exec(hash);
      if (!match) return;
      const book = Store.bookById(Number(match[1]));
      if (!book) return;
      const page = match[2] ? Number(match[2]) : 0;
      await global.Reader.open(book);
      if (page) setTimeout(() => global.Reader.jumpToPage(page), 450);
    },

    initNav() {
      Utils.$$('#sidebar-nav .nav-item').forEach((item) => {
        item.addEventListener('click', () => App.showView(item.dataset.view));
      });
    },

    showView(name) {
      Utils.$$('#sidebar-nav .nav-item').forEach((item) => {
        item.classList.toggle('is-active', item.dataset.view === name);
      });
      Utils.$$('.view').forEach((view) => view.classList.remove('is-active'));
      const target = Utils.$(`#view-${name}`);
      if (target) {
        target.classList.add('is-active');
        target.scrollTop = 0;
      }
      if (name === 'notes') Notes.render();
      if (name === 'appunti') Appunti.renderList();
      if (name === 'flashcards') Flashcards.render();
      if (name === 'stats') App.renderStats();
      if (name === 'reading') Library.renderReading();
      if (name === 'search') Search.run();
    },

    initShortcuts() {
      document.addEventListener('keydown', (event) => {
        const meta = event.metaKey || event.ctrlKey;
        if (meta && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          App.showView('search');
          Search.focus();
        }
        if (meta && event.key.toLowerCase() === 'o') {
          event.preventDefault();
          Library.importDialog();
        }
        if (event.key === '/' && !Utils.$('#reader').hidden === false) {
          const target = event.target;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
          event.preventDefault();
          App.showView('search');
          Search.focus();
        }
      });
    },

    initDropzone() {
      const zone = Utils.$('#dropzone');
      let depth = 0;
      window.addEventListener('dragenter', (event) => {
        if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
        depth += 1;
        zone.hidden = false;
      });
      window.addEventListener('dragover', (event) => event.preventDefault());
      window.addEventListener('dragleave', () => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) zone.hidden = true;
      });
      window.addEventListener('drop', async (event) => {
        event.preventDefault();
        depth = 0;
        zone.hidden = true;
        const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
        if (!files.length) return;
        const result = await API.importFiles(files);
        await Store.loadBooks();
        if (result.errors && result.errors.length) UI.toast(result.errors[0], 'err');
        if (result.books.length) UI.toast(`${result.books.length} libro/i importati`, 'ok');
      });
    },

    syncTypography() {
      const settings = Store.state.settings;
      App.syncThemeButton();
      Utils.$('#typo-size').textContent = `${settings.fontSize || 100}%`;
      Utils.$$('.popover__choice[data-font]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.font === (settings.fontFamily || 'serif'));
      });
      Utils.$$('.popover__choice[data-leading]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.leading === (settings.leading || 'normal'));
      });
      Utils.$$('.page-theme').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.pageTheme === (settings.pageTheme || 'paper'));
      });
    },

    async renderStats() {
      const host = Utils.$('#stats-grid');
      let stats;
      try {
        stats = await API.stats();
      } catch (err) {
        return;
      }
      host.innerHTML = '';
      const cards = [
        { label: 'Libri', value: stats.books, hint: `${stats.finished} completati` },
        { label: 'Evidenziazioni', value: stats.highlights, hint: 'momenti chiave salvati' },
        { label: 'Note', value: stats.notes, hint: 'appunti personali' },
        { label: 'Tempo di studio', value: Utils.formatDuration(stats.minutes), hint: `${stats.pages} pagine lette` },
      ];
      cards.forEach((card, index) => {
        host.appendChild(
          Utils.el('div', { class: 'stat-card', style: { '--i': index } },
            Utils.el('div', { class: 'stat-card__label', text: card.label }),
            Utils.el('div', { class: 'stat-card__value', text: String(card.value) }),
            Utils.el('div', { class: 'stat-card__hint', text: card.hint })
          )
        );
      });

      const history = stats.history || [];
      if (history.length) {
        const max = Math.max(...history.map((h) => h.seconds || 0), 60);
        const bars = Utils.el('div', { class: 'chart__bars' });
        const labels = Utils.el('div', { class: 'chart__labels' });
        history.slice(-14).forEach((entry, index) => {
          const minutes = Math.round((entry.seconds || 0) / 60);
          bars.appendChild(
            Utils.el('div', {
              class: 'chart__bar',
              title: `${entry.day}: ${minutes} min`,
              style: { height: `${Math.max(4, ((entry.seconds || 0) / max) * 100)}%`, animationDelay: `${index * 45}ms` },
            })
          );
          labels.appendChild(
            Utils.el('div', { class: 'chart__label', text: String(entry.day).slice(5) })
          );
        });
        host.appendChild(
          Utils.el('div', { class: 'chart' },
            Utils.el('div', { class: 'stat-card__label', text: 'Minuti di studio per giorno' }),
            bars,
            labels
          )
        );
      }
    },

    openSettings() {
      const settings = Store.state.settings;
      let theme = settings.theme || 'light';
      let accent = settings.accent || '#6e1e2e';

      const accents = ['#6e1e2e', '#8e2b3f', '#3f4a3c', '#2f4858', '#46324f', '#1f1f1f'];
      const accentRow = Utils.el('div', { class: 'note-colors' });
      accents.forEach((value) => {
        const swatch = Utils.el('button', {
          class: `note-color${value === accent ? ' is-active' : ''}`,
          style: { background: value },
          onClick: async () => {
            accent = value;
            Utils.$$('.note-color', accentRow).forEach((s) => s.classList.remove('is-active'));
            swatch.classList.add('is-active');
            await Store.saveSettings({ accent: value });
          },
        });
        accentRow.appendChild(swatch);
      });

      const themeSwitch = Utils.el('div', { class: 'theme-switch' });
      [['light', 'Chiaro'], ['dark', 'Scuro']].forEach(([value, label]) => {
        const button = Utils.el('button', {
          class: theme === value ? 'is-active' : '',
          text: label,
          onClick: async () => {
            theme = value;
            Utils.$$('button', themeSwitch).forEach((b) => b.classList.remove('is-active'));
            button.classList.add('is-active');
            // applicazione immediata: si vede subito l'effetto
            await Store.saveSettings({ theme: value });
            App.syncThemeButton();
          },
        });
        themeSwitch.appendChild(button);
      });

      const body = Utils.el('div', {},
        Utils.el('div', { class: 'settings-group' },
          Utils.el('h4', { text: 'Aspetto' }),
          Utils.el('div', { class: 'setting-row' },
            Utils.el('div', {},
              Utils.el('div', { class: 'setting-row__label', text: 'Tema' }),
              Utils.el('div', { class: 'setting-row__hint', text: 'Chiaro in stile Apple Books o scuro per studiare di sera' })
            ),
            themeSwitch
          ),
          Utils.el('div', { class: 'setting-row' },
            Utils.el('div', {},
              Utils.el('div', { class: 'setting-row__label', text: 'Colore d\'accento' }),
              Utils.el('div', { class: 'setting-row__hint', text: 'Bordeaux è il tono predefinito' })
            ),
            accentRow
          )
        ),
        Utils.el('div', { class: 'settings-group' },
          Utils.el('h4', { text: 'Lettura' }),
          Utils.el('div', { class: 'setting-row' },
            Utils.el('div', {},
              Utils.el('div', { class: 'setting-row__label', text: 'Tema pagina' }),
              Utils.el('div', { class: 'setting-row__hint', text: 'Bianco, beige o notte per gli e-book' })
            ),
            Utils.el('div', { class: 'theme-switch' },
              ...['paper', 'sepia', 'night'].map((value) => {
                const button = Utils.el('button', {
                  class: (settings.pageTheme || 'paper') === value ? 'is-active' : '',
                  text: { paper: 'Bianco', sepia: 'Beige', night: 'Notte' }[value],
                  onClick: async (event) => {
                    Utils.$$('button', event.target.parentElement).forEach((b) => b.classList.remove('is-active'));
                    button.classList.add('is-active');
                    await Store.saveSettings({ pageTheme: value });
                    App.syncTypography();
                  },
                });
                return button;
              })
            )
          ),
          Utils.el('div', { class: 'setting-row' },
            Utils.el('div', {},
              Utils.el('div', { class: 'setting-row__label', text: 'Dimensione testo' }),
              Utils.el('div', { class: 'setting-row__hint', text: 'Percentuale rispetto alla dimensione predefinita' })
            ),
            Utils.el('div', { class: 'theme-switch' },
              Utils.el('button', { text: 'A−', onClick: () => Reader.changeFontSize(-8) }),
              Utils.el('button', { text: 'A+', onClick: () => Reader.changeFontSize(8) })
            )
          )
        ),
        Utils.el('div', { class: 'settings-group' },
          Utils.el('h4', { text: 'Scorciatoie' }),
          Utils.el('div', { class: 'setting-row' },
            Utils.el('div', {},
              Utils.el('div', { class: 'setting-row__label', text: 'Strumenti annotazione' }),
              Utils.el('div', { class: 'setting-row__hint', text: 'V seleziona · H evidenzia · U sottolinea · S barrato · R forma · P penna · T testo · N post-it · E gomma' })
            )
          ),
          Utils.el('div', { class: 'setting-row' },
            Utils.el('div', {},
              Utils.el('div', { class: 'setting-row__label', text: 'Navigazione' }),
              Utils.el('div', { class: 'setting-row__hint', text: 'Frecce / spazio per cambiare pagina · ⌘K ricerca · ⌘O importa · Esc chiudi' })
            )
          )
        )
      );

      UI.modal({
        title: 'Impostazioni',
        body,
        actions: [
          { label: 'Chiudi' },
          {
            label: 'Salva',
            variant: 'primary',
            onClick: async () => {
              await Store.saveSettings({ theme, accent });
              UI.toast('Impostazioni salvate', 'ok');
              return true;
            },
          },
        ],
      });
    },
  };

  global.App = App;

  document.addEventListener('DOMContentLoaded', () => {
    App.boot().catch((err) => console.error(err));
  });
})(window);
