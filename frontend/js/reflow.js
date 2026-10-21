/* MyBooks — lettore reflowable (EPUB, DOCX, PPTX, TXT) con paginazione a colonne */
(function (global) {
  'use strict';

  const GUTTER = 0;
  const MARGIN = 56;
  const BASE_SIZE = 19;

  // pile di caratteri reali: le variabili CSS del documento padre non esistono dentro l'iframe
  const FONTS = {
    serif: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"SF Mono", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace',
  };

  const ReflowView = {
    iframe: null,
    win: null,
    doc: null,
    container: null,
    overlay: null,
    chapter: 0,
    chapters: [],
    annotations: [],
    page: 0,
    pageCount: 1,
    columnWidth: 0,
    settings: {},
    ready: false,

    init() {
      ReflowView.iframe = Utils.$('#reflow');
    },

    /* ------------------------------------------------------- apertura */
    async open(book, doc) {
      ReflowView.chapters = doc.chapters || [];
      ReflowView.annotations = Reader.state.annotations;
      ReflowView.ready = false;
      await ReflowView.showChapter(0);
    },

    async showChapter(index) {
      if (index < 0 || index >= ReflowView.chapters.length) return;
      ReflowView.chapter = index;
      const book = Reader.state.book;
      let chapter;
      try {
        chapter = await API.chapter(book.id, index);
      } catch (err) {
        UI.toast('Impossibile caricare il capitolo', 'err');
        return;
      }

      const typography = {
        fontSize: Number(Reader.state.settings.fontSize) || 100,
        fontFamily: Reader.state.settings.fontFamily || 'serif',
        leading: Reader.state.settings.leading || 'normal',
        pageTheme: Reader.state.settings.pageTheme || 'paper',
      };
      ReflowView.settings = typography;

      const theme = {
        paper: { bg: '#FBF6EC', fg: '#241e1b', blend: 'multiply' },
        sepia: { bg: '#EADDC6', fg: '#3B2E23', blend: 'multiply' },
        night: { bg: '#241C1E', fg: '#E9DFD6', blend: 'screen' },
      }[typography.pageTheme] || { bg: '#FBF6EC', fg: '#241e1b', blend: 'multiply' };

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        html { height:100%; overflow-x:auto; overflow-y:hidden; scroll-behavior:smooth; }
        html::-webkit-scrollbar { display:none; }
        body {
          margin:0; height:100%; background:${theme.bg}; color:${theme.fg};
          font-family:${FONTS[typography.fontFamily] || FONTS.serif};
          font-size:${(BASE_SIZE * (typography.fontSize || 100) / 100).toFixed(2)}px;
          line-height:${typography.leading === 'tight' ? 1.42 : typography.leading === 'loose' ? 1.85 : 1.62};
          -webkit-font-smoothing:antialiased;
        }
        #book-content {
          position:relative; height:100vh; box-sizing:border-box;
          column-width:${ReflowView.columnWidth || 700}px; column-gap:${GUTTER}px; column-fill:auto;
          padding:52px 0 72px 0;
        }
        #book-content .page-pad { padding:0 ${MARGIN}px; }
        #book-content h1,#book-content h2,#book-content h3 { font-family:${FONTS.sans}; line-height:1.25; margin:1.15em 0 .5em; break-after:avoid; }
        #book-content h1 { font-size:1.5em } #book-content h2 { font-size:1.28em } #book-content h3 { font-size:1.1em }
        #book-content p { margin:0 0 .88em; text-align:justify; hyphens:auto; }
        #book-content blockquote { margin:1.1em 0; padding:.35em 0 .35em 1.1em; border-left:3px solid #8e2b3f; font-style:italic; opacity:.92; }
        #book-content img { max-width:100%; height:auto; border-radius:6px; }
        #book-content pre { white-space:pre-wrap; font-family:${FONTS.mono}; font-size:.85em; }
        #book-content ul,#book-content ol { padding-left:1.3em; margin:0 0 .9em; }
        #book-content table { border-collapse:collapse; width:100%; font-size:.9em; }
        #book-content td,#book-content th { border:1px solid rgba(90,70,60,.3); padding:5px 8px; }
        #book-content .mb-highlight { position:absolute; border-radius:2px; mix-blend-mode:${theme.blend}; opacity:.55; pointer-events:none; background:var(--anno-color, #f3d36b); }
        #book-content .mb-underline { position:absolute; border-bottom:2px solid var(--anno-color, #c9a227); pointer-events:none; }
        #book-content .mb-strikeout { position:absolute; border-top:2px solid var(--anno-color, #c9a227); pointer-events:none; }
        #mybooks-overlay { position:absolute; top:0; left:0; pointer-events:none; z-index:3; }
      </style></head><body>
        <div id="book-content"><div class="page-pad">${chapter.html || ''}</div>
          <div id="mybooks-overlay"></div>
        </div>
      </body></html>`;

      await new Promise((resolve) => {
        const iframe = ReflowView.iframe;
        iframe.onload = () => resolve();
        iframe.srcdoc = html;
      });

      ReflowView.win = ReflowView.iframe.contentWindow;
      ReflowView.doc = ReflowView.iframe.contentDocument;
      ReflowView.container = ReflowView.doc.getElementById('book-content');
      ReflowView.overlay = ReflowView.doc.getElementById('mybooks-overlay');
      ReflowView.columnWidth = ReflowView.win.innerWidth;

      ReflowView.doc.addEventListener('mouseup', ReflowView.onSelectionEnd);
      ReflowView.win.addEventListener('resize', Utils.debounce(() => ReflowView.measure(), 150));
      ReflowView.win.addEventListener('scroll', Utils.throttle(() => ReflowView.onScroll(), 60));

      ReflowView.measure();
      ReflowView.applyHighlights();
      ReflowView.ready = true;
      Reader.onLocationChanged();
    },

    measure() {
      if (!ReflowView.win) return;
      const width = ReflowView.win.innerWidth;
      ReflowView.columnWidth = width;
      if (ReflowView.container) {
        ReflowView.container.style.columnWidth = `${width}px`;
      }
      // forza il ricalcolo delle colonne
      void ReflowView.doc.body.offsetHeight;
      const total = ReflowView.doc.documentElement.scrollWidth;
      ReflowView.pageCount = Math.max(1, Math.ceil(total / Math.max(width, 1)));
      ReflowView.applyHighlights();
    },

    onScroll() {
      if (!ReflowView.win) return;
      const width = Math.max(ReflowView.win.innerWidth, 1);
      ReflowView.page = Math.round(ReflowView.win.scrollX / width);
      Reader.onLocationChanged();
    },

    /* -------------------------------------------------------- pagine */
    goToPage(page) {
      if (!ReflowView.win) return;
      const width = Math.max(ReflowView.win.innerWidth, 1);
      const target = Utils.clamp(page, 0, ReflowView.pageCount - 1);
      ReflowView.win.scrollTo({ left: target * width, behavior: 'smooth' });
      ReflowView.page = target;
    },

    nextPage() {
      if (ReflowView.page + 1 >= ReflowView.pageCount) {
        if (ReflowView.chapter + 1 < ReflowView.chapters.length) {
          ReflowView.showChapter(ReflowView.chapter + 1);
        }
        return false;
      }
      ReflowView.goToPage(ReflowView.page + 1);
      return true;
    },

    prevPage() {
      if (ReflowView.page > 0) {
        ReflowView.goToPage(ReflowView.page - 1);
        return true;
      }
      if (ReflowView.chapter > 0) {
        ReflowView.showChapter(ReflowView.chapter - 1);
      }
      return false;
    },

    /* ------------------------------------------------- annotazioni */
    setAnnotations(list) {
      ReflowView.annotations = list || [];
      ReflowView.applyHighlights();
    },

    applyHighlights() {
      if (!ReflowView.overlay) return;
      ReflowView.overlay.innerHTML = '';
      const doc = ReflowView.doc;
      const win = ReflowView.win;
      if (!doc || !win) return;

      const containerRect = ReflowView.container.getBoundingClientRect();
      const scrollX = win.scrollX;
      const scrollY = win.scrollY;

      ReflowView.annotations
        .filter((a) => (a.page || 0) === ReflowView.chapter)
        .filter((a) => ['highlight', 'underline', 'strikeout'].includes(a.type))
        .forEach((annotation) => {
          const quote = (annotation.anchor && annotation.anchor.quote) || annotation.text;
          if (!quote) return;
          const anchor = annotation.anchor || {};
          let range = null;
          if (typeof anchor.offset === 'number') {
            range = ReflowView.rangeAtOffset(anchor.offset, quote.length);
          }
          if (!range) range = ReflowView.findRange(quote);
          if (!range) return;
          const rects = Array.from(range.getClientRects());
          rects.forEach((rect) => {
            if (rect.width < 1 || rect.height < 1) return;
            const style = {
              left: `${rect.left - containerRect.left + scrollX}px`,
              top: `${rect.top - containerRect.top + scrollY}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              '--anno-color': annotation.color || '#f3d36b',
            };
            let node;
            if (annotation.type === 'highlight') {
              node = Utils.el('div', { class: 'mb-highlight', style });
            } else if (annotation.type === 'underline') {
              style.top = `${rect.bottom - containerRect.top + scrollY - 2}px`;
              style.height = '2px';
              node = Utils.el('div', { class: 'mb-underline', style });
            } else {
              style.top = `${rect.top - containerRect.top + scrollY + rect.height / 2}px`;
              style.height = '2px';
              node = Utils.el('div', { class: 'mb-strikeout', style });
            }
            ReflowView.overlay.appendChild(node);
          });
        });

      const width = ReflowView.doc.documentElement.scrollWidth;
      ReflowView.overlay.style.width = `${width}px`;
      ReflowView.overlay.style.height = '100%';
    },

    /** Crea un Range a partire da un offset assoluto nel testo del capitolo. */
    rangeAtOffset(offset, length) {
      const doc = ReflowView.doc;
      if (!doc || !doc.body) return null;
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
      let consumed = 0;
      let startNode = null;
      let startOffset = 0;
      let endNode = null;
      let endOffset = 0;
      let node = walker.nextNode();
      while (node) {
        const value = node.nodeValue || "";
        const next = consumed + value.length;
        if (startNode === null && offset >= consumed && offset < next) {
          startNode = node;
          startOffset = offset - consumed;
        }
        if (startNode !== null && endNode === null && offset + length <= next) {
          endNode = node;
          endOffset = offset + length - consumed;
          break;
        }
        consumed = next;
        node = walker.nextNode();
      }
      if (!startNode || !endNode) return null;
      try {
        const range = doc.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
      } catch (err) {
        return null;
      }
    },

    /** Trova il Range corrispondente a un frammento di testo. */
    findRange(quote) {
      const doc = ReflowView.doc;
      const body = doc.body;
      const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
      const nodes = [];
      let full = '';
      let node = walker.nextNode();
      while (node) {
        const value = node.nodeValue;
        nodes.push({ node, start: full.length, end: full.length + value.length });
        full += value;
        node = walker.nextNode();
      }
      const index = full.indexOf(quote);
      if (index === -1) return null;
      const end = index + quote.length;

      const startEntry = nodes.find((entry) => index >= entry.start && index < entry.end);
      const endEntry = nodes.find((entry) => end > entry.start && end <= entry.end);
      if (!startEntry || !endEntry) return null;

      const range = doc.createRange();
      range.setStart(startEntry.node, index - startEntry.start);
      range.setEnd(endEntry.node, end - endEntry.start);
      return range;
    },

    onSelectionEnd() {
      const tool = Reader.state.tool;
      if (!['highlight', 'underline', 'strikeout'].includes(tool)) return;
      const win = ReflowView.win;
      const selection = win.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const text = selection.toString().trim();
      if (!text) return;

      // offset assoluto del testo selezionato nel capitolo (ancoraggio preciso)
      let offset = 0;
      try {
        const range = selection.getRangeAt(0);
        const pre = range.cloneRange();
        pre.selectNodeContents(ReflowView.doc.body);
        pre.setEnd(range.startContainer, range.startOffset);
        offset = pre.toString().length;
      } catch (err) {
        offset = 0;
      }
      selection.removeAllRanges();
      Reader.state.lastSelection = { text, page: ReflowView.chapter };

      Reader.addAnnotation({
        type: tool,
        page: ReflowView.chapter,
        color: Reader.state.color,
        rects: [],
        text,
        anchor: {
          quote: text,
          chapter: ReflowView.chapter,
          offset,
          length: text.length,
          prefix: text.slice(0, 40),
          suffix: text.slice(-40),
        },
      });
    },
  };

  global.ReflowView = ReflowView;
})(window);
