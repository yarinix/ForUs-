  SFX.setNight(() => dayAlpha() > 0.18);
  document.addEventListener('visibilitychange', syncAmbient);
  drawAvatar(); layout();
  new ResizeObserver(() => { layout(); }).observe($('stage'));
  window.addEventListener('resize', layout);
  setInterval(() => { const n = performance.now(); frame(n); if (tab === 'wardrobe') wardFrame(n); }, 100);

  // Мост между экраном питомца и отдельным садом. Сервер остаётся источником истины для монет и действий.
  window.PetGardenBridge = {
    api, state: () => S, guest: isGuest,
    canEnter: () => !!(S && hasForest(S) && !isGuest() && !busy),
    sync: st => { if (st) render(st); },
    sound: name => SFX.play(name), haptic,
    gardenOtterFrame: now => { const o = drawOtter(now, S && S.sleeping ? 'sleep' : 'idle', Math.floor(now / 160) % 31 === 0, null, { s: 0.82, back: false }); return o && o.c; },
    back: () => { show('loc', { quiet: true, noMove: true }); refresh(false); },
    telegram: tg,
  };

  window.__pet = { otter, view, drawOtter, newLayer };   // для отладки

  // ---------- старт ----------
  if (!tg.initData) {
    veil('Эта игра открывается только из Telegram. Напиши боту /pet и нажми «🦦 Играть».');
  } else {
    refresh(true);
    setInterval(() => { if (!busy && !drag && !document.hidden) refresh(false); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
  }
