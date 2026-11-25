// 🙂 People: customers with names, emoji and photos. No PIN.
import { PEOPLE_EMOJI, S, api, askConfirm, bar, closeModal, drawModal, esc, face, loadAll, openModal, render, setAccent, toast, ui } from '../lib/core.js';
import { readFile, shrinkPhoto } from '../lib/photo.js';
import { printModal, photoImage, emojiImage } from '../lib/print.js';

export function viewPeople() {
  setAccent('#9333ea');
  return bar('🙂 People', '<button class="btn" data-act="me-join">📱 <span>On your phone</span></button>') + `<div class="setup">
    <p class="muted center">Tap someone to change their name or picture.</p>
    <div class="people-grid">
      ${S.customers.map((c) => `<button class="person" data-act="person" data-id="${c.id}"><span class="pic">${face(c)}</span><span>${esc(c.name)}</span></button>`).join('')}
      <button class="person add" data-act="person-add"><span class="pic">➕</span><span>Add someone</span></button>
    </div>
  </div>`;
}

// Add or change a person (customer) from the People page. No PIN.
export function personModal(person, { onSaved = null } = {}) {
  const f = person ? { name: person.name, emoji: person.emoji, photo: person.photo || null } : { name: '', emoji: '🙂', photo: null };
  const m = {
    busy: false,
    render() {
      return `<div class="sheet">
        <button class="btn icon close" data-act="close" aria-label="Close">✕</button>
        <h2>${person ? `✏️ ${esc(person.name)}` : '➕ Someone new'}</h2>
        <div class="preview"><div class="person big"><span class="pic">${face(f)}</span><span id="pv-name">${esc(f.name || 'Name?')}</span></div></div>
        <div class="row" style="justify-content:center">
          <button class="btn" data-act="photo-cam">📷 Take a photo</button>
          <button class="btn" data-act="photo-pick">🖼️ Pick a photo</button>
          ${f.photo ? '<button class="btn danger" data-act="photo-del">No photo</button>' : ''}
          ${person ? '<button class="btn" data-act="member-card">🪪 Member card</button>' : ''}
        </div>
        <label class="field">Name<input data-f="name" value="${esc(f.name)}" maxlength="30" autocomplete="off" placeholder="Name"></label>
        <div class="field">${f.photo ? 'Emoji (shown if the photo goes missing)' : 'Pick a face'}
          <div class="emoji-grid" data-scroll="faces">${PEOPLE_EMOJI.map((e) => `<button data-act="emoji" data-e="${e}" class="${e === f.emoji ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <div class="row split">
          ${person ? '<button class="btn danger" data-act="delete">🗑️ Remove</button>' : '<span></span>'}
          <button class="btn huge primary" style="width:auto;flex:1;max-width:340px" data-act="save" ${m.busy ? 'disabled' : ''}>✅ Save</button>
        </div>
      </div>`;
    },
    input(t) { if (t.dataset.f === 'name') { f.name = t.value; const el = document.getElementById('pv-name'); if (el) el.textContent = f.name || 'Name?'; } },
    enter() { document.activeElement?.blur(); },
    async act(a, el) {
      if (a === 'emoji') { f.emoji = el.dataset.e; drawModal(); return; }
      if (a === 'photo-del') { f.photo = null; drawModal(); return; }
      if (a === 'photo-cam' || a === 'photo-pick') {
        const file = await readFile(a === 'photo-cam');
        if (!file) return;
        try { f.photo = await shrinkPhoto(file); } catch { toast("Couldn't read that photo"); return; }
        if (ui.modal === m) drawModal();
        return;
      }
      if (a === 'member-card') { printModal(await memberCardSlip(person), { title: '🪪 Member card', back: () => openModal(m), to: person.id }); return; }
      if (a === 'delete') {
        if (!(await askConfirm(`Remove ${person.name}?`, { yes: '🗑️ Remove', danger: true }))) return;
        await api('DELETE', `/api/customers/${person.id}`);
        await loadAll(); closeModal(); render();
        return;
      }
      if (a === 'save') {
        if (!f.name.trim()) { toast('Type their name first ✏️'); return; }
        m.busy = true; drawModal();
        let saved;
        try {
          const body = { ...f, name: f.name.trim() };
          if (person) saved = await api('PUT', `/api/customers/${person.id}`, body);
          else saved = await api('POST', '/api/customers', body);
        } catch (e) { m.busy = false; drawModal(); throw e; }
        await loadAll(); closeModal(); render();
        onSaved?.(saved);
        toast(person ? 'Saved ✅' : `Hi ${f.name.trim()}! 👋`);
      }
    },
  };
  openModal(m);
}

export const peopleActions = {
  // people (home screen, no PIN)
  person(el) { const c = S.customers.find((x) => x.id === el.dataset.id); if (c) personModal(c); },
  'person-add'() { personModal(null); },
};

export const peopleApp = { views: { people: viewPeople }, actions: peopleActions };

// A member card: their picture, name and a QR code. Scanning it at the register picks them.
export async function memberCardSlip(c) {
  let pic;
  try { pic = c.photo ? await photoImage(c.photo, 200) : emojiImage(c.emoji || '🙂', 160); } catch { pic = emojiImage(c.emoji || '🙂', 160); }
  return { title: `${c.name}'s member card`, parts: [
    { t: 'text', s: 'KIDS HUB', bold: true, invert: true, align: 'center' },
    { t: 'text', s: 'MEMBER CARD', size: 2, bold: true, align: 'center' },
    { t: 'rule' },
    pic,
    { t: 'text', s: c.name, size: 3, bold: true, align: 'center' },
    { t: 'qr', data: `KH-P-${c.id.toUpperCase()}`, size: 7 },
    { t: 'text', s: 'Scan me at the store', align: 'center' },
    { t: 'rule' },
    { t: 'feed', n: 1 }, { t: 'cut' },
  ] };
}
