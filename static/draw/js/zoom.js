  // ================= Масштаб и перемещение =================
  const view = { s: 1, tx: 0, ty: 0 };
  function clampView() {
    if (view.s <= 1.02) { view.s = 1; view.tx = 0; view.ty = 0; return; }
    view.tx = Math.min(0, Math.max(-(view.s - 1) * W, view.tx));
    view.ty = Math.min(0, Math.max(-(view.s - 1) * H, view.ty));
  }
  function applyView() {
    clampView();
    stage.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
    $('resetView').hidden = view.s <= 1;
    const badge = $('zoomBadge');
    badge.textContent = Math.round(view.s * 100) + '%';
  }
  let badgeTimer;
  function flashBadge() {
    const b = $('zoomBadge'); b.style.display = 'block';
    clearTimeout(badgeTimer); badgeTimer = setTimeout(() => { b.style.display = 'none'; }, 700);
  }
  $('resetView').onclick = () => { view.s = 1; view.tx = view.ty = 0; applyView(); haptic('tick'); };

