  // ---------- выдра (пушистая, объёмная, с живыми бликами и текстурой шёрстки) ----------
  const OW = 84, OH = 92, OX = 42, OB = 86;
  let otS = 0.8, wearK = 1, BACKV = false;
  const oX = (x) => OX + (x - OX) * otS, oY = (y) => OB + (y - OB) * otS;
  const oe = (L, cx, cy, rx, ry, ramp, o) => ell(L, oX(cx), oY(cy), rx * otS, ry * otS, ramp, o);
  const of = (L, cx, cy, rx, ry, col) => flat(L, oX(cx), oY(cy), rx * otS, ry * otS, col);
  const od = (L, x, y, col) => dot(L, oX(x), oY(y), col);
  const or_ = (L, x, y, w, h, col) => rect(L, oX(x), oY(y), Math.max(1, Math.round(w * otS)), Math.max(1, Math.round(h * otS)), col);
  const os = (L, x, y, rows, map) => spr(L, oX(x), oY(y), rows, map);

  function drawHead(L, hx, hy, look, blink) {
    const joy = look === 'pet' || look === 'play';
    const shut = look === 'sleep' || look === 'no' || blink;
    // пушистые круглые ушки с внутренним объёмом и светлой опушкой
    for (const sx of [-1, 1]) {
      oe(L, hx + sx * 19, hy - 14, 5.5, 5.5, FUR, { d: .12 });
      oe(L, hx + sx * 19, hy - 13, 3.0, 3.0, ['#f0a89c', '#d98276', '#b56055'], { d: .1 });
      od(L, hx + sx * 18, hy - 15, '#ffe0d8');
    }
    // голова с мягким градиентом и хохолком на макушке
    oe(L, hx, hy, 25.5, 19.2, FUR, { d: .14 });
    for (const [dx, dy] of [[-2, -19], [0, -20], [2, -19], [-1, -18], [1, -19]]) od(L, hx + dx, hy + dy, FUR[0]);
    // текстура шёрстки на лбу и висках
    for (const [dx, dy, c] of [[-14, -10, FUR[0]], [-12, -12, '#d89b68'], [-10, -11, FUR[0]], [11, -10, FUR[2]], [14, -8, FUR[3]], [-18, -2, FUR[0]], [18, 0, FUR[3]]]) od(L, hx + dx, hy + dy, c);
    // объёмные щёчки (бакенбарды) и подбородок
    oe(L, hx, hy + 8.5, 14, 8.8, BELLY, { d: .12 });
    oe(L, hx - 6.5, hy + 7.5, 7.5, 5.8, BELLY, { d: .1 });
    oe(L, hx + 6.5, hy + 7.5, 7.5, 5.8, BELLY, { d: .1 });
    // нежный двухслойный румянец
    for (const sx of [-1, 1]) {
      of(L, hx + sx * 18.5, hy + 8, 5.4, 3.3, look === 'sad' ? '#e7a09a' : '#f59598');
      of(L, hx + sx * 18.5, hy + 7.8, 3.2, 1.8, look === 'sad' ? '#f0b8b3' : '#ffb5ba');
    }
    // выразительные бровки
    for (const sx of [-1, 1]) {
      const bx = hx + sx * 12.5, by = hy - 5.2;
      if (look === 'sad') { [[-3, 0], [-1, -1], [1, -1.5], [3, -2]].forEach(([a, b]) => od(L, bx + sx * a, by + b, '#4a2a18')); }
      else if (joy) { [[-3, -1], [-1, -2], [1, -2], [3, -1]].forEach(([a, b]) => od(L, bx + a, by + b, '#5c3520')); }
      else { [[-2.5, -0.5], [-1, -1], [1, -1], [2.5, -0.5]].forEach(([a, b]) => od(L, bx + a, by + b, '#5c3520')); }
    }
    // глубокие блестящие глазки с радужкой и двойным бликом
    for (const sx of [-1, 1]) {
      const ex = hx + sx * 12.5, ey = hy + 2;
      if (joy) {
        [[-3.5, 1.5], [-2.5, 0], [-1.5, -1], [0, -1.5], [1.5, -1], [2.5, 0], [3.5, 1.5]].forEach(([a, b]) => { od(L, ex + a, ey + b, OTT_OUT); od(L, ex + a, ey + b - 0.8, '#522c18'); });
      } else if (shut) {
        [[-3.5, -0.5], [-2, 0.5], [-0.5, 1], [0.5, 1], [2, 0.5], [3.5, -0.5]].forEach(([a, b]) => od(L, ex + a, ey + b, OTT_OUT));
        od(L, ex + sx * 3.5, ey, OTT_OUT);
      } else {
        oe(L, ex, ey, 4.5, 5.1, ['#3b231b', '#22130e', '#120906'], { d: 0 });
        of(L, ex + 0.5, ey + 1.5, 2.6, 2.2, '#4f3024');
        or_(L, ex - 3.2, ey - 3.8, 3, 3, '#ffffff');
        od(L, ex - 0.8, ey - 3.8, '#ffffff');
        od(L, ex + 1.8, ey + 2.2, '#e2eeff'); od(L, ex + 1.2, ey + 2.6, '#b8d4ff');
        if (look === 'sleepy') { or_(L, ex - 4.5, ey - 5, 9, 4.2, FUR[1]); or_(L, ex - 4.5, ey - 1.2, 9, 1, OTT_OUT); }
        if (look === 'sad') { od(L, ex + sx * 2.5, ey + 3.5, '#8ce0ff'); od(L, ex + sx * 2.5, ey + 4.5, '#ffffff'); }
      }
    }
    // кожаный носик сердечком с бликом и пушистые усы
    oe(L, hx, hy + 6.3, 4.2, 2.9, ['#694c5e', '#3d2835', '#21141c'], { d: 0 });
    or_(L, hx - 2, hy + 5, 2.5, 1.2, '#c8b2c4'); od(L, hx - 2.5, hy + 5.5, '#e8d8e6');
    for (const sx of [-1, 1]) {
      for (const [a, b] of [[-5, 8], [-7, 9], [-4, 10]]) od(L, hx + sx * a, hy + b, '#c4a070');
      for (const [a, b] of [[19, 5.5], [20.5, 5.2], [22, 5.2], [23.5, 5.8], [19, 8.5], [20.5, 8.8], [22, 9.4], [23.5, 10.2]]) od(L, hx + sx * a, hy + b, '#633e29');
    }
    // ротик и язычок
    const my = hy + 10;
    if (look === 'feed' || look === 'play') {
      oe(L, hx, my + 2.2, 4.3, 3.5, ['#7a2038', '#4f1224'], { d: 0 });
      oe(L, hx, my + 3.6, 2.8, 1.6, ['#ff9eb2', '#ff6e8e'], { d: 0 });
      od(L, hx - 1.5, my - 0.2, '#ffffff'); od(L, hx + 1.5, my - 0.2, '#ffffff');
    } else if (look === 'sleepy') {
      oe(L, hx, my + 2.2, 2.6, 3.2, ['#7a2038', '#4f1224'], { d: 0 });
    } else if (look === 'sad' || look === 'no') {
      [[-3, 1.5], [-2, 0.5], [-1, 0], [0, 0], [1, 0], [2, 0.5], [3, 1.5]].forEach(([a, b]) => od(L, hx + a, my + b, OTT_OUT));
    } else if (look === 'pet') {
      [[-3.5, 0], [-2.5, 1], [-1.2, 1.2], [0, 0.2], [1.2, 1.2], [2.5, 1], [3.5, 0]].forEach(([a, b]) => od(L, hx + a, my + b, OTT_OUT));
      of(L, hx, my + 2.8, 1.8, 1.3, '#ff8aa0');
    } else {
      [[-3.5, 0.2], [-2.5, 1], [-1.2, 1.2], [0, 0.2], [1.2, 1.2], [2.5, 1], [3.5, 0.2]].forEach(([a, b]) => od(L, hx + a, my + b, OTT_OUT));
    }
    drawWear(L, hx, hy);
  }

  function drawOtter(t, look, blink, ov, opt) {
    opt = opt || {}; const keepS = otS, keepK = wearK, keepB = BACKV;
    if (opt.s) { otS = opt.s; wearK = opt.s / 0.8; }
    BACKV = !!opt.back;
    WEAR = ov || (S && S.worn) || {};
    CLK = t; LK = look;
    const L = newLayer(OW, OH), fast = look === 'pet' || look === 'play' || look === 'walk';
    const wag = Math.floor(t / (fast ? 140 : 480)) % 2, step = Math.floor(t / 150) % 2;
    // пушистый хвост с текстурой меха
    const tp = [[56, 84], [62, 86], [68, 85], [73.5, 80.5]];
    if (!BACKV) for (let i = 0; i < tp.length - 1; i++) for (let f = 0; f < 1; f += 0.28) {
      const k = i + f, x = tp[i][0] + (tp[i + 1][0] - tp[i][0]) * f, y = tp[i][1] + (tp[i + 1][1] - tp[i][1]) * f;
      oe(L, x, y - (k > 1.5 ? wag * (k - 1.5) * 2.4 : 0), 5.6 - k * .58, 4.0 - k * .3, FURD, { d: .12 });
    }
    // спина, туловище и мягкое пузико с шёрсткой
    if (!BACKV) bodyBack(L, WEAR.back);
    oe(L, OX, 67, 18.8, 19.8, FUR, { d: .14 });
    if (!BACKV) {
      oe(L, OX, 70, 12.2, 14.8, BELLY, { d: .12 });
      for (const [dx, dy] of [[-4, 62], [4, 62], [0, 64], [-5, 68], [5, 68], [0, 71]]) od(L, OX + dx, dy, BELLY[0]);
      for (const [dx, dy] of [[-14, 63], [-15, 70], [14, 65], [15, 72]]) od(L, OX + dx, dy, dx < 0 ? FUR[0] : FUR[3]);
    } else {
      for (const [dx, dy] of [[-8, 60], [7, 61], [-4, 67], [6, 69], [-9, 73], [4, 75]]) { od(L, OX + dx, dy, FUR[2]); od(L, OX + dx + 1, dy, FUR[3]); }
      oe(L, OX, 85, 7.5, 3.8, FURD, { d: .1 });
    }
    const outfit = WEAR.suit || WEAR.top;
    if (BACKV) backOutfit(L, outfit); else bodyFront(L, outfit);
    if (BACKV) bodyBack(L, WEAR.back); else backFront(L, WEAR.back);
    const fit = OUTFIT[outfit], armR = (fit && fit.sleeve) || FURD, footR = (fit && fit.feet) || FURD;
    // задние лапки с подушечками и пальчиками
    const lf = look === 'walk' && step ? 3 : 0, rf = look === 'walk' && !step ? 3 : 0;
    for (const [sx, lift] of [[-1, lf], [1, rf]]) {
      const fx = OX + sx * 9, fy = 84 - lift;
      oe(L, fx, fy, 7.0, 3.6, footR, { d: .1 });
      if (!fit || !fit.feet) {
        for (const d of [-3, 0, 3]) od(L, fx + d, fy - 1.5, FUR[0]);
        of(L, fx, fy + 1, 3.2, 1.2, '#d98c80');
      } else {
        od(L, fx - 2, fy - 1, '#ffffff');
      }
    }
    // передние лапки с пальчиками
    const clasp = look === 'feed' || look === 'pet';
    if (clasp) {
      oe(L, OX - 14, 66, 4.0, 6.8, armR, { d: .1 }); oe(L, OX + 14, 66, 4.0, 6.8, armR, { d: .1 });
      oe(L, OX - 5, 63, 4.6, 3.8, FURD, { d: .1 }); oe(L, OX + 5, 63, 4.6, 3.8, FURD, { d: .1 });
      od(L, OX - 3, 62, FUR[0]); od(L, OX + 3, 62, FUR[0]);
    } else if (look === 'play') {
      oe(L, OX - 20, 58, 4.0, 7.0, armR, { d: .1 }); oe(L, OX + 20, 58, 4.0, 7.0, armR, { d: .1 });
      if (!BACKV) { of(L, OX - 20, 55, 2.0, 1.5, '#e89b8e'); of(L, OX + 20, 55, 2.0, 1.5, '#e89b8e'); }
    } else {
      oe(L, OX - 18, 69, 4.2, 7.8, armR, { d: .1 }); oe(L, OX + 18, 69, 4.2, 7.8, armR, { d: .1 });
      od(L, OX - 18, 74, FUR[0]); od(L, OX + 18, 74, FUR[0]);
    }
    if (BACKV) drawHeadBack(L, OX, 34); else drawHead(L, OX, 34, look === 'walk' ? 'idle' : look, blink);
    // эффекты
    if (look === 'feed') {
      const b = Math.floor(t / 300) % 2;
      os(L, OX - 8, 58 - b, ['..hbbb......b', '.hhbbbbbbbbbb', 'bbkbbbbbbbbbo', 'bLLLLLLbbbbdo', '.dddddddddddo', '..dddd......b'], { b: '#ff9a3c', h: '#ffc885', d: '#d46d14', o: '#e07b22', L: '#ffe6b3', k: OUT });
      oe(L, OX - 5, 63, 4.6, 3.8, armR, { d: .1 }); oe(L, OX + 5, 63, 4.6, 3.8, armR, { d: .1 });
    }
    if (look === 'pet') {
      for (let i = 0; i < 3; i++) {
        const ph = ((t / 900) + i / 3) % 1, x = [OX - 36, OX + 28, OX - 4][i], y = 12 - ph * 12 + [8, 4, -2][i];
        if (ph < .9) os(L, x, y, SPR.heart.rows, SPR.heart.map);
      }
    }
    if (look === 'sleep') {
      for (let i = 0; i < 3; i++) {
        const ph = ((t / 1800) + i / 3) % 1, x = OX + 22 + i * 5 + ph * 4, y = 14 - ph * 14 - i * 2;
        const z = i === 0 ? ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'] : ['ZZZZZ', '...Z.', '..Z..', '.Z...', 'ZZZZZ'];
        if (ph < .92) os(L, x, y, z, { Z: '#ffffff' });
      }
    }
    outline(L, OTT_OUT);
    legendFx(L, t);
    otS = keepS; wearK = keepK; BACKV = keepB;
    return L;
  }

