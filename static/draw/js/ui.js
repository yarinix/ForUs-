  // ================= Интерфейс =================
  const dock = { tools: $('tools'), colors: $('colors'), context: $('context') };

  function renderTools() {
    dock.tools.innerHTML = TOOLS.map(([id, label, icon]) =>
      `<button class="tool ${S.tool === id ? 'on' : ''}" data-tool="${id}" aria-label="${label}">
         <svg viewBox="0 0 24 24">${icon}</svg><span>${label}</span></button>`).join('');
  }
  dock.tools.addEventListener('click', e => { const b = e.target.closest('.tool'); if (b) { setTool(b.dataset.tool); haptic('tick'); } });

  function setTool(t) {
    if (t === 'pick' && S.tool !== 'pick') S.prevTool = S.tool;
    S.tool = t; renderTools(); renderContext(); renderColors();
  }

  function renderColors() {
    const off = S.tool === 'eraser' || S.tool === 'pick';
    dock.colors.classList.toggle('off', off);
    dock.colors.innerHTML =
      `<div class="sw custom ${COLORS.includes(S.color) ? '' : 'on'}" title="Свой цвет"><input type="color" id="customColor" value="${S.color}"></div>` +
      COLORS.map(c => `<button class="sw ${S.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Цвет ${c}"></button>`).join('') +
      `<i class="sep"></i><button class="bg-btn" id="bgBtn" aria-label="Фон листа">
         <svg viewBox="0 0 24 24"><rect x="4.500" y="4.500" width="15" height="15" rx="3"/><path d="M4.500 10h15M10 4.500v15"/></svg></button>`;
  }
  dock.colors.addEventListener('click', e => {
    const b = e.target.closest('.sw[data-c]'); if (b) { setColor(b.dataset.c); haptic('tick'); return; }
    if (e.target.closest('#bgBtn')) openBg();
  });
  dock.colors.addEventListener('input', e => { if (e.target.id === 'customColor') setColor(e.target.value, true); });
  function setColor(c, keepPicker) {
    S.color = c; renderContext();
    dock.colors.querySelectorAll('.sw[data-c]').forEach(el => el.classList.toggle('on', el.dataset.c === c));
    const cu = dock.colors.querySelector('.sw.custom'); if (cu) cu.classList.toggle('on', !COLORS.includes(c));
    if (!keepPicker) { const p = $('customColor'); if (p) p.value = c; }
  }

  function renderContext() {
    const t = S.tool, c = dock.context;
    const dotSize = () => Math.max(3, Math.min(34, S.size * (KIND[t] || 1) * (t === 'text' ? 1.6 : 1)));
    const slider = () => `<div class="dot-preview" style="color:${t === 'eraser' ? 'var(--muted)' : S.color}"><i id="dotPrev" style="width:${dotSize()}px;height:${dotSize()}px"></i></div>
       <input type="range" id="sizeRange" min="2" max="40" value="${S.size}" aria-label="Размер">`;
    if (t === 'fill') c.innerHTML = '<span class="hint">Выбери цвет и нажми на область, которую нужно закрасить.</span>';
    else if (t === 'pick') c.innerHTML = '<span class="hint">Нажми на рисунок, чтобы взять оттуда цвет.</span>';
    else if (t === 'shape') c.innerHTML = slider().replace('<input', '<input style="max-width:90px"') +
      `<div class="chips">${SHAPES.map(([id, n, svg]) => `<button class="chip ${S.shape === id ? 'on' : ''}" data-shape="${id}" aria-label="${n}"><svg viewBox="0 0 24 24">${svg}</svg></button>`).join('')}
       <button class="chip text ${S.shapeFill ? 'on' : ''}" id="fillToggle">Залить</button></div>`;
    else if (t === 'stamp') c.innerHTML = slider().replace('<input', '<input style="max-width:90px"') +
      `<div class="chips">${STAMPS.map(s => `<button class="chip ${S.stamp === s ? 'on' : ''}" data-stamp="${s}">${s}</button>`).join('')}</div>`;
    else c.innerHTML = slider();
    const r = $('sizeRange');
    if (r) r.addEventListener('input', () => { S.size = +r.value; const d = $('dotPrev'); if (d) { const v = dotSize(); d.style.width = d.style.height = v + 'px'; } });
  }
  dock.context.addEventListener('click', e => {
    const sh = e.target.closest('[data-shape]'); if (sh) { S.shape = sh.dataset.shape; renderContext(); haptic('tick'); return; }
    const st = e.target.closest('[data-stamp]'); if (st) { S.stamp = st.dataset.stamp; renderContext(); haptic('tick'); return; }
    if (e.target.closest('#fillToggle')) { S.shapeFill = !S.shapeFill; renderContext(); haptic('tick'); }
  });

  // фон листа
  function openBg() { renderBg(); $('bgSheet').classList.add('open'); }
  function renderBg() {
    $('paperColors').innerHTML = PAPERS.map(c => `<button class="paper-sw ${S.paper.color === c ? 'on' : ''}" data-paper="${c}" style="background:${c}" aria-label="Фон ${c}"></button>`).join('') +
      `<div class="paper-sw custom ${PAPERS.includes(S.paper.color) ? '' : 'on'}"><input type="color" id="customPaper" value="${S.paper.color}"></div>`;
    $('paperPatterns').innerHTML = PATTERNS.map(([id, n]) => `<button class="pill ${S.paper.pattern === id ? 'on' : ''}" data-pattern="${id}">${n}</button>`).join('');
  }
  $('paperColors').addEventListener('click', e => { const b = e.target.closest('[data-paper]'); if (b) { S.paper.color = b.dataset.paper; drawBg(); renderBg(); haptic('tick'); setDirty(S.dirty); } });
  $('paperColors').addEventListener('input', e => { if (e.target.id === 'customPaper') { S.paper.color = e.target.value; drawBg(); } });
  $('paperPatterns').addEventListener('click', e => { const b = e.target.closest('[data-pattern]'); if (b) { S.paper.pattern = b.dataset.pattern; drawBg(); renderBg(); haptic('tick'); } });
  $('bgDone').onclick = () => $('bgSheet').classList.remove('open');
  $('bgSheet').addEventListener('click', e => { if (e.target.id === 'bgSheet') $('bgSheet').classList.remove('open'); });

  $('undo').onclick = undo; $('redo').onclick = redo;
  $('clear').onclick = () => {
    if (!S.dirty && !history.length) return;
    pushHistory(); texts = []; renderTexts(); artCtx.save(); artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.clearRect(0, 0, artCanvas.width, artCanvas.height); artCtx.restore();
    toast('Лист очищен. Вернуть можно кнопкой отмены.'); haptic('light');
  };

  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

