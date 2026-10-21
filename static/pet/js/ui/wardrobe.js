  // ---------- ГАРДЕРОБ ----------
  // renderWardrobe — вверху пять слотов (что надето сейчас), ниже — все купленные вещи одежды с кнопкой «Надеть / Снять».
  // Вещи идут по слотам и по редкости; рамка и бейдж — те же, что в магазине. Здесь же показывается и старая одежда (legacy).
  // Надеть вещь в занятый слот — сервер сам снимет прежнюю; костюм и «верх» сервер тоже не даёт носить вместе (CONFLICTS в pet.py).
  function renderWardrobe() {
    if (!CAT || !S) return;
    const slots = $('wslots'); slots.textContent = '';
    SLOT_ORDER.forEach(k => { const id = (S.worn || {})[k]; slots.appendChild(el('div', 'slot' + (id ? ' on' : ''), SLOT_RU[k] + ': ' + (id ? CAT[id].n : '—'))); });
    const box = $('wlist'); box.textContent = '';
    const ids = (S.owned || []).filter(id => CAT[id] && CAT[id].k === 'wear')
      .sort((a, b) => SLOT_ORDER.indexOf(CAT[a].s) - SLOT_ORDER.indexOf(CAT[b].s) || RARITY[rarityOf(a)].ord - RARITY[rarityOf(b)].ord);
    if (!ids.length) { box.appendChild(el('div', 'empty', 'Гардероб пока пуст. Загляни в Меню → Магазин 🛍')); return; }
    ids.forEach(id => {
      const c = CAT[id], rar = rarityOf(id), on = (S.worn || {})[c.s] === id, d = el('div', 'it r-' + rar), pv = el('div', 'pv');
      d.style.setProperty('--rc', RARITY[rar].col);
      pv.appendChild(wearPreview(id)); d.appendChild(pv); d.appendChild(el('b', null, c.n));
      d.appendChild(el('div', 'rar', RARITY[rar].n)); d.appendChild(el('div', 'ds', SLOT_RU[c.s]));
      const b = el('button', 'buy' + (on ? ' alt' : ''), on ? 'Снять' : 'Надеть');
      b.addEventListener('click', async () => { haptic('light'); const r = await rpc(on ? 'unwear' : 'wear', { item: id }); if (r && !r.ok) toast(r.say); });
      d.appendChild(b); box.appendChild(d);
    });
  }
  // wardFrame — кадр большой выдры в гардеробе. Зовётся 10 раз в секунду, пока открыт гардероб (см. setInterval внизу):
  // рисует выдру в том, что надето СЕЙЧАС (drawOtter без ov берёт S.worn), моргает и чуть подпрыгивает.
  // Благодаря этому видно анимации вещей: взмахи крыльев, пламя ранца, искорки легендарных вещей.
  function wardFrame(now) {
    const cv = $('wprev'), x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    const O = drawOtter(now, 'idle', (Math.floor(now / 160) % 31) === 0);
    x.drawImage(O.c, 0, Math.floor(now / 650) % 2);
  }

