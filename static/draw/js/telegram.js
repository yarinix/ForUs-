
  // ================= Telegram =================
  const tg = (window.Telegram && window.Telegram.WebApp) || {};
  const call = (fn, ...a) => { try { return fn && fn.apply(tg, a); } catch (e) {} };
  call(tg.ready); call(tg.expand);
  const ensureExpanded = () => { if (tg.isExpanded === false) call(tg.expand); };
  [150, 500, 1200].forEach(ms => setTimeout(() => call(tg.expand), ms));
  call(tg.disableVerticalSwipes);          // чтобы свайп вниз не закрывал приложение при рисовании
  const light = tg.colorScheme === 'light';
  document.body.dataset.theme = light ? 'light' : 'dark';
  call(tg.setHeaderColor, light ? '#f4f1ff' : '#2c2950');
  call(tg.setBackgroundColor, light ? '#e3def6' : '#17152b');
  const haptic = (kind) => {
    const h = tg.HapticFeedback; if (!h) return;
    try { kind === 'tick' ? h.selectionChanged() : kind === 'ok' ? h.notificationOccurred('success')
        : kind === 'err' ? h.notificationOccurred('error') : h.impactOccurred('light'); } catch (e) {}
  };

