  function render() { if (!opened || !G) return; q('g-wallet').textContent = '🪙 ' + fmt(G.coins); q('g-weather').textContent = (G.weather.night ? '☾ ' : G.weather.rain ? '☂ ' : '☀ ') + G.weather.name + (G.auto_water ? ' · автополив' : ''); q('g-area').textContent = G.area.cols + ' × ' + G.area.rows + ' · общий сад'; renderCare(); renderNav(); renderHits(); if (sheet) renderSheet(); size(); }
  function renderNav() {
    const nav = q('g-nav'); if (!nav) return; nav.textContent = '';
    [['garden', 'Наш сад', 'flowers'], ['shop', 'Лавка', 'coin'], ['basket', 'Урожай', 'harvest'], ['farm', 'Ферма', 'cow'], ['land', 'Участок', 'expand']].forEach(([id, label, type]) => {
      const b = node('button', id === (sheet || 'garden') ? 'on' : '', label); b.type = 'button'; b.prepend(icon(type));
      if (id === 'farm' && G) { const n = G.animals.filter(a => a.ready).length + G.animals.filter(a => a.hungry).length; if (n) b.appendChild(node('span', 'g-badge', fmt(n))); }
      if (id === 'basket' && G) { const count = Object.values(G.harvest).reduce((a, n) => a + n, 0) + Object.values(G.goods || {}).reduce((a, n) => a + n, 0); if (count) b.appendChild(node('span', 'g-badge', fmt(count))); }
      b.addEventListener('click', () => id === 'garden' ? closeSheet() : openSheet(id)); nav.appendChild(b);
    });
  }
  function bedAt(x, y) { return G?.beds.find(b => b.x === x && b.y === y); }
  function decorAt(x, y) { return G?.decor.find(d => d.x === x && d.y === y); }
  function renderHits() {
    const hits = q('g-hits'); hits.textContent = '';
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
      const b = node('button', 'g-cell' + (x === selected.x && y === selected.y ? ' selected' : '')); b.type = 'button';
      const bed = bedAt(x, y), decor = decorAt(x, y), locked = x >= G.area.cols || y >= G.area.rows;
      b.setAttribute('aria-label', 'Клетка ' + (x + 1) + ', ' + (y + 1) + ': ' + (locked ? 'закрытый участок' : bed ? bed.crop ? G.catalog.crops[bed.crop].name + (bed.ready ? ', урожай готов' : bed.dry ? ', нужен полив' : ', растёт') : 'свободная грядка' : decor ? G.catalog.decor[decor.item].name : 'свободное место'));
      b.style.left = ((GX + x * T) / W * 100) + '%'; b.style.top = ((GY + y * T) / H * 100) + '%'; b.style.width = (T / W * 100) + '%'; b.style.height = (T / H * 100) + '%';
      b.addEventListener('click', () => select(x, y)); hits.appendChild(b);
    }
    for (const pen of G.pens) {
      const [sx, sy] = penSlot(pen), sp = penSpecies(pen.id), b = node('button', 'g-cell g-pen-hit' + (selectedPen === pen.id ? ' selected' : '')); b.type = 'button';
      b.setAttribute('aria-label', 'Загон: ' + (sp ? G.catalog.species[sp].name + ', животных ' + penAnimals(pen.id).length : 'пустой'));
      b.style.left = (sx / W * 100) + '%'; b.style.top = (sy / H * 100) + '%'; b.style.width = (PEN_W / W * 100) + '%'; b.style.height = (PEN_H / H * 100) + '%';
      b.addEventListener('click', () => selectPen(pen.id)); hits.appendChild(b);
    }
  }
  function select(x, y) {
    if (!G || busy || pending) return;
    panUntil = 0; selectedPen = null;
    selected = { x, y };
    if (x >= G.area.cols || y >= G.area.rows) { openSheet('land'); renderHits(); return; }
    hero.tx = GX + x * T + 8; hero.ty = GY + y * T + T + 5;
    if (mode) {
      const m = mode; mode = null;
      if (m.type === 'move') act('move_bed', { bed: m.id, x, y });
      else if (m.type === 'decor') act('place_decor', { item: m.item, x, y });
      return;
    }
    renderHits(); renderCare();
  }
  function renderCare(failed = false) {
    const box = q('g-care'); if (!box) return; box.textContent = '';
    if (!G) { box.appendChild(node('div', 'g-note', failed ? 'Не удалось загрузить сад. Растения не пропадут, попробуйте ещё раз.' : 'Открываем калитку и загружаем ваш сад…')); if (failed) box.appendChild(button('Попробовать ещё раз', load, 'primary')); return; }
    const head = node('div', 'g-care-head'), text = node('div', 'g-care-text'), actions = node('div', 'g-actions');
    let title = 'Место для нового', detail = 'Выберите грядку или украсьте свободную клетку.', type = 'flowers', color;
    const b = bedAt(selected.x, selected.y), d = decorAt(selected.x, selected.y), pen = selectedPen ? penOf(selectedPen) : null;
    if (selectedPen && !pen) selectedPen = null;
    if (mode && String(mode.type).startsWith('pen')) {
      type = 'pen'; title = mode.type === 'penmove' ? 'Куда переставить загон?' : 'Куда поставить загон?';
      detail = !penGhost?.moved ? 'Нажмите на карту: загон встанет туда. Зелёный цвет значит, что место подходит.' : penGhost.err ? penGhost.err : 'Место подходит. Поставьте здесь или нажмите в другом месте карты.';
      actions.appendChild(button('Поставить здесь', confirmPenPlace, 'primary', !penGhost || !penGhost.moved || !!penGhost.err));
      actions.appendChild(button(mode.type === 'penplace' ? 'Позже' : 'Отмена', endPenPlace));
    } else if (pen && !mode) {
      const list = penAnimals(pen.id), sp = penSpecies(pen.id), cat = sp ? G.catalog.species[sp] : null, cap = G.catalog.pen.capacity;
      const ready = list.filter(a => a.ready).length, hungry = list.filter(a => a.hungry).length, fedN = list.filter(a => a.fed).length;
      type = sp || 'pen'; color = null;
      if (!sp) { actions.appendChild(button('Переставить', () => startPenPlace(pen.id))); actions.appendChild(button('Убрать', () => act('remove_pen', { pen: pen.id }))); title = 'Пустой загон'; detail = 'Выберите, кто здесь поселится. В загоне живёт один вид, до ' + cap + ' животных.'; for (const k of SPECIES_KEYS) { const c = G.catalog.species[k]; actions.appendChild(button(c.name + ' · ' + fmt(c.price) + ' 🪙', () => buyAnimal(k, pen.id), 'primary', (c.level || 0) > G.level || G.coins < c.price)); } }
      else {
        title = ({ chicken: 'Куры', sheep: 'Овечки', pig: 'Свиньи', cow: 'Коровы' })[sp] + ' · ' + list.length + '/' + cap;
        if (ready) detail = 'Готово: ' + G.catalog.products[cat.product].name.toLowerCase() + ' × ' + ready + '. Соберите, когда удобно.';
        else if (hungry) detail = 'Голодных: ' + hungry + '. Без корма продукция не появляется, но животные не страдают.';
        else { const left = Math.min(...list.map(a => a.remaining)); detail = 'Все сыты · ' + G.catalog.products[cat.product].name.toLowerCase() + ' через ' + hours(left) + ' · корм ещё ' + hours(Math.max(...list.map(a => a.fed_left))); }
        actions.appendChild(button('Покормить · корм ' + (G.supplies.feed || 0), () => act('feed', { pen: pen.id }), 'primary', !hungry || !G.supplies.feed));
        if (ready) actions.appendChild(button('Собрать', () => act('collect', { pen: pen.id }), 'gold'));
        actions.appendChild(button('Переставить', () => startPenPlace(pen.id)));
        if (list.length < cap) actions.appendChild(button('+ ' + cat.name.toLowerCase() + ' · ' + fmt(cat.price) + ' 🪙', () => buyAnimal(sp, pen.id), '', G.coins < cat.price));
        const avg = list.reduce((s, a) => s + a.progress, 0) / list.length, bar = node('div', 'g-progress'), fill = node('div'); fill.style.width = (avg * 100) + '%'; bar.appendChild(fill); text.appendChild(bar);
      }
    } else if (mode) { title = 'Выберите свободную клетку'; detail = mode.type === 'move' ? 'Растение переедет вместе с грядкой.' : 'Украшение займёт одну клетку.'; actions.appendChild(button('Отмена', () => { mode = null; renderCare(); })); }
    else if (selected.x >= G.area.cols || selected.y >= G.area.rows) { title = 'Здесь сад может вырасти'; detail = 'Откройте новый участок в разделе «Участок».'; type = 'expand'; actions.appendChild(button('Расширение', () => openSheet('land'), 'gold')); }
    else if (b) {
      type = b.crop || 'bed'; color = b.crop ? G.catalog.crops[b.crop].color : null;
      if (!b.crop) {
        title = 'Свободная грядка'; detail = 'Посадка уже включает первый полив.';
        actions.appendChild(button('Посадить', () => openSheet('seeds'), 'primary'));
        actions.appendChild(button('Переставить', () => { mode = { type: 'move', id: b.id }; renderCare(); }));
        actions.appendChild(button('Убрать', () => act('remove_bed', { bed: b.id })));
      } else {
        title = G.catalog.crops[b.crop].name + (b.fertilized ? ' ✦' : '');
        detail = b.ready ? 'Урожай готов и не испортится. Соберите, когда удобно.' : b.dry ? 'Рост на паузе. Полейте, растение не погибнет.' : 'Растёт · ещё ' + hours(b.remaining) + ' влажного времени · ' + (G.auto_water ? 'автополив' : 'влага: ' + hours(Math.max(0, b.water_until - G.now)));
        if (b.ready) actions.appendChild(button('Собрать', () => act('harvest', { bed: b.id }), 'gold'));
        else {
          actions.appendChild(button('Полить', () => act('water', { bed: b.id }), 'primary', G.auto_water || b.water_until - G.now >= (G.water_hours - 1) * 3600));
          actions.appendChild(button('Компост', () => act('fertilize', { bed: b.id }), '', b.fertilized || !G.supplies.fertilizer));
        }
        actions.appendChild(button('Переставить', () => { mode = { type: 'move', id: b.id }; renderCare(); }));
        const bar = node('div', 'g-progress'), fill = node('div'); fill.style.width = (b.progress * 100) + '%'; bar.appendChild(fill); text.appendChild(bar);
      }
    } else if (d) {
      title = G.catalog.decor[d.item].name; detail = 'Украшение не требует ухода.'; type = d.item;
      actions.appendChild(button('Убрать в кладовую', () => act('remove_decor', { decor: d.id })));
    } else {
      actions.appendChild(button('Поставить грядку', () => act('place_bed', { ...selected }), 'primary', !G.supplies.bed));
      actions.appendChild(button('Украшения', () => openSheet('decor')));
      if (G.pen_stock) actions.appendChild(button('Поставить загон · ' + G.pen_stock, () => startPenPlace(), 'gold'));
      actions.appendChild(button('Лавка', () => openSheet('shop')));
    }
    text.prepend(node('small', null, detail)); text.prepend(node('b', null, title));
    head.appendChild(icon(type, color, b?.crop && !pen ? b.stage : 3)); head.appendChild(text); box.appendChild(head); box.appendChild(actions);
    if (pending) { const retry = node('button', 'g-btn primary', 'Повторить последний запрос'); retry.type = 'button'; retry.addEventListener('click', () => act('', {}, true)); box.appendChild(retry); }
  }
  function itemRow(title, desc, type, color, buttons = []) {
    const row = node('div', 'g-row'); row.appendChild(icon(type, color)); const body = node('div', 'g-row-text'); body.appendChild(node('b', null, title)); body.appendChild(node('small', null, desc)); row.appendChild(body); buttons.forEach(b => row.appendChild(b)); return row;
  }
  function renderSheet() {
    if (!sheet || !G) return;
    const body = q('g-sheet-body'), tabs = q('g-tabs'), oldScroll = body.scrollTop;
    body.textContent = ''; tabs.textContent = ''; tabs.hidden = true;
    const titles = { welcome: 'Добро пожаловать', shop: 'Садовая лавка', seeds: 'Что посадим?', basket: 'Корзина урожая', land: 'Ваш участок', farm: 'Ферма', decor: 'Украшения из кладовой' };
    q('g-sheet-title').textContent = titles[sheet] || 'Наш двор';
    if (sheet === 'welcome') {
      const intro = node('div', 'g-intro'); intro.appendChild(node('h3', null, 'Сад без спешки'));
      intro.appendChild(node('div', null, 'Две грядки, 12 семян, два компоста и скамейка уже ваши. Сажайте, поливайте и собирайте урожай вместе.'));
      body.appendChild(intro); body.appendChild(node('p', 'g-note', 'Один полив действует 36 часов. Растения не погибают: когда почва высохнет, рост просто остановится. Готовый урожай не портится. Уход не тратит энергию питомца, садом можно заниматься, пока он спит.'));
      body.appendChild(button('Посадить первые семена', () => { selected = { x: 0, y: 0 }; openSheet('seeds'); }, 'primary'));
      body.appendChild(button('Просто посмотреть', closeSheet));
    } else if (sheet === 'shop') {
      tabs.hidden = false;
      [['seed', 'Семена'], ['supply', 'Для сада'], ['decor', 'Украшения'], ['farm', 'Животные']].forEach(([id, title]) => { const b = node('button', shopTab === id ? 'on' : '', title); b.type = 'button'; b.addEventListener('click', () => { shopTab = id; body.scrollTop = 0; renderSheet(); }); tabs.appendChild(b); });
      const table = shopTab === 'farm' ? {} : G.catalog[shopTab === 'seed' ? 'crops' : shopTab === 'decor' ? 'decor' : 'supplies'];
      if (shopTab === 'farm') {
        const pc = G.catalog.pen, owned = G.pens.length + G.pen_stock, full = owned >= pc.max;
        if (G.pen_stock) body.appendChild(button('Поставить купленный загон · ' + G.pen_stock, () => startPenPlace(), 'gold'));
        body.appendChild(itemRow(pc.name + ' · ' + owned + '/' + pc.max, pc.desc, 'pen', null, [button(full ? 'Построено' : fmt(pc.price) + ' 🪙', buyPen, 'primary', full || G.coins < pc.price)]));
        for (const k of SPECIES_KEYS) {
          const c = G.catalog.species[k], locked = (c.level || 0) > G.level, have = G.animals.filter(a => a.species === k).length;
          body.appendChild(itemRow(c.name + ' · у вас ' + have, c.desc + ' Продукция: ' + G.catalog.products[c.product].name.toLowerCase() + ' за ' + c.sell + ' монет, раз в ' + c.hours + ' ч.' + (locked ? ' Нужен участок уровня ' + ((c.level || 0) + 1) + '.' : ''), k, null, [button(locked ? 'Закрыто' : fmt(c.price) + ' 🪙', () => buyAnimal(k), 'primary', locked || G.coins < c.price)]));
        }
        body.appendChild(node('p', 'g-note', 'Загон один на вид: куры, овечки, свиньи и коровы не живут вместе. Корм покупается во вкладке «Для сада». Животные не болеют и не пропадают, без корма просто не дают продукцию.'));
      }
      for (const [id, c] of Object.entries(table)) {
        const locked = (c.level || 0) > G.level, owned = c.once && G.upgrades.includes(id), stock = G[shopTab === 'seed' ? 'seeds' : shopTab === 'decor' ? 'decor_stock' : 'supplies'][id] || 0;
        let desc = c.desc + (shopTab === 'seed' ? ' Урожай: ' + c.yield + ' × ' + c.sell + ' монет.' : '') + (c.once ? '' : ' В запасе: ' + stock + '.');
        if (locked) desc += ' Нужен участок уровня ' + ((c.level || 0) + 1) + '.';
        const buttons = [button(owned ? 'Куплено' : locked ? 'Закрыто' : fmt(c.price) + ' 🪙', () => purchase(shopTab, id), 'primary', owned || locked || G.coins < c.price)];
        if (shopTab === 'seed' && !locked) buttons.push(button('×5', () => purchase('seed', id, 5), '', G.coins < c.price * 5));
        body.appendChild(itemRow(c.name, desc, id, c.color, buttons));
      }
      body.appendChild(node('p', 'g-note', 'Монеты общие с основной игрой. Все покупки и расширения сначала требуют подтверждения.'));
    } else if (sheet === 'seeds') {
      const bed = bedAt(selected.x, selected.y);
      if (!bed || bed.crop) { body.appendChild(node('p', 'g-note', 'Выберите свободную грядку.')); }
      else for (const [id, c] of Object.entries(G.catalog.crops)) {
        if ((c.level || 0) > G.level) continue;
        const stock = G.seeds[id] || 0;
        body.appendChild(itemRow(c.name + ' · ' + stock + ' шт.', c.hours + ' ч роста · ' + c.yield + ' × ' + c.sell + ' монет за урожай', id, c.color, [button('Посадить', () => { const bedId = bed.id; closeSheet(); act('plant', { bed: bedId, item: id }); }, 'primary', stock < 1)]));
      }
      body.appendChild(button('Купить семена', () => { shopTab = 'seed'; openSheet('shop'); }));
    } else if (sheet === 'basket') {
      const ready = G.beds.filter(b => b.ready).length;
      if (ready) body.appendChild(button('Собрать всё · ' + ready + ' грядок', () => act('harvest_all'), 'gold'));
      let count = 0;
      for (const [key, n] of Object.entries(G.harvest)) {
        if (!n) continue; count += n;
        const [crop, quality] = key.split(':'), c = G.catalog.crops[crop], price = quality === 'gold' ? Math.ceil(c.sell * 1.25) : c.sell;
        body.appendChild(itemRow(c.name + (quality === 'gold' ? ' ✦' : '') + ' · ' + n + ' шт.', price + ' монет за штуку · ' + fmt(price * n) + ' монет всего', crop, c.color, [button('Продать', () => act('sell', { item: key }), 'primary')]));
      }
      if (count) body.appendChild(button('Продать всё за ' + fmt(G.harvest_value) + ' 🪙', () => act('sell_all'), 'gold'));
      else if (!Object.values(G.goods || {}).some(n => n > 0)) body.appendChild(node('p', 'g-note', 'Корзина пока пуста. После сбора урожай хранится здесь сколько угодно.'));
      const goods = Object.entries(G.goods || {}).filter(([, n]) => n > 0);
      if (G.animals.some(a => a.ready)) body.appendChild(button('Собрать продукцию · ' + G.animals.filter(a => a.ready).length, () => act('collect_all'), 'gold'));
      for (const [k, n] of goods) { const pr = G.catalog.products[k]; body.appendChild(itemRow(pr.name + ' · ' + n + ' шт.', pr.sell + ' монет за штуку · ' + fmt(pr.sell * n) + ' монет всего', k, null, [button('Продать', () => act('sell_good', { item: k }), 'primary')])); }
      if (goods.length) body.appendChild(button('Продать продукцию за ' + fmt(G.goods_value) + ' 🪙', () => act('sell_goods'), 'gold'));
      body.appendChild(button('Полить весь сад', () => act('water_all'), '', G.auto_water));
      body.appendChild(node('p', 'g-note', 'Сбор и продажа разделены: готовые растения могут оставаться на грядке для красоты. Собранный урожай никогда не портится.'));
    } else if (sheet === 'land') {
      const intro = node('div', 'g-intro'); intro.appendChild(node('h3', null, G.area.name)); intro.appendChild(node('div', null, G.area.cols + ' × ' + G.area.rows + ' клеток · грядок ' + G.beds.length + ' · украшений ' + G.decor.length)); body.appendChild(intro);
      if (G.next_expansion) body.appendChild(itemRow(G.next_expansion.name, G.next_expansion.cols + ' × ' + G.next_expansion.rows + ' клеток. Существующие посадки сохранятся.', 'expand', null, [button(fmt(G.next_expansion.price) + ' 🪙', expand, 'gold', G.coins < G.next_expansion.price)]));
      else body.appendChild(node('p', 'g-note', 'Вся полянка ваша. Сад расширен полностью!'));
      body.appendChild(itemRow('Грядки в запасе: ' + (G.supplies.bed || 0), 'Выберите свободную клетку на карте и поставьте грядку.', 'bed', null, [button('Купить', () => { shopTab = 'supply'; openSheet('shop'); })]));
      body.appendChild(button('Украшения в кладовой', () => openSheet('decor')));
      body.appendChild(button('Полить всё', () => act('water_all'), '', G.auto_water));
      body.appendChild(node('p', 'g-note', 'Расширения: 12 → 20 → 30 → 48 клеток. Колодец увеличивает запас влаги до 48 часов, а автополив полностью снимает заботу о воде. Компост необязателен. Нет сорняков, вредителей, штрафов или ежедневных обязательств.'));
    } else if (sheet === 'farm') {
      const intro = node('div', 'g-intro'), cap = G.catalog.pen.capacity; intro.appendChild(node('h3', null, 'Ферма'));
      intro.appendChild(node('div', null, 'Загонов ' + (G.pens.length + G.pen_stock) + '/' + G.catalog.pen.max + ' · животных ' + G.animals.length + ' · корма ' + (G.supplies.feed || 0))); body.appendChild(intro);
      const hungry = G.animals.filter(a => a.hungry).length, ready = G.animals.filter(a => a.ready).length;
      if (G.pen_stock) body.appendChild(button('Поставить загон · ' + G.pen_stock, () => startPenPlace(), 'gold'));
      if (ready) body.appendChild(button('Собрать всё · ' + ready, () => act('collect_all'), 'gold'));
      if (hungry) body.appendChild(button('Покормить всех · ' + hungry, () => act('feed_all'), 'primary', !G.supplies.feed));
      for (const pen of G.pens) {
        const sp = penSpecies(pen.id), list = penAnimals(pen.id), cat = sp ? G.catalog.species[sp] : null, r = list.filter(a => a.ready).length, hg = list.filter(a => a.hungry).length;
        const status = !sp ? 'Пока пусто' : r ? 'Готово: ' + G.catalog.products[cat.product].name.toLowerCase() + ' × ' + r : hg ? 'Голодных: ' + hg : 'Все сыты';
        body.appendChild(itemRow((sp ? ({ chicken: 'Куры', sheep: 'Овечки', pig: 'Свиньи', cow: 'Коровы' })[sp] : 'Пустой загон') + ' · ' + list.length + '/' + cap, status, sp || 'pen', null, [button('Открыть', () => { closeSheet(); selectPen(pen.id); }, 'primary')]));
      }
      if (!G.pens.length && !G.pen_stock) body.appendChild(node('p', 'g-note', 'Здесь пока нет загонов. Постройте первый: в нём будут жить куры, овечки, свиньи или коровы.'));
      body.appendChild(button('Построить или купить животных', () => { shopTab = 'farm'; openSheet('shop'); }));
      body.appendChild(button('Купить корм ×5 · ' + fmt(G.catalog.supplies.feed.price * 5) + ' 🪙', () => purchase('supply', 'feed', 5), '', G.coins < G.catalog.supplies.feed.price * 5));
      body.appendChild(node('p', 'g-note', 'Одна порция корма кормит одно животное на 10–12 часов. Пока животное сыто, оно копит продукцию. Готовое никогда не портится.'));
    } else if (sheet === 'decor') {
      let any = false;
      for (const [id, n] of Object.entries(G.decor_stock)) {
        if (!n) continue; any = true; const c = G.catalog.decor[id];
        body.appendChild(itemRow(c.name + ' · ' + n + ' шт.', c.desc, id, null, [button('Поставить', () => { mode = { type: 'decor', item: id }; closeSheet(); renderCare(); }, 'primary')]));
      }
      if (!any) body.appendChild(node('p', 'g-note', 'Все украшения уже стоят в саду. Можно убрать их с карты или купить новые.'));
      body.appendChild(button('В лавку за украшениями', () => { shopTab = 'decor'; openSheet('shop'); }));
    }
    body.scrollTop = oldScroll;
  }
  function size() {
    if (!opened) return;
    // «Покрытие»: карта всегда закрывает окно целиком, поэтому по краям не бывает пустых полос.
    const stage = q('g-stage'), width = Math.max(stage.clientWidth, stage.clientHeight * 1.5) * zoom;
    const world = q('g-world'); world.style.width = width + 'px'; world.style.height = (width / W * H) + 'px'; world.style.marginTop = '0px'; scale = width / W;
    if (!centered && stage.clientWidth) { centered = true; snapCamera(); }
  }
  // Камера следует за выдрой: плавно догоняет её, а если игрок сам листает карту, ненадолго уступает.
  function cameraTarget() {
    const sc = q('g-scroll'); if (!sc) return null;
    return { x: Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, hero.x * scale - sc.clientWidth / 2)), y: Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, (hero.y - 26) * scale - sc.clientHeight / 2)) };
  }
  function snapCamera() { const sc = q('g-scroll'), t = cameraTarget(); if (!t) return; camSet = performance.now(); sc.scrollLeft = t.x; sc.scrollTop = t.y; }
  function follow(now) {
    if (now < panUntil) return; const sc = q('g-scroll'), t = cameraTarget(); if (!sc || !t) return;
    const dx = t.x - sc.scrollLeft, dy = t.y - sc.scrollTop; if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    camSet = now; sc.scrollLeft += dx * .16; sc.scrollTop += dy * .16;
  }
