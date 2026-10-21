/* MyBooks — componenti UI (modali, toast, conferme) */
(function (global) {
  'use strict';

  const root = () => Utils.$('#modal-root');

  const UI = {
    /** Apre un modale. `body` può essere una stringa HTML o un nodo. */
    modal({ title = '', body = '', actions = [], onOpen = null, onClose = null, wide = false }) {
      const host = root();
      const titleNode = Utils.$('#modal-title');
      const bodyNode = Utils.$('#modal-body');
      const footNode = Utils.$('#modal-foot');
      const box = Utils.$('.modal', host);

      titleNode.textContent = title;
      bodyNode.innerHTML = '';
      if (body instanceof Node) bodyNode.appendChild(body);
      else bodyNode.innerHTML = body;

      footNode.innerHTML = '';
      actions.forEach((action) => {
        const button = Utils.el('button', {
          class: `btn ${action.variant ? 'btn--' + action.variant : 'btn--ghost'}`,
          text: action.label,
          onClick: () => {
            const result = action.onClick ? action.onClick() : undefined;
            if (result !== false && action.close !== false) UI.closeModal();
          },
        });
        footNode.appendChild(button);
      });

      box.style.width = wide ? 'min(780px, calc(100vw - 48px))' : '';
      host.hidden = false;
      host._onClose = onClose;

      const focusable = bodyNode.querySelector('input, textarea, select');
      if (focusable) setTimeout(() => focusable.focus(), 60);
      if (onOpen) onOpen(bodyNode);
      return { body: bodyNode, foot: footNode, close: UI.closeModal };
    },

    closeModal() {
      const host = root();
      if (!host || host.hidden) return;
      host.hidden = true;
      const box = Utils.$('.modal', host);
      box.style.animation = 'none';
      void box.offsetWidth;
      box.style.animation = '';
      if (host._onClose) {
        const fn = host._onClose;
        host._onClose = null;
        fn();
      }
    },

    toast(message, type = '') {
      const host = Utils.$('#toasts');
      const node = Utils.el('div', {
        class: `toast${type ? ' toast--' + type : ''}`,
        text: message,
      });
      host.appendChild(node);
      setTimeout(() => {
        node.classList.add('is-out');
        setTimeout(() => node.remove(), 320);
      }, 2400);
      return node;
    },

    confirm(title, message, { danger = false, okLabel = 'Conferma' } = {}) {
      return new Promise((resolve) => {
        let settled = false;
        UI.modal({
          title,
          body: `<p style="font-size:13.5px;line-height:1.6;color:var(--text-2)">${Utils.escape(message)}</p>`,
          actions: [
            { label: 'Annulla', onClick: () => { settled = true; resolve(false); } },
            {
              label: okLabel,
              variant: danger ? 'danger' : 'primary',
              onClick: () => { settled = true; resolve(true); },
            },
          ],
          onClose: () => { if (!settled) resolve(false); },
        });
      });
    },

    prompt(title, { label = '', value = '', placeholder = '', multiline = false } = {}) {
      return new Promise((resolve) => {
        const input = multiline
          ? Utils.el('textarea', { class: 'textarea', placeholder, style: { minHeight: '120px' } })
          : Utils.el('input', { class: 'input', type: 'text', placeholder });
        input.value = value;
        const wrap = Utils.el('div', {}, label ? Utils.el('label', { text: label }) : null, input);
        let settled = false;
        UI.modal({
          title,
          body: wrap,
          actions: [
            { label: 'Annulla', onClick: () => { settled = true; resolve(null); } },
            {
              label: 'Salva',
              variant: 'primary',
              onClick: () => { settled = true; resolve(input.value); },
            },
          ],
          onOpen: () => setTimeout(() => input.focus(), 60),
          onClose: () => { if (!settled) resolve(null); },
        });
      });
    },
  };

  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) UI.closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const host = root();
      if (host && !host.hidden) UI.closeModal();
    }
  });

  global.UI = UI;
})(window);
