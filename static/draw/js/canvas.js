  // ================= Холст =================
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const PAD_X = 12, PAD_Y = 8;
  const $ = (id) => document.getElementById(id);
  const viewport = $('viewport'), stage = $('stage');
  const bgCanvas = $('bgCanvas'), artCanvas = $('artCanvas'), liveCanvas = $('liveCanvas'), textCanvas = $('textCanvas');
  const bgCtx = bgCanvas.getContext('2d');
  const artCtx = artCanvas.getContext('2d', { willReadFrequently: true });
  const liveCtx = liveCanvas.getContext('2d');
  const textCtx = textCanvas.getContext('2d');
  let texts = [];     // текстовые подписи: можно менять, двигать и удалять
  let W = 0, H = 0;   // размер листа в CSS-пикселях

  function applySize(canvas, ctx) {
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function isDark(hex) {
    let h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16) || 0;
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 110;
  }

  function drawBg() {
    const c = bgCtx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = S.paper.color; c.fillRect(0, 0, W, H);
    const ink = isDark(S.paper.color) ? 'rgba(255,255,255,.12)' : 'rgba(40,30,90,.10)';
    c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1;
    if (S.paper.pattern === 'grid') {
      c.beginPath();
      for (let x = 28; x < W; x += 28) { c.moveTo(x + .5, 0); c.lineTo(x + .5, H); }
      for (let y = 28; y < H; y += 28) { c.moveTo(0, y + .5); c.lineTo(W, y + .5); }
      c.stroke();
    } else if (S.paper.pattern === 'dots') {
      for (let x = 24; x < W; x += 24) for (let y = 24; y < H; y += 24) { c.beginPath(); c.arc(x, y, 1.3, 0, 7); c.fill(); }
    } else if (S.paper.pattern === 'lines') {
      c.beginPath();
      for (let y = 36; y < H; y += 32) { c.moveTo(0, y + .5); c.lineTo(W, y + .5); }
      c.stroke();
    }
  }

  function layout(initial) {
    const r = viewport.getBoundingClientRect();
    const w = Math.max(120, Math.floor(r.width - PAD_X * 2));
    const h = Math.max(120, Math.floor(r.height - PAD_Y * 2 - 4));
    if (!initial && w === W && h === H) return;
    let old = null;
    if (!initial && artCanvas.width) {
      old = document.createElement('canvas'); old.width = artCanvas.width; old.height = artCanvas.height;
      old.getContext('2d').drawImage(artCanvas, 0, 0);
    }
    W = w; H = h;
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    applySize(bgCanvas, bgCtx); applySize(artCanvas, artCtx); applySize(liveCanvas, liveCtx); applySize(textCanvas, textCtx);
    drawBg();
    if (old) {   // рисунок остаётся на месте, привязан к левому верхнему углу
      artCtx.save(); artCtx.setTransform(1, 0, 0, 1, 0, 0); artCtx.drawImage(old, 0, 0); artCtx.restore();
      history.length = 0; redoStack.length = 0; updateHistoryButtons();
    }
    renderTexts();
    applyView();
  }

  // Склеенный лист: фон + рисунок (всегда непрозрачный)
  function flatten(withPattern = true) {
    const c = document.createElement('canvas'); c.width = artCanvas.width; c.height = artCanvas.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (withPattern) x.drawImage(bgCanvas, 0, 0);
    else { x.fillStyle = S.paper.color; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(artCanvas, 0, 0);
    x.drawImage(textCanvas, 0, 0);
    return c;
  }

