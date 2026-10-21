  // ================= Старт =================
  let resizeTimer;
  const relayout = () => { if ($('textSheet').classList.contains('open')) return; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => layout(false), 120); };
  window.addEventListener('resize', relayout);
  call(tg.onEvent, 'viewportChanged', () => { ensureExpanded(); relayout(); });

  renderTools(); renderColors(); renderContext();
  layout(true);
  requestAnimationFrame(() => layout(false));
  setTimeout(() => layout(false), 250);

  // для отладки и тестов
  window.__draw = { S, get texts() { return texts; }, history, redoStack, view, flatten, get size() { return { W, H, DPR }; } };
