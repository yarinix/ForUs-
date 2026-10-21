  // ---------- расстановка мебели ----------
  const fl = () => view.fy + 8, fh = () => view.H - view.fy - 10;
  function pxOf(c, it) {
    return { x: Math.round(it.x / 100 * view.W), y: c.pl === 'wall' ? Math.round(4 + it.y / 100 * (view.fy - 20)) : Math.round(fl() + it.y / 100 * fh()) };
  }
  function pctOf(c, px, py) {
    return { x: clamp(Math.round(px / view.W * 100), 5, 95), y: c.pl === 'wall' ? clamp(Math.round((py - 4) / (view.fy - 20) * 100), 0, 100) : clamp(Math.round((py - fl()) / fh() * 100), 0, 100) };
  }
  const FLAT_IDS = new Set(['hrug', 'krug', 'brug', 'picnic']);                 // запасной список «плоских» вещей, если каталог с сервера старый
  const isFlat = (id, c) => !!((c && c.flat) || FLAT_IDS.has(id));
  function roomItems(room) {
    const out = []; if (!S || !CAT || !view.fy) return out;
    for (const id in (S.placed || {})) {
      const it = S.placed[id]; if (it.room !== room) continue;
      const c = CAT[id], f = c && furnLayer(id); if (!f) continue;
      const p = pxOf(c, it); out.push({ id, c, f, x: p.x, y: p.y });
    }
    // слои: 0 — стена, 1 — ковры и пледы (всегда самый низ пола), 2 — мебель и вещи (по глубине), 3 — то, что сейчас тащим
    const lay = (o) => o.c.pl === 'wall' ? 0 : isFlat(o.id, o.c) ? 1 : (drag && drag.id === o.id) ? 3 : 2;
    out.sort((a, b) => lay(a) - lay(b) || a.y - b.y);
    return out;
  }
  function drawItems(room, dx, front, now) {
    if (!front) for (const o of roomItems(room)) itemShadow(o, dx);   // тени всех предметов комнаты — под выдрой и под самими предметами
    for (const o of roomItems(room)) {
      if ((o.c.pl !== 'wall' && !isFlat(o.id, o.c) && o.y > view.baseY + 4) !== front) continue;   // ковры всегда позади выдры
      const x = o.x - (o.f.w >> 1) + dx, y = o.c.pl === 'wall' ? o.y - (o.f.h >> 1) : o.y - o.f.h;
      sx.drawImage(o.f.c, x, y);
      if (o.id === 'aquarium') {
        // Плавание без заметного короткого цикла: сложенные волны дают каждой рыбке свой маршрут.
        const t = now / 1000;
        // Рыбки ограничены стеклом аквариума (внутри x 4..29, y 5..18), чтобы никогда не выплывать за границы.
        const swim = (baseX, baseY, phase, rangeX, rangeY, fw, fh) => {
          const dx = Math.round(Math.sin(t * 0.63 + phase) * rangeX + Math.sin(t * 0.29 + phase * 1.7) * rangeX * 0.28);
          const dy = Math.round(Math.sin(t * 0.91 + phase * 1.3) * rangeY + Math.sin(t * 0.37 + phase) * rangeY * 0.35);
          return { x: x + Math.max(4, Math.min(30 - fw, baseX + dx)), y: y + Math.max(5, Math.min(19 - fh, baseY + dy)) };
        };
        const f1 = swim(13, 9, 0.8, 6, 2, 7, 5);
        const f2 = swim(17, 14, 3.4, 4, 2, 5, 3);
        spr({ x: sx, w: 0, h: 0 }, f1.x, f1.y, ['..ho...', '.hooooo', 'oookwoo', '.ddddoo', '..do...'], { h: '#ffd999', o: '#ff9a3c', d: '#d96b18', w: '#fff5e0', k: OUT });
        spr({ x: sx, w: 0, h: 0 }, f2.x, f2.y, ['.hbb.', 'bbkwb', '.ddb.'], { h: '#c4d8ff', b: '#6b94ff', d: '#3b62cc', w: '#ffffff', k: OUT });
        // Пузыри возникают нерегулярно и в разных местах.
        for (let i = 0; i < 3; i++) {
          const phase = t * (0.42 + i * 0.07) + i * 2.4;
          const bx = x + 8 + ((i * 9 + Math.floor(Math.sin(phase) * 3 + 4)) % 18);
          const by = y + 5 + ((Math.floor(now / (570 + i * 90) + i * 7) % 10));
          if (Math.sin(phase * 1.9) > 0.58) { sx.fillStyle = 'rgba(255,255,255,.72)'; sx.fillRect(bx, by, 1, 2); }
        }
      }
      if (o.id === 'tv') {
        const pulse = Math.floor(now / 230) % 4;
        sx.fillStyle = pulse === 0 ? 'rgba(255,255,255,.24)' : pulse === 1 ? 'rgba(255,95,125,.16)' : 'rgba(70,180,255,.12)';
        sx.fillRect(x + 4, y + 5, 26, 17);
        const shift = Math.floor(now / 170) % 5;
        sx.fillStyle = 'rgba(255,255,255,.3)'; sx.fillRect(x + 5, y + 6 + shift, 24, 1);
      }
      if (o.id === 'campfire') spr({ x: sx, w: 0, h: 0 }, x + 8, y + 3, FLAME[Math.floor(now / 160) % 3], FLAMEMAP);
      if (view.edit && sel === o.id) {
        sx.fillStyle = (Math.floor(now / 350) % 2) ? '#ffe27a' : '#ffffff';
        const x0 = x - 1, y0 = y - 1, w = o.f.w + 2, h = o.f.h + 2;
        for (const [cx, cy, a, b] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]]) { sx.fillRect(cx, cy, 4 * a, b); sx.fillRect(cx, cy, a, 4 * b); }
      }
    }
  }
  function hitItem(lx, ly) {
    const list = roomItems(view.cur);
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i], x0 = o.x - (o.f.w >> 1), y0 = o.c.pl === 'wall' ? o.y - (o.f.h >> 1) : o.y - o.f.h;
      if (lx >= x0 && lx <= x0 + o.f.w && ly >= y0 && ly <= y0 + o.f.h) return o.id;
    }
    return null;
  }
  const toLocal = (e) => { const r = sc.getBoundingClientRect(); return [(e.clientX - r.left) / view.K, (e.clientY - r.top) / view.K]; };
  const placedHere = (id) => !!(S && S.placed && S.placed[id] && S.placed[id].room === view.cur);
  function setEdit(on) { view.edit = !!on; if (!on) { sel = null; drag = null; } else renderEditList(); }
  function renderEditList() {
    const box = $('editlist'); if (!box || !S || !CAT) return; box.textContent = '';
    const out = outdoor(view.cur); $('edittitle').textContent = out ? '🌲 Обустройство улицы' : '🛋 Расстановка мебели';
    const ids = (S.owned || []).filter(id => CAT[id] && CAT[id].k === 'furn' && fitsRoom(CAT[id], out));
    if (!ids.length) box.appendChild(el('div', 'empty', (out ? 'Уличной мебели пока нет' : 'Мебели пока нет') + ' — загляни в Меню → Магазин → Мебель 🛍'));
    ids.forEach(id => {
      const pl = (S.placed || {})[id], b = el('button', 'chip' + (sel === id ? ' on' : ''));
      b.appendChild(furnPreview(id, 1)); b.appendChild(el('span', 'cn', CAT[id].n));
      b.appendChild(el('small', null, !pl ? 'в кладовой' : pl.room === view.cur ? 'здесь' : ROOMS[pl.room].title));
      b.addEventListener('click', () => pickFurn(id)); box.appendChild(b);
    });
    $('editstore').disabled = !(sel && S.placed && S.placed[sel]);
    $('edithint').textContent = sel ? 'Тапни по сцене или перетащи «' + CAT[sel].n + '»' : 'Выбери вещь, чтобы поставить её сюда';
  }
  async function pickFurn(id) {
    if (view.trans) return; haptic('light');
    if (!placedHere(id)) {
      const r = await rpc('place', { item: id, room: view.cur, x: 50, y: CAT[id].pl === 'wall' ? 35 : 55 });
      if (!r || !r.ok) { if (r && r.say) toast(r.say); return; }
    }
    sel = id; renderEditList();
  }
  function editDown(e) {
    if (view.trans || !S) return;
    const [lx, ly] = toLocal(e); let hit = hitItem(lx, ly);
    if (hit && sel && sel !== hit && isFlat(hit, CAT[hit]) && !isFlat(sel, CAT[sel])) hit = null;   // ковёр большой: тап по нему двигает выбранную вещь, а не выбирает ковёр
    if (hit) { sel = hit; renderEditList(); }
    if (!sel || !placedHere(sel)) return;
    const p = pxOf(CAT[sel], S.placed[sel]);
    drag = { id: sel, dx: hit ? p.x - lx : 0, dy: hit ? p.y - ly : 0 };
    dragTo(lx, ly);
    try { sc.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function dragTo(lx, ly) {
    const it = S.placed && S.placed[drag.id]; if (!it) return;
    const q = pctOf(CAT[drag.id], lx + drag.dx, ly + drag.dy); it.x = q.x; it.y = q.y;
  }
  sc.addEventListener('pointermove', (e) => { if (!drag) return; const [lx, ly] = toLocal(e); dragTo(lx, ly); });
  async function endDrag() {
    if (!drag) return; const d = drag; drag = null;
    const it = S && S.placed && S.placed[d.id]; if (it) await rpc('place', { item: d.id, room: it.room, x: it.x, y: it.y });
  }
  sc.addEventListener('pointerup', endDrag); sc.addEventListener('pointercancel', endDrag);
  $('editstore').addEventListener('click', async () => {
    if (!sel) return; const id = sel; sel = null; haptic('light');
    const r = await rpc('unplace', { item: id }); if (r && !r.ok) toast(r.say);
  });
  $('editdone').addEventListener('click', () => show(tab === 'loc' ? 'loc' : 'home'));

