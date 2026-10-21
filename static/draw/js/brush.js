  // ================= Рисование =================
  const pointers = new Map();
  let stroke = null, gesture = null, gestureLock = false;

  function toPaper(e) {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height),
             p: e.pointerType === 'pen' ? Math.max(0.05, e.pressure || 0.5) : 0 };
  }
  const widthFor = (pt) => {
    const base = S.size * (KIND[S.tool] || 1);
    return pt.p ? base * (0.35 + pt.p * 1.3) : base;
  };

  function clearLive() { liveCtx.save(); liveCtx.setTransform(1, 0, 0, 1, 0, 0); liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height); liveCtx.restore(); }
  function commitLive(alpha = 1) {
    artCtx.save(); artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.globalAlpha = alpha;
    artCtx.drawImage(liveCanvas, 0, 0); artCtx.restore(); clearLive();
    liveCanvas.style.opacity = 1;
  }

  // фигуры
  function heartPath(c, x, y, w, h) {
    const cx = x + w / 2;
    c.moveTo(cx, y + h * 0.30);
    c.bezierCurveTo(cx, y, x, y, x, y + h * 0.32);
    c.bezierCurveTo(x, y + h * 0.62, cx - w * 0.12, y + h * 0.78, cx, y + h);
    c.bezierCurveTo(cx + w * 0.12, y + h * 0.78, x + w, y + h * 0.62, x + w, y + h * 0.32);
    c.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.30);
    c.closePath();
  }
  function starPath(c, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2 + h * 0.04, R = Math.min(w, h) / 2 * 1.08, r = R * 0.42;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      const px = cx + Math.cos(a) * rad * (w / Math.min(w, h)), py = cy + Math.sin(a) * rad * (h / Math.min(w, h));
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  }
  function drawShape(c, kind, a, b) {
    c.save();
    c.lineWidth = Math.max(2, S.size); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = c.fillStyle = S.color;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    c.beginPath();
    if (kind === 'line' || kind === 'arrow') {
      c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
      if (kind === 'arrow') {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), L = Math.max(14, S.size * 3.2);
        c.moveTo(b.x, b.y); c.lineTo(b.x - L * Math.cos(ang - 0.45), b.y - L * Math.sin(ang - 0.45));
        c.moveTo(b.x, b.y); c.lineTo(b.x - L * Math.cos(ang + 0.45), b.y - L * Math.sin(ang + 0.45));
      }
      c.stroke();
    } else {
      if (kind === 'rect') { if (c.roundRect) c.roundRect(x, y, w, h, Math.min(14, w / 4, h / 4)); else c.rect(x, y, w, h); }
      else if (kind === 'ellipse') c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else if (kind === 'heart') heartPath(c, x, y, w, h);
      else if (kind === 'star') starPath(c, x, y, w, h);
      S.shapeFill ? c.fill() : c.stroke();
    }
    c.restore();
  }
  function stampSize() { return 30 + S.size * 3.2; }
  function drawStamp(c, pt) {
    c.save(); c.font = `${stampSize()}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(S.stamp, pt.x, pt.y); c.restore();
  }

  let textTap = null;
  function resetPointers() { pointers.clear(); gesture = null; gestureLock = false; textTap = null; stroke = null; }
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
    if (pointers.size === 2) { cancelStroke(); startGesture(); return; }
    if (pointers.size > 2 || gestureLock) return;

    const pt = toPaper(e), t = S.tool;
    if (t === 'pick') { pickColor(pt); return; }
    if (t === 'fill') { doFill(pt); return; }
    if (t === 'text') { textTap = { pid: e.pointerId, pt, hit: hitText(pt), moved: false, start: pt }; return; }

    stroke = { pid: e.pointerId, tool: t, pts: [pt], start: pt, last: pt, mid: pt, hist: false };
    if (t === 'pen' || t === 'marker') {
      liveCanvas.style.opacity = t === 'marker' ? 0.42 : 1;
      const w = widthFor(pt);
      liveCtx.fillStyle = S.color; liveCtx.beginPath(); liveCtx.arc(pt.x, pt.y, w / 2, 0, 7); liveCtx.fill();
    } else if (t === 'eraser') {
      stroke.snapshot = snap();
      const w = widthFor(pt);
      artCtx.save(); artCtx.globalCompositeOperation = 'destination-out';
      artCtx.beginPath(); artCtx.arc(pt.x, pt.y, w / 2, 0, 7); artCtx.fill(); artCtx.restore();
    } else if (t === 'shape') {
      liveCanvas.style.opacity = 1;
    } else if (t === 'stamp') {
      clearLive(); drawStamp(liveCtx, pt);
    }
  }

  function strokeMove(e) {
    const s = stroke; if (!s) return;
    const list = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    for (const ev of list) {
      const pt = toPaper(ev);
      if (s.tool === 'pen' || s.tool === 'marker') {
        const mid = { x: (s.last.x + pt.x) / 2, y: (s.last.y + pt.y) / 2 };
        liveCtx.save(); liveCtx.strokeStyle = S.color; liveCtx.lineWidth = widthFor(pt);
        liveCtx.lineCap = 'round'; liveCtx.lineJoin = 'round';
        liveCtx.beginPath(); liveCtx.moveTo(s.mid.x, s.mid.y);
        liveCtx.quadraticCurveTo(s.last.x, s.last.y, mid.x, mid.y); liveCtx.stroke(); liveCtx.restore();
        s.mid = mid;
      } else if (s.tool === 'eraser') {
        artCtx.save(); artCtx.globalCompositeOperation = 'destination-out';
        artCtx.lineWidth = widthFor(pt); artCtx.lineCap = 'round'; artCtx.lineJoin = 'round';
        artCtx.beginPath(); artCtx.moveTo(s.last.x, s.last.y); artCtx.lineTo(pt.x, pt.y); artCtx.stroke(); artCtx.restore();
      } else if (s.tool === 'shape') {
        clearLive(); drawShape(liveCtx, S.shape, s.start, pt);
      } else if (s.tool === 'stamp') {
        clearLive(); drawStamp(liveCtx, pt);
      }
      s.last = pt;
    }
  }

  function endStroke() {
    const s = stroke; if (!s) return; stroke = null;
    if (s.tool === 'pen' || s.tool === 'marker') {
      // дотягиваем линию до последней точки
      liveCtx.save(); liveCtx.strokeStyle = S.color; liveCtx.lineWidth = widthFor(s.last); liveCtx.lineCap = 'round';
      liveCtx.beginPath(); liveCtx.moveTo(s.mid.x, s.mid.y); liveCtx.lineTo(s.last.x, s.last.y); liveCtx.stroke(); liveCtx.restore();
      pushHistory(); commitLive(s.tool === 'marker' ? 0.42 : 1);
    } else if (s.tool === 'eraser') {
      history.push(s.snapshot); if (history.length > MAX_HISTORY) history.shift();
      redoStack.length = 0; updateHistoryButtons(); setDirty(true);
    } else if (s.tool === 'shape') {
      if (Math.hypot(s.last.x - s.start.x, s.last.y - s.start.y) < 4) { clearLive(); return; }
      pushHistory(); commitLive();
    } else if (s.tool === 'stamp') {
      pushHistory(); commitLive(); haptic('light');
    }
  }

  function cancelStroke() {
    const s = stroke; if (!s) return; stroke = null;
    if (s.tool === 'eraser' && s.snapshot) restore(s.snapshot);
    clearLive(); liveCanvas.style.opacity = 1;
  }

  // жест двумя пальцами
  function startGesture() {
    const [a, b] = [...pointers.values()];
    const r = viewport.getBoundingClientRect();
    gesture = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: view.s, tx0: view.tx, ty0: view.ty,
                cx0: (a.x + b.x) / 2 - r.left, cy0: (a.y + b.y) / 2 - r.top };
    gestureLock = true;
  }
  function moveGesture() {
    const [a, b] = [...pointers.values()];
    const r = viewport.getBoundingClientRect(), g = gesture;
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    const ns = Math.min(6, Math.max(1, g.s0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0));
    const ux = (g.cx0 - PAD_X - g.tx0) / g.s0, uy = (g.cy0 - PAD_Y - g.ty0) / g.s0;
    view.s = ns; view.tx = cx - PAD_X - ux * ns; view.ty = cy - PAD_Y - uy * ns;
    applyView(); flashBadge();
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && pointers.size >= 2) { moveGesture(); return; }
    if (textTap && textTap.pid === e.pointerId && textTap.hit) { dragText(e); return; }
    if (stroke && e.pointerId === stroke.pid) strokeMove(e);
  }
  function dragText(e) {
    const tt = textTap, pt = toPaper(e), t = tt.hit;
    if (!tt.moved) {
      if (Math.hypot(pt.x - tt.start.x, pt.y - tt.start.y) < 7) return;
      tt.moved = true; tt.ox = t.x; tt.oy = t.y; pushHistory();
    }
    t.x = tt.ox + pt.x - tt.start.x; t.y = tt.oy + pt.y - tt.start.y; renderTexts();
  }
  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
    if (textTap && textTap.pid === e.pointerId) {
      const tap = textTap; textTap = null;
      if (e.type === 'pointerup' && pointers.size === 0 && !gesture && !tap.moved) openText(tap.pt, tap.hit);
      else if (tap.moved && e.type === 'pointercancel') { /* оставляем где остановился */ }
    }
    if (gesture) { if (pointers.size < 2) gesture = null; }
    if (pointers.size === 0) gestureLock = false;
    if (stroke && e.pointerId === stroke.pid) { e.type === 'pointercancel' ? cancelStroke() : endStroke(); }
  }
  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', resetPointers);
  ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu'].forEach(n => document.addEventListener(n, e => e.preventDefault()));

