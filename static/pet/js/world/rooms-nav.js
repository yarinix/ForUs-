  // ---------- комнаты ----------
  const ORDER = ['kitchen', 'home', 'bedroom'], ORDER_OUT = ['yard', 'forest', 'lake'];
  function syncRoom(room, instant) {
    if (!room || !ROOMS[room]) return;
    if (view.trans) { view.pendingRoom = room; return; }
    if (view.cur === room) { applyRoomUI(); return; }
    if (instant || !view.rooms.home || outdoor(room) !== outdoor(view.cur)) { view.cur = room; applyRoomUI(); return; }
    const OR = outdoor(room) ? ORDER_OUT : ORDER, dir = OR.indexOf(room) < OR.indexOf(view.cur) ? 1 : -1;   // 1: идём влево, мир едет вправо
    view.trans = { from: view.cur, to: room, dir, t0: performance.now(), dur: 650 };
    applyRoomUI();
  }
  function onRoomShown() {
    applyRoomUI();
    if (view.edit) renderEditList();
    const r = view.pendingRoom; view.pendingRoom = null;
    if (r && r !== view.cur) syncRoom(r);
  }
  function applyRoomUI() {
    const r = ROOMS[view.cur];
    $('roomname').textContent = r.title;
    [['left', 'arL'], ['right', 'arR']].forEach(([side, id]) => {
      const el = $(id), to = r[side];
      el.style.display = (to && !view.trans && !(S && S.sleeping)) ? '' : 'none';
      if (to) { el.dataset.to = to; el.querySelector('small').textContent = (side === 'left' && r.leftLabel) || ROOMS[to].title; }
    });
    const a = $('mainact'); a.dataset.a = r.act; a.querySelector('.lbl').textContent = r.label; a.querySelector('small').textContent = r.sub;
    updateLocBtn(); syncAmbient();
    a.style.visibility = (view.trans || (S && S.sleeping)) ? 'hidden' : 'visible';
    const em = a.querySelector('.em'); if (em.dataset.cur !== r.icon) { em.dataset.cur = r.icon; em.textContent = ''; em.appendChild(icon(r.icon, 4)); }
    const ts = $('tentsleep');
    if (ts) { const tent = S && S.placed && S.placed.tent; ts.style.display = (!view.trans && outdoor(view.cur) && tent && tent.room === view.cur && !(S && S.sleeping)) ? '' : 'none'; }
  }
  $('tentsleep').addEventListener('click', () => act('sleep', $('tentsleep')));
  async function move(to) {
    if (busy || view.trans || !to) return; busy = true; haptic('light');
    try {
      const r = await api('/api/pet/action', { action: 'move', to });
      if (r.state) render(r.state);
      SFX.play(r.ok ? 'move' : 'no'); onAch(r);
      if (!r.ok && r.say) say(r.say);
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG); else say('Связь с Бубликом потерялась, попробуй ещё раз 📡');
    } finally { busy = false; }
  }
  $('arL').addEventListener('click', () => { const to = $('arL').dataset.to; if (outdoor(view.cur) && !outdoor(to)) goIn(); else move(to); });
  $('arR').addEventListener('click', () => move($('arR').dataset.to));
  function syncAmbient() { SFX.ambient(tab === 'loc' && !isGuest() && view && outdoor(view.cur) && !view.trans ? view.cur : null); }

  async function act(name, btn, extra) {
    if (viewingUserId !== null && viewingUserId !== myId) { toast('В гостях можно только смотреть 👀'); return; }
    if (busy || (view && view.trans)) return; busy = true; if (btn) btn.classList.add('press'); haptic('light');
    try {
      const r = await api('/api/pet/action', Object.assign({ action: name }, extra || {}));
      const before = S;
      const fishUp = r.ok && name === 'angle' && r.state && before && ((r.state.inv || {}).fish || 0) > ((before.inv || {}).fish || 0);
      const fishAnim = r.ok && name === 'angle' && view.cur === 'lake' && view.water;
      if (fishAnim) await playFishing(fishUp);
      if (r.state) {
        render(r.state); seenTs = Math.max(seenTs, r.state.last_ts || 0);
        if (r.ok && before) {
          const dc = r.state.coins - before.coins, dx = (r.state.level > before.level) ? 0 : r.state.xp - before.xp;
          if (dc) pop((dc > 0 ? '+' : '') + dc + ' 🪙');
          if (dx > 0) setTimeout(() => pop('+' + dx + ' XP'), 170);
          if (dc > 0) SFX.play('coin', 260);
          if (r.state.level > before.level) SFX.play('level', 500);
        }
      }
      SFX.play(r.ok ? ({ pet: 'pet', feed: 'feed', play: 'play', sleep: 'sleep', wake: 'wake', forage: 'forage', angle: fishAnim ? (fishUp ? 'catch' : 'miss') : 'angle' }[name] || 'ok') : 'no');
      if (r.ok && name === 'wake') lastWakeSfx = Date.now();
      say(r.say || '…');
      onAch(r);
      setLook(r.ok ? ({ forage: 'walk', angle: fishUp ? 'feed' : 'idle' }[name] || name) : 'no', r.ok ? 2100 : 800);
      haptic(r.ok ? 'ok' : 'err');
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG);
      else say('Связь с Бубликом потерялась, попробуй ещё раз 📡');
    } finally { if (btn) setTimeout(() => btn.classList.remove('press'), 90); busy = false; }
  }
  document.querySelectorAll('.act').forEach(b => b.addEventListener('click', () => { if (b.dataset.a === 'feed') openFeedSheet(); else act(b.dataset.a, b); }));
  // касание выдры = «погладить»
  $('pixcv').addEventListener('pointerdown', (e) => {
    if (view.edit) { editDown(e); return; }
    if (busy || view.trans) return;
    const r = $('pixcv').getBoundingClientRect();
    if (otterHit((e.clientX - r.left) / view.K, (e.clientY - r.top) / view.K)) act('pet', null);
  });

  // навигация (Главная / Меню и разделы) — см. блок «ОДЕЖДА, МЕБЕЛЬ, МАГАЗИН, МЕНЮ» ниже

