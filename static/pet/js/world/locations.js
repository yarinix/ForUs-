  // =====================================================================
  // ЛОКАЦИЯ «ЛЕС»: вкладка, замок, выход из дома, перемещения, достижения
  // =====================================================================
  const outdoor = (room) => !!(ROOMS[room] && ROOMS[room].out);
  const isGuest = () => viewingUserId !== null && viewingUserId !== myId;
  const hasForest = (st) => !!(st && (st.locs || []).includes('forest'));
  const fitsRoom = (c, out) => { const w = c.w || 'in'; return w === 'any' || (out ? w === 'out' : w === 'in'); };

  function renderLoc() {
    const box = $('locbody'); if (!box || !S) return;
    $('loccoins').textContent = S.coins;
    box.textContent = '';
    if (hasForest(S)) return;
    const info = (S.loc_info && S.loc_info.forest) || { n: 'Лес', p: 1500, d: '' };
    const cv = document.createElement('canvas'); cv.className = 'pxi locprev';
    if (view.rooms && view.rooms.forest) {
      const W = view.W, H = view.H; cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      drawSky(g, 0, 12, W, view.fy); g.drawImage(view.rooms.forest.c, 0, 0);
      g.fillStyle = 'rgba(10,16,40,.35)'; g.fillRect(0, 0, W, H);
      box.appendChild(cv);
    }
    box.appendChild(el('div', 'lochead', '🔒 ' + info.e + ' ' + info.n));
    box.appendChild(el('p', null, info.d || ''));
    const b = el('button', 'buy' + (S.coins < info.p ? ' poor' : ''), 'Открыть за ' + info.p + ' 🪙'); b.style.width = '100%'; b.style.margin = '4px 0 8px'; b.style.padding = '13px';
    b.addEventListener('click', () => unlockLoc(info)); box.appendChild(b);
    [['🏡', 'Задний двор', 'выход из дома, можно играть на свежем воздухе'], ['🌲', 'Лес', 'искать грибы и ягоды за монеты'], ['🎣', 'Озеро', 'рыбачить — иногда клюёт рыбка 🐟'],
     ['🪑', 'Своя обстановка', 'уличная мебель: скамейка, костёр, палатка…'], ['🎶', 'Звуки природы', 'птицы, ветер, шелест листвы, вода']].forEach(([e, n, d]) => {
      const r = el('div', 'locrow'); r.appendChild(el('span', 'e', e)); const m = el('span', 'm', n); m.appendChild(el('small', null, d)); r.appendChild(m); box.appendChild(r);
    });
  }
  let unlocking = false;
  async function unlockLoc(info) {
    if (unlocking || !S) return;
    if (S.coins < info.p) { toast('Не хватает монет 🪙 Нужно ' + info.p); haptic('err'); SFX.play('no'); return; }
    const go = async () => {
      unlocking = true;
      try {
        const r = await rpc('unlock', { item: 'forest' });
        if (r) { toast(r.say, 3500); haptic(r.ok ? 'ok' : 'err'); if (r.ok) { SFX.play('unlock'); show('loc'); } }
      } finally { unlocking = false; }
    };
    const msg = 'Открыть «' + info.n + '» за ' + info.p + ' монет?';
    if (tg.showConfirm) tg.showConfirm(msg, (ok) => ok && go()); else if (window.confirm(msg)) go();
  }
  async function stepOut(action) {
    if (busy || isGuest()) return; busy = true;
    try {
      const r = await api('/api/pet/action', { action });
      if (r.state) render(r.state, true);
      if (r.ok) { SFX.play('door'); if (action === 'go_out') view.enter = { t0: performance.now(), dur: 1700 }; }
      else { SFX.play('no'); toast(r.say); show(action === 'go_out' ? 'home' : 'loc', { quiet: true, noMove: true }); }
      onAch(r);
    } catch (e) { if (String(e.message) === 'auth') veil(AUTH_MSG); else toast('Связь потерялась, попробуй ещё раз 📡'); }
    finally { busy = false; }
  }
  const goOut = () => stepOut('go_out'), goIn = () => stepOut('go_in');
  function updateLocBtn() {
    const ge = $('gardenentry');
    if (ge) ge.hidden = !(tab === 'loc' && view.cur === 'yard' && !view.edit && !view.trans && !isGuest() && hasForest(S));
    const b = $('locedit'); if (!b) return;
    b.style.display = (tab === 'loc' && !view.edit && !view.trans && !isGuest() && outdoor(view.cur)) ? 'block' : 'none';
  }
  $('locedit').addEventListener('click', () => { haptic('light'); show('locedit', { quiet: true }); });
