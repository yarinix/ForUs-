  // ---------- РЫБАЛКА: мини-игра ----------
  // Кнопка «Рыбачить» на озере открывает отдельную сцену: озеро, удочка и шкала силы справа.
  //   aim   — шкала бегает вверх-вниз; тап останавливает её: чем выше, тем дальше заброс и крупнее рыба
  //   cast  — поплавок летит туда, куда показывал кружок на воде
  //   wait  — ждём; поплавок иногда дёргается — это рыба пробует наживку, тянуть ещё рано!
  //   bite  — поплавок ушёл под воду: успей нажать «Тянуть!» (чем дальше заброс, тем меньше времени)
  //   pull / miss → карточка улова. Что именно поймалось, решает сервер (pet_data/fishing.py) по силе заброса.
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
  // кривая (квадратичная Безье) пиксельными отрезками — удилище и леска
  function pxCurve(g, x0, y0, cx, cy, x1, y1, col, n = 14) {
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t, x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1; pxLine(g, px, py, x, y, col); px = x; py = y; }
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  const FISH_SPR = {
    perch:    { rows: ['...dd....o', '.dgdgdgdoo', 'gkgdgdgdgo', 'gwwwwwwwoo', '.wwwwwww.o', '...o.o....'], map: { g: '#8fc46a', d: '#4f8a3a', w: '#fff2c8', o: '#ff9a3c', k: OUT } },
    crucian:  { rows: ['...hhh....', '.hhbbbbh.o', 'hkbbbbbbbo', 'bbbbbbbbbo', '.dbbbbbd.o', '...ddd....'], map: { h: '#ffe08a', b: '#f2b33a', d: '#c27f1c', k: OUT } },
    pike:     { rows: ['......dd.......', '.gggggggggggd..', 'kgdgdgdgdgdggdd', 'gwwwwwwwwwwgd.d', '.wwwwwwwwww....'], map: { g: '#6fa85a', d: '#3f6e34', w: '#e8f2c8', k: OUT } },
    goldfish: { rows: ['...hbb...o', '.hhbbbbbbo', 'bbkbbbbbbo', 'bLLLLLbbdo', '.dddddddo.', '...ddd....'], map: { b: '#ffc21a', h: '#fff07a', d: '#e08a00', L: '#fff6c8', o: '#ff9a3c', k: OUT } },
    boot:     { rows: ['..bbbb...', '..bbbb...', '..bhbb...', '..bbbbbb.', '.bbbbbbbb', 'sssssssss'], map: { b: '#7a5236', h: '#a8784e', s: '#3b2a20' } },
    fish_std: { rows: ['...hbb...o', '.hhbbbbbbo', 'bbkbbbbbbo', 'bLLLLLbbdo', '.dddddddo.', '...ddd....'], map: { b: '#ff9a3c', h: '#ffc278', d: '#d97218', L: '#ffd08a', o: '#ff9a3c', k: OUT } },
  };
  function fishLayer(id) {
    const s = FISH_SPR[id] || FISH_SPR.fish_std, w = Math.max(...s.rows.map(r => r.length)), L = newLayer(w + 2, s.rows.length + 2);
    spr(L, 1, 1, s.rows, s.map); outline(L); return L;
  }

  const FZ = [34, 71];                                                        // границы зон: близко / средне / далеко
  const BITE_WIN = (p) => p < FZ[0] ? 1150 : p < FZ[1] ? 900 : 700;          // сколько мс есть, чтобы подсечь
  const METER_T = 1500;                                                      // шкала: 0 → 100 → 0 за 1,5 секунды
  let FG = null, FG_BAG = {}, FG_STREAK = 0, fgHint = '';

  function buildFishBg() {
    const W = view.W, H = view.H, key = W + 'x' + H;
    if (view.fishBg && view.fishBg.key === key) return;
    const R = newLayer(W, H), r = mulberry(77), hy = Math.round(H * 0.3);
    hills(R, W, hy, '#a9c4dc', 14, 21, 6); hills(R, W, hy, '#8fb3cf', 8, 22, 2);
    for (let x = -2; x < W + 6; x += 4 + Math.floor(r() * 4)) pine(R, x, hy + 1, 8 + Math.floor(r() * 7), GREEN.far);
    band(R, 0, hy + 1, W, H - hy - 1, ['#9be0ff', '#7ccaf5', '#5cb0e8', '#4596d6', '#3682c4', '#2868a6']);
    for (let x = 0; x < W; x += 2) rect(R, x, hy + 1, 1, 2 + (x % 3), '#4a98cf');              // отражение сосен
    for (let i = 0; i < 40; i++) { const y = hy + 4 + Math.floor(r() * (H - hy - 26)), x = Math.floor(r() * W), w = 2 + Math.floor(r() * 5 * (y - hy) / (H - hy)); rect(R, x, y, w, 1, i % 3 ? '#cdeeff' : '#2a69a8'); }
    // кувшинки по краям
    for (const [x, y, s] of [[W * 0.08, hy + 18, 3], [W * 0.92, hy + 30, 4], [W * 0.84, H - 40, 5]]) { flat(R, Math.round(x), Math.round(y), s + 0.5, s * 0.4, '#25699e'); flat(R, Math.round(x), Math.round(y) - 1, s, s * 0.38, '#4fb35a'); }
    // деревянные мостки снизу слева, на них сидит выдра
    const py = H - 22, px1 = Math.round(W * 0.44);
    rect(R, 0, py, px1, H - py, '#a8723e');
    for (let x = 0; x < px1; x += 6) { rect(R, x, py, 1, H - py, '#7a4a28'); rect(R, x + 1, py, 1, H - py, '#c48a50'); }
    rect(R, 0, py, px1, 1, '#e0a868'); rect(R, 0, py + 1, px1, 1, '#c48a50');
    for (const x of [4, px1 - 5]) { rect(R, x, py + 2, 3, H - py, '#5a3820'); rect(R, x, py + 2, 1, H - py, '#7a5236'); }
    rect(R, px1 - 1, py, 2, H - py, '#6e4527');
    for (let x = px1 + 1; x < px1 + 14; x += 3) dot(R, x, py + 4 + (x % 2), '#d8f4ff');            // пена у мостков
    // ведёрко для улова
    rect(R, 6, py - 7, 9, 7, '#9fb7cf'); rect(R, 6, py - 7, 9, 1, '#dce8f5'); rect(R, 6, py - 7, 1, 7, '#c4d4e4'); rect(R, 14, py - 7, 1, 7, '#6f8296'); rect(R, 7, py - 9, 7, 1, '#6f8296');
    view.fishBg = { c: R.c, key, hy, py, px1 };
  }
  const meterAt = (now) => { const u = ((now - FG.m0) % METER_T) / METER_T; return Math.round((u < 0.5 ? u * 2 : (1 - u) * 2) * 100); };
  // куда упадёт поплавок при силе p: ближе — внизу у мостков и крупнее, дальше — у горизонта и мельче
  function bobAt(p) {
    const d = p / 100, B = view.fishBg;
    return { x: Math.round(lerp(view.W * 0.52, view.W * 0.68, d)), y: Math.round(lerp(view.H - 30, B.hy + 6, Math.pow(d, 0.8))), big: d < 0.5 };
  }
  function otterPos() { return { x: Math.round(view.W * 0.27), y: view.fishBg.py + 7 }; }

  function openFishing() {
    if (isGuest()) { toast('В гостях можно только смотреть 👀'); return; }
    if (busy || view.trans || !S || view.cur !== 'lake') return;
    if (S.sleeping) { say(S.name + ' спит 💤'); return; }
    if (S.energy < 15) { say(S.name + ' слишком устал для рыбалки. Пусть поспит 💤'); SFX.play('no'); return; }
    view.use = null; view.walk = null; view.ux = null;
    buildFishBg(); fgHint = $('hint').textContent;
    $('app').classList.add('fishing'); $('fishui').hidden = false;
    view.fishGame = true; fishAim(); renderBag();
    haptic('light'); SFX.play('click');
    requestAnimationFrame(fishLoop);
  }
  // ~30 кадров в секунду (основной цикл игры — 10): плавно, но не грузит слабые телефоны
  let fgLast = 0;
  function fishLoop(n) { if (!view.fishGame) return; if (n - fgLast >= 33) { fgLast = n; frame(n); } requestAnimationFrame(fishLoop); }
  function closeFishing() {
    if (!view.fishGame) return;
    view.fishGame = false; FG = null;
    $('app').classList.remove('fishing'); $('fishui').hidden = true; fishCard(null);
    $('hint').textContent = fgHint || 'Погладь выдру или нажми на мебель 💕';
  }
  function fishAim() {
    const now = performance.now();
    FG = { phase: 'aim', t0: now, m0: now, p: 0 };
    fishCard(null); setFishBtn();
  }
  function setFishBtn() {
    const b = $('fishbtn'), ph = FG ? FG.phase : '', lbl = b.querySelector('.lbl'), sm = b.querySelector('small');
    b.classList.toggle('bite', ph === 'bite'); b.classList.toggle('wait', ph === 'cast' || ph === 'wait' || ph === 'pull' || ph === 'miss');
    b.style.visibility = ph === 'result' ? 'hidden' : 'visible';
    const T = { aim: ['Забросить', 'останови шкалу силы'], cast: ['Жди поклёвку…', 'не тяни раньше времени'], wait: ['Жди поклёвку…', 'не тяни раньше времени'],
      bite: ['Тянуть!', 'клюёт — скорее!'], pull: ['Вытягиваем…', ''], miss: ['…', ''] }[ph] || ['', ''];
    lbl.textContent = T[0]; sm.textContent = T[1];
    $('hint').textContent = { aim: 'Чем выше шкала — тем дальше заброс и крупнее рыба 🎯', cast: 'Поплавок дёргается — это рыба пробует. Тяни, когда он утонет!',
      wait: 'Поплавок дёргается — это рыба пробует. Тяни, когда он утонет!', bite: 'Клюёт! Жми «Тянуть!»' }[ph] || '';
    $('fishmeter').classList.toggle('off', ph !== 'aim');
  }
  function fishTap() {
    if (!FG) return;
    const now = performance.now();
    if (FG.phase === 'aim') {
      FG.p = meterAt(now); FG.phase = 'cast'; FG.t0 = now; FG.target = bobAt(FG.p);
      const far = FG.p >= FZ[1] ? 900 : FG.p >= FZ[0] ? 400 : 0;
      FG.biteAt = now + 750 + 1600 + far + Math.random() * 3000;
      FG.nibbles = []; for (let t = now + 1300; t < FG.biteAt - 500; t += 700 + Math.random() * 1300) if (Math.random() < 0.6) FG.nibbles.push(t);
      SFX.play('cast'); SFX.play('splash', 700); haptic('light'); setFishBtn();
    } else if (FG.phase === 'cast' || FG.phase === 'wait') fishEnd(false, 'early');
    else if (FG.phase === 'bite') { haptic('ok'); fishEnd(true); }
  }
  function fishEnd(hooked, why) {
    const now = performance.now();
    FG.phase = hooked ? 'pull' : 'miss'; FG.t0 = now; FG.why = why || ''; FG.res = null; setFishBtn();
    if (!hooked) { SFX.play('miss'); haptic('err'); }
    const g = FG; busy = true;
    api('/api/pet/action', { action: 'angle', x: g.p, y: hooked ? 1 : 0 })
      .then(r => ({ r }), e => ({ err: e }))
      .then(res => { busy = false; g.res = res; });
  }
  function fishTick(now) {
    if (!FG) return;
    if (view.cur !== 'lake' || view.trans || (S && S.sleeping)) { closeFishing(); return; }
    if (FG.phase === 'cast' && now - FG.t0 > 750) { FG.phase = 'wait'; setFishBtn(); }
    if (FG.phase === 'wait' && now >= FG.biteAt) { FG.phase = 'bite'; FG.t0 = now; FG.biteEnd = now + BITE_WIN(FG.p); SFX.play('bite'); SFX.play('bite', 140); haptic('err'); setFishBtn(); }
    if (FG.phase === 'bite' && now > FG.biteEnd) fishEnd(false, 'late');
    if ((FG.phase === 'pull' && now - FG.t0 > 950 || FG.phase === 'miss' && now - FG.t0 > 650) && FG.res) fishResult(FG.res);
  }
  function fishResult(res) {
    const why = FG.why; FG.phase = 'result'; setFishBtn();
    if (res.err || !res.r) { if (res.err && String(res.err.message) === 'auth') { closeFishing(); veil(AUTH_MSG); return; } fishCard({ title: 'Связь потерялась 📡', text: 'Попробуй ещё раз', retry: true }); return; }
    const r = res.r, before = S;
    if (r.state) { render(r.state); seenTs = Math.max(seenTs, r.state.last_ts || 0); }
    onAch(r);
    if (!r.ok) { fishCard({ title: 'Рыбалка не вышла', text: (r.say || '…').replace('{name}', S ? S.name : ''), retry: false }); SFX.play('no'); return; }
    if (r.state && before) {
      const dc = r.state.coins - before.coins; if (dc > 0) { pop('+' + dc + ' 🪙'); SFX.play('coin', 260); }
      if (r.state.level > before.level) SFX.play('level', 500);
    }
    const c = r.catch;
    if (c) {
      FG_BAG[c.id] = (FG_BAG[c.id] || 0) + 1; FG_STREAK = c.id === 'boot' ? 0 : FG_STREAK + 1; renderBag();
      SFX.play('catch'); haptic('ok'); setLook('feed', 1600);
      const rare = c.id === 'goldfish' || c.id === 'pike';
      fishCard({ fish: c.id, title: (rare ? '🎉 ' : '') + c.n + '!', text: '+' + c.c + ' 🪙 · +' + c.xp + ' XP' + (c.food ? ' · рыбка в запасе 🐟' : ''), streak: FG_STREAK, retry: true });
    } else {
      FG_STREAK = 0; renderBag();
      const T = { early: ['Рано! Рыба испугалась 💨', 'Тяни, только когда поплавок утонет'], late: ['Сорвалась! 🐟💨', 'Когда поплавок тонет, жми быстрее'] }[why] || ['Сегодня без улова', 'Попробуем ещё раз?'];
      fishCard({ title: T[0], text: T[1] + ' · +2 XP', retry: true });
    }
  }
  function fishCard(o) {
    const box = $('fishcard'); box.textContent = '';
    if (!o) { box.classList.remove('show'); return; }
    if (o.fish) { const L = fishLayer(o.fish); box.appendChild(pxCanvas(L.c, Math.max(3, Math.floor(60 / L.w)))); }
    box.appendChild(el('div', 'fn', o.title)); box.appendChild(el('div', 'fr', o.text));
    if (o.streak > 1) box.appendChild(el('div', 'fs', '🔥 Серия: ' + o.streak + ' подряд'));
    const row = el('div', 'row');
    if (o.retry) { const b = el('button', 'chipbtn', '🎣 Ещё заброс'); b.addEventListener('click', (e) => { e.stopPropagation(); if (S && S.energy < 15) { fishCard({ title: 'Выдра устала 💤', text: 'Пусть поспит, потом продолжим', retry: false }); return; } SFX.play('click'); fishAim(); }); row.appendChild(b); }
    const x = el('button', 'chipbtn alt', 'Выйти'); x.addEventListener('click', (e) => { e.stopPropagation(); SFX.play('click'); closeFishing(); }); row.appendChild(x);
    box.appendChild(row); box.classList.add('show');
  }
  const BAG_E = { perch: '🐟', crucian: '🐠', pike: '🐊', goldfish: '✨', boot: '🥾', fish_std: '🐟' };
  function renderBag() {
    const box = $('fishbag'); box.textContent = '';
    for (const id of Object.keys(BAG_E)) if (FG_BAG[id]) box.appendChild(el('span', null, BAG_E[id] + '×' + FG_BAG[id]));
  }

  function drawFishGame(now) {
    fishTick(now); if (!FG || !view.fishBg) return;
    const W = view.W, H = view.H, B = view.fishBg, g = sx, O_ = otterPos();
    drawSky(g, now, gameHour(), W, B.hy + 2);
    g.drawImage(B.c, 0, 0);
    for (let i = 0; i < 14; i++) {                                                   // блики на воде
      const y = B.hy + 4 + ((i * 37) % (H - B.hy - 28)), x = ((i * 53 + now * 0.004 * (1 + i % 3)) % (W + 10)) - 5, a = (Math.sin(now / 400 + i * 1.7) + 1) / 2;
      if (a > 0.55) { g.fillStyle = 'rgba(255,255,255,' + (0.5 * a).toFixed(2) + ')'; g.fillRect(Math.round(x), y, 1 + (y - B.hy > 40 ? 2 : 1), 1); }
    }
    const ph = FG.phase, t = now - FG.t0;
    const p = ph === 'aim' ? meterAt(now) : FG.p, tgt = FG.target || bobAt(p);
    if (ph === 'aim') {                                                               // зоны и кружок «сюда упадёт»
      for (const z of FZ) { const y = bobAt(z).y; g.fillStyle = 'rgba(255,255,255,.28)'; for (let x = (W * 0.36) | 0; x < W - 14; x += 4) g.fillRect(x, y, 2, 1); }
      const b = bobAt(p), r = b.big ? 4 : 3; pxRing(g, b.x, b.y, r + Math.sin(now / 120) * 0.6, 0.9);
      $('fishmark').style.top = 'calc(' + (100 - p) + '% - 2px)';
    }
    // выдра со спины сидит на мостках
    const look = ph === 'bite' ? 'walk' : 'idle';
    softShadow(g, O_.x + 1, O_.y + 1, 9, 2, 0.35);
    if (!FG.ot || now - FG.ot.t > 120 || FG.ot.look !== look) FG.ot = { t: now, look, L: drawOtter(now, look, Math.floor(now / 160) % 31 === 0, null, { s: 0.52, back: true }) };   // выдра перерисовывается ~8 раз в секунду
    const OT = FG.ot.L;
    g.drawImage(OT.c, O_.x - OX, O_.y - OB - 1);
    // удилище: из лап вверх-вправо; угол и изгиб зависят от фазы
    const hx = O_.x + 6, hy = O_.y - 18, len = 30;
    let ang = 62, bend = 0;
    if (ph === 'aim') { ang = 68 + p * 0.22 + Math.sin(now / 90) * (p / 60); bend = -p / 40; }
    else if (ph === 'cast') { const k = Math.min(1, t / 260); ang = k < 1 ? lerp(92, 34, ease(k)) : 34 + Math.min(1, (t - 260) / 400) * 14; bend = k < 1 ? 3 : 0; }
    else if (ph === 'wait') ang = 48 + Math.sin(now / 700) * 1.5;
    else if (ph === 'bite') { ang = 40; bend = 4 + Math.abs(Math.sin(now / 60)) * 3; }
    else if (ph === 'pull') { const k = Math.min(1, t / 400); ang = lerp(40, 82, ease(k)); bend = lerp(7, 2, k); }
    else if (ph === 'miss') { const k = Math.min(1, t / 300); ang = lerp(44, 70, ease(k)); }
    else ang = 70;
    const ra = ang * Math.PI / 180, tx = hx + Math.cos(ra) * len, ty = hy - Math.sin(ra) * len;
    const mx = (hx + tx) / 2 + Math.sin(ra) * bend, my = (hy + ty) / 2 + Math.cos(ra) * bend;
    pxCurve(g, hx, hy, mx, my, tx, ty, '#8f5e35'); pxCurve(g, hx + 1, hy, mx + 1, my, tx, ty, '#c99358', 10);
    g.fillStyle = '#3b2a20'; g.fillRect(hx - 1, hy - 1, 3, 3); g.fillStyle = '#dce6f2'; g.fillRect(hx + 2, hy - 3, 2, 2);   // рукоять и катушка
    // поплавок и леска
    const LINE = 'rgba(244,247,255,.92)';
    const bob = (x, y, dip, big) => { x = Math.round(x); y = Math.round(y);
      if (big) { g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 3 + dip, 3, 2); g.fillStyle = '#e8505b'; g.fillRect(x - 1, y - 1 + dip, 3, 2); g.fillStyle = '#2a1722'; g.fillRect(x, y - 4 + dip, 1, 1); }
      else { g.fillStyle = '#ffffff'; g.fillRect(x, y - 2 + dip, 2, 1); g.fillStyle = '#e8505b'; g.fillRect(x, y - 1 + dip, 2, 1); } };
    if (ph === 'aim') { pxLine(g, tx, ty, tx, ty + 7, LINE); bob(tx, ty + 10, 0, true); }
    else if (ph === 'cast') {
      const k = Math.min(1, Math.max(0, (t - 180) / 570)), x = lerp(tx, tgt.x, k), y = lerp(ty, tgt.y, k) - Math.sin(Math.PI * k) * (14 + p * 0.25);
      pxLine(g, tx, ty, x, y - 2, LINE); bob(x, y, 0, k < 0.5 || tgt.big);
    } else if (ph === 'wait' || ph === 'bite') {
      const nib = FG.nibbles && FG.nibbles.some(n => now > n && now < n + 260);
      const dip = ph === 'bite' ? 3 : nib ? 1 : Math.round(Math.sin(now / 380) * 0.6);
      pxCurve(g, tx, ty, (tx + tgt.x) / 2, Math.max(ty, tgt.y) + (ph === 'bite' ? 0 : 6), tgt.x, tgt.y - 2 + Math.min(dip, 2), LINE);
      if (ph === 'bite') { g.fillStyle = '#e8505b'; g.fillRect(tgt.x, tgt.y, 1, 1); pxRing(g, tgt.x, tgt.y + 1, 2 + (t % 400) / 60, 0.9 - (t % 400) / 500); }
      else bob(tgt.x, tgt.y, dip, tgt.big);
      const rt = now - FG.t0; for (let i = 0; i < 2; i++) { const q = ((rt - i * 900) % 2200) / 2200; if (rt - i * 900 > 0 && q < 0.6) pxRing(g, tgt.x, tgt.y + 1, 2 + q * (tgt.big ? 12 : 7), 0.7 * (1 - q / 0.6)); }
      if (nib) pxRing(g, tgt.x, tgt.y + 1, 3, 0.8);
      if (ph === 'bite') { const ex = O_.x, ey = O_.y - 44; g.fillStyle = '#e8505b'; g.fillRect(ex, ey, 2, 6); g.fillRect(ex, ey + 8, 2, 2); }   // «!» над выдрой
    } else if (ph === 'pull') {
      const k = Math.min(1, t / 900), x = lerp(tgt.x, O_.x - 8, ease(k)), y = lerp(tgt.y, B.py - 10, ease(k)) - Math.sin(Math.PI * k) * 26;
      pxLine(g, tx, ty, x, y, LINE);
      const id = FG.res && FG.res.r && FG.res.r.catch ? FG.res.r.catch.id : 'fish_std';
      if (!FG.fl || FG.fl.id !== id) FG.fl = { id, L: fishLayer(id) };
      const L = FG.fl.L;
      g.drawImage(L.c, Math.round(x - L.w / 2), Math.round(y - 2));
      if (k < 0.25) { pxRing(g, tgt.x, tgt.y + 1, 3 + k * 30, 0.9); g.fillStyle = '#ffffff'; for (const [a, b] of [[-3, -3], [3, -4], [-1, -6], [2, -6]]) g.fillRect(tgt.x + a, tgt.y + b - Math.round(k * 20), 1, 1); }
    } else if (ph === 'miss') {
      const k = Math.min(1, t / 600), x = lerp(tgt.x, tx, ease(k)), y = lerp(tgt.y, ty + 10, ease(k));
      pxLine(g, tx, ty, x, y, LINE); g.fillStyle = '#c9d4e0'; g.fillRect(Math.round(x), Math.round(y), 1, 3);
      if (k < 0.4) pxRing(g, tgt.x, tgt.y + 1, 3 + k * 20, 0.8);
    } else { pxLine(g, tx, ty, tx, ty + 7, LINE); bob(tx, ty + 10, 0, true); }
    drawVignette(); drawWarmTint(true);
    { const a = dayAlpha() * 0.75; if (a > 0.01) { g.fillStyle = 'rgba(10,16,64,' + a.toFixed(3) + ')'; g.fillRect(0, 0, W, H); } }
  }
