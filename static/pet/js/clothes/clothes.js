  // =====================================================================
  // ОДЕЖДА, МЕБЕЛЬ, МАГАЗИН, МЕНЮ
  // =====================================================================
  let WEAR = {};                                   // что надето прямо сейчас (слот → id)
  const SLOT_RU = { head: 'Голова', top: 'Верх', suit: 'Костюм', acc: 'Аксессуар', back: 'Спина' };
  const SLOT_ORDER = ['head', 'top', 'suit', 'acc', 'back'];
  const RARITY = {
    common:    { n: 'Обычное',     col: '#c9d6ee', ord: 0 },
    rare:      { n: 'Редкое',      col: '#4aa3ff', ord: 1 },
    epic:      { n: 'Эпическое',   col: '#c06bff', ord: 2 },
    legendary: { n: 'Легендарное', col: '#ffc83d', ord: 3 },
  };
  const rarityOf = (id) => (CAT && CAT[id] && CAT[id].r) || 'common';
  let CLK = 0, LK = 'idle';
  const GRN = ['#8ce38b', '#5bc25e', '#3a9642', '#23692c'];

  function scaleRows(rows, f) {
    if (!f || f === 1) return rows;
    const w0 = Math.max(...rows.map(r => r.length)), h0 = rows.length, w = Math.round(w0 * f), h = Math.round(h0 * f), out = [];
    for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) r += (rows[Math.min(h0 - 1, Math.floor(y / f))] || '').padEnd(w0, '.')[Math.min(w0 - 1, Math.floor(x / f))]; out.push(r); }
    return out;
  }
  function sprc(L, cx, by, rows, map, sc) {
    rows = scaleRows(rows, wearK === 1 ? sc : (sc || 1) * wearK);
    const w = Math.max(...rows.map(r => r.length)), rr = rows.map(r => r.padEnd(w, '.'));
    spr(L, Math.round(oX(cx) - w / 2), Math.round(oY(by) - rows.length), rr, map);
  }
  function ring(L, cx, cy, rx, ry, col) { for (let a = 0; a < 6.3; a += 0.3) od(L, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, col); }
  function stripesEll(L, cx, cy, rx, ry, every, col) {
    const X = oX(cx), Y = oY(cy), RX = rx * otS, RY = ry * otS, y0 = Math.floor(Y - RY);
    for (let y = y0; y <= Math.ceil(Y + RY); y++) {
      if ((y - y0) % every !== 0) continue;
      for (let x = Math.floor(X - RX); x <= Math.ceil(X + RX); x++) { const dx = (x + .5 - X) / RX, dy = (y + .5 - Y) / RY; if (dx * dx + dy * dy <= 1) dot(L, x, y, col); }
    }
  }

  const shape = (w, h, f) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => f(x, y) || '.').join(''));
  const inE = (x, y, cx, cy, rx, ry) => ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1;
  const lit = (x, y, cx, cy, rx, ry) => { const t = -.6 * (x + .5 - cx) / rx - .8 * (y + .5 - cy) / ry; return t > .35 ? 'h' : t < -.35 ? 'd' : 'm'; };
  function ring2(L, cx, cy, r, col) { const n = Math.ceil(r * otS * 7); for (let i = 0; i < n; i++) { const a = i / n * 6.2832; od(L, cx + Math.cos(a) * r, cy + Math.sin(a) * r, col); } }
  function olin(L, x0, y0, x1, y1, col) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * otS * 1.5); for (let i = 0; i <= n; i++) od(L, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, col); }

  // ---------- СТАРАЯ одежда (legacy) с улучшенной детализацией и бликами ----------
  const HAT = {
    cap: { by: -13, sc: 1.5, map: { r: '#e8505b', h: '#ffa8b0', d: '#9c222e', w: '#ffffff' }, rows: [
      '......rrrrrrrrr......', '....rrrrhhrrrrrrr....', '...rrrhhwrrrrrrrrr...', '..rrrrrrrrrrrrrrrrd..', '..rrrrrrrrrrrrrrrdd..', 'ddddddddddddddddddddd', '.ddddddddddddddddddd.'] },
    party: { by: -13, sc: 1.5, map: { y: '#ffe252', p: '#ff6aa5', h: '#ffa6cb', d: '#c93c75', w: '#ffffff' }, rows: [
      '.....y.....', '....yhy....', '....hpd....', '...hpppd...', '...wwwww...', '..hpppppd..', '..ppwpwpd..', '.hpppppppd.', 'ppppppppppd'] },
    crown: { by: -14, sc: 1.5, map: { y: '#ffcf3d', h: '#fff7bd', d: '#b87b0c', r: '#ff3b5c', b: '#3d9eff', g: '#38d976' }, rows: [
      'h...h...h...h', 'hy.hyy.yyh.yd', 'hyyyyyyyyyyyd', 'yyryyybyyygyd', 'ddddddddddddd'] },
    beanie: { by: -10, sc: 1.45, map: { b: '#4f83e8', h: '#a8cbff', d: '#2d55ab', w: '#ffffff', L: '#bccfeb' }, rows: [
      '.........www.........', '........wwLww........', '.....hhhbbbbbbbd.....', '...hhhbbbbbbbbbbdd...', '..hhbbbbbbbbbbbbbbdd.', '.hbbbbbbbbbbbbbbbbbdd', 'wwwwwwwwwwwwwwwwwwwww', 'wLwLwLwLwLwLwLwLwLwLw'] },
    flower: { by: -12, sc: 1.6, dx: 16, map: { p: '#ff8ab8', h: '#ffc4dc', y: '#ffe27a', o: '#ff9a3c' }, rows: ['.hp.', 'pyop', 'pyyp', '.pp.'] },
  };
  const HEARTG = { r: '#ff4f8b', h: '#ffd9e8', d: '#b82559' };
  const HEARTG_ROWS = ['.hrr.rrh.', 'hrrrrrrrd', 'rhrrrrrrd', 'rrrrrrrrd', '.rrrrrrd.', '..rrrrd..', '...rrd...', '....d....'];

  function drawFaceWear(L, hx, hy, id) {
    const ey = hy + 2;
    for (const sg of [-1, 1]) {
      const ex = hx + sg * 12.5;
      if (id === 'sunglasses') {
        or_(L, ex - 6, ey - 4, 12, 7.5, '#141426');
        or_(L, ex - 5, ey - 3, 10, 5.5, '#252645');
        or_(L, ex - 4.5, ey - 2.5, 3, 2, '#8ea4ff'); od(L, ex - 2, ey, '#c9d6ff');
      } else if (id === 'round') {
        ring(L, ex, ey, 6.2, 5.6, '#d99a1e'); ring(L, ex, ey, 5.6, 5.0, '#ffe27a');
        od(L, ex - 3, ey - 3, '#ffffff'); od(L, ex - 2, ey - 2, '#d4f0ff');
      } else if (id === 'hearts') {
        spr(L, Math.round(oX(ex)) - 4, Math.round(oY(ey)) - 4, HEARTG_ROWS, HEARTG);
      }
    }
    if (id === 'sunglasses') { or_(L, hx - 7, ey - 3, 14, 2, '#141426'); or_(L, hx - 21, hy - 1.5, 4, 2, '#141426'); or_(L, hx + 17, hy - 1.5, 4, 2, '#141426'); }
    if (id === 'round') or_(L, hx - 6.5, ey - 1, 13, 1.2, '#ffe27a');
  }
  function drawNeckWear(L, hx, hy, id) {
    if (id === 'scarf') {
      or_(L, hx + 6, hy + 20, 7, 14, '#d93838'); or_(L, hx + 7, hy + 20, 2, 14, '#ff7373');
      or_(L, hx + 6, hy + 26, 7, 1.5, '#fff5f5'); or_(L, hx + 6, hy + 30, 7, 1.5, '#fff5f5');
      for (let f = 0; f < 7; f += 2) od(L, hx + 6 + f, hy + 34, '#fff5f5');
      oe(L, hx, hy + 19.5, 18.2, 4.6, ['#ff9494', '#e04848', '#b02828', '#801818'], { d: .12 });
      for (let i = -14; i <= 14; i += 4) { od(L, hx + i, hy + 19, '#fff5f5'); od(L, hx + i, hy + 20, '#ffcccc'); }
    } else if (id === 'bow') {
      sprc(L, hx, hy + 25, ['hr.....rd', 'hrrr.rrrd', 'hrrrkrrrd', 'rrrr.rrrd', 'dd.....dd'], { h: '#ff94b8', r: '#ff4f84', d: '#bd2454', k: '#8c143a' }, 1.7);
    } else if (id === 'bandana') {
      sprc(L, hx, hy + 26, ['hhhhhhhhhhhhhhh', '.bbwbbbwbbbwbb.', '..bbbbbbbbbbbd.', '...bbbwbbbbbd..', '....bbbbbbbd...', '.....bbbbdd....', '......bddd.....'], { h: '#82b0ff', b: '#4376db', d: '#284d9c', w: '#ffffff' }, 1.5);
    }
  }
  function legacyBack(L, id) {
    if (id === 'cape') {
      oe(L, OX, 70, 26.5, 21.5, ['#ff8585', '#e03e3e', '#ad2424', '#7a1515'], { d: .12 });
      or_(L, OX - 13, 53, 26, 4, '#ffd23d'); or_(L, OX - 13, 53, 26, 1, '#fff5b8');
    }
  }
  function legacyFront(L, id) {
    if (id === 'tee') {
      oe(L, OX, 66.5, 19, 18.5, ['#a6f5dc', '#58cfa9', '#32a382', '#1f755c'], { d: .12 });
      oe(L, OX, 54.5, 11, 2.5, ['#ffffff', '#d9f7ed'], { d: .05 });
      os(L, OX - 4, 62, SPR.heart.rows, SPR.heart.map);
    } else if (id === 'sweater') {
      oe(L, OX, 66.5, 19, 18.5, ['#8cb8ff', '#5287eb', '#3560c4', '#23428f'], { d: .12 });
      stripesEll(L, OX, 66.5, 19, 18.5, 4, '#eef4ff');
      oe(L, OX, 55, 12, 3, ['#eef4ff', '#c5d8fa'], { d: .08 });
    } else if (id === 'apron') {
      oe(L, OX, 71, 14.5, 14.8, ['#ffe0eb', '#ffa6c4', '#e06b95', '#b3466d'], { d: .12 });
      or_(L, OX - 11, 54, 3, 14, '#e06b95'); or_(L, OX + 8, 54, 3, 14, '#e06b95');
      or_(L, OX - 6.5, 72.5, 13, 7.5, '#fff5f8'); or_(L, OX - 6.5, 72.5, 13, 1, '#ffd1e1');
      os(L, OX - 3, 74, ['.r.r.', 'rrrrr', '.rrr.', '..r..'], { r: '#ff5a8a' });
    }
  }

  // ---------- НОВАЯ ОДЕЖДА (5 слотов × 3 вещи) ----------
  const HEAD = {
    bucket: { by: -9, map: { h: '#fff6bd', m: '#ffd866', d: '#d99b26', s: '#b07812', b: '#4f91ff', B: '#295ec2', w: '#ffffff' },
      rows: shape(38, 13, (x, y) => {
        let c = null;
        if (inE(x, y, 19, 10, 19, 3.3)) c = y >= 11 ? (y === 12 ? 's' : 'd') : 'm';
        if (y <= 8 && inE(x, y, 19, 7.2, 11.2, 7.6)) c = lit(x, y, 19, 7.2, 11.2, 7.6);
        if (y >= 6 && y <= 8 && Math.abs(x + .5 - 19) <= 11.4) c = y === 6 ? (x < 12 ? 'w' : 'b') : y === 8 ? 'B' : 'b';
        if (y >= 9 && y <= 10 && inE(x, y, 19, 10, 19, 3.2) && c === 'm') c = x < 11 ? 'h' : ((x + y) % 5 === 0 ? 'd' : 'm');
        return c;
      }) },
    chef: { by: -10, map: { w: '#ffffff', h: '#f5f8ff', m: '#e1e9f7', d: '#b5c4e0', s: '#8fa3c9', g: '#ffd966' },
      rows: shape(30, 21, (x, y) => {
        let c = null;
        for (const [cx, cy, r] of [[9, 9, 6.6], [21, 9, 6.6], [15, 6.4, 7.4]]) if (inE(x, y, cx, cy, r, r)) { const l = lit(x, y, cx, cy, r, r); c = l === 'h' ? 'w' : l; }
        if (y >= 9 && y <= 14 && x >= 5 && x <= 24) c = (x === 11 || x === 18) && y >= 10 ? 'd' : (x < 10 ? 'w' : x > 19 ? 'd' : 'm');
        if (y === 15 && x >= 5 && x <= 24) c = 'g';
        if (y >= 16 && y <= 20 && x >= 5 && x <= 24) c = (x - 5) % 4 === 3 ? 's' : x < 10 ? 'w' : x > 19 ? 'd' : 'm';
        return c;
      }) },
    halo: { by: -19, bob: 1, map: { w: '#ffffff', h: '#fff8c4', m: '#ffd642', d: '#d99814', s: '#a86e06' },
      rows: shape(34, 10, (x, y) => {
        if (!inE(x, y, 17, 5, 16.5, 4.5) || inE(x, y, 17, 5, 11.8, 2.0)) return null;
        if (y <= 1 && x >= 11 && x <= 20) return 'w';
        return y <= 2 ? 'h' : y >= 8 ? 's' : y >= 6 ? 'd' : 'm';
      }) },
  };

  const NAVY = ['#96a4ff', '#5868e0', '#3845b0', '#232c78'], SLIP = ['#ffd1e3', '#ff94be', '#db5c8f', '#a83866'];
  const COAT = ['#787087', '#494257', '#2d2738', '#1a1622'], BOOT = ['#c48a52', '#8f5b30', '#633c1d', '#422610'];
  const ROBE = ['#ff7d88', '#e03652', '#a31c35', '#6e0e21'], VIOL = ['#d4c9ff', '#a38ff7', '#755fd4', '#503ca6'];

  function ermine(L, x0, y0, x1, y1, inside) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) dot(L, x, y, (x + y) % 7 === 0 ? '#e6dec8' : '#fffdf7');
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x * 5 + y * 3) % 13 === 0 && inside(x, y) && inside(x, y + 1)) { dot(L, x, y, '#2a1722'); dot(L, x, y + 1, '#2a1722'); dot(L, x, y - 1, '#d9cbb0'); }
  }
  const OUTFIT = {
    hoodie: { sleeve: VIOL,
      body(L) {
        oe(L, OX, 66.5, 19.2, 18.6, VIOL, { d: .12 });
        oe(L, OX, 55, 15.8, 5.0, ['#b5a6ff', '#8672e3', '#5c46b8', '#3f2d8a'], { d: .12 });
        // рельефный карман-кенгуру и нижняя резинка
        of(L, OX, 77.5, 11.8, 5.6, '#7b66d9');
        or_(L, OX - 10, 72.5, 20, 1.2, '#c5b8ff'); or_(L, OX - 9, 81.5, 18, 1.5, '#5843b0');
        // шнурки с металлическими эглетами
        or_(L, OX - 5, 57.5, 1.2, 9, '#ffffff'); or_(L, OX + 4, 57.5, 1.2, 9, '#ffffff');
        or_(L, OX - 5, 66.5, 1.2, 2, '#ffd966'); or_(L, OX + 4, 66.5, 1.2, 2, '#ffd966');
      } },
    aloha: {
      body(L) {
        oe(L, OX, 66.5, 19.2, 18.6, ['#9cf7ed', '#3ad1d6', '#1ea1ab', '#126e75'], { d: .12 });
        for (let y = 55; y <= 62; y++) { const k = y - 55; or_(L, OX - 7.2 + k * .45, y, 3.6, 1, '#e0fffb'); or_(L, OX + 3.6 - k * .45, y, 3.6, 1, '#e0fffb'); }
        for (let y = 56; y <= 62; y++) { const hw = 3.4 - (y - 56) * .5; if (hw > 0) or_(L, OX - hw, y, hw * 2, 1, '#f7e1b8'); }
        or_(L, OX - .7, 62.5, 1.4, 17.5, '#177e87');
        for (const y of [66, 72, 78]) { od(L, OX, y, '#fff8dc'); od(L, OX, y + 0.8, '#d4b483'); }
        [[-14, 61, 'p'], [9, 63, 'y'], [-12, 72, 'y'], [11, 73, 'p'], [-9, 80, 'p'], [8, 81, 'y']].forEach(([x, y, c]) => {
          os(L, OX + x, y, ['.f.', 'fcf', '.f.'], c === 'p' ? { f: '#ff8fb8', c: '#ffe27a' } : { f: '#ffe27a', c: '#ff7a33' });
          od(L, OX + x + 3, y + 1, '#268c52');
        });
      } },
    armor: {
      body(L) {
        const ST = ['#f5f9ff', '#c2d0e6', '#8598b8', '#566887', '#38455e'], GD = ['#fff2a6', '#f2bd38', '#bd8615', '#825808'];
        for (const sg of [-1, 1]) {
          oe(L, OX + sg * 17.2, 54.4, 6.6, 5.6, GD, { d: .12 });
          oe(L, OX + sg * 17.2, 53.8, 5.3, 4.3, ST, { d: .12 });
          od(L, OX + sg * 16.5, 52.5, '#ffffff');
        }
        oe(L, OX, 66.5, 19.2, 18.6, ST, { d: .12 });
        // диагональный металлический блик и центральная грань кирасы
        olin(L, OX - 12, 60, OX - 5, 73, '#ffffff');
        or_(L, OX - .6, 58, 1.6, 19, '#ffffff'); or_(L, OX + 1, 58, 1, 19, '#566887');
        oe(L, OX, 56, 13.8, 3.8, GD, { d: .12 });
        or_(L, OX - 15.5, 76.8, 31, 2.4, '#c98a12'); or_(L, OX - 15.5, 76.8, 31, 1, '#ffe27a');
        or_(L, OX - 2.8, 75.8, 5.6, 4.4, '#ffe885'); or_(L, OX - 1.2, 77, 2.4, 2, '#d93848');
        for (const [x, y] of [[-12, 63], [11, 63], [-11, 71], [10, 71]]) { od(L, OX + x, y, '#fff2a6'); od(L, OX + x, y + 1, '#9e6b0c'); }
        os(L, OX - 2.5, 63, ['..h..', 'hyyyy', '.yyy.', 'yd.dy'], { h: '#ffffff', y: '#ffd642', d: '#b87e14' });
      } },
    pajamas: { sleeve: NAVY, feet: SLIP,
      body(L) {
        oe(L, OX, 66.5, 19.2, 18.6, NAVY, { d: .12 });
        for (const [x, y] of [[-13, 60], [9, 64], [-8, 74], [12, 77], [-14, 80], [2, 82]]) os(L, OX + x, y, ['.h.', 'hyy', '.d.'], { h: '#fff9cc', y: '#ffe27a', d: '#c99b26' });
        os(L, OX + 3, 56, SPR.moon.rows, SPR.moon.map);
        or_(L, OX - 8, 66, 5, 5, '#4352bf'); or_(L, OX - 8, 66, 5, 1, '#aab6ff');
        for (const y of [62, 69, 76]) { od(L, OX - 1, y, '#ffffff'); od(L, OX, y, '#cfd8ff'); }
        or_(L, OX - 6.5, 55.8, 5.5, 2.2, '#eef2ff'); or_(L, OX + 1, 55.8, 5.5, 2.2, '#eef2ff');
      } },
    pirate: { sleeve: COAT, feet: BOOT,
      head(L, hx, hy) {
        const ex = hx - 12.5, ey = hy + 2;
        olin(L, ex + 4, ey - 5, hx + 21, hy - 11, '#1a1724'); olin(L, ex + 4, ey - 6, hx + 21, hy - 12, '#352f47');
        olin(L, ex - 5, ey - 4, hx - 24, hy - 8, '#1a1724');
        oe(L, ex, ey, 6.3, 6.7, ['#575068', '#2d2838', '#16131c'], { d: 0.08 });
        od(L, ex - 3, ey - 3, '#9c95b5'); od(L, ex - 2, ey - 3.5, '#c2bbd9');
      },
      body(L) {
        oe(L, OX, 66.5, 19.2, 18.6, COAT, { d: .12 });
        // золотые борта камзола и пышное кружевное жабо
        olin(L, OX - 6.5, 56, OX - 6.5, 76, '#f0be3c'); olin(L, OX + 6.5, 56, OX + 6.5, 76, '#f0be3c');
        for (let y = 55; y <= 66; y++) {
          const hw = 6.2 - (y - 55) * .48;
          if (hw > 0) or_(L, OX - hw, y, hw * 2, 1, (y & 1) ? '#ffffff' : '#dfd8eb');
        }
        for (const y of [60, 66, 72]) {
          od(L, OX - 8.5, y, '#fff0a6'); od(L, OX - 8.5, y + 0.8, '#c99318');
          od(L, OX + 8.5, y, '#fff0a6'); od(L, OX + 8.5, y + 0.8, '#c99318');
        }
        or_(L, OX - 15.5, 75.8, 31, 3.6, '#d93636'); or_(L, OX - 15.5, 75.8, 31, 1, '#ff8585');
        or_(L, OX - 2.5, 76.2, 5, 3.2, '#ffd94a'); or_(L, OX - 1, 77, 2, 1.6, '#2d2738');
        or_(L, OX + 8, 79, 4.2, 6.2, '#b52828'); or_(L, OX + 8, 84.5, 4.2, 1, '#ffd94a');
      } },
    robe: { sleeve: ROBE,
      body(L) {
        oe(L, OX, 66.5, 19.2, 18.6, ROBE, { d: .12 });
        const px = (X, Y) => ({ x: (X - OX) / otS + OX, y: (Y - OB) / otS + OB });
        const inBody = (X, Y) => { const p = px(X, Y); return ((p.x - OX) / 19.2) ** 2 + ((p.y - 66.5) / 18.6) ** 2 <= 1; };
        const x0 = Math.round(oX(OX - 20)), x1 = Math.round(oX(OX + 20));
        ermine(L, x0, Math.round(oY(80)), x1, Math.round(oY(86)), (X, Y) => inBody(X, Y) && px(X, Y).y >= 80);
        ermine(L, Math.round(oX(OX - 3.0)), Math.round(oY(58)), Math.round(oX(OX + 3.0)), Math.round(oY(80)), (X, Y) => inBody(X, Y) && Math.abs(px(X, Y).x - OX) <= 3.0 && px(X, Y).y < 80);
        oe(L, OX, 55.5, 17.8, 5.4, ['#ffffff', '#fffaf0', '#e6dec8'], { d: .08 });
        ermine(L, x0, Math.round(oY(50)), x1, Math.round(oY(61)), (X, Y) => { const p = px(X, Y); return ((p.x - OX) / 17.8) ** 2 + ((p.y - 55.5) / 5.4) ** 2 <= 1; });
        or_(L, OX - 3.8, 60, 1.2, 20, '#f2bd38'); or_(L, OX + 2.8, 60, 1.2, 20, '#f2bd38');
        oe(L, OX, 59.5, 3.0, 3.0, ['#fff2a6', '#e8b030', '#9e6b0c'], { d: .1 });
        of(L, OX, 59.5, 1.6, 1.6, '#e01b3c'); od(L, OX - 0.5, 59, '#ff9eb0');
      } },
  };

  const ACC = {
    shells(L, hx, hy) {
      for (let i = -15; i <= 15; i++) {
        const y = hy + 21 + Math.round(4 * (1 - (i / 16) ** 2));
        od(L, hx + i, y, '#7d4e2d');
        if (i % 3 === 0) {
          const pink = (i / 3) & 1;
          or_(L, hx + i - 1, y - 1, 2.6, 2.6, pink ? '#ff8fb8' : '#fff7eb');
          od(L, hx + i - 0.5, y - 0.8, '#ffffff');
        }
      }
      os(L, hx - 3.5, hy + 25, ['.hpppp.', 'hPpPpPd', 'pPpPpPd', '.ppPpd.', '..ppd..', '...d...'], { h: '#ffe8f2', p: '#ff96be', P: '#ffc9de', d: '#bd4873' });
    },
    monocle(L, hx, hy) {
      const ex = hx + 12.5, ey = hy + 2;
      of(L, ex, ey, 5.2, 5.2, 'rgba(180,230,255,0.22)');
      ring2(L, ex, ey, 6.5, '#c98e16'); ring2(L, ex, ey, 5.7, '#ffe27a');
      od(L, ex - 3, ey - 3.5, '#ffffff'); od(L, ex - 2, ey - 4, '#ffffff'); od(L, ex + 2, ey + 2, '#d4f2ff');
      const ch = [[ex + 4.5, ey + 5], [ex + 7.5, ey + 11], [ex + 7, ey + 18], [ex + 4, ey + 24]];
      for (let i = 0; i < ch.length - 1; i++) olin(L, ch[i][0], ch[i][1], ch[i + 1][0], ch[i + 1][1], i & 1 ? '#ffe27a' : '#d4981c');
      oe(L, ex + 4, ey + 26, 2.8, 2.8, ['#fff5b8', '#ffd23d', '#b87e10'], { d: .1 });
    },
    amulet(L, hx, hy) {
      olin(L, hx - 14, hy + 20, hx, hy + 33, '#d4981c'); olin(L, hx - 14, hy + 19.3, hx, hy + 32.3, '#ffe27a');
      olin(L, hx + 14, hy + 20, hx, hy + 33, '#d4981c'); olin(L, hx + 14, hy + 19.3, hx, hy + 32.3, '#ffe27a');
      os(L, hx - 4, hy + 30.5, ['...ggg...', '..gGwgG..', '..gcCcg..', '.gcwCCdg.', 'gcwCCCDdg', 'gcCCCCDdg', '.gcCCDdg.', '..gcDdg..', '...gdd...'],
        { g: '#d99a16', G: '#ffe878', c: '#b8eeff', C: '#45a8ff', D: '#2972d9', d: '#194999', w: '#ffffff' });
    },
  };

  const BACK = {
    backpack: {
      behind(L) {
        oe(L, OX, 66, 25.2, 18.2, ['#ffc58c', '#f28c38', '#c46018', '#8f3f0a'], { d: .12 });
        oe(L, OX, 51, 14.5, 5.2, ['#ffd09e', '#f28c38', '#b85614'], { d: .1 });
        oe(L, OX + 23.5, 74, 4.6, 7.2, ['#ffa860', '#d46d20', '#96450e'], { d: .1 });
        oe(L, OX - 23.5, 74, 4.2, 6.8, ['#ffa860', '#d46d20', '#96450e'], { d: .1 });
        or_(L, OX - 24, 66, 48, 1.2, '#b85614');
        or_(L, OX - 9, 53.5, 2.2, 3, '#ffe27a'); or_(L, OX + 7, 53.5, 2.2, 3, '#ffe27a');
      },
      front(L) {
        for (const s of [-1, 1]) {
          olin(L, OX + s * 10, 52, OX + s * 14.5, 73, '#7d3e12');
          olin(L, OX + s * 11, 52, OX + s * 15.5, 73, '#b56328');
          olin(L, OX + s * 12, 52, OX + s * 16.5, 73, '#7d3e12');
          or_(L, OX + s * 12.5 - 1, 62, 2.2, 2.2, '#ffd966');
        }
      },
    },
    jetpack: {
      behind(L) {
        const ST = ['#f5f9ff', '#bdcce3', '#7f93b5', '#4c5d7a', '#2e394d'], RD = ['#ff9c8f', '#e64c44', '#9e232b'];
        const big = LK === 'play' || LK === 'walk', fl = (big ? 7 : 4) + (Math.floor(CLK / 90) % 2);
        for (const s of [-1, 1]) {
          const cx = OX + s * 18.5;
          oe(L, cx, 66, 6.6, 14.8, ST, { d: .12 });
          oe(L, cx, 52.5, 4.6, 3.4, RD, { d: .1 });
          or_(L, cx - 6, 61, 12, 3, '#e64c44'); or_(L, cx - 6, 61, 12, 1, '#ff9c8f');
          or_(L, cx - 3.2, 79.5, 6.4, 3, '#332d40');
          for (let i = 0; i < fl; i++) {
            const w = Math.max(1, 5.4 - i * .75);
            or_(L, cx - w / 2, 82.5 + i * 1.25, w, 1.4, i < 1.5 ? '#ffffff' : i < 3 ? '#fff394' : i < 5 ? '#ff9d26' : '#ff4422');
          }
        }
      },
      front(L) {
        for (const s of [-1, 1]) {
          olin(L, OX + s * 10, 52, OX + s * 14.5, 73, '#3f4f6b');
          olin(L, OX + s * 11, 52, OX + s * 15.5, 73, '#8da2c4');
        }
        or_(L, OX - 12, 63, 24, 2, '#5c6e8c');
        oe(L, OX, 64, 2.8, 2.8, ['#a8f0ff', '#38b6ff', '#1b6ca8'], { d: 0 });
      },
    },
    wings: {
      behind(L) {
        const W = ['#ffffff', '#f0f6ff', '#cadcf7', '#9bb7e3', '#7594c7'], flap = Math.floor(CLK / 520) % 2;
        for (const s of [-1, 1]) {
          [[26.5, 50.5, 13.5, 4.5], [25, 58, 12.4, 4.3], [22.5, 65.5, 10.8, 4.1], [19, 72.5, 8.4, 3.5]].forEach(([dx, y, rx, ry], i) => {
            const yy = y - flap * (4 - i) * .75;
            oe(L, OX + s * dx, yy, rx, ry, W, { d: .1 });
            od(L, OX + s * (dx + rx - 1.2), yy, '#ffd642');
            od(L, OX + s * (dx + rx - 2.2), yy, '#fff2a6');
            od(L, OX + s * (dx + rx - 3.2), yy - 0.5, '#ffffff');
          });
          oe(L, OX + s * 15, 56 - flap * 1.5, 7.8, 8.4, W, { d: .1 });
        }
      },
    },
  };

  function legendFx(L, t) {
    if (!SLOT_ORDER.some(s => WEAR[s] && rarityOf(WEAR[s]) === 'legendary')) return;
    [[-30, 34, 0], [31, 30, 1.7], [-27, 64, 3.1], [29, 60, 4.6]].forEach(([dx, y, ph]) => {
      const k = Math.floor(t / 280 + ph) % 4, x = OX + dx;
      if (k === 0) { dot(L, x, y, '#fff3a8'); return; }
      dot(L, x, y, '#ffffff'); dot(L, x - 1, y, '#ffe27a'); dot(L, x + 1, y, '#ffe27a'); dot(L, x, y - 1, '#ffe27a'); dot(L, x, y + 1, '#ffe27a');
      if (k === 2) { dot(L, x - 2, y, '#ffe27a'); dot(L, x + 2, y, '#ffe27a'); dot(L, x, y - 2, '#ffe27a'); dot(L, x, y + 2, '#ffe27a'); }
    });
  }

  function drawWear(L, hx, hy) {
    const w = WEAR || {}, fit = OUTFIT[w.suit];
    if (fit && fit.head) fit.head(L, hx, hy);
    if (w.acc && BACKV) backAcc(L, hx, hy, w.acc);
    else if (w.acc) { if (ACC[w.acc]) ACC[w.acc](L, hx, hy); else { drawNeckWear(L, hx, hy, w.acc); drawFaceWear(L, hx, hy, w.acc); } }
    const h = w.head && (HEAD[w.head] || HAT[w.head]);
    if (h) sprc(L, hx + (h.dx || 0), hy + h.by - (h.bob ? Math.floor(CLK / 700) % 2 * 1.3 : 0), h.rows, h.map, h.sc);
  }
  const BACKACC = { scarf: '#e04848', bandana: '#4f83e8', shells: '#f6e6c8', amulet: '#7fe8ff', bow: '#ff5a8a' };
  function backAcc(L, hx, hy, id) { const c = BACKACC[id]; if (c) oe(L, hx, hy + 18.5, 17, 3.4, [c, c], { d: 0 }); }
  function drawHeadBack(L, hx, hy) {
    oe(L, hx - 19, hy - 14, 5.5, 5.5, FUR, { d: .12 }); oe(L, hx + 19, hy - 14, 5.5, 5.5, FUR, { d: .12 });
    oe(L, hx, hy, 25.5, 19.2, FUR, { d: .14 });
    for (const [a, b] of [[-8, -10], [-3, -12], [3, -11], [9, -9], [-12, -2], [12, -3], [0, -4], [-6, 3], [7, 4], [-14, 6], [14, 7], [-2, 9]]) { od(L, hx + a, hy + b, '#824e2e'); od(L, hx + a + 1, hy + b, '#9c623c'); }
    drawWear(L, hx, hy);
  }
  const BACKO = {};
  const hexInt = (h) => parseInt(h.slice(1), 16);
  function backOutfit(L, id) {
    if (!id) return;
    const key = id + '|' + otS; let B = BACKO[key];
    if (!B) {
      const T = newLayer(OW, OH); bodyFront(T, id);
      const img = T.x.getImageData(0, 0, OW, OH), d = img.data, bm = new Map(BELLY.map(h => [hexInt(h), hexInt(FUR[2])]));
      const cols = new Int32Array(OW * OH).fill(-1), cnt = new Map(); let total = 0;
      for (let i = 0; i < OW * OH; i++) if (d[i * 4 + 3]) { let c = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]; if (bm.has(c)) c = bm.get(c); cols[i] = c; cnt.set(c, (cnt.get(c) || 0) + 1); total++; }
      let keep = [...cnt].filter(([, n]) => n >= total * 0.04).map(([c]) => c);
      if (keep.length < 2) keep = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
      const near = (c) => { let best = keep[0], bd = 1e9; for (const k of keep) { const dr = (c >> 16) - (k >> 16), dg = ((c >> 8) & 255) - ((k >> 8) & 255), db = (c & 255) - (k & 255), dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = k; } } return best; };
      for (let i = 0; i < OW * OH; i++) if (cols[i] >= 0) { const c = keep.includes(cols[i]) ? cols[i] : near(cols[i]); d[i * 4] = c >> 16; d[i * 4 + 1] = (c >> 8) & 255; d[i * 4 + 2] = c & 255; d[i * 4 + 3] = 255; }
      T.x.putImageData(img, 0, 0); B = BACKO[key] = T;
    }
    L.x.drawImage(B.c, 0, 0);
  }
  function bodyBack(L, id) { const b = BACK[id]; if (b) b.behind(L); else legacyBack(L, id); }
  function backFront(L, id) { const b = BACK[id]; if (b && b.front) b.front(L); }
  function bodyFront(L, id) { const o = OUTFIT[id]; if (o) o.body(L); else legacyFront(L, id); }

