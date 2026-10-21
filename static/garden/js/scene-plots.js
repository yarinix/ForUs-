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
