  // ---------- анимация рыбалки: замах, заброс, поплавок, поклёвка, вытягивание ----------
  function pxLine(g, x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sxs = x0 < x1 ? 1 : -1, sys = y0 < y1 ? 1 : -1; let e = dx - dy;
    g.fillStyle = col;
    for (let n = 0; n < 300; n++) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 > -dy) { e -= dy; x0 += sxs; } if (e2 < dx) { e += dx; y0 += sys; } }
  }
  function pxRing(g, cx, cy, r, a) {
    g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
    for (let k = 0; k < 24; k++) { const an = k / 24 * 6.2832; g.fillRect(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r * 0.35), 1, 1); }
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const FISH_DUR = 4400;
  function playFishing(hit) {
    return new Promise(res => {
      view.fish = { t0: performance.now(), hit, dur: FISH_DUR };
      say('Закидываю удочку… 🎣', 2400);
      SFX.play('cast', 450); SFX.play('splash', 1000); SFX.play('bite', 2900); SFX.play('bite', 3060);
      setTimeout(() => haptic('light'), 2900);
      setTimeout(res, FISH_DUR);
    });
  }
  function drawFishing(g, now, ox) {
    const F = view.fish, t = now - F.t0, w = view.water; if (!w) return;
    const os_ = view.otsCur || 0.8, kk = os_ / 0.8, hx = ox + Math.round(18 * os_), hy = view.baseY + 4 - Math.round(17 * os_), bx = Math.min(view.W - 10, ox + 34), by = Math.round((w.y0 + w.y1) / 2) + 3;
    // кончик удилища
    let tx = hx + 15, ty = hy - 17;
    if (t < 500) { const k = ease(t / 500); tx = lerp(hx + 12, hx - 6, k); ty = lerp(hy - 19, hy - 22, k); }
    else if (t < 800) { const k = ease((t - 500) / 300); tx = lerp(hx - 6, hx + 16, k); ty = lerp(hy - 22, hy - 14, k); }
    else if (t < 2900) { tx = hx + 16; ty = hy - 14 + Math.round(Math.sin(t / 420)); }
    else if (t < 3350) { tx = hx + 16; ty = hy - 14 + Math.round(Math.abs(Math.sin(t / 50)) * 3); }
    else { const k = ease(Math.min(1, (t - 3350) / 350)); tx = lerp(hx + 16, hx + 10, k); ty = lerp(hy - 14, hy - 24, k); }
    pxLine(g, hx, hy, tx, ty, '#8f5e35'); pxLine(g, hx, hy - 1, tx, ty - 1, '#c99358'); g.fillStyle = '#6e4527'; g.fillRect(hx - 1, hy - 1, 3, 3);
    const bob = (x, y, dip) => { g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 2 + dip, 3, 2); g.fillStyle = '#e8505b'; g.fillRect(x - 1, y + dip, 3, 2); };
    const thread = (x, y) => { pxLine(g, tx, ty, x, y - 2, 'rgba(244,247,255,.9)'); };
    if (t < 500) { pxLine(g, tx, ty, tx, ty + 9, 'rgba(244,247,255,.9)'); g.fillStyle = '#e8505b'; g.fillRect(tx, ty + 9, 2, 2); }
    else if (t < 1000) {
      const k = ease((t - 500) / 500), x = lerp(tx, bx, k), y = lerp(ty, by, k) - Math.sin(Math.PI * k) * 16;
      thread(x, y); bob(Math.round(x), Math.round(y), 0);
    } else if (t < 3350) {
      const bit = t > 2900, dip = bit ? Math.round(Math.abs(Math.sin(t / 45)) * 3) : Math.round(Math.sin(t / 300));
      const my = by + dip; pxLine(g, tx, ty, (tx + bx) / 2, Math.max(ty, my) + 2, 'rgba(244,247,255,.9)'); pxLine(g, (tx + bx) / 2, Math.max(ty, my) + 2, bx, my - 2, 'rgba(244,247,255,.9)');
      bob(bx, by, dip);
      const rt = t - 1000; for (let i = 0; i < 3; i++) { const ph = ((rt - i * 650) % 2000) / 2000; if (rt - i * 650 > 0 && ph < 0.6) pxRing(g, bx, by + 2, 2 + ph * 14, 0.8 * (1 - ph / 0.6)); }
      if (t < 1250) { g.fillStyle = '#ffffff'; for (const [a, b] of [[-3, -3], [3, -4], [-1, -6], [1, -5], [-5, -1], [5, -1]]) g.fillRect(bx + a, by + b - Math.round((t - 1000) / 80), 1, 1); }
      if (bit) { g.fillStyle = '#e8505b'; const ey_ = view.baseY + 4 - Math.round(76 * os_) - 12; g.fillRect(ox, ey_, 2, 6); g.fillRect(ox, ey_ + 8, 2, 2); }
    } else {
      const k = Math.min(1, (t - 3350) / 1000);
      if (F.hit) {
        const x = lerp(bx, ox + 2, k), y = lerp(by, view.baseY - 12 - Math.round(10 * kk), k) - Math.sin(Math.PI * k) * 26;
        pxLine(g, tx, ty, x, y, 'rgba(244,247,255,.9)');
        spr({ x: g }, Math.round(x) - 5, Math.round(y) - 3, ['...bbb...o', '.bbbbbbbbo', 'bbkbbbbbo.', 'bLLLLLbbbo', '.bbbbbbbbo', '....bbb...'], { b: '#ff9a3c', L: '#ffd08a', k: '#2a1722', o: '#ff9a3c' });
        if (k < 0.2) pxRing(g, bx, by + 2, 3 + k * 30, 0.9);
        if (k > 0.85) { g.fillStyle = '#fff6a8'; for (const [a, b] of [[-7, -6], [7, -8], [0, -12], [-10, -1], [10, 0]]) g.fillRect(ox + a, view.baseY - 12 - Math.round(10 * kk) + b, 1, 1); }
      } else {
        const x = lerp(bx, tx, ease(k)), y = lerp(by, ty + 10, ease(k)) - Math.sin(Math.PI * k) * 6;
        pxLine(g, tx, ty, x, y, 'rgba(244,247,255,.9)'); g.fillStyle = '#c9d4e0'; g.fillRect(Math.round(x), Math.round(y), 1, 3); g.fillRect(Math.round(x) + 1, Math.round(y) + 2, 1, 1);
        if (k > 0.6) { g.fillStyle = '#ffffff'; const ey_ = view.baseY + 4 - Math.round(76 * os_) - 10; g.fillRect(ox - 3, ey_, 1, 1); g.fillRect(ox, ey_, 1, 1); g.fillRect(ox + 3, ey_, 1, 1); }
      }
    }
  }

