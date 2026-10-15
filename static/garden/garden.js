/* Независимый экран сада. Все цены, рост и покупки подтверждает сервер. */
(() => {
  'use strict';
  const W = 576, H = 384, T = 42, GX = 108, GY = 87;
  const q = id => document.getElementById(id);
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let root, G = null, selected = { x: 0, y: 0 }, opened = false, busy = false, sheet = null, shopTab = 'seed', zoom = 1;
  let timer, refreshBusy = false, pending = null, mode = null, messageTimer, confirmResolve, lastFocus;
  let hero = { x: 99, y: 238, tx: 99, ty: 238 }, effects = [], lastFrame = 0, animation, canvas, cx, scale = 1;
  let centered = false;
  const bridge = () => window.PetGardenBridge;
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const hours = sec => sec < 3600 ? Math.max(1, Math.ceil(sec / 60)) + ' мин' : Math.ceil(sec / 3600) + ' ч';
  const errText = 'Связь с садом прервалась. Можно безопасно повторить запрос.';

  function rect(x, y, w, h, color, ctx = cx) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function ellipse(x, y, rx, ry, color, ctx = cx) {
    for (let yy = -ry; yy <= ry; yy++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy / (ry * ry)))); rect(x - half, y + yy, half * 2 + 1, 1, color, ctx); }
  }
  function sprite(ctx, type, stage = 3, color = '#ed6d88', wet = false) {
    const r = (x, y, w, h, c) => rect(x, y, w, h, c, ctx);
    const e = (x, y, rx, ry, c) => ellipse(x, y, rx, ry, c, ctx);
    if (type === 'bed') {
      // Миниатюрная деревянная грядка: тёплые доски, торцевые бруски и борозды.
      r(2, 5, 20, 16, '#533722'); r(3, 4, 18, 16, '#98643a');
      r(2, 4, 20, 3, '#d5a66a'); r(3, 5, 18, 1, '#f0cc8b');
      r(2, 18, 20, 3, '#80502f'); r(3, 20, 18, 1, '#bd8750');
      r(4, 7, 16, 10, '#5b402b');
      for (let y = 8; y < 18; y += 4) { r(5, y, 14, 2, '#765036'); r(5, y, 14, 1, '#a77a4b'); }
      r(3, 7, 2, 10, '#d2a16a'); r(19, 7, 2, 10, '#d2a16a');
      r(4, 7, 1, 2, '#f0cf91'); r(19, 7, 1, 2, '#f0cf91'); return;
    }
    if (type === 'coin' || type === 'harvest') {
      if (type === 'coin') { e(12, 12, 8, 8, '#a37530'); e(12, 11, 7, 7, '#edc35d'); r(10, 6, 3, 10, '#ffe9a0'); r(7, 10, 8, 2, '#cf9a3b'); }
      else { r(4, 11, 17, 10, '#9b6b40'); r(3, 10, 19, 3, '#cea16a'); for (let x = 6; x < 20; x += 4) r(x, 14, 1, 6, '#6e482c'); r(6, 4, 12, 2, '#83522c'); r(5, 5, 2, 7, '#83522c'); r(17, 5, 2, 7, '#83522c'); e(9, 10, 3, 3, '#e98655'); e(15, 11, 3, 3, '#edc459'); r(10, 7, 4, 2, '#698344'); } return;
    }
    if (type === 'water' || type === 'well' || type === 'sprinkler') {
      if (type === 'well') { e(12, 16, 8, 5, '#90988c'); r(4, 15, 16, 5, '#9ca695'); e(12, 14, 8, 3, '#c8ccaf'); e(12, 14, 5, 2, '#537c7c'); r(4, 4, 2, 10, '#886342'); r(18, 4, 2, 10, '#886342'); r(3, 3, 18, 3, '#a1794e'); }
      else if (type === 'sprinkler') { r(10, 12, 4, 9, '#a7b4a2'); r(6, 12, 12, 3, '#627f73'); r(11, 6, 2, 6, '#d0dcc6'); [[3, 4], [7, 2], [16, 2], [20, 5]].forEach(([x, y]) => { r(x, y, 2, 3, '#77c6dc'); }); }
      else { r(4, 10, 11, 10, '#82b7b5'); r(3, 11, 3, 7, '#477d7b'); r(6, 8, 7, 3, '#bbdbd0'); r(15, 12, 5, 3, '#477d7b'); r(19, 10, 3, 3, '#82b7b5'); r(7, 5, 6, 2, '#477d7b'); r(6, 6, 2, 4, '#477d7b'); r(13, 6, 2, 4, '#477d7b'); } return;
    }
    if (type === 'fertilizer') { r(5, 6, 14, 15, '#bb9970'); r(7, 3, 10, 4, '#d7bf8f'); r(4, 8, 16, 3, '#e2cea3'); r(10, 11, 3, 7, '#698347'); r(7, 12, 4, 3, '#89a35d'); r(13, 10, 4, 3, '#89a35d'); return; }
    if (type === 'expand') { r(3, 5, 18, 15, '#dec496'); r(5, 7, 5, 5, '#89a663'); r(12, 7, 7, 5, '#bcc987'); r(5, 14, 5, 4, '#bcc987'); r(12, 14, 7, 4, '#89a663'); return; }
    if (type === 'bench') { r(3, 6, 18, 3, '#b4864d'); r(3, 10, 18, 3, '#c9a162'); r(2, 14, 20, 3, '#855b35'); r(4, 17, 3, 4, '#6b492e'); r(17, 17, 3, 4, '#6b492e'); return; }
    if (type === 'pond') { e(12, 13, 11, 8, '#c4bd98'); e(12, 12, 9, 6, '#78b8b3'); e(12, 12, 7, 4, '#578f98'); r(6, 10, 5, 1, '#b4e2d0'); r(14, 15, 5, 1, '#b4e2d0'); e(16, 10, 2, 1, '#9cbb66'); return; }
    if (type === 'lantern') { r(11, 6, 3, 15, '#725634'); r(7, 5, 11, 2, '#4e5133'); r(8, 2, 9, 3, '#8c6c38'); r(9, 7, 7, 7, '#edc778'); r(10, 8, 4, 4, '#fff0b2'); r(8, 14, 9, 2, '#8c6c38'); return; }
    if (type === 'beehive') { r(5, 10, 15, 10, '#a77940'); r(4, 9, 17, 2, '#e0ba6d'); r(5, 6, 15, 3, '#cf9f56'); r(7, 3, 11, 3, '#e0ba6d'); r(10, 16, 5, 4, '#725031'); return; }
    if (type === 'flowers') { r(3, 17, 18, 4, '#b18355'); [6, 12, 18].forEach((x, i) => { r(x, 10, 1, 8, '#668043'); e(x, 8 + i % 2 * 3, 3, 3, ['#e88e93', '#ad96d1', '#edc15a'][i]); r(x, 8 + i % 2 * 3, 1, 1, '#fff2bb'); }); return; }
    // Четыре разные стадии, каждый сорт имеет собственный зрелый рисунок.
    if (stage === 0) { r(11, 14, 2, 7, '#426641'); r(7, 13, 5, 3, '#729647'); r(13, 11, 5, 3, '#8dae57'); r(9, 13, 2, 1, '#bac982'); return; }
    const tall = stage === 1 ? 5 : 10;
    r(11, 20 - tall, 2, tall + 1, '#426641'); r(6, 17 - tall / 2, 6, 3, '#73994d'); r(13, 13 - tall / 3, 5, 3, '#8eac60');
    if (stage === 1) return;
    if (stage === 2) { e(10, 11, 4, 3, '#6c914a'); e(16, 12, 3, 3, '#94ae5a'); r(10, 8, 2, 2, color); return; }
    if (type === 'carrot') { r(8, 15, 9, 3, '#e9a24a'); r(9, 18, 7, 3, '#da8837'); r(11, 21, 3, 2, '#c77930'); r(8, 15, 3, 1, '#f4c378'); r(9, 6, 2, 9, '#57783f'); r(13, 4, 2, 11, '#71974c'); r(16, 8, 2, 6, '#92ac5e'); }
    else if (type === 'radish') { e(12, 17, 6, 5, color); r(10, 21, 5, 2, '#f4e3c5'); r(11, 23, 2, 1, '#f4e3c5'); r(8, 15, 3, 2, '#f5a6ac'); r(10, 6, 2, 7, '#678449'); r(14, 5, 2, 8, '#89a654'); }
    else if (type === 'sunflower') { e(12, 8, 8, 6, '#cb9c35'); e(12, 7, 7, 6, color); e(12, 7, 4, 3, '#8b6037'); r(10, 5, 3, 2, '#b48d43'); }
    else if (type === 'lavender') { [6, 12, 18].forEach((x, i) => { r(x, 7 + i % 2 * 2, 1, 14, '#63814b'); r(x - 2, 4 + i % 2 * 2, 5, 7, color); r(x - 1, 4 + i % 2 * 2, 2, 5, '#d4b3e4'); }); }
    else if (type === 'pumpkin') { e(12, 16, 9, 6, '#b77533'); e(12, 15, 8, 6, color); r(8, 11, 2, 8, '#efb85d'); r(14, 10, 1, 10, '#c77b32'); r(11, 7, 3, 4, '#658044'); }
    else { const c = type === 'blueberry' ? '#7887bb' : color; [[7, 12], [16, 12], [11, 18]].forEach(([x, y]) => { e(x, y, type === 'tomato' ? 4 : 3, 3, c); r(x - 1, y - 2, 2, 1, '#e3d6b6'); r(x, y - 4, 2, 2, '#719347'); }); }
  }
  function icon(type, color, stage = 3) {
    const c = node('canvas', 'g-item-icon'); c.width = c.height = 24;
    const context = c.getContext('2d'); context.imageSmoothingEnabled = false; sprite(context, type, stage, color); return c;
  }
  function button(label, fn, variant = '', disabled = false) {
    const b = node('button', 'g-btn ' + variant, label); b.type = 'button'; b.disabled = disabled || busy || !!pending;
    b.addEventListener('click', fn); return b;
  }
  function notify(text) { q('g-message').textContent = text; q('g-message').hidden = false; clearTimeout(messageTimer); messageTimer = setTimeout(() => { q('g-message').hidden = true; }, 4500); }

  function mount() {
    root = node('section'); root.id = 'pet-garden'; root.hidden = true; root.setAttribute('aria-label', 'Ваш общий сад');
    root.innerHTML = '<header class="g-header"><button type="button" class="g-back" id="g-back" aria-label="Вернуться в лес">‹</button><div class="g-heading"><h1>Наш двор</h1><small>Маленький сад, большая радость</small></div><div class="g-wallet" id="g-wallet">🪙 …</div></header><div class="g-status" id="g-status"><span id="g-weather">Загружаем сад…</span><span id="g-area"></span></div><div class="g-stage" id="g-stage"><div class="g-scroll" id="g-scroll"><div class="g-world" id="g-world"><canvas class="g-map" id="g-map" width="576" height="384" aria-label="Сад с грядками"></canvas><div class="g-hits" id="g-hits" role="group" aria-label="Клетки сада"></div></div></div><div class="g-sign" id="g-sign">Урожай всегда дождётся вас</div><div class="g-zoom"><button type="button" id="g-minus" aria-label="Уменьшить карту">−</button><button type="button" id="g-plus" aria-label="Увеличить карту">+</button></div></div><div class="g-care" id="g-care"></div><nav class="g-nav" id="g-nav" aria-label="Разделы сада"></nav><div class="g-message" id="g-message" role="status" aria-live="polite" hidden></div><div class="g-sheet" id="g-sheet" hidden><section class="g-sheet-box" role="dialog" aria-modal="true" aria-labelledby="g-sheet-title"><div class="g-sheet-head"><div class="g-sheet-title" id="g-sheet-title"></div><button type="button" class="g-close" id="g-sheet-close" aria-label="Закрыть окно">×</button></div><div class="g-tabs" id="g-tabs"></div><div class="g-sheet-body" id="g-sheet-body"></div></section></div><div class="g-confirm" id="g-confirm" hidden><div class="g-confirm-box" role="dialog" aria-modal="true" aria-labelledby="g-confirm-text"><div id="g-confirm-text"></div><div class="g-actions"><button type="button" class="g-btn" id="g-confirm-no">Отмена</button><button type="button" class="g-btn primary" id="g-confirm-yes">Подтвердить</button></div></div></div>';
    document.body.appendChild(root); canvas = q('g-map'); cx = canvas.getContext('2d'); cx.imageSmoothingEnabled = false;
    q('gardenentry')?.addEventListener('click', open);
    q('g-back').addEventListener('click', close);
    q('g-plus').addEventListener('click', () => { zoom = Math.min(2, zoom + .25); size(); });
    q('g-minus').addEventListener('click', () => { zoom = Math.max(.75, zoom - .25); size(); });
    q('g-sheet-close').addEventListener('click', closeSheet);
    q('g-sheet').addEventListener('click', e => { if (e.target === q('g-sheet')) closeSheet(); });
    q('g-confirm-no').addEventListener('click', () => finishConfirm(false));
    q('g-confirm-yes').addEventListener('click', () => finishConfirm(true));
    q('g-world').addEventListener('click', e => { if (!G || e.target.closest('.g-cell')) return; const box = q('g-world').getBoundingClientRect(); hero.tx = Math.max(28, Math.min(W - 28, (e.clientX - box.left) / scale)); hero.ty = Math.max(50, Math.min(H - 30, (e.clientY - box.top) / scale)); });
    new ResizeObserver(() => { if (opened) size(); }).observe(q('g-stage'));
    document.addEventListener('keydown', e => {
      if (!opened) return;
      if (e.key === 'Escape') { e.preventDefault(); if (confirmResolve) finishConfirm(false); else if (sheet) closeSheet(); else close(); }
      if (e.key === 'Tab' && (sheet || confirmResolve)) {
        const target = confirmResolve ? q('g-confirm') : q('g-sheet'); const f = [...target.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    });
    document.addEventListener('visibilitychange', () => { if (!opened) return; if (document.hidden) cancelAnimationFrame(animation); else { lastFrame = 0; animate(performance.now()); load(); } });
  }
  async function open() {
    const b = bridge();
    if (!b || !b.canEnter()) {
      if (root && !root.hidden) notify('Сначала откройте лес и вернитесь на задний двор.');
      return;
    }
    opened = true; root.hidden = false; document.body.classList.add('pet-garden-open');
    G = null; pending = null; mode = null; sheet = null; centered = false; renderCare(); size();
    bridge().sound('door'); bridge().haptic('light');
    try { const bb = bridge().telegram?.BackButton; bb?.show(); bb?.onClick(close); } catch (_) {}
    lastFrame = 0; animate(performance.now());
    const ok = await load(); if (ok && G.stats.planted === 0) openSheet('welcome');
    clearInterval(timer); timer = setInterval(() => { if (!busy && !refreshBusy && !document.hidden && opened) load(); }, 15000);
  }
  function close() {
    if (!opened || busy) return;
    if (pending) { notify('Сначала повторите запрос, чтобы узнать результат последнего действия.'); return; }
    opened = false; root.hidden = true; document.body.classList.remove('pet-garden-open'); clearInterval(timer); cancelAnimationFrame(animation); closeSheet();
    try { const bb = bridge().telegram?.BackButton; bb?.offClick(close); bb?.hide(); } catch (_) {}
    bridge()?.back(); q('gardenentry')?.focus();
  }
  function receive(r) {
    if (r.garden && (!G || r.garden.revision > G.revision || (r.garden.revision === G.revision && r.garden.now >= G.now))) {
      G = r.garden; if (r.state) bridge()?.sync(r.state); render();
    }
  }
  async function load() {
    if (!opened || refreshBusy || busy) return false; refreshBusy = true;
    try {
      const r = await bridge().api('/api/pet/garden/state', {});
      if (!opened) return false;
      if (r.locked) { notify(r.say); G = null; close(); return false; }
      receive(r); q('g-status').classList.remove('g-offline'); return !!G;
    } catch (_) {
      if (opened) { q('g-status').classList.add('g-offline'); q('g-weather').textContent = 'Нет связи, сад в безопасности'; if (!G) renderCare(true); }
      return false;
    } finally { refreshBusy = false; }
  }
  function requestId() { return window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14); }
  async function act(action, extra = {}, retry = false) {
    if (!G || busy || (!retry && pending)) return;
    const payload = retry ? pending : { action, revision: G.revision, request_id: requestId(), ...extra };
    if (!payload) return;
    busy = true; pending = null; render();
    try {
      const r = await bridge().api('/api/pet/garden/action', payload);
      if (r.locked) { busy = false; notify(r.say); close(); return; }
      receive(r); notify(r.say || (r.ok ? 'Готово.' : 'Не получилось выполнить действие.'));
      bridge()?.sound(r.ok ? (['buy', 'expand'].includes(payload.action) ? 'buy' : ['sell', 'sell_all'].includes(payload.action) ? 'coin' : 'ok') : 'no');
      if (r.ok) { bridge()?.haptic('ok'); effects.push({ x: GX + selected.x * T + T / 2, y: GY + selected.y * T, born: performance.now(), color: '#f8e6a0' }); }
    } catch (_) { pending = payload; notify(errText); }
    finally { busy = false; render(); }
  }
  function confirm(text) {
    return new Promise(resolve => { confirmResolve = resolve; lastFocus = document.activeElement; q('g-confirm-text').textContent = text; q('g-confirm').hidden = false; q('g-confirm-no').focus(); });
  }
  function finishConfirm(ok) { q('g-confirm').hidden = true; const done = confirmResolve; confirmResolve = null; lastFocus?.focus(); done?.(ok); }
  async function purchase(kind, item, count = 1) {
    if (!G || busy || pending) return;
    const c = G.catalog[kind === 'seed' ? 'crops' : kind === 'decor' ? 'decor' : 'supplies'][item];
    if (await confirm('Купить «' + c.name + '»' + (count > 1 ? ' × ' + count : '') + ' за ' + fmt(c.price * count) + ' монет из общей копилки?')) act('buy', { kind, item, count });
  }
  async function expand() { const n = G?.next_expansion; if (n && await confirm('Расширить сад до ' + n.cols + ' × ' + n.rows + ' клеток за ' + fmt(n.price) + ' монет? Все грядки и растения сохранятся.')) act('expand'); }
  function closeSheet() { sheet = null; q('g-sheet').hidden = true; renderNav(); }
  function openSheet(type) { if (!G) return; sheet = type; q('g-sheet').hidden = false; renderSheet(); renderNav(); q('g-sheet-close').focus(); }
  function render() { if (!opened || !G) return; q('g-wallet').textContent = '🪙 ' + fmt(G.coins); q('g-weather').textContent = (G.weather.night ? '☾ ' : G.weather.rain ? '☂ ' : '☀ ') + G.weather.name + (G.auto_water ? ' · автополив' : ''); q('g-area').textContent = G.area.cols + ' × ' + G.area.rows + ' · общий сад'; renderCare(); renderNav(); renderHits(); if (sheet) renderSheet(); size(); }
  function renderNav() {
    const nav = q('g-nav'); if (!nav) return; nav.textContent = '';
    [['garden', 'Наш сад', 'flowers'], ['shop', 'Лавка', 'coin'], ['basket', 'Урожай', 'harvest'], ['land', 'Участок', 'expand']].forEach(([id, label, type]) => {
      const b = node('button', id === (sheet || 'garden') ? 'on' : '', label); b.type = 'button'; b.prepend(icon(type));
      if (id === 'basket' && G) { const count = Object.values(G.harvest).reduce((a, n) => a + n, 0); if (count) b.appendChild(node('span', 'g-badge', fmt(count))); }
      b.addEventListener('click', () => id === 'garden' ? closeSheet() : openSheet(id)); nav.appendChild(b);
    });
  }
  function bedAt(x, y) { return G?.beds.find(b => b.x === x && b.y === y); }
  function decorAt(x, y) { return G?.decor.find(d => d.x === x && d.y === y); }
  function renderHits() {
    const hits = q('g-hits'); hits.textContent = '';
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
      const b = node('button', 'g-cell' + (x === selected.x && y === selected.y ? ' selected' : '')); b.type = 'button';
      const bed = bedAt(x, y), decor = decorAt(x, y), locked = x >= G.area.cols || y >= G.area.rows;
      b.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': ' + (locked ? 'закрытый участок' : bed ? bed.crop ? G.catalog.crops[bed.crop].name + (bed.ready ? ', урожай готов' : bed.dry ? ', нужен полив' : ', растёт') : 'свободная грядка' : decor ? G.catalog.decor[decor.item].name : 'свободное место'));
      b.style.left = ((GX + x * T) / W * 100) + '%'; b.style.top = ((GY + y * T) / H * 100) + '%'; b.style.width = (T / W * 100) + '%'; b.style.height = (T / H * 100) + '%';
      b.addEventListener('click', () => select(x, y)); hits.appendChild(b);
    }
  }
  function select(x, y) {
    if (!G || busy || pending) return;
    selected = { x, y };
    if (x >= G.area.cols || y >= G.area.rows) { openSheet('land'); renderHits(); return; }
    hero.tx = GX + x * T + 8; hero.ty = GY + y * T + T + 5;
    if (mode) {
      const m = mode; mode = null;
      if (m.type === 'move') act('move_bed', { bed: m.id, x, y });
      else if (m.type === 'decor') act('place_decor', { item: m.item, x, y });
      return;
    }
    renderHits(); renderCare();
  }
  function renderCare(failed = false) {
    const box = q('g-care'); if (!box) return; box.textContent = '';
    if (!G) { box.appendChild(node('div', 'g-note', failed ? 'Не удалось загрузить сад. Растения не пропадут, попробуйте ещё раз.' : 'Открываем калитку и загружаем ваш сад…')); if (failed) box.appendChild(button('Попробовать ещё раз', load, 'primary')); return; }
    const head = node('div', 'g-care-head'), text = node('div', 'g-care-text'), actions = node('div', 'g-actions');
    let title = 'Место для нового', detail = 'Выберите грядку или украсьте свободную клетку.', type = 'flowers', color;
    const b = bedAt(selected.x, selected.y), d = decorAt(selected.x, selected.y);
    if (mode) { title = 'Выберите свободную клетку'; detail = mode.type === 'move' ? 'Растение переедет вместе с грядкой.' : 'Украшение займёт одну клетку.'; actions.appendChild(button('Отмена', () => { mode = null; renderCare(); })); }
    else if (selected.x >= G.area.cols || selected.y >= G.area.rows) { title = 'Здесь сад может вырасти'; detail = 'Откройте новый участок в разделе «Участок».'; type = 'expand'; actions.appendChild(button('Расширение', () => openSheet('land'), 'gold')); }
    else if (b) {
      type = b.crop || 'bed'; color = b.crop ? G.catalog.crops[b.crop].color : null;
      if (!b.crop) {
        title = 'Свободная грядка'; detail = 'Посадка уже включает первый полив.';
        actions.appendChild(button('Посадить', () => openSheet('seeds'), 'primary'));
        actions.appendChild(button('Переставить', () => { mode = { type: 'move', id: b.id }; renderCare(); }));
        actions.appendChild(button('Убрать', () => act('remove_bed', { bed: b.id })));
      } else {
        title = G.catalog.crops[b.crop].name + (b.fertilized ? ' ✦' : '');
        detail = b.ready ? 'Урожай готов и не испортится. Соберите, когда удобно.' : b.dry ? 'Рост на паузе. Полейте, растение не погибнет.' : 'Растёт · ещё ' + hours(b.remaining) + ' влажного времени · ' + (G.auto_water ? 'автополив' : 'влага: ' + hours(Math.max(0, b.water_until - G.now)));
        if (b.ready) actions.appendChild(button('Собрать', () => act('harvest', { bed: b.id }), 'gold'));
        else {
          actions.appendChild(button('Полить', () => act('water', { bed: b.id }), 'primary', G.auto_water || b.water_until - G.now >= (G.water_hours - 1) * 3600));
          actions.appendChild(button('Компост', () => act('fertilize', { bed: b.id }), '', b.fertilized || !G.supplies.fertilizer));
        }
        actions.appendChild(button('Переставить', () => { mode = { type: 'move', id: b.id }; renderCare(); }));
        const bar = node('div', 'g-progress'), fill = node('div'); fill.style.width = (b.progress * 100) + '%'; bar.appendChild(fill); text.appendChild(bar);
      }
    } else if (d) {
      title = G.catalog.decor[d.item].name; detail = 'Украшение не требует ухода.'; type = d.item;
      actions.appendChild(button('Убрать в кладовую', () => act('remove_decor', { decor: d.id })));
    } else {
      actions.appendChild(button('Поставить грядку', () => act('place_bed', { ...selected }), 'primary', !G.supplies.bed));
      actions.appendChild(button('Украшения', () => openSheet('decor')));
      actions.appendChild(button('Лавка', () => openSheet('shop')));
    }
    text.prepend(node('small', null, detail)); text.prepend(node('b', null, title));
    head.appendChild(icon(type, color, b?.crop ? b.stage : 3)); head.appendChild(text); box.appendChild(head); box.appendChild(actions);
    if (pending) { const retry = node('button', 'g-btn primary', 'Повторить последний запрос'); retry.type = 'button'; retry.addEventListener('click', () => act('', {}, true)); box.appendChild(retry); }
  }
  function itemRow(title, desc, type, color, buttons = []) {
    const row = node('div', 'g-row'); row.appendChild(icon(type, color)); const body = node('div', 'g-row-text'); body.appendChild(node('b', null, title)); body.appendChild(node('small', null, desc)); row.appendChild(body); buttons.forEach(b => row.appendChild(b)); return row;
  }
  function renderSheet() {
    if (!sheet || !G) return;
    const body = q('g-sheet-body'), tabs = q('g-tabs'), oldScroll = body.scrollTop;
    body.textContent = ''; tabs.textContent = ''; tabs.hidden = true;
    const titles = { welcome: 'Добро пожаловать', shop: 'Садовая лавка', seeds: 'Что посадим?', basket: 'Корзина урожая', land: 'Ваш участок', decor: 'Украшения из кладовой' };
    q('g-sheet-title').textContent = titles[sheet] || 'Наш двор';
    if (sheet === 'welcome') {
      const intro = node('div', 'g-intro'); intro.appendChild(node('h3', null, 'Сад без спешки'));
      intro.appendChild(node('div', null, 'Две грядки, 12 семян, два компоста и скамейка уже ваши. Сажайте, поливайте и собирайте урожай вместе.'));
      body.appendChild(intro); body.appendChild(node('p', 'g-note', 'Один полив действует 36 часов. Растения не погибают: когда почва высохнет, рост просто остановится. Готовый урожай не портится. Уход не тратит энергию питомца, садом можно заниматься, пока он спит.'));
      body.appendChild(button('Посадить первые семена', () => { selected = { x: 0, y: 0 }; openSheet('seeds'); }, 'primary'));
      body.appendChild(button('Просто посмотреть', closeSheet));
    } else if (sheet === 'shop') {
      tabs.hidden = false;
      [['seed', 'Семена'], ['supply', 'Для сада'], ['decor', 'Украшения']].forEach(([id, title]) => { const b = node('button', shopTab === id ? 'on' : '', title); b.type = 'button'; b.addEventListener('click', () => { shopTab = id; body.scrollTop = 0; renderSheet(); }); tabs.appendChild(b); });
      const table = G.catalog[shopTab === 'seed' ? 'crops' : shopTab === 'decor' ? 'decor' : 'supplies'];
      for (const [id, c] of Object.entries(table)) {
        const locked = (c.level || 0) > G.level, owned = c.once && G.upgrades.includes(id), stock = G[shopTab === 'seed' ? 'seeds' : shopTab === 'decor' ? 'decor_stock' : 'supplies'][id] || 0;
        let desc = c.desc + (shopTab === 'seed' ? ' Урожай: ' + c.yield + ' × ' + c.sell + ' монет.' : '') + (c.once ? '' : ' В запасе: ' + stock + '.');
        if (locked) desc += ' Нужен участок уровня ' + ((c.level || 0) + 1) + '.';
        const buttons = [button(owned ? 'Куплено' : locked ? 'Закрыто' : fmt(c.price) + ' 🪙', () => purchase(shopTab, id), 'primary', owned || locked || G.coins < c.price)];
        if (shopTab === 'seed' && !locked) buttons.push(button('×5', () => purchase('seed', id, 5), '', G.coins < c.price * 5));
        body.appendChild(itemRow(c.name, desc, id, c.color, buttons));
      }
      body.appendChild(node('p', 'g-note', 'Монеты общие с основной игрой. Все покупки и расширения сначала требуют подтверждения.'));
    } else if (sheet === 'seeds') {
      const bed = bedAt(selected.x, selected.y);
      if (!bed || bed.crop) { body.appendChild(node('p', 'g-note', 'Выберите свободную грядку.')); }
      else for (const [id, c] of Object.entries(G.catalog.crops)) {
        if ((c.level || 0) > G.level) continue;
        const stock = G.seeds[id] || 0;
        body.appendChild(itemRow(c.name + ' · ' + stock + ' шт.', c.hours + ' ч роста · ' + c.yield + ' × ' + c.sell + ' монет за урожай', id, c.color, [button('Посадить', () => { const bedId = bed.id; closeSheet(); act('plant', { bed: bedId, item: id }); }, 'primary', stock < 1)]));
      }
      body.appendChild(button('Купить семена', () => { shopTab = 'seed'; openSheet('shop'); }));
    } else if (sheet === 'basket') {
      const ready = G.beds.filter(b => b.ready).length;
      if (ready) body.appendChild(button('Собрать всё · ' + ready + ' грядок', () => act('harvest_all'), 'gold'));
      let count = 0;
      for (const [key, n] of Object.entries(G.harvest)) {
        if (!n) continue; count += n;
        const [crop, quality] = key.split(':'), c = G.catalog.crops[crop], price = quality === 'gold' ? Math.ceil(c.sell * 1.25) : c.sell;
        body.appendChild(itemRow(c.name + (quality === 'gold' ? ' ✦' : '') + ' · ' + n + ' шт.', price + ' монет за штуку · ' + fmt(price * n) + ' монет всего', crop, c.color, [button('Продать', () => act('sell', { item: key }), 'primary')]));
      }
      if (count) body.appendChild(button('Продать всё за ' + fmt(G.harvest_value) + ' 🪙', () => act('sell_all'), 'gold'));
      else body.appendChild(node('p', 'g-note', 'Корзина пока пуста. После сбора урожай хранится здесь сколько угодно.'));
      body.appendChild(button('Полить весь сад', () => act('water_all'), '', G.auto_water));
      body.appendChild(node('p', 'g-note', 'Сбор и продажа разделены: готовые растения могут оставаться на грядке для красоты. Собранный урожай никогда не портится.'));
    } else if (sheet === 'land') {
      const intro = node('div', 'g-intro'); intro.appendChild(node('h3', null, G.area.name)); intro.appendChild(node('div', null, G.area.cols + ' × ' + G.area.rows + ' клеток · грядок ' + G.beds.length + ' · украшений ' + G.decor.length)); body.appendChild(intro);
      if (G.next_expansion) body.appendChild(itemRow(G.next_expansion.name, G.next_expansion.cols + ' × ' + G.next_expansion.rows + ' клеток. Существующие посадки сохранятся.', 'expand', null, [button(fmt(G.next_expansion.price) + ' 🪙', expand, 'gold', G.coins < G.next_expansion.price)]));
      else body.appendChild(node('p', 'g-note', 'Вся полянка ваша. Сад расширен полностью!'));
      body.appendChild(itemRow('Грядки в запасе: ' + (G.supplies.bed || 0), 'Выберите свободную клетку на карте и поставьте грядку.', 'bed', null, [button('Купить', () => { shopTab = 'supply'; openSheet('shop'); })]));
      body.appendChild(button('Украшения в кладовой', () => openSheet('decor')));
      body.appendChild(button('Полить всё', () => act('water_all'), '', G.auto_water));
      body.appendChild(node('p', 'g-note', 'Расширения: 12 → 20 → 30 → 48 клеток. Колодец увеличивает запас влаги до 48 часов, а автополив полностью снимает заботу о воде. Компост необязателен. Нет сорняков, вредителей, штрафов или ежедневных обязательств.'));
    } else if (sheet === 'decor') {
      let any = false;
      for (const [id, n] of Object.entries(G.decor_stock)) {
        if (!n) continue; any = true; const c = G.catalog.decor[id];
        body.appendChild(itemRow(c.name + ' · ' + n + ' шт.', c.desc, id, null, [button('Поставить', () => { mode = { type: 'decor', item: id }; closeSheet(); renderCare(); }, 'primary')]));
      }
      if (!any) body.appendChild(node('p', 'g-note', 'Все украшения уже стоят в саду. Можно убрать их с карты или купить новые.'));
      body.appendChild(button('В лавку за украшениями', () => { shopTab = 'decor'; openSheet('shop'); }));
    }
    body.scrollTop = oldScroll;
  }
  function size() {
    if (!opened) return;
    const stage = q('g-stage'), width = Math.max(stage.clientWidth, Math.min(stage.clientHeight * 1.5, stage.clientWidth * 1.55)) * zoom;
    const world = q('g-world'); world.style.width = width + 'px'; world.style.height = (width / W * H) + 'px'; world.style.marginTop = Math.max(0, (stage.clientHeight - width / W * H) / 2) + 'px'; scale = width / W;
    if (G && !centered) { centered = true; q('g-scroll').scrollLeft = Math.max(0, (GX + G.area.cols * T / 2) * scale - stage.clientWidth / 2); q('g-scroll').scrollTop = Math.max(0, (GY + G.area.rows * T / 2) * scale - stage.clientHeight / 2); }
  }
  // Сцена в том же крупном пиксельном стиле, что задний двор основной игры.
  function drawTree(x, y, s, color = '#315f43') {
    x = Math.round(x); y = Math.round(y); s = Math.max(1, Math.round(s));
    rect(x - s, y - 2*s, 2*s, s, color);
    rect(x - 2*s, y - s, 4*s, s, color);
    rect(x - 3*s, y, 6*s, s, color);
    rect(x - s, y + s, 2*s, 3*s, '#765132');
    rect(x - s, y - 2*s, s, s, '#4f8150'); rect(x - 2*s, y - s, s, s, '#477949');
  }
  function drawCloud(x, y, k) {
    const c = '#fff4d5', shade = '#d6eef0';
    rect(x, y + 4*k, 30*k, 6*k, shade); rect(x + 5*k, y + 2*k, 20*k, 6*k, c);
    rect(x + 10*k, y, 9*k, 5*k, c); rect(x + 2*k, y + 5*k, 27*k, 3*k, c);
  }
  function drawFlower(x, y, petal, sway = 0) {
    x = Math.round(x + sway); y = Math.round(y);
    rect(x, y - 5, 1, 5, '#397447'); rect(x - 2, y - 3, 2, 1, '#76a858');
    rect(x + 1, y - 4, 2, 1, '#70a253');
    rect(x - 2, y - 8, 2, 2, petal); rect(x, y - 10, 2, 2, petal);
    rect(x + 2, y - 8, 2, 2, petal); rect(x, y - 6, 2, 2, '#ffd965');
  }
  function drawScene(now) {
    // Небо, ступенчатые холмы и дальний лес, всё собрано из жёстких пикселей.
    rect(0, 0, W, H, '#86c8d8'); rect(0, 0, W, 48, '#78bbd0');
    rect(0, 48, W, 24, '#a4d5d5');
    drawCloud(68 + Math.round(Math.sin(now/8500)*5), 28, 2);
    drawCloud(392 + Math.round(Math.sin(now/9700+1)*6), 51, 1);
    rect(0, 89, 72, 16, '#84ad70'); rect(0, 81, 50, 8, '#92bd7c');
    rect(370, 94, 206, 13, '#789e67'); rect(415, 83, 161, 11, '#8db77a');
    rect(0, 101, W, 32, '#6d9560'); rect(0, 108, W, 18, '#759e63');
    for (let x=8; x<W; x+=31) {
      drawTree(x, 110 + ((x*7)%13), 2 + ((x*3)%2), x%3 ? '#396a4d' : '#47794f');
    }
    // Тёплая лужайка с плиточной травой, точечными цветами и солнечными бликами.
    rect(0, 126, W, H-126, '#76ad5d'); rect(0, 148, W, H-148, '#7bb763');
    rect(0, 184, W, 53, '#82bd68'); rect(0, 276, W, 108, '#75ad5c');
    for (let i=0;i<100;i++) {
      const x=(i*73+19)%W, y=133+(i*47+11)%(H-136);
      rect(x,y,1+(i%4===0?1:0),1, i%3===0?'#a3cf70':i%3===1?'#659b54':'#8bbd64');
    }
    // Маленький сарайчик на краю участка, нарисованный в тех же тёплых цветах, что дом в игре.
    rect(20, 105, 67, 83, '#82502f'); rect(25, 110, 56, 74, '#e9c98f');
    for (let y=116;y<180;y+=8) { rect(26,y,54,1,'#f7dfae'); rect(26,y+6,54,1,'#c9a56c'); }
    rect(16, 101, 74, 9, '#a94736'); rect(21, 93, 64, 9, '#c8543e');
    for(let x=22;x<84;x+=12){rect(x,95,8,3,'#e17458');rect(x+1,98,8,2,'#9d3e31');}
    rect(48, 150, 20, 34, '#a86637'); rect(51,153,14,27,'#bd7943');
    rect(54,161,8,10,'#75462c'); rect(61,168,2,2,'#ffe07d');
    rect(29,124,14,16,'#6c9da0'); rect(31,126,10,12,'#c7e8d7'); rect(35,126,2,12,'#8c6039'); rect(31,131,10,2,'#8c6039');
    rect(26,142,20,3,'#91613a'); rect(29,145,2,5,'#4c7746'); drawFlower(33,145,'#f4899d'); drawFlower(40,145,'#ffd65c');
    // Дорожка из уложенных крупных светлых камней ведёт прямо к калитке.
    rect(269, 215, 43, 169, '#b79764'); rect(278,215,25,169,'#cfb37a');
    for(let i=0;i<10;i++) {
      const y=226+i*17, offset=(i%2)*7;
      rect(273+offset,y,15,7,'#e0c78f'); rect(276+offset,y+1,10,2,'#f0dba8');
      rect(291-offset,y+8,14,6,'#b18d5d'); rect(293-offset,y+8,10,2,'#d2b67d');
    }
    // Пикетный забор задаёт глубину сада, с проёмом перед дорожкой.
    rect(94, 76, 388, 3, '#805331'); rect(95, 81, 385, 3, '#c08a50');
    rect(97, 77, 380, 1, '#edc78a');
    for(let x=99;x<480;x+=13) {
      if(x>267&&x<316) continue;
      rect(x,67,7,20,'#8f6037'); rect(x+1,66,5,18,'#d4a368');
      rect(x+2,67,2,2,'#f1d195'); rect(x+1,80,5,2,'#a87543');
    }
    // Небольшие камни, ромашки и пучки травы по краям площадки.
    for(let i=0;i<13;i++) {
      const x=(i*47+20)%W, y=206+(i*31)%154;
      if(x>GX-8&&x<GX+G.area.cols*T+8&&y>GY-8&&y<GY+G.area.rows*T+8) continue;
      if(i%3===0) { rect(x,y,8,4,'#a28c66'); rect(x+1,y,5,1,'#d0bd8e'); }
      else drawFlower(x,y+7,['#fff0c2','#f08ba1','#f1d05b'][i%3],Math.sin(now/380+i)*1.4);
    }
    // Крошечные бабочки, двигаются только днём и не мигают при reduced motion.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !G.weather.night) {
      for(let i=0;i<3;i++) {
        const x=Math.round((110+i*147+Math.sin(now/520+i*2)*12)%W), y=167+i*19+Math.round(Math.sin(now/370+i)*5);
        const c=['#f77da7','#ffe26d','#a4c8ff'][i], flap=Math.floor(now/150+i)%2;
        rect(x-3,y,3,1,c); rect(x+1,y-flap,3,1,c); rect(x,y,2,1,'#72543a');
      }
    }
  }
  function drawHero(now) {
    const x = Math.round(hero.x), y = Math.round(hero.y), moving = Math.abs(hero.tx - hero.x) + Math.abs(hero.ty - hero.y) > 1;
    const bob = moving && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.round(Math.sin(now / 90)) : 0;
    ellipse(x, y + 1, 13, 4, '#35543b88');
    // Берём настоящую выдру из сцены игры, включая её мордочку и экипировку.
    let frame = null;
    try { frame = bridge()?.gardenOtterFrame?.(now); } catch (_) {}
    if (frame) {
      cx.imageSmoothingEnabled = false;
      cx.drawImage(frame, x - 34, y - 76 + bob, 68, 76);
      return;
    }
    // Надёжный резервный рисунок, если основной игровой холст ещё не готов.
    ellipse(x, y-17+bob, 17, 20, '#493022'); ellipse(x, y-19+bob, 14, 17, '#a87549');
    ellipse(x, y-5+bob, 10, 8, '#ead3a7');
    rect(x-10,y-34+bob,5,7,'#503322'); rect(x+5,y-34+bob,5,7,'#503322');
    rect(x-7,y-25+bob,3,4,'#30251e'); rect(x+4,y-25+bob,3,4,'#30251e');
    rect(x-2,y-19+bob,5,3,'#503126');
    rect(x-17,y-39+bob,34,4,'#74502d'); rect(x-13,y-46+bob,26,8,'#e8cb7d');
  }
  function draw(now) {
    if (!opened) return;
    cx.clearRect(0,0,W,H); drawScene(now);
    if (!G) return;
    // Открытые клетки выглядят как ухоженная земля, закрытая часть постепенно зарастает.
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
      const px = GX + x * T, py = GY + y * T, locked = x >= G.area.cols || y >= G.area.rows;
      if (locked) {
        rect(px,py,T,T,'#37543742');
        if ((x+y)%3===0) drawFlower(px+20,py+29,'#e9909d');
      } else {
        rect(px+2,py+3,T-4,T-4,'#41674618');
        rect(px+2,py+T-3,T-4,1,'#365d3a30'); rect(px+T-3,py+2,1,T-4,'#d6e8a025');
      }
    }
    const right=GX+G.area.cols*T, bottom=GY+G.area.rows*T;
    // Тёплые клумбовые бордюры и частокол вокруг участка.
    rect(GX-6,GY-10,right-GX+12,3,'#654228'); rect(GX-6,GY-8,right-GX+12,2,'#d2a064');
    rect(GX-6,bottom+5,right-GX+12,3,'#654228'); rect(GX-6,bottom+5,right-GX+12,2,'#c99358');
    for(let x=GX-5;x<=right+2;x+=18) {
      if(x>GX+T*0.6 && x<GX+T*1.4) continue;
      rect(x,GY-15,4,9,'#865733');rect(x+1,GY-15,2,7,'#d7a66c');rect(x,GY-15,4,2,'#f0ce91');
      rect(x,bottom+1,4,9,'#865733');rect(x+1,bottom+1,2,7,'#d7a66c');
    }
    for(let y=GY;y<bottom;y+=18) {
      rect(GX-8,y,3,9,'#83542f');rect(GX-7,y,1,7,'#d1a064');
      rect(right+5,y,3,9,'#83542f');rect(right+6,y,1,7,'#d1a064');
    }
    // Каменные шаги внутри сада.
    for(let i=0;i<G.area.rows;i++) {
      const py=GY+i*T+T-10;
      rect(GX+T+4,py,15,4,'#bfa271');rect(GX+T+6,py,10,1,'#e4d09d');
    }
    for (const b of G.beds) {
      const x=GX+b.x*T+3,y=GY+b.y*T+5;
      // Квадратная грядка с несколькими слоями досок, тёмной землёй и видимыми креплениями.
      rect(x-2,y+4,T-4,T-8,'#4c3324');rect(x,y+2,T-7,T-10,'#85542f');
      rect(x+3,y+6,T-13,T-18,b.dry?'#9c754d':'#503a2b');
      rect(x,y+1,T-7,4,'#d2a164');rect(x+2,y+2,T-11,1,'#f2d194');
      rect(x,y+T-10,T-7,4,'#9a6438');rect(x+2,y+T-9,T-11,1,'#d8a36a');
      rect(x+1,y+5,2,T-16,'#e1b675');rect(x+T-10,y+5,2,T-16,'#b77b45');
      for(let row=11;row<T-13;row+=8){rect(x+6,y+row,T-19,2,b.dry?'#896541':'#402e23');rect(x+7,y+row+2,T-21,1,'#9b7650');}
      for(const [dx,dy] of [[3,5],[T-11,5],[3,T-14],[T-11,T-14]]) {rect(x+dx,y+dy,3,3,'#edc585');rect(x+dx,y+dy,1,3,'#fff0bb');}
      if(b.crop){
        cx.save();cx.translate(x+7,y+1);cx.scale(1.12,1.12);sprite(cx,b.crop,b.stage,G.catalog.crops[b.crop].color);cx.restore();
        if(b.ready){rect(x+T-14,y+4,3,3,'#ffe98a');rect(x+T-16,y+5,7,1,'#fff8d3');rect(x+T-13,y+2,1,2,'#fff8d3');}
        if(b.dry){rect(x+T-13,y+7,3,5,'#82bbc4');rect(x+T-12,y+5,2,2,'#c9f0ee');}
        if(b.fertilized){rect(x+3,y+T-15,3,3,'#ffe27a');rect(x+4,y+T-16,1,1,'#fff6c8');}
      }
    }
    const drawables=G.decor.map(d=>({y:GY+d.y*T+T,draw:()=>{cx.save();cx.translate(GX+d.x*T+4,GY+d.y*T+2);cx.scale(1.5,1.5);sprite(cx,d.item);cx.restore();}}));
    drawables.push({y:hero.y,draw:()=>drawHero(now)});drawables.sort((a,b)=>a.y-b.y).forEach(d=>d.draw());
    if(G.auto_water){cx.save();cx.translate(GX-30,GY+13);cx.scale(1.15,1.15);sprite(cx,'sprinkler');cx.restore();}
    if(G.upgrades.includes('well')){cx.save();cx.translate(GX-32,GY+54);cx.scale(1.2,1.2);sprite(cx,'well');cx.restore();}
    // Указатель участка как деревянная табличка у калитки.
    rect(392,106,89,27,'#533a28');rect(395,108,83,22,'#d8b575');rect(397,110,79,2,'#f2d89f');
    for(let x=404;x<468;x+=9) rect(x,116,5,2,'#5b7542');
    rect(409,121,53,2,'#745131');
    if (G.weather.night) {
      rect(0,0,W,H,'#1b31534d');
      G.decor.filter(d=>d.item==='lantern').forEach(d=>{
        ellipse(GX+d.x*T+20,GY+d.y*T+13,20,15,'#ffe7a526');
        rect(GX+d.x*T+17,GY+d.y*T+14,6,7,'#ffeab9');
      });
    }
    if(G.weather.rain&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for(let i=0;i<38;i++){const y=((now/22+i*59)%H),x=(i*83)%W;rect(x,y,1,5,'#d8f0e9a8');}
    }
    effects=effects.filter(e=>now-e.born<900);
    effects.forEach(e=>{const t=(now-e.born)/900;for(let i=0;i<5;i++)rect(e.x+Math.cos(i*1.3)*t*17,e.y-t*20+Math.sin(i*1.3)*7,2,2,e.color);});
  }
  function animate(now) {
    if (!opened || document.hidden) return;
    if (now - lastFrame >= 65) { const dt = Math.min(150, now - (lastFrame || now)); lastFrame = now; const factor = Math.min(1, dt / 220); hero.x += (hero.tx - hero.x) * factor; hero.y += (hero.ty - hero.y) * factor; draw(now); }
    animation = requestAnimationFrame(animate);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
