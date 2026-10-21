  // ---------- улица: небо (меняется по часам), общие куски и три сцены ----------
  const mulberry = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const GREEN = {
    bright: ['#86e37b', '#66c963', '#49ab4c', '#32873a'],
    dark:   ['#4eb368', '#389452', '#26753f', '#19572e'],
    far:    ['#8fc9a8', '#74b391', '#5c9c7c', '#488266'],
    deep:   ['#3ba15f', '#2a824c', '#1d663b', '#134a2b'],
  };
  const hexOf = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mixc = (a, b, t) => { const A = hexOf(a), B = hexOf(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const SKYK = [[0, '#091138', '#1a2a6c'], [5, '#0e1a4e', '#2e408a'], [6.5, '#5464ab', '#ffa07a'], [8, '#4692e6', '#c4e8ff'], [17.5, '#4692e6', '#c4e8ff'], [19, '#6654b8', '#ff8859'], [20.5, '#1f2766', '#6c489c'], [22, '#091138', '#1a2a6c'], [24, '#091138', '#1a2a6c']];
  function skyAt(h) {
    for (let i = 0; i < SKYK.length - 1; i++) { const a = SKYK[i], b = SKYK[i + 1]; if (h >= a[0] && h <= b[0]) { const t = (h - a[0]) / (b[0] - a[0]); return [mixc(a[1], b[1], t), mixc(a[2], b[2], t)]; } }
    return [SKYK[0][1], SKYK[0][2]];
  }
  const SKYSPR = (() => {
    const sun = newLayer(23, 23); flat(sun, 11, 11, 10.5, 10.5, '#fff3b8'); ell(sun, 11, 11, 7, 7, ['#ffffff', '#ffe866', '#ffbf2e'], { d: .08 });
    const moon = newLayer(17, 17); ell(moon, 8, 8, 6.8, 6.8, ['#fffdf0', '#f2ebbf', '#d6cca0'], { d: .08 });
    ell(moon, 6, 6, 1.6, 1.6, ['#c9bf92', '#ded6ad']); ell(moon, 10, 9, 1.3, 1.3, ['#c9bf92', '#ded6ad']); dot(moon, 7, 10, '#c9bf92');
    const cloud = newLayer(36, 14);
    flat(cloud, 10, 10, 8.5, 3.5, '#cdddf2'); flat(cloud, 19, 9, 10.5, 4.2, '#cdddf2'); flat(cloud, 27, 10, 7.5, 3.4, '#cdddf2');
    ell(cloud, 10, 8, 7.5, 3.4, ['#ffffff', '#f2f7ff', '#d9e7fa']);
    ell(cloud, 18, 6.5, 8.5, 4.5, ['#ffffff', '#f5f9ff', '#dceafa']);
    ell(cloud, 26, 8, 6.5, 3.4, ['#ffffff', '#f2f7ff', '#d9e7fa']);
    const r = mulberry(5), stars = []; for (let i = 0; i < 34; i++) stars.push([r(), r() * 0.85, r() * 6.3]);
    return { sun, moon, cloud, stars };
  })();
  function drawSky(g, now, h, W, fy) {
    const [top, hor] = skyAt(h), n = Math.min(1, dayAlphaAt(h) / 0.3), nB = 12;
    for (let i = 0; i < nB; i++) { g.fillStyle = mixc(top, hor, i / (nB - 1)); const y0 = Math.floor(i * fy / nB), y1 = Math.floor((i + 1) * fy / nB) + (i === nB - 1 ? 2 : 0); g.fillRect(0, y0, W, y1 - y0); }
    if (n > 0.05) for (const [sx_, sy_, ph] of SKYSPR.stars) { g.fillStyle = 'rgba(255,248,205,' + (n * (0.5 + 0.5 * Math.sin(now / 700 + ph))).toFixed(2) + ')'; g.fillRect(Math.round(sx_ * W), Math.round(sy_ * fy), 1, 1); }
    const day = h >= 6 && h <= 19.5, p = day ? (h - 6) / 13.5 : ((h >= 19.5 ? h - 19.5 : h + 4.5) / 10.5);
    const bx = Math.round(W * (0.1 + 0.8 * p)), by = Math.round(fy * 0.86 - Math.sin(Math.PI * p) * fy * 0.66), S = day ? SKYSPR.sun : SKYSPR.moon;
    if (day) { g.globalAlpha = 0.35; g.drawImage(S.c, bx - 11, by - 11); g.globalAlpha = 1; g.drawImage(S.c, bx - 11, by - 11); }
    else g.drawImage(S.c, bx - 8, by - 8);
    g.globalAlpha = 0.95 - n * 0.6;
    [[2.4, .16, 0], [1.5, .34, 40], [3.1, .06, 80]].forEach(([sp, yy, off]) => { const x = ((now / 1000 * sp + off) % (W + 70)) - 36; g.drawImage(SKYSPR.cloud.c, Math.round(x), Math.round(fy * yy)); });
    g.globalAlpha = 1;
    if (h >= 7 && h <= 17.5) {
      g.fillStyle = '#34405e';
      [[8.5, 0, .22], [6, 55, .34]].forEach(([sp, off, yy], bi) => {
        const x = Math.round(((now / 1000 * sp + off) % (W + 50)) - 25), y = Math.round(fy * yy + Math.sin(now / 650 + bi * 2) * 3);
        (Math.floor(now / 190 + bi) % 2 ? ['x...x', '.x.x.', '..x..'] : ['..x..', '.x.x.', 'x...x']).forEach((row, ry) => { for (let rx = 0; rx < 5; rx++) if (row[rx] === 'x') g.fillRect(x + rx, y + ry, 1, 1); });
      });
    }
  }

  function pine(L, cx, by, h, cs) {
    const tr = Math.max(2, Math.round(h * 0.14)), ch = h - tr, tiers = Math.max(2, Math.round(h / 11)), th = ch / (tiers * 0.68 + 0.32);
    rect(L, cx - 1, by - tr, 3, tr, '#6e4527'); rect(L, cx - 1, by - tr, 1, tr, '#8f5e35');
    for (let i = 0; i < tiers; i++) {
      const y0 = Math.round(by - tr - ch + i * th * 0.68), hw = h * 0.14 + i * h * 0.048;
      for (let r = 0; r < th; r++) {
        const jagged = (r === Math.floor(th) - 1) ? 1 : 0;
        const half = Math.max(0, Math.round(hw * (r + 1) / th) - jagged);
        for (let x = cx - half; x <= cx + half; x++) {
          const side = (x - cx) / Math.max(1, half);
          let col = side < -0.25 ? cs[0] : side < 0.25 ? cs[1] : cs[2];
          if (r >= th - 1.4 && cs[3]) col = cs[3];
          else if (((x + r) & 3) === 0 && side < 0) col = cs[0];
          dot(L, x, y0 + r, col);
        }
      }
    }
  }
  function hills(L, W, fy, col, amp, seed, lift) {
    const r = mulberry(seed), p1 = r() * 6, p2 = r() * 6, hi = mixc(col, '#ffffff', 0.18), lo = mixc(col, '#1c3b36', 0.16);
    for (let x = 0; x < W; x++) {
      const y = Math.round(fy - lift - amp * (0.55 + 0.3 * Math.sin(x * 0.06 + p1) + 0.15 * Math.sin(x * 0.17 + p2)));
      rect(L, x, y, 1, fy - y + 1, col);
      dot(L, x, y, hi);
      if (fy - y > 4) rect(L, x, fy - 2, 1, 3, lo);
    }
  }
  function meadow(L, W, H, y0, cols, seed, light, dark, n) {
    band(L, 0, y0, W, H - y0, cols);
    const r = mulberry(seed), flCols = ['#fff07a', '#ff9ec4', '#ffffff', '#9ed8ff'];
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * W), y = y0 + 3 + Math.floor(r() * (H - y0 - 3));
      dot(L, x, y, dark); dot(L, x - 1, y - 1, light); dot(L, x + 1, y - 1, light); dot(L, x, y - 2, light);
      if (i % 7 === 0) { dot(L, x + 2, y - 1, flCols[i % 4]); dot(L, x + 2, y, dark); }
    }
  }
  function dirtPath(L, x0, x1, cy, hh, seed) {
    const r = mulberry(seed);
    for (let x = x0; x < x1; x++) {
      const c = cy + Math.round(Math.sin(x * 0.06) * 2), k = Math.min(1, (x - x0) / 10), h = Math.round(hh * k);
      for (let y = c - h; y <= c + h; y++) {
        const edge = y === c - h || y === c + h, near = y === c - h + 1 || y === c + h - 1;
        dot(L, x, y, edge ? '#b38c52' : near ? '#cfa96e' : (((x + y) & 3) === 0 ? '#f0d7a3' : '#dfc18b'));
      }
    }
    // каменная брусчатка и галька вдоль тропинки
    for (let x = x0 + 10; x < x1 - 4; x += 9) {
      const c = cy + Math.round(Math.sin(x * 0.06) * 2) + ((x % 2) ? 2 : -2);
      ell(L, x, c, 2.8, 1.5, ['#d9d2c5', '#b5ada0', '#8f8779'], { d: .1 });
    }
    for (let i = 0; i < 18; i++) { const x = x0 + 8 + Math.floor(r() * (x1 - x0 - 8)), y = cy + Math.floor((r() - 0.5) * hh); dot(L, x, y, '#a88450'); dot(L, x + 1, y, '#f5e4bc'); }
  }
  function fern(L, x, y) { spr(L, x, y, ['..h.h..', '.f.h.f.', 'f.fff.f', '.fffff.', '..dgf..', '...d...'], { h: '#7ce38a', f: '#4fb06a', g: '#2f7f45', d: '#1f5c30' }); }

  // ---------- задний двор: бревенчатый фасад с черепицей, крыльцом, забором и садовой дорожкой ----------
  function buildYard(W, H, fy, baseY) {
    const R = newLayer(W, H), r = mulberry(21);
    hills(R, W, fy, '#9fd3b4', 10, 3, 4); hills(R, W, fy, '#80c49c', 7, 4, 0);
    for (let x = 48; x < W + 8; x += 8 + Math.floor(r() * 6)) pine(R, x, fy + 1, 13 + Math.floor(r() * 9), GREEN.far);
    meadow(R, W, H, fy, ['#8fe085', '#78d072', '#62bb61', '#52a455'], 5, '#b2f5a4', '#398542', 80);
    dirtPath(R, 24, W, baseY + 8, 8, 9);
    shadeRect(R, 50, fy + 12, W - 50, 2, .22);
    // деревянный штакетник с объёмом и гвоздиками
    prop(R, T => {
      rect(T, 48, fy + 1, W, 2, '#cbb892'); rect(T, 48, fy + 7, W, 2, '#cbb892');
      for (let x = 50; x < W + 6; x += 6) {
        rect(T, x, fy - 3, 4, 14, '#faf3e3'); rect(T, x + 1, fy - 4, 2, 1, '#ffffff');
        rect(T, x, fy - 3, 1, 14, '#ffffff'); rect(T, x + 3, fy - 3, 1, 14, '#d6c6a5');
        dot(T, x + 2, fy + 2, '#9e8c6c'); dot(T, x + 2, fy + 8, '#9e8c6c');
      }
    });
    [[W - 12, fy + 14], [58, fy + 16]].forEach(([x, y]) => shade(R, x + 3, y + 6, 12, 2.6, .24));
    [[W - 12, fy + 14], [58, fy + 16]].forEach(([x, y]) => prop(R, T => {
      ell(T, x, y, 9.5, 6.2, GREEN.bright); ell(T, x + 6, y + 1, 6.4, 4.8, GREEN.bright);
      for (const [dx, dy, c] of [[-4, -2, '#ff8ab8'], [2, -2, '#ffd93d'], [6, -1, '#ff8ab8'], [-1, 1, '#ffffff'], [4, 2, '#ff9ec4']]) {
        dot(T, x + dx, y + dy, c); dot(T, x + dx + 1, y + dy, '#fff6b8');
      }
    }));
    const px = W - 24;
    shade(R, px + 7.5, baseY + 12, 9, 2.4, .24);
    prop(R, T => {
      rect(T, px + 6, baseY - 14, 3, 26, '#8f5e35'); rect(T, px + 6, baseY - 14, 1, 26, '#b57c4a');
      spr(T, px, baseY - 20, ['hhhhhhhhhhhh...', 'bbbbbbbbbbbbb..', 'bbbbbbbbbbbbbb.', 'bbbbbbbbbbbbbbb', 'bbbbbbbbbbbbbb.', 'ddddddddddddd..', 'dddddddddddd...'], { h: '#f7d399', b: '#e8b878', d: '#bf8c4e' });
      rect(T, px + 2, baseY - 18, 9, 1, '#7a4d28'); rect(T, px + 2, baseY - 15, 6, 1, '#7a4d28');
    });
    const wb = baseY - 1, dx0 = 6, dw = 24, dh = 38;
    shadeRect(R, 0, wb + 3, 54, 2, .22); shadeRect(R, 0, wb + 5, 54, 2, .12);
    prop(R, T => {
      // бревенчатая/вагоночная стена с мягкими тенями под каждой доской
      rect(T, 0, wb - 72, 44, 72, '#f5d9a8');
      for (let y = wb - 72; y < wb; y += 5) { rect(T, 0, y, 44, 1, '#fff0d1'); rect(T, 0, y + 4, 44, 1, '#d9b279'); }
      // каменный цоколь
      rect(T, 0, wb - 5, 44, 5, '#b8afa2');
      for (let x = 1; x < 42; x += 7) { rect(T, x, wb - 4, 5, 3, '#cfc7ba'); dot(T, x, wb - 4, '#ece6dc'); }
      // черепичная крыша с полукруглыми чешуйками
      rect(T, 0, wb - 83, 50, 12, '#cf5a43'); rect(T, 0, wb - 83, 50, 2, '#f0856e');
      for (let ry = wb - 80; ry < wb - 72; ry += 3) for (let x = ((ry & 1) * 3); x < 49; x += 6) {
        rect(T, x, ry, 5, 2, '#e36b54'); dot(T, x + 1, ry, '#f79983'); rect(T, x, ry + 2, 5, 1, '#9e3b28');
      }
      rect(T, 0, wb - 72, 50, 2, '#853122');
      // окно с бликами и пышным цветочным ящиком
      rect(T, 9, wb - 64, 20, 17, '#8f5630'); rect(T, 9, wb - 64, 20, 1, '#b87749');
      band(T, 11, wb - 62, 16, 13, ['#99dbff', '#d6f2ff', '#ffffff']);
      dot(T, 13, wb - 60, '#ffffff'); dot(T, 14, wb - 59, '#ffffff');
      rect(T, 18, wb - 62, 2, 13, '#8f5630'); rect(T, 11, wb - 56, 16, 2, '#8f5630');
      rect(T, 8, wb - 47, 22, 4, '#a9683a'); rect(T, 8, wb - 47, 22, 1, '#cc8552');
      for (let i = 0; i < 6; i++) {
        rect(T, 10 + i * 3, wb - 49, 2, 2, '#3f9a4d');
        dot(T, 10 + i * 3, wb - 50, i % 2 ? '#ff6a8a' : '#ffd93d');
        dot(T, 11 + i * 3, wb - 51, i % 2 ? '#ffa6bd' : '#fff5a8');
      }
      // филёнчатая дверь с объёмным наличником и латунной ручкой
      rect(T, dx0 - 2, wb - dh - 2, dw + 4, dh + 2, '#824b26'); rect(T, dx0 - 2, wb - dh - 2, dw + 4, 1, '#b06d3e');
      rect(T, dx0, wb - dh, dw, dh, '#b8723a'); rect(T, dx0, wb - dh, dw, 1, '#de9b60');
      for (const [px_, py_, pw, ph] of [[3, 4, 8, 14], [13, 4, 8, 14], [3, 21, 8, 12], [13, 21, 8, 12]]) {
        rect(T, dx0 + px_, wb - dh + py_, pw, ph, '#965829');
        rect(T, dx0 + px_, wb - dh + py_, pw, 1, '#75411c'); rect(T, dx0 + px_, wb - dh + py_, 1, ph, '#75411c');
        rect(T, dx0 + px_ + 1, wb - dh + py_ + ph - 1, pw - 1, 1, '#d48c52');
      }
      rect(T, dx0 + dw - 4, wb - 20, 2, 3, '#ffe27a'); dot(T, dx0 + dw - 4, wb - 20, '#ffffff');
      // ступеньки крыльца
      rect(T, dx0 - 4, wb, dw + 8, 3, '#c7beb0'); rect(T, dx0 - 4, wb, dw + 8, 1, '#ede6da');
      // кованый фонарик у двери
      rect(T, 34, wb - 36, 6, 7, '#ffe48f'); rect(T, 35, wb - 35, 4, 5, '#fff9d2');
      rect(T, 33, wb - 37, 8, 1, '#364254'); rect(T, 34, wb - 38, 6, 1, '#364254'); rect(T, 33, wb - 30, 8, 1, '#364254');
    });
    flat(R, dx0 + dw / 2, wb + 5, 12, 3.2, '#b8323c'); flat(R, dx0 + dw / 2, wb + 5, 10, 2.3, '#e8505b'); flat(R, dx0 + dw / 2, wb + 5, 7, 1.4, '#ff9aa2');
    view.door = { x: dx0, y: wb - dh, w: dw, h: dh, cx: dx0 + dw / 2 };
    return R;
  }

  // ---------- лес: многослойные ели, кора с мхом, годовые кольца на пеньке и ягодные кустики ----------
  function buildForest(W, H, fy, baseY) {
    const R = newLayer(W, H), r = mulberry(33);
    hills(R, W, fy, '#78b896', 9, 7, 6);
    for (let x = -2; x < W + 6; x += 6 + Math.floor(r() * 4)) pine(R, x, fy + 2, 16 + Math.floor(r() * 10), GREEN.far);
    meadow(R, W, H, fy, ['#65b86f', '#509e5e', '#408751', '#327045'], 8, '#88db8f', '#27613a', 95);
    for (let x = 2; x < W + 8; x += 12 + Math.floor(r() * 6)) {
      const by = fy + 7 + Math.floor(r() * 4), hh = 30 + Math.floor(r() * 14);
      shade(R, x + 3, by, hh * .22, 2.6, .24); pine(R, x, by, hh, GREEN.deep);
    }
    for (let i = 0; i < 70; i++) { const x = Math.floor(r() * W), y = fy + 8 + Math.floor(r() * (H - fy - 8)); dot(R, x, y, ['#c98a4a', '#e0a35a', '#a86b36'][i % 3]); }
    dirtPath(R, 0, W, baseY + 8, 8, 12);
    [[20, fy + 18], [W - 34, fy + 26], [W * 0.55, fy + 14], [14, baseY + 18]].forEach(([x, y]) => fern(R, Math.round(x), Math.round(y)));
    shade(R, 39, baseY + 30, 12, 3, .24); shade(R, W - 20, baseY + 30, 6, 1.6, .22); shade(R, W - 12, baseY + 32, 5, 1.4, .2);
    prop(R, T => {
      // фактурный пенёк с корнями, мхом и кольцами на срезе
      ell(T, 36, baseY + 28, 10.5, 3.2, ['#8f5e35', '#6e4527']);
      rect(T, 28, baseY + 22, 17, 7, '#8f5e35');
      for (let x = 29; x < 44; x += 2) rect(T, x, baseY + 23, 1, 6, (x & 2) ? '#6e4527' : '#a67042');
      ell(T, 36, baseY + 22, 8.8, 3.6, ['#f2d29b', '#d9a468', '#b07a47']);
      ell(T, 36, baseY + 22, 5.5, 2.1, ['#cfa068', '#e8c48e']);
      dot(T, 36, baseY + 22, '#9e6b3b');
      // мох на боку пенька
      ell(T, 31, baseY + 25, 2.8, 1.6, GREEN.bright);
      // мухоморчики с юбочкой и травинками
      spr(T, W - 24, baseY + 24, ['..hrrr.', '.rwrrwr', 'hrrrrrd', '..hssd.', '..sssd.'], { r: '#e8505b', h: '#ff858d', d: '#b02c37', w: '#ffffff', s: '#f6e6c8' });
      spr(T, W - 14, baseY + 27, ['.hrr.', 'rwrwr', '.ssd.', '.ssd.'], { r: '#e8505b', h: '#ff858d', d: '#b02c37', w: '#ffffff', s: '#f6e6c8' });
    });
    for (const [x, w] of [[2, 9], [W - 11, 9]]) shade(R, x + (w >> 1) + 3, baseY + 9, w * 1.3, 3, .26);
    for (let x = -4; x < W + 8; x += 9) { const d = 4 + Math.floor(r() * 9); ell(R, x, d, 8.5, 6.5 + Math.floor(r() * 4), ['#4eb368', '#389452', '#26753f', '#184f2a']); }
    prop(R, T => {
      for (const [x, w] of [[2, 9], [W - 11, 9]]) {
        rect(T, x, 0, w, baseY + 8, '#7a4a2a');
        rect(T, x, 0, 2, baseY + 8, '#9e663c'); rect(T, x + w - 2, 0, 2, baseY + 8, '#54311b');
        for (let y = 0; y < baseY + 8; y += 3) rect(T, x + ((y * 7) % (w - 2)) + 1, y, 1, 3, '#54311b');
        ell(T, x + (w >> 1), baseY + 8, w * 0.95, 3.4, ['#8f5834', '#6b3f22', '#4a2a16']);
        ell(T, x + (w >> 1) - 1, baseY + 6, 3, 1.5, GREEN.bright);
      }
    });
    for (let x = -3; x < W + 8; x += 7) { const d = 2 + Math.floor(r() * 5); ell(R, x, d, 5.5, 4.2 + Math.floor(r() * 3), ['#68cf75', '#4eb368', '#358c4d', '#22663a']); }
    R.x.save(); R.x.globalAlpha = 0.17;
    for (let i = 0; i < 3; i++) for (let y = 6; y < H * 0.82; y++) { const xs = W * (0.28 + i * 0.22) + y * 0.32 - 4; R.x.fillStyle = '#fffbd0'; R.x.fillRect(Math.round(xs), y, 6 - i, 1); }
    R.x.restore();
    return R;
  }

  // ---------- озеро: зеркальная гладь с отражением берега, камни, кувшинки с лотосами и рогоз ----------
  function buildLake(W, H, fy, baseY) {
    const R = newLayer(W, H), r = mulberry(44), wy1 = fy + Math.round((H - fy) * 0.42);
    hills(R, W, fy, '#a9c4dc', 16, 9, 8); hills(R, W, fy, '#8fb3cf', 10, 10, 3);
    for (let x = -2; x < W + 6; x += 5 + Math.floor(r() * 4)) pine(R, x, fy + 2, 9 + Math.floor(r() * 7), GREEN.far);
    band(R, 0, fy, W, wy1 - fy, ['#9be0ff', '#6dc2f2', '#4da0de', '#3682c4', '#2868a6']);
    // лёгкое отражение сосен у дальнего берега
    for (let x = 0; x < W; x += 2) rect(R, x, fy + 1, 1, 3 + (x % 3), '#4a98cf');
    for (let i = 0; i < 52; i++) { const x = Math.floor(r() * W), y = fy + 2 + Math.floor(r() * (wy1 - fy - 3)); rect(R, x, y, 2 + Math.floor(r() * 4), 1, i % 3 ? '#d4f2ff' : '#2a69a8'); }
    meadow(R, W, H, wy1, ['#9be08c', '#7ccc72', '#62b762', '#52a455'], 12, '#b8f5a6', '#398542', 70);
    // песчано-галечный берег с пенной кромкой воды
    for (let x = 0; x < W; x++) {
      const d = 3 + Math.round(Math.sin(x * 0.13) * 1.6) + (BAYER[x & 1][0] > 1 ? 1 : 0);
      dot(R, x, wy1 - 2, '#d8f4ff');
      for (let y = wy1 - 1; y < wy1 + d; y++) dot(R, x, y, y === wy1 - 1 ? '#fff6d6' : ((y + x) % 4 === 0 ? '#dec387' : '#f3e3b0'));
    }
    // береговые камушки
    for (const [rx, ry, rw] of [[18, wy1 + 1, 3.2], [23, wy1 + 2, 2.2], [W - 22, wy1 + 1, 3.5], [W - 17, wy1 + 2, 2.4]]) {
      ell(R, rx, ry, rw, 1.8, ['#d4cfc7', '#a6a098', '#78726b'], { d: .1 });
    }
    // кувшинки с цветущими лотосами
    [[W * 0.32, 0.55], [W * 0.5, 0.3], [W * 0.18, 0.28]].forEach(([x, k]) => {
      const cx = Math.round(x), y = Math.round(fy + (wy1 - fy) * k);
      flat(R, cx, y + 1, 5.5, 2.2, '#25699e');
      flat(R, cx, y, 5.2, 2.0, '#388f46'); flat(R, cx, y, 4.0, 1.4, '#62cc68');
      dot(R, cx + 3, y, '#4da0de');
      spr(R, cx - 1, y - 2, ['.p.p.', 'ppYpp', '.ppp.'], { p: '#ff94b8', Y: '#ffe680' });
    });
    // рогоз и камыши у берега
    for (let i = 0; i < 10; i++) {
      const x = 3 + i * 2 + (i % 2), h = 12 + ((i * 5) % 7), by_ = wy1 + 4;
      rect(R, x, by_ - h, 1, h, i % 2 ? '#45a653' : '#2d7a3b');
      if (i % 3 === 0) { rect(R, x, by_ - h - 4, 2, 5, '#7a4522'); dot(R, x, by_ - h - 3, '#a66538'); dot(R, x, by_ - h - 5, '#d9c398'); }
      else dot(R, x + 1, by_ - h + 2, '#68cf72');
    }
    view.water = { y0: fy + 1, y1: wy1 - 1 };
    return R;
  }

