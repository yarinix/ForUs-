  // =====================================================================
  // МАГАЗИН. Одежда на витрине рисуется так:
  //   renderShop → shopCard → wearPreview → drawOtter (выдра, одетая только в эту вещь) → drawHead → drawWear
  //   → рисунки вещей (HEAD / ACC / OUTFIT / BACK) → pxCanvas (вырезать кусок и увеличить) → картинка в карточке товара.
  // Цену, слот и редкость вещи клиент берёт из каталога сервера (CAT, см. pet.py), здесь их нигде не выдумываем.
  // =====================================================================
  let shopBusy = false;    // защита от двойного тапа по «Купить» (пока идёт запрос, второй не отправляем)
  let wearSlot = 'all';    // подраздел одежды в магазине: all / head / top / suit / acc / back

  // renderShop — перерисовывает витрину выбранной вкладки (Еда / Одежда / Мебель). Зовётся при открытии магазина,
  // при смене вкладки и после каждого ответа сервера (updatePanels), чтобы монеты и «Куплено ✓» обновлялись сразу.
  function renderShop() {
    if (!CAT || !S) return;                                   // без каталога и состояния рисовать нечего
    $('shopcoins').textContent = S.coins;
    document.querySelectorAll('#shopseg button').forEach(b => b.classList.toggle('on', b.dataset.k === shopTab));
    renderWearSeg();                                          // подразделы одежды (видны только на вкладке «Одежда»)
    const box = $('shoplist'); box.textContent = '';
    // base — стартовая еда (бесконечная), legacy — старая одежда, снятая с продажи (у кого уже куплена, носит дальше), std — стандартная мебель дома (есть у всех)
    let ids = Object.keys(CAT).filter(id => CAT[id].k === shopTab && !CAT[id].base && !CAT[id].legacy && !CAT[id].std);
    if (shopTab === 'wear') {
      if (wearSlot !== 'all') ids = ids.filter(id => CAT[id].s === wearSlot);
      // порядок: по слотам (голова → спина), внутри слота от обычного к легендарному — цена растёт вместе с редкостью
      ids.sort((a, b) => SLOT_ORDER.indexOf(CAT[a].s) - SLOT_ORDER.indexOf(CAT[b].s) || RARITY[rarityOf(a)].ord - RARITY[rarityOf(b)].ord || CAT[a].p - CAT[b].p);
    }
    ids.forEach(id => box.appendChild(shopCard(id)));
  }

  // renderWearSeg — полоска подразделов «Все / Голова / Верх / Костюм / Аксессуар / Спина» над товарами одежды.
  // Нажатие запоминает выбор в wearSlot и перерисовывает витрину.
  function renderWearSeg() {
    const seg = $('wearseg'); seg.style.display = shopTab === 'wear' ? 'flex' : 'none';
    if (shopTab !== 'wear') return;
    seg.textContent = '';
    [['all', 'Все']].concat(SLOT_ORDER.map(k => [k, SLOT_RU[k]])).forEach(([k, name]) => {
      const b = el('button', k === wearSlot ? 'on' : '', name);
      b.addEventListener('click', () => { wearSlot = k; renderShop(); haptic('light'); });
      seg.appendChild(b);
    });
  }

  // shopCard — одна карточка товара: картинка, название, подпись, кнопка покупки.
  //   • еда — эмодзи и что она даёт; мебель — furnPreview; одежда — wearPreview (выдра в этой вещи);
  //   • у одежды рамка и бейдж цветом редкости (переменная --rc, стили .it.r-* и .rar в CSS) + подпись со слотом;
  //   • кнопка: «Купить · цена», «Куплено ✓» (одежда и мебель покупаются один раз) или серая, если не хватает монет.
  function shopCard(id) {
    const c = CAT[id], d = el('div', 'it'), pv = el('div', 'pv'), rar = c.k === 'wear' ? rarityOf(id) : null;
    if (rar) { d.classList.add('r-' + rar); d.style.setProperty('--rc', RARITY[rar].col); }
    pv.appendChild(c.k === 'food' ? el('div', 'emo', c.e) : c.k === 'wear' ? wearPreview(id) : furnPreview(id));
    d.appendChild(pv); d.appendChild(el('b', null, c.n));
    if (rar) d.appendChild(el('div', 'rar', RARITY[rar].n));                       // бейдж редкости
    d.appendChild(el('div', 'ds', c.k === 'food'
      ? 'Сытость +' + c.hu + ' · Радость +' + c.hp + (c.en ? ' · Энергия +' + c.en : '')
      : c.k === 'wear' ? SLOT_RU[c.s] : (c.w === 'out' ? '🌲 Для улицы' : c.w === 'any' ? 'Дома и на улице' : (c.pl === 'wall' ? 'Висит на стене' : 'Стоит на полу'))));
    const b = el('button', 'buy');
    if (c.k === 'food') {
      const q = (S.inv || {})[id] || 0; if (q) d.appendChild(el('div', 'own', 'В запасе: ' + q));
      b.textContent = 'Купить · ' + c.p + ' 🪙';
    } else if (owns(id)) { b.textContent = 'Куплено ✓'; b.classList.add('off'); b.disabled = true; }
    else b.textContent = 'Купить · ' + c.p + ' 🪙';
    if (!b.disabled && S.coins < c.p) b.classList.add('poor');                      // серая кнопка: монет пока не хватает
    b.addEventListener('click', () => buyItem(id));
    d.appendChild(b); return d;
  }

  // buyItem — покупка. Сначала быстрая проверка монет на клиенте (чтобы не гонять запрос зря), потом действие 'buy' на сервер.
  // Окончательное решение всегда за сервером (цена, «уже куплено», лимит еды), поэтому показываем его ответ r.say.
  async function buyItem(id) {
    if (shopBusy) return; const c = CAT[id];
    if (S.coins < c.p) { toast('Не хватает монет 🪙 Поиграйте и погладьте питомца!'); haptic('err'); return; }
    shopBusy = true; haptic('light');
    try { const r = await rpc('buy', { item: id }); if (r) { toast(r.say); haptic(r.ok ? 'ok' : 'err'); } } finally { shopBusy = false; }
  }
  // переключение вкладок магазина: Еда / Одежда / Мебель
  document.querySelectorAll('#shopseg button').forEach(b => b.addEventListener('click', () => { shopTab = b.dataset.k; renderShop(); haptic('light'); }));

