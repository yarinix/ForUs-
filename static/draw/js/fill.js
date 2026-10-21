  // ================= Заливка и пипетка =================
  function hex(r, g, b) { return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''); }
  function parseHex(h) {
    let s = String(h || '#000000').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16) || 0;
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function pickColor(pt) {
    const comp = flatten(true).getContext('2d');
    const px = Math.min(artCanvas.width - 1, Math.max(0, Math.round(pt.x * DPR)));
    const py = Math.min(artCanvas.height - 1, Math.max(0, Math.round(pt.y * DPR)));
    const d = comp.getImageData(px, py, 1, 1).data;
    setColor(hex(d[0], d[1], d[2]));
    setTool(S.prevTool === 'pick' ? 'pen' : S.prevTool);
    haptic('tick');
  }

  function doFill(pt) {
    const pw = artCanvas.width, ph = artCanvas.height;
    const src = flatten(false).getContext('2d').getImageData(0, 0, pw, ph).data;
    const sx = Math.min(pw - 1, Math.max(0, Math.round(pt.x * DPR)));
    const sy = Math.min(ph - 1, Math.max(0, Math.round(pt.y * DPR)));
    const si = (sy * pw + sx) * 4, r0 = src[si], g0 = src[si + 1], b0 = src[si + 2];
    const [fr, fg, fb] = parseHex(S.color);
    if (Math.abs(fr - r0) + Math.abs(fg - g0) + Math.abs(fb - b0) < 6) return;   // уже такого цвета
    const TOL = 54;
    const match = (x, y) => { const i = (y * pw + x) * 4;
      return Math.abs(src[i] - r0) + Math.abs(src[i + 1] - g0) + Math.abs(src[i + 2] - b0) <= TOL; };
    let mask = new Uint8Array(pw * ph);
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (mask[y * pw + x] || !match(x, y)) continue;
      let xl = x, xr = x;
      while (xl > 0 && !mask[y * pw + xl - 1] && match(xl - 1, y)) xl--;
      while (xr < pw - 1 && !mask[y * pw + xr + 1] && match(xr + 1, y)) xr++;
      for (let i = xl; i <= xr; i++) mask[y * pw + i] = 1;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= ph) continue;
        let inSpan = false;
        for (let i = xl; i <= xr; i++) {
          const ok = !mask[ny * pw + i] && match(i, ny);
          if (ok && !inSpan) { stack.push(i, ny); inSpan = true; } else if (!ok) inSpan = false;
        }
      }
    }
    // расширяем область на пару пикселей, чтобы под линиями не оставалось щелей
    for (let pass = 0; pass < 2; pass++) {
      const next = mask.slice();
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        if (mask[y * pw + x]) continue;
        if ((x > 0 && mask[y * pw + x - 1]) || (x < pw - 1 && mask[y * pw + x + 1]) ||
            (y > 0 && mask[(y - 1) * pw + x]) || (y < ph - 1 && mask[(y + 1) * pw + x])) next[y * pw + x] = 1;
      }
      mask = next;
    }
    const out = new ImageData(pw, ph), o = out.data;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const j = i * 4; o[j] = fr; o[j + 1] = fg; o[j + 2] = fb; o[j + 3] = 255; }
    const tmp = document.createElement('canvas'); tmp.width = pw; tmp.height = ph; tmp.getContext('2d').putImageData(out, 0, 0);
    pushHistory();
    artCtx.save(); artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.globalCompositeOperation = 'destination-over';
    artCtx.drawImage(tmp, 0, 0); artCtx.restore();
    haptic('light');
  }

