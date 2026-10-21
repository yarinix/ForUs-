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
