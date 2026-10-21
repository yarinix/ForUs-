  const $ = (id) => document.getElementById(id);
  const tg = (window.Telegram && window.Telegram.WebApp) || {};
  const call = (fn, ...a) => { try { return fn && fn.apply(tg, a); } catch (e) {} };
  call(tg.ready); call(tg.expand); call(tg.disableVerticalSwipes);
  call(tg.setHeaderColor, '#0c1633'); call(tg.setBackgroundColor, '#0c1633');
