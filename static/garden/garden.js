/* Независимый экран сада. Все цены, рост и покупки подтверждает сервер. */
(() => {
  'use strict';
  const W = 576, H = 384, T = 42, GX = 124, GY = 92;
  const q = id => document.getElementById(id);
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let root, G = null, selected = { x: 0, y: 0 }, selectedPen = null, opened = false, busy = false, sheet = null, shopTab = 'seed', zoom = 1.7, camSet = 0, panUntil = 0;
  let timer, refreshBusy = false, pending = null, mode = null, messageTimer, confirmResolve, lastFocus;
  let hero = { x: 150, y: 236, tx: 150, ty: 236 }, effects = [], lastFrame = 0, animation, canvas, cx, scale = 1;
  let centered = false, bg = null, plotLayer = null, plotKey = '';
  const bridge = () => window.PetGardenBridge;
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const hours = sec => sec < 3600 ? Math.max(1, Math.ceil(sec / 60)) + ' мин' : Math.ceil(sec / 3600) + ' ч';
  const errText = 'Связь с садом прервалась. Можно безопасно повторить запрос.';

  // ---------- пиксельные примитивы ----------
  // Все функции рисуют в текущий холст cx; sprite() и сборка фона временно подменяют его.
  const rnd = (a, b = 0) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function rect(x, y, w, h, color, ctx = cx) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function ellipse(x, y, rx, ry, color, ctx = cx) {
    for (let yy = -ry; yy <= ry; yy++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy / (ry * ry + .01)))); rect(x - half, y + yy, half * 2 + 1, 1, color, ctx); }
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function withCtx(ctx, fn) { const keep = cx; cx = ctx; try { fn(); } finally { cx = keep; } }
  const shadow = (x, y, rx, ry, a = .26) => ellipse(x, y, rx, ry, 'rgba(24,52,20,' + a + ')');

  const WOOD = ['#3a2414', '#7a4c28', '#a8713b', '#cf9a56', '#ecc888'];
  const LEAF = ['#17482a', '#26692f', '#3f8f3c', '#69b44a', '#9fd466'];
  const STONE = ['#42484a', '#6c7676', '#939c98', '#bfc6bd'];
  // Деревянная доска с обводкой, светлой кромкой и тёмным низом, как мебель и заборы в игре.
  function plank(x, y, w, h, c = WOOD) {
    rect(x, y, w, h, c[0]);
    if (w > 2 && h > 2) { rect(x + 1, y + 1, w - 2, h - 2, c[2]); rect(x + 1, y + 1, w - 2, 1, c[3]); if (h > 3) rect(x + 1, y + h - 2, w - 2, 1, c[1]); }
  }
  const STONE6 = ['#262d2b', '#3d4743', '#58655f', '#778578', '#9aa99b', '#c2d0c0'];
  function stone(x, y, w = 6, h = 4) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if ((yy === 0 || yy === h - 1) && (xx === 0 || xx === w - 1)) continue;
      const edge = yy === h - 1 || xx === w - 1 ? -.45 : yy === 0 || xx === 0 ? .1 : 0;
      const v = .78 - (yy / h) * .5 - (xx / w) * .12 + edge + (rnd(x + xx, y + yy) - .5) * .22;
      const n = STONE6.length - 1, f = Math.max(0, Math.min(1, v)) * (n - .01); let k = Math.floor(f); if (f - k > thr(x + xx, y + yy)) k++;
      rect(x + xx, y + yy, 1, 1, STONE6[Math.min(n, k)]);
    }
  }
  // Листва: свет сверху слева, упорядоченный дизеринг между оттенками, тёмный низ и светлые листочки.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // Порог дизеринга: смесь упорядоченной матрицы и шума, чтобы переходы выглядели зернисто и естественно, без сетки.
  const thr = (x, y) => ((BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16) * .4 + rnd(x * 3 + 7, y * 5 + 1) * .6;
  const CANOPY = ['#0e3320', '#154a2a', '#1f6430', '#2d7f37', '#41993f', '#5db44a', '#86d35c', '#b3ec7a'];
  function noise2(x, y, s, seed = 0) {
    const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const a = rnd(x0 + seed * 131, y0), b = rnd(x0 + 1 + seed * 131, y0), c = rnd(x0 + seed * 131, y0 + 1), d = rnd(x0 + 1 + seed * 131, y0 + 1);
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function blob(x, y, rx, ry, pal = CANOPY, seed = 0) {
    const n = pal.length - 1;
    for (let yy = -ry; yy <= ry; yy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy / (ry * ry + .01))));
      for (let xx = -half; xx <= half; xx++) {
        const nx = xx / rx, ny = yy / ry, d = Math.hypot(nx, ny), wx = Math.round(x + xx), wy = Math.round(y + yy);
        const clump = noise2(wx, wy, 5, seed) * .42 + noise2(wx, wy, 2.4, seed + 3) * .2;
        let t = .56 - nx * .3 - ny * .46 + clump - .31 - Math.max(0, d - .55) * .5 * (ny > 0 ? 1.1 : .35);
        let f = Math.max(0, Math.min(1, t)) * (n - .01), i = Math.floor(f);
        if (f - i > thr(wx, wy)) i++;
        if (d > .9 && ny > -.2) i = Math.min(i, 1); else if (d > .9) i = Math.min(i, 2);
        rect(wx, wy, 1, 1, pal[Math.max(0, Math.min(n, i))]);
      }
    }
    for (let k = 0; k < Math.round(rx * ry / 14); k++) {
      const a = rnd(seed, k) * 6.283, r = Math.sqrt(rnd(seed + 9, k)) * .78, lx = Math.round(x + Math.cos(a) * r * rx), ly = Math.round(y + Math.sin(a) * r * ry);
      const lit = (-Math.cos(a) * r * .5 - Math.sin(a) * r * .8) > -.15;
      rect(lx, ly, 2, 1, lit ? pal[n] : pal[1]); if (lit) rect(lx - 1, ly + 1, 1, 1, pal[n - 1]);
    }
  }
  function art(rows, pal, x = 0, y = 0) { rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (c) rect(x + i, y + j, 1, 1, c); } }); }

  const CROPS_LIST = ['radish', 'carrot', 'sunflower', 'tomato', 'strawberry', 'lavender', 'pumpkin', 'blueberry'];
  let compact = false;
  // ---------- растения: общий рисунок для грядки и значков ----------
  function leaf(x, y, w, h, light = false) {
    rect(x, y, w, h, LEAF[0]);
    if (w > 2 && h > 2) {
      rect(x + 1, y + 1, w - 2, h - 2, LEAF[2]); rect(x + 1, y + 1, Math.max(1, w - 3), 1, light ? LEAF[4] : LEAF[3]);
      rect(x + 1, y + h - 2, w - 2, 1, LEAF[1]); if (w > 4) rect(x + 2, y + Math.floor(h / 2), w - 4, 1, LEAF[3]);
      if (w > 5) rect(x + w - 3, y + 1, 1, 1, LEAF[4]);
    }
  }
  // x, y: середина основания растения на земле.
  function plant(kind, stage, color, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (stage <= 0) { rect(x - 1, y - 4, 2, 4, LEAF[1]); leaf(x - 4, y - 6, 4, 3); leaf(x + 1, y - 7, 4, 3, true); return; }
    if (stage === 1) { rect(x, y - 9, 2, 9, LEAF[1]); leaf(x - 5, y - 8, 5, 4); leaf(x + 2, y - 11, 5, 4, true); leaf(x - 3, y - 13, 4, 3); return; }
    if (stage === 2) {
      rect(x, y - 14, 2, 14, LEAF[1]); leaf(x - 6, y - 8, 6, 4); leaf(x + 2, y - 11, 6, 4, true); leaf(x - 5, y - 13, 5, 4); leaf(x + 2, y - 16, 5, 4);
      rect(x - 1, y - 19, 4, 4, shade(color, -.45)); rect(x, y - 18, 3, 3, color); rect(x, y - 18, 1, 1, shade(color, .55)); return;
    }
    const dk = shade(color, -.42), lt = shade(color, .5);
    if (kind === 'radish') {
      leaf(x - 7, y - 11, 6, 6); leaf(x - 3, y - 15, 6, 8, true); leaf(x + 2, y - 11, 6, 6);
      ellipse(x, y - 3, 4, 3, dk); ellipse(x, y - 3, 3, 2, color); rect(x - 2, y - 4, 2, 1, lt); rect(x, y, 1, 2, '#f4e6cf');
    } else if (kind === 'carrot') {
      rect(x - 4, y - 12, 2, 9, LEAF[1]); rect(x, y - 14, 2, 11, LEAF[1]); rect(x + 4, y - 11, 2, 8, LEAF[1]);
      leaf(x - 7, y - 16, 5, 5); leaf(x - 2, y - 19, 5, 6, true); leaf(x + 3, y - 15, 5, 5);
      ellipse(x, y - 2, 5, 3, '#8a4510'); ellipse(x, y - 2, 4, 2, '#f09a32'); rect(x - 2, y - 3, 3, 1, '#fbc56a'); rect(x - 1, y - 1, 2, 1, '#d9741c');
    } else if (kind === 'sunflower') {
      const sh = compact ? 13 : 20, hy = y - sh - 5;
      rect(x, y - sh, 2, sh, LEAF[0]); rect(x, y - sh, 1, sh, LEAF[2]);
      leaf(x - 7, y - 7, 7, 4); leaf(x + 2, y - sh + 5, 7, 4, true);
      ellipse(x + 1, hy, 8, 8, '#9c6410'); ellipse(x + 1, hy, 7, 7, color);
      for (let a = 0; a < 12; a++) { const ax = x + 1 + Math.round(Math.cos(a * .5236) * 7), ay = hy + Math.round(Math.sin(a * .5236) * 7); rect(ax, ay, 1, 1, '#ffe27a'); }
      ellipse(x + 1, hy, 4, 4, '#3f2512'); ellipse(x + 1, hy, 3, 3, '#6b4423'); rect(x, hy - 1, 1, 1, '#9a6a36'); rect(x + 2, hy + 1, 1, 1, '#9a6a36');
    } else if (kind === 'tomato') {
      rect(x + 5, y - 22, 1, 22, '#8d6a3c'); rect(x + 5, y - 22, 1, 3, '#b99358');
      leaf(x - 7, y - 15, 7, 5); leaf(x - 1, y - 20, 7, 5, true); leaf(x - 6, y - 8, 7, 5); leaf(x + 1, y - 13, 7, 5);
      [[-4, -5], [3, -8], [-1, -13]].forEach(([dx, dy]) => { ellipse(x + dx, y + dy, 3, 3, dk); ellipse(x + dx, y + dy, 2, 2, color); rect(x + dx - 1, y + dy - 2, 1, 1, lt); rect(x + dx, y + dy - 3, 1, 1, LEAF[3]); });
    } else if (kind === 'strawberry') {
      leaf(x - 9, y - 8, 8, 5); leaf(x + 1, y - 9, 8, 5, true); leaf(x - 5, y - 13, 8, 5);
      [[-6, -3], [4, -4], [0, -5]].forEach(([dx, dy]) => { ellipse(x + dx, y + dy, 2, 2, dk); rect(x + dx - 1, y + dy - 1, 3, 3, color); rect(x + dx - 1, y + dy - 1, 1, 1, lt); rect(x + dx, y + dy, 1, 1, '#ffe9a0'); });
      rect(x - 7, y - 16, 4, 4, '#cfd8c0'); rect(x - 6, y - 15, 2, 2, '#fffaf0'); rect(x - 5, y - 14, 1, 1, '#ffd84a');
      rect(x + 4, y - 14, 4, 4, '#cfd8c0'); rect(x + 5, y - 13, 2, 2, '#fffaf0'); rect(x + 6, y - 12, 1, 1, '#ffd84a');
    } else if (kind === 'lavender') {
      [[-6, 13], [0, 18], [6, 14]].forEach(([dx, h]) => {
        rect(x + dx, y - h, 1, h, LEAF[1]); rect(x + dx - 1, y - h - 8, 4, 9, shade(color, -.45)); rect(x + dx, y - h - 8, 2, 9, color);
        rect(x + dx, y - h - 8, 1, 6, shade(color, .45)); rect(x + dx, y - h - 9, 1, 1, shade(color, .6));
      });
      leaf(x - 8, y - 4, 5, 3); leaf(x + 3, y - 5, 5, 3, true);
    } else if (kind === 'pumpkin') {
      leaf(x - 11, y - 9, 8, 6); leaf(x + 4, y - 10, 8, 6, true);
      ellipse(x, y - 5, 8, 6, dk); ellipse(x, y - 5, 7, 5, color);
      rect(x - 3, y - 9, 1, 8, shade(color, -.22)); rect(x + 3, y - 9, 1, 8, shade(color, -.22)); rect(x - 6, y - 8, 2, 2, lt); rect(x, y - 10, 1, 1, lt);
      rect(x, y - 12, 3, 4, LEAF[1]); rect(x + 1, y - 12, 1, 3, LEAF[3]);
    } else {
      ellipse(x, y - 8, 8, 7, LEAF[0]); ellipse(x, y - 8, 7, 6, LEAF[2]); rect(x - 5, y - 12, 5, 2, LEAF[3]); rect(x + 1, y - 6, 4, 2, LEAF[1]);
      [[-4, -9], [3, -11], [4, -5], [-2, -4], [0, -13]].forEach(([dx, dy]) => { ellipse(x + dx, y + dy, 2, 2, '#26306e'); rect(x + dx - 1, y + dy - 1, 2, 2, '#4a5cc0'); rect(x + dx - 1, y + dy - 1, 1, 1, '#9aa6f0'); });
    }
  }

  // ---------- значки и украшения 24×24 (в саду рисуются ×2) ----------
  function sprite(ctx, type, stage = 3, color = '#ed6d88') {
    withCtx(ctx, () => {
      if (CROPS_LIST.includes(type)) { plant(type, stage, color, 14, compact ? 30 : 25); return; }
      const e = ellipse;
      if (type === 'bed') {
        rect(2, 6, 24, 20, '#3b2514'); rect(3, 7, 22, 4, '#b57e44'); rect(3, 7, 22, 1, '#e0b072');
        rect(3, 11, 3, 10, '#8f5c30'); rect(22, 11, 3, 10, '#7a4c28'); rect(6, 11, 16, 10, '#4a2f1d');
        for (let y = 13; y < 21; y += 3) rect(7, y, 14, 1, '#5e3f27');
        rect(3, 21, 22, 4, '#a06b36'); rect(3, 21, 22, 1, '#cf9a56'); plant('radish', 3, '#ed6d88', 14, 20); return;
      }
      if (type === 'coin') { e(14, 14, 11, 11, '#7a4c0a'); e(14, 14, 10, 10, '#e2a82a'); e(14, 14, 8, 8, '#f6d35a'); e(14, 14, 6, 6, '#e8b730'); rect(13, 9, 3, 11, '#a56a10'); rect(10, 11, 9, 2, '#a56a10'); rect(10, 16, 9, 2, '#a56a10'); rect(9, 8, 3, 3, '#fff3b0'); return; }
      if (type === 'harvest') {
        rect(5, 14, 20, 11, WOOD[0]); rect(6, 15, 18, 9, '#b77a3c'); for (let x = 8; x < 24; x += 4) rect(x, 15, 1, 9, '#8f5c30'); rect(6, 19, 18, 1, '#8f5c30'); rect(6, 15, 18, 1, '#d6a468');
        plank(4, 12, 22, 4); ellipse(10, 10, 4, 4, '#8c2418'); ellipse(10, 10, 3, 3, '#e0402f'); rect(9, 8, 1, 1, '#ff9a85'); rect(10, 6, 1, 2, LEAF[3]);
        rect(14, 4, 4, 9, '#9a4f12'); rect(15, 4, 2, 8, '#f09a32'); leaf(14, 1, 4, 4, true); ellipse(21, 10, 3, 3, '#2a5a2a'); ellipse(21, 10, 2, 2, '#6cb044'); return;
      }
      if (type === 'water') {
        rect(6, 12, 13, 12, '#27506f'); rect(7, 13, 11, 10, '#4f8cc0'); rect(7, 13, 11, 2, '#8fc0e6'); rect(7, 21, 11, 2, '#3d6e9a');
        rect(19, 14, 6, 3, '#27506f'); rect(20, 15, 5, 1, '#6aa4d4'); rect(24, 11, 3, 4, '#27506f'); rect(25, 12, 1, 2, '#8fc0e6'); rect(3, 13, 4, 2, '#27506f'); rect(3, 13, 2, 8, '#27506f'); rect(4, 14, 1, 6, '#6aa4d4');
        rect(26, 16, 1, 2, '#bfe9f5'); rect(25, 19, 1, 2, '#8fdcf0'); return;
      }
      if (type === 'well') {
        shadow(14, 25, 11, 2); e(14, 20, 11, 5, STONE[0]); rect(3, 15, 22, 7, STONE[0]); rect(4, 15, 20, 7, STONE[2]);
        for (let y = 16; y < 22; y += 3) { rect(4, y, 20, 1, STONE[1]); } for (let x = 7; x < 24; x += 6) { rect(x, 15, 1, 3, STONE[1]); rect(x + 3, 18, 1, 3, STONE[1]); }
        rect(4, 15, 20, 1, STONE[3]); e(14, 15, 9, 3, STONE[0]); e(14, 15, 8, 2, '#1f7da6'); rect(9, 14, 4, 1, '#7fd6ea');
        plank(4, 5, 3, 11, WOOD); plank(21, 5, 3, 11, WOOD); plank(2, 3, 24, 4, WOOD); rect(13, 7, 2, 7, '#e8d3a0'); plank(11, 12, 6, 4, WOOD); return;
      }
      if (type === 'sprinkler') { rect(13, 11, 3, 14, '#4a5a64'); rect(14, 11, 1, 14, '#9aa8b0'); rect(8, 8, 13, 4, '#33566e'); rect(9, 9, 11, 2, '#6aa4c8'); rect(12, 5, 5, 4, '#33566e'); [[4, 4], [8, 1], [19, 1], [23, 4], [5, 8], [22, 8]].forEach(([x, y]) => rect(x, y, 2, 3, '#8fdcf0')); return; }
      if (type === 'fertilizer') {
        rect(7, 8, 18, 17, WOOD[0]); rect(8, 9, 16, 15, '#c9a46a'); rect(8, 9, 16, 2, '#e3c78f'); rect(8, 22, 16, 2, '#a98048');
        rect(9, 5, 14, 5, WOOD[0]); rect(10, 6, 12, 3, '#dcbf8a'); rect(9, 10, 14, 2, '#7a4c28');
        rect(15, 14, 2, 7, LEAF[1]); leaf(10, 14, 5, 4); leaf(17, 13, 5, 4, true); return;
      }
      if (type === 'expand') {
        plank(3, 5, 22, 20); [[5, 7, '#77b24a'], [15, 7, '#a9d06a'], [5, 16, '#a9d06a'], [15, 16, '#77b24a']].forEach(([x, y, c]) => { rect(x, y, 9, 8, c); rect(x, y, 9, 1, shade(c, .35)); });
        rect(13, 5, 2, 20, WOOD[1]); rect(3, 14, 22, 2, WOOD[1]); return;
      }
      if (SPECIES_KEYS.includes(type) || PRODUCT_KEYS.includes(type) || type === 'feed' || type === 'pen') { drawFarmIcon(type); return; }
      shadow(14, 25, 10, 2);
      if (type === 'bench') {
        plank(4, 17, 3, 7); plank(21, 17, 3, 7); plank(3, 7, 22, 4); plank(3, 11, 22, 2, WOOD); plank(2, 13, 24, 5);
        rect(2, 13, 24, 1, WOOD[4]); rect(8, 14, 1, 3, WOOD[1]); rect(19, 14, 1, 3, WOOD[1]); return;
      }
      if (type === 'flowers') {
        e(14, 15, 11, 6, LEAF[0]); e(14, 15, 10, 5, LEAF[2]); rect(5, 13, 6, 2, LEAF[3]); rect(16, 12, 6, 2, LEAF[3]);
        [[7, 11, '#f06a8e'], [12, 8, '#ffd84a'], [17, 10, '#ffffff'], [21, 13, '#b08be0'], [10, 15, '#ffffff'], [16, 15, '#ff9a52'], [14, 12, '#ee5a5a']].forEach(([x, y, c]) => { rect(x - 1, y - 1, 3, 3, shade(c, -.3)); rect(x - 1, y, 3, 1, c); rect(x, y - 1, 1, 3, c); rect(x, y, 1, 1, '#ffe27a'); });
        plank(4, 19, 20, 6); rect(5, 22, 18, 1, WOOD[1]); rect(13, 20, 1, 5, WOOD[1]); return;
      }
      if (type === 'lantern') {
        rect(13, 10, 3, 15, WOOD[0]); rect(14, 11, 1, 13, WOOD[3]); plank(10, 22, 9, 3, WOOD);
        rect(8, 1, 13, 3, '#3a2a1a'); rect(9, 2, 11, 1, '#7a5a38'); rect(9, 4, 11, 9, '#3a2a1a'); rect(10, 5, 9, 7, '#ffd877'); rect(11, 6, 3, 5, '#fff3b8'); rect(14, 5, 1, 7, '#a56a20'); rect(9, 13, 11, 2, '#3a2a1a'); return;
      }
      if (type === 'pond') {
        e(14, 17, 12, 7, STONE[0]); e(14, 17, 11, 6, STONE[2]);
        for (let a = 0; a < 12; a++) { const x = 14 + Math.cos(a * .5236) * 10, y = 17 + Math.sin(a * .5236) * 5.5; rect(x - 2, y - 1, 4, 3, a % 2 ? STONE[1] : STONE[3]); rect(x - 2, y - 1, 4, 1, STONE[3]); }
        e(14, 17, 8, 4, '#1f7da6'); e(14, 17, 7, 3, '#3fb0d4'); rect(10, 16, 4, 1, '#bff0f7'); rect(17, 19, 3, 1, '#8fdcf0');
        e(17, 18, 3, 2, LEAF[1]); e(17, 18, 2, 1, LEAF[3]); rect(18, 17, 2, 1, '#3fb0d4'); rect(11, 15, 3, 3, '#f4a0c0'); rect(12, 16, 1, 1, '#fff2a0'); return;
      }
      if (type === 'beehive') {
        rect(7, 21, 3, 4, WOOD[0]); rect(19, 21, 3, 4, WOOD[0]); rect(6, 13, 17, 9, WOOD[0]); rect(7, 14, 15, 7, '#dcae5e'); rect(7, 14, 15, 1, '#f1cd86');
        rect(7, 17, 15, 1, '#b88437'); rect(7, 20, 15, 1, '#b88437'); rect(12, 18, 5, 4, '#3a2414'); rect(13, 19, 3, 3, '#1c1008');
        rect(4, 11, 21, 3, WOOD[0]); rect(5, 12, 19, 1, WOOD[2]); rect(7, 8, 15, 3, WOOD[0]); rect(8, 9, 13, 1, WOOD[3]); rect(10, 5, 9, 3, WOOD[0]); rect(11, 6, 7, 1, WOOD[4]); rect(12, 3, 5, 2, WOOD[0]);
        rect(23, 16, 2, 2, '#f2c230'); rect(24, 16, 1, 2, '#3a2414'); rect(3, 18, 2, 2, '#f2c230'); rect(4, 18, 1, 2, '#3a2414'); return;
      }
    });
  }
  function icon(type, color, stage = 3) {
    const crop = CROPS_LIST.includes(type), c = node('canvas', 'g-item-icon'); c.width = c.height = crop ? 32 : 28;
    const context = c.getContext('2d'); context.imageSmoothingEnabled = false;
    compact = true; try { sprite(context, type, stage, color); } finally { compact = false; } return c;
  }
  function button(label, fn, variant = '', disabled = false) {
    const b = node('button', 'g-btn ' + variant, label); b.type = 'button'; b.disabled = disabled || busy || !!pending;
    b.addEventListener('click', fn); return b;
  }
  function notify(text) { q('g-message').textContent = text; q('g-message').hidden = false; clearTimeout(messageTimer); messageTimer = setTimeout(() => { q('g-message').hidden = true; }, 4500); }

  function mount() {
    root = node('section'); root.id = 'pet-garden'; root.hidden = true; root.setAttribute('aria-label', 'Ваш общий сад');
    root.innerHTML = '<header class="g-header"><button type="button" class="g-back" id="g-back" aria-label="Вернуться в лес">‹</button><div class="g-heading"><h1>Наш двор</h1><small>Маленький сад, большая радость</small></div><div class="g-wallet" id="g-wallet">🪙 …</div></header><div class="g-status" id="g-status"><span id="g-weather">Загружаем сад…</span><span id="g-area"></span></div><div class="g-stage" id="g-stage"><div class="g-scroll" id="g-scroll"><div class="g-world" id="g-world"><canvas class="g-map" id="g-map" width="576" height="384" aria-label="Сад с грядками"></canvas><div class="g-hits" id="g-hits" role="group" aria-label="Клетки сада"></div></div></div><div class="g-sign" id="g-sign">Урожай всегда дождётся вас</div><div class="g-zoom"><button type="button" id="g-minus" aria-label="Уменьшить карту">−</button><button type="button" id="g-plus" aria-label="Увеличить карту">+</button></div></div><div class="g-care" id="g-care"></div><nav class="g-nav" id="g-nav" aria-label="Разделы сада"></nav><div class="g-message" id="g-message" role="status" aria-live="polite" hidden></div><div class="g-sheet" id="g-sheet" hidden><section class="g-sheet-box" role="dialog" aria-modal="true" aria-labelledby="g-sheet-title"><div class="g-sheet-head"><div class="g-sheet-title" id="g-sheet-title"></div><button type="button" class="g-close" id="g-sheet-close" aria-label="Закрыть окно">×</button></div><div class="g-tabs" id="g-tabs"></div><div class="g-sheet-body" id="g-sheet-body"></div></section></div><div class="g-confirm" id="g-confirm" hidden><div class="g-confirm-box" role="dialog" aria-modal="true" aria-labelledby="g-confirm-text"><div id="g-confirm-text"></div><div class="g-actions"><button type="button" class="g-btn" id="g-confirm-no">Отмена</button><button type="button" class="g-btn primary" id="g-confirm-yes">Подтвердить</button></div></div></div>';
    document.body.appendChild(root); canvas = q('g-map'); cx = canvas.getContext('2d'); cx.imageSmoothingEnabled = false;
    q('gardenentry')?.addEventListener('click', open);
    q('g-back').addEventListener('click', close);
    q('g-plus').addEventListener('click', () => { zoom = Math.min(3, zoom + .3); size(); });
    q('g-minus').addEventListener('click', () => { zoom = Math.max(1, zoom - .3); size(); });
    q('g-sheet-close').addEventListener('click', closeSheet);
    q('g-sheet').addEventListener('click', e => { if (e.target === q('g-sheet')) closeSheet(); });
    q('g-confirm-no').addEventListener('click', () => finishConfirm(false));
    q('g-confirm-yes').addEventListener('click', () => finishConfirm(true));
    q('g-scroll').addEventListener('scroll', () => { const n = performance.now(); if (n - camSet > 140) panUntil = n + 3500; }, { passive: true });
    q('g-world').addEventListener('click', e => { panUntil = 0; if (!G) return; if (mode && String(mode.type).startsWith('pen')) { placeGhost(e); return; } if (e.target.closest('.g-cell')) return; const box = q('g-world').getBoundingClientRect(); hero.tx = Math.max(40, Math.min(W - 40, (e.clientX - box.left) / scale)); hero.ty = Math.max(70, Math.min(H - 26, (e.clientY - box.top) / scale)); });
    new ResizeObserver(() => { if (opened) size(); }).observe(q('g-stage'));
    document.addEventListener('keydown', e => {
      if (!opened) return;
      if (e.key === 'Escape') { e.preventDefault(); if (confirmResolve) finishConfirm(false); else if (sheet) closeSheet(); else close(); }
      if (e.key === 'Tab' && (sheet || confirmResolve)) {
        const target = confirmResolve ? q('g-confirm') : q('g-sheet'); const f = [...target.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    });
    document.addEventListener('visibilitychange', () => { if (!opened) return; if (document.hidden) cancelAnimationFrame(animation); else { lastFrame = 0; animate(performance.now()); load(); } });
  }
  async function open() {
    const b = bridge();
    if (!b || !b.canEnter()) {
      if (root && !root.hidden) notify('Сначала откройте лес и вернитесь на задний двор.');
      return;
    }
    opened = true; root.hidden = false; document.body.classList.add('pet-garden-open');
    G = null; pending = null; mode = null; penGhost = null; sheet = null; centered = false; renderCare(); size();
    bridge().sound('door'); bridge().haptic('light');
    try { const bb = bridge().telegram?.BackButton; bb?.show(); bb?.onClick(close); } catch (_) {}
    lastFrame = 0; animate(performance.now());
    const ok = await load(); if (ok && G.stats.planted === 0) openSheet('welcome');
    clearInterval(timer); timer = setInterval(() => { if (!busy && !refreshBusy && !document.hidden && opened) load(); }, 15000);
  }
  function close() {
    if (!opened || busy) return;
    if (pending) { notify('Сначала повторите запрос, чтобы узнать результат последнего действия.'); return; }
    opened = false; root.hidden = true; document.body.classList.remove('pet-garden-open'); clearInterval(timer); cancelAnimationFrame(animation); closeSheet();
    try { const bb = bridge().telegram?.BackButton; bb?.offClick(close); bb?.hide(); } catch (_) {}
    bridge()?.back(); q('gardenentry')?.focus();
  }
  function receive(r) {
    if (r.garden && (!G || r.garden.revision > G.revision || (r.garden.revision === G.revision && r.garden.now >= G.now))) {
      G = r.garden; if (r.state) bridge()?.sync(r.state); render();
    }
  }
  async function load() {
    if (!opened || refreshBusy || busy) return false; refreshBusy = true;
    try {
      const r = await bridge().api('/api/pet/garden/state', {});
      if (!opened) return false;
      if (r.locked) { notify(r.say); G = null; close(); return false; }
      receive(r); q('g-status').classList.remove('g-offline'); return !!G;
    } catch (_) {
      if (opened) { q('g-status').classList.add('g-offline'); q('g-weather').textContent = 'Нет связи, сад в безопасности'; if (!G) renderCare(true); }
      return false;
    } finally { refreshBusy = false; }
  }
  function requestId() { return window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14); }
  async function act(action, extra = {}, retry = false) {
    if (!G || busy || (!retry && pending)) return;
    const payload = retry ? pending : { action, revision: G.revision, request_id: requestId(), ...extra };
    if (!payload) return;
    busy = true; pending = null; render();
    try {
      const r = await bridge().api('/api/pet/garden/action', payload);
      if (r.locked) { busy = false; notify(r.say); close(); return; }
      receive(r); notify(r.say || (r.ok ? 'Готово.' : 'Не получилось выполнить действие.'));
      bridge()?.sound(r.ok ? (['buy', 'expand', 'buy_pen', 'buy_animal'].includes(payload.action) ? 'buy' : ['sell', 'sell_all', 'sell_good', 'sell_goods'].includes(payload.action) ? 'coin' : 'ok') : 'no');
      if (r.ok) { bridge()?.haptic('ok'); effects.push({ x: selectedPen && penOf(selectedPen) ? penSlot(penOf(selectedPen))[0] + PEN_W / 2 : GX + selected.x * T + T / 2, y: selectedPen && penOf(selectedPen) ? penSlot(penOf(selectedPen))[1] + 40 : GY + selected.y * T, born: performance.now(), color: '#f8e6a0' }); }
    } catch (_) { pending = payload; notify(errText); }
    finally { busy = false; render(); }
  }
  function confirm(text) {
    return new Promise(resolve => { confirmResolve = resolve; lastFocus = document.activeElement; q('g-confirm-text').textContent = text; q('g-confirm').hidden = false; q('g-confirm-no').focus(); });
  }
  function finishConfirm(ok) { q('g-confirm').hidden = true; const done = confirmResolve; confirmResolve = null; lastFocus?.focus(); done?.(ok); }
  async function purchase(kind, item, count = 1) {
    if (!G || busy || pending) return;
    const c = G.catalog[kind === 'seed' ? 'crops' : kind === 'decor' ? 'decor' : 'supplies'][item];
    if (await confirm('Купить «' + c.name + '»' + (count > 1 ? ' × ' + count : '') + ' за ' + fmt(c.price * count) + ' монет из общей копилки?')) act('buy', { kind, item, count });
  }
  async function expand() { const n = G?.next_expansion; if (n && await confirm('Расширить сад до ' + n.cols + ' × ' + n.rows + ' клеток за ' + fmt(n.price) + ' монет? Все грядки и растения сохранятся.')) act('expand'); }
  async function buyPen() {
    if (!G || busy || pending) return; const c = G.catalog.pen;
    if (G.pens.length + G.pen_stock >= c.max) { notify('Больше загонов во дворе не поместится.'); return; }
    if (await confirm('Купить загон за ' + fmt(c.price) + ' монет из общей копилки? Потом вы сами выберете, где его поставить.')) { await act('buy_pen'); if (G && G.pen_stock > 0) startPenPlace(); }
  }
  function startPenPlace(id) {
    if (!G) return; closeSheet(); selectedPen = null; mode = { type: id ? 'penmove' : 'penplace', id };
    const pen = id ? penOf(id) : null; penGhost = { x: pen ? pen.x : 200, y: pen ? pen.y : 200 }; penGhost.err = penSpotError(penGhost.x, penGhost.y, id);
    q('g-hits').classList.add('g-placing'); renderCare();
  }
  function endPenPlace() { mode = null; penGhost = null; q('g-hits').classList.remove('g-placing'); renderCare(); }
  function placeGhost(e) {
    const box = q('g-world').getBoundingClientRect(), wx = (e.clientX - box.left) / scale, wy = (e.clientY - box.top) / scale;
    const x = Math.round((wx - PEN_W / 2) / 2) * 2, y = Math.round((wy - PEN_H / 2) / 2) * 2;
    penGhost = { x: Math.max(0, Math.min(W - PEN_W, x)), y: Math.max(0, Math.min(H - PEN_H, y)), moved: true };
    penGhost.err = penSpotError(penGhost.x, penGhost.y, mode.id); renderCare();
  }
  async function confirmPenPlace() {
    if (!penGhost || penGhost.err || !mode) { notify(penGhost?.err || 'Нажмите на карту, куда поставить загон.'); return; }
    const m0 = mode, g0 = penGhost; endPenPlace();
    await act(m0.type === 'penmove' ? 'move_pen' : 'place_pen', { pen: m0.id, x: g0.x, y: g0.y });
  }
  // Выбираем загон: сначала с тем же видом и местом, потом пустой.
  function pickPen(species, penId) {
    const cap = G.catalog.pen.capacity;
    if (penId) { const p = penOf(penId), sp = penSpecies(penId); return p && (!sp || sp === species) && penAnimals(penId).length < cap ? p : null; }
    const same = G.pens.find(p => penSpecies(p.id) === species && penAnimals(p.id).length < cap);
    return same || G.pens.find(p => !penSpecies(p.id)) || null;
  }
  async function buyAnimal(species, penId) {
    if (!G || busy || pending) return; const sp = G.catalog.species[species], pen = pickPen(species, penId);
    if (!G.pens.length) { notify('Сначала постройте загон.'); return; }
    if (!pen) { notify(G.pens.some(p => penSpecies(p.id) === species) ? 'Загон для этого вида заполнен.' : 'Нет свободного загона: в одном загоне живёт один вид.'); return; }
    if (await confirm('Купить: ' + sp.name.toLowerCase() + ' за ' + fmt(sp.price) + ' монет из общей копилки?')) { selectedPen = pen.id; act('buy_animal', { pen: pen.id, item: species }); }
  }
  function selectPen(id) {
    if (!G || busy || pending) return; panUntil = 0; selectedPen = id; mode = null; const pen = penOf(id); if (!pen) return;
    const [sx, sy] = penSlot(pen); hero.tx = sx < W / 2 ? sx + PEN_W + 14 : sx - 14; hero.ty = sy + PEN_H - 6;
    renderHits(); renderCare();
  }
  function closeSheet() { sheet = null; q('g-sheet').hidden = true; renderNav(); }
  function openSheet(type) { if (!G) return; sheet = type; q('g-sheet').hidden = false; renderSheet(); renderNav(); q('g-sheet-close').focus(); }
  function render() { if (!opened || !G) return; q('g-wallet').textContent = '🪙 ' + fmt(G.coins); q('g-weather').textContent = (G.weather.night ? '☾ ' : G.weather.rain ? '☂ ' : '☀ ') + G.weather.name + (G.auto_water ? ' · автополив' : ''); q('g-area').textContent = G.area.cols + ' × ' + G.area.rows + ' · общий сад'; renderCare(); renderNav(); renderHits(); if (sheet) renderSheet(); size(); }
  function renderNav() {
    const nav = q('g-nav'); if (!nav) return; nav.textContent = '';
    [['garden', 'Наш сад', 'flowers'], ['shop', 'Лавка', 'coin'], ['basket', 'Урожай', 'harvest'], ['farm', 'Ферма', 'cow'], ['land', 'Участок', 'expand']].forEach(([id, label, type]) => {
      const b = node('button', id === (sheet || 'garden') ? 'on' : '', label); b.type = 'button'; b.prepend(icon(type));
      if (id === 'farm' && G) { const n = G.animals.filter(a => a.ready).length + G.animals.filter(a => a.hungry).length; if (n) b.appendChild(node('span', 'g-badge', fmt(n))); }
      if (id === 'basket' && G) { const count = Object.values(G.harvest).reduce((a, n) => a + n, 0) + Object.values(G.goods || {}).reduce((a, n) => a + n, 0); if (count) b.appendChild(node('span', 'g-badge', fmt(count))); }
      b.addEventListener('click', () => id === 'garden' ? closeSheet() : openSheet(id)); nav.appendChild(b);
    });
  }
  function bedAt(x, y) { return G?.beds.find(b => b.x === x && b.y === y); }
  function decorAt(x, y) { return G?.decor.find(d => d.x === x && d.y === y); }
  function renderHits() {
    const hits = q('g-hits'); hits.textContent = '';
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
      const b = node('button', 'g-cell' + (x === selected.x && y === selected.y ? ' selected' : '')); b.type = 'button';
      const bed = bedAt(x, y), decor = decorAt(x, y), locked = x >= G.area.cols || y >= G.area.rows;
      b.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': ' + (locked ? 'закрытый участок' : bed ? bed.crop ? G.catalog.crops[bed.crop].name + (bed.ready ? ', урожай готов' : bed.dry ? ', нужен полив' : ', растёт') : 'свободная грядка' : decor ? G.catalog.decor[decor.item].name : 'свободное место'));
      b.style.left = ((GX + x * T) / W * 100) + '%'; b.style.top = ((GY + y * T) / H * 100) + '%'; b.style.width = (T / W * 100) + '%'; b.style.height = (T / H * 100) + '%';
      b.addEventListener('click', () => select(x, y)); hits.appendChild(b);
    }
    for (const pen of G.pens) {
      const [sx, sy] = penSlot(pen), sp = penSpecies(pen.id), b = node('button', 'g-cell g-pen-hit' + (selectedPen === pen.id ? ' selected' : '')); b.type = 'button';
      b.setAttribute('aria-label', 'Загон: ' + (sp ? G.catalog.species[sp].name + ', животных ' + penAnimals(pen.id).length : 'пустой'));
      b.style.left = (sx / W * 100) + '%'; b.style.top = (sy / H * 100) + '%'; b.style.width = (PEN_W / W * 100) + '%'; b.style.height = (PEN_H / H * 100) + '%';
      b.addEventListener('click', () => selectPen(pen.id)); hits.appendChild(b);
    }
  }
  function select(x, y) {
    if (!G || busy || pending) return;
    panUntil = 0; selectedPen = null;
    selected = { x, y };
    if (x >= G.area.cols || y >= G.area.rows) { openSheet('land'); renderHits(); return; }
    hero.tx = GX + x * T + 8; hero.ty = GY + y * T + T + 5;
    if (mode) {
      const m = mode; mode = null;
      if (m.type === 'move') act('move_bed', { bed: m.id, x, y });
      else if (m.type === 'decor') act('place_decor', { item: m.item, x, y });
      return;
    }
    renderHits(); renderCare();
  }
  function renderCare(failed = false) {
    const box = q('g-care'); if (!box) return; box.textContent = '';
    if (!G) { box.appendChild(node('div', 'g-note', failed ? 'Не удалось загрузить сад. Растения не пропадут, попробуйте ещё раз.' : 'Открываем калитку и загружаем ваш сад…')); if (failed) box.appendChild(button('Попробовать ещё раз', load, 'primary')); return; }
    const head = node('div', 'g-care-head'), text = node('div', 'g-care-text'), actions = node('div', 'g-actions');
    let title = 'Место для нового', detail = 'Выберите грядку или украсьте свободную клетку.', type = 'flowers', color;
    const b = bedAt(selected.x, selected.y), d = decorAt(selected.x, selected.y), pen = selectedPen ? penOf(selectedPen) : null;
    if (selectedPen && !pen) selectedPen = null;
    if (mode && String(mode.type).startsWith('pen')) {
      type = 'pen'; title = mode.type === 'penmove' ? 'Куда переставить загон?' : 'Куда поставить загон?';
      detail = !penGhost?.moved ? 'Нажмите на карту: загон встанет туда. Зелёный цвет значит, что место подходит.' : penGhost.err ? penGhost.err : 'Место подходит. Поставьте здесь или нажмите в другом месте карты.';
      actions.appendChild(button('Поставить здесь', confirmPenPlace, 'primary', !penGhost || !penGhost.moved || !!penGhost.err));
      actions.appendChild(button(mode.type === 'penplace' ? 'Позже' : 'Отмена', endPenPlace));
    } else if (pen && !mode) {
      const list = penAnimals(pen.id), sp = penSpecies(pen.id), cat = sp ? G.catalog.species[sp] : null, cap = G.catalog.pen.capacity;
      const ready = list.filter(a => a.ready).length, hungry = list.filter(a => a.hungry).length, fedN = list.filter(a => a.fed).length;
      type = sp || 'pen'; color = null;
      if (!sp) { actions.appendChild(button('Переставить', () => startPenPlace(pen.id))); actions.appendChild(button('Убрать', () => act('remove_pen', { pen: pen.id }))); title = 'Пустой загон'; detail = 'Выберите, кто здесь поселится. В загоне живёт один вид, до ' + cap + ' животных.'; for (const k of SPECIES_KEYS) { const c = G.catalog.species[k]; actions.appendChild(button(c.name + ' · ' + fmt(c.price) + ' 🪙', () => buyAnimal(k, pen.id), 'primary', (c.level || 0) > G.level || G.coins < c.price)); } }
      else {
        title = ({ chicken: 'Куры', sheep: 'Овечки', pig: 'Свиньи', cow: 'Коровы' })[sp] + ' · ' + list.length + '/' + cap;
        if (ready) detail = 'Готово: ' + G.catalog.products[cat.product].name.toLowerCase() + ' × ' + ready + '. Соберите, когда удобно.';
        else if (hungry) detail = 'Голодных: ' + hungry + '. Без корма продукция не появляется, но животные не страдают.';
        else { const left = Math.min(...list.map(a => a.remaining)); detail = 'Все сыты · ' + G.catalog.products[cat.product].name.toLowerCase() + ' через ' + hours(left) + ' · корм ещё ' + hours(Math.max(...list.map(a => a.fed_left))); }
        actions.appendChild(button('Покормить · корм ' + (G.supplies.feed || 0), () => act('feed', { pen: pen.id }), 'primary', !hungry || !G.supplies.feed));
        if (ready) actions.appendChild(button('Собрать', () => act('collect', { pen: pen.id }), 'gold'));
        actions.appendChild(button('Переставить', () => startPenPlace(pen.id)));
        if (list.length < cap) actions.appendChild(button('+ ' + cat.name.toLowerCase() + ' · ' + fmt(cat.price) + ' 🪙', () => buyAnimal(sp, pen.id), '', G.coins < cat.price));
        const avg = list.reduce((s, a) => s + a.progress, 0) / list.length, bar = node('div', 'g-progress'), fill = node('div'); fill.style.width = (avg * 100) + '%'; bar.appendChild(fill); text.appendChild(bar);
      }
    } else if (mode) { title = 'Выберите свободную клетку'; detail = mode.type === 'move' ? 'Растение переедет вместе с грядкой.' : 'Украшение займёт одну клетку.'; actions.appendChild(button('Отмена', () => { mode = null; renderCare(); })); }
    else if (selected.x >= G.area.cols || selected.y >= G.area.rows) { title = 'Здесь сад может вырасти'; detail = 'Откройте новый участок в разделе «Участок».'; type = 'expand'; actions.appendChild(button('Расширение', () => openSheet('land'), 'gold')); }
    else if (b) {
      type = b.crop || 'bed'; color = b.crop ? G.catalog.crops[b.crop].color : null;
      if (!b.crop) {
        title = 'Свободная грядка'; detail = 'Посадка уже включает первый полив.';
        actions.appendChild(button('Посадить', () => openSheet('seeds'), 'primary'));
        actions.appendChild(button('Переставить', () => { mode = { type: 'move', id: b.id }; renderCare(); }));
        actions.appendChild(button('Убрать', () => act('remove_bed', { bed: b.id })));
      } else {
        title = G.catalog.crops[b.crop].name + (b.fertilized ? ' ✦' : '');
        detail = b.ready ? 'Урожай готов и не испортится. Соберите, когда удобно.' : b.dry ? 'Рост на паузе. Полейте, растение не погибнет.' : 'Растёт · ещё ' + hours(b.remaining) + ' влажного времени · ' + (G.auto_water ? 'автополив' : 'влага: ' + hours(Math.max(0, b.water_until - G.now)));
        if (b.ready) actions.appendChild(button('Собрать', () => act('harvest', { bed: b.id }), 'gold'));
        else {
          actions.appendChild(button('Полить', () => act('water', { bed: b.id }), 'primary', G.auto_water || b.water_until - G.now >= (G.water_hours - 1) * 3600));
          actions.appendChild(button('Компост', () => act('fertilize', { bed: b.id }), '', b.fertilized || !G.supplies.fertilizer));
        }
        actions.appendChild(button('Переставить', () => { mode = { type: 'move', id: b.id }; renderCare(); }));
        const bar = node('div', 'g-progress'), fill = node('div'); fill.style.width = (b.progress * 100) + '%'; bar.appendChild(fill); text.appendChild(bar);
      }
    } else if (d) {
      title = G.catalog.decor[d.item].name; detail = 'Украшение не требует ухода.'; type = d.item;
      actions.appendChild(button('Убрать в кладовую', () => act('remove_decor', { decor: d.id })));
    } else {
      actions.appendChild(button('Поставить грядку', () => act('place_bed', { ...selected }), 'primary', !G.supplies.bed));
      actions.appendChild(button('Украшения', () => openSheet('decor')));
      if (G.pen_stock) actions.appendChild(button('Поставить загон · ' + G.pen_stock, () => startPenPlace(), 'gold'));
      actions.appendChild(button('Лавка', () => openSheet('shop')));
    }
    text.prepend(node('small', null, detail)); text.prepend(node('b', null, title));
    head.appendChild(icon(type, color, b?.crop && !pen ? b.stage : 3)); head.appendChild(text); box.appendChild(head); box.appendChild(actions);
    if (pending) { const retry = node('button', 'g-btn primary', 'Повторить последний запрос'); retry.type = 'button'; retry.addEventListener('click', () => act('', {}, true)); box.appendChild(retry); }
  }
  function itemRow(title, desc, type, color, buttons = []) {
    const row = node('div', 'g-row'); row.appendChild(icon(type, color)); const body = node('div', 'g-row-text'); body.appendChild(node('b', null, title)); body.appendChild(node('small', null, desc)); row.appendChild(body); buttons.forEach(b => row.appendChild(b)); return row;
  }
  function renderSheet() {
    if (!sheet || !G) return;
    const body = q('g-sheet-body'), tabs = q('g-tabs'), oldScroll = body.scrollTop;
    body.textContent = ''; tabs.textContent = ''; tabs.hidden = true;
    const titles = { welcome: 'Добро пожаловать', shop: 'Садовая лавка', seeds: 'Что посадим?', basket: 'Корзина урожая', land: 'Ваш участок', farm: 'Ферма', decor: 'Украшения из кладовой' };
    q('g-sheet-title').textContent = titles[sheet] || 'Наш двор';
    if (sheet === 'welcome') {
      const intro = node('div', 'g-intro'); intro.appendChild(node('h3', null, 'Сад без спешки'));
      intro.appendChild(node('div', null, 'Две грядки, 12 семян, два компоста и скамейка уже ваши. Сажайте, поливайте и собирайте урожай вместе.'));
      body.appendChild(intro); body.appendChild(node('p', 'g-note', 'Один полив действует 36 часов. Растения не погибают: когда почва высохнет, рост просто остановится. Готовый урожай не портится. Уход не тратит энергию питомца, садом можно заниматься, пока он спит.'));
      body.appendChild(button('Посадить первые семена', () => { selected = { x: 0, y: 0 }; openSheet('seeds'); }, 'primary'));
      body.appendChild(button('Просто посмотреть', closeSheet));
    } else if (sheet === 'shop') {
      tabs.hidden = false;
      [['seed', 'Семена'], ['supply', 'Для сада'], ['decor', 'Украшения'], ['farm', 'Животные']].forEach(([id, title]) => { const b = node('button', shopTab === id ? 'on' : '', title); b.type = 'button'; b.addEventListener('click', () => { shopTab = id; body.scrollTop = 0; renderSheet(); }); tabs.appendChild(b); });
      const table = shopTab === 'farm' ? {} : G.catalog[shopTab === 'seed' ? 'crops' : shopTab === 'decor' ? 'decor' : 'supplies'];
      if (shopTab === 'farm') {
        const pc = G.catalog.pen, owned = G.pens.length + G.pen_stock, full = owned >= pc.max;
        if (G.pen_stock) body.appendChild(button('Поставить купленный загон · ' + G.pen_stock, () => startPenPlace(), 'gold'));
        body.appendChild(itemRow(pc.name + ' · ' + owned + '/' + pc.max, pc.desc, 'pen', null, [button(full ? 'Построено' : fmt(pc.price) + ' 🪙', buyPen, 'primary', full || G.coins < pc.price)]));
        for (const k of SPECIES_KEYS) {
          const c = G.catalog.species[k], locked = (c.level || 0) > G.level, have = G.animals.filter(a => a.species === k).length;
          body.appendChild(itemRow(c.name + ' · у вас ' + have, c.desc + ' Продукция: ' + G.catalog.products[c.product].name.toLowerCase() + ' за ' + c.sell + ' монет, раз в ' + c.hours + ' ч.' + (locked ? ' Нужен участок уровня ' + ((c.level || 0) + 1) + '.' : ''), k, null, [button(locked ? 'Закрыто' : fmt(c.price) + ' 🪙', () => buyAnimal(k), 'primary', locked || G.coins < c.price)]));
        }
        body.appendChild(node('p', 'g-note', 'Загон один на вид: куры, овечки, свиньи и коровы не живут вместе. Корм покупается во вкладке «Для сада». Животные не болеют и не пропадают, без корма просто не дают продукцию.'));
      }
      for (const [id, c] of Object.entries(table)) {
        const locked = (c.level || 0) > G.level, owned = c.once && G.upgrades.includes(id), stock = G[shopTab === 'seed' ? 'seeds' : shopTab === 'decor' ? 'decor_stock' : 'supplies'][id] || 0;
        let desc = c.desc + (shopTab === 'seed' ? ' Урожай: ' + c.yield + ' × ' + c.sell + ' монет.' : '') + (c.once ? '' : ' В запасе: ' + stock + '.');
        if (locked) desc += ' Нужен участок уровня ' + ((c.level || 0) + 1) + '.';
        const buttons = [button(owned ? 'Куплено' : locked ? 'Закрыто' : fmt(c.price) + ' 🪙', () => purchase(shopTab, id), 'primary', owned || locked || G.coins < c.price)];
        if (shopTab === 'seed' && !locked) buttons.push(button('×5', () => purchase('seed', id, 5), '', G.coins < c.price * 5));
        body.appendChild(itemRow(c.name, desc, id, c.color, buttons));
      }
      body.appendChild(node('p', 'g-note', 'Монеты общие с основной игрой. Все покупки и расширения сначала требуют подтверждения.'));
    } else if (sheet === 'seeds') {
      const bed = bedAt(selected.x, selected.y);
      if (!bed || bed.crop) { body.appendChild(node('p', 'g-note', 'Выберите свободную грядку.')); }
      else for (const [id, c] of Object.entries(G.catalog.crops)) {
        if ((c.level || 0) > G.level) continue;
        const stock = G.seeds[id] || 0;
        body.appendChild(itemRow(c.name + ' · ' + stock + ' шт.', c.hours + ' ч роста · ' + c.yield + ' × ' + c.sell + ' монет за урожай', id, c.color, [button('Посадить', () => { const bedId = bed.id; closeSheet(); act('plant', { bed: bedId, item: id }); }, 'primary', stock < 1)]));
      }
      body.appendChild(button('Купить семена', () => { shopTab = 'seed'; openSheet('shop'); }));
    } else if (sheet === 'basket') {
      const ready = G.beds.filter(b => b.ready).length;
      if (ready) body.appendChild(button('Собрать всё · ' + ready + ' грядок', () => act('harvest_all'), 'gold'));
      let count = 0;
      for (const [key, n] of Object.entries(G.harvest)) {
        if (!n) continue; count += n;
        const [crop, quality] = key.split(':'), c = G.catalog.crops[crop], price = quality === 'gold' ? Math.ceil(c.sell * 1.25) : c.sell;
        body.appendChild(itemRow(c.name + (quality === 'gold' ? ' ✦' : '') + ' · ' + n + ' шт.', price + ' монет за штуку · ' + fmt(price * n) + ' монет всего', crop, c.color, [button('Продать', () => act('sell', { item: key }), 'primary')]));
      }
      if (count) body.appendChild(button('Продать всё за ' + fmt(G.harvest_value) + ' 🪙', () => act('sell_all'), 'gold'));
      else if (!Object.values(G.goods || {}).some(n => n > 0)) body.appendChild(node('p', 'g-note', 'Корзина пока пуста. После сбора урожай хранится здесь сколько угодно.'));
      const goods = Object.entries(G.goods || {}).filter(([, n]) => n > 0);
      if (G.animals.some(a => a.ready)) body.appendChild(button('Собрать продукцию · ' + G.animals.filter(a => a.ready).length, () => act('collect_all'), 'gold'));
      for (const [k, n] of goods) { const pr = G.catalog.products[k]; body.appendChild(itemRow(pr.name + ' · ' + n + ' шт.', pr.sell + ' монет за штуку · ' + fmt(pr.sell * n) + ' монет всего', k, null, [button('Продать', () => act('sell_good', { item: k }), 'primary')])); }
      if (goods.length) body.appendChild(button('Продать продукцию за ' + fmt(G.goods_value) + ' 🪙', () => act('sell_goods'), 'gold'));
      body.appendChild(button('Полить весь сад', () => act('water_all'), '', G.auto_water));
      body.appendChild(node('p', 'g-note', 'Сбор и продажа разделены: готовые растения могут оставаться на грядке для красоты. Собранный урожай никогда не портится.'));
    } else if (sheet === 'land') {
      const intro = node('div', 'g-intro'); intro.appendChild(node('h3', null, G.area.name)); intro.appendChild(node('div', null, G.area.cols + ' × ' + G.area.rows + ' клеток · грядок ' + G.beds.length + ' · украшений ' + G.decor.length)); body.appendChild(intro);
      if (G.next_expansion) body.appendChild(itemRow(G.next_expansion.name, G.next_expansion.cols + ' × ' + G.next_expansion.rows + ' клеток. Существующие посадки сохранятся.', 'expand', null, [button(fmt(G.next_expansion.price) + ' 🪙', expand, 'gold', G.coins < G.next_expansion.price)]));
      else body.appendChild(node('p', 'g-note', 'Вся полянка ваша. Сад расширен полностью!'));
      body.appendChild(itemRow('Грядки в запасе: ' + (G.supplies.bed || 0), 'Выберите свободную клетку на карте и поставьте грядку.', 'bed', null, [button('Купить', () => { shopTab = 'supply'; openSheet('shop'); })]));
      body.appendChild(button('Украшения в кладовой', () => openSheet('decor')));
      body.appendChild(button('Полить всё', () => act('water_all'), '', G.auto_water));
      body.appendChild(node('p', 'g-note', 'Расширения: 12 → 20 → 30 → 48 клеток. Колодец увеличивает запас влаги до 48 часов, а автополив полностью снимает заботу о воде. Компост необязателен. Нет сорняков, вредителей, штрафов или ежедневных обязательств.'));
    } else if (sheet === 'farm') {
      const intro = node('div', 'g-intro'), cap = G.catalog.pen.capacity; intro.appendChild(node('h3', null, 'Ферма'));
      intro.appendChild(node('div', null, 'Загонов ' + (G.pens.length + G.pen_stock) + '/' + G.catalog.pen.max + ' · животных ' + G.animals.length + ' · корма ' + (G.supplies.feed || 0))); body.appendChild(intro);
      const hungry = G.animals.filter(a => a.hungry).length, ready = G.animals.filter(a => a.ready).length;
      if (G.pen_stock) body.appendChild(button('Поставить загон · ' + G.pen_stock, () => startPenPlace(), 'gold'));
      if (ready) body.appendChild(button('Собрать всё · ' + ready, () => act('collect_all'), 'gold'));
      if (hungry) body.appendChild(button('Покормить всех · ' + hungry, () => act('feed_all'), 'primary', !G.supplies.feed));
      for (const pen of G.pens) {
        const sp = penSpecies(pen.id), list = penAnimals(pen.id), cat = sp ? G.catalog.species[sp] : null, r = list.filter(a => a.ready).length, hg = list.filter(a => a.hungry).length;
        const status = !sp ? 'Пока пусто' : r ? 'Готово: ' + G.catalog.products[cat.product].name.toLowerCase() + ' × ' + r : hg ? 'Голодных: ' + hg : 'Все сыты';
        body.appendChild(itemRow((sp ? ({ chicken: 'Куры', sheep: 'Овечки', pig: 'Свиньи', cow: 'Коровы' })[sp] : 'Пустой загон') + ' · ' + list.length + '/' + cap, status, sp || 'pen', null, [button('Открыть', () => { closeSheet(); selectPen(pen.id); }, 'primary')]));
      }
      if (!G.pens.length && !G.pen_stock) body.appendChild(node('p', 'g-note', 'Здесь пока нет загонов. Постройте первый: в нём будут жить куры, овечки, свиньи или коровы.'));
      body.appendChild(button('Построить или купить животных', () => { shopTab = 'farm'; openSheet('shop'); }));
      body.appendChild(button('Купить корм ×5 · ' + fmt(G.catalog.supplies.feed.price * 5) + ' 🪙', () => purchase('supply', 'feed', 5), '', G.coins < G.catalog.supplies.feed.price * 5));
      body.appendChild(node('p', 'g-note', 'Одна порция корма кормит одно животное на 10–12 часов. Пока животное сыто, оно копит продукцию. Готовое никогда не портится.'));
    } else if (sheet === 'decor') {
      let any = false;
      for (const [id, n] of Object.entries(G.decor_stock)) {
        if (!n) continue; any = true; const c = G.catalog.decor[id];
        body.appendChild(itemRow(c.name + ' · ' + n + ' шт.', c.desc, id, null, [button('Поставить', () => { mode = { type: 'decor', item: id }; closeSheet(); renderCare(); }, 'primary')]));
      }
      if (!any) body.appendChild(node('p', 'g-note', 'Все украшения уже стоят в саду. Можно убрать их с карты или купить новые.'));
      body.appendChild(button('В лавку за украшениями', () => { shopTab = 'decor'; openSheet('shop'); }));
    }
    body.scrollTop = oldScroll;
  }
  function size() {
    if (!opened) return;
    // «Покрытие»: карта всегда закрывает окно целиком, поэтому по краям не бывает пустых полос.
    const stage = q('g-stage'), width = Math.max(stage.clientWidth, stage.clientHeight * 1.5) * zoom;
    const world = q('g-world'); world.style.width = width + 'px'; world.style.height = (width / W * H) + 'px'; world.style.marginTop = '0px'; scale = width / W;
    if (!centered && stage.clientWidth) { centered = true; snapCamera(); }
  }
  // Камера следует за выдрой: плавно догоняет её, а если игрок сам листает карту, ненадолго уступает.
  function cameraTarget() {
    const sc = q('g-scroll'); if (!sc) return null;
    return { x: Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, hero.x * scale - sc.clientWidth / 2)), y: Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, (hero.y - 26) * scale - sc.clientHeight / 2)) };
  }
  function snapCamera() { const sc = q('g-scroll'), t = cameraTarget(); if (!t) return; camSet = performance.now(); sc.scrollLeft = t.x; sc.scrollTop = t.y; }
  function follow(now) {
    if (now < panUntil) return; const sc = q('g-scroll'), t = cameraTarget(); if (!sc || !t) return;
    const dx = t.x - sc.scrollLeft, dy = t.y - sc.scrollTop; if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    camSet = now; sc.scrollLeft += dx * .16; sc.scrollTop += dy * .16;
  }
  // ---------- сцена: уютная полянка в солнечном лесу ----------
  const waterSpots = [], lights = [], smokeAt = [];
  const WATER = ['#0f4f69', '#16698a', '#1f80a6', '#2c97bd', '#45b0cf', '#72cfe1', '#b4edf5'];
  const W6 = ['#2e1a0e', '#5a3820', '#7e5230', '#a06c3c', '#c58f55', '#e6b87a'];
  const PLASTER = ['#c9b07c', '#d6bf8c', '#e2cd9d', '#ecdbae', '#f5e8c4', '#fbf1d6'];
  const GRASS = ['#2f5f1c', '#3b7120', '#488422', '#589727', '#6aa92d', '#7dba35', '#91c940', '#a7d756', '#bfe676'];
  const GRASS_Y = ['#43601a', '#53721c', '#64851f', '#779a25', '#8bad2c', '#a0c035', '#b5d247', '#c9e263', '#dcf084'];
  const rgb = hx => { const n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const GRASS_RGB = GRASS.map(rgb), GRASS_Y_RGB = GRASS_Y.map(rgb);
  const W8 = ['#1e0f07', '#3a2212', '#57351d', '#764b2b', '#95643a', '#b5824b', '#d3a063', '#efc88a'];
  const spriteCache = {};
  const sprImg = type => {
    if (!spriteCache[type]) { const c = document.createElement('canvas'); c.width = c.height = 28; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; sprite(g, type); spriteCache[type] = c; }
    return spriteCache[type];
  };
  const art42 = type => {
    const k = '42' + type;
    if (!spriteCache[k]) { const c = document.createElement('canvas'); c.width = c.height = 42; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; castDraw(g, () => decorArt(type), { len: 3, dx: 1, dy: .6, a: .3 }, 42, 42); spriteCache[k] = c; }
    return spriteCache[k];
  };
  const inGrid = (x, y, m = 6) => x > GX - m && x < GX + 8 * T + m && y > GY - m && y < GY + 6 * T + m;
  const BLOOM = ['#fff6e6', '#f27a9f', '#ffd84a', '#b08be0', '#ff9a52', '#ffffff', '#e8524a', '#7fb6ff'];

  // ---- мелкие детали ----
  function dither(x, y, v, pal) { const n = pal.length - 1, f = Math.max(0, Math.min(1, v)) * (n - .001); let i = Math.floor(f); if (f - i > thr(x, y)) i++; return pal[Math.min(n, i)]; }
  function grain(x, y, w, h, seed, c1, c2, vertical = false) {
    if (vertical) { for (let i = 0; i < w * 1.2; i++) { const gx = x + Math.floor(rnd(seed, i) * w), gy = y + Math.floor(rnd(seed, i + 40) * h), len = 2 + Math.floor(rnd(seed, i + 80) * 6); rect(gx, gy, 1, Math.min(len, y + h - gy), rnd(seed, i + 120) < .5 ? c1 : c2); } }
    else for (let i = 0; i < h * 1.3; i++) { const gx = x + Math.floor(rnd(seed, i) * w), gy = y + Math.floor(rnd(seed, i + 40) * h), len = 2 + Math.floor(rnd(seed, i + 80) * 7); rect(gx, gy, Math.min(len, x + w - gx), 1, rnd(seed, i + 120) < .5 ? c1 : c2); }
  }
  function board(x, y, w, h, seed = 0, vertical = false) {
    const tint = (rnd(seed, x + y) - .5) * .22;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      let v = .74 - (vertical ? xx / w : yy / h) * .34 + tint + (rnd(x + xx, y + yy + seed) - .5) * .13 + (noise2(vertical ? x + xx : (x + xx) * .4, vertical ? (y + yy) * .35 : y + yy, 4, seed) - .5) * .22;
      if (yy === 0 || xx === 0) v += .22; if (yy === h - 1 || xx === w - 1) v -= .3;
      if (yy === 0 && xx === 0 || yy === h - 1 && xx === w - 1 || yy === 0 && xx === w - 1 || yy === h - 1 && xx === 0) { rect(x + xx, y + yy, 1, 1, W8[0]); continue; }
      rect(x + xx, y + yy, 1, 1, (yy === 0 || xx === 0 || yy === h - 1 || xx === w - 1) && w > 3 && h > 3 && (yy === h - 1 || xx === w - 1) ? W8[1] : dither(x + xx, y + yy, v, W8));
    }
    rect(x, y, w, 1, W8[0]); rect(x, y + h - 1, w, 1, W8[0]); rect(x, y, 1, h, W8[0]); rect(x + w - 1, y, 1, h, W8[0]);
    rect(x + 1, y + 1, w - 2, 1, W8[7]); rect(x + 1, y + 1, 1, h - 2, W8[6]);
    grain(x + 1, y + 1, w - 2, h - 2, seed + x * 3 + y, W8[3], W8[5], vertical);
  }
  function stoneWall(x, y, w, h, seed = 0, moss = true) {
    rect(x, y, w, h, STONE6[0]);
    for (let yy = 0, r = 0; yy < h; yy += 5, r++) for (let xx = -(r % 2) * 4; xx < w; xx += 8) {
      const bw = 7 + Math.floor(rnd(seed + r, xx) * 2), bx = Math.max(0, xx), ex = Math.min(w, xx + bw), bh = Math.min(4, h - yy), tone = (rnd(seed + 3, r * 31 + xx) - .5) * .25;
      for (let py = 0; py < bh; py++) for (let px = bx; px < ex - 1; px++) {
        const v = .78 - py / bh * .45 - (px - bx) / bw * .08 + tone + (rnd(x + px, y + yy + py) - .5) * .2;
        rect(x + px, y + yy + py, 1, 1, dither(x + px, y + yy + py, v, STONE6));
      }
    }
    if (moss) for (let i = 0; i < w / 3; i++) { const mx = x + Math.floor(rnd(seed, i + 70) * w), my = y + h - 1 - Math.floor(rnd(seed, i + 90) * 3); rect(mx, my, 2, 1, rnd(seed, i) < .5 ? '#4f8a35' : '#6aa844'); }
  }
  function castDraw(g, fn, o = {}, w = W, h = H) {
    const len = o.len || 6, dx = o.dx == null ? 1 : o.dx, dy = o.dy == null ? .55 : o.dy, a = o.a == null ? .34 : o.a;
    const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d'); tg.imageSmoothingEnabled = false; withCtx(tg, fn);
    const s = document.createElement('canvas'); s.width = w; s.height = h; const sg = s.getContext('2d'); sg.imageSmoothingEnabled = false;
    for (let k = 1; k <= len; k++) sg.drawImage(t, Math.round(dx * k), Math.round(dy * k));
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgb(8,26,14)'; sg.fillRect(0, 0, w, h);
    g.globalAlpha = a; g.drawImage(s, 0, 0); g.globalAlpha = 1; g.drawImage(t, 0, 0);
  }
  function tuft(x, y, a = GRASS[1], b = GRASS[2], c = GRASS[5]) { rect(x, y, 1, 3, a); rect(x + 1, y - 2, 1, 4, b); rect(x + 2, y - 1, 1, 3, a); rect(x + 1, y - 2, 1, 1, c); rect(x + 3, y, 1, 2, b); }
  function flower(x, y, c) { x = Math.round(x); y = Math.round(y); rect(x, y, 1, 3, GRASS[1]); rect(x, y - 1, 1, 3, c); rect(x - 1, y, 3, 1, c); rect(x, y, 1, 1, c === '#ffd84a' ? '#ee9a2a' : '#f2c230'); rect(x - 1, y - 1, 1, 1, shade(c, .45)); }
  function daisy(x, y) { rect(x - 2, y, 5, 1, '#fffdf2'); rect(x, y - 2, 1, 5, '#fffdf2'); rect(x - 1, y - 1, 3, 3, '#fffdf2'); rect(x, y, 1, 1, '#f2b81c'); rect(x + 1, y + 1, 1, 1, '#dfe6d0'); }
  function clover(x, y) { rect(x, y, 2, 2, GRASS[1]); rect(x + 2, y + 1, 2, 2, GRASS[2]); rect(x - 1, y + 2, 2, 2, GRASS[2]); rect(x + 1, y + 1, 1, 1, GRASS[5]); }
  function clump(x, y, rx, ry, seed, blooms = 6) {
    blob(x, y, rx, ry, CANOPY, seed);
    for (let i = 0; i < blooms; i++) { const a = rnd(seed, i) * 6.283, d = rnd(seed + 7, i); const fx = x + Math.cos(a) * rx * .75 * d, fy = y + Math.sin(a) * ry * .6 * d - 1; rnd(seed + 5, i) < .35 ? daisy(Math.round(fx), Math.round(fy)) : flower(fx, fy, BLOOM[Math.floor(rnd(seed + 3, i) * BLOOM.length)]); }
  }
  function mossStone(x, y, w = 6, h = 4, moss = false) { stone(x, y, w, h); if (moss) { rect(x + 1, y, Math.max(2, w - 3), 1, '#5e9a3a'); rect(x + 2, y + 1, 1, 1, '#7fb84a'); } }

  function paintGround(g) {
    const img = g.createImageData(W, H), d = img.data, n = GRASS.length - 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = .56 + (noise2(x, y, 90, 1) - .5) * .5 + (noise2(x, y, 28, 2) - .5) * .3 + (noise2(x, y, 9, 3) - .5) * .14 + (noise2(x * 2.4, y * .7, 5, 8) - .5) * .08;
      v += (.5 - (x / W * .45 + y / H * .55)) * .2 - .07;
      const e = Math.min(x, W - 1 - x, y, H - 1 - y); v -= Math.pow(Math.max(0, (56 - e) / 56), 1.4) * .5;
      v += Math.max(0, 1 - Math.hypot((x - 300) / 190, (y - 150) / 120)) * .14;
      const f = Math.max(0, Math.min(1, v)) * (n - .01); let i = Math.floor(f); if (f - i > thr(x, y)) i++; i = Math.min(n, i);
      const m = Math.max(0, Math.min(1, (noise2(x, y, 70, 5) - .35) * 2.2)), a = GRASS_RGB[i], b = GRASS_Y_RGB[i], o = (y * W + x) * 4;
      d[o] = a[0] + (b[0] - a[0]) * m; d[o + 1] = a[1] + (b[1] - a[1]) * m; d[o + 2] = a[2] + (b[2] - a[2]) * m; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  function meadow() {
    for (let i = 0; i < 520; i++) {
      const x = Math.floor(rnd(i, 11) * W), y = Math.floor(rnd(i, 12) * H), k = rnd(i, 13), col = k < .4 ? GRASS[1] : k < .75 ? GRASS[5] : GRASS[6];
      rect(x, y, 1, 2, col); if (k < .5) rect(x + 2, y - 1, 1, 2, col); if (k > .85) rect(x - 2, y, 1, 2, GRASS[2]);
    }
    for (let i = 0; i < 120; i++) { const x = Math.floor(rnd(i, 21) * W), y = Math.floor(rnd(i, 22) * H); if (inGrid(x, y, 0) && rnd(i, 23) < .7) continue; tuft(x, y); }
  }
  const CANOPY_Y = ['#1d3b14', '#2c5718', '#3e7420', '#53912a', '#6fad36', '#8ec949', '#b1e062', '#d6f48c'];
  function oak(x, y, r, s, warm = false) {
    const pal = warm ? CANOPY_Y : CANOPY, n = 6 + Math.floor(rnd(s, 1) * 3), lobes = [];
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + rnd(s, i + 5) * .6, d = r * (.58 + rnd(s, i + 15) * .18), lr = r * (.44 + rnd(s, i + 25) * .14); lobes.push([x + Math.cos(a) * d, y + Math.sin(a) * d * .86, lr, i]); }
    lobes.sort((p, q) => p[1] - q[1]);
    blob(x, y, r * .86, r * .78, pal, s * 7);
    for (const [lx, ly, lr, i] of lobes) { ellipse(Math.round(lx), Math.round(ly + lr * .55), Math.round(lr * .8), 2, 'rgba(6,24,10,.3)'); blob(lx, ly, lr, lr * .92, pal, s * 7 + i + 1); }
    blob(x - r * .18, y - r * .22, r * .5, r * .42, pal, s * 7 + 99);
    for (let i = 0; i < Math.round(r * .8); i++) { const a = rnd(s, i + 60) * 6.283, d = Math.sqrt(rnd(s, i + 80)) * r * .8, px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d * .85); if (Math.cos(a) * .5 + Math.sin(a) * .8 < .1) { rect(px, py, 2, 1, pal[7]); rect(px - 1, py + 1, 1, 1, pal[6]); } }
  }
  function pine(x, y, h, s) {
    const layers = 5, lh = h / layers * 1.15;
    ellipse(x + 3, y + 1, 9, 3, 'rgba(6,24,10,.3)'); rect(x - 1, y - 6, 3, 8, W8[1]); rect(x - 1, y - 6, 1, 8, W8[4]);
    for (let k = 0; k < layers; k++) {
      const top = y - h + k * (h / layers) * .88, w = (k + 1.4) * h * .085, bot = top + lh;
      for (let yy = Math.round(top); yy < bot; yy++) {
        const t = (yy - top) / lh, half = Math.max(1, Math.round(w * (.15 + t * .85)));
        for (let xx = -half; xx <= half; xx++) {
          const v = .72 - xx / (half + 1) * .34 - t * .18 + (noise2(x + xx, yy, 3, s) - .5) * .3 + (yy === Math.round(top) ? .1 : 0), edge = xx === -half || xx === half || yy >= bot - 1;
          rect(x + xx, yy, 1, 1, edge ? CANOPY[0] : dither(x + xx, yy, v, CANOPY));
        }
        if (yy > top + 1 && rnd(s + k, yy) < .5) rect(x - Math.round(w * (.15 + t * .85) * .5), yy, 2, 1, CANOPY[6]);
      }
    }
  }
  function birch(x, y, r, s) {
    ellipse(x + 3, y + 2, 8, 3, 'rgba(6,24,10,.3)'); rect(x - 2, y - 14, 4, 17, '#e8e4d6'); rect(x - 2, y - 14, 1, 17, '#fffdf2'); rect(x + 1, y - 14, 1, 17, '#b8b4a2');
    for (let i = 0; i < 5; i++) { rect(x - 2 + (i % 2), y - 12 + i * 3, 2, 1, '#2a2824'); }
    oak(x, y - 22, r, s, true);
  }
  function treeRing() {
    const put = (x, y, s, r0 = 14) => { const r = r0 + rnd(s, 3) * 7, cx0 = x + (rnd(s, 1) - .5) * 6, cy0 = y + (rnd(s, 2) - .5) * 6, k = rnd(s, 4); oak(cx0, cy0, r, s, k > .72); };
    for (let x = -8, i = 0; x < W + 24; x += 17, i++) { if (x > 250 && x < 480) continue; put(x, 0, 100 + i, 14); put(x + 8, 12, 150 + i, 12); }
    for (let y = 56, i = 0; y < H + 24; y += 16, i++) { put(2, y, 300 + i, 14); put(13, y + 8, 350 + i, 11); put(W - 2, y, 500 + i, 14); put(W - 13, y + 8, 550 + i, 11); }
    for (let x = -8, i = 0; x < W + 24; x += 17, i++) { if (x > 450 && x < 556) continue; put(x, H - 1, 700 + i, 14); put(x + 8, H - 12, 750 + i, 12); }
  }
  function featureTree(x, y, r, s) { ellipse(x + 5, y + 3, 16, 4, 'rgba(6,24,10,.34)'); board(x - 4, y - 14, 8, 18, s, true); rect(x - 8, y + 1, 5, 3, W8[2]); rect(x + 4, y + 1, 5, 3, W8[2]); oak(x, y - 26, r, s); }

  // ---- вода ----
  function pondShape(px, py, rx, ry, seed, withStones = true) {
    ellipse(px, py + 2, rx + 5, ry + 5, GRASS[0]); ellipse(px, py, rx + 4, ry + 4, '#3d7a22');
    for (let yy = -ry - 1; yy <= ry + 1; yy++) {
      const wob = 1 + .07 * Math.sin(yy * .7 + seed), half = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy / (ry * ry + .01))) * wob);
      for (let xx = -half; xx <= half; xx++) {
        const wx = px + xx, wy = py + yy, d = Math.hypot(xx / (rx * wob), yy / ry);
        let v = .78 - d * .5 - (yy / ry) * .12 - (xx / rx) * .06 + Math.sin(wx * .55 + wy * .9 + seed) * .05 + (noise2(wx, wy, 7, seed) - .5) * .22;
        if (d > .84) v -= .22;
        rect(wx, wy, 1, 1, dither(wx, wy, v, WATER));
      }
    }
    for (let i = 0; i < 9; i++) { const w = 3 + Math.floor(rnd(seed, i) * 8), sx = px - rx * .65 + rnd(seed, i + 9) * rx * 1.2, sy = py - ry * .7 + rnd(seed, i + 19) * ry * 1.3; if (Math.hypot((sx - px) / rx, (sy - py) / ry) < .72) { rect(sx, sy, w, 1, WATER[5]); rect(sx + 1, sy + 1, Math.max(1, w - 3), 1, WATER[4]); } }
    if (withStones) for (let a = 0; a < 6.283; a += .15) {
      const k = Math.floor(a * 20), rr = 1 + (rnd(seed + 5, k) - .5) * .13, w = 5 + Math.floor(rnd(seed + 3, k) * 4);
      mossStone(Math.round(px + Math.cos(a) * (rx + 2) * rr - w / 2), Math.round(py + Math.sin(a) * (ry + 2) * rr - 2), w, 4 + (rnd(seed + 8, k) < .3 ? 1 : 0), rnd(seed + 6, k) < .45);
    }
    for (let i = 0; i < 8; i++) waterSpots.push({ x: Math.round(px + (rnd(seed, i + 40) - .5) * rx * 1.3), y: Math.round(py + (rnd(seed, i + 50) - .5) * ry * 1.1), k: i });
  }
  function lily(x, y, bloom) {
    ellipse(x, y + 1, 5, 3, WATER[0]); ellipse(x, y, 5, 3, LEAF[0]); ellipse(x, y, 4, 2, LEAF[2]); rect(x - 3, y - 1, 4, 1, LEAF[3]); rect(x - 1, y, 5, 1, LEAF[1]); rect(x + 1, y - 2, 5, 1, WATER[3]); rect(x + 2, y - 1, 3, 1, WATER[3]);
    rect(x - 1, y - 1, 1, 1, LEAF[4]);
    if (bloom) { rect(x - 2, y - 4, 5, 5, '#a8446a'); rect(x - 1, y - 5, 3, 1, '#d36a92'); rect(x - 2, y - 3, 5, 3, '#f7a8c6'); rect(x - 1, y - 4, 3, 1, '#ffd6e6'); rect(x - 1, y - 3, 3, 2, '#fff2f8'); rect(x, y - 3, 1, 1, '#ffd23a'); }
  }
  function reeds(x, y, n, seed) {
    for (let i = 0; i < n; i++) {
      const rx0 = x + i * 3 + Math.floor(rnd(seed, i) * 3), h = 10 + Math.floor(rnd(seed, i + 9) * 8);
      rect(rx0, y - h, 1, h, LEAF[1]); rect(rx0 + 1, y - h + 4, 1, h - 4, LEAF[2]);
      if (rnd(seed, i + 19) < .6) { rect(rx0 - 1, y - h - 4, 3, 6, '#4a2a14'); rect(rx0, y - h - 4, 1, 5, '#8a5a30'); rect(rx0, y - h - 6, 1, 2, '#c8b080'); }
      else { rect(rx0 - 2, y - 6, 2, 1, LEAF[3]); rect(rx0 + 2, y - 9, 2, 1, LEAF[3]); }
    }
  }
  function dockV(x, y, w, h) {
    for (let j = 0; j < h; j += 4) { board(x, y + j, w, 4, j); }
    [[x - 2, y + h - 8], [x + w - 3, y + h - 8], [x - 2, y + 1], [x + w - 3, y + 1]].forEach(([px, py]) => { rect(px, py, 5, 11, W6[0]); rect(px + 1, py + 1, 3, 9, W6[3]); rect(px + 1, py + 1, 3, 2, W6[5]); rect(px + 3, py + 3, 1, 7, W6[2]); });
    rect(x + 2, y + 6, 1, 1, '#d8d8d8'); rect(x + w - 3, y + 14, 1, 1, '#d8d8d8');
    rect(x - 5, y + h + 3, w + 10, 1, WATER[5]); rect(x - 2, y + h + 5, w + 4, 1, WATER[4]);
  }
  function stream() {
    const edge = x => Math.round((30 + 4 * Math.sin(x / 15) + (x - 262) * .05) * Math.max(0, Math.min(1, (x - 262) / 12, (470 - x) / 16)));
    for (let x = 262; x <= 470; x++) {
      const yb = edge(x); if (yb < 2) continue;
      rect(x, 0, 1, yb + 4, GRASS[0]); rect(x, 0, 1, yb + 2, '#3d7a22');
      for (let y = 0; y < yb; y++) { let v = .72 - (y / yb) * .15 - ((yb - y) < 5 ? .25 : 0) + Math.sin(x * .3 + y * .7) * .06 + (noise2(x, y, 6, 4) - .5) * .25; rect(x, y, 1, 1, dither(x, y, v, WATER)); }
      if (x % 29 === 0) { waterSpots.push({ x, y: Math.max(2, yb - 9), k: x }); rect(x + 2, 6 + rnd(x, 3) * 12, 7, 1, WATER[5]); rect(x + 4, 8 + rnd(x, 4) * 10, 5, 1, WATER[6]); }
    }
    for (let x = 268; x < 468; x += 7 + Math.floor(rnd(x, 5) * 4)) { const yb = edge(x); if (yb > 3) mossStone(x, yb, 6 + Math.floor(rnd(x, 6) * 4), 5, rnd(x, 7) < .5); }
    reeds(300, 41, 3, 5); reeds(420, 40, 4, 8); reeds(272, 31, 2, 2);
    for (let y = 4; y < 46; y += 4) board(334, y, 36, 4, y);
    [[331, 1], [366, 1], [331, 38], [366, 38]].forEach(([px, py]) => { rect(px, py, 6, 12, W6[0]); rect(px + 1, py + 1, 4, 10, W6[3]); rect(px + 1, py + 1, 4, 2, W6[5]); rect(px + 4, py + 3, 1, 8, W6[2]); });
    rect(332, 14, 2, 1, '#d8d8d8'); rect(364, 14, 2, 1, '#d8d8d8'); rect(364, 47, 14, 2, 'rgba(10,40,60,.35)');
  }
  function pathDirt() {
    const PAL = ['#a97c40', '#bf9150', '#d3a85f', '#e3bd75', '#efd28f', '#f7e3ac'];
    for (let y = 284; y <= H + 2; y++) {
      const t = (y - 286) / 98, c = Math.round(474 + t * 58 + 5 * Math.sin(t * 3.2)), taper = Math.min(1, (y - 282) / 9), hw = Math.round((9 + t * 15) * taper + rnd(y, 3) * 2);
      for (let x = c - hw - 2; x <= c + hw + 2; x++) {
        const d = Math.abs(x - c) / (hw + 2), v = .78 - d * .6 + (noise2(x, y, 5, 6) - .5) * .35;
        rect(x, y, 1, 1, dither(x, y, v, PAL));
      }
      if (rnd(y, 9) < .25) rect(c - hw + 3 + rnd(y, 4) * hw * 1.6, y, 2, 1, PAL[0]);
      if (rnd(y, 10) < .12) rect(c + rnd(y, 11) * hw - 3, y, 1, 1, PAL[5]);
      if (rnd(y, 12) < .22) tuft(c - hw - 3 - Math.floor(rnd(y, 13) * 3), y, GRASS[1], GRASS[3], GRASS[5]);
      if (rnd(y, 14) < .2) tuft(c + hw + 2 + Math.floor(rnd(y, 15) * 3), y, GRASS[1], GRASS[3], GRASS[5]);
    }
    for (let i = 0; i < 6; i++) { const y = 306 + i * 14, c = Math.round(474 + ((y - 286) / 98) * 58); rect(c - 6 + (i % 2) * 9, y, 2, 3, PAL[1]); rect(c - 3 + (i % 2) * 9, y + 4, 2, 3, PAL[1]); }
    for (let i = 0; i < 12; i++) { const y = 296 + Math.floor(rnd(i, 70) * 86), c = Math.round(474 + ((y - 286) / 98) * 58); stone(c - 10 + Math.floor(rnd(i, 71) * 20), y, 3, 2); }
  }

  // ---- постройки ----
  function tileRoof(y0, y1, tl, tr, bl, br, base) {
    const rowH = 5;
    for (let r = 0, y = y0; y <= y1; r++, y += rowH) {
      for (let py = y; py < Math.min(y + rowH, y1 + 1); py++) {
        const t = (py - y0) / (y1 - y0), xl = Math.round(tl + (bl - tl) * t), xr = Math.round(tr + (br - tr) * t), mid = (xl + xr) / 2, off = (r % 2) * 3;
        for (let tx = xl - off - 6, i = 0; tx <= xr; tx += 7, i++) {
          const a = Math.max(tx, xl), b = Math.min(tx + 6, xr); if (b < a) continue;
          let k = (rnd(r * 13 + i, y) - .5) * .22 + (tx < mid ? .12 : -.08) + (noise2(a + i * 3, py, 4, r) - .5) * .16;
          let col = shade(base, k);
          if (py === y) col = shade(col, .22); else if (py >= y + rowH - 1) col = shade(col, -.45); else if (py === y + rowH - 2) col = shade(col, -.2);
          rect(a, py, b - a + 1, 1, col);
          if (tx >= xl && tx <= xr) rect(tx, py, 1, 1, shade(col, -.3));
        }
        rect(xl, py, 1, 1, shade(base, -.6)); rect(xr, py, 1, 1, shade(base, -.6));
      }
    }
  }
  function ivy(x, y, h, seed) { for (let i = 0; i < h; i += 3) { blob(x + Math.round((rnd(seed, i) - .5) * 4), y + i, 3, 3, CANOPY, seed + i); if (rnd(seed, i + 5) < .35) rect(x + 2, y + i, 1, 1, '#f27a9f'); } }
  function house() {
    shadow(90, 97, 60, 4, .34);
    rect(44, 44, 88, 52, W8[0]);
    for (let yy = 45; yy < 95; yy++) for (let xx = 45; xx < 131; xx++) rect(xx, yy, 1, 1, dither(xx, yy, .64 + (noise2(xx, yy, 6, 9) - .5) * .5 - (yy - 45) / 50 * .14 + (rnd(xx, yy) - .5) * .12, PLASTER));
    rect(45, 45, 86, 3, W6[2]); rect(45, 66, 86, 2, W6[2]); [45, 72, 100, 129].forEach((x, i) => { rect(x, 45, 3, 48, W6[2]); rect(x, 45, 1, 48, W6[4]); grain(x, 45, 3, 48, 200 + i, W6[1], W6[3], true); });
    rect(46, 48, 84, 1, 'rgba(60,35,15,.25)');
    stoneWall(45, 84, 86, 11, 7);
    [[53, 50], [105, 50]].forEach(([x, y], n) => {
      rect(x - 4, y - 1, 4, 17, '#3f7f86'); rect(x - 3, y, 2, 15, '#58a3a8'); rect(x + 16, y - 1, 4, 17, '#3f7f86'); rect(x + 17, y, 2, 15, '#58a3a8');
      rect(x - 1, y - 1, 18, 16, W6[0]); rect(x, y, 16, 14, '#79b7cf');
      for (let j = 0; j < 14; j++) rect(x, y + j, 16, 1, dither(x, y + j, .35 + j / 14 * .5, ['#4f8aa4', '#6aa8c2', '#8cc8dc', '#b4e0ee']));
      rect(x + 1, y + 1, 4, 3, '#e6f6fb'); rect(x + 7, y, 2, 14, '#ead6a6'); rect(x, y + 6, 16, 2, '#ead6a6');
      rect(x, y, 3, 8, '#f4e6e0'); rect(x + 1, y, 1, 8, '#fff6f0'); rect(x + 13, y, 3, 8, '#f4e6e0'); rect(x + 14, y, 1, 8, '#fff6f0');
      lights.push({ x, y, w: 16, h: 14 });
      board(x - 4, y + 15, 24, 6, n); rect(x - 3, y + 19, 22, 1, W6[1]);
      for (let i = 0; i < 6; i++) { const c = ['#f27a9f', '#ffd84a', '#ffffff', '#e8524a', '#b08be0', '#ff9a52'][i]; rect(x - 3 + i * 4, y + 12, 4, 4, LEAF[2]); rect(x - 3 + i * 4, y + 12, 4, 1, LEAF[4]); flower(x - 2 + i * 4, y + 12, c); }
    });
    rect(76, 61, 22, 34, W6[0]); rect(77, 62, 20, 33, W6[3]); for (let x = 80; x < 96; x += 5) rect(x, 67, 1, 28, W6[1]); grain(77, 62, 20, 33, 321, W6[2], W6[4], true);
    rect(77, 62, 20, 2, W6[5]); rect(80, 64, 14, 10, W6[0]); rect(81, 65, 12, 8, '#79b7cf'); rect(82, 66, 3, 3, '#e6f6fb'); rect(86, 65, 2, 8, W6[3]); rect(81, 69, 12, 1, W6[3]);
    rect(78, 76, 4, 1, '#3a3a3a'); rect(78, 87, 4, 1, '#3a3a3a'); rect(92, 82, 2, 3, '#f0c040'); rect(92, 82, 1, 1, '#fff2a0');
    lights.push({ x: 81, y: 65, w: 12, h: 8 });
    rect(72, 94, 30, 5, STONE[0]); rect(73, 95, 28, 3, STONE[2]); rect(73, 95, 28, 1, STONE[3]); rect(76, 99, 22, 3, '#7a4c28'); rect(77, 99, 20, 2, '#a06c3c'); rect(79, 99, 16, 1, '#c58f55');
    ellipse(72, 91, 4, 3, W6[0]); rect(69, 88, 7, 6, W6[3]); rect(69, 88, 7, 1, W6[5]); ellipse(72, 87, 4, 2, LEAF[2]); flower(70, 86, '#f27a9f'); flower(74, 85, '#ffd84a');
    ellipse(103, 91, 4, 3, W6[0]); rect(100, 88, 7, 6, W6[3]); rect(100, 88, 7, 1, W6[5]); ellipse(103, 87, 4, 2, LEAF[2]); flower(101, 85, '#ffffff'); flower(105, 86, '#e8524a');
    ivy(46, 52, 36, 11); ivy(129, 60, 24, 17);
    tileRoof(2, 44, 52, 120, 28, 144, '#c4502f');
    rect(24, 43, 124, 4, '#4e1c16'); rect(25, 43, 122, 1, '#e2683f'); rect(25, 46, 122, 1, '#3a120e'); rect(44, 47, 88, 3, 'rgba(40,25,10,.4)'); rect(44, 50, 88, 2, 'rgba(40,25,10,.18)');
    rect(52, 0, 66, 2, '#f08a5c'); rect(52, 2, 66, 1, '#7c2b1f');
    for (let i = 0; i < 6; i++) { const mx = 34 + rnd(i, 41) * 100, my = 8 + rnd(i, 42) * 30; if (mx > 56 && mx < 118 || my > 20) rect(mx, my, 3, 1, '#6d9a3e'); }
    stoneWall(64, -2, 20, 22, 13, false); rect(62, -2, 24, 4, STONE6[1]); rect(63, -2, 22, 1, STONE6[4]); rect(66, 2, 16, 1, '#1a1816');
    smokeAt.push({ x: 74, y: -2 });
  }
  function shed() {
    shadow(502, 85, 52, 4, .34);
    rect(464, 40, 80, 44, W6[0]); for (let x = 465, i = 0; x < 543; x += 5, i++) { rect(x, 41, 4, 42, i % 2 ? W6[3] : '#b47c42'); rect(x, 41, 1, 42, W6[4]); rect(x + 4, 41, 1, 42, W6[1]); grain(x, 41, 4, 42, 90 + i, W6[2], W6[4], true); if (i % 4 === 1) { rect(x + 1, 55 + (i % 3) * 8, 2, 2, W6[1]); } }
    rect(464, 40, 80, 3, W6[1]); rect(464, 80, 80, 4, 'rgba(60,40,10,.3)');
    rect(475, 52, 20, 33, W6[0]); rect(476, 53, 18, 32, W6[2]); for (let x = 479; x < 494; x += 4) rect(x, 53, 1, 32, W6[1]); rect(476, 53, 18, 2, W6[4]);
    rect(479, 56, 12, 9, W6[0]); rect(480, 57, 10, 7, '#79b7cf'); rect(481, 58, 3, 3, '#e6f6fb'); rect(485, 57, 1, 7, W6[2]); rect(477, 60, 4, 1, '#3a3a3a'); rect(477, 76, 4, 1, '#3a3a3a'); rect(489, 71, 2, 3, '#f0c040'); lights.push({ x: 480, y: 57, w: 10, h: 7 });
    rect(504, 49, 22, 17, W6[0]); rect(505, 50, 20, 15, '#79b7cf'); for (let j = 0; j < 15; j++) rect(505, 50 + j, 20, 1, dither(505, 50 + j, .35 + j / 15 * .5, ['#4f8aa4', '#6aa8c2', '#8cc8dc', '#b4e0ee'])); rect(506, 51, 4, 3, '#e6f6fb'); rect(514, 50, 2, 15, '#d8c28a'); rect(505, 56, 20, 2, '#d8c28a'); lights.push({ x: 505, y: 50, w: 20, h: 15 });
    board(501, 66, 28, 6, 4); for (let i = 0; i < 7; i++) { rect(502 + i * 4, 62, 4, 4, LEAF[2]); rect(502 + i * 4, 62, 4, 1, LEAF[4]); flower(503 + i * 4, 63, ['#ffffff', '#f27a9f', '#ffd84a', '#b08be0', '#ffffff', '#f27a9f', '#e8524a'][i]); }
    tileRoof(2, 40, 474, 534, 456, 552, '#3a7549');
    rect(452, 38, 108, 4, '#16341f'); rect(453, 38, 106, 1, '#7ac078'); rect(453, 41, 106, 1, '#0e2415'); rect(453, 42, 106, 3, 'rgba(10,30,15,.4)'); rect(474, 0, 62, 2, '#8fd08a');
    for (let i = 0; i < 6; i++) rect(462 + rnd(i, 51) * 84, 8 + rnd(i, 52) * 28, 4, 1, '#7ab84a');
    rect(443, 58, 15, 22, W6[0]); rect(444, 59, 13, 20, W6[3]); rect(444, 59, 4, 20, W6[4]); rect(444, 64, 13, 1, W6[0]); rect(444, 74, 13, 1, W6[0]); rect(444, 65, 13, 1, W6[5]); grain(444, 59, 13, 20, 77, W6[2], W6[4], true); ellipse(450, 58, 7, 3, '#2a1a0e'); ellipse(450, 58, 6, 2, '#1f7da6');
    // поленница
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) { const lx = 458 + c * 6 + r * 3, ly = 76 - r * 5; ellipse(lx + 3, ly + 2, 3, 3, W6[1]); ellipse(lx + 3, ly + 2, 2, 2, '#d8b070'); rect(lx + 2, ly + 1, 1, 1, W6[3]); }
    [[480, 88], [494, 92], [508, 89], [522, 93]].forEach(([x, y], i) => mossStone(x, y, 11, 5, i % 2 === 0));
    rect(540, 72, 4, 14, W6[0]); clump(548, 80, 12, 9, 71, 8);
  }
  function fenceV(x, y0, y1) {
    board(x + 1, y0 + 2, 3, y1 - y0 - 2, 3, true);
    for (let y = y0, i = 0; y < y1 - 6; y += 15, i++) { board(x - 1, y, 7, 12, 30 + i, true); if (rnd(i, y) < .5) rect(x, y + 11, 2, 1, '#5e9a3a'); tuft(x - 3, y + 12, GRASS[1], GRASS[3], GRASS[6]); }
  }
  function fenceH(x0, x1, y) {
    board(x0, y + 3, x1 - x0, 3, 5); board(x0, y + 9, x1 - x0, 3, 6);
    for (let x = x0, i = 0; x <= x1 - 4; x += 15, i++) { board(x, y, 6, 16, 60 + i, true); rect(x + 2, y + 5, 1, 1, '#d8d8d8'); tuft(x - 2, y + 15, GRASS[1], GRASS[3], GRASS[6]); }
  }
  function scarecrow(x, y) {
    shadow(x + 1, y + 1, 10, 3, .34); rect(x - 6, y - 7, 13, 9, W6[0]); rect(x - 5, y - 6, 11, 7, W6[3]); rect(x - 5, y - 6, 11, 1, W6[5]); rect(x, y - 6, 1, 7, W6[1]); rect(x - 5, y - 3, 11, 1, W6[2]);
    rect(x - 1, y - 38, 4, 40, W6[0]); rect(x, y - 37, 2, 38, W6[3]); rect(x, y - 37, 1, 38, W6[4]);
    rect(x - 13, y - 29, 28, 5, W6[0]); rect(x - 12, y - 28, 26, 3, W6[3]); rect(x - 12, y - 28, 26, 1, W6[5]);
    rect(x - 8, y - 31, 18, 16, '#2a1c10'); rect(x - 7, y - 30, 16, 14, '#c9b27a'); for (let j = 0; j < 14; j += 2) rect(x - 7, y - 30 + j, 16, 1, '#d8c48a'); rect(x - 7, y - 30, 3, 14, '#e0cb94'); rect(x - 4, y - 25, 6, 6, '#3f6e78'); rect(x - 3, y - 24, 4, 4, '#5b8a8a'); rect(x - 3, y - 22, 4, 1, '#c9b27a'); rect(x - 7, y - 19, 16, 2, '#7a6638'); rect(x + 2, y - 27, 1, 1, '#5a3a20'); rect(x + 5, y - 22, 1, 1, '#5a3a20');
    for (let i = 0; i < 4; i++) { rect(x - 17 + i * 2, y - 27 + i, 4, 2, '#e6c45a'); rect(x + 14 - i, y - 28 + i, 4, 2, '#e6c45a'); rect(x - 16 + i, y - 25 + i, 3, 1, '#c89c30'); }
    for (let i = 0; i < 5; i++) rect(x - 5 + i * 3, y - 16 + (i % 2), 2, 4, '#e6c45a');
    ellipse(x + 1, y - 38, 7, 7, '#2a1c10'); ellipse(x + 1, y - 38, 6, 6, '#ecd09a'); ellipse(x, y - 39, 4, 3, '#f6e0b0'); rect(x - 3, y - 40, 2, 2, '#2a1c10'); rect(x + 2, y - 40, 2, 2, '#2a1c10'); rect(x - 2, y - 34, 1, 1, '#8a4a2a'); rect(x - 1, y - 33, 4, 1, '#8a4a2a'); rect(x + 3, y - 34, 1, 1, '#8a4a2a'); rect(x - 4, y - 37, 1, 1, '#e08a7a'); rect(x + 5, y - 37, 1, 1, '#e08a7a');
    rect(x - 10, y - 43, 23, 3, '#2a1c10'); rect(x - 9, y - 42, 21, 2, '#d6a84a'); rect(x - 9, y - 42, 21, 1, '#f0d070'); rect(x - 6, y - 50, 15, 8, '#2a1c10'); rect(x - 5, y - 49, 13, 7, '#d6a84a'); rect(x - 5, y - 49, 3, 7, '#f0d070'); rect(x - 5, y - 45, 13, 2, '#8a3a2a'); rect(x - 5, y - 45, 13, 1, '#b0503a');
    rect(x + 8, y - 34, 6, 5, '#1c1c24'); rect(x + 9, y - 35, 4, 2, '#2c2c38'); rect(x + 13, y - 33, 2, 1, '#f0a020'); rect(x + 10, y - 33, 1, 1, '#fff');
  }
  function stove() {
    shadow(500, 153, 40, 4, .34);
    board(468, 128, 46, 6, 5); rect(470, 134, 4, 18, W6[0]); rect(471, 134, 2, 17, W6[3]); rect(508, 134, 4, 18, W6[0]); rect(509, 134, 2, 17, W6[3]); rect(472, 140, 38, 2, W6[1]);
    ellipse(480, 125, 9, 4, W6[0]); ellipse(480, 125, 8, 3, W6[3]); ellipse(478, 122, 3, 2, '#b02a1a'); ellipse(478, 122, 2, 1, '#e0402f'); ellipse(484, 122, 3, 2, '#c87010'); ellipse(484, 122, 2, 1, '#f09a32'); rect(479, 118, 3, 2, LEAF[3]); rect(496, 123, 13, 5, '#b8b4a0'); rect(496, 123, 13, 1, '#f5f1e2'); rect(497, 125, 11, 1, '#8a8670');
    stoneWall(509, 112, 32, 22, 21, false);
    for (let yy = -9; yy < 0; yy++) { const half = Math.round(16 * Math.sqrt(1 - yy * yy / 81)); for (let xx = -half; xx <= half; xx++) rect(525 + xx, 112 + yy, 1, 1, dither(525 + xx, 112 + yy, .86 + yy / 9 * .4 - xx / 16 * .1 + (rnd(525 + xx, yy) - .5) * .2, STONE6)); }
    rect(514, 116, 22, 18, STONE6[0]); rect(515, 117, 20, 1, STONE6[4]); rect(516, 118, 18, 15, '#1c1612'); ellipse(525, 118, 9, 3, '#1c1612'); rect(520, 126, 10, 7, '#c8501a'); rect(522, 128, 6, 5, '#f09a32'); rect(523, 130, 4, 3, '#ffd877'); rect(515, 133, 20, 1, STONE[1]);
    stoneWall(530, 92, 12, 22, 23, false); rect(528, 90, 16, 4, STONE6[1]); rect(529, 90, 14, 1, STONE6[5]); rect(531, 92, 10, 1, '#14100c');
    lights.push({ x: 521, y: 126, w: 8, h: 6, fire: true }); smokeAt.push({ x: 536, y: 90 });
    rect(463, 88, 4, 46, W6[0]); rect(464, 89, 2, 44, W6[3]); rect(464, 89, 1, 44, W6[4]); rect(463, 88, 18, 4, W6[0]); rect(464, 89, 16, 1, W6[5]); rect(478, 92, 1, 7, '#e8d3a0');
    rect(474, 99, 9, 12, '#2a1c10'); rect(475, 100, 7, 10, '#ffd877'); rect(477, 101, 2, 6, '#fff6c8'); rect(473, 98, 11, 2, '#3a2a1a'); lights.push({ x: 475, y: 100, w: 7, h: 10, lamp: true });
    board(539, 124, 19, 8, 8); for (let i = 0; i < 5; i++) { rect(540 + i * 4, 119, 4, 5, LEAF[2]); flower(541 + i * 4, 120, ['#ffffff', '#f27a9f', '#ffd84a', '#b08be0', '#ffffff'][i]); }
    for (let i = 0; i < 3; i++) { rect(468 + i * 7, 143 + (i % 2), 6, 3, W6[3]); rect(468 + i * 7, 143 + (i % 2), 6, 1, W6[5]); }
  }
  function benchYard(x, y) {
    shadow(x + 20, y + 25, 23, 3, .34); board(x + 2, y + 14, 4, 11, 3, true); board(x + 34, y + 14, 4, 11, 4, true);
    board(x + 1, y, 38, 4, 5); board(x + 1, y + 5, 38, 3, 6); board(x - 2, y + 9, 44, 6, 7); rect(x - 2, y + 15, 44, 1, 'rgba(40,20,10,.4)'); rect(x - 1, y + 10, 1, 1, '#d8d8d8'); rect(x + 40, y + 10, 1, 1, '#d8d8d8');
    tuft(x - 3, y + 24, GRASS[1], GRASS[3], GRASS[5]); tuft(x + 41, y + 24, GRASS[1], GRASS[3], GRASS[5]);
  }
  function lampPost(x, y) {
    rect(x, y, 4, 34, W6[0]); rect(x + 1, y + 1, 2, 32, W6[3]); rect(x + 1, y + 1, 1, 32, W6[4]);
    rect(x - 5, y - 15, 14, 16, '#2a1c10'); rect(x - 4, y - 14, 12, 14, '#ffd877'); rect(x - 2, y - 13, 4, 9, '#fff6c8'); rect(x + 3, y - 14, 1, 14, '#a8681c'); rect(x - 4, y - 8, 12, 1, '#a8681c');
    rect(x - 6, y - 18, 16, 3, '#2a1c10'); rect(x - 5, y - 17, 14, 1, '#7a5a38'); rect(x - 1, y - 21, 6, 3, '#2a1c10'); lights.push({ x: x - 4, y: y - 14, w: 12, h: 14, lamp: true });
    rect(x - 3, y + 33, 10, 3, STONE[0]); rect(x - 2, y + 33, 8, 2, STONE[2]);
  }
  function bucketBarrel(x, y) { rect(x, y, 14, 15, W6[0]); rect(x + 1, y + 1, 12, 13, W6[3]); rect(x + 1, y + 1, 4, 13, W6[4]); rect(x + 1, y + 5, 12, 1, W6[0]); rect(x + 1, y + 10, 12, 1, W6[0]); grain(x + 1, y + 1, 12, 13, 9 + x, W6[2], W6[4], true); ellipse(x + 7, y, 7, 2, W6[0]); ellipse(x + 7, y, 6, 1, WATER[3]); rect(x + 4, y, 3, 1, WATER[5]); }
  function toolCorner() {
    drawSpriteAt('water', 22, 212, 1); drawSpriteAt('fertilizer', 88, 206, 1);
    board(34, 232, 24, 5, 3); rect(36, 237, 3, 11, W6[0]); rect(37, 237, 1, 10, W6[3]); rect(53, 237, 3, 11, W6[0]); rect(54, 237, 1, 10, W6[3]);
    board(63, 240, 12, 6, 2); rect(64, 246, 3, 7, W6[0]); rect(71, 246, 3, 7, W6[0]);
    rect(26, 225, 14, 2, '#777'); rect(40, 218, 2, 10, W6[3]); rect(40, 218, 1, 10, W6[4]); rect(36, 218, 8, 1, '#8a8a8a');
  }

  // ---- декор 42×42, рисуется в родном разрешении ----
  function decorArt(type) {
    const flowerBlob = (x, y, c) => { rect(x - 1, y, 3, 3, shade(c, -.35)); rect(x - 1, y - 1, 3, 3, c); rect(x, y - 1, 1, 1, shade(c, .5)); rect(x, y, 1, 1, '#ffd23a'); };
    shadow(21, 38, 16, 3, .34);
    if (type === 'bench') {
      board(7, 26, 4, 11, 2, true); board(31, 26, 4, 11, 3, true); board(10, 22, 3, 8, 4, true); board(29, 22, 3, 8, 5, true);
      board(6, 8, 30, 4, 11); board(6, 13, 30, 4, 12); board(5, 18, 32, 4, 13);
      board(3, 23, 36, 5, 14); board(2, 28, 38, 4, 15); rect(2, 32, 38, 1, 'rgba(40,20,10,.45)');
      board(2, 17, 4, 12, 16, true); board(36, 17, 4, 12, 17, true);
      rect(7, 9, 1, 1, '#d8d8d8'); rect(34, 9, 1, 1, '#d8d8d8'); rect(4, 24, 1, 1, '#d8d8d8'); rect(37, 24, 1, 1, '#d8d8d8');
      rect(8, 36, 3, 1, '#5e9a3a'); rect(31, 36, 3, 1, '#5e9a3a'); tuft(3, 36); tuft(36, 36);
      return;
    }
    if (type === 'flowers') {
      ellipse(21, 24, 17, 7, '#2a1c10'); ellipse(21, 23, 16, 6, '#3b2616');
      blob(21, 17, 15, 9, CANOPY, 91);
      [[8, 14, '#f27a9f'], [14, 9, '#ffd84a'], [21, 12, '#ffffff'], [28, 9, '#b08be0'], [34, 14, '#ff9a52'], [11, 19, '#e8524a'], [18, 17, '#fff6e6'], [25, 18, '#f27a9f'], [31, 19, '#ffd84a'], [21, 6, '#e8524a']].forEach(([x, y, c], i) => { rect(x, y, 1, 4, LEAF[1]); i % 3 === 0 ? daisy(x, y) : flowerBlob(x, y, c); });
      [[6, 8], [36, 8]].forEach(([x, y], i) => { rect(x, y, 1, 10, LEAF[2]); rect(x - 1, y - 5, 3, 6, '#7a55b8'); rect(x - 1, y - 5, 1, 5, '#b997e0'); rect(x, y - 6, 1, 1, '#d6bdf2'); });
      board(3, 25, 36, 4, 3); board(2, 28, 38, 9, 4); rect(13, 28, 1, 9, W6[0]); rect(28, 28, 1, 9, W6[0]); rect(2, 31, 38, 2, '#3c4046'); rect(2, 31, 38, 1, '#6c727a'); rect(2, 34, 38, 1, W6[1]);
      rect(8, 29, 1, 1, '#d8d8d8'); rect(33, 29, 1, 1, '#d8d8d8');
      for (let i = 0; i < 5; i++) { rect(5 + i * 8, 36, 2, 3, LEAF[2]); } rect(1, 30, 2, 8, LEAF[2]); rect(0, 34, 2, 4, LEAF[3]);
      return;
    }
    if (type === 'lantern') {
      ellipse(21, 37, 9, 3, STONE[0]); ellipse(21, 36, 8, 2, STONE[2]); rect(14, 31, 14, 6, STONE[0]); rect(15, 32, 12, 4, STONE[2]); rect(15, 32, 12, 1, STONE[3]); rect(18, 34, 1, 2, STONE[1]); rect(24, 33, 1, 3, STONE[1]);
      rect(19, 14, 5, 18, W6[0]); rect(20, 15, 3, 16, W6[3]); rect(20, 15, 1, 16, W6[4]); rect(22, 15, 1, 16, W6[2]);
      rect(23, 15, 8, 3, W6[0]); rect(24, 16, 6, 1, W6[4]); rect(29, 17, 1, 4, '#3a3a3a');
      rect(15, 2, 15, 3, '#2a1c10'); rect(17, 0, 11, 3, '#2a1c10'); rect(18, 1, 9, 1, '#7a5a38'); rect(20, -1, 5, 1, '#2a1c10');
      rect(14, 5, 17, 16, '#2a1c10'); rect(16, 6, 13, 13, '#ffd877'); rect(17, 7, 4, 10, '#fff6c8'); rect(21, 6, 2, 13, '#b87a20'); rect(26, 8, 2, 8, '#e6a83a'); rect(22, 12, 2, 4, '#ff9a30'); rect(22, 10, 1, 3, '#ffcf58');
      rect(14, 19, 17, 2, '#3a2a1a'); rect(16, 21, 13, 1, '#7a5a38'); return;
    }
    if (type === 'pond') {
      ellipse(21, 28, 19, 10, STONE[0]); for (let yy = -9; yy <= 9; yy++) { const half = Math.round(17 * Math.sqrt(1 - yy * yy / 100)); for (let xx = -half; xx <= half; xx++) { const d = Math.hypot(xx / 17, yy / 9.5); rect(21 + xx, 27 + yy, 1, 1, dither(21 + xx, 27 + yy, .8 - d * .5 - (d > .8 ? .2 : 0) + Math.sin(xx * .8 + yy) * .05, WATER)); } }
      for (let a = 0; a < 6.283; a += .26) { const k = Math.floor(a * 10); mossStone(Math.round(21 + Math.cos(a) * 18 - 3), Math.round(27 + Math.sin(a) * 9.5 - 2), 6 + Math.floor(rnd(k, 2) * 3), 5, rnd(k, 3) < .4); }
      rect(11, 24, 6, 1, WATER[6]); rect(26, 31, 5, 1, WATER[5]); rect(14, 30, 3, 1, WATER[5]);
      lily(28, 26, true); lily(14, 30, false); rect(13, 27, 3, 2, '#3a9a3a'); rect(13, 26, 1, 1, '#fff'); rect(15, 26, 1, 1, '#fff'); rect(14, 26, 1, 1, '#111');
      reeds(5, 25, 2, 31); return;
    }
    if (type === 'beehive') {
      for (const [x, y] of [[8, 34], [30, 35], [20, 36]]) tuft(x, y);
      for (const [x, y, c] of [[6, 33, '#ffd84a'], [33, 34, '#b08be0'], [36, 32, '#f27a9f']]) { rect(x, y - 4, 1, 6, LEAF[2]); flowerBlob(x, y - 5, c); }
      board(10, 28, 3, 9, 5, true); board(29, 28, 3, 9, 6, true); rect(12, 30, 18, 2, W6[1]);
      board(8, 22, 26, 7, 7); rect(8, 24, 26, 1, W6[1]);
      rect(9, 14, 24, 9, W6[0]); rect(10, 15, 22, 7, '#e0b25a'); rect(10, 15, 22, 1, '#f4d286'); rect(10, 18, 22, 1, '#b88437'); rect(10, 21, 22, 1, '#b88437'); grain(10, 15, 22, 7, 44, '#c8943c', '#efc874');
      rect(17, 16, 8, 5, '#2a1c10'); rect(18, 17, 6, 4, '#0e0804'); rect(16, 21, 10, 2, W6[3]); rect(16, 21, 10, 1, W6[5]);
      rect(6, 11, 30, 4, W6[0]); rect(7, 12, 28, 2, W6[3]); rect(7, 12, 28, 1, W6[5]);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) { const sx = 10 + i * 5 + (r % 2) * 2 - r * 1, sy = 5 + r * 3; rect(sx, sy, 5, 3, shade(W6[3], (rnd(r, i) - .5) * .2)); rect(sx, sy + 2, 5, 1, W6[1]); }
      rect(14, 2, 14, 3, W6[0]); rect(16, 0, 10, 3, W6[0]); rect(17, 1, 8, 1, W6[4]); rect(21, -1, 1, 1, W6[0]); return;
    }
    if (type === 'well') {
      ellipse(21, 33, 15, 6, STONE[0]); rect(6, 24, 30, 10, STONE[0]);
      for (let y = 25; y < 34; y += 4) for (let x = 7 + (y % 8 ? 0 : 4); x < 35; x += 8) { rect(x, y, 7, 3, STONE[2]); rect(x, y, 7, 1, STONE[3]); rect(x, y + 2, 7, 1, STONE[1]); }
      ellipse(21, 25, 14, 5, STONE[0]); ellipse(21, 25, 13, 4, STONE[2]); ellipse(21, 25, 10, 3, '#0f4f69'); ellipse(21, 25, 9, 2, WATER[3]); rect(15, 25, 5, 1, WATER[6]);
      rect(7, 28, 3, 1, '#5e9a3a'); rect(30, 31, 4, 1, '#5e9a3a');
      board(7, 7, 4, 19, 8, true); board(31, 7, 4, 19, 9, true); board(18, 11, 6, 3, 10); rect(20, 14, 2, 9, '#e8d3a0'); rect(17, 22, 8, 5, W6[0]); rect(18, 22, 6, 4, W6[3]); rect(18, 22, 6, 1, W6[5]);
      tileRoofSmall(); return;
    }
    if (type === 'sprinkler') {
      ellipse(21, 37, 6, 2, STONE[0]); rect(19, 16, 5, 22, '#3a4852'); rect(20, 16, 2, 22, '#8aa0ae'); rect(16, 28, 11, 4, '#33566e'); rect(17, 29, 9, 2, '#6aa4c8');
      rect(12, 10, 19, 6, '#33566e'); rect(13, 11, 17, 4, '#6aa4c8'); rect(14, 11, 6, 1, '#b4d8f0'); rect(18, 6, 7, 5, '#33566e'); rect(19, 7, 5, 3, '#8aa0ae'); rect(14, 13, 2, 1, '#1a3a52'); rect(27, 13, 2, 1, '#1a3a52'); return;
    }
  }
  function tileRoofSmall() {
    for (let r = 0; r < 6; r++) { const yy = 3 + r * 2, half = 6 + r * 3; for (let x = 21 - half; x <= 21 + half; x += 4) { rect(x, yy, 4, 2, shade(W6[3], (rnd(r, x) - .5) * .18 + (x < 21 ? .1 : -.06))); rect(x, yy + 1, 4, 1, W6[1]); } }
    rect(8, 14, 26, 2, W6[0]); rect(9, 14, 24, 1, W6[4]); rect(18, 0, 6, 3, W6[0]); rect(19, 1, 4, 1, W6[5]);
  }


  // ---- дикие участки: пока клетка закрыта, на ней живёт своя маленькая жизнь ----
  const MOSS = ['#222c29', '#3c4945', '#5d6f68', '#8a9d93', '#b6c5b8'];
  function tallGrass(x, y, s) { for (let i = 0; i < 10; i++) { const bx = x - 9 + i * 2 + Math.floor(rnd(s, i) * 2), h = 6 + Math.floor(rnd(s, i + 9) * 9), c = GRASS[1 + i % 3]; rect(bx, y - h, 1, h, c); rect(bx + (i % 2 ? 1 : -1), y - h - 1, 1, 2, GRASS[4]); if (i % 3 === 0) { rect(bx, y - h - 3, 1, 3, '#d8c070'); rect(bx - 1, y - h - 2, 1, 1, '#b89a40'); } } }
  function boulder(x, y, s) { shadow(x + 1, y + 3, 11, 3, .34); blob(x, y - 4, 10, 7, MOSS, s); rect(x - 5, y - 10, 7, 1, '#6aa844'); rect(x - 3, y - 11, 4, 1, '#8ac85a'); rect(x + 2, y - 3, 1, 4, MOSS[0]); rect(x + 3, y + 1, 2, 1, MOSS[0]); tuft(x - 11, y + 1); tuft(x + 9, y + 2); }
  function stump(x, y, s) { shadow(x, y + 3, 9, 3, .34); rect(x - 7, y - 8, 14, 11, W6[0]); rect(x - 6, y - 8, 12, 10, W6[2]); grain(x - 6, y - 8, 12, 10, s + 5, W6[1], W6[3], true); rect(x - 6, y - 8, 3, 10, W6[3]); rect(x - 8, y + 1, 4, 3, W6[1]); rect(x + 5, y + 1, 4, 3, W6[1]); ellipse(x, y - 9, 7, 3, W6[0]); ellipse(x, y - 9, 6, 2, '#dcb878'); ellipse(x, y - 9, 3, 1, '#b88a48'); rect(x, y - 9, 1, 1, '#8a5a28'); rect(x - 5, y - 10, 4, 1, '#f0d8a0'); rect(x + 6, y - 2, 4, 3, '#f1e6cf'); rect(x + 6, y - 4, 5, 2, '#d8443a'); rect(x + 7, y - 4, 1, 1, '#fff'); }
  function berryBush(x, y, s) { shadow(x, y + 2, 12, 3, .3); blob(x, y - 6, 11, 8, CANOPY, s); for (let i = 0; i < 9; i++) { const bx = x - 8 + rnd(s, i) * 16, by = y - 11 + rnd(s, i + 9) * 11, c = s % 2 ? '#d8344a' : '#4a58c0'; rect(bx, by, 2, 2, shade(c, -.4)); rect(bx, by, 2, 1, c); rect(bx, by, 1, 1, shade(c, .5)); } }
  function mushrooms(x, y, s) { shadow(x, y + 2, 9, 2, .3); [[-5, 1, 5, '#d8443a', 1], [2, 0, 6, '#e8604a', 1], [7, 2, 4, '#c8884a', 0]].forEach(([dx, dy, w, c, dots]) => { rect(x + dx + Math.floor(w / 2) - 1, y + dy - 3, 2, 4, '#f1e6cf'); ellipse(x + dx + Math.floor(w / 2), y + dy - 4, Math.ceil(w / 2) + 1, 2, shade(c, -.35)); ellipse(x + dx + Math.floor(w / 2), y + dy - 5, Math.ceil(w / 2) + 1, 2, c); rect(x + dx, y + dy - 6, 2, 1, shade(c, .4)); if (dots) { rect(x + dx + 2, y + dy - 6, 1, 1, '#fff'); rect(x + dx + 4, y + dy - 5, 1, 1, '#fff'); } }); }
  function fern(x, y, s) { for (let k = 0; k < 7; k++) { const a = -1.3 + k * .43; for (let tt = 0; tt < 13; tt++) { const fx = x + Math.sin(a) * tt * .85, fy = y - Math.cos(a) * tt * .75 + tt * tt * .012; rect(fx, fy, 1, 1, GRASS[1]); if (tt % 2 === 0 && tt > 2) { rect(fx - 1, fy + 1, 1, 1, GRASS[4]); rect(fx + 1, fy + 1, 1, 1, GRASS[3]); } } } }
  function flowerPatch(x, y, s) { const hue = BLOOM[1 + Math.floor(rnd(s, 3) * 6)]; for (let i = 0; i < 8; i++) { const fx = x - 10 + rnd(s, i + 20) * 20, fy = y - 6 + rnd(s, i + 30) * 12; rect(fx - 1, fy + 1, 3, 2, GRASS[2]); i % 3 === 0 ? daisy(Math.round(fx), Math.round(fy)) : flower(fx, fy, i % 2 ? hue : BLOOM[(i + 2) % BLOOM.length]); } }
  function fallenLog(x, y, s) { shadow(x, y + 3, 13, 3, .34); rect(x - 13, y - 6, 26, 9, W6[0]); rect(x - 12, y - 5, 24, 7, W6[2]); grain(x - 12, y - 5, 24, 7, s + 8, W6[1], W6[3]); rect(x - 12, y - 5, 24, 1, W6[4]); rect(x - 12, y + 1, 24, 1, W6[1]); ellipse(x - 13, y - 2, 3, 4, W6[0]); ellipse(x - 13, y - 2, 2, 3, '#dcb878'); rect(x - 13, y - 2, 1, 1, '#8a5a28'); rect(x - 4, y - 8, 3, 3, W6[2]); rect(x + 3, y - 6, 8, 1, '#6aa844'); rect(x + 4, y - 7, 4, 1, '#8ac85a'); }
  function wildCell(px, py, s) {
    for (let i = 0; i < 4; i++) tuft(px + 4 + Math.floor(rnd(s, i) * 34), py + 8 + Math.floor(rnd(s, i + 9) * 28), GRASS[0], GRASS[1], GRASS[4]);
    const kind = Math.floor(rnd(s, 77) * 11), ox = px + 10 + Math.floor(rnd(s, 78) * 20), oy = py + 20 + Math.floor(rnd(s, 79) * 14);
    [tallGrass, tallGrass, boulder, stump, berryBush, mushrooms, fern, flowerPatch, fallenLog, flowerPatch, tallGrass][kind](ox, oy, s);
    for (let i = 0; i < 2; i++) { const fx = px + 4 + rnd(s, i + 20) * 34, fy = py + 6 + rnd(s, i + 30) * 30; i % 2 ? daisy(Math.round(fx), Math.round(fy)) : flower(fx, fy, BLOOM[Math.floor(rnd(s, i + 40) * BLOOM.length)]); }
  }

  // ---- уютные детали по краям поляны ----
  function appleTree(x, y) {
    shadow(x + 4, y + 5, 20, 5, .34); rect(x - 4, y - 18, 8, 24, W6[0]); rect(x - 3, y - 18, 6, 23, W6[2]); grain(x - 3, y - 18, 6, 23, 801, W6[1], W6[3], true); rect(x - 3, y - 18, 2, 23, W6[3]); rect(x - 7, y + 2, 5, 3, W6[1]); rect(x + 3, y + 2, 5, 3, W6[1]);
    blob(x - 8, y - 26, 13, 11, CANOPY, 811); blob(x + 9, y - 25, 13, 11, CANOPY, 812); blob(x, y - 34, 15, 12, CANOPY, 813);
    [[-14, -26], [-6, -20], [4, -24], [12, -29], [-2, -36], [10, -19], [-9, -34], [16, -24], [0, -28]].forEach(([dx, dy]) => { rect(x + dx, y + dy, 3, 3, '#7a1418'); rect(x + dx, y + dy, 3, 2, '#d8302c'); rect(x + dx, y + dy, 1, 1, '#ff9a8a'); rect(x + dx + 1, y + dy - 1, 1, 1, '#2a5a1a'); });
    [[-10, 4], [8, 6], [-4, 7]].forEach(([dx, dy]) => { rect(x + dx, y + dy, 3, 3, '#7a1418'); rect(x + dx, y + dy, 3, 2, '#d8302c'); rect(x + dx, y + dy, 1, 1, '#ff9a8a'); });
    tuft(x - 14, y + 3); tuft(x + 14, y + 4);
  }
  function arbor(x, y) {
    shadow(x + 12, y + 44, 16, 3, .3);
    board(x, y + 4, 5, 40, 1, true); board(x + 24, y + 4, 5, 40, 2, true); board(x - 2, y, 33, 5, 3);
    rect(x + 3, y - 5, 23, 3, W6[0]); rect(x + 5, y - 7, 19, 3, W6[0]); rect(x + 4, y - 4, 21, 1, W6[3]); rect(x + 7, y - 6, 15, 1, W6[3]); rect(x + 10, y - 9, 9, 3, W6[0]); rect(x + 11, y - 8, 7, 1, W6[3]);
    for (let i = 0; i < 9; i++) blob(x + 1 + (i % 2) * 3, y + 6 + i * 4, 4, 4, CANOPY, 820 + i); for (let i = 0; i < 9; i++) blob(x + 27 - (i % 2) * 3, y + 6 + i * 4, 4, 4, CANOPY, 830 + i);
    for (let i = 0; i < 7; i++) blob(x + 3 + i * 3.6, y + 1 + (i % 2), 4, 3, CANOPY, 840 + i);
    for (let i = 0; i < 16; i++) { const rx = i < 4 ? x + 3 + i * 7 : i < 10 ? x - 1 + (i % 2) * 5 : x + 26 + (i % 2) * 5, ry = i < 4 ? y - 1 : y + 6 + (i * 5) % 34, c = i % 3 ? '#e84a78' : '#ff9ab8'; rect(rx, ry, 3, 3, shade(c, -.4)); rect(rx, ry, 3, 2, c); rect(rx, ry, 1, 1, shade(c, .5)); }
    for (let i = 0; i < 5; i++) { stone(x + 8 + (i % 2) * 5, y + 46 + i * 5, 9, 4); }
  }
  function picnic(x, y) {
    shadow(x + 20, y + 14, 24, 4, .26);
    for (let j = 0; j < 17; j++) { const off = Math.round((17 - j) * .25); for (let i = 0; i < 40; i++) { const chk = (Math.floor(i / 4) + Math.floor(j / 4)) % 2; rect(x + off + i, y + j, 1, 1, chk ? '#f4ecd8' : '#cf3d3a'); } }
    rect(x + 4, y + 17, 40, 1, '#8a2420');
    rect(x + 6, y + 3, 15, 10, W6[0]); rect(x + 7, y + 4, 13, 8, '#b98648'); rect(x + 7, y + 4, 13, 2, '#d8a864'); rect(x + 6, y + 2, 15, 2, W6[2]); rect(x + 9, y - 3, 2, 6, W6[1]); rect(x + 16, y - 3, 2, 6, W6[1]); rect(x + 9, y - 4, 9, 2, W6[2]); rect(x + 9, y + 6, 3, 3, '#f4ecd8'); rect(x + 14, y + 7, 3, 3, '#d8302c');
    rect(x + 26, y + 6, 8, 7, '#e8e0cc'); rect(x + 26, y + 6, 8, 1, '#fff'); rect(x + 34, y + 8, 3, 3, '#e8e0cc'); rect(x + 28, y + 3, 4, 3, '#e8e0cc'); rect(x + 38, y + 10, 3, 3, '#c04a38'); rect(x + 38, y + 10, 3, 1, '#f08a7a'); ellipse(x + 3, y + 10, 3, 2, '#d8302c'); ellipse(x + 3, y + 10, 2, 1, '#ff8a7a');
  }
  function wheelbarrow(x, y) {
    shadow(x + 8, y + 12, 14, 3, .3); rect(x, y, 22, 4, W6[0]); rect(x + 1, y - 7, 20, 9, '#2a2622'); rect(x + 2, y - 6, 18, 8, '#4a5a5a'); rect(x + 2, y - 6, 18, 2, '#7a8a8a'); rect(x + 18, y + 2, 12, 2, W6[0]); rect(x + 19, y + 2, 11, 1, W6[3]);
    ellipse(x + 4, y + 9, 4, 4, '#1c1c20'); ellipse(x + 4, y + 9, 3, 3, '#4a4a52'); ellipse(x + 4, y + 9, 1, 1, '#9a9aa2'); rect(x + 8, y + 2, 2, 8, W6[1]);
    ellipse(x + 11, y - 7, 9, 3, '#3b2616'); for (let i = 0; i < 6; i++) { rect(x + 5 + i * 3, y - 11 + (i % 2) * 2, 1, 5, LEAF[2]); i % 2 ? daisy(x + 5 + i * 3, y - 12 + (i % 2) * 2) : flower(x + 5 + i * 3, y - 11, ['#f27a9f', '#ffd84a', '#b08be0'][i % 3]); }
  }
  function birdhouse(x, y) {
    shadow(x + 1, y + 24, 5, 2, .3); rect(x, y, 3, 25, W6[0]); rect(x + 1, y + 1, 1, 24, W6[3]); rect(x - 7, y - 14, 17, 14, W6[0]); rect(x - 6, y - 13, 15, 12, '#b57e44'); rect(x - 6, y - 13, 15, 2, '#d8a864'); rect(x - 1, y - 10, 5, 5, '#1c1008'); rect(x - 1, y - 4, 5, 2, W6[1]);
    rect(x - 9, y - 18, 21, 5, W6[0]); rect(x - 8, y - 17, 19, 3, '#c4502f'); rect(x - 8, y - 17, 19, 1, '#e2683f'); rect(x - 5, y - 21, 13, 4, W6[0]); rect(x - 4, y - 20, 11, 2, '#c4502f');
    rect(x + 6, y - 22, 4, 3, '#3a7ad0'); rect(x + 7, y - 24, 3, 3, '#5a9af0'); rect(x + 10, y - 23, 2, 1, '#f0a020'); rect(x + 7, y - 23, 1, 1, '#111'); rect(x + 3, y - 20, 4, 1, '#2a5aa0');
  }
  function coop(x, y) {
    shadow(x + 18, y + 28, 22, 3, .32);
    rect(x, y + 6, 34, 22, W6[0]); for (let i = 0; i < 7; i++) { rect(x + 1 + i * 5, y + 7, 4, 20, i % 2 ? '#b78a56' : '#a6783f'); rect(x + 1 + i * 5, y + 7, 1, 20, W6[4]); }
    rect(x + 6, y + 16, 9, 12, '#2a1c10'); rect(x + 7, y + 17, 7, 11, '#14100a'); rect(x + 4, y + 28, 13, 2, W6[2]); for (let i = 0; i < 4; i++) rect(x + 5 + i * 3, y + 24 + i % 2, 2, 5, W6[3]);
    rect(x + 20, y + 12, 10, 8, W6[0]); rect(x + 21, y + 13, 8, 6, '#79b7cf'); rect(x + 24, y + 13, 1, 6, W6[2]);
    rect(x - 3, y + 2, 40, 6, W6[0]); rect(x - 2, y + 3, 38, 3, '#c4502f'); rect(x - 2, y + 3, 38, 1, '#e2683f'); rect(x + 3, y - 2, 28, 5, W6[0]); rect(x + 4, y - 1, 26, 3, '#b8442a'); rect(x + 4, y - 1, 26, 1, '#e2683f');
    rect(x + 27, y + 24, 10, 1, W6[0]); rect(x + 31, y + 25, 1, 4, W6[0]); for (let i = 0; i < 3; i++) rect(x + 28 + i * 3, y + 29, 2, 1, '#e6c45a');
  }
  function flowerRow(x, y, w, seed) { board(x, y + 3, w, 4, seed); for (let i = 0; i < w; i += 3) { rect(x + i, y - 1, 3, 4, LEAF[2]); rect(x + i, y - 1, 3, 1, LEAF[4]); i % 6 ? flower(x + i + 1, y - 1, BLOOM[(i / 3 | 0) % BLOOM.length]) : daisy(x + i + 1, y - 2); } }

  function lightRays(g) {
    withCtx(g, () => {
      for (let i = 0; i < 7; i++) {
        const x0 = 20 + i * 88 + rnd(i, 3) * 20, w = 18 + rnd(i, 4) * 26, sk = 150 + rnd(i, 5) * 60;
        const gr = g.createLinearGradient(x0, 0, x0 + sk * .5, H * .8); gr.addColorStop(0, 'rgba(255,244,170,.11)'); gr.addColorStop(.55, 'rgba(255,244,170,.04)'); gr.addColorStop(1, 'rgba(255,244,170,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w, 0); g.lineTo(x0 + w + sk, H); g.lineTo(x0 + sk * .55, H); g.closePath(); g.fill();
      }
      const sun = g.createRadialGradient(40, 0, 4, 40, 0, 190); sun.addColorStop(0, 'rgba(255,240,170,.16)'); sun.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 34; i++) { const x = rnd(i, 61) * W, y = rnd(i, 62) * H; if (inGrid(x, y, 0)) continue; if (x < 80 || x > 440 || y < 60 || y > 330) continue; g.fillStyle = 'rgba(255,248,190,.10)'; g.beginPath(); g.ellipse(x, y, 6 + rnd(i, 63) * 9, 3 + rnd(i, 64) * 4, .3, 0, 6.283); g.fill(); }
      const vg = g.createRadialGradient(W / 2, H / 2, H * .38, W / 2, H / 2, H * .95); vg.addColorStop(0, 'rgba(10,30,20,0)'); vg.addColorStop(1, 'rgba(10,30,20,.38)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    });
  }

  function buildBg() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    waterSpots.length = 0; lights.length = 0; smokeAt.length = 0;
    paintGround(g);
    const cd = (fn, o) => castDraw(g, fn, o);
    withCtx(g, () => {
      meadow();
      cd(treeRing, { len: 10, dx: .9, dy: .85, a: .4 });
      cd(house, { len: 12, dx: 1, dy: .45, a: .36 });
    });
    lightRays(g);
    return c;
  }
  function drawSpriteAt(type, x, y, k = 1) { cx.imageSmoothingEnabled = false; cx.drawImage(sprImg(type), Math.round(x), Math.round(y), Math.round(28 * k), Math.round(28 * k)); }

  // Слой участка: заросли на закрытых клетках, ухоженная земля на открытых, заборчик по границе.
  function buildPlot() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    withCtx(g, () => {
      for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
        const px = GX + x * T, py = GY + y * T, locked = x >= G.area.cols || y >= G.area.rows, s = x * 17 + y * 31;
        if (locked) {
        } else {
          for (let i = 0; i < 3; i++) rect(px + 5 + rnd(s, i) * 30, py + 5 + rnd(s, i + 5) * 30, 2, 1, 'rgba(90,60,20,.2)');
          for (const [ax, ay] of [[1, 1], [T - 4, 1], [1, T - 4], [T - 4, T - 4]]) { rect(px + ax, py + ay, 3, 1, 'rgba(235,250,150,.5)'); rect(px + ax + (ax > 3 ? 2 : 0), py + ay, 1, 3, 'rgba(235,250,150,.5)'); }
        }
      }
      const right = GX + G.area.cols * T, bottom = GY + G.area.rows * T;
      if (G.area.cols < 8) fenceV(right + 1, GY - 4, bottom + 4);
      if (G.area.rows < 6) fenceH(GX - 4, right + 5, bottom + 1);
    });
    return c;
  }

  function drawBed(b, px, py, now) {
    const x = px + 2, y = py + 7, w = T - 4, h = T - 10;
    rect(x + 3, y + h, w, 4, 'rgba(12,34,12,.34)'); rect(x + w, y + 4, 4, h - 2, 'rgba(12,34,12,.30)'); rect(x + w + 4, y + h + 1, 2, 2, 'rgba(12,34,12,.18)');
    rect(x, y, w, h, W6[0]); rect(x + 1, y + 1, w - 2, 5, W6[4]); rect(x + 1, y + 1, w - 2, 1, W6[5]); grain(x + 1, y + 2, w - 2, 4, b.id * 7, W6[3], W6[5]);
    rect(x + 1, y + 6, 3, h - 7, W6[3]); rect(x + 1, y + 6, 1, h - 7, W6[4]); rect(x + w - 4, y + 6, 3, h - 7, W6[2]); rect(x + w - 2, y + 6, 1, h - 7, W6[1]);
    const wet = !b.dry;
    for (let j = 0; j < h - 11; j++) for (let i = 0; i < w - 8; i += 1) {
      const wx = x + 4 + i, wy = y + 6 + j, v = (wet ? .2 : .55) + (noise2(wx, wy, 3, b.id) - .5) * .35 + (j % 6 === 3 ? .12 : 0) - (j % 6 === 4 ? .08 : 0);
      rect(wx, wy, 1, 1, dither(wx, wy, v, wet ? ['#2d1c10', '#3c2616', '#4a301c', '#5e3f26'] : ['#6e5236', '#84643f', '#9a7a50', '#b09060']));
    }
    for (let i = 0; i < 4; i++) rect(x + 5 + rnd(b.id, i) * (w - 12), y + 7 + rnd(b.id, i + 7) * (h - 16), 2, 1, wet ? '#7a5a3a' : '#c4a878');
    const by = y + h - 7, xs = [x + 11, x + w / 2, x + w - 11];
    if (b.crop) {
      const col = G.catalog.crops[b.crop].color;
      xs.forEach((sx, i) => { ellipse(sx, by + 1, 5, 2, 'rgba(15,35,10,.38)'); plant(b.crop, b.stage, col, sx, by - (i === 1 ? 2 : 0)); });
    } else { rect(x + 8, y + 11, 5, 1, '#6a4a2e'); rect(x + w - 15, y + 15, 5, 1, '#6a4a2e'); }
    rect(x + 1, y + h - 6, w - 2, 5, W6[3]); rect(x + 1, y + h - 6, w - 2, 1, W6[5]); rect(x + 1, y + h - 2, w - 2, 1, W6[1]); grain(x + 1, y + h - 5, w - 2, 3, b.id * 11, W6[2], W6[4]);
    [[x, y], [x + w - 4, y]].forEach(([cx0, cy0]) => { rect(cx0, cy0 - 1, 4, 6, W6[0]); rect(cx0 + 1, cy0, 2, 4, W6[5]); rect(cx0 + 1, cy0, 1, 4, '#fff1c8'); });
    rect(x + 3, y + h - 4, 1, 1, '#d8d8d8'); rect(x + w - 4, y + h - 4, 1, 1, '#d8d8d8');
    if (b.crop) {
      if (b.ready) { const tw = Math.floor(now / 260) % 2; rect(x + w - 8, y - 4 + tw, 5, 1, '#fff8d3'); rect(x + w - 6, y - 6 + tw, 1, 5, '#fff8d3'); rect(x + w - 6, y - 4 + tw, 1, 1, '#ffe27a'); }
      if (b.dry) { rect(x + 3, y - 6, 5, 1, '#16465e'); rect(x + 4, y - 5, 3, 1, '#16465e'); rect(x + 4, y - 4, 3, 4, '#56b4d8'); rect(x + 5, y - 3, 1, 2, '#bff0f7'); rect(x + 5, y - 7, 1, 1, '#16465e'); }
      if (b.fertilized) { rect(x + 3, y + h - 12, 3, 3, '#ffe27a'); rect(x + 4, y + h - 13, 1, 1, '#fff8d3'); }
    }
  }
  function drawDecor(d, now) {
    const px = GX + d.x * T, py = GY + d.y * T;
    cx.imageSmoothingEnabled = false; cx.drawImage(art42(d.item), px, py - 1, T, T);
    if (d.item === 'beehive') for (let i = 0; i < 3; i++) { const k = now / 140 + d.id * 5 + i * 2.1, bx = px + 21 + Math.sin(k) * (9 + i * 3), by = py + 12 + Math.cos(k * 1.3) * (5 + i * 2); rect(bx, by, 2, 2, '#f2c230'); rect(bx, by, 1, 2, '#2a1c10'); rect(bx - 1, by - 1, 1, 1, 'rgba(255,255,255,.8)'); }
    if (d.item === 'pond') { const r = (now / 700 + d.id) % 3; if (r < 2) { g_ring(px + 21, py + 27, 4 + r * 5, 2 + r * 2.4, .6 - r * .3); } }
    if (d.item === 'flowers') { const k = now / 600 + d.id; rect(px + 14 + Math.sin(k) * 10, py + 2 + Math.cos(k * 1.4) * 3, 2, 1, '#f77da7'); rect(px + 17 + Math.sin(k) * 10, py + 1 + Math.cos(k * 1.4) * 3, 2, 1, '#f77da7'); }
  }
  function g_ring(x, y, rx, ry, a) { cx.strokeStyle = 'rgba(210,245,255,' + Math.max(0, a) + ')'; cx.lineWidth = 1; cx.beginPath(); cx.ellipse(Math.round(x) + .5, Math.round(y) + .5, rx, ry, 0, 0, 6.283); cx.stroke(); }
  let heroFlip = false;
  function drawHero(now) {
    const x = Math.round(hero.x), y = Math.round(hero.y), moving = Math.abs(hero.tx - hero.x) + Math.abs(hero.ty - hero.y) > 1.2;
    if (Math.abs(hero.tx - hero.x) > 1.5) heroFlip = hero.tx < hero.x;
    const quiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches, bob = moving && !quiet ? Math.round(Math.sin(now / 90)) : 0;
    shadow(x + 3, y - 1, 12, 3, .4);
    let frame = null;
    try {
      const st = bridge()?.state?.(), look = st && st.sleeping ? 'sleep' : moving ? 'walk' : 'idle', blink = Math.floor(now / 160) % 31 === 0;
      const dr = window.__pet && window.__pet.drawOtter;
      const o = dr ? dr(now, look, blink, null, { s: .55, back: false }) : null;
      frame = o && o.c || bridge()?.gardenOtterFrame?.(now);
    } catch (_) {}
    if (frame) {
      cx.imageSmoothingEnabled = false;
      if (frame.width <= 96) { cx.save(); if (heroFlip) { cx.translate(x * 2, 0); cx.scale(-1, 1); } cx.drawImage(frame, x - frame.width / 2, y - 87 + bob); cx.restore(); }
      else cx.drawImage(frame, x - 22, y - 46 + bob, 44, 48);
      return;
    }
    ellipse(x, y - 11 + bob, 8, 10, '#4a2f1a'); ellipse(x, y - 12 + bob, 7, 9, '#a6723c'); ellipse(x, y - 6 + bob, 5, 5, '#ead3a7');
    rect(x - 6, y - 22 + bob, 3, 3, '#4a2f1a'); rect(x + 4, y - 22 + bob, 3, 3, '#4a2f1a'); rect(x - 4, y - 14 + bob, 2, 2, '#1c120c'); rect(x + 3, y - 14 + bob, 2, 2, '#1c120c'); rect(x - 1, y - 11 + bob, 3, 2, '#503126');
  }
  function ambient(now, quiet) {
    for (const s of waterSpots) if (Math.floor(now / 520 + s.k * 1.7) % 4 === 0) { rect(s.x, s.y, 3, 1, WATER[6]); rect(s.x + 1, s.y - 1, 1, 1, WATER[6]); }
    if (quiet) return;
  }
  function draw(now) {
    if (!opened) return;
    if (!bg) bg = buildBg();
    const quiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cx.clearRect(0, 0, W, H); cx.drawImage(bg, 0, 0); ambient(now, quiet);
    if (!G) { drawHero(now); return; }
    const key = G.area.cols + 'x' + G.area.rows;
    if (key !== plotKey || !plotLayer) { plotLayer = buildPlot(); plotKey = key; }
    cx.drawImage(plotLayer, 0, 0);
    const items = [];
    for (const b of G.beds) items.push({ y: GY + b.y * T + T, draw: () => drawBed(b, GX + b.x * T, GY + b.y * T, now) });
    for (const d of G.decor) items.push({ y: GY + d.y * T + T - 2, draw: () => drawDecor(d, now) });
    if (G.upgrades.includes('well')) items.push({ y: 160, draw: () => { cx.drawImage(art42('well'), 78, 118); } });
    if (G.auto_water) items.push({ y: 204, draw: () => { cx.drawImage(art42('sprinkler'), 84, 164); if (!quiet) for (let i = 0; i < 8; i++) { const a = now / 300 + i * .8, rr = 8 + (i % 3) * 3; rect(105 + Math.cos(a) * rr, 172 + Math.sin(a * 1.5) * 3 + Math.abs(Math.sin(a)) * 5, 1, 2, '#bff0f7'); } } });
    for (const pen of G.pens || []) items.push({ y: penSlot(pen)[1] + PEN_H - 3, draw: () => drawPen(pen, now, quiet) });
    items.push({ y: hero.y, draw: () => drawHero(now) });
    items.sort((a, b) => a.y - b.y).forEach(i => i.draw());
    drawPenGhost();
    if (!quiet && !G.weather.night) {
      for (let i = 0; i < 3; i++) {
        const x = Math.round(150 + i * 120 + Math.sin(now / 520 + i * 2) * 14), y = 150 + i * 40 + Math.round(Math.sin(now / 370 + i) * 5);
        const c = ['#f77da7', '#ffe26d', '#a4c8ff'][i], flap = Math.floor(now / 150 + i) % 2;
        rect(x - 3, y, 3, 1, c); rect(x + 1, y - flap, 3, 1, c); rect(x, y, 2, 1, '#72543a');
      }
    }
    if (G.weather.night) {
      rect(0, 0, W, H, 'rgba(14,30,72,.46)');
      for (const l of lights) {
        if (l.lamp || l.fire) { const gr = cx.createRadialGradient(l.x + l.w / 2, l.y + l.h / 2, 2, l.x + l.w / 2, l.y + l.h / 2, 34); gr.addColorStop(0, 'rgba(255,224,150,.42)'); gr.addColorStop(1, 'rgba(255,224,150,0)'); cx.fillStyle = gr; cx.fillRect(l.x - 40, l.y - 40, 90, 90); }
        rect(l.x, l.y, l.w, l.h, l.lamp ? '#ffe9a8' : 'rgba(255,214,120,.82)');
      }
      G.decor.filter(d => d.item === 'lantern').forEach(d => { const lx = GX + d.x * T + 22, ly = GY + d.y * T + 12, gr = cx.createRadialGradient(lx, ly, 2, lx, ly, 36); gr.addColorStop(0, 'rgba(255,231,165,.5)'); gr.addColorStop(1, 'rgba(255,231,165,0)'); cx.fillStyle = gr; cx.fillRect(lx - 40, ly - 40, 80, 80); });
      if (!quiet) for (let i = 0; i < 16; i++) { const fx = 40 + (i * 97) % (W - 80) + Math.sin(now / 900 + i) * 12, fy = 60 + (i * 53) % (H - 120) + Math.cos(now / 1100 + i * 2) * 10, a = .4 + .6 * Math.abs(Math.sin(now / 500 + i)); rect(fx, fy, 2, 2, 'rgba(230,255,140,' + a.toFixed(2) + ')'); rect(fx - 1, fy - 1, 4, 4, 'rgba(230,255,140,' + (a * .22).toFixed(2) + ')'); }
    }
    if (G.weather.rain && !quiet) for (let i = 0; i < 40; i++) { const y = ((now / 22 + i * 59) % H), x = (i * 83) % W; rect(x, y, 1, 5, 'rgba(216,240,233,.65)'); }
    effects = effects.filter(e => now - e.born < 900);
    effects.forEach(e => { const t = (now - e.born) / 900; for (let i = 0; i < 5; i++) rect(e.x + Math.cos(i * 1.3) * t * 17, e.y - t * 20 + Math.sin(i * 1.3) * 7, 2, 2, e.color); });
  }
  // ---------- ферма: животные и загоны ----------
  const SPECIES_KEYS = ['chicken', 'sheep', 'pig', 'cow'];
  const PRODUCT_KEYS = ['egg', 'milk', 'wool', 'meat'];
  const PEN_W = 76, PEN_H = 70, PEN_BOUNDS = [34, 30, 466, 288];
  const penSlot = pen => [pen.x, pen.y];
  const rectsHit = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  // Те же правила, что на сервере: сервер всё равно проверяет заново.
  function penSpotError(x, y, exceptId) {
    const [x0, y0, x1, y1] = PEN_BOUNDS;
    if (x < x0 || x > x1 || y < y0 || y > y1) return 'Здесь загон не поместится: слишком близко к лесу.';
    const r = [x, y, PEN_W, PEN_H], blocked = [[0, 0, 160, 112]];
    if (G.upgrades.includes('well')) blocked.push([78, 118, 42, 42]);
    if (G.upgrades.includes('sprinkler')) blocked.push([84, 164, 42, 42]);
    if (blocked.some(b => rectsHit(r, b))) return 'Это место занято домом или постройкой.';
    if (G.pens.some(p => p.id !== exceptId && rectsHit(r, [p.x, p.y, PEN_W, PEN_H]))) return 'Тут уже стоит другой загон.';
    if (G.beds.some(b => rectsHit(r, [GX + b.x * T, GY + b.y * T, T, T]))) return 'Загон не должен стоять на грядках.';
    if (G.decor.some(d => rectsHit(r, [GX + d.x * T, GY + d.y * T, T, T]))) return 'Загон не должен стоять на украшениях.';
    return null;
  }
  let penGhost = null;
  function drawPenGhost() {
    if (!penGhost || !mode || !String(mode.type).startsWith('pen')) return;
    const ok = !penGhost.err, L = penLayers(), edge = ok ? '#c8ffd8' : '#ffd0d0';
    cx.save(); cx.globalAlpha = .72; cx.drawImage(L.back, penGhost.x, penGhost.y); cx.drawImage(L.front, penGhost.x, penGhost.y); cx.restore();
    cx.save(); cx.globalAlpha = .38; rect(penGhost.x, penGhost.y, PEN_W, PEN_H, ok ? '#3cff7a' : '#ff4a4a'); cx.restore();
    rect(penGhost.x, penGhost.y, PEN_W, 1, edge); rect(penGhost.x, penGhost.y + PEN_H - 1, PEN_W, 1, edge); rect(penGhost.x, penGhost.y, 1, PEN_H, edge); rect(penGhost.x + PEN_W - 1, penGhost.y, 1, PEN_H, edge);
  }
  const penOf = id => G?.pens.find(p => p.id === id);
  const penAnimals = id => (G?.animals || []).filter(a => a.pen === id);
  const penSpecies = id => penAnimals(id)[0]?.species || null;
  const SPECIES_OF_PRODUCT = { egg: 'chicken', milk: 'cow', wool: 'sheep', meat: 'pig' };

  // Рисует зверя боком, ox/oy: центр и линия земли. o: f (±1 направление), s (шаг 0/1), peck.
  function drawAnimal(sp, ox, oy, o = {}) {
    const f = o.f < 0 ? -1 : 1, s = o.s ? 1 : 0;
    const R = (dx, dy, w, h, c) => rect(f > 0 ? ox + dx : ox - dx - w + 1, oy + dy, w, h, c);
    const E = (dx, dy, rx, ry, c) => ellipse(ox + f * dx, oy + dy, rx, ry, c);
    E(0, 0, sp === 'chicken' ? 6 : 11, 2, 'rgba(20,44,18,.3)');
    if (sp === 'cow') {
      const W0 = '#f4efe6', W1 = '#d9d1c3', K = '#2b2622';
      R(-8, -5 - s, 2, 5, W1); R(-5, -5, 2, 5, W0); R(4, -5, 2, 5, W1); R(7, -5 - s, 2, 5, W0);
      for (const x of [-8, -5, 4, 7]) R(x, -1, 2, 1, K);
      R(-12, -13, 1, 6, W1); R(-13, -7, 3, 2, K);
      E(0, -9, 10, 6, W0); E(0, -5, 9, 2, W1); E(-2, -13, 6, 1, '#fffdf7');
      E(-4, -10, 3, 2, K); E(3, -7, 3, 2, K); E(-8, -8, 2, 2, K);
      E(-3, -3, 2, 1, '#f0a0a8');
      E(10, -10, 3, 4, W0); E(14, -9, 4, 4, W0); E(16, -7, 3, 2, '#f2b0b0'); R(17, -8, 1, 1, '#b0707a'); R(15, -11, 1, 1, '#1a1612');
      R(11, -13, 3, 2, W1); R(12, -12, 1, 1, '#f2b0b0'); R(13, -15, 1, 2, '#efe0a8'); R(11, -12, 2, 2, K);
    } else if (sp === 'sheep') {
      const WL = '#f4f0e8', WS = '#cfc8ba', K = '#3b3430';
      R(-5, -4 - s, 2, 4, K); R(-2, -4, 2, 4, K); R(3, -4, 2, 4, K); R(6, -4 - s, 2, 4, K);
      E(0, -9, 8, 6, WL); E(-5, -10, 4, 4, WL); E(5, -10, 4, 4, WL); E(0, -13, 5, 3, WL);
      E(0, -6, 7, 2, WS); E(-4, -6, 3, 1, WS); E(-2, -13, 3, 1, '#ffffff'); E(4, -12, 2, 1, '#ffffff');
      E(10, -9, 3, 3, K); E(12, -8, 2, 2, '#58504a'); R(7, -10, 2, 1, '#2a2420'); R(11, -10, 1, 1, '#f4f0e8'); E(9, -12, 3, 2, WL);
    } else if (sp === 'pig') {
      const P0 = '#f6b8b0', P1 = '#d98c88', P2 = '#e58a8c';
      R(-6, -3 - s, 2, 3, P1); R(-3, -3, 2, 3, P0); R(3, -3, 2, 3, P1); R(6, -3 - s, 2, 3, P0);
      R(-8, -8, 2, 1, P1); R(-9, -9, 1, 2, P1); R(-10, -10, 2, 1, P1);
      E(0, -7, 9, 5, P0); E(0, -4, 8, 2, P1); E(-2, -10, 5, 1, '#ffd9d3');
      E(10, -8, 4, 4, P0); R(13, -7, 3, 3, P2); R(14, -6, 1, 1, '#8a4048'); R(15, -6, 1, 1, '#8a4048'); R(8, -12, 3, 2, P2); R(11, -9, 1, 1, '#1a1612');
    } else {
      const c = o.peck ? 2 : 0;
      R(-5, -10, 2, 3, '#ece4d2'); R(-6, -11, 1, 3, '#d7ceb8');
      E(0, -5, 5, 4, '#fbf7ee'); E(0, -3, 4, 2, '#ded6c4'); E(-1, -5, 3, 2, '#e9e1cf'); R(-3, -8, 4, 1, '#ffffff');
      E(5, -9 + c, 2, 2, '#fbf7ee'); R(4, -12 + c, 3, 2, '#e0403a'); R(5, -13 + c, 1, 1, '#e0403a'); R(7, -9 + c, 2, 1, '#f0a530'); R(7, -8 + c, 1, 2, '#e0403a'); R(6, -10 + c, 1, 1, '#1a1612');
      R(-1, -1 - s, 1, 1, '#e09a2a'); R(1, -1, 1, 1, '#e09a2a');
    }
  }

  // Пузырёк над зверем: корм или готовая продукция.
  function badge(x, y, kind, now) {
    y += Math.round(Math.sin(now / 260 + x) * 1.2);
    rect(x - 7, y - 7, 14, 13, '#2a3a5a'); rect(x - 6, y - 6, 12, 11, '#fff'); rect(x - 2, y + 6, 4, 2, '#2a3a5a'); rect(x - 1, y + 5, 2, 2, '#fff');
    if (kind === 'feed') { rect(x - 1, y - 4, 2, 8, '#c98a20'); [[-3, -3], [2, -3], [-3, 0], [2, 0]].forEach(([dx, dy]) => rect(x + dx, y + dy, 2, 2, '#f2c230')); rect(x - 1, y - 5, 2, 2, '#f2c230'); }
    else if (kind === 'egg') { ellipse(x, y, 3, 4, '#c9b896'); ellipse(x, y, 2, 3, '#fff6e6'); rect(x - 1, y - 2, 1, 1, '#fff'); }
    else if (kind === 'milk') { rect(x - 3, y - 2, 6, 7, '#7aa8d0'); rect(x - 2, y - 1, 4, 5, '#f4fbff'); rect(x - 2, y - 4, 4, 2, '#7aa8d0'); }
    else if (kind === 'wool') { ellipse(x, y, 4, 4, '#a8a090'); ellipse(x, y, 3, 3, '#f4f0e8'); rect(x - 2, y - 1, 5, 1, '#cfc8ba'); rect(x - 1, y + 1, 4, 1, '#cfc8ba'); }
    else if (kind === 'meat') { ellipse(x - 1, y, 3, 3, '#7a2e24'); ellipse(x - 1, y, 2, 2, '#e0705a'); rect(x + 2, y - 2, 3, 2, '#f1e6c8'); rect(x + 4, y - 3, 1, 4, '#f1e6c8'); }
  }

  // Загон: два слоя (задний и передний забор), кэшируются.
  const penCache = {};
  function penLayers() {
    if (penCache.back) return penCache;
    const mk = () => { const c = document.createElement('canvas'); c.width = PEN_W; c.height = PEN_H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
    const [back, bg2] = mk(), [front, fg] = mk();
    withCtx(bg2, () => {
      for (let y = 12; y < 62; y++) for (let x = 3; x < PEN_W - 3; x++) {
        const v = .45 + (noise2(x, y, 5, 4) - .5) * .5 - Math.abs(x - PEN_W / 2) / PEN_W * .12;
        rect(x, y, 1, 1, dither(x, y, v, ['#6b4a2a', '#7e5a34', '#91693f', '#a67b4a', '#bf9a5c', '#d4b270']));
      }
      for (let i = 0; i < 46; i++) { const x = 5 + Math.floor(rnd(i, 7) * (PEN_W - 14)), y = 14 + Math.floor(rnd(i, 8) * 44); rect(x, y, 3, 1, rnd(i, 9) < .5 ? '#e6cf86' : '#c9a85a'); if (rnd(i, 10) < .4) rect(x + 1, y + 1, 2, 1, '#e6cf86'); }
      // задний забор
      board(2, 8, PEN_W - 4, 3, 71); board(2, 14, PEN_W - 4, 3, 72);
      for (let x = 2, i = 0; x <= PEN_W - 8; x += 15, i++) { board(x, 3, 5, 18, 80 + i, true); rect(x + 1, 4, 1, 1, '#d8d8d8'); }
      // боковые рейки
      board(2, 18, 3, 44, 91, true); board(PEN_W - 5, 18, 3, 44, 92, true);
      // кормушка и сено
      plank(10, 20, 20, 8, W6); rect(11, 22, 18, 3, '#3a2414'); rect(11, 21, 18, 1, W6[5]);
      plank(PEN_W - 24, 20, 16, 11, [W6[0], W6[1], W6[3], W6[5], W6[5]]); for (let j = 0; j < 4; j++) rect(PEN_W - 23, 22 + j * 2, 14, 1, '#b98f3a'); rect(PEN_W - 23, 21, 14, 1, '#e8cf7a');
    });
    withCtx(fg, () => {
      const gate0 = 30, gate1 = 46;
      rect(3, 67, PEN_W - 6, 2, 'rgba(12,34,12,.3)');
      board(2, 56, gate0 - 2, 3, 73); board(2, 62, gate0 - 2, 3, 74); board(gate1, 56, PEN_W - gate1 - 2, 3, 75); board(gate1, 62, PEN_W - gate1 - 2, 3, 76);
      for (const x of [2, 15, gate0 - 4, gate1, 59, PEN_W - 8]) board(x, 52, 5, 17, 100 + x, true);
      board(gate0 - 4, 49, 5, 3, 1); board(gate1, 49, 5, 3, 2);
    });
    penCache.back = back; penCache.front = front; return penCache;
  }

  const penState = {};
  function stepAnimals(list, now) {
    list.forEach((a, i) => {
      const hx = 24 + (i % 2) * 28, hy = 31 + Math.floor(i / 2) * 19;
      let s = penState[a.id];
      if (!s) { s = penState[a.id] = { x: hx, y: hy, tx: hx, ty: hy, wait: rnd(a.id, 3) * 2000, f: rnd(a.id, 4) < .5 ? -1 : 1, t: now }; }
      const dt = Math.min(100, now - s.t); s.t = now;
      if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) { s.tx = hx + (Math.random() - .5) * 8; s.ty = hy + (Math.random() - .5) * 6; } s.moving = false; return; }
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), v = (a.fed || a.ready ? 9 : 5) * dt / 1000;
      if (d < 1.2) { s.wait = 1500 + Math.random() * 4000; s.moving = false; return; }
      s.x += dx / d * Math.min(v, d); s.y += dy / d * Math.min(v, d); if (Math.abs(dx) > 1) s.f = dx > 0 ? 1 : -1; s.moving = true;
    });
  }
  function drawPen(pen, now, quiet) {
    const [sx, sy] = penSlot(pen), L = penLayers(), list = penAnimals(pen.id).slice().sort((a, b) => a.id - b.id);
    cx.drawImage(L.back, sx, sy);
    stepAnimals(list, now);
    // зерно в кормушке, пока кто-то сыт
    if (list.some(a => a.fed)) { for (let i = 0; i < 9; i++) rect(sx + 12 + i * 2, sy + 22, 2, 2, i % 2 ? '#f2c230' : '#d6a020'); }
    const sorted = list.map(a => ({ a, s: penState[a.id] })).sort((p, q) => p.s.y - q.s.y);
    for (const { a, s } of sorted) {
      const step = s.moving && Math.floor(now / 220) % 2, peck = a.species === 'chicken' && !s.moving && Math.floor(now / 450 + a.id) % 3 === 0;
      drawAnimal(a.species, sx + s.x, sy + s.y, { f: s.f, s: step, peck });
    }
    cx.drawImage(L.front, sx, sy);
    // табличка на воротах
    rect(sx + PEN_W / 2 - 7, sy + 46, 14, 8, W6[0]); rect(sx + PEN_W / 2 - 6, sy + 47, 12, 6, W6[5]);
    const sp = list[0]?.species;
    if (sp) { const kinds = { chicken: '#f4efe2', sheep: '#cfc8ba', pig: '#f2a9a3', cow: '#2b2622' }; ellipse(sx + PEN_W / 2, sy + 50, 3, 2, kinds[sp]); }
    for (const { a, s } of sorted) {
      if (a.ready) badge(Math.round(sx + s.x), Math.round(sy + s.y - 24), SPECIES_PRODUCT(a.species), now);
      else if (a.hungry && !quiet) badge(Math.round(sx + s.x), Math.round(sy + s.y - (a.species === 'chicken' ? 20 : 24)), 'feed', now);
    }
  }
  const SPECIES_PRODUCT = sp => ({ chicken: 'egg', sheep: 'wool', pig: 'meat', cow: 'milk' })[sp];

  function drawFarmIcon(type) {
    const e = ellipse;
    if (type === 'egg') { shadow(14, 25, 9, 2); e(10, 19, 6, 7, '#6b5a40'); e(10, 19, 5, 6, '#e8d2a8'); e(9, 17, 1, 2, '#fff3d8'); e(18, 17, 7, 8, '#6b5a40'); e(18, 17, 6, 7, '#fbf6ea'); e(16, 14, 1, 2, '#fff'); e(18, 20, 4, 3, '#e3d8c2'); return; }
    if (type === 'milk') { shadow(14, 26, 8, 2); rect(8, 10, 12, 16, '#27506f'); rect(9, 11, 10, 14, '#eef7fc'); rect(9, 15, 10, 10, '#ffffff'); rect(10, 12, 2, 12, '#cfe6f4'); rect(11, 5, 6, 6, '#27506f'); rect(12, 6, 4, 5, '#dcecf7'); rect(10, 3, 8, 3, '#27506f'); rect(11, 4, 6, 1, '#6aa4d4'); rect(15, 17, 3, 6, '#dfeaf3'); return; }
    if (type === 'wool') { shadow(14, 26, 10, 2); e(14, 16, 11, 10, '#6d665a'); e(14, 16, 10, 9, '#f4f0e8'); e(11, 12, 5, 4, '#ffffff'); for (let i = 0; i < 5; i++) { rect(7 + i * 2, 15 + i, 12, 1, '#d8d1c2'); } rect(19, 22, 6, 1, '#cfc8ba'); rect(24, 22, 1, 3, '#cfc8ba'); e(15, 21, 6, 3, '#cfc8ba'); return; }
    if (type === 'meat') { shadow(14, 26, 10, 2); rect(21, 9, 5, 4, '#f1e6c8'); rect(24, 8, 3, 3, '#fff3d6'); rect(24, 12, 3, 3, '#e0d4b4'); e(13, 16, 10, 9, '#5e1f18'); e(13, 16, 9, 8, '#c9573f'); e(11, 13, 5, 4, '#e8806a'); e(15, 19, 5, 3, '#9a3c2c'); rect(10, 11, 3, 1, '#f5ae9a'); return; }
    if (type === 'feed') { shadow(14, 26, 10, 2); rect(7, 12, 15, 14, '#4a3418'); rect(8, 13, 13, 12, '#a98048'); rect(8, 13, 4, 12, '#c9a46a'); rect(8, 17, 13, 1, '#7a5a30'); rect(8, 22, 13, 1, '#7a5a30'); rect(9, 10, 11, 4, '#4a3418'); rect(10, 11, 9, 2, '#dcbf8a');
      rect(15, 3, 2, 10, '#c98a20'); [[13, 4], [18, 4], [13, 7], [18, 7]].forEach(([x, y]) => { rect(x, y, 2, 2, '#f2c230'); }); rect(15, 1, 2, 3, '#f2c230'); rect(23, 15, 2, 8, '#c98a20'); rect(22, 14, 2, 2, '#f2c230'); rect(25, 16, 2, 2, '#f2c230'); return; }
    if (type === 'pen') { shadow(14, 26, 12, 2); rect(3, 18, 22, 7, '#a67b4a'); rect(4, 19, 20, 5, '#d4b270'); [4, 12, 21].forEach(x => plank(x, 7, 4, 17, WOOD)); plank(3, 10, 22, 3, WOOD); plank(3, 16, 22, 3, WOOD); rect(8, 21, 3, 1, '#e6cf86'); rect(16, 22, 3, 1, '#e6cf86'); return; }
    // зверьки
    const k = type === 'chicken' ? 2 : 1, t = document.createElement('canvas'); t.width = type === 'chicken' ? 14 : 30; t.height = type === 'chicken' ? 14 : 28; const tg = t.getContext('2d'); tg.imageSmoothingEnabled = false;
    withCtx(tg, () => drawAnimal(type, type === 'chicken' ? 6 : 12, type === 'chicken' ? 13 : 26, { f: 1 }));
    cx.drawImage(t, 0, 0, t.width * k, t.height * k);
  }
  function animate(now) {
    if (!opened || document.hidden) return;
    if (now - lastFrame >= 40) { const dt = Math.min(150, now - (lastFrame || now)); lastFrame = now; const factor = Math.min(1, dt / 220); hero.x += (hero.tx - hero.x) * factor; hero.y += (hero.ty - hero.y) * factor; draw(now); }
    follow(now);
    animation = requestAnimationFrame(animate);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
