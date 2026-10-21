/* MyBooks — utilità */
(function (global) {
  'use strict';

  const Utils = {
    $(selector, root = document) {
      return root.querySelector(selector);
    },
    $$(selector, root = document) {
      return Array.from(root.querySelectorAll(selector));
    },

    el(tag, attrs = {}, ...children) {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs || {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'style' && typeof value === 'object') {
          for (const [prop, val] of Object.entries(value)) {
            if (val === null || val === undefined) continue;
            if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
            else node.style[prop] = val;
          }
        }
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else node.setAttribute(key, value);
      }
      children.flat().forEach((child) => {
        if (child === null || child === undefined || child === false) return;
        node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
      });
      return node;
    },

    escape(text) {
      return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    highlight(text, query) {
      const safe = Utils.escape(text);
      if (!query) return safe;
      const pattern = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!pattern) return safe;
      return safe.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
    },

    debounce(fn, wait = 250) {
      let timer = null;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    throttle(fn, wait = 100) {
      let last = 0;
      let pending = null;
      return function (...args) {
        const now = Date.now();
        if (now - last >= wait) {
          last = now;
          fn.apply(this, args);
        } else {
          clearTimeout(pending);
          pending = setTimeout(() => {
            last = Date.now();
            fn.apply(this, args);
          }, wait - (now - last));
        }
      };
    },

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    formatDate(iso) {
      if (!iso) return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const now = new Date();
      const diff = (now - date) / 1000;
      if (diff < 60) return 'ora';
      if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} h fa`;
      if (diff < 604800) return `${Math.floor(diff / 86400)} g fa`;
      return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    },

    formatDuration(minutes) {
      if (!minutes) return '0m';
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return rest ? `${hours}h ${rest}m` : `${hours}h`;
    },

    readingTime(text) {
      if (!text) return '—';
      const words = text.trim().split(/\s+/).length;
      if (words < 220) return `${Math.max(1, Math.round(words / 200))} min`;
      return `${Math.round(words / 200)} min`;
    },

    debounceResize(fn, wait = 120) {
      return Utils.debounce(fn, wait);
    },

    download(filename, content, mime = 'application/json') {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = Utils.el('a', { href: url, download: filename });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    uuid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    },
  };

  global.Utils = Utils;
})(window);
