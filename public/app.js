// Kids Hub: tablet UI entry. Plain ES modules, no build step.
// The home screen is a grid of apps; each app module brings its own screens (views) and button actions.
import { $app, S, ui, esc, route, setAccent, toast, loadAll, connect, closeModal, setRenderer } from './lib/core.js';
import { APPS } from './apps/registry.js';
import { storeApp } from './apps/store/index.js';
import { bankApp } from './apps/bank.js';
import { peopleApp } from './apps/people.js';
import { setupApp } from './apps/setup.js';
import { spyApp } from './apps/spy/index.js';
import { toolsApp } from './apps/tools/index.js';
import { setScanHandler, scanChip } from './lib/scan.js';
import { printer, statusLine } from './lib/print.js';

const MODULES = { store: storeApp, bank: bankApp, people: peopleApp, spy: spyApp, tools: toolsApp, setup: setupApp };

// Every route name ("cashier", "bank", …) maps to the app that draws it; every data-act to its handler.
const VIEWS = {};
const OWNER = {}; // route name -> app module, for handing it scans
const ACT = {};
for (const [id, mod] of Object.entries(MODULES)) {
  for (const [name, view] of Object.entries(mod.views)) { VIEWS[name] = view; OWNER[name] = mod; }
  for (const [name, fn] of Object.entries(mod.actions || {})) {
    if (ACT[name]) console.warn(`Action "${name}" is defined twice (${id})`);
    ACT[name] = fn;
  }
}

// ------------------------------------------------------------------ home screen
function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning! ☀️' : h < 17 ? 'Good afternoon! 🌤️' : 'Good evening! 🌙';
}
const clockText = (d = new Date()) => d.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' });

function viewHub() {
  setAccent('#ff7a45');
  const tiles = APPS.filter((a) => !S.hub.hidden.includes(a.id)).map((a) => {
    const n = MODULES[a.id]?.badge?.() || 0;
    return `<a class="app-tile" href="${a.href}" style="--c:${a.color}">
      <span class="app-icon">${a.emoji}${n ? `<b class="badge">${n}</b>` : ''}</span>
      <span class="app-name">${esc(a.name)}</span></a>`;
  }).join('');
  return `<div class="hub">
    <header class="hub-top">
      <div><h1 id="hub-hello">${greeting()}</h1><div class="hub-clock" id="hub-clock">${clockText()}</div>
        <div class="hub-status">${scanChip()}${printer().address ? `<span class="chip">🖨️ ${statusLine().replace(/^\S+ /, '')}</span>` : ''}</div></div>
      <a class="btn icon hub-gear" href="#/setup" aria-label="Setup (grown-ups)">⚙️</a>
    </header>
    <nav class="app-grid">${tiles || '<p class="muted center">All the apps are hidden. A grown-up can show them in ⚙️ Setup → Home screen.</p>'}</nav>
  </div>`;
}
// Keep the clock fresh without redrawing the screen.
setInterval(() => {
  const c = document.getElementById('hub-clock');
  if (c) { c.textContent = clockText(); document.getElementById('hub-hello').textContent = greeting(); }
}, 20_000);

// ------------------------------------------------------------------ drawing
function render() {
  if (!S.loaded) return;
  const r = route();
  const view = VIEWS[r.view];
  const html = view ? view(r) : viewHub();
  if (html == null) return; // the view redirected
  $app.innerHTML = html;
  for (const mod of Object.values(MODULES)) mod.afterRender?.(r);
}
setRenderer(render);

// A scan goes to the app on screen first (its onScan returns true when it dealt with it);
// otherwise the "What is this?" card shows up.
// An open window (modal) that wants scans gets them before the screen behind it.
// Some codes mean the same thing on any screen (a spy badge, a clue card): apps claim those in anyScan.
setScanHandler(async (info) => {
  if (await ui.modal?.onScan?.(info)) return true;
  const r = route();
  const owner = OWNER[r.view];
  if (!owner?.ownsScans?.(r)) for (const mod of Object.values(MODULES)) if (await mod.anyScan?.(info)) return true;
  return (await owner?.onScan?.(info, r)) || false;
});

// ------------------------------------------------------------------ events
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !$app.contains(el)) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el, e)).catch((err) => toast(err.message));
});
$app.addEventListener('input', setupApp.onField);
$app.addEventListener('input', (e) => OWNER[route().view]?.onInput?.(e, route()));
$app.addEventListener('change', setupApp.onField);

window.addEventListener('hashchange', () => { if (ui.modal) closeModal(); window.scrollTo(0, 0); render(); });
window.addEventListener('beforeunload', (e) => { if (ui.dirty) e.preventDefault(); });

// ------------------------------------------------------------------ start
(async function start() {
  try {
    await loadAll();
    ui.seen = new Set(S.orders.map((o) => o.id));
    render();
  } catch {
    $app.innerHTML = '<div class="center-msg"><div class="emoji">😵</div><h2>Can\'t reach the Kids Hub</h2><p class="muted">Check the Wi-Fi, then reload.</p><button class="btn primary" onclick="location.reload()">🔄 Try again</button></div>';
  }
  connect();
})();
