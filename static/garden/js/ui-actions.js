  function icon(type, color, stage = 3) {
    const crop = CROPS_LIST.includes(type), c = node('canvas', 'g-item-icon'); c.width = c.height = crop ? 32 : 28;
    const context = c.getContext('2d'); context.imageSmoothingEnabled = false;
    compact = true; try { sprite(context, type, stage, color); } finally { compact = false; } return c;
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
    q('g-plus').addEventListener('click', () => { zoom = Math.min(3, zoom + .3); size(); });
    q('g-minus').addEventListener('click', () => { zoom = Math.max(1, zoom - .3); size(); });
    q('g-sheet-close').addEventListener('click', closeSheet);
    q('g-sheet').addEventListener('click', e => { if (e.target === q('g-sheet')) closeSheet(); });
    q('g-confirm-no').addEventListener('click', () => finishConfirm(false));
    q('g-confirm-yes').addEventListener('click', () => finishConfirm(true));
    q('g-scroll').addEventListener('scroll', () => { const n = performance.now(); if (n - camSet > 140) panUntil = n + 3500; }, { passive: true });
    q('g-world').addEventListener('click', e => { panUntil = 0; if (!G) return; if (mode && String(mode.type).startsWith('pen')) { placeGhost(e); return; } if (e.target.closest('.g-cell')) return; const box = q('g-world').getBoundingClientRect(); hero.tx = Math.max(40, Math.min(W - 40, (e.clientX - box.left) / scale)); hero.ty = Math.max(70, Math.min(H - 26, (e.clientY - box.top) / scale)); });
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
    G = null; pending = null; mode = null; penGhost = null; sheet = null; centered = false; renderCare(); size();
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
      bridge()?.sound(r.ok ? (['buy', 'expand', 'buy_pen', 'buy_animal'].includes(payload.action) ? 'buy' : ['sell', 'sell_all', 'sell_good', 'sell_goods'].includes(payload.action) ? 'coin' : 'ok') : 'no');
      if (r.ok) { bridge()?.haptic('ok'); effects.push({ x: selectedPen && penOf(selectedPen) ? penSlot(penOf(selectedPen))[0] + PEN_W / 2 : GX + selected.x * T + T / 2, y: selectedPen && penOf(selectedPen) ? penSlot(penOf(selectedPen))[1] + 40 : GY + selected.y * T, born: performance.now(), color: '#f8e6a0' }); }
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
  async function buyPen() {
    if (!G || busy || pending) return; const c = G.catalog.pen;
    if (G.pens.length + G.pen_stock >= c.max) { notify('Больше загонов во дворе не поместится.'); return; }
    if (await confirm('Купить загон за ' + fmt(c.price) + ' монет из общей копилки? Потом вы сами выберете, где его поставить.')) { await act('buy_pen'); if (G && G.pen_stock > 0) startPenPlace(); }
  }
  function startPenPlace(id) {
    if (!G) return; closeSheet(); selectedPen = null; mode = { type: id ? 'penmove' : 'penplace', id };
    const pen = id ? penOf(id) : null; penGhost = { x: pen ? pen.x : 200, y: pen ? pen.y : 200 }; penGhost.err = penSpotError(penGhost.x, penGhost.y, id);
    q('g-hits').classList.add('g-placing'); renderCare();
  }
  function endPenPlace() { mode = null; penGhost = null; q('g-hits').classList.remove('g-placing'); renderCare(); }
  function placeGhost(e) {
    const box = q('g-world').getBoundingClientRect(), wx = (e.clientX - box.left) / scale, wy = (e.clientY - box.top) / scale;
    const x = Math.round((wx - PEN_W / 2) / 2) * 2, y = Math.round((wy - PEN_H / 2) / 2) * 2;
    penGhost = { x: Math.max(0, Math.min(W - PEN_W, x)), y: Math.max(0, Math.min(H - PEN_H, y)), moved: true };
    penGhost.err = penSpotError(penGhost.x, penGhost.y, mode.id); renderCare();
  }
  async function confirmPenPlace() {
    if (!penGhost || penGhost.err || !mode) { notify(penGhost?.err || 'Нажмите на карту, куда поставить загон.'); return; }
    const m0 = mode, g0 = penGhost; endPenPlace();
    await act(m0.type === 'penmove' ? 'move_pen' : 'place_pen', { pen: m0.id, x: g0.x, y: g0.y });
  }
  // Выбираем загон: сначала с тем же видом и местом, потом пустой.
  function pickPen(species, penId) {
    const cap = G.catalog.pen.capacity;
    if (penId) { const p = penOf(penId), sp = penSpecies(penId); return p && (!sp || sp === species) && penAnimals(penId).length < cap ? p : null; }
    const same = G.pens.find(p => penSpecies(p.id) === species && penAnimals(p.id).length < cap);
    return same || G.pens.find(p => !penSpecies(p.id)) || null;
  }
  async function buyAnimal(species, penId) {
    if (!G || busy || pending) return; const sp = G.catalog.species[species], pen = pickPen(species, penId);
    if (!G.pens.length) { notify('Сначала постройте загон.'); return; }
    if (!pen) { notify(G.pens.some(p => penSpecies(p.id) === species) ? 'Загон для этого вида заполнен.' : 'Нет свободного загона: в одном загоне живёт один вид.'); return; }
    if (await confirm('Купить: ' + sp.name.toLowerCase() + ' за ' + fmt(sp.price) + ' монет из общей копилки?')) { selectedPen = pen.id; act('buy_animal', { pen: pen.id, item: species }); }
  }
  function selectPen(id) {
    if (!G || busy || pending) return; panUntil = 0; selectedPen = id; mode = null; const pen = penOf(id); if (!pen) return;
    const [sx, sy] = penSlot(pen); hero.tx = sx < W / 2 ? sx + PEN_W + 14 : sx - 14; hero.ty = sy + PEN_H - 6;
    renderHits(); renderCare();
  }
  function closeSheet() { sheet = null; q('g-sheet').hidden = true; renderNav(); }
  function openSheet(type) { if (!G) return; sheet = type; q('g-sheet').hidden = false; renderSheet(); renderNav(); q('g-sheet-close').focus(); }
