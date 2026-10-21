  // ================= Текст =================
  let textPos = null, editing = null;
  const textFontSize = () => 18 + S.size * 2.4;
  const fontFor = (size) => `700 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
  function drawText(c, t) {
    c.save(); c.font = fontFor(t.size);
    c.fillStyle = t.color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t.str, t.x, t.y); c.restore();
  }
  function renderTexts() {
    textCtx.save(); textCtx.setTransform(1, 0, 0, 1, 0, 0); textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height); textCtx.restore();
    for (const t of texts) if (t !== editing) drawText(textCtx, t);
  }
  function hitText(pt) {
    textCtx.save();
    try {
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i]; textCtx.font = fontFor(t.size);
        const w = textCtx.measureText(t.str).width / 2 + 12, h = t.size * 0.7 + 12;
        if (Math.abs(pt.x - t.x) <= w && Math.abs(pt.y - t.y) <= h) return t;
      }
    } finally { textCtx.restore(); }
    return null;
  }
  function openText(pt, existing) {
    resetPointers(); editing = existing || null;
    textPos = existing ? { x: existing.x, y: existing.y } : pt;
    $('textInput').value = existing ? existing.str : '';
    $('textDelete').style.display = existing ? '' : 'none';
    $('textTitle').textContent = existing ? 'Изменить текст' : 'Новый текст';
    if (existing) renderTexts();
    const m = $('textMark'); m.style.left = textPos.x + 'px'; m.style.top = textPos.y + 'px'; m.style.display = 'block';
    $('textSheet').classList.add('open');
    liveDraw();
    setTimeout(() => { const i = $('textInput'); i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (err) {} }, 60);
  }
  function liveDraw() {
    clearLive();
    const v = $('textInput').value;
    if (!textPos || !v) return;
    drawText(liveCtx, { x: textPos.x, y: textPos.y, str: v,
      color: editing ? editing.color : S.color, size: editing ? editing.size : textFontSize() });
  }
  function closeText() {
    $('textSheet').classList.remove('open'); $('textMark').style.display = 'none';
    $('textInput').blur(); clearLive(); textPos = null; editing = null; renderTexts(); resetPointers();
    setTimeout(() => { resetPointers(); layout(false); }, 350);
  }
  $('textInput').addEventListener('input', liveDraw);
  $('textCancel').onclick = closeText;
  $('textDelete').onclick = () => {
    if (editing) { pushHistory(); texts = texts.filter(t => t !== editing); haptic('light'); }
    closeText();
  };
  $('textDone').onclick = () => {
    const v = $('textInput').value.trim();
    if (editing) {
      if (!v) { pushHistory(); texts = texts.filter(t => t !== editing); }
      else if (v !== editing.str) { pushHistory(); editing.str = v; }
      haptic('light');
    } else if (v && textPos) {
      pushHistory(); texts.push({ x: textPos.x, y: textPos.y, str: v, color: S.color, size: textFontSize() }); haptic('light');
    }
    closeText();
  };
  $('textInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('textDone').click(); });

