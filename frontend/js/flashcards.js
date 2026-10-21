/* MyBooks — schede di studio (ripetizione dilazionata) */
(function (global) {
  'use strict';

  const Flashcards = {
    cards: [],

    init() {
      Utils.$('#btn-new-card').addEventListener('click', () => Flashcards.edit(null));
      Utils.$('#btn-review').addEventListener('click', () => Flashcards.startReview());
      Store.on('cards', () => Flashcards.render());
    },

    async load() {
      Flashcards.cards = await API.flashcards();
      Store.state.cards = Flashcards.cards;
      Store.emit('cards', Flashcards.cards);
      const badge = Utils.$('#badge-flashcards');
      badge.textContent = Flashcards.cards.length || '';
      badge.classList.toggle('is-on', Flashcards.cards.length > 0);
      return Flashcards.cards;
    },

    render() {
      const list = Utils.$('#cards-list');
      list.innerHTML = '';
      if (!Flashcards.cards.length) {
        list.appendChild(
          Utils.el('div', { class: 'empty-state' },
            Utils.el('h2', { text: 'Nessuna scheda' }),
            Utils.el('p', { text: 'Crea schede dalle evidenziazioni mentre leggi, poi ripassa con il metodo a intervalli.' })
          )
        );
        return;
      }
      Flashcards.cards.forEach((card, index) => {
        const book = Store.bookById(card.book_id);
        const mastery = Utils.el('div', { class: 'mastery' });
        for (let i = 0; i < 4; i += 1) {
          mastery.appendChild(Utils.el('i', { class: i < Math.min(card.reps || 0, 4) ? 'on' : '' }));
        }
        list.appendChild(
          Utils.el('div', { class: 'flashcard', style: { '--i': index } },
            Utils.el('div', { class: 'flashcard__front', text: card.front }),
            Utils.el('div', { class: 'flashcard__back', text: card.back }),
            Utils.el('div', { class: 'flashcard__foot' },
              Utils.el('span', { class: 'deck-pill', text: card.deck || 'Default' }),
              Utils.el('span', { text: book ? book.title : 'Generale' }),
              mastery
            )
          )
        );
      });
    },

    edit(card) {
      const front = Utils.el('textarea', { class: 'textarea', style: { minHeight: '80px' }, placeholder: 'Domanda / fronte' });
      front.value = card ? card.front : '';
      const back = Utils.el('textarea', { class: 'textarea', style: { minHeight: '80px' }, placeholder: 'Risposta / retro' });
      back.value = card ? card.back : '';
      const deck = Utils.el('input', { class: 'input', type: 'text', value: card ? card.deck : 'Default' });

      const select = Utils.el('select', { class: 'select' });
      select.appendChild(Utils.el('option', { value: '', text: '— Nessun libro —' }));
      Store.state.books.forEach((book) => {
        const option = Utils.el('option', { value: book.id, text: book.title });
        if (card && card.book_id === book.id) option.selected = true;
        select.appendChild(option);
      });

      const body = Utils.el('div', {},
        Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Fronte' }), front),
        Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Retro' }), back),
        Utils.el('div', { class: 'field-row' },
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Mazzo' }), deck),
          Utils.el('div', { class: 'field' }, Utils.el('label', { text: 'Libro' }), select)
        )
      );

      UI.modal({
        title: card ? 'Modifica scheda' : 'Nuova scheda',
        body,
        actions: [
          card
            ? {
                label: 'Elimina',
                variant: 'danger',
                onClick: async () => {
                  await API.deleteCard(card.id);
                  await Flashcards.load();
                  UI.toast('Scheda eliminata');
                  return true;
                },
              }
            : null,
          { label: 'Annulla' },
          {
            label: 'Salva',
            variant: 'primary',
            onClick: async () => {
              const payload = {
                front: front.value.trim(),
                back: back.value.trim(),
                deck: deck.value.trim() || 'Default',
                book_id: select.value ? Number(select.value) : null,
                page: card ? card.page : 0,
              };
              if (!payload.front) {
                UI.toast('Inserisci almeno la domanda', 'warn');
                return false;
              }
              if (card) await API.updateCard(card.id, payload);
              else await API.createCard(payload);
              await Flashcards.load();
              UI.toast('Scheda salvata', 'ok');
              return true;
            },
          },
        ].filter(Boolean),
      });
    },

    /* ------------------------------------------------------ revisione */
    async startReview() {
      await Flashcards.load();
      if (!Flashcards.cards.length) {
        UI.toast('Nessuna scheda da ripassare', 'warn');
        return;
      }
      const queue = Flashcards.cards.slice().sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')));
      let index = 0;
      let revealed = false;

      const overlay = Utils.el('div', { class: 'review' });
      const cardNode = Utils.el('div', { class: 'review__card' });
      overlay.appendChild(cardNode);

      const render = () => {
        cardNode.innerHTML = '';
        if (index >= queue.length) {
          cardNode.appendChild(Utils.el('div', { class: 'review__counter', text: 'Sessione completata' }));
          cardNode.appendChild(Utils.el('div', { class: 'review__front', text: 'Bravissimo! 🎉' }));
          cardNode.appendChild(
            Utils.el('div', { class: 'review__actions' },
              Utils.el('button', { class: 'btn btn--primary', text: 'Chiudi', onClick: () => overlay.remove() })
            )
          );
          return;
        }
        const card = queue[index];
        cardNode.appendChild(
          Utils.el('div', { class: 'review__counter', text: `Scheda ${index + 1} di ${queue.length} · ${card.deck || 'Default'}` })
        );
        cardNode.appendChild(Utils.el('div', { class: 'review__front', text: card.front }));
        if (revealed) {
          cardNode.appendChild(Utils.el('div', { class: 'review__back', text: card.back || '' }));
        }
        const actions = Utils.el('div', { class: 'review__actions' });
        if (!revealed) {
          actions.appendChild(
            Utils.el('button', {
              class: 'btn btn--primary',
              text: 'Mostra risposta',
              onClick: () => {
                revealed = true;
                render();
              },
            })
          );
        } else {
          const quality = Utils.el('div', { class: 'review__quality' });
          [
            { q: 1, label: 'Ripetere', hint: '< 1 min', cls: 'is-bad' },
            { q: 3, label: 'Difficile', hint: 'pochi giorni', cls: 'is-mid' },
            { q: 5, label: 'Facile', hint: 'settimane', cls: 'is-good' },
          ].forEach((option) => {
            quality.appendChild(
              Utils.el('button', {
                class: `quality-btn ${option.cls}`,
                onClick: async () => {
                  await API.reviewCard(card.id, option.q);
                  index += 1;
                  revealed = false;
                  await Flashcards.load();
                  render();
                },
              },
                Utils.el('span', { text: option.label }),
                Utils.el('small', { text: option.hint })
              )
            );
          });
          actions.appendChild(quality);
        }
        cardNode.appendChild(actions);
      };

      render();
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.remove();
      });
      const onKey = (event) => {
        if (event.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', onKey);
        }
      };
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
    },
  };

  global.Flashcards = Flashcards;
})(window);
