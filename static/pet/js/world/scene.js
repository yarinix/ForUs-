  // ---------- сцена, комнаты, переходы ----------
  const K_PREF = 3;
  const ROOMS = {
    home:    { title: 'Гостиная', act: 'play',  icon: 'ball', label: 'Играть',  sub: 'заработать монеты',   left: 'kitchen', right: 'bedroom' },
    kitchen: { title: 'Кухня',    act: 'feed',  icon: 'fish', label: 'Кормить', sub: 'выбрать еду',          left: null,      right: 'home' },
    bedroom: { title: 'Спальня',  act: 'sleep', icon: 'moon', label: 'Спать',   sub: 'набраться сил',       left: 'home',    right: null },
    yard:    { title: 'Задний двор', out: true, act: 'play',   icon: 'ball', label: 'Играть',        sub: 'заработать монеты',   left: 'home',   leftLabel: 'Домой', right: 'forest' },
    forest:  { title: 'Лес',         out: true, act: 'forage', icon: 'mush', label: 'Искать грибы',  sub: 'ягоды и монетки',     left: 'yard',   right: 'lake' },
    lake:    { title: 'Озеро',       out: true, act: 'angle',  icon: 'rod',  label: 'Рыбачить',      sub: 'вдруг клюнет рыбка',  left: 'forest', right: null },
  };
  const GLOW = { lamppost: { y: 0.8, r: 24 }, campfire: { y: 0.55, r: 28 }, lamp: { y: 0.78, r: 22 }, nightstand: { y: 0.84, r: 26 } };
  const view = { K: 3, W: 112, H: 150, rooms: {}, cur: 'home', trans: null, baseY: 0, ox: 0 };
  const sc = $('pixcv'), sx = sc.getContext('2d'); sx.imageSmoothingEnabled = false;

  function layout() {
    const st = $('stage'), r = st.getBoundingClientRect(); if (r.width < 50 || r.height < 50) return;
    if (!view.edit) view.normH = Math.round(r.height);                              // запоминаем «обычную» высоту комнаты для режима расстановки
    const K = Math.max(2, Math.min(5, Math.floor(r.width / 112) || K_PREF));
    const W = Math.floor(r.width / K), H = Math.floor(r.height / K);
    view.K = K; view.W = W; view.H = H; sc.width = W; sc.height = H;
    sc.style.width = (W * K) + 'px'; sc.style.height = (H * K) + 'px'; sc.style.left = Math.floor((r.width - W * K) / 2) + 'px'; sc.style.top = Math.floor((r.height - H * K) / 2) + 'px';
    const fy = Math.round(H * 0.5), baseY = fy + Math.round((H - fy) * 0.5);
    view.baseY = baseY; view.fy = fy; view.ox = Math.round(W * 0.47); view.oxOut = Math.round(W * 0.58);
    view.win = {}; view.tufts = {};                                              // окна (для пылинок) и пучки травы — пересчитываются вместе с комнатами
    view.rooms = { home: buildHome(W, H, fy, baseY, false), kitchen: buildKitchen(W, H, fy, baseY, false), bedroom: buildBedroom(W, H, fy, baseY, false), yard: buildYard(W, H, fy, baseY), forest: buildForest(W, H, fy, baseY), lake: buildLake(W, H, fy, baseY) };
    view.roomsN = { home: buildHome(W, H, fy, baseY, true), kitchen: buildKitchen(W, H, fy, baseY, true), bedroom: buildBedroom(W, H, fy, baseY, true) };   // ночные варианты домашних комнат
    view.vig = buildVignette(W, H);                                                  // виньетка по размеру кадра
  }

  const ease = (p) => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  // drawRoom — рисует комнату name со сдвигом dx. Для домашних комнат поверх дневного слоя кладётся ночной,
  // прозрачность = насколько сейчас темно по реальному времени (dayAlpha: 0 днём … 0.36 ночью).
  function drawRoom(name, dx) {
    sx.drawImage(view.rooms[name].c, dx, 0);
    const N = view.roomsN && view.roomsN[name], k = Math.min(1, dayAlpha() / 0.36);
    if (N && k > 0.01) { sx.globalAlpha = k; sx.drawImage(N.c, dx, 0); sx.globalAlpha = 1; }
  }
  function frame(now) {
    if (!view.rooms.home) return;
    let look = otter.dataset.look;
    const tr = view.trans, out = outdoor(tr ? tr.to : view.cur);
    if (out) drawSky(sx, now, gameHour(), view.W, view.fy);
    if (tr) {
      const p = Math.min(1, (now - tr.t0) / tr.dur), e = ease(p), dx = Math.round(tr.dir * view.W * e);
      drawRoom(tr.from, dx); drawRoom(tr.to, dx - tr.dir * view.W);
      view.fx = [[tr.from, dx], [tr.to, dx - tr.dir * view.W]];
      look = 'walk';
      if (p >= 1) { view.trans = null; view.cur = tr.to; onRoomShown(); }
    } else { drawRoom(view.cur, 0); view.fx = [[view.cur, 0]]; }
    if (out) cloudShadows(now, view.W, view.fy);              // тени облаков бегут по земле
    drawWater(now, tr);                                        // круги и блики на воде — ПОД мебелью и выдрой (лодка или скамейка их закрывают)
    for (const [r, dx] of view.fx) drawItems(r, dx, false, now);
    const blink = (Math.floor(now / 160) % 31) === 0;
    const hop = look === 'play' ? -Math.round(Math.abs(Math.sin(now / 130)) * 7) : look === 'walk' ? -(Math.floor(now / 150) % 2) : (look === 'sleep' || look === 'sleepy' ? (Math.floor(now / 900) % 2) : (Math.floor(now / 650) % 2));
    if (view.fish) { if (now - view.fish.t0 > view.fish.dur) view.fish = null; else look = (view.fish.hit && now - view.fish.t0 > 3900) ? 'feed' : 'idle'; }
    const OSC = out ? 0.64 : 0.8, kk = OSC / 0.8; view.otsCur = OSC;
    let ox = out ? view.oxOut : view.ox, alpha = 1, doorOpen = false;
    const en = view.enter;
    if (en && view.cur === 'yard' && !tr && view.door) {
      const p = (now - en.t0) / en.dur;
      if (p >= 1) view.enter = null; else { ox = Math.round(view.door.cx + (ox - view.door.cx) * ease(clamp((p - 0.15) / 0.85, 0, 1))); alpha = clamp(p / 0.18, 0, 1); look = 'walk'; doorOpen = p < 0.6; }
    }
    view.curOx = ox;
    if (doorOpen) { const d = view.door; sx.fillStyle = '#2e1a10'; sx.fillRect(d.x, d.y, d.w, d.h); sx.fillStyle = '#7a4a28'; sx.fillRect(d.x + 3, d.y + (d.h >> 1), d.w - 6, d.h >> 1); sx.fillStyle = '#b8723a'; sx.fillRect(d.x, d.y, 4, d.h); }
    // тень выдры: мягкий двойной овал прямо под лапками (подошвы на baseY + 5); когда выдра подпрыгивает, тень сжимается и бледнеет
    if (view.edit) alpha = 0;                                  // в режиме расстановки выдра уходит, чтобы не мешать
    sx.globalAlpha = alpha; { const lift = Math.max(0, -hop), k = 1 - Math.min(.45, lift * .07); softShadow(sx, ox + 1, view.baseY + 5, 17 * kk * k, 3.4 * k, .32 * (1 - Math.min(.5, lift * .08))); }
    const tentSleeping = !!(S && S.sleeping && out && S.placed && S.placed.tent && S.placed.tent.room === view.cur);
    if (!tentSleeping && !view.edit) {
      const backV = !!view.fish && !(view.fish.hit && now - view.fish.t0 > 3900);
    const O = drawOtter(now, look, blink, null, { s: out ? OSC : 0, back: backV });
      sx.drawImage(O.c, ox - OX, view.baseY - OB + 4 + hop);
    }
    sx.globalAlpha = 1;
    if (view.fish && view.cur === 'lake' && !tr) drawFishing(sx, now, ox);
    for (const [r, dx] of view.fx) drawItems(r, dx, true, now);
    if (look === 'play' && !view.edit && (view.cur === 'home' || view.cur === 'yard')) {
      const by = view.baseY - 4 - Math.round(Math.abs(Math.sin(now / 160)) * 26), bx = ox + 34;
      const B = newLayer(14, 14); ell(B, 7, 7, 5.5, 5.5, BLUE); for (let i = -4; i <= 4; i++) dot(B, 7 + i, 6 + Math.round(i * .35), '#fff'); outline(B);
      sx.drawImage(B.c, bx - 7, by - 7);
    }
    drawLife(now, tr);                                       // пылинки, бабочки, листья, трава, круги на воде
    drawVignette(); drawWarmTint(out);                       // виньетка и тёплый свет заката
    { const a = dayAlpha() * (out ? 0.75 : 1); if (a > 0.01) { sx.fillStyle = 'rgba(10,16,64,' + a.toFixed(3) + ')'; sx.fillRect(0, 0, view.W, view.H); } }
    { const a = dayAlpha(); if (a > 0.04) {
      for (const [r, dx] of view.fx) for (const o of roomItems(r)) { const g = GLOW[o.id]; if (!g) continue; const gx = o.x + dx, gy = o.y - o.f.h * g.y, k = Math.min(1, a / 0.2), gr = sx.createRadialGradient(gx, gy, 1, gx, gy, g.r);
        gr.addColorStop(0, 'rgba(255,214,120,' + (0.55 * k).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,214,120,0)'); sx.fillStyle = gr; sx.fillRect(gx - g.r, gy - g.r, g.r * 2, g.r * 2); }
      if (out && !tr && view.cur !== 'lake') for (let i = 0; i < 9; i++) { const fx = ((i * 0.137 + now * 0.000012 * (1 + i % 3)) % 1) * view.W, fy_ = view.fy + 10 + ((i * 41) % 60) + Math.sin(now / 900 + i) * 3, b = (Math.sin(now / 500 + i * 2) + 1) / 2;
        sx.fillStyle = 'rgba(220,255,120,' + (0.25 * b * Math.min(1, a / 0.2)).toFixed(2) + ')'; sx.fillRect(Math.round(fx) - 1, Math.round(fy_) - 1, 3, 3); sx.fillStyle = 'rgba(240,255,150,' + (b * Math.min(1, a / 0.2)).toFixed(2) + ')'; sx.fillRect(Math.round(fx), Math.round(fy_), 1, 1); } } }
    if (!view.trans && view.cur === 'bedroom' && look === 'sleep') { sx.fillStyle = 'rgba(12,18,70,.38)'; sx.fillRect(0, 0, view.W, view.H); }
  }
  // положение и размеры выдры в «пикселях игры» — для касания
  function otterHit(lx, ly) {
    const s = view.otsCur || 0.8;
    return Math.abs(lx - (view.curOx != null ? view.curOx : view.ox)) < 23 * s / 0.8 && ly > view.baseY + 4 + (14 - OB) * s && ly < view.baseY + 4;
  }

  // ---------- реальное время: день и ночь по часам BOT_TIMEZONE (час приходит с сервера) ----------
  function gameHour() {
    if (!S || S.hour == null) return 12;
    return (S.hour + (Date.now() - (S._at || Date.now())) / 3600000) % 24;
  }
  function dayAlpha() { return dayAlphaAt(gameHour()); }
  function dayAlphaAt(h) {
    const N = 0.36;
    if (h >= 22 || h < 5) return N;
    if (h < 8) return N * (1 - (h - 5) / 3);       // рассвет
    if (h < 18) return 0;
    return N * (h - 18) / 4;                         // закат
  }
  const fmtLeft = (sec) => { sec = Math.max(0, Math.ceil(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? h + ' ч ' + m + ' мин' : (m ? m + ' мин ' + s + ' с' : s + ' с'); };
  function updateSleep() {
    const bar = $('sleepbar'); if (!S) return;
    if (S.sleeping) {
      const left = S.sleep_until - (Date.now() / 1000 + skew);
      if (left <= 0) { if (!wakeAsked) { wakeAsked = true; setTimeout(() => { wakeAsked = false; refresh(false); }, 1500); } }
      $('sleeptxt').innerHTML = '';
      $('sleeptxt').append('«' + S.name + '» спит… осталось ' + fmtLeft(left));
      const sm = document.createElement('small'); sm.textContent = 'Энергия восстанавливается во сне'; $('sleeptxt').appendChild(sm);
    }
    bar.classList.toggle('show', !!S.sleeping);
    $('hint').style.visibility = S.sleeping ? 'hidden' : '';
    const night = dayAlpha() > 0.2; if (view && ROOMS[view.cur]) $('roomname').textContent = ROOMS[view.cur].title + (night ? ' 🌙' : '');
  }
  $('wakebtn').addEventListener('click', () => act('wake', null));
  setInterval(updateSleep, 1000);

  // аватарка: голова выдры
  function drawAvatar() {
    const cv = $('avcv'), L = newLayer(60, 48), keep = otS; otS = 1; WEAR = (S && S.worn) || {}; drawHead(L, 30, 26, 'idle', false); otS = keep; outline(L, OTT_OUT);
    cv.width = 60; cv.height = 48; cv.getContext('2d').drawImage(L.c, 0, 0);
  }

