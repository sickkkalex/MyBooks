/* MyBooks — client API */
(function (global) {
  'use strict';

  async function request(path, options = {}) {
    const opts = Object.assign({ headers: {} }, options);
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const response = await fetch(path, opts);
    const type = response.headers.get('content-type') || '';
    let payload = null;
    if (type.includes('application/json')) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }
    if (!response.ok) {
      const message = (payload && payload.error) || `Errore ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  const API = {
    request,

    // libreria
    books: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      ).toString();
      return request(`/api/books${query ? '?' + query : ''}`).then((r) => r.books);
    },
    book: (id) => request(`/api/books/${id}`),
    updateBook: (id, data) => request(`/api/books/${id}`, { method: 'PATCH', body: data }),
    deleteBook: (id) => request(`/api/books/${id}`, { method: 'DELETE' }),
    importFiles: (files) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f, f.name));
      return request('/api/books/import', { method: 'POST', body: form });
    },
    scanFolder: (path, collectionId) =>
      request('/api/books/scan', { method: 'POST', body: { path, collection_id: collectionId || null } }),
    progress: (id, page, total) =>
      request(`/api/books/${id}/progress`, { method: 'POST', body: { page, total } }),
    coverUrl: (id) => `/api/books/${id}/cover`,
    fileUrl: (id) => `/api/books/${id}/file`,

    // documento
    document: (id) => request(`/api/books/${id}/document`),
    pageUrl: (id, page, zoom) => `/api/books/${id}/page/${page}?zoom=${zoom}`,
    thumbUrl: (id, page) => `/api/books/${id}/thumbnail/${page}`,
    textLayer: (id, page) => request(`/api/books/${id}/text/${page}`),
    chapter: (id, index) => request(`/api/books/${id}/chapter/${index}`),
    chapterText: (id, index) => request(`/api/books/${id}/chapter/${index}/text`),
    outline: (id) => request(`/api/books/${id}/outline`).then((r) => r.outline),

    // annotazioni
    annotations: (id, page) =>
      request(`/api/books/${id}/annotations${page !== undefined && page !== null ? `?page=${page}` : ''}`)
        .then((r) => r.annotations),
    createAnnotation: (id, data) =>
      request(`/api/books/${id}/annotations`, { method: 'POST', body: data }),
    updateAnnotation: (aid, data) => request(`/api/annotations/${aid}`, { method: 'PATCH', body: data }),
    deleteAnnotation: (aid) => request(`/api/annotations/${aid}`, { method: 'DELETE' }),
    clearAnnotations: (id, page) =>
      request(`/api/books/${id}/annotations/clear${page !== undefined ? `?page=${page}` : ''}`, { method: 'POST' }),

    // note
    notes: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      ).toString();
      return request(`/api/notes${query ? '?' + query : ''}`).then((r) => r.notes);
    },
    createNote: (data) => request('/api/notes', { method: 'POST', body: data }),
    updateNote: (id, data) => request(`/api/notes/${id}`, { method: 'PATCH', body: data }),
    deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),

    // segnalibri
    bookmarks: (id) => request(`/api/books/${id}/bookmarks`).then((r) => r.bookmarks),
    createBookmark: (id, data) => request(`/api/books/${id}/bookmarks`, { method: 'POST', body: data }),
    deleteBookmark: (id) => request(`/api/bookmarks/${id}`, { method: 'DELETE' }),

    // schede
    flashcards: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      ).toString();
      return request(`/api/flashcards${query ? '?' + query : ''}`).then((r) => r.cards);
    },
    createCard: (data) => request('/api/flashcards', { method: 'POST', body: data }),
    updateCard: (id, data) => request(`/api/flashcards/${id}`, { method: 'PATCH', body: data }),
    deleteCard: (id) => request(`/api/flashcards/${id}`, { method: 'DELETE' }),
    reviewCard: (id, quality) =>
      request(`/api/flashcards/${id}/review`, { method: 'POST', body: { quality } }),

    // appunti di studio
    studyNotes: (params = {}) => {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      ).toString();
      return request(`/api/study-notes${query ? '?' + query : ''}`).then((r) => r.notes);
    },
    createStudyNote: (data) => request('/api/study-notes', { method: 'POST', body: data }),
    updateStudyNote: (id, data) => request(`/api/study-notes/${id}`, { method: 'PATCH', body: data }),
    deleteStudyNote: (id) => request(`/api/study-notes/${id}`, { method: 'DELETE' }),
    buildLink: (bookId, page, chapter) => {
      const query = new URLSearchParams({ book_id: bookId, page: page ?? 0 });
      if (chapter !== undefined && chapter !== null) query.set('chapter', chapter);
      return request(`/api/study-notes/link?${query}`).then((r) => r.link);
    },

    // collezioni
    collections: () => request('/api/collections').then((r) => r.collections),
    createCollection: (data) => request('/api/collections', { method: 'POST', body: data }),
    updateCollection: (id, data) => request(`/api/collections/${id}`, { method: 'PATCH', body: data }),
    deleteCollection: (id) => request(`/api/collections/${id}`, { method: 'DELETE' }),

    // ricerca & impostazioni
    search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
    settings: () => request('/api/settings'),
    saveSettings: (data) => request('/api/settings', { method: 'PUT', body: data }),
    stats: () => request('/api/stats'),
    session: (bookId, seconds, pages) =>
      request('/api/session', { method: 'POST', body: { book_id: bookId, seconds, pages } }),
  };

  global.API = API;
})(window);
