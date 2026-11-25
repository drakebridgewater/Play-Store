// ↩️ Returns desk: scan a receipt, pick what comes back, and give the money back the way it was paid.
import { api, esc, money, openModal, drawModal, sfx, toast, loadAll, render, face, art } from '../../lib/core.js';
import { breakdown, moneyChip } from '../../lib/cash.js';
import { printModal } from '../../lib/print.js';
import { storeById } from './common.js';
import { returnSlip } from './slips.js';

export async function returnsModal(orderId) {
  let order = await api('GET', `/api/orders/${orderId}`);
  const back = (o, i) => (o.refunds || []).reduce((n, r) => n + r.lines.filter((l) => l.i === i).reduce((a, l) => a + l.qty, 0), 0);
  const m = {
    qty: {}, refund: null, busy: false,
    left(i) { return order.lines[i].qty - back(order, i); },
    amount() {
      const part = order.lines.reduce((a, l, i) => a + l.price * (m.qty[i] || 0), 0);
      const tax = order.subtotal ? Math.round((part * order.tax) / order.subtotal) : 0;
      const already = (order.refunds || []).reduce((a, r) => a + r.amount, 0);
      return Math.min(part + tax, order.total - already);
    },
    render() {
      const s = storeById(order.storeId);
      const x = '<button class="btn icon close" data-act="close" aria-label="Close">✕</button>';
      const head = `<div class="pay-total"><span class="face">${face({ photo: order.customerPhoto, emoji: order.customerEmoji })}</span> ${esc(order.customer)} · order #${order.number}
        <small class="muted" style="display:block">${s ? `${esc(s.emoji)} ${esc(s.name)} · ` : ''}${money(order.total)} · ${order.paid ? (order.paidWith?.method === 'card' ? `paid by card ••${esc(order.paidWith.last4)}` : 'paid with cash') : 'not paid'}</small></div>`;
      if (m.refund) {
        const r = m.refund;
        return `<div class="sheet"><div class="celebrate">↩️</div>
          <h2>${r.method === 'card' ? `${money(r.amount)} went back on the card` : `Give back ${money(r.amount)}`}</h2>
          <div class="change-box">${r.method === 'card'
            ? `<div>Card ending in <b>${esc(r.last4)}</b>${r.balanceLeft != null ? `. ${esc(r.owner)} now has <b>${money(r.balanceLeft)}</b> in the bank 🏦` : ''}</div>`
            : `<strong>${money(r.amount)}</strong><div class="change-list">${breakdown(r.amount).map((p) => `<span class="each">${moneyChip(p.d)} × ${p.n}</span>`).join('')}</div>`}</div>
          <div class="row split"><button class="btn" data-act="slip">🧾 Return slip</button>
            <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="close">👍 Done</button></div></div>`;
      }
      if (!order.paid) return `<div class="sheet">${x}<h2>↩️ Returns desk</h2>${head}<p class="center">This order was never paid, so there's no money to give back. You can cancel it on the Orders screen.</p></div>`;
      const anyLeft = order.lines.some((_, i) => m.left(i) > 0);
      if (!anyLeft) return `<div class="sheet">${x}<h2>↩️ Returns desk</h2>${head}<p class="center">Everything on this receipt already came back. 👍</p></div>`;
      const amt = m.amount();
      return `<div class="sheet">${x}<h2>↩️ Returns desk</h2>${head}
        <p class="center muted">What are they bringing back?</p>
        <ul class="return-lines">${order.lines.map((l, i) => {
          const left = m.left(i);
          return `<li class="${left ? '' : 'off'}"><span class="art">${art(l)}</span>
            <span class="nm">${esc(l.name)}<small>${money(l.price)} each · bought ${l.qty}${left < l.qty ? ` · ${l.qty - left} already back` : ''}</small></span>
            ${left ? `<span class="stepper"><button data-act="rq" data-i="${i}" data-d="-1" aria-label="One less">−</button><span>${m.qty[i] || 0}</span><button data-act="rq" data-i="${i}" data-d="1" aria-label="One more">+</button></span>` : '<span class="muted">✓</span>'}
          </li>`;
        }).join('')}</ul>
        <div class="row split"><button class="btn" data-act="all">All of it</button>
          <button class="btn huge good" style="width:auto;flex:1;max-width:380px" data-act="refund" ${amt > 0 && !m.busy ? '' : 'disabled'}>↩️ Give back ${money(amt)}${order.paidWith?.method === 'card' ? ' to the card' : ''}</button></div>
      </div>`;
    },
    async act(a, el) {
      if (a === 'rq') { const i = Number(el.dataset.i); m.qty[i] = Math.max(0, Math.min(m.left(i), (m.qty[i] || 0) + Number(el.dataset.d))); sfx.pop(); drawModal(); return; }
      if (a === 'all') { order.lines.forEach((_, i) => { m.qty[i] = m.left(i); }); drawModal(); return; }
      if (a === 'slip') { printModal(returnSlip(order, m.refund), { title: '🧾 Return slip', back: () => openModal(m), to: order.customerId }); return; }
      if (a === 'refund') {
        m.busy = true; drawModal();
        try {
          const lines = Object.entries(m.qty).filter(([, q]) => q > 0).map(([i, q]) => ({ i: Number(i), qty: q }));
          const r = await api('POST', `/api/orders/${order.id}/refund`, { lines });
          order = r.order; m.refund = r.refund;
          sfx.kaching();
          loadAll().then(render, () => {});
        } catch (e) { toast(e.message); }
        m.busy = false; drawModal();
      }
    },
  };
  openModal(m);
}

