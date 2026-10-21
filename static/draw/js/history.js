  // ================= Отмена / повтор =================
  const history = [], redoStack = [];
  const MAX_HISTORY = 12;
  const snap = () => ({ img: artCtx.getImageData(0, 0, artCanvas.width, artCanvas.height), texts: JSON.stringify(texts) });
  function restore(h) { artCtx.putImageData(h.img, 0, 0); texts = JSON.parse(h.texts); renderTexts(); }

  function pushHistory() {
    history.push(snap());
    if (history.length > MAX_HISTORY) history.shift();
    redoStack.length = 0; updateHistoryButtons();
    setDirty(true);
  }
  function undo() {
    if (!history.length) return;
    redoStack.push(snap());
    restore(history.pop());
    updateHistoryButtons(); haptic('tick');
  }
  function redo() {
    if (!redoStack.length) return;
    history.push(snap());
    restore(redoStack.pop());
    updateHistoryButtons(); haptic('tick');
  }
  function updateHistoryButtons() {
    $('undo').disabled = !history.length; $('redo').disabled = !redoStack.length;
  }
  function setDirty(v) {
    S.dirty = v;
    if (v) call(tg.enableClosingConfirmation); else call(tg.disableClosingConfirmation);
  }

