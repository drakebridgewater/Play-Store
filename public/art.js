/* Play Store drawings: hand-written SVG icons plus the sandwich and drink builders.
 * Shared by the browser (window.Art) and the server (require), which uses the same
 * recipe rules to name and price custom orders. Everything is plain strings; no DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Art = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ------------------------------------------------------------ drawing helpers
  const K = '#3b2a20';
  const O = `stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  const f1 = (n) => Math.round(n * 10) / 10;
  const p = (d, fill, x = '') => `<path d="${d}" fill="${fill}" ${O} ${x}/>`;
  const pf = (d, fill, x = '') => `<path d="${d}" fill="${fill}" ${x}/>`;
  const pl = (d, color = K, w = 3, x = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${x}/>`;
  const r = (x, y, w, h, rx, fill, xx = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${O} ${xx}/>`;
  const rf = (x, y, w, h, rx, fill, xx = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${xx}/>`;
  const c = (cx, cy, rr, fill, xx = '') => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}" ${O} ${xx}/>`;
  const cf = (cx, cy, rr, fill, xx = '') => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}" ${xx}/>`;
  const e = (cx, cy, rx, ry, fill, xx = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${O} ${xx}/>`;
  const ef = (cx, cy, rx, ry, fill, xx = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${xx}/>`;
  const FONT = 'font-family="ui-rounded, \'SF Pro Rounded\', Nunito, system-ui, sans-serif" font-weight="800"';
  const svg = (body, vb = '0 0 100 100', cls = 'ill') =>
    `<svg class="${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const appGrid = (x0, y0, cols, rows, size, gap, colors) => {
    let out = '';
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      out += rf(x0 + i * (size + gap), y0 + j * (size + gap), size, size, 2, colors[(i + j * cols) % colors.length]);
    }
    return out;
  };
  const SPRINKLES = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#fff'];
  const sprinkles = (pts) => pts.map(([x, y, a], i) =>
    rf(x - 3, y - 1.2, 6, 2.4, 1.2, SPRINKLES[i % SPRINKLES.length], `transform="rotate(${a} ${x} ${y})"`)).join('');

  // ------------------------------------------------------------ icons (viewBox 0 0 100 100)
  const ICONS = {
    // ---- food + drinks
    apple: { label: 'Apple slices', svg: [
      [-18, 30, 58], [8, 52, 50], [30, 70, 64]].map(([a, x, y]) => `<g transform="rotate(${a} ${x} ${y})">
        ${p(`M${x - 28} ${y + 6} Q${x - 18} ${y - 26} ${x + 26} ${y - 18} Q${x + 12} ${y + 8} ${x - 28} ${y + 6} Z`, '#fef3c7')}
        ${pl(`M${x - 26} ${y + 3} Q${x - 16} ${y - 23} ${x + 23} ${y - 16}`, '#dc2626', 5)}
        ${ef(x - 2, y - 4, 2.2, 3.5, '#7c4a1e', `transform="rotate(40 ${x - 2} ${y - 4})"`)}</g>`).join('') },
    chips: { label: 'Chips', svg: p('M24 14 L76 14 L72 28 L76 72 L72 88 L28 88 L24 72 L28 28 Z', '#facc15')
      + pl('M24 14 L30 20 L36 14 L42 20 L48 14 L54 20 L60 14 L66 20 L72 14 L76 14', K, 2.5)
      + e(50, 52, 19, 14, '#ef4444') + e(50, 52, 10, 6.5, '#fde68a') + pl('M30 78 L70 78', '#ca8a04', 3) },
    carrot: { label: 'Carrots', svg: p('M22 84 Q18 76 32 62 L60 34 Q70 26 76 30 Q82 36 72 46 L44 74 Q30 88 22 84 Z', '#f97316')
      + pl('M40 60 L46 66 M50 50 L56 56 M60 40 L65 45 M32 70 L36 74', '#c2410c', 3)
      + pl('M72 32 Q76 14 88 10 M74 34 Q90 24 96 28 M70 30 Q64 16 70 6', '#16a34a', 6) },
    pickle: { label: 'Pickle', svg: p('M28 82 Q14 70 26 52 L56 22 Q70 8 82 20 Q94 32 78 46 L48 76 Q38 88 28 82 Z', '#65a30d')
      + [[36, 62], [48, 50], [60, 38], [70, 28], [44, 68], [58, 54], [70, 42]].map(([x, y]) => cf(x, y, 2.6, '#a3e635')).join('') },
    juicebox: { label: 'Juice box', svg: p('M64 28 L78 20 L78 80 L64 88 Z', '#ea580c') + p('M26 28 L40 20 L78 20 L64 28 Z', '#fdba74')
      + r(26, 28, 38, 60, 2, '#fb923c') + pl('M58 24 L62 4 L74 4', '#f43f5e', 5)
      + c(45, 58, 11, '#fde047') + pl('M45 47 L45 69 M34 58 L56 58 M37 50 L53 66 M53 50 L37 66', '#f59e0b', 1.8) },
    water: { label: 'Water', svg: p('M40 18 L60 18 Q72 26 72 40 L72 84 Q72 90 66 90 L34 90 Q28 90 28 84 L28 40 Q28 26 40 18 Z', '#bae6fd')
      + r(40, 6, 20, 12, 3, '#2563eb') + rf(29.5, 50, 41, 20, 0, '#3b82f6') + pl('M33 60 Q40 54 47 60 T61 60 T69 58', '#fff', 3)
      + pl('M36 36 L36 44', '#fff', 4) },
    milk: { label: 'Milk', svg: p('M60 36 L76 26 L76 80 L60 90 Z', '#cbd5e1') + p('M26 36 L43 14 L60 36 Z', '#fff')
      + p('M43 14 L60 6 L76 26 L60 36 Z', '#e2e8f0') + r(26, 36, 34, 54, 1, '#fff') + rf(27.5, 52, 31, 18, 0, '#60a5fa')
      + `<text x="43" y="65.5" text-anchor="middle" font-size="10" fill="#fff" ${FONT}>MILK</text>` + ef(36, 80, 5, 3.5, '#1f2937') },
    cookie: { label: 'Cookie', svg: c(50, 50, 36, '#d9a35a') + pl('M24 34 Q30 30 34 34', '#b07a35', 2.5)
      + [[38, 36, 5], [60, 32, 4.5], [70, 52, 5], [48, 56, 5.5], [32, 62, 4.5], [56, 72, 4.5], [40, 48, 3]].map(([x, y, s]) => ef(x, y, s, s * 0.8, '#5b3420')).join('') },
    cupcake: { label: 'Cupcake', svg: p('M24 54 L76 54 L68 88 L32 88 Z', '#f472b6') + pl('M36 56 L40 86 M50 56 L50 86 M64 56 L60 86', '#be185d', 2.5)
      + p('M20 57 Q14 42 30 39 Q28 22 50 22 Q72 22 70 39 Q86 42 80 57 Z', '#fbcfe8') + pl('M50 14 Q52 8 58 6', K, 2.5) + c(50, 17, 7, '#dc2626')
      + sprinkles([[32, 46, 20], [44, 36, -30], [58, 44, 60], [68, 50, -10], [40, 52, 80], [62, 32, 30], [50, 50, 0]]) },
    donut: { label: 'Donut', svg: `<path fill-rule="evenodd" d="M14 50 a36 36 0 1 0 72 0 a36 36 0 1 0 -72 0 Z M39 50 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 Z" fill="#e8a65d" ${O}/>`
      + `<path fill-rule="evenodd" d="M20 48 Q18 26 40 20 Q50 14 62 20 Q84 26 80 50 Q82 62 74 70 Q64 82 50 80 Q30 82 24 68 Q16 60 20 48 Z M38 50 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 Z" fill="#f472b6"/>`
      + sprinkles([[30, 36, 30], [44, 26, -20], [62, 28, 50], [72, 44, -40], [70, 62, 20], [54, 72, 70], [36, 68, -10], [26, 54, 60]]) },
    croissant: { label: 'Croissant', svg: [
      [18, 66, 8, 12, -55], [82, 66, 8, 12, 55], [31, 56, 11, 17, -30], [69, 56, 11, 17, 30], [50, 50, 14, 22, 0]]
      .map(([x, y, rx, ry, a]) => e(x, y, rx, ry, '#e9a23b', `transform="rotate(${a} ${x} ${y})"`)).join('')
      + pl('M44 38 Q50 44 56 38 M43 52 Q50 58 57 52', '#b45309', 2.5) },
    muffin: { label: 'Muffin', svg: p('M26 50 L74 50 L68 88 L32 88 Z', '#93c5fd') + pl('M38 52 L41 86 M50 52 L50 86 M62 52 L59 86', '#3b82f6', 2.5)
      + p('M18 52 Q12 28 34 24 Q50 12 66 24 Q88 28 82 52 Z', '#a16207')
      + [[32, 38], [46, 30], [60, 36], [70, 46], [40, 46], [54, 44]].map(([x, y]) => cf(x, y, 3.5, '#4c1d95')).join('') },
    lemonade: { label: 'Lemonade', svg: pl('M56 16 L66 2', '#22c55e', 5) + p('M26 22 L74 22 L67 90 L33 90 Z', '#fef9c3')
      + pf('M29 38 L71 38 L67 88 L33 88 Z', '#fde047') + rf(36, 50, 12, 12, 3, '#fff', 'opacity=".6" transform="rotate(15 42 56)"')
      + rf(52, 62, 11, 11, 3, '#fff', 'opacity=".6" transform="rotate(-10 57 67)"') + p('M26 22 L74 22 L67 90 L33 90 Z', 'none')
      + c(72, 24, 12, '#facc15') + c(72, 24, 8, '#fef08a') + pl('M72 16 L72 32 M64 24 L80 24', '#facc15', 1.8) },
    smoothie: { label: 'Smoothie', svg: pl('M56 34 L66 4', '#22c55e', 6) + p('M30 34 L70 34 L64 90 L36 90 Z', '#f472b6')
      + p('M24 34 Q50 8 76 34 Z', '#fdf2f8', 'fill-opacity=".85"') + r(24, 32, 52, 6, 3, '#fff')
      + e(48, 62, 9, 10, '#dc2626') + pl('M44 52 Q48 48 52 52', '#16a34a', 3) },

    // ---- tech
    tv: { label: 'TV', svg: pl('M38 78 L32 90 M62 78 L68 90', K, 4) + r(8, 18, 84, 60, 6, '#1f2937')
      + rf(14, 24, 72, 48, 2, '#7dd3fc') + cf(70, 36, 6, '#fde047') + pf('M14 62 Q30 46 46 58 Q62 48 86 56 L86 72 L14 72 Z', '#4ade80')
      + pf('M14 68 Q36 60 56 68 Q72 62 86 66 L86 72 L14 72 Z', '#16a34a') + `<rect x="14" y="24" width="72" height="48" rx="2" fill="none" ${O}/>` },
    soundbar: { label: 'Soundbar', svg: r(6, 42, 88, 20, 10, '#334155')
      + [16, 26, 36, 46, 56, 66, 76, 84].map((x) => cf(x, 52, 2.6, '#94a3b8')).join('') + rf(44, 64, 12, 4, 2, '#3b82f6') },
    laptop: { label: 'Laptop', svg: r(20, 20, 60, 42, 4, '#1f2937') + rf(25, 25, 50, 32, 2, '#60a5fa')
      + appGrid(30, 30, 4, 2, 7, 4, ['#fde047', '#f472b6', '#4ade80', '#fb923c']) + p('M8 66 L92 66 L86 78 L14 78 Z', '#cbd5e1') + pl('M42 72 L58 72', '#64748b', 3) },
    desktop: { label: 'Computer', svg: r(10, 14, 80, 54, 5, '#1f2937') + rf(15, 19, 70, 44, 2, '#a78bfa')
      + pf('M15 50 Q34 36 52 48 Q68 40 85 46 L85 63 L15 63 Z', '#7c3aed') + cf(68, 30, 5, '#fde047')
      + r(44, 68, 12, 10, 0, '#94a3b8') + r(28, 78, 44, 8, 4, '#94a3b8') },
    tablet: { label: 'Tablet', svg: r(20, 10, 60, 80, 9, '#1f2937') + rf(26, 17, 48, 64, 3, '#fbbf24')
      + appGrid(31, 23, 3, 4, 10, 4.5, ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4']) + cf(50, 85.5, 2.5, '#475569') },
    phone: { label: 'Phone', svg: r(30, 8, 40, 84, 10, '#1f2937') + rf(35, 15, 30, 70, 4, '#38bdf8')
      + appGrid(39, 24, 3, 4, 6, 3.5, ['#fde047', '#f472b6', '#4ade80', '#fb923c', '#fff', '#a78bfa']) + rf(43, 17, 14, 3, 1.5, '#1f2937') },
    watch: { label: 'Smartwatch', svg: r(37, 6, 26, 88, 8, '#f472b6') + r(26, 26, 48, 48, 13, '#1f2937')
      + rf(32, 32, 36, 36, 9, '#22c55e') + pl('M50 50 L50 38 M50 50 L59 55', '#fff', 3.5) + r(74, 42, 5, 12, 2, '#94a3b8') },
    headphones: { label: 'Headphones', svg: pl('M20 60 Q20 16 50 16 Q80 16 80 60', K, 10) + pl('M20 60 Q20 16 50 16 Q80 16 80 60', '#ef4444', 4)
      + r(10, 50, 22, 34, 9, '#ef4444') + r(68, 50, 22, 34, 9, '#ef4444') + rf(15, 56, 6, 22, 3, '#fca5a5') + rf(79, 56, 6, 22, 3, '#fca5a5') },
    earbuds: { label: 'Earbuds', svg: r(20, 48, 60, 40, 18, '#f8fafc') + pl('M22 62 L78 62', '#94a3b8', 2.5) + cf(50, 74, 2.5, '#22c55e')
      + r(28, 30, 7, 20, 3.5, '#fff') + e(36, 24, 9, 9, '#fff') + r(65, 30, 7, 20, 3.5, '#fff') + e(64, 24, 9, 9, '#fff') },
    speaker: { label: 'Speaker', svg: r(26, 8, 48, 84, 12, '#0ea5e9') + c(50, 62, 16, '#0c4a6e') + cf(50, 62, 6, '#38bdf8')
      + c(50, 28, 9, '#0c4a6e') + cf(50, 28, 3, '#38bdf8') },
    console: { label: 'Game console', svg: r(12, 30, 76, 40, 8, '#f8fafc') + rf(14, 50, 72, 6, 0, '#1f2937')
      + pl('M24 40 L50 40', '#94a3b8', 3) + cf(76, 40, 3.5, '#3b82f6') + r(18, 70, 10, 6, 2, '#94a3b8') + r(72, 70, 10, 6, 2, '#94a3b8') },
    controller: { label: 'Controller', svg: p('M22 36 Q50 28 78 36 Q94 40 92 66 Q90 82 76 78 L66 66 L34 66 L24 78 Q10 82 8 66 Q6 40 22 36 Z', '#475569')
      + rf(24, 44, 6, 18, 1.5, '#fff') + rf(18, 50, 18, 6, 1.5, '#fff')
      + cf(70, 44, 4.5, '#22c55e') + cf(79, 52, 4.5, '#ef4444') + cf(61, 52, 4.5, '#3b82f6') + cf(70, 60, 4.5, '#eab308') },
    game: { label: 'Video game', svg: r(24, 8, 52, 84, 5, '#2563eb') + rf(25.5, 9.5, 49, 12, 3.5, '#fff')
      + `<text x="50" y="19" text-anchor="middle" font-size="9" fill="#2563eb" ${FONT}>GAME</text>`
      + r(30, 26, 40, 58, 3, '#fde047') + p('M50 34 L56 48 L71 48 L59 57 L63 72 L50 63 L37 72 L41 57 L29 48 L44 48 Z', '#f97316') },
    vr: { label: 'VR headset', svg: pl('M14 50 L4 50 M86 50 L96 50', K, 6) + r(12, 32, 76, 38, 15, '#e2e8f0')
      + rf(19, 39, 62, 24, 11, '#1e293b') + ef(36, 51, 8, 6, '#6366f1') + ef(64, 51, 8, 6, '#ec4899') + pl('M44 70 Q50 62 56 70', K, 3) },
    camera: { label: 'Camera', svg: p('M32 30 L38 18 L62 18 L68 30 Z', '#334155') + r(10, 28, 80, 54, 10, '#334155')
      + c(50, 56, 19, '#94a3b8') + c(50, 56, 11, '#1e3a8a') + cf(45, 51, 3.5, '#fff') + r(70, 35, 12, 7, 2, '#fde047') },
    drone: { label: 'Drone', svg: pl('M36 46 L18 30 M64 46 L82 30 M36 58 L18 74 M64 58 L82 74', K, 5)
      + [[18, 28], [82, 28], [18, 74], [82, 74]].map(([x, y]) => e(x, y, 14, 4, '#cbd5e1')).join('')
      + r(34, 42, 32, 20, 8, '#ef4444') + c(50, 66, 5, '#1f2937') },
    charger: { label: 'Charger', svg: r(38, 4, 6, 12, 1, '#94a3b8') + r(56, 4, 6, 12, 1, '#94a3b8') + r(28, 14, 44, 38, 9, '#f8fafc')
      + p('M52 22 L44 34 L52 34 L48 44 L58 30 L50 30 Z', '#facc15') + pl('M50 52 Q50 74 32 78 Q16 82 24 96', K, 6) + pl('M50 52 Q50 74 32 78 Q16 82 24 96', '#f8fafc', 2.5) },
    batteries: { label: 'Batteries', svg: [22, 56].map((x) => r(x + 7, 16, 8, 6, 1.5, '#94a3b8') + r(x, 22, 22, 64, 5, '#f59e0b')
      + rf(x + 1.5, 62, 19, 22.5, 3.5, '#1f2937') + pl(`M${x + 11} 34 L${x + 11} 46 M${x + 5} 40 L${x + 17} 40`, '#fff', 3.5)).join('') },
    keyboard: { label: 'Keyboard', svg: r(6, 32, 88, 40, 7, '#e2e8f0') + appGrid(13, 39, 9, 2, 6.4, 2.6, ['#94a3b8'])
      + rf(26, 59, 48, 6.4, 2, '#94a3b8') + rf(13, 59, 10, 6.4, 2, '#94a3b8') + rf(77, 59, 10, 6.4, 2, '#94a3b8') },
    mouse: { label: 'Mouse', svg: pl('M50 14 Q50 4 62 4', K, 3) + p('M50 14 Q78 14 78 46 L78 64 Q78 90 50 90 Q22 90 22 64 L22 46 Q22 14 50 14 Z', '#e2e8f0')
      + pl('M22 44 L78 44 M50 14 L50 44', K, 3) + r(46, 22, 8, 14, 4, '#3b82f6') },
  };
  const ICON_KEYS = Object.keys(ICONS);
  const icon = (key) => (ICONS[key] ? svg(ICONS[key].svg) : '');

  // ------------------------------------------------------------ sandwich builder
  const BREADS = {
    white: { name: 'White', crumb: '#f8e3b4', crust: '#cf914c', toast: '#efbf68' },
    brown: { name: 'Brown', crumb: '#c8925c', crust: '#7f4b22', toast: '#a96d38' },
  };
  const SANDWICH_LAYERS = {
    cheese: { name: 'Yellow cheese', price: 25, h: 6 },
    whitecheese: { name: 'White cheese', price: 25, h: 6 },
    ham: { name: 'Ham', price: 50, h: 7 },
    turkey: { name: 'Turkey', price: 50, h: 7 },
    bacon: { name: 'Bacon', price: 50, h: 6 },
    egg: { name: 'Egg', price: 50, h: 8 },
    lettuce: { name: 'Lettuce', price: 25, h: 7 },
    tomato: { name: 'Tomato', price: 25, h: 7 },
    onion: { name: 'Onions', price: 25, h: 6 },
    pickles: { name: 'Pickles', price: 25, h: 6 },
    mayo: { name: 'Mayo', price: 0, h: 3.5 },
    mustard: { name: 'Mustard', price: 0, h: 3.5 },
    pb: { name: 'Peanut butter', price: 25, h: 5 },
    jelly: { name: 'Jelly', price: 25, h: 5 },
  };
  const SANDWICH_BASE = 300;
  const SANDWICH_MAX = 8;

  const wavy = (y, h, x0 = 9, x1 = 91, amp = 2) => {
    const step = (x1 - x0) / 4;
    let d = `M${x0} ${f1(y + 1)}`;
    for (let i = 0; i < 4; i++) d += ` Q${f1(x0 + step * i + step / 2)} ${f1(y + 1 - amp * (i % 2 ? -1 : 1))} ${f1(x0 + step * (i + 1))} ${f1(y + 1)}`;
    d += ` L${x1} ${f1(y + h - 1)}`;
    for (let i = 4; i > 0; i--) d += ` Q${f1(x0 + step * i - step / 2)} ${f1(y + h - 1 + amp * (i % 2 ? -1 : 1))} ${f1(x0 + step * (i - 1))} ${f1(y + h - 1)}`;
    return d + ' Z';
  };

  function sandwichLayerSvg(id, y, h, toasted) {
    switch (id) {
      case 'cheese':
      case 'whitecheese': {
        const drip = toasted ? 9 : 5;
        const col = id === 'cheese' ? ['#fcd34d', '#fbbf24'] : ['#fdf6e3', '#f3e8c8'];
        return p(`M7 ${y} L93 ${y} L90 ${y + h} L80 ${y + h} L77 ${y + h + drip} Q74 ${y + h + drip + 3} 71 ${y + h + drip} L68 ${y + h} L42 ${y + h} L38 ${y + h + drip * 0.7} Q35 ${y + h + drip * 0.7 + 3} 32 ${y + h + drip * 0.7} L29 ${y + h} L10 ${y + h} Z`, col[0])
          + (id === 'whitecheese' ? cf(26, y + h / 2, 1.6, col[1]) + cf(58, y + h / 2 - 0.5, 1.3, col[1]) + cf(80, y + h / 2, 1.5, col[1]) : '')
          + (toasted ? p(`M90 ${y + 1} Q96 ${y + 4} 95 ${y + h + 6} Q93 ${y + h + 9} 91 ${y + h + 5} Z`, col[1]) : '');
      }
      case 'ham': return p(wavy(y, h), '#f9a8b8') + pl(`M24 ${y + h / 2} Q34 ${y + h / 2 - 1.5} 44 ${y + h / 2} M60 ${y + h / 2} Q70 ${y + h / 2 + 1.5} 80 ${y + h / 2}`, '#fce7f3', 1.8);
      case 'turkey': return p(wavy(y, h), '#f1d3a8') + pl(`M20 ${y + h / 2} Q32 ${y + h / 2 - 1.5} 44 ${y + h / 2} M58 ${y + h / 2} Q70 ${y + h / 2 + 1.5} 82 ${y + h / 2}`, '#fbe9cf', 1.8);
      case 'bacon': return p(wavy(y, h, 6, 94, 2.5), '#b4432a') + pl(`M10 ${y + h / 2} Q21 ${y + h / 2 - 2.5} 32 ${y + h / 2} T54 ${y + h / 2} T76 ${y + h / 2} T92 ${y + h / 2}`, '#f3c9a5', 1.8);
      case 'egg': return p(wavy(y, h, 10, 90, 1.5), '#fff') + ef(50, y + h / 2, 13, h / 2 - 0.5, '#facc15') + ef(46, y + h / 2 - 1, 4, 1.4, '#fef9c3');
      case 'lettuce': {
        let d = `M5 ${y + 2}`;
        for (let x = 5; x < 95; x += 15) d += ` Q${x + 7.5} ${y - 2} ${x + 15} ${y + 2}`;
        d += ` L95 ${y + h}`;
        for (let x = 95; x > 5; x -= 10) d += ` Q${x - 5} ${y + h + 5} ${x - 10} ${y + h}`;
        return p(d + ' Z', '#4ade80') + pl(`M14 ${y + h / 2 + 1} L86 ${y + h / 2 + 1}`, '#bbf7d0', 1.6);
      }
      case 'tomato': return [12, 38, 64].map((x) => r(x, y, 24, h, 3.5, '#ef4444')
        + ef(x + 7, y + h / 2, 2, 1.2, '#fecaca') + ef(x + 17, y + h / 2, 2, 1.2, '#fecaca')).join('');
      case 'onion': return [22, 42, 60, 78].map((x, i) => e(x, y + h / 2, 11, h / 2, '#faf5ff', 'stroke="#a855f7"')
        + ef(x, y + h / 2, 6, h / 2 - 2, 'none', 'stroke="#c084fc" stroke-width="1.6"')).join('');
      case 'mayo': return p(`M12 ${y} L88 ${y} L88 ${y + h} Q80 ${y + h + 2.5} 74 ${y + h} L46 ${y + h} Q42 ${y + h + 4} 38 ${y + h} L12 ${y + h} Z`, '#fdfbf3', 'stroke-width="2"');
      case 'mustard': return p(`M12 ${y} L88 ${y} L88 ${y + h} Q84 ${y + h + 4} 80 ${y + h} L32 ${y + h} Q28 ${y + h + 3} 24 ${y + h} L12 ${y + h} Z`, '#eab308', 'stroke-width="2"')
        + pl(`M20 ${y + h / 2} Q30 ${y + h / 2 - 1} 40 ${y + h / 2} T60 ${y + h / 2} T80 ${y + h / 2}`, '#fde047', 1.2);
      case 'pickles': return [24, 50, 76].map((x) => e(x, y + h / 2, 13, h / 2, '#65a30d') + ef(x, y + h / 2, 8, h / 2 - 2, '#a3e635')).join('');
      case 'pb': return r(12, y, 76, h, 2, '#c68a4a');
      case 'jelly': return r(12, y, 76, h, 2, '#9333ea') + p(`M60 ${y + h - 1} Q62 ${y + h + 6} 64 ${y + h - 1} Z`, '#9333ea');
      default: return '';
    }
  }
  function breadSvg(r0, which, y, h) {
    const b = BREADS[r0.bread];
    const crumb = r0.toasted ? b.toast : b.crumb;
    if (which === 'bottom') {
      return r(11, y, 78, h, 5, crumb) + rf(13, y + h - 4.5, 74, 3, 1.5, b.crust)
        ;
    }
    let out = p(`M11 ${y + h} L11 ${y + 9} Q11 ${y} 25 ${y} L75 ${y} Q89 ${y} 89 ${y + 9} L89 ${y + h} Z`, crumb)
      + pl(`M14.5 ${y + h - 1.5} L14.5 ${y + 9} Q14.5 ${y + 3.5} 26 ${y + 3.5} L74 ${y + 3.5} Q85.5 ${y + 3.5} 85.5 ${y + 9} L85.5 ${y + h - 1.5}`, b.crust, 2.5);
    if (r0.bread === 'brown') out += [[30, 9], [46, 11], [62, 8], [72, 12]].map(([x, dy]) => ef(x, y + dy, 1.8, 1, '#e7c79a')).join('');
    if (r0.toasted) out += [28, 42, 56, 70].map((x) => pl(`M${x} ${y + 6} L${x + 7} ${y + h - 4}`, '#7c3f12', 2.6, 'opacity=".75"')).join('');
    return out;
  }
  function sandwichStack(r0) {
    const parts = [{ id: 'bread-bottom', h: 12 }, ...r0.layers.map((id, i) => ({ id, h: SANDWICH_LAYERS[id].h, i })), { id: 'bread-top', h: 18 }];
    let y = 0;
    for (let i = parts.length - 1; i >= 0; i--) { parts[i].y = y; y += parts[i].h; }
    return { parts, H: y };
  }
  function sandwichPartsSvg(r0, parts, opts) {
    return parts.map((pt) => {
      const body = pt.id === 'bread-bottom' ? breadSvg(r0, 'bottom', pt.y, pt.h)
        : pt.id === 'bread-top' ? breadSvg(r0, 'top', pt.y, pt.h)
          : sandwichLayerSvg(pt.id, pt.y, pt.h, r0.toasted);
      const act = opts.interactive && pt.i !== undefined ? ` data-act="rm-layer" data-i="${pt.i}" class="tap${pt.i === opts.newIndex ? ' drop' : ''}"` : (pt.i !== undefined && pt.i === opts.newIndex ? ' class="drop"' : '');
      return `<g${act}>${body}</g>`;
    }).join('');
  }
  function drawSandwich(r0, opts = {}) {
    const { parts, H } = sandwichStack(r0);
    if (!opts.labels) {
      const s = Math.min(1, 86 / (H + 6));
      const tx = f1((100 - 100 * s) / 2);
      const ty = f1((100 - H * s) / 2);
      return svg(`<g transform="translate(${tx} ${ty}) scale(${f1(s * 100) / 100})">${sandwichPartsSvg(r0, parts, opts)}</g>`);
    }
    const S = 1.55, padT = 14, x0 = 4;
    const labels = parts.map((pt) => ({
      text: pt.id === 'bread-top' ? `${r0.toasted ? 'TOASTED ' : ''}${BREADS[r0.bread].name.toUpperCase()} BREAD`
        : pt.id === 'bread-bottom' ? '' : SANDWICH_LAYERS[pt.id].name.toUpperCase(),
      want: padT + S * (pt.y + pt.h / 2),
    })).filter((l) => l.text);
    const GAP = 13;
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].want, labels[i - 1].y + GAP);
    if (labels.length) labels[0].y = labels[0].want;
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].want, labels[i - 1].y + GAP);
    const stackBottom = padT + S * H;
    const overflow = labels.length ? labels[labels.length - 1].y - (stackBottom + 6) : 0;
    if (overflow > 0) for (const l of labels) l.y -= overflow;
    for (let i = labels.length - 2; i >= 0; i--) labels[i].y = Math.min(labels[i].y, labels[i + 1].y - GAP);
    const minY = Math.min(0, ...labels.map((l) => l.y - 8));
    const height = Math.max(stackBottom + 16, ...labels.map((l) => l.y + 10)) - minY;
    const lab = labels.map((l) => pl(`M${f1(x0 + S * 92)} ${f1(l.want)} L${f1(x0 + S * 92 + 10)} ${f1(l.y)} L172 ${f1(l.y)}`, '#9a8577', 1.4)
      + `<text x="176" y="${f1(l.y + 3.6)}" font-size="10.5" fill="#5b4636" letter-spacing=".5" ${FONT}>${l.text}</text>`).join('');
    const plate = ef(x0 + S * 50, stackBottom + 5, S * 50, 6, '#e2e8f0');
    return svg(`${plate}<g transform="translate(${x0} ${padT}) scale(${S})">${sandwichPartsSvg(r0, parts, opts)}</g>${lab}`,
      `0 ${f1(minY)} 290 ${f1(height)}`, 'ill stage');
  }

  // ------------------------------------------------------------ drink builder (cut-away cup)
  const SIZES = { s: { name: 'Small', price: 200, scale: 0.8 }, m: { name: 'Medium', price: 300, scale: 0.9 }, l: { name: 'Large', price: 400, scale: 1 } };
  const DRINK_LAYERS = {
    espresso: { name: 'Espresso', price: 0, color: '#d9531e', text: '#fff1e0' },
    milk: { name: 'Steamed milk', iced: 'Cold milk', price: 0, color: '#a9a77b', text: '#fffbe8' },
    foam: { name: 'Milk foam', price: 0, color: '#c9ddb5', text: '#55663f' },
    water: { name: 'Hot water', iced: 'Water', price: 0, color: '#7cc0e8', text: '#f0f9ff' },
    chocolate: { name: 'Chocolate', price: 50, color: '#5b3420', text: '#fde8d4' },
    caramel: { name: 'Caramel', price: 50, color: '#e0a03a', text: '#fff7e6' },
    tea: { name: 'Tea', price: 0, color: '#b7791f', text: '#fff7e6' },
  };
  const TOPPINGS = {
    whip: { name: 'Whipped cream', short: 'Whip', price: 25 },
    marshmallows: { name: 'Marshmallows', short: 'Marshmallows', price: 25 },
    sprinkles: { name: 'Sprinkles', short: 'Sprinkles', price: 25 },
  };
  const DRINK_MAX = 6;
  let uid = 0; // clipPath ids must be unique per page
  const layerName = (id, iced) => (iced && DRINK_LAYERS[id].iced) || DRINK_LAYERS[id].name;

  function bandsOf(r0) {
    const bands = [];
    r0.layers.forEach((id, i) => {
      const last = bands[bands.length - 1];
      if (last && last.id === id) { last.n++; last.last = i; } else bands.push({ id, n: 1, last: i });
    });
    return bands;
  }
  function toppingSvg(r0, cx, topY, width) {
    let out = '';
    const has = (t) => r0.toppings.includes(t);
    let surface = topY;
    if (has('whip')) {
      const w = width / 2;
      out += p(`M${cx - w} ${topY + 2} Q${cx - w - 2} ${topY - 16} ${cx - w + 20} ${topY - 13} Q${cx - w + 30} ${topY - 30} ${cx - 2} ${topY - 24} Q${cx + 14} ${topY - 38} ${cx + 26} ${topY - 22} Q${cx + w - 4} ${topY - 26} ${cx + w - 6} ${topY - 10} Q${cx + w + 4} ${topY - 6} ${cx + w} ${topY + 2} Z`, '#ffffff');
      surface = topY - 22;
    }
    if (has('marshmallows')) {
      out += [[-26, 0, -12], [-6, -4, 10], [14, -1, -6], [30, 2, 14]].map(([dx, dy, a]) =>
        r(cx + dx - 7, surface + dy - 6, 14, 11, 3, dx % 20 ? '#fbcfe8' : '#fff', `transform="rotate(${a} ${cx + dx} ${surface + dy})"`)).join('');
    }
    if (has('sprinkles')) {
      out += sprinkles([[-30, -2, 20], [-18, -8, -40], [-6, -3, 70], [6, -10, 10], [18, -4, -30], [30, -1, 50], [-24, 4, 80], [12, 2, -60]]
        .map(([dx, dy, a]) => [cx + dx, surface + dy, a]));
    }
    return out;
  }
  function bandsSvg(r0, bands, x, w, bottom, unit, cx, opts, labels) {
    let y = bottom;
    let out = '';
    let text = '';
    bands.forEach((b) => {
      const h = b.n * unit;
      y -= h;
      const L = DRINK_LAYERS[b.id];
      const cls = opts.interactive ? ` data-act="rm-layer" data-i="${b.last}" class="tap${b.last === opts.newIndex ? ' drop' : ''}"` : '';
      let g = rf(x, f1(y), w, f1(h + 0.6), 0, L.color);
      if (b.id === 'foam') g += [0.25, 0.5, 0.75].map((k) => cf(f1(x + w * k), f1(y + h * 0.35), f1(Math.min(3, h / 5)), '#e6f0db')).join('');
      if (labels) {
        // Labels sit above the ice and let taps through to the band underneath.
        const fs = f1(Math.min(13, Math.max(8, h * 0.5)));
        text += `<text x="${cx}" y="${f1(y + h / 2 + fs * 0.36)}" text-anchor="middle" font-size="${fs}" fill="${L.text}" letter-spacing=".6" pointer-events="none" ${FONT}${r0.iced ? ' stroke="rgba(0,0,0,.35)" stroke-width="2.5" paint-order="stroke"' : ''}>${layerName(b.id, r0.iced).toUpperCase()}</text>`;
      }
      out += `<g${cls}>${g}</g>`;
    });
    return { svg: out, text, top: y };
  }
  function drawDrink(r0, opts = {}) {
    const labels = !!opts.labels;
    const bands = bandsOf(r0);
    const sc = SIZES[r0.size].scale;
    let body;
    if (!r0.iced) {
      const cup = 'M30 40 L30 122 Q30 150 58 150 L128 150 Q156 150 156 122 L156 40 Z';
      const id = `cup${++uid}`;
      const unit = 110 / DRINK_MAX;
      const fill = bandsSvg(r0, bands, 30, 126, 150, unit, 93, opts, labels);
      const steam = [70, 93, 116].map((x) => pl(`M${x} 30 q-7 -7 0 -14 q7 -7 0 -14`, '#9ca3af', 4)).join('');
      body = steam
        + p('M10 152 L176 152 Q172 170 142 172 L44 172 Q14 170 10 152 Z', '#2b1d14')
        + pl('M156 60 Q188 60 188 88 Q188 118 156 118', '#2b1d14', 12)
        + `<clipPath id="${id}"><path d="${cup}"/></clipPath>`
        + rf(30, 40, 126, 110, 0, '#fffaf2', `clip-path="url(#${id})"`)
        + `<g clip-path="url(#${id})">${fill.svg}${fill.text}</g>`
        + `<path d="${cup}" fill="none" stroke="#2b1d14" stroke-width="8" stroke-linejoin="round"/>`
        + toppingSvg(r0, 93, Math.min(40, fill.top), 110);
    } else {
      const glass = 'M40 32 L160 32 L148 164 Q147 172 138 172 L62 172 Q53 172 52 164 Z';
      const id = `glass${++uid}`;
      const unit = 138 / DRINK_MAX;
      const fill = bandsSvg(r0, bands, 40, 120, 172, unit, 100, opts, labels);
      const iceTop = Math.max(fill.top, 96);
      const cubes = [[70, iceTop + 10, 12], [104, iceTop + 4, -10], [128, iceTop + 18, 20], [86, iceTop + 34, -18], [116, iceTop + 46, 8]]
        .filter(([, y]) => y < 156)
        .map(([x, y, a]) => `<rect pointer-events="none" x="${x - 11}" y="${f1(y - 11)}" width="22" height="22" rx="5" fill="#fff" fill-opacity=".42" stroke="#fff" stroke-opacity=".9" stroke-width="2.5" transform="rotate(${a} ${x} ${f1(y)})"/>`).join('');
      body = `<clipPath id="${id}"><path d="${glass}"/></clipPath>`
        + rf(30, 32, 140, 140, 0, '#e0f2fe', `clip-path="url(#${id})" fill-opacity=".7"`)
        + `<g clip-path="url(#${id})">${fill.svg}${cubes}<g pointer-events="none">${fill.text}</g></g>`
        + pl('M124 150 L142 4', '#ef4444', 9) + pl('M124 150 L142 4', '#fca5a5', 3, 'stroke-dasharray="6 10"')
        + `<path d="${glass}" fill="none" stroke="#2b1d14" stroke-width="6" stroke-linejoin="round"/>`
        + pl('M50 44 L58 150', '#fff', 4, 'opacity=".7"')
        + toppingSvg(r0, 100, Math.min(32, fill.top), 116);
    }
    const t = `translate(${f1(100 - 100 * sc)} ${f1(176 - 176 * sc)}) scale(${sc})`;
    return svg(`<g transform="${t}">${body}</g>`, labels ? '0 -14 200 192' : '0 -14 200 192', labels ? 'ill stage' : 'ill');
  }

  // ------------------------------------------------------------ recipes: normalise, name, price
  const pickArr = (arr, allowed, max) => (Array.isArray(arr) ? arr : []).filter((x) => typeof x === 'string' && allowed[x]).slice(0, max);
  function normRecipe(builder, rec) {
    const x = rec && typeof rec === 'object' ? rec : {};
    if (builder === 'sandwich') {
      const bread = x.bread === 'wheat' ? 'brown' : x.bread;
      return { bread: BREADS[bread] ? bread : 'white', layers: pickArr(x.layers, SANDWICH_LAYERS, SANDWICH_MAX), toasted: !!x.toasted };
    }
    if (builder === 'drink') {
      return {
        size: SIZES[x.size] ? x.size : 'm', iced: !!x.iced,
        layers: pickArr(x.layers, DRINK_LAYERS, DRINK_MAX),
        toppings: [...new Set(pickArr(x.toppings, TOPPINGS, 3))],
      };
    }
    return null;
  }
  const recipeKey = (builder, rec) => JSON.stringify(normRecipe(builder, rec));
  const counts = (arr) => arr.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {});

  function priceOf(builder, rec) {
    const x = normRecipe(builder, rec);
    if (builder === 'sandwich') return SANDWICH_BASE + x.layers.reduce((a, id) => a + SANDWICH_LAYERS[id].price, 0);
    if (builder === 'drink') {
      return SIZES[x.size].price + x.layers.reduce((a, id) => a + DRINK_LAYERS[id].price, 0)
        + x.toppings.reduce((a, id) => a + TOPPINGS[id].price, 0);
    }
    return 0;
  }
  const startPrice = (builder) => (builder === 'sandwich' ? SANDWICH_BASE : SIZES.s.price);

  // Recognises classic drinks from the layer mix. Returns { name, say, noIced } or null.
  function classicDrink(x) {
    const n = counts(x.layers);
    const has = (k) => n[k] > 0;
    const only = (...ks) => Object.keys(n).every((k) => ks.includes(k));
    if (!x.layers.length) return null;
    if (has('espresso')) {
      if (only('espresso')) return { name: n.espresso > 1 ? 'Double Espresso' : 'Espresso', say: 'es-press-oh' };
      if (only('espresso', 'water')) return { name: 'Americano', say: 'uh-mer-ih-kah-no' };
      if (has('chocolate') && only('espresso', 'chocolate', 'milk', 'foam')) return { name: 'Caffè Mocha', say: 'caf-ay moh-kuh' };
      if (has('caramel') && only('espresso', 'caramel', 'milk', 'foam')) return { name: 'Caramel Latte', say: 'care-uh-mel lah-tay' };
      if (only('espresso', 'foam')) return { name: 'Macchiato', say: 'mah-kee-ah-toe' };
      if (only('espresso', 'milk', 'foam') && has('milk') && has('foam') && n.foam >= n.milk) return { name: 'Cappuccino', say: 'cap-uh-chee-no' };
      if (only('espresso', 'milk', 'foam') && has('milk')) return { name: 'Caffè Latte', say: 'caf-ay lah-tay' };
      return null;
    }
    if (has('chocolate') && only('chocolate', 'milk', 'foam')) return x.iced ? { name: 'Chocolate Milk', noIced: true } : { name: 'Hot Cocoa' };
    if (has('tea') && only('tea', 'water')) return { name: 'Tea' };
    if (has('tea') && has('milk') && only('tea', 'milk', 'foam')) return { name: 'Tea Latte', say: 'tee lah-tay' };
    if (only('milk')) return x.iced ? { name: 'Cold Milk', noIced: true } : { name: 'Steamed Milk' };
    if (only('milk', 'foam')) return { name: 'Babyccino', say: 'bay-bee-chee-no' };
    if (only('water')) return x.iced ? { name: 'Ice Water', noIced: true } : { name: 'Hot Water' };
    return null;
  }
  function classicSandwich(x) {
    const n = counts(x.layers.filter((l) => l !== 'mayo' && l !== 'mustard').map((l) => (l === 'whitecheese' ? 'cheese' : l)));
    const set = Object.keys(n).sort().join('+');
    const has = (k) => n[k] > 0;
    if (!Object.keys(n).length) return x.layers.length ? null : { name: x.toasted ? 'Toast' : 'Bread Sandwich' };
    if (set === 'cheese') return x.toasted ? { name: 'Grilled Cheese', noToasted: true } : { name: 'Cheese Sandwich' };
    if (set === 'jelly+pb') return { name: 'PB & J' };
    if (set === 'pb') return { name: 'Peanut Butter Sandwich' };
    if (set === 'cheese+ham') return { name: 'Ham & Cheese' };
    if (set === 'cheese+egg') return { name: 'Egg & Cheese' };
    if (has('turkey') && has('bacon') && (has('lettuce') || has('tomato'))) return { name: 'Turkey Club' };
    if (set === 'bacon+lettuce+tomato') return { name: 'BLT' };
    return null;
  }
  function nameOf(builder, rec) {
    const x = normRecipe(builder, rec);
    if (builder === 'drink') {
      const cl = classicDrink(x);
      const base = cl ? cl.name : x.layers.length ? 'Secret Recipe' : 'Empty Cup';
      const tops = x.toppings.map((t) => TOPPINGS[t].short);
      return `${SIZES[x.size].name} ${x.iced && !(cl && cl.noIced) ? 'Iced ' : ''}${base}${tops.length ? ` with ${tops.join(' & ')}` : ''}`;
    }
    if (builder === 'sandwich') {
      const cl = classicSandwich(x);
      let base;
      if (cl) base = cl.name;
      else {
        // Lead with the filling (meat, egg, spreads), then cheese, then veg; sauces never name it.
        const rank = { ham: 0, turkey: 0, bacon: 0, egg: 0, pb: 0, jelly: 0, cheese: 1, whitecheese: 1, lettuce: 2, tomato: 2, onion: 2, pickles: 2, mayo: 3, mustard: 3 };
        const short = (id) => (id === 'cheese' || id === 'whitecheese' ? 'Cheese' : SANDWICH_LAYERS[id].name);
        const names = [...new Set([...x.layers].sort((p1, p2) => rank[p1] - rank[p2]).map(short))];
        const main = names.filter((nm) => nm !== 'Mayo' && nm !== 'Mustard');
        base = main.length > 1 ? main.slice(0, 2).join(' & ') + (main.length > 2 ? ' Deluxe' : '') : `${(main.length ? main : names).join(' & ')} Sandwich`;
      }
      return `${x.toasted && !(cl && cl.noToasted) && base !== 'Toast' ? 'Toasted ' : ''}${base}${x.bread !== 'white' ? ` on ${BREADS[x.bread].name}` : ''}`;
    }
    return '';
  }
  const classicOf = (builder, rec) => {
    const x = normRecipe(builder, rec);
    return builder === 'drink' ? classicDrink(x) : classicSandwich(x);
  };
  function detailOf(builder, rec) {
    const x = normRecipe(builder, rec);
    const list = (arr, nm) => Object.entries(counts(arr)).map(([id, k]) => `${nm(id).toLowerCase()}${k > 1 ? ` ×${k}` : ''}`);
    if (builder === 'sandwich') {
      return [BREADS[x.bread].name, x.toasted ? 'toasted' : '', list(x.layers, (id) => SANDWICH_LAYERS[id].name).join(', ')].filter(Boolean).join(' · ');
    }
    if (builder === 'drink') {
      // Bottom-up order, the way you'd pour it.
      const pour = bandsOf(x).map((b) => `${layerName(b.id, x.iced).toLowerCase()}${b.n > 1 ? ` ×${b.n}` : ''}`).join(', ');
      return [SIZES[x.size].name, x.iced ? 'iced' : 'hot', pour, x.toppings.map((t) => TOPPINGS[t].name.toLowerCase()).join(', ')].filter(Boolean).join(' · ');
    }
    return '';
  }

  const SAMPLE = {
    sandwich: { bread: 'brown', layers: ['mayo', 'lettuce', 'tomato', 'cheese', 'turkey'], toasted: false },
    drink: { size: 'l', iced: false, layers: ['espresso', 'milk', 'milk', 'foam'], toppings: [] },
  };
  function draw(builder, rec, opts = {}) {
    const x = normRecipe(builder, rec || SAMPLE[builder]);
    if (builder === 'sandwich') return drawSandwich(x, opts);
    if (builder === 'drink') return drawDrink(x, opts);
    return '';
  }
  // Small picture for an ingredient button.
  function layerArt(builder, id) {
    if (builder === 'sandwich') {
      const h = SANDWICH_LAYERS[id].h;
      return svg(`<g transform="translate(0 ${f1(20 - h / 2)})">${sandwichLayerSvg(id, 0, h, false)}</g>`, '0 4 100 32');
    }
    if (builder === 'drink') {
      if (DRINK_LAYERS[id]) return svg(`${c(20, 20, 15, DRINK_LAYERS[id].color)}`, '0 0 40 40');
      return svg(toppingSvg({ toppings: [id] }, 50, 40, 70), '8 8 84 40');
    }
    return '';
  }

  return {
    ICONS, ICON_KEYS, icon, draw, layerArt, normRecipe, recipeKey, priceOf, startPrice, nameOf, classicOf, detailOf, SAMPLE,
    BUILDERS: {
      sandwich: { name: 'sandwich', breads: BREADS, layers: SANDWICH_LAYERS, max: SANDWICH_MAX, base: SANDWICH_BASE },
      drink: { name: 'drink', sizes: SIZES, layers: DRINK_LAYERS, toppings: TOPPINGS, max: DRINK_MAX },
    },
  };
});
