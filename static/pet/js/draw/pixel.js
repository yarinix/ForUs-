  // =====================================================================
  // ПИКСЕЛЬ-АРТ: всё нарисовано кодом, без картинок. Один «пиксель» игры = K пикселей экрана.
  // =====================================================================
  const OUT = '#2a1722';
  const BAYER = [[0, 2], [3, 1]];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function newLayer(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false;
    return { c, x, w, h };
  }
  const dot = (L, x, y, col) => { L.x.fillStyle = col; L.x.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const rect = (L, x, y, w, h, col) => { L.x.fillStyle = col; L.x.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // шаблоны из строк: '.' пусто, остальные символы — цвета из карты
  function spr(L, x0, y0, rows, map) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && map[ch]) dot(L, x0 + i, y0 + j, map[ch]); } });
  }

  // шарик/эллипс с объёмом: свет слева сверху, оттенки из ramp (от светлого к тёмному), шахматная растушёвка на границах
  function ell(L, cx, cy, rx, ry, ramp, o = {}) {
    const lx = o.lx ?? -0.55, ly = o.ly ?? -0.7, lz = 0.5, n = ramp.length, dth = o.d ?? 0.2;
    const ln = Math.hypot(lx, ly, lz);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry, r2 = dx * dx + dy * dy;
        if (r2 > 1) continue;
        const nz = Math.sqrt(1 - r2), d = (dx * lx + dy * ly + nz * lz) / ln;      // -1..1
        const t = 1 - clamp((d + 0.15) / 1.05, 0, 1);                              // 0 светло .. 1 тень
        let idx = t * (n - 1) + (BAYER[y & 1][x & 1] - 1.5) * dth;
        dot(L, x, y, ramp[clamp(Math.round(idx), 0, n - 1)]);
      }
    }
  }
  // плоский эллипс одним цветом (ковёр, еда в миске)
  function flat(L, cx, cy, rx, ry, col) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if (dx * dx + dy * dy <= 1) dot(L, x, y, col);
    }
  }
  // вертикальный градиент полосами с растушёвкой
  function band(L, x, y, w, h, cols) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const t = (j / Math.max(1, h - 1)) * (cols.length - 1) + (BAYER[(y + j) & 1][(x + i) & 1] - 1.5) * 0.22;
      dot(L, x + i, y + j, cols[clamp(Math.round(t), 0, cols.length - 1)]);
    }
  }
  // тёмная обводка вокруг всего нарисованного на слое
  function outline(L, col = OUT) {
    const img = L.x.getImageData(0, 0, L.w, L.h), d = img.data, a = (x, y) => (x < 0 || y < 0 || x >= L.w || y >= L.h) ? 0 : d[(y * L.w + x) * 4 + 3];
    const hex = parseInt(col.slice(1), 16), r = hex >> 16, g = (hex >> 8) & 255, b = hex & 255, mark = [];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      if (a(x, y) === 0 && (a(x - 1, y) > 0 || a(x + 1, y) > 0 || a(x, y - 1) > 0 || a(x, y + 1) > 0)) mark.push((y * L.w + x) * 4);
    }
    for (const i of mark) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
    L.x.putImageData(img, 0, 0);
  }
  // нарисовать функцией на временном слое, обвести и положить на целевой слой
  function prop(target, fn, w, h) {
    const T = newLayer(w || target.w, h || target.h); fn(T); outline(T); target.x.drawImage(T.c, 0, 0);
  }

  // ---------- палитры ----------
  const FUR = ['#c68b59', '#ab6f44', '#8e5633', '#704024', '#522c18'];
  const FURD = ['#9c623c', '#824e2e', '#683b22', '#4f2b18', '#381d0f'];
  const BELLY = ['#fff3db', '#f7e1b8', '#e6c896', '#cca774', '#ad8656'];
  const OTT_OUT = '#321b10';
  const BLUE = ['#99c4ff', '#6297f2', '#3f6fd6', '#2b4ea8', '#1d3678'];
  const WOOD = ['#d6a166', '#bc854e', '#9c6839', '#7d4f2a', '#5c381c'];

  // ---------- мелкие значки ----------
  const SPR = {
    heart: { rows: ['.hh.rr.', 'hhrrrrr', 'hrrrrrd', '.rrrrd.', '..rrd..', '...d...'], map: { r: '#ff4f6e', h: '#ffc2cf', d: '#b82546' } },
    bolt: { rows: ['...hy', '..hyy', '.hyy.', 'hyyyy', '..yd.', '.yd..', 'yd...'], map: { y: '#ffd93d', h: '#fff7b8', d: '#d99a16' } },
    fish: { rows: ['...hbb...o', '.hhbbbbbbo', 'bbkbbbbbbo', 'bLLLLLbbdo', '.dddddddo.', '...ddd...o'.replace('o', '.')], map: { b: '#ff9a3c', h: '#ffc278', d: '#d97218', L: '#ffe0a8', k: '#2a1722', o: '#e07b22' } },
    moon: { rows: ['..hyyy', '.hyyy.', 'hyyd..', 'hyyd..', 'yyyd..', '.yyyd.', '..dddd'], map: { y: '#ffe27a', h: '#fff9c4', d: '#d4a22a' } },
    paw: { rows: ['h...h', '.p.p.', '.hph.', 'hpppp', 'ppppp', '.ddd.'], map: { p: '#cfe0ff', h: '#ffffff', d: '#8aa8e0' } },
    list: { rows: ['hhhhhh', 'wLLLLd', 'wwwwdd', 'wLLLLd', 'wwwwdd', 'wLLLLd', 'dddddd'], map: { w: '#e8efff', h: '#ffffff', d: '#b8c8e8', L: '#6b8cd8' } },
    house: { rows: ['....h....', '...hrr...', '..hrrrr..', '.hrrrrrd.', 'wwwwwwwwd', 'wwwdddwwd', 'wwwdYdwwd'], map: { r: '#ff7a59', h: '#ffa88f', w: '#ffe9c4', d: '#8f5e35', Y: '#ffd93d' } },
    ball: { rows: ['..hbbb..', '.hhbbbb.', 'hhbbbbbd', 'wwwwwwww', 'bbbbbbdd', '.bbbbdd.', '..dddd..'], map: { b: '#4f83e8', h: '#b3d1ff', d: '#28499e', w: '#ffffff' } },
    arrR: { rows: ['hy...', '.hy..', '..hy.', '...hy', '..yd.', '.yd..', 'yd...'], map: { y: '#ffffff', h: '#ffffff', d: '#b8ccf0' } },
    arrL: { rows: ['...yh', '..yh.', '.yh..', 'yh...', '.dy..', '..dy.', '...dy'], map: { y: '#ffffff', h: '#ffffff', d: '#b8ccf0' } },
    trophy: { rows: ['hyyyyyyd', 'hyyyyyyd', '.hyyyyd.', '..hyyd..', '...yd...', '..hyyd..', '.dddddd.'], map: { y: '#ffcf3d', h: '#fff5b8', d: '#c98a10' } },
    gift: { rows: ['..y..y..', '.hyyyyy.', '..yyyy..', 'hrryyrrd', 'rrryyrrd', 'hyyyyyyd', 'rrryyrrd', 'dddyyddd'], map: { r: '#ff5a8a', h: '#ff94b4', d: '#c4315c', y: '#ffe27a' } },
    bag: { rows: ['..hhhh..', '.h....h.', '.h....h.', 'hrrrrrrd', 'rrrrrrrd', 'rrrYYrrd', 'rrrrrrrd', 'dddddddd'], map: { r: '#ff7a59', d: '#c94f32', h: '#ffffff', Y: '#ffe27a' } },
    shirt: { rows: ['.hw...wd.', 'hwww.wwwd', 'hwwwwwwwd', '.hwwwwwd.', '.wwwwwwd.', '.ddddddd.'], map: { w: '#8fc4ff', h: '#c4e2ff', d: '#5893d4' } },
    gear: { rows: ['....h....', '.hh.h.gg.', '.hgggggd.', '..gg.gd..', 'hgg...ggd', '..gg.gd..', '.ggggggd.', '.gg.d.dd.', '....d....'], map: { g: '#cfe0ff', h: '#ffffff', d: '#88a2cc' } },
    tree: { rows: ['....h....', '...hgg...', '..hgggg..', '...hgd...', '..hgggg..', '.hggggdd.', '....b....', '....d....'], map: { g: '#4eaa56', h: '#82de84', d: '#2f7a3a', b: '#a9683a' } },
    mush: { rows: ['..hrrr..', '.rwrrwr.', 'hrrrrrrd', '..hssd..', '..sssd..', '..dddd..'], map: { r: '#e8505b', h: '#ff858d', d: '#a82a34', w: '#ffffff', s: '#f6e6c8' } },
    rod: { rows: ['.......bb', '......b.l', '.....b..l', '....b...l', '...b....l', '..b.....l', '.h......r', 'h.......w'], map: { b: '#c99358', h: '#e6b87d', l: '#e8eef5', r: '#ff5a6a', w: '#ffffff' } },
    coin: { rows: ['..hyyy..', '.yhyyyd.', 'yhyyddyd', 'yhyydyyd', 'yyyydyyd', 'yyyddyyd', '.yyyydd.', '..dddd..'], map: { y: '#ffcf3d', h: '#fff7bd', d: '#c98a10' } },
  };
  function icon(name, k) {
    const s = SPR[name], w = Math.max(...s.rows.map(r => r.length)) + 2, h = s.rows.length + 2, L = newLayer(w, h);
    spr(L, 1, 1, s.rows, s.map); outline(L);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.className = 'pxi';
    cv.style.width = (w * k) + 'px'; cv.style.height = (h * k) + 'px'; cv.getContext('2d').drawImage(L.c, 0, 0);
    return cv;
  }
  document.querySelectorAll('[data-icon]').forEach(el => { el.textContent = ''; el.appendChild(icon(el.dataset.icon, +el.dataset.k || 3)); });

