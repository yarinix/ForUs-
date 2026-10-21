  // =====================================================================
  // ТЕНИ, СВЕТ И «ЖИВОСТЬ» МИРА
  // Запечённые тени (shade, aoStrip) лежат прямо в картинках комнат, а всё, что движется или меняется со временем,
  // рисуется поверх сцены каждый кадр: тени предметов и выдры, пылинки в солнечном луче, птицы, бабочки, листья,
  // трава на ветру, круги на воде, тени облаков, виньетка и тёплый свет заката (см. frame ниже).
  // =====================================================================
  // дневное/ночное состояние: насколько сейчас «день» (1 — полдень, 0 — глубокая ночь)
  const dayK = () => 1 - Math.min(1, dayAlpha() / 0.2);

  // виньетка: углы кадра чуть темнее. Рисуется один раз при layout() «пиксельным» способом — узором Байера, без размытия
  const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  function buildVignette(W, H) {
    const L = newLayer(W, H), r0 = .74;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x / (W - 1) - .5) * 2, dy = (y / (H - 1) - .5) * 2, t = (Math.sqrt(dx * dx * .9 + dy * dy * .8) - r0) / (1 - r0);   // 0 в центре … 1 в углах
      if (t <= 0 || t <= (BAYER4[y & 3][x & 3] + .5) / 16) continue;
      L.x.fillStyle = 'rgba(14,8,40,' + (t > .75 ? .16 : t > .4 ? .11 : .07) + ')'; L.x.fillRect(x, y, 1, 1);
    }
    return L;
  }
  function drawVignette() { if (view.vig) sx.drawImage(view.vig.c, 0, 0); }

  // тёплый свет рассвета и заката: оранжевая дымка, сильнее всего около 18:50 и 6:35
  function drawWarmTint(out) {
    const h = gameHour(), k = Math.max(1 - Math.abs(h - 18.8) / 1.7, 1 - Math.abs(h - 6.6) / 1.3, 0);
    if (k < .02) return;
    sx.fillStyle = 'rgba(255,150,80,' + (.14 * k * (out ? 1 : .6)).toFixed(3) + ')'; sx.fillRect(0, 0, view.W, view.H);
  }

  // тени облаков бегут по земле на улице (только днём) — со скоростью, близкой к скорости облаков в небе
  function cloudShadows(now, W, fy) {
    const h = gameHour(); if (h < 7.5 || h > 17.5) return;
    [[2.4, 0, 44, 9, 30], [1.5, 40, 34, 7, 48]].forEach(([sp, off, rx, ry, y]) => softShadow(sx, ((now / 1000 * sp + off) % (W + 120)) - 60, fy + y, rx, ry, .07));
  }

  // тень предмета мебели: пол — овал под основанием (узкие вещи вроде фонаря получают узкую тень), стена — силуэт со сдвигом вниз-вправо
  const SHW = { lamppost: .5, lamp: .5, birdhouse: .55, tree: .6, plant: .62, cactus: .62, campfire: .8 };
  const SILC = new WeakMap();
  function furnSil(f) {
    let s = SILC.get(f.c); if (s) return s;
    s = document.createElement('canvas'); s.width = f.c.width; s.height = f.c.height;
    const g = s.getContext('2d'); g.drawImage(f.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(46,24,64)'; g.fillRect(0, 0, s.width, s.height);
    SILC.set(f.c, s); return s;
  }
  function itemShadow(o, dx) {
    if (o.c.pl === 'wall') { sx.globalAlpha = .26; sx.drawImage(furnSil(o.f), o.x - (o.f.w >> 1) + dx + 1, o.y - (o.f.h >> 1) + 2); sx.globalAlpha = 1; return; }
    if (isFlat(o.id, o.c)) return;                  // плед и ковры лежат на земле плашмя — тени у них нет
    const rx = o.f.w * (SHW[o.id] || .9) / 2;
    softShadow(sx, o.x + dx + 1, o.y - 1, rx, Math.max(2, Math.min(4, rx * .24)), .22);
  }

  // ---------- «живость»: мелкие движущиеся детали ----------
  // пылинки в луче из окна: поднимаются вдоль луча (тот же конус, что и пятно света на полу) и мерцают. Ночью — голубоватые и тусклее.
  const MOTES = (() => { const r = mulberry(77); return Array.from({ length: 18 }, () => ({ a: r(), u: r(), sp: .5 + r() * .8, ph: r() * 6.28 })); })();
  function drawMotes(now, room, dx) {
    const w = view.win && view.win[room]; if (!w) return;
    const day = dayAlpha() < .18, maxA = (view.H - w.wy - w.wh) * w.cover, col = day ? '255,247,205' : '190,205,255';
    for (const m of MOTES) {
      const along = ((m.a + now * 0.000012 * m.sp) % 1) * maxA, y = w.wy + w.wh + along + Math.sin(now / 900 * m.sp + m.ph) * 1.2;
      const left = w.wx + along * .55, right = w.wx + w.ww + along * 1.0, x = left + (right - left) * clamp(m.u + Math.sin(now / 2400 * m.sp + m.ph) * .08, 0, 1);
      const tw = .28 + .55 * Math.max(0, Math.sin(now / 420 * m.sp + m.ph));
      sx.fillStyle = 'rgba(' + col + ',' + (tw * (day ? 1 : .5)).toFixed(2) + ')'; sx.fillRect(Math.round(x + dx), Math.round(y), 1, 1);
    }
  }
  // бабочки (днём, двор и лес): порхают по восьмёркам, крылья машут в два кадра
  const BFLY = [{ ph: .3, cx: .3, cy: 16, c: '#ff8ab8', l: '#ffd1e4' }, { ph: 2.1, cx: .62, cy: 34, c: '#ffd93d', l: '#fff3a8' }, { ph: 4.2, cx: .8, cy: 22, c: '#8ac8ff', l: '#d6eeff' }];
  function drawButterflies(now) {
    const k = dayK(); if (k < .3) return;
    sx.globalAlpha = k;
    for (const b of BFLY) {
      const x = Math.round(view.W * b.cx + Math.sin(now / 2300 + b.ph) * 26 + Math.sin(now / 900 + b.ph * 2) * 5), y = Math.round(view.fy + 10 + b.cy + Math.sin(now / 1700 + b.ph * 2) * 9);
      const open = Math.floor(now / 140 + b.ph * 7) % 2 === 0;
      for (const [a, c, col] of open ? [[-2, -1, b.c], [2, -1, b.c], [-1, -1, b.l], [1, -1, b.l], [-1, 0, b.c], [1, 0, b.c]] : [[-1, -1, b.c], [1, -1, b.c]]) { sx.fillStyle = col; sx.fillRect(x + a, y + c, 1, 1); }
      sx.fillStyle = '#3a2440'; sx.fillRect(x, y, 1, 2);
    }
    sx.globalAlpha = 1;
  }
  // листья (лес): плавно падают, покачиваясь
  function drawLeaves(now) {
    const cols = ['#e0a35a', '#d9722e', '#9fd06a', '#f0c850'];
    for (let i = 0; i < 8; i++) {
      const x = Math.round(((i * 37 + 13) % 100) / 100 * view.W + Math.sin(now / 800 + i * 1.9) * 7), y = Math.round(((now / 1000 * (7 + (i % 3) * 3) + i * 23) % (view.H + 12)) - 6);
      if (y < 4 || y > view.H - 6) continue;
      sx.fillStyle = cols[i % 4]; sx.fillRect(x, y, 1, 1); sx.fillRect(x + 1, y + (Math.floor(now / 300 + i) % 2), 1, 1);
    }
  }
  // трава на переднем плане колышется на ветру (по три травинки в пучке, вершинка смещается в такт)
  const TUFT_COL = { yard: ['#3f8f48', '#58bd5a', '#8fe085'], forest: ['#2c6a40', '#3f9a58', '#7fcf86'], lake: ['#3f8f48', '#62b762', '#b4f0a4'] };
  function makeTufts(room) {
    const r = mulberry(room.length * 131 + room.charCodeAt(0)), y0 = view.baseY + 16, out = [];
    for (let i = 0; i < 16; i++) out.push({ x: Math.floor(r() * view.W), y: Math.round(y0 + r() * Math.max(2, view.H - 3 - y0)), ph: r() * 4, h: 3 + Math.floor(r() * 3) });
    return out;
  }
  function drawTufts(now, room) {
    const T = (view.tufts[room] = view.tufts[room] || makeTufts(room)), pal = TUFT_COL[room] || TUFT_COL.yard;
    for (const t of T) {
      const sway = [-1, 0, 1, 0][Math.floor(now / 420 + t.ph) % 4];
      for (const [bx, hh] of [[-1, t.h - 1], [0, t.h], [1, t.h - 2]]) for (let k = 0; k < hh; k++) {
        sx.fillStyle = k === hh - 1 ? pal[2] : k < 1 ? pal[0] : pal[1];
        sx.fillRect(t.x + bx + Math.round(sway * k / hh), t.y - k, 1, 1);
      }
    }
  }
  // круги на воде: три расходящихся кольца, в разное время и в разных местах
  function drawRipples(now) {
    const w = view.water; if (!w) return;
    for (let i = 0; i < 3; i++) {
      const per = 3400, t0 = now + i * 1130, c = Math.floor(t0 / per), t = (t0 % per) / per;
      const cx = ((c * 61 + i * 29) % 100) / 100 * (view.W - 20) + 10, cy = w.y0 + 4 + ((c * 37 + i * 17) % Math.max(1, w.y1 - w.y0 - 7)), r = 1.5 + t * 8;
      sx.fillStyle = 'rgba(235,248,255,' + ((1 - t) * .55).toFixed(2) + ')';
      const n = Math.ceil(r * 4) + 8;
      for (let k = 0; k < n; k++) { const th = k / n * 6.2832; sx.fillRect(Math.round(cx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r * .38), 1, 1); }
    }
  }
  // блики на воде: короткие белые чёрточки, вспыхивают то тут, то там
  function drawGlints(now) {
    const w = view.water; if (!w) return;
    for (let i = 0; i < 16; i++) if ((Math.floor(now / 380 + i * 3.7) % 6) === 0) { sx.fillStyle = 'rgba(255,255,255,.8)'; sx.fillRect(Math.round(((i * 37) % 100) / 100 * view.W), w.y0 + 2 + (i * 53) % Math.max(1, w.y1 - w.y0 - 3), 2, 1); }
  }
  // drawWater — вся рябь на озере одним вызовом. Рисуется сразу после фона, до предметов и выдры: всё, что стоит на воде, закрывает круги.
  function drawWater(now, tr) {
    if (view.cur === 'lake' || (tr && tr.to === 'lake')) drawGlints(now);
    if (view.cur === 'lake' && !tr) drawRipples(now);
  }
  // drawLife — все «живые» детали одним вызовом. Зовётся из frame после выдры и мебели.
  // Пылинки — в домашних комнатах (и во время перехода — в обеих); остальное — только в текущей уличной комнате (не во время перехода).
  function drawLife(now, tr) {
    for (const [r, dx] of view.fx) drawMotes(now, r, dx);
    if (tr) return;
    const room = view.cur;
    if (room === 'yard' || room === 'forest') drawButterflies(now);
    if (room === 'forest') drawLeaves(now);
    if (room === 'yard' || room === 'forest' || room === 'lake') drawTufts(now, room);
  }

