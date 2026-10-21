/* MyBooks — visualizzatore PDF con annotazioni (inchiostro, evidenziatore, post-it…) */
(function (global) {
  'use strict';

  const ANNOTATION_COLORS = [
    { value: '#f3d36b', label: 'Giallo' },
    { value: '#8fd18c', label: 'Verde' },
    { value: '#8ec9f0', label: 'Azzurro' },
    { value: '#f0a6c0', label: 'Rosa' },
    { value: '#e2b7f0', label: 'Viola' },
    { value: '#f6b17a', label: 'Arancione' },
    { value: '#c9c9c9', label: 'Grigio' },
    { value: '#6e1e2e', label: 'Bordeaux' },
  ];

  const PdfView = {
    page: null,
    img: null,
    textLayer: null,
    inkCanvas: null,
    annoLayer: null,
    scale: 1.45,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    pageSize: { width: 612, height: 792 },
    annotations: [],
    pageAnnotations: [],
    undoStack: [],
    redoStack: [],
    drawing: null,
    shapeStart: null,
    shapePreview: null,
    panStart: null,
    tool: 'pointer',
    color: ANNOTATION_COLORS[0].value,
    penWidth: 2.6,
    shape: 'rect',
    loaded: false,

    init() {
      PdfView.page = Utils.$('#page');
      PdfView.img = Utils.$('#page-img');
      PdfView.textLayer = Utils.$('#page-text');
      PdfView.inkCanvas = Utils.$('#page-ink');
      PdfView.annoLayer = Utils.$('#page-anno');

      PdfView.textLayer.addEventListener('mouseup', PdfView.onSelectionEnd);
      PdfView.textLayer.addEventListener('keyup', PdfView.onSelectionEnd);

      PdfView.inkCanvas.addEventListener('pointerdown', PdfView.onPenDown);
      PdfView.inkCanvas.addEventListener('pointermove', PdfView.onPenMove);
      PdfView.inkCanvas.addEventListener('pointerup', PdfView.onPenUp);
      PdfView.inkCanvas.addEventListener('pointercancel', PdfView.onPenUp);

      PdfView.page.addEventListener('pointerdown', PdfView.onPagePointerDown);
      PdfView.page.addEventListener('pointermove', PdfView.onPagePointerMove);
      PdfView.page.addEventListener('pointerup', PdfView.onPagePointerUp);

      window.addEventListener('resize', Utils.debounce(() => {
        if (PdfView.loaded) PdfView.renderPage(PdfView.currentPage, true);
      }, 220));
    },

    /* ------------------------------------------------------- rendering */
    async renderPage(page, keepScroll = false) {
      const book = Reader.state.book;
      if (!book) return;
      PdfView.currentPage = page;
      PdfView.loaded = false;

      const size = (Reader.state.doc.pages && Reader.state.doc.pages[page]) || { width: 612, height: 792 };
      PdfView.pageSize = size;
      const scale = PdfView.scale;
      const width = Math.round(size.width * scale);
      const height = Math.round(size.height * scale);
      PdfView.page.style.width = `${width}px`;
      PdfView.page.style.height = `${height}px`;
      PdfView.inkCanvas.width = Math.round(width * PdfView.dpr);
      PdfView.inkCanvas.height = Math.round(height * PdfView.dpr);
      PdfView.inkCanvas.style.width = `${width}px`;
      PdfView.inkCanvas.style.height = `${height}px`;

      const serverZoom = Utils.clamp(scale * PdfView.dpr, 0.6, 4);
      const url = API.pageUrl(book.id, page, serverZoom.toFixed(2));
      const img = PdfView.img;
      const previous = img.src;
      img.src = url;

      const loaded = new Promise((resolve) => {
        const done = () => resolve();
        if (img.complete && img.naturalWidth) done();
        else {
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }
      });
      await loaded;
      if (previous !== url) { /* l'immagine è stata ricaricata */ }

      await PdfView.loadTextLayer(page);
      PdfView.renderAnnotations();
      PdfView.drawInk();
      PdfView.loaded = true;

      if (!keepScroll) {
        const stage = Utils.$('#stage');
        stage.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    },

    async loadTextLayer(page) {
      const book = Reader.state.book;
      PdfView.textLayer.innerHTML = '';
      let data;
      try {
        data = await API.textLayer(book.id, page);
      } catch (err) {
        return;
      }
      const scale = PdfView.scale;
      const fragment = document.createDocumentFragment();
      (data.lines || []).forEach((line) => {
        const span = Utils.el('span', {
          text: line.text,
          style: {
            left: `${line.x * scale}px`,
            top: `${line.y * scale}px`,
            fontSize: `${line.size * scale}px`,
            lineHeight: `${line.h * scale}px`,
            color: 'transparent',
            fontWeight: line.bold ? '600' : '400',
            fontStyle: line.italic ? 'italic' : 'normal',
            fontFamily: line.family || 'Helvetica, Arial, sans-serif',
          },
        });
        fragment.appendChild(span);
      });
      PdfView.textLayer.appendChild(fragment);
    },

    /* ---------------------------------------------------- annotazioni */
    setAnnotations(list) {
      PdfView.annotations = list || [];
      PdfView.renderAnnotations();
      PdfView.drawInk();
    },

    renderAnnotations() {
      const layer = PdfView.annoLayer;
      layer.innerHTML = '';
      const page = PdfView.currentPage;
      PdfView.pageAnnotations = PdfView.annotations.filter((a) => (a.page || 0) === page);
      const scale = PdfView.scale;

      PdfView.pageAnnotations.forEach((annotation) => {
        const color = annotation.color || PdfView.color;
        if (annotation.type === 'ink') return;

        if (annotation.type === 'postit') {
          const anchor = annotation.anchor || {};
          const node = Utils.el('div', {
            class: `postit${annotation.text ? ' has-note' : ''}`,
            title: annotation.text || 'Post-it',
            style: {
              left: `${(anchor.x || 0) * scale}px`,
              top: `${(anchor.y || 0) * scale}px`,
              '--anno-color': color,
            },
          }, Utils.el('span', { class: 'postit__dot' }));
          node.addEventListener('click', (event) => {
            event.stopPropagation();
            PdfView.openAnnotationMenu(annotation, node);
          });
          layer.appendChild(node);
          return;
        }

        (annotation.rects || []).forEach((rect) => {
          const left = rect.x * scale;
          const top = rect.y * scale;
          const width = rect.w * scale;
          const height = rect.h * scale;
          let node;
          if (annotation.type === 'highlight') {
            node = Utils.el('div', {
              class: 'anno-highlight',
              style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, '--anno-color': color },
            });
          } else if (annotation.type === 'underline') {
            node = Utils.el('div', {
              class: 'anno-underline',
              style: { left: `${left}px`, top: `${top + height - 1}px`, width: `${width}px`, height: '2px', '--anno-color': color },
            });
          } else if (annotation.type === 'strikeout') {
            node = Utils.el('div', {
              class: 'anno-strikeout',
              style: { left: `${left}px`, top: `${top + height / 2}px`, width: `${width}px`, height: '2px', '--anno-color': color },
            });
          } else if (annotation.type === 'square' || annotation.type === 'circle') {
            node = Utils.el('div', {
              class: `anno-shape${annotation.type === 'circle' ? ' is-ellipse' : ''}`,
              style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, '--anno-color': color },
            });
          } else if (annotation.type === 'text') {
            node = Utils.el('div', {
              class: 'anno-text',
              style: { left: `${left}px`, top: `${top}px`, minWidth: `${Math.max(width, 80)}px`, '--anno-color': color },
              text: annotation.text || 'Doppio clic per modificare',
            });
            node.addEventListener('dblclick', (event) => {
              event.stopPropagation();
              PdfView.editTextAnnotation(annotation, node);
            });
          } else {
            return;
          }
          node.addEventListener('click', (event) => {
            event.stopPropagation();
            PdfView.openAnnotationMenu(annotation, node);
          });
          layer.appendChild(node);
        });
      });
    },

    drawInk() {
      const canvas = PdfView.inkCanvas;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(PdfView.dpr, 0, 0, PdfView.dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = PdfView.scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      PdfView.pageAnnotations
        .filter((a) => a.type === 'ink')
        .forEach((annotation) => {
          const points = annotation.points || [];
          if (!points.length) return;
          ctx.strokeStyle = annotation.color || PdfView.color;
          ctx.lineWidth = ((annotation.anchor && annotation.anchor.width) || 2) * scale;
          ctx.beginPath();
          points.forEach((point, index) => {
            const x = point.x * scale;
            const y = point.y * scale;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        });
    },

    /* --------------------------------------------------------- strumenti */
    setTool(tool) {
      PdfView.tool = tool;
      PdfView.page.classList.toggle('is-pen', tool === 'pen');
      PdfView.textLayer.style.pointerEvents = ['pen'].includes(tool) ? 'none' : 'auto';
      if (tool === 'highlight' || tool === 'underline' || tool === 'strikeout') {
        PdfView.textLayer.classList.add('is-selecting');
        PdfView.page.classList.add('is-selecting');
      } else {
        PdfView.textLayer.classList.remove('is-selecting');
        PdfView.page.classList.remove('is-selecting');
      }
      Reader.syncTool(tool);
    },

    setColor(color) {
      PdfView.color = color;
      Reader.syncColor(color);
    },

    /* --------------------------------------------------- selezione testo */
    onSelectionEnd(event) {
      const tool = PdfView.tool;
      if (!['highlight', 'underline', 'strikeout'].includes(tool)) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      // la selezione può partire da un'evidenziazione già esistente:
      // basta che gli estremi della selezione appartengano al layer di testo
      if (!PdfView.textLayer.contains(range.startContainer) ||
          !PdfView.textLayer.contains(range.endContainer)) {
        return;
      }

      const pageRect = PdfView.page.getBoundingClientRect();
      const scale = PdfView.scale;
      const rects = [];
      Array.from(range.getClientRects()).forEach((rect) => {
        if (rect.width < 2 || rect.height < 2) return;
        rects.push({
          x: (rect.left - pageRect.left) / scale,
          y: (rect.top - pageRect.top) / scale,
          w: rect.width / scale,
          h: rect.height / scale,
        });
      });
      if (!rects.length) return;
      const text = selection.toString().trim();
      selection.removeAllRanges();
      Reader.state.lastSelection = { text, page: PdfView.currentPage };

      Reader.addAnnotation({
        type: tool,
        page: PdfView.currentPage,
        color: PdfView.color,
        rects,
        text,
        anchor: { width: 2 },
      });
    },

    /* ------------------------------------------------------------ penna */
    pointFromEvent(event) {
      const rect = PdfView.page.getBoundingClientRect();
      const scale = PdfView.scale;
      return {
        x: (event.clientX - rect.left) / scale,
        y: (event.clientY - rect.top) / scale,
      };
    },

    onPenDown(event) {
      if (PdfView.tool !== 'pen') return;
      event.preventDefault();
      PdfView.inkCanvas.setPointerCapture(event.pointerId);
      PdfView.drawing = { points: [PdfView.pointFromEvent(event)], color: PdfView.color, width: PdfView.penWidth };
      PdfView.redrawDrawing();
    },

    onPenMove(event) {
      if (!PdfView.drawing) return;
      event.preventDefault();
      PdfView.drawing.points.push(PdfView.pointFromEvent(event));
      PdfView.redrawDrawing();
    },

    onPenUp(event) {
      if (!PdfView.drawing) return;
      try {
        PdfView.inkCanvas.releasePointerCapture(event.pointerId);
      } catch (err) { /* ignore */ }
      const drawing = PdfView.drawing;
      PdfView.drawing = null;
      if (drawing.points.length < 2) return;
      Reader.addAnnotation({
        type: 'ink',
        page: PdfView.currentPage,
        color: drawing.color,
        points: drawing.points,
        anchor: { width: drawing.width || 2.6 },
      });
    },

    redrawDrawing() {
      const canvas = PdfView.inkCanvas;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(PdfView.dpr, 0, 0, PdfView.dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = PdfView.scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      PdfView.pageAnnotations.filter((a) => a.type === 'ink').forEach((annotation) => {
        const points = annotation.points || [];
        ctx.strokeStyle = annotation.color || PdfView.color;
        ctx.lineWidth = ((annotation.anchor && annotation.anchor.width) || 2) * scale;
        ctx.beginPath();
        points.forEach((point, index) => {
          const x = point.x * scale;
          const y = point.y * scale;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
      if (PdfView.drawing) {
        const points = PdfView.drawing.points;
        ctx.strokeStyle = PdfView.drawing.color;
        ctx.lineWidth = (PdfView.drawing.width || 2.6) * scale;
        ctx.beginPath();
        points.forEach((point, index) => {
          const x = point.x * scale;
          const y = point.y * scale;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    },

    /* ------------------------------------------------- forme / post-it */
    onPagePointerDown(event) {
      if (PdfView.tool === 'eraser') {
        PdfView.eraseAt(event);
        return;
      }
      if (PdfView.tool === 'pointer') {
        // trascinamento per spostare la pagina (solo se non si sta selezionando)
        PdfView.panStart = {
          x: event.clientX,
          y: event.clientY,
          scrollX: Utils.$('#stage').scrollLeft,
          scrollY: Utils.$('#stage').scrollTop,
        };
        return;
      }
      if (PdfView.tool === 'shape') {
        event.preventDefault();
        PdfView.shapeStart = PdfView.pointFromEvent(event);
        return;
      }
      if (PdfView.tool === 'text') {
        event.preventDefault();
        PdfView.createTextBox(PdfView.pointFromEvent(event));
        return;
      }
      if (PdfView.tool === 'postit') {
        event.preventDefault();
        PdfView.createPostIt(PdfView.pointFromEvent(event));
      }
    },

    onPagePointerMove(event) {
      if (PdfView.panStart) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          PdfView.panStart = null;
          return;
        }
        const stage = Utils.$('#stage');
        const dx = event.clientX - PdfView.panStart.x;
        const dy = event.clientY - PdfView.panStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          stage.scrollLeft = PdfView.panStart.scrollX - dx;
          stage.scrollTop = PdfView.panStart.scrollY - dy;
        }
        return;
      }
      if (!PdfView.shapeStart) return;
      const point = PdfView.pointFromEvent(event);
      const rect = PdfView.normalize(PdfView.shapeStart, point);
      if (PdfView.shapePreview) PdfView.shapePreview.remove();
      PdfView.shapePreview = Utils.el('div', {
        class: `anno-shape${PdfView.shape === 'ellipse' ? ' is-ellipse' : ''}${PdfView.shape === 'line' ? ' is-line' : ''}`,
        style: {
          left: `${rect.x * PdfView.scale}px`,
          top: `${rect.y * PdfView.scale}px`,
          width: `${rect.w * PdfView.scale}px`,
          height: `${rect.h * PdfView.scale}px`,
          '--anno-color': PdfView.color,
        },
      });
      PdfView.annoLayer.appendChild(PdfView.shapePreview);
    },

    onPagePointerUp(event) {
      PdfView.panStart = null;
      if (!PdfView.shapeStart) return;
      const point = PdfView.pointFromEvent(event);
      const rect = PdfView.normalize(PdfView.shapeStart, point);
      PdfView.shapeStart = null;
      if (PdfView.shapePreview) {
        PdfView.shapePreview.remove();
        PdfView.shapePreview = null;
      }
      if (rect.w < 3 || rect.h < 3) return;
      const type = PdfView.shape === 'ellipse' ? 'circle' : PdfView.shape === 'line' ? 'line' : 'square';
      Reader.addAnnotation({
        type,
        page: PdfView.currentPage,
        color: PdfView.color,
        rects: [rect],
      });
    },

    normalize(a, b) {
      return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(a.x - b.x),
        h: Math.abs(a.y - b.y),
      };
    },

    async createTextBox(point) {
      const created = await Reader.addAnnotation({
        type: 'text',
        page: PdfView.currentPage,
        color: PdfView.color,
        rects: [{ x: point.x, y: point.y, w: 160, h: 46 }],
        text: '',
      });
      if (!created) return;
      const node = PdfView.annoLayer.querySelector('.anno-text');
      if (node) PdfView.editTextAnnotation(created, node);
    },

    async createPostIt(point) {
      const text = await UI.prompt('Nuovo post-it', {
        label: 'Scrivi la tua annotazione',
        placeholder: 'Idea, collegamento, domanda…',
        multiline: true,
      });
      if (text === null) return;
      await Reader.addAnnotation({
        type: 'postit',
        page: PdfView.currentPage,
        color: PdfView.color,
        anchor: { x: point.x, y: point.y },
        text,
      });
    },

    editTextAnnotation(annotation, node) {
      node.classList.add('is-editing');
      node.contentEditable = 'true';
      node.textContent = annotation.text || '';
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const commit = async () => {
        node.contentEditable = 'false';
        node.classList.remove('is-editing');
        const value = node.textContent.trim();
        await Reader.updateAnnotation(annotation.id, { text: value });
      };
      node.addEventListener('blur', commit, { once: true });
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          node.blur();
        }
        event.stopPropagation();
      });
    },

    /* --------------------------------------------------------- eraser */
    eraseAt(event) {
      const point = PdfView.pointFromEvent(event);
      const scale = PdfView.scale;
      const tolerance = 8 / scale;
      const target = PdfView.pageAnnotations.find((annotation) => {
        if (annotation.type === 'ink') {
          return PdfView.nearStroke(annotation.points || [], point, tolerance);
        }
        return (annotation.rects || []).some(
          (rect) =>
            point.x >= rect.x - tolerance &&
            point.x <= rect.x + rect.w + tolerance &&
            point.y >= rect.y - tolerance &&
            point.y <= rect.y + rect.h + tolerance
        );
      });
      if (target) Reader.removeAnnotation(target.id);
    },

    nearStroke(points, point, tolerance) {
      for (let i = 1; i < points.length; i += 1) {
        if (PdfView.distanceToSegment(point, points[i - 1], points[i]) <= tolerance) return true;
      }
      return false;
    },

    distanceToSegment(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      if (!lengthSq) return Math.hypot(p.x - a.x, p.y - a.y);
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
      t = Utils.clamp(t, 0, 1);
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    },

    /* ------------------------------------------------------ menu annot. */
    openAnnotationMenu(annotation, anchorNode) {
      document.querySelectorAll('.anno-menu').forEach((node) => node.remove());
      const rect = anchorNode.getBoundingClientRect();
      const menu = Utils.el('div', { class: 'anno-menu' });
      menu.style.position = 'fixed';
      menu.style.left = `${Math.min(rect.left, window.innerWidth - 230)}px`;
      menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 190)}px`;

      const colors = Utils.el('div', { class: 'anno-menu__colors' });
      ANNOTATION_COLORS.forEach((entry) => {
        colors.appendChild(
          Utils.el('button', {
            class: `swatch${annotation.color === entry.value ? ' is-active' : ''}`,
            style: { background: entry.value },
            title: entry.label,
            onClick: async () => {
              await Reader.updateAnnotation(annotation.id, { color: entry.value });
              menu.remove();
            },
          })
        );
      });
      menu.appendChild(colors);

      const actions = Utils.el('div', { class: 'anno-menu__actions' });
      actions.appendChild(
        Utils.el('button', {
          class: 'btn btn--sm btn--ghost',
          text: 'Commento',
          onClick: async () => {
            const value = await UI.prompt('Commento', {
              label: 'Annotazione',
              value: annotation.comment || '',
              multiline: true,
            });
            menu.remove();
            if (value === null) return;
            await Reader.updateAnnotation(annotation.id, { comment: value });
          },
        })
      );
      actions.appendChild(
        Utils.el('button', {
          class: 'btn btn--sm btn--danger',
          text: 'Elimina',
          onClick: () => {
            menu.remove();
            Reader.removeAnnotation(annotation.id);
          },
        })
      );
      menu.appendChild(actions);

      menu.addEventListener('click', (event) => event.stopPropagation());
      document.body.appendChild(menu);
      const close = (event) => {
        if (!menu.contains(event.target)) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    },

    /* ------------------------------------------------------ undo / redo */
    pushUndo(action) {
      Reader.pushHistory(action);
    },

    async undo() {
      Reader.undo();
    },

    async redo() {
      Reader.redo();
    },

    ANNOTATION_COLORS,
  };

  global.PdfView = PdfView;
})(window);
