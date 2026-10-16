/* Независимый экран сада. Все цены, рост и покупки подтверждает сервер. */
(() => {
  'use strict';
  const W = 576, H = 384, T = 42, GX = 124, GY = 92;
  const q = id => document.getElementById(id);
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let root, G = null, selected = { x: 0, y: 0 }, opened = false, busy = false, sheet = null, shopTab = 'seed', zoom = 1;
  let timer, refreshBusy = false, pending = null, mode = null, messageTimer, confirmResolve, lastFocus;
  let hero = { x: 345, y: 178, tx: 345, ty: 178 }, effects = [], lastFrame = 0, animation, canvas, cx, scale = 1;
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
  function stone(x, y, w = 6, h = 4) {
    rect(x + 1, y, w - 2, 1, STONE[0]); rect(x, y + 1, w, h - 2, STONE[0]); rect(x + 1, y + h - 1, w - 2, 1, STONE[0]);
    rect(x + 1, y + 1, w - 2, h - 2, STONE[2]); rect(x + 1, y + 1, w - 3, 1, STONE[3]); rect(x + 1, y + h - 2, w - 2, 1, STONE[1]);
  }
  // Листва: свет сверху слева, упорядоченный дизеринг между оттенками, тёмный низ и светлые листочки.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
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
        if (f - i > (BAYER[(wy & 3) * 4 + (wx & 3)] + .5) / 16) i++;
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
    q('g-plus').addEventListener('click', () => { zoom = Math.min(2, zoom + .25); size(); });
    q('g-minus').addEventListener('click', () => { zoom = Math.max(.75, zoom - .25); size(); });
    q('g-sheet-close').addEventListener('click', closeSheet);
    q('g-sheet').addEventListener('click', e => { if (e.target === q('g-sheet')) closeSheet(); });
    q('g-confirm-no').addEventListener('click', () => finishConfirm(false));
    q('g-confirm-yes').addEventListener('click', () => finishConfirm(true));
    q('g-world').addEventListener('click', e => { if (!G || e.target.closest('.g-cell')) return; const box = q('g-world').getBoundingClientRect(); hero.tx = Math.max(40, Math.min(W - 40, (e.clientX - box.left) / scale)); hero.ty = Math.max(70, Math.min(H - 26, (e.clientY - box.top) / scale)); });
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
    G = null; pending = null; mode = null; sheet = null; centered = false; renderCare(); size();
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
      bridge()?.sound(r.ok ? (['buy', 'expand'].includes(payload.action) ? 'buy' : ['sell', 'sell_all'].includes(payload.action) ? 'coin' : 'ok') : 'no');
      if (r.ok) { bridge()?.haptic('ok'); effects.push({ x: GX + selected.x * T + T / 2, y: GY + selected.y * T, born: performance.now(), color: '#f8e6a0' }); }
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
  function closeSheet() { sheet = null; q('g-sheet').hidden = true; renderNav(); }
  function openSheet(type) { if (!G) return; sheet = type; q('g-sheet').hidden = false; renderSheet(); renderNav(); q('g-sheet-close').focus(); }
  function render() { if (!opened || !G) return; q('g-wallet').textContent = '🪙 ' + fmt(G.coins); q('g-weather').textContent = (G.weather.night ? '☾ ' : G.weather.rain ? '☂ ' : '☀ ') + G.weather.name + (G.auto_water ? ' · автополив' : ''); q('g-area').textContent = G.area.cols + ' × ' + G.area.rows + ' · общий сад'; renderCare(); renderNav(); renderHits(); if (sheet) renderSheet(); size(); }
  function renderNav() {
    const nav = q('g-nav'); if (!nav) return; nav.textContent = '';
    [['garden', 'Наш сад', 'flowers'], ['shop', 'Лавка', 'coin'], ['basket', 'Урожай', 'harvest'], ['land', 'Участок', 'expand']].forEach(([id, label, type]) => {
      const b = node('button', id === (sheet || 'garden') ? 'on' : '', label); b.type = 'button'; b.prepend(icon(type));
      if (id === 'basket' && G) { const count = Object.values(G.harvest).reduce((a, n) => a + n, 0); if (count) b.appendChild(node('span', 'g-badge', fmt(count))); }
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
  }
  function select(x, y) {
    if (!G || busy || pending) return;
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
    const b = bedAt(selected.x, selected.y), d = decorAt(selected.x, selected.y);
    if (mode) { title = 'Выберите свободную клетку'; detail = mode.type === 'move' ? 'Растение переедет вместе с грядкой.' : 'Украшение займёт одну клетку.'; actions.appendChild(button('Отмена', () => { mode = null; renderCare(); })); }
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
      actions.appendChild(button('Лавка', () => openSheet('shop')));
    }
    text.prepend(node('small', null, detail)); text.prepend(node('b', null, title));
    head.appendChild(icon(type, color, b?.crop ? b.stage : 3)); head.appendChild(text); box.appendChild(head); box.appendChild(actions);
    if (pending) { const retry = node('button', 'g-btn primary', 'Повторить последний запрос'); retry.type = 'button'; retry.addEventListener('click', () => act('', {}, true)); box.appendChild(retry); }
  }
  function itemRow(title, desc, type, color, buttons = []) {
    const row = node('div', 'g-row'); row.appendChild(icon(type, color)); const body = node('div', 'g-row-text'); body.appendChild(node('b', null, title)); body.appendChild(node('small', null, desc)); row.appendChild(body); buttons.forEach(b => row.appendChild(b)); return row;
  }
  function renderSheet() {
    if (!sheet || !G) return;
    const body = q('g-sheet-body'), tabs = q('g-tabs'), oldScroll = body.scrollTop;
    body.textContent = ''; tabs.textContent = ''; tabs.hidden = true;
    const titles = { welcome: 'Добро пожаловать', shop: 'Садовая лавка', seeds: 'Что посадим?', basket: 'Корзина урожая', land: 'Ваш участок', decor: 'Украшения из кладовой' };
    q('g-sheet-title').textContent = titles[sheet] || 'Наш двор';
    if (sheet === 'welcome') {
      const intro = node('div', 'g-intro'); intro.appendChild(node('h3', null, 'Сад без спешки'));
      intro.appendChild(node('div', null, 'Две грядки, 12 семян, два компоста и скамейка уже ваши. Сажайте, поливайте и собирайте урожай вместе.'));
      body.appendChild(intro); body.appendChild(node('p', 'g-note', 'Один полив действует 36 часов. Растения не погибают: когда почва высохнет, рост просто остановится. Готовый урожай не портится. Уход не тратит энергию питомца, садом можно заниматься, пока он спит.'));
      body.appendChild(button('Посадить первые семена', () => { selected = { x: 0, y: 0 }; openSheet('seeds'); }, 'primary'));
      body.appendChild(button('Просто посмотреть', closeSheet));
    } else if (sheet === 'shop') {
      tabs.hidden = false;
      [['seed', 'Семена'], ['supply', 'Для сада'], ['decor', 'Украшения']].forEach(([id, title]) => { const b = node('button', shopTab === id ? 'on' : '', title); b.type = 'button'; b.addEventListener('click', () => { shopTab = id; body.scrollTop = 0; renderSheet(); }); tabs.appendChild(b); });
      const table = G.catalog[shopTab === 'seed' ? 'crops' : shopTab === 'decor' ? 'decor' : 'supplies'];
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
      else body.appendChild(node('p', 'g-note', 'Корзина пока пуста. После сбора урожай хранится здесь сколько угодно.'));
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
    const stage = q('g-stage'), width = Math.max(stage.clientWidth, Math.min(stage.clientHeight * 1.5, stage.clientWidth * 1.8)) * zoom;
    const world = q('g-world'); world.style.width = width + 'px'; world.style.height = (width / W * H) + 'px'; world.style.marginTop = Math.max(0, (stage.clientHeight - width / W * H) / 2) + 'px'; scale = width / W;
    if (G && !centered) { centered = true; q('g-scroll').scrollLeft = Math.max(0, (GX + G.area.cols * T / 2) * scale - stage.clientWidth / 2); q('g-scroll').scrollTop = Math.max(0, (GY + G.area.rows * T / 2) * scale - stage.clientHeight / 2); }
  }
  // ---------- сцена: уютная полянка в солнечном лесу ----------
  const waterSpots = [], lights = [], smokeAt = [];
  const WATER = ['#0f4f69', '#16698a', '#1f80a6', '#2c97bd', '#45b0cf', '#72cfe1', '#b4edf5'];
  const W6 = ['#2e1a0e', '#5a3820', '#7e5230', '#a06c3c', '#c58f55', '#e6b87a'];
  const GRASS = ['#35691f', '#44801f', '#549425', '#66a82d', '#79ba35', '#8ecb3f', '#a6dc55'];
  const spriteCache = {};
  const sprImg = type => {
    if (!spriteCache[type]) { const c = document.createElement('canvas'); c.width = c.height = 28; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; sprite(g, type); spriteCache[type] = c; }
    return spriteCache[type];
  };
  const art42 = type => {
    const k = '42' + type;
    if (!spriteCache[k]) { const c = document.createElement('canvas'); c.width = c.height = 42; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; withCtx(g, () => decorArt(type)); spriteCache[k] = c; }
    return spriteCache[k];
  };
  const inGrid = (x, y, m = 6) => x > GX - m && x < GX + 8 * T + m && y > GY - m && y < GY + 6 * T + m;
  const BLOOM = ['#fff6e6', '#f27a9f', '#ffd84a', '#b08be0', '#ff9a52', '#ffffff', '#e8524a', '#7fb6ff'];

  // ---- мелкие детали ----
  function dither(x, y, v, pal) { const n = pal.length - 1, f = Math.max(0, Math.min(1, v)) * (n - .001); let i = Math.floor(f); if (f - i > (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16) i++; return pal[Math.min(n, i)]; }
  function grain(x, y, w, h, seed, c1, c2, vertical = false) {
    if (vertical) { for (let i = 0; i < w * 1.2; i++) { const gx = x + Math.floor(rnd(seed, i) * w), gy = y + Math.floor(rnd(seed, i + 40) * h), len = 2 + Math.floor(rnd(seed, i + 80) * 6); rect(gx, gy, 1, Math.min(len, y + h - gy), rnd(seed, i + 120) < .5 ? c1 : c2); } }
    else for (let i = 0; i < h * 1.3; i++) { const gx = x + Math.floor(rnd(seed, i) * w), gy = y + Math.floor(rnd(seed, i + 40) * h), len = 2 + Math.floor(rnd(seed, i + 80) * 7); rect(gx, gy, Math.min(len, x + w - gx), 1, rnd(seed, i + 120) < .5 ? c1 : c2); }
  }
  function board(x, y, w, h, seed = 0, vertical = false) {
    rect(x, y, w, h, W6[0]); rect(x + 1, y + 1, w - 2, h - 2, W6[3]);
    grain(x + 1, y + 1, w - 2, h - 2, seed + x * 3 + y, W6[2], W6[4], vertical);
    rect(x + 1, y + 1, w - 2, 1, W6[5]); rect(x + 1, y + 1, 1, h - 2, W6[4]); rect(x + 1, y + h - 2, w - 2, 1, W6[2]); rect(x + w - 2, y + 1, 1, h - 2, W6[2]);
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
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = .56 + (noise2(x, y, 90, 1) - .5) * .5 + (noise2(x, y, 28, 2) - .5) * .3 + (noise2(x, y, 9, 3) - .5) * .12;
      v += (.5 - (x / W * .45 + y / H * .55)) * .2 - .07;
      const e = Math.min(x, W - 1 - x, y, H - 1 - y); v -= Math.pow(Math.max(0, (56 - e) / 56), 1.4) * .5;
      v += Math.max(0, 1 - Math.hypot((x - 300) / 190, (y - 150) / 120)) * .14;
      const hx = dither(x, y, v, GRASS), n = parseInt(hx.slice(1), 16), o = (y * W + x) * 4;
      d[o] = n >> 16; d[o + 1] = (n >> 8) & 255; d[o + 2] = n & 255; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  function meadow() {
    for (let i = 0; i < 520; i++) {
      const x = Math.floor(rnd(i, 11) * W), y = Math.floor(rnd(i, 12) * H), k = rnd(i, 13), col = k < .4 ? GRASS[1] : k < .75 ? GRASS[5] : GRASS[6];
      rect(x, y, 1, 2, col); if (k < .5) rect(x + 2, y - 1, 1, 2, col); if (k > .85) rect(x - 2, y, 1, 2, GRASS[2]);
    }
    for (let i = 0; i < 120; i++) { const x = Math.floor(rnd(i, 21) * W), y = Math.floor(rnd(i, 22) * H); if (inGrid(x, y, 0) && rnd(i, 23) < .7) continue; tuft(x, y); }
    for (let i = 0; i < 26; i++) clover(Math.floor(rnd(i, 24) * W), Math.floor(rnd(i, 25) * H));
    // россыпи цветов: пятнами, как на настоящей поляне
    for (let k = 0; k < 24; k++) {
      const cxp = rnd(k, 31) * W, cyp = rnd(k, 32) * H; if (inGrid(cxp, cyp, 10)) continue;
      const kind = Math.floor(rnd(k, 33) * 4), n = 3 + Math.floor(rnd(k, 34) * 5);
      for (let i = 0; i < n; i++) {
        const x = Math.round(cxp + (rnd(k, 40 + i) - .5) * 26), y = Math.round(cyp + (rnd(k, 60 + i) - .5) * 16); if (inGrid(x, y, 2)) continue;
        if (kind === 0) daisy(x, y); else if (kind === 1) flower(x, y, '#ffd84a'); else if (kind === 2) flower(x, y, BLOOM[1 + Math.floor(rnd(k, 80 + i) * 4)]); else { rect(x, y, 2, 2, '#fff'); rect(x, y, 1, 1, '#e8f0ff'); }
      }
    }
    for (let i = 0; i < 44; i++) { const x = Math.floor(rnd(i, 91) * W), y = Math.floor(rnd(i, 92) * H); if (inGrid(x, y, 4)) continue; const c = ['#c97a2a', '#e0a23a', '#a85a1f'][i % 3]; rect(x, y, 2, 1, c); rect(x + 1, y + 1, 1, 1, shade(c, -.3)); }
  }
  function treeRing() {
    const put = (x, y, s, r0 = 17) => { const r = r0 + rnd(s, 3) * 6; blob(x + (rnd(s, 1) - .5) * 8, y + (rnd(s, 2) - .5) * 8, r, r * .9, CANOPY, s * 3); };
    for (let x = -8, i = 0; x < W + 24; x += 20, i++) { if (x > 246 && x < 482) continue; put(x, 2, 100 + i, 19); }
    for (let y = 56, i = 0; y < H + 24; y += 19, i++) { put(5, y, 300 + i, 19); put(W - 5, y, 500 + i, 19); }
    for (let x = -8, i = 0; x < W + 24; x += 20, i++) { if (x > 448 && x < 560) continue; put(x, H - 2, 700 + i, 19); }
    for (let x = -4, i = 0; x < W + 24; x += 20, i++) { if (x < 246 || x > 482) put(x + 10, 15, 150 + i, 16); if (x < 448 || x > 560) put(x + 10, H - 16, 750 + i, 16); }
    for (let y = 65, i = 0; y < H; y += 19, i++) { put(19, y, 350 + i, 15); put(W - 19, y, 550 + i, 15); }
  }

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
          let k = (rnd(r * 13 + i, y) - .5) * .22 + (tx < mid ? .12 : -.08);
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
    rect(44, 44, 88, 52, W6[0]); rect(45, 45, 86, 50, '#ead6a6');
    for (let i = 0; i < 70; i++) rect(46 + rnd(i, 1) * 84, 48 + rnd(i, 2) * 34, 1 + (i % 3), 1, i % 2 ? '#d8bf8c' : '#f6e6bb');
    for (let y = 47; y < 84; y += 6) rect(46, y, 84, 1, 'rgba(160,130,80,.12)');
    rect(45, 45, 86, 3, W6[2]); rect(45, 66, 86, 2, W6[2]); [45, 72, 100, 129].forEach((x, i) => { rect(x, 45, 3, 48, W6[2]); rect(x, 45, 1, 48, W6[4]); grain(x, 45, 3, 48, 200 + i, W6[1], W6[3], true); });
    rect(46, 48, 84, 1, 'rgba(60,35,15,.25)');
    rect(45, 84, 86, 11, STONE[0]); for (let x = 46; x < 130; x += 7) for (let y = 85; y < 95; y += 5) { const w = 6 + Math.floor(rnd(x, y) * 2); rect(x + (y % 2 ? 3 : 0), y, w, 4, STONE[2]); rect(x + (y % 2 ? 3 : 0), y, w, 1, STONE[3]); rect(x + (y % 2 ? 3 : 0), y + 3, w, 1, STONE[1]); }
    for (let x = 46; x < 130; x += 5) if (rnd(x, 3) < .5) rect(x, 93, 3, 2, '#5e9a3a');
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
    rect(64, -2, 20, 22, W6[0]); rect(65, -2, 18, 22, '#b3a994'); rect(65, -2, 4, 22, '#d9d1bc'); rect(80, -2, 3, 22, '#8b8470');
    for (let y = 2; y < 18; y += 5) { rect(65, y, 18, 1, '#8b8470'); rect(69 + (y % 2) * 5, y + 1, 1, 4, '#8b8470'); } rect(62, -2, 24, 4, '#6a655a'); rect(63, -2, 22, 1, '#a49c88'); rect(66, 2, 16, 1, '#2a2622');
    smokeAt.push({ x: 74, y: -2 });
    rect(28, 78, 17, 20, W6[0]); rect(29, 79, 15, 18, W6[3]); rect(29, 79, 4, 18, W6[4]); rect(40, 79, 3, 18, W6[2]); rect(29, 83, 15, 1, W6[0]); rect(29, 91, 15, 1, W6[0]); grain(29, 79, 15, 18, 55, W6[2], W6[4], true);
    ellipse(36, 78, 8, 3, '#2a1a0e'); ellipse(36, 78, 7, 2, LEAF[2]); [['#f27a9f', 32], ['#ffd84a', 36], ['#ffffff', 40], ['#e8524a', 34]].forEach(([c, x], i) => flower(x, 75 - (i % 2) * 2, c));
    rect(160, 30, 4, 52, W6[0]); rect(161, 31, 2, 50, W6[3]); rect(161, 31, 1, 50, W6[4]); rect(160, 30, 12, 3, W6[0]); rect(161, 31, 10, 1, W6[4]); rect(167, 33, 1, 4, '#3a2a1a');
    rect(164, 37, 8, 12, '#2a1c10'); rect(165, 38, 6, 10, '#ffd877'); rect(166, 39, 2, 7, '#fff6c8'); rect(168, 38, 1, 10, '#c88a30'); rect(163, 36, 10, 2, '#3a2a1a'); rect(163, 49, 10, 2, '#3a2a1a'); lights.push({ x: 165, y: 38, w: 6, h: 10, lamp: true });
    rect(157, 80, 10, 3, W6[0]); clump(169, 82, 12, 9, 61, 8);
    [[84, 103], [97, 106], [109, 103]].forEach(([x, y], i) => mossStone(x, y, 11, 5, i === 1));
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
    rect(x + 1, y0 + 2, 3, y1 - y0 - 2, W6[0]); rect(x + 2, y0 + 2, 1, y1 - y0 - 2, W6[4]);
    for (let y = y0, i = 0; y < y1 - 6; y += 15, i++) { rect(x - 1, y, 7, 11, W6[0]); rect(x, y + 1, 5, 9, W6[3]); rect(x, y + 1, 5, 2, W6[5]); rect(x + 3, y + 3, 1, 7, W6[2]); grain(x, y + 1, 5, 9, 30 + i, W6[2], W6[4], true); rect(x + 1, y + 9, 3, 1, W6[1]); if (rnd(i, y) < .5) rect(x, y + 10, 2, 1, '#5e9a3a'); tuft(x - 3, y + 11, GRASS[1], GRASS[3], GRASS[5]); }
  }
  function fenceH(x0, x1, y) {
    rect(x0, y + 3, x1 - x0, 3, W6[0]); rect(x0, y + 4, x1 - x0, 1, W6[4]); rect(x0, y + 9, x1 - x0, 3, W6[0]); rect(x0, y + 10, x1 - x0, 1, W6[4]);
    for (let x = x0, i = 0; x <= x1 - 4; x += 15, i++) { rect(x, y, 6, 16, W6[0]); rect(x + 1, y + 1, 4, 14, W6[3]); rect(x + 1, y + 1, 4, 2, W6[5]); rect(x + 4, y + 3, 1, 12, W6[2]); grain(x + 1, y + 1, 4, 14, 60 + i, W6[2], W6[4], true); rect(x + 1, y + 13, 4, 1, W6[1]); rect(x + 2, y + 5, 1, 1, '#d8d8d8'); tuft(x - 2, y + 14, GRASS[1], GRASS[3], GRASS[5]); }
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
    rect(509, 112, 32, 22, STONE[0]); ellipse(525, 112, 16, 9, STONE[0]); ellipse(525, 112, 15, 8, STONE[2]); rect(510, 112, 30, 21, STONE[2]);
    for (let y = 114; y < 132; y += 5) { rect(510, y, 30, 1, STONE[1]); for (let x = 512 + (y % 2) * 4; x < 538; x += 8) rect(x, y + 1, 1, 4, STONE[1]); }
    for (let i = 0; i < 40; i++) rect(510 + rnd(i, 1) * 30, 104 + rnd(i, 2) * 28, 2, 1, rnd(i, 3) < .5 ? STONE[3] : STONE[1]);
    rect(510, 112, 30, 1, STONE[3]); rect(515, 117, 20, 16, STONE[0]); rect(516, 118, 18, 15, '#1c1612'); ellipse(525, 118, 9, 3, '#1c1612'); rect(520, 126, 10, 7, '#c8501a'); rect(522, 128, 6, 5, '#f09a32'); rect(523, 130, 4, 3, '#ffd877'); rect(515, 133, 20, 1, STONE[1]);
    rect(530, 92, 12, 22, STONE[0]); rect(531, 92, 10, 22, STONE[2]); rect(531, 92, 3, 22, STONE[3]); rect(539, 92, 2, 22, STONE[1]); for (let y = 96; y < 112; y += 5) rect(531, y, 10, 1, STONE[1]); rect(528, 90, 16, 4, STONE[0]); rect(529, 90, 14, 2, STONE[3]);
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

  function lightRays(g) {
    withCtx(g, () => {
      for (let i = 0; i < 7; i++) {
        const x0 = 20 + i * 88 + rnd(i, 3) * 20, w = 18 + rnd(i, 4) * 26, sk = 150 + rnd(i, 5) * 60;
        const gr = g.createLinearGradient(x0, 0, x0 + sk * .5, H * .8); gr.addColorStop(0, 'rgba(255,244,170,.11)'); gr.addColorStop(.55, 'rgba(255,244,170,.04)'); gr.addColorStop(1, 'rgba(255,244,170,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w, 0); g.lineTo(x0 + w + sk, H); g.lineTo(x0 + sk * .55, H); g.closePath(); g.fill();
      }
      const sun = g.createRadialGradient(40, 0, 4, 40, 0, 190); sun.addColorStop(0, 'rgba(255,240,170,.16)'); sun.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 34; i++) { const x = rnd(i, 61) * W, y = rnd(i, 62) * H; if (inGrid(x, y, 0)) continue; const near = Math.min(x, W - x, y, H - y) < 70; if (!near) continue; g.fillStyle = 'rgba(255,248,190,.10)'; g.beginPath(); g.ellipse(x, y, 6 + rnd(i, 63) * 9, 3 + rnd(i, 64) * 4, .3, 0, 6.283); g.fill(); }
      const vg = g.createRadialGradient(W / 2, H / 2, H * .38, W / 2, H / 2, H * .95); vg.addColorStop(0, 'rgba(10,30,20,0)'); vg.addColorStop(1, 'rgba(10,30,20,.38)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    });
  }

  function buildBg() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    waterSpots.length = 0; lights.length = 0; smokeAt.length = 0;
    paintGround(g);
    withCtx(g, () => {
      meadow(); treeRing(); stream();
      pondShape(68, 344, 56, 33, 3); lily(36, 336, true); lily(52, 354, false); lily(76, 361, true); lily(44, 322, false); lily(100, 350, true); lily(30, 354, false); lily(60, 335, false);
      reeds(10, 322, 3, 41); reeds(112, 372, 3, 43);
      dockV(88, 304, 24, 34);
      pathDirt(); house(); shed();
      fenceV(20, 98, 198); fenceH(20, 58, 238); fenceV(560, 76, 184); fenceV(560, 220, 266); fenceH(494, 546, 276); fenceH(456, 484, 314);
      bucketBarrel(497, 281); scarecrow(56, 178); stove();
      pondShape(512, 210, 28, 16, 9); lily(504, 210, true); lily(520, 214, false); lily(514, 204, false); reeds(484, 220, 2, 55); bucketBarrel(468, 196); benchYard(486, 240); lampPost(553, 214);
      toolCorner();
      [[176, 20], [214, 16], [250, 40], [452, 56], [440, 20], [30, 112], [34, 270], [30, 300], [150, 366], [196, 362], [244, 368], [294, 364], [344, 368], [394, 362], [436, 366], [548, 118], [548, 200], [542, 296]].forEach(([x, y], i) => clump(x, y, 11 + (i % 3) * 2, 8, 900 + i * 7, 7));
      [[132, 360], [118, 318], [160, 340]].forEach(([x, y], i) => clump(x, y, 9, 6, 1200 + i * 5, 5));
      for (let i = 0; i < 16; i++) { const x = 140 + rnd(i, 71) * 390, y = 20 + rnd(i, 72) * 330; if (inGrid(x, y, 14) || (x > 440 && y < 280) || (x < 130 && y > 280) || (y < 100 && x < 150)) continue; mossStone(Math.round(x), Math.round(y), 8 + (i % 3), 5, i % 2 === 0); }
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
          for (let i = 0; i < 5; i++) tuft(px + 4 + Math.floor(rnd(s, i) * 34), py + 6 + Math.floor(rnd(s, i + 9) * 30), GRASS[0], GRASS[1], GRASS[4]);
          for (let i = 0; i < 4; i++) { const fx = px + 4 + rnd(s, i + 20) * 34, fy = py + 6 + rnd(s, i + 30) * 30; i % 2 ? daisy(Math.round(fx), Math.round(fy)) : flower(fx, fy, BLOOM[Math.floor(rnd(s, i + 40) * BLOOM.length)]); }
          if (rnd(s, 50) < .42) clump(px + 10 + rnd(s, 51) * 22, py + 24 + rnd(s, 52) * 10, 8, 6, s, 4);
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
    rect(x + 2, y + h, w - 2, 3, 'rgba(20,45,15,.34)');
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
    shadow(x, y - 1, 12, 3, .38);
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
    for (let i = 0; i < 3; i++) { const r = (now / 1100 + i * 1.1) % 3.3; if (r < 2.4) g_ring(68 + (i - 1) * 24, 344 + (i % 2) * 8 - 6, 3 + r * 5, 1.4 + r * 2.3, .5 - r * .2); }
    for (const sm of smokeAt) for (let i = 0; i < 5; i++) { const t = ((now / 2600 + i / 5) % 1), a = (1 - t) * .5; ellipse(sm.x + t * 14 + Math.sin(now / 700 + i) * 2, sm.y - 3 - t * 30, 2 + Math.round(t * 5), 2 + Math.round(t * 4), 'rgba(236,236,242,' + a.toFixed(2) + ')'); }
    // карп в большом пруду
    const f = now / 2300, fx = 68 + Math.cos(f) * 34, fy = 346 + Math.sin(f) * 15, dir = Math.sin(f) > 0 ? -1 : 1, wag = Math.floor(now / 160) % 2;
    ellipse(fx, fy + 1, 4, 2, 'rgba(10,50,70,.4)'); rect(fx - 3, fy - 1, 6, 3, '#e8782a'); rect(fx - 2, fy - 1, 4, 1, '#f9a24a'); rect(fx + dir * 3, fy - 1 + wag, 3, 2, '#e8782a'); rect(fx - dir * 3, fy, 1, 1, '#fff'); rect(fx - 1, fy, 2, 1, '#f5f0e8');
    for (let i = 0; i < 4; i++) { const t = (now / 5200 + i / 4) % 1, ax = (t * 700 + i * 90) % (W + 40) - 20, ay = 120 + i * 60 + Math.sin(t * 20 + i) * 10; rect(ax, ay, 3, 2, i % 2 ? '#f27a9f' : '#fff0f4'); rect(ax + 1, ay, 1, 1, shade(i % 2 ? '#f27a9f' : '#fff0f4', -.2)); }
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
    items.push({ y: hero.y, draw: () => drawHero(now) });
    items.sort((a, b) => a.y - b.y).forEach(i => i.draw());
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
  function animate(now) {
    if (!opened || document.hidden) return;
    if (now - lastFrame >= 65) { const dt = Math.min(150, now - (lastFrame || now)); lastFrame = now; const factor = Math.min(1, dt / 220); hero.x += (hero.tx - hero.x) * factor; hero.y += (hero.ty - hero.y) * factor; draw(now); }
    animation = requestAnimationFrame(animate);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
