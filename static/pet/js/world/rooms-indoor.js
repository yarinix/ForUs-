  // ---------- общие куски комнат (детализированный паркет, плитка с бликами, резные рамы и складки штор) ----------
  function drawFloor(R, W, H, fy, a, b, seam, mode) {
    const rows = [0, 9, 20, 33, 48, 66, 90, 120].map(v => fy + Math.round(v * (H - fy) / 100 * 1.15)).filter(v => v < H);
    rows.push(H);
    const hiA = mixc(a, '#ffffff', 0.16), loA = mixc(a, seam, 0.28);
    const hiB = mixc(b, '#ffffff', 0.16), loB = mixc(b, seam, 0.28);
    for (let r = 0; r < rows.length - 1; r++) {
      const y0 = rows[r], y1 = rows[r + 1], bw = mode === 'tile' ? 12 + r * 5 : 14 + r * 7, off = mode === 'tile' ? 0 : (r % 2) * (bw >> 1);
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const cell = Math.floor((x + off) / bw), cx = (x + off) % bw, ry = y - y0, rh = Math.max(1, y1 - y0);
        const isB = (cell + r) % 2 === 1;
        let col = isB ? b : a;
        if (mode === 'tile') {
          if (ry === 1 || cx === 1) col = isB ? hiB : hiA;
          else if (ry === rh - 1 || cx === bw - 1) col = isB ? loB : loA;
          else if (cx + ry >= 3 && cx + ry <= 5 && cx < 5 && ry < 5) col = isB ? hiB : hiA;
        } else {
          if (ry === 1) col = isB ? hiB : hiA;
          else if (ry === rh - 1) col = isB ? loB : loA;
          else {
            const wave = Math.sin(x * 0.25 + cell * 2.1 + ry * 0.9);
            if (wave > 0.72) col = isB ? loB : loA;
            else if (wave < -0.78) col = isB ? hiB : hiA;
            if (cx === ((cell * 7 + r * 3) % Math.max(3, bw - 4)) + 2 && ry === (rh >> 1)) col = seam;
          }
        }
        if (cx === 0) col = seam;
        dot(R, x, y, col);
      }
      rect(R, 0, y0, W, 1, seam);
    }
  }
  function windowFrame(R, wx, wy, ww, wh, frame, curtain, curtain2) {
    const fHi = mixc(frame, '#ffffff', 0.25), fLo = mixc(frame, '#1a0d08', 0.32);
    const cHi = mixc(curtain, '#ffffff', 0.28), cLo = mixc(curtain2, '#1a0d08', 0.25);
    // стеклянные блики на окне до рамы
    for (let d = 0; d < 9; d++) {
      if (wx + 3 + d < wx + ww && wy + 3 + d < wy + wh) dot(R, wx + 3 + d, wy + 3 + d, 'rgba(255,255,255,0.55)');
      if (wx + 6 + d < wx + ww && wy + 2 + d < wy + wh) dot(R, wx + 6 + d, wy + 2 + d, 'rgba(255,255,255,0.35)');
    }
    prop(R, T => {
      // рама с фаской и подоконником
      rect(T, wx - 3, wy - 3, ww + 6, 3, frame); rect(T, wx - 3, wy - 3, ww + 6, 1, fHi);
      rect(T, wx - 4, wy + wh, ww + 8, 4, frame); rect(T, wx - 4, wy + wh, ww + 8, 1, fHi); rect(T, wx - 4, wy + wh + 3, ww + 8, 1, fLo);
      rect(T, wx - 3, wy, 3, wh, frame); rect(T, wx - 3, wy, 1, wh, fHi);
      rect(T, wx + ww, wy, 3, wh, frame); rect(T, wx + ww + 2, wy, 1, wh, fLo);
      // переплёт окна с объёмом
      rect(T, wx + (ww >> 1) - 1, wy, 2, wh, frame); rect(T, wx + (ww >> 1) - 1, wy, 1, wh, fHi);
      rect(T, wx, wy + (wh >> 1) - 1, ww, 2, frame); rect(T, wx, wy + (wh >> 1) - 1, ww, 1, fHi);
      // карниз с золотистыми наконечниками
      rect(T, wx - 7, wy - 6, ww + 14, 3, frame); rect(T, wx - 7, wy - 6, ww + 14, 1, fHi);
      rect(T, wx - 8, wy - 7, 2, 5, '#ffd466'); rect(T, wx + ww + 6, wy - 7, 2, 5, '#ffd466');
      // пышные шторы с вертикальными складками и подхватами
      for (let j = 0; j < wh + 8; j++) {
        const tie = Math.abs(j - Math.round(wh * 0.65)) <= 1;
        const w2 = tie ? 5 : (7 - (j > wh - 5 ? 1 : 0));
        for (let i = 0; i < w2; i++) {
          const fold = i === 0 || i === 3 ? cHi : (i === 2 || i === w2 - 1 ? cLo : (j % 6 < 3 ? curtain : curtain2));
          const col = tie ? '#ffe082' : fold;
          dot(T, wx - 6 + i, wy - 3 + j, col);
          dot(T, wx + ww + 6 - w2 + i, wy - 3 + j, col);
        }
      }
    });
  }

  // ---------- ТЕНИ: помощники ----------
  const SH = 'rgba(46,24,64,';
  function softShadow(g, cx, cy, rx, ry, a) {
    for (const [k, aa] of [[1, a], [.62, a * .85]]) {
      g.fillStyle = SH + aa.toFixed(3) + ')';
      const RX = rx * k, RY = Math.max(.9, ry * k), n = Math.ceil(RY);
      for (let dy = -n; dy <= n; dy++) { const w = Math.round(RX * Math.sqrt(Math.max(0, 1 - (dy / (RY + .6)) ** 2))); if (w > 0) g.fillRect(Math.round(cx) - w, Math.round(cy) + dy, w * 2, 1); }
    }
  }
  const shade = (R, cx, cy, rx, ry, a = .22) => softShadow(R.x, cx, cy, rx, ry, a);
  function shadeRect(R, x, y, w, h, a) { R.x.fillStyle = SH + a.toFixed(3) + ')'; R.x.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function aoStrip(R, W, fy) { [.28, .19, .12, .06].forEach((a, i) => shadeRect(R, 0, fy + i, W, 1, a)); }

  // ---------- ДЕНЬ И НОЧЬ В ДОМЕ ----------
  function dayWindow(R, wx, wy, ww, wh) {
    band(R, wx, wy, ww, wh, ['#6cbfff', '#99d6ff', '#cceeff', '#eefaff']);
    // далёкие голубые горы и зелёные холмы с деревьями
    [[10, 10, 18, 12], [26, 9, 20, 14]].forEach(([x, y, w, h]) => ell(R, wx + x, wy + wh - 5, w / 2 + 4, h / 2 + 5, ['#9ac5e8', '#7aa8d4', '#5f8eba']));
    [[8, 9, 16, 12], [22, 11, 22, 14], [34, 9, 12, 10]].forEach(([x, y, w, h]) => ell(R, wx + x, wy + wh - 3 + (y - 10) * .2, w / 2 + 3, h / 2 + 5, ['#88db92', '#56b862', '#3f9a4d', '#2b7336']));
    ell(R, wx + 25, wy + 7, 8.5, 3.2, ['#ffffff', '#eaf6ff', '#cde4fa']);
    ell(R, wx + 13, wy + 12, 6.2, 2.5, ['#ffffff', '#eaf6ff', '#cde4fa']);
  }
  function nightWindow(R, wx, wy, ww, wh) {
    band(R, wx, wy, ww, wh, ['#131d52', '#1f2f7a', '#2e459c', '#4362b5']);
    for (const [fx, fy_] of [[.18, .15], [.41, .35], [.76, .2], [.88, .5], [.29, .6], [.65, .7], [.82, .1], [.12, .4], [.52, .18]]) {
      const x = wx + Math.round(fx * ww), y = wy + Math.round(fy_ * wh); dot(R, x, y, '#fff8c4');
      if ((x + y) % 3 === 0) { dot(R, x + 1, y, '#ffe699'); dot(R, x - 1, y, '#ffe699'); dot(R, x, y + 1, '#ffe699'); dot(R, x, y - 1, '#ffe699'); }
    }
    const r = Math.max(4, Math.min(7, Math.round(ww * .2))), mx = wx + Math.round(ww * .7), my = wy + Math.round(wh * .28);
    ell(R, mx, my, r, r, ['#fffbe0', '#ffea94', '#e8c34d']); ell(R, mx + r * .43, my - r * .28, r - 1, r - 1, ['#1f2f7a', '#1f2f7a']);
    ell(R, wx + ww * .3, wy + wh, ww * .45, wh * .14 + 2, ['#263b80', '#1a2a5c', '#121d42']);
    ell(R, wx + ww * .78, wy + wh, ww * .4, wh * .1 + 2, ['#263b80', '#1a2a5c', '#121d42']);
  }
  function lightPatch(R, wx, wy, ww, wh, H, fy, night, cover) {
    const wallC = night ? '#9fa6ee' : '#fff7d6', floorC = night ? '#c59a9a' : '#e6b880';
    for (let y = wy + wh; y < H; y++) for (let x = wx; x < R.w; x++) {
      const along = (y - (wy + wh)), left = wx + along * 0.55 - 2, right = wx + ww + along * 1.0 + 2;
      if (x > left && x < right && ((x + y) & 1) === 0 && along < (H - wy - wh) * cover) dot(R, x, y, y < fy ? wallC : floorC);
    }
  }

  // ---------- гостиная (дамасские обои, резной деревянный вайнскот и тёплый паркет) ----------
  function buildHome(W, H, fy, baseY, night = false) {
    const R = newLayer(W, H);
    band(R, 0, 0, W, fy, ['#fdf0d5', '#fae4bc', '#f4d5a2', '#ecc68b']);
    // фактурные обои с полосками и мелкими ромбиками
    for (let x = 3; x < W; x += 8) {
      for (let y = 2; y < fy - 16; y++) if ((y & 1) === 0) dot(R, x, y, '#f2d39e');
      for (let y = 5 + ((x >> 3) % 2) * 5; y < fy - 18; y += 10) {
        dot(R, x + 4, y, '#fdf5e4'); dot(R, x + 3, y + 1, '#ebd09e'); dot(R, x + 5, y + 1, '#ebd09e'); dot(R, x + 4, y + 2, '#e3c38d');
      }
    }
    // потолочный карниз
    rect(R, 0, 0, W, 2, '#fff8eb'); rect(R, 0, 2, W, 1, '#dec08e');
    // деревянные стеновые панели (вайнскот) с объёмной филёнкой
    rect(R, 0, fy - 16, W, 16, '#d69e63'); rect(R, 0, fy - 16, W, 1, '#f5cb93'); rect(R, 0, fy - 15, W, 1, '#b87f47');
    rect(R, 0, fy - 2, W, 1, '#8f5b2d'); rect(R, 0, fy - 1, W, 1, '#5e3919');
    for (let x = 5; x < W - 4; x += 14) {
      rect(R, x, fy - 13, 10, 10, '#c2884f');
      rect(R, x, fy - 13, 10, 1, '#9c6735'); rect(R, x, fy - 13, 1, 10, '#9c6735');
      rect(R, x + 1, fy - 4, 9, 1, '#ebba83'); rect(R, x + 9, fy - 12, 1, 9, '#ebba83');
      rect(R, x + 2, fy - 11, 6, 6, '#cf965b'); rect(R, x + 2, fy - 11, 6, 1, '#e6b47e');
    }
    drawFloor(R, W, H, fy, WOOD[0], WOOD[1], WOOD[3], 'wood');
    aoStrip(R, W, fy);
    const wx = 5, wy = 12, ww = 36, wh = Math.min(40, fy - 28);
    if (night) nightWindow(R, wx, wy, ww, wh); else dayWindow(R, wx, wy, ww, wh);
    windowFrame(R, wx, wy, ww, wh, '#8f5630', '#f28b4b', '#d96832');
    lightPatch(R, wx, wy, ww, wh, H, fy, night, 0.7);
    view.win.home = { wx, wy, ww, wh, cover: .7 };
    return R;
  }

  // ---------- кухня (объёмный кафельный фартук с фаской, узорные обои и глянцевая плитка) ----------
  function buildKitchen(W, H, fy, baseY, night = false) {
    const R = newLayer(W, H);
    band(R, 0, 0, W, fy, ['#f0fbf2', '#dff4e4', '#ccead4', '#b8dec3']);
    rect(R, 0, 0, W, 2, '#ffffff'); rect(R, 0, 2, W, 1, '#b8dec3');
    // узор обоев на всю стену: кафельный фартук теперь часть кухонной стойки и переезжает вместе с ней
    for (let x = 4; x < W; x += 9) for (let y = 4; y < fy - 8; y += 6) {
      dot(R, x, y, '#ffffff'); dot(R, x + 1, y, '#a5d4b4'); dot(R, x, y + 1, '#a5d4b4');
    }
    const wx = 6, wy = 16, ww = 24, wh = 26;
    if (night) nightWindow(R, wx, wy, ww, wh);
    else {
      band(R, wx, wy, ww, wh, ['#84d2ff', '#b8e6ff', '#eefaff']);
      ell(R, wx + 12, wy + wh - 2, 12, 8, ['#8fd68c', '#5fb866', '#3f9a4d']);
      ell(R, wx + 14, wy + 6, 6, 2.3, ['#ffffff', '#e8f6ff']);
    }
    windowFrame(R, wx, wy, ww, wh, '#b9824f', '#ff9aa8', '#e66c80');
    rect(R, 0, fy - 5, W, 5, '#9fd8d2'); rect(R, 0, fy - 5, W, 1, '#d4f5f0'); rect(R, 0, fy - 1, W, 1, '#447d79');
    drawFloor(R, W, H, fy, '#f7eed8', '#8ad1ca', '#529c95', 'tile');
    aoStrip(R, W, fy);
    lightPatch(R, wx, wy, ww, wh, H, fy, night, 0.38); view.win.kitchen = { wx, wy, ww, wh, cover: .38 };
    return R;
  }

  // ---------- спальня (уютные звёздные обои, резные фиолетовые панели и тёмный паркет) ----------
  function buildBedroom(W, H, fy, baseY, night = false) {
    const R = newLayer(W, H);
    band(R, 0, 0, W, fy, ['#988de0', '#867ad1', '#7568c2', '#6457b0']);
    rect(R, 0, 0, W, 2, '#beb6f2'); rect(R, 0, 2, W, 1, '#5d50a6');
    for (let x = 5; x < W; x += 11) for (let y = 5; y < fy - 17; y += 8) {
      const jy = y + ((x >> 1) % 3);
      if ((x + y) % 3 === 0) {
        dot(R, x, jy, '#fff6d6'); dot(R, x - 1, jy, '#cbc2f7'); dot(R, x + 1, jy, '#cbc2f7'); dot(R, x, jy - 1, '#cbc2f7'); dot(R, x, jy + 1, '#cbc2f7');
      } else {
        dot(R, x, jy, '#c4bbf2');
      }
    }
    rect(R, 0, fy - 16, W, 16, '#6a4f7e'); rect(R, 0, fy - 16, W, 1, '#9b7eb2'); rect(R, 0, fy - 15, W, 1, '#523b63'); rect(R, 0, fy - 1, W, 1, '#332340');
    for (let x = 5; x < W - 4; x += 14) {
      rect(R, x, fy - 13, 10, 10, '#5a416d');
      rect(R, x, fy - 13, 10, 1, '#432f52'); rect(R, x, fy - 13, 1, 10, '#432f52');
      rect(R, x + 1, fy - 4, 9, 1, '#84679c'); rect(R, x + 9, fy - 12, 1, 9, '#84679c');
      rect(R, x + 2, fy - 11, 6, 6, '#634978');
    }
    drawFloor(R, W, H, fy, '#b07b64', '#996652', '#633e31', 'wood');
    aoStrip(R, W, fy);
    const wx = 5, wy = 12, ww = 34, wh = Math.min(40, fy - 28);
    if (night) nightWindow(R, wx, wy, ww, wh); else dayWindow(R, wx, wy, ww, wh);
    windowFrame(R, wx, wy, ww, wh, '#4e3763', '#a36be0', '#7a44b8');
    lightPatch(R, wx, wy, ww, wh, H, fy, night, 0.6);
    view.win.bedroom = { wx, wy, ww, wh, cover: .6 };
    return R;
  }

