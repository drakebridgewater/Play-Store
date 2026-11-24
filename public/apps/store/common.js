// Store helpers shared by the cashier, orders and setup screens.
import { S, closeModal, esc, lsSet, openModal, render } from '../../lib/core.js';

export const storeById = (id) => S.stores.find((s) => s.id === id);
export const hasKitchen = (s) => s?.kitchen !== false; // unknown/deleted stores count as kitchen stores

export function storePickerModal(view) {
  const tile = (href, color, emoji, name) => `<button class="choice store-choice" style="--c:${esc(color)}" data-act="go" data-h="${esc(href)}"><span class="e">${esc(emoji)}</span>${esc(name)}</button>`;
  openModal({
    render: () => `<div class="sheet">
      <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
      <h2>${view === 'orders' ? 'Which orders?' : 'Which store is open?'}</h2>
      <div class="choices">
        ${view === 'orders' ? tile('#/orders/all', '#475569', '🏪', 'All stores') : ''}
        ${S.stores.filter((s) => view !== 'orders' || hasKitchen(s)).map((s) => tile(view === 'orders' ? `#/orders/${s.id}` : `#/cashier/${s.id}`, s.color, s.emoji, s.name)).join('')}
      </div></div>`,
    act(a, el) {
      if (a !== 'go') return;
      if (view === 'orders') lsSet('ordersStore', el.dataset.h.split('/').pop());
      closeModal();
      location.hash = el.dataset.h;
    },
  });
}
