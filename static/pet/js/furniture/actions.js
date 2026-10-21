  // ---------- ВЫДРА ПОЛЬЗУЕТСЯ МЕБЕЛЬЮ ----------
  // Тап по вещи в комнате: выдра подходит к ней, что-то делает (лежит, играет, смотрит, нюхает…) и возвращается.
  // Что даёт каждая вещь, решает сервер (pet_data/furniture_use.py, действие «use»); каталог присылает вид действия в поле use.
  // Кровать и палатка — сон, миска / холодильник / кухня — кормление, лодка — рыбалка: выдра подходит и открывает обычное действие.
  const USE_SPECIAL = { bed: 'sleep', tent: 'sleep', bowl: 'feed', fridge: 'feed', counter: 'feed', boat: 'angle' };
  const USE_DUR = { rest: 5200, play: 4200, watch: 4600, look: 3600, read: 4600, mirror: 3600, tea: 4200, warm: 4600, sniff: 3200 };
  const USE_SFX = { rest: 'sleep', play: 'play', watch: 'ok', look: 'pet', read: 'ok', mirror: 'wear', tea: 'feed', warm: 'ok', sniff: 'pet' };
  const USE_HIDE = new Set(['ball', 'bone', 'plush']);       // эти вещи выдра берёт в лапы
  const USE_LIE = new Set(['lounger', 'picnic']);             // тут выдра ложится и дремлет

  const canUse = (id) => !!(CAT && CAT[id] && (CAT[id].use || USE_SPECIAL[id]));
  function useHit(lx, ly) {
    const list = roomItems(view.cur);
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], x0 = o.x - (o.f.w >> 1), y0 = o.c.pl === 'wall' ? o.y - (o.f.h >> 1) : o.y - o.f.h;
      if (lx >= x0 - 2 && lx <= x0 + o.f.w + 2 && ly >= y0 - 2 && ly <= y0 + o.f.h + 2 && canUse(o.id)) return o.id;
    }
    return null;
  }
  // куда встать и какую позу принять у вещи o
  function useSpot(o, k) {
    const W = view.W, side = o.x > W / 2 ? -1 : 1, wall = o.c.pl === 'wall', fw = o.f.w;
    const floorY = clamp(wall ? view.baseY : o.y, view.fy + 14, view.H - 3);
    const beside = clamp(Math.round(o.x + side * (fw / 2 + 7)), 12, W - 12);
    if (k === 'rest') return { x: o.x, y: Math.round(o.y - o.f.h * 0.32), look: USE_LIE.has(o.id) ? 'sleepy' : 'idle', on: true };
    if (k === 'play') return USE_HIDE.has(o.id) ? { x: clamp(o.x + side * 8, 14, W - 14), y: floorY, look: 'play', hide: true } : { x: beside, y: floorY, look: 'play' };
    if (k === 'watch' || k === 'look' || k === 'read' || k === 'mirror' || (wall && k === 'sniff'))
      return wall ? { x: clamp(o.x, 12, W - 12), y: view.baseY, look: 'idle', back: true } : { x: o.x, y: clamp(o.y + 6, view.fy + 14, view.H - 2), look: 'idle', back: true };
    if (k === 'tea') return { x: beside, y: floorY, look: 'feed' };
    if (k === 'warm') return { x: beside, y: floorY, look: 'idle' };
    if (k === 'sniff') return { x: beside, y: floorY, look: 'pet' };
    return { x: wall ? clamp(o.x, 12, W - 12) : beside, y: floorY, look: 'idle' };   // подойти (сон, еда, лодка)
  }
  // поза выдры прямо сейчас: идёт к вещи → пользуется → идёт обратно. null — обычная поза
  function usePose(now) {
    const U = view.use; if (!U) return null;
    if (view.cur !== U.room || view.edit || view.fishGame || (S && S.sleeping)) { view.use = null; return null; }
    const o = roomItems(U.room).find(q => q.id === U.id); if (!o) { view.use = null; return null; }
    const out = outdoor(U.room), home = { x: out ? view.oxOut : view.ox, y: view.baseY }, sp = useSpot(o, U.k);
    const t = now - U.t0, Wk = U.walk;
    let x, y, look = 'walk', back = false, phase;
    if (t < Wk) { const k = ease(t / Wk); x = lerp(home.x, sp.x, k); y = lerp(home.y, sp.y, k); back = sp.y < home.y - 3; phase = 'go'; }
    else if (t < Wk + U.dur) { x = sp.x; y = sp.y; look = sp.look; back = !!sp.back; phase = 'use'; }
    else if (t < Wk * 2 + U.dur) { const k = ease((t - Wk - U.dur) / Wk); x = lerp(sp.x, home.x, k); y = lerp(sp.y, home.y, k); phase = 'back'; }
    else { view.use = null; return null; }
    return { id: U.id, k: U.k, x: Math.round(x), y: Math.round(y), look, back, phase, o, sp, t: t - Wk, on: phase === 'use' && sp.on, hide: phase === 'use' && sp.hide };
  }
  async function useFurn(id) {
    if (isGuest()) { toast('В гостях можно только смотреть 👀'); return; }
    if (busy || view.trans || view.use || !S || !canUse(id)) return;
    if (S.sleeping) { say(S.name + ' спит 💤'); return; }
    const sp = USE_SPECIAL[id], room = view.cur;
    if (sp) {
      if ((sp === 'feed' && room !== 'kitchen') || (sp === 'angle' && room !== 'lake')) return;
      view.use = { id, room, k: 'go', t0: performance.now(), walk: 550, dur: 700 }; haptic('light');
      setTimeout(() => {
        if (!view.use || view.use.id !== id) return;
        if (sp === 'feed') openFeedSheet(); else if (sp === 'sleep') act('sleep', null); else openFishing();
      }, 620);
      return;
    }
    busy = true; haptic('light');
    try {
      const before = S, r = await api('/api/pet/action', { action: 'use', item: id });
      if (r.state) { render(r.state); seenTs = Math.max(seenTs, r.state.last_ts || 0); }
      if (!r.ok) { say(r.say || '…'); SFX.play('no'); setLook('no', 800); haptic('err'); return; }
      const k = CAT[id].use;
      view.use = { id, room, k, t0: performance.now(), walk: 600, dur: USE_DUR[k] || 4200 };
      say(r.say || '…', 3800); onAch(r); SFX.play(USE_SFX[k] || 'ok', 600);
      if (r.state && before) {
        const dc = r.state.coins - before.coins, dx = (r.state.level > before.level) ? 0 : r.state.xp - before.xp;
        if (dc) setTimeout(() => pop((dc > 0 ? '+' : '') + dc + ' 🪙'), 650);
        if (dx > 0) setTimeout(() => pop('+' + dx + ' XP'), 820);
        if (dc > 0) SFX.play('coin', 900);
        if (r.state.level > before.level) SFX.play('level', 1100);
      }
      haptic('ok');
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG); else say('Связь с Бубликом потерялась, попробуй ещё раз 📡');
    } finally { busy = false; }
  }
  // детали поверх выдры: мячик, игрушка в лапах, «Zzz», сердечки, пар от чая
  function drawUseExtras(g, now, P, ox, oy, kk) {
    if (!P || P.phase !== 'use') return;
    const t = P.t, top = oy - Math.round(70 * kk);
    if (P.k === 'play' && P.id === 'ball') {
      const by = oy - 4 - Math.round(Math.abs(Math.sin(now / 160)) * 24 * kk), bx = ox + Math.round((P.sp.x < P.o.x ? 1 : -1) * 22 * kk);
      const B = newLayer(14, 14); ell(B, 7, 7, 5.5, 5.5, BLUE); for (let i = -4; i <= 4; i++) dot(B, 7 + i, 6 + Math.round(i * .35), '#fff'); outline(B);
      g.drawImage(B.c, bx - 7, by - 7);
    } else if (P.k === 'play' && P.hide) {
      const f = P.o.f, bob = Math.round(Math.sin(now / 130) * 2);
      g.drawImage(f.c, Math.round(ox - f.w / 2), Math.round(oy - 30 * kk - f.h / 2) + bob);
    }
    g.fillStyle = '#ffffff';
    if (P.k === 'rest' && P.sp.look === 'sleepy') for (let i = 0; i < 3; i++) {
      const q = ((t / 1400) + i / 3) % 1, x = ox + 10 + Math.round(q * 8), y = top + 4 - Math.round(q * 14);
      g.globalAlpha = 1 - q; g.fillRect(x, y, 3, 1); g.fillRect(x + 2, y + 1, 1, 1); g.fillRect(x + 1, y + 2, 1, 1); g.fillRect(x, y + 3, 3, 1); g.globalAlpha = 1;
    }
    if (P.k === 'look' || P.k === 'mirror' || P.k === 'sniff') for (let i = 0; i < 2; i++) {
      const q = ((t / 1600) + i / 2) % 1, x = ox - 6 + i * 12 + Math.round(Math.sin(q * 6) * 2), y = top + 6 - Math.round(q * 12);
      g.globalAlpha = 1 - q; g.fillStyle = '#ff6a95'; g.fillRect(x, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x - 0, y + 1, 3, 1); g.fillRect(x + 1, y + 2, 1, 1); g.globalAlpha = 1;
    }
    if (P.k === 'tea') { const o = P.o, sx_ = o.x, sy_ = o.y - o.f.h - 2; for (let i = 0; i < 3; i++) { const q = ((t / 1200) + i / 3) % 1; g.globalAlpha = 0.7 * (1 - q); g.fillStyle = '#ffffff'; g.fillRect(sx_ + Math.round(Math.sin(q * 7 + i) * 2), sy_ - Math.round(q * 9), 1, 2); } g.globalAlpha = 1; }
    if (P.k === 'warm') { for (let i = 0; i < 3; i++) { const q = ((t / 900) + i / 3) % 1, o = P.o; g.globalAlpha = 1 - q; g.fillStyle = i % 2 ? '#ffe878' : '#ff9a3c'; g.fillRect(o.x - 3 + i * 3, o.y - o.f.h - Math.round(q * 12), 1, 1); } g.globalAlpha = 1; }
  }
