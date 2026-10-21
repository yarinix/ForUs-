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
