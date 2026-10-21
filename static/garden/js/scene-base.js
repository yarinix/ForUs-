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

