  const W = 576, H = 384, T = 42, GX = 124, GY = 92;
  const q = id => document.getElementById(id);
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let root, G = null, selected = { x: 0, y: 0 }, selectedPen = null, opened = false, busy = false, sheet = null, shopTab = 'seed', zoom = 1.7, camSet = 0, panUntil = 0;
  let timer, refreshBusy = false, pending = null, mode = null, messageTimer, confirmResolve, lastFocus;
  let hero = { x: 150, y: 236, tx: 150, ty: 236 }, effects = [], lastFrame = 0, animation, canvas, cx, scale = 1;
  let centered = false, bg = null, plotLayer = null, plotKey = '';
  const bridge = () => window.PetGardenBridge;
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const hours = sec => sec < 3600 ? Math.max(1, Math.ceil(sec / 60)) + ' мин' : Math.ceil(sec / 3600) + ' ч';
  const errText = 'Связь с садом прервалась. Можно безопасно повторить запрос.';

