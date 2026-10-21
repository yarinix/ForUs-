  // ---------- состояние ----------
  let S = null, busy = false, acting = false, bubbleTimer = null, lookTimer = null, seenTs = 0, myId = null;
  let viewingUserId = null, peopleLoaded = false;
  let testMode = false;     // «Проверка»: играем с админским питомцем (не общим); сервер проверяет, что ты админ
  let skew = 0, wakeAsked = false, lastWakeSfx = 0;
  let CAT = null, tab = 'home', wornKey = '', sel = null, drag = null, shopTab = 'food';
  const ACTIONS = { forage: 'ходил(а) за грибами с', angle: 'рыбачил(а) с', go_out: 'вывел(а) гулять', go_in: 'позвал(а) домой', unlock: 'открыл(а) локацию для', wake: 'разбудил(а)', feed: 'покормил(а)', play: 'поиграл(а) с', sleep: 'уложил(а) спать', pet: 'погладил(а)' };

  function say(text, ms = 3300) {
    const b = $('bubble'); b.textContent = text; b.classList.add('show');
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.remove('show'), ms);
  }
  function pop(text) {
    const el = document.createElement('div'); el.className = 'pop'; el.textContent = text;
    el.style.left = (28 + Math.random() * 36) + '%'; el.style.top = '46%';
    $('stage').appendChild(el); setTimeout(() => el.remove(), 1100);
  }

  // Поза выдры: короткая анимация действия, затем настроение
  const otter = { dataset: { look: 'idle' } };   // текущая поза выдры (рисуется в canvas)
  function moodLook() {
    const m = S ? S.mood : 'ok';
    return { sleeping: 'sleep', happy: 'happy', ok: 'idle', hungry: 'sad', sad: 'sad', sleepy: 'sleepy' }[m] || 'idle';
  }
  function setLook(kind, ms) {
    otter.dataset.look = kind; acting = !!ms;
    clearTimeout(lookTimer);
    if (ms) lookTimer = setTimeout(() => { acting = false; otter.dataset.look = moodLook(); }, ms);
  }

  function setPill(id, key, v) {
    const el = $(id);
    el.querySelector('.fillbar').style.width = v + '%';
    $('v-' + key).textContent = v + '/100';
    el.classList.toggle('low', v < 30);
  }
  function render(st, instant) {
    if (!st.ach && S && S.ach) st.ach = S.ach;
    if (!st.quests && S && S.quests) st.quests = S.quests;   // чужой питомец (гость) заданий не присылает
    if (!st.daily && S && S.daily) st.daily = S.daily;       // и бонуса дня тоже
    const wasSleeping = !!(S && S.sleeping);
    S = st; if (wasSleeping && !st.sleeping && Date.now() - lastWakeSfx > 3000) { SFX.play('wake'); lastWakeSfx = Date.now(); }
    if (st.now) { skew = st.now - Date.now() / 1000; S._at = Date.now(); }
    $('pname').textContent = st.name; $('lvl').textContent = 'Уровень ' + st.level; $('coinv').textContent = st.coins;
    $('xpfill').style.width = Math.min(100, st.xp / st.xp_need * 100) + '%';
    setPill('p-happy', 'happy', st.happy); setPill('p-hunger', 'hunger', st.hunger); setPill('p-energy', 'energy', st.energy);
    if (!acting) otter.dataset.look = moodLook();
    syncRoom(st.room, instant);
    const wk = JSON.stringify(st.worn || {});
    if (wk !== wornKey) { wornKey = wk; drawAvatar(); }
    $('admcard').style.display = st.is_admin ? '' : 'none';
    const ready = ((st.quests && st.quests.items) || []).filter(i => i.done && !i.claimed).length;
    $('qsub').textContent = ready ? '🎁 наград: ' + ready : 'ежедневные дела';
    const A = st.ach, ar = A ? A.ready : 0;
    $('asub').textContent = A ? (ar ? '🎁 наград: ' + ar : A.done + ' из ' + A.total) : 'награды за заботу';
    const D = st.daily, dc = !!(D && D.can_claim);          // можно ли сегодня забрать ежедневный бонус
    $('dsub').textContent = D ? (dc ? '🎁 забери награду' : '🔥 серия ' + D.streak) : 'награда за вход';
    document.querySelector('nav button[data-tab="menu"]').classList.toggle('dot', ready > 0 || ar > 0 || dc);
    maybeDailyPop(D);                                        // первый заход за день: всплывает окно с наградами
    if (!isGuest()) {                                  // вкладка идёт за питомцем: на улице — «Локация», дома — «Главная»
      const o = outdoor(st.room), un = hasForest(st);
      if (tab === 'home' && o) show('loc', { quiet: true, noMove: true });
      else if (tab === 'loc') { if (un && !o) show('home', { quiet: true, noMove: true }); else if (!un && $('stage').style.display !== 'none') show('loc', { quiet: true, noMove: true }); }
    }
    updateSleep();
    updatePanels();
  }

  let PEOPLE = [];
  async function loadPeople() {
    if (peopleLoaded) return;
    try {
      const r = await api('/api/pet/state', { people: 1 });
      PEOPLE = r.people || []; peopleLoaded = true;
      $('visitcard').style.display = PEOPLE.length ? '' : 'none';
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG);
    }
  }
  // Режим гостя: питомца можно только смотреть. Вернуться — кнопка «К себе» в верхней полосе.
  function setGuestMode(targetId, label) {
    viewingUserId = targetId == null ? null : Number(targetId);
    const guest = viewingUserId !== null && viewingUserId !== myId;
    $('app').classList.toggle('guest-mode', guest);
    $('visitnote').classList.toggle('on', guest);
    if (guest) {
      $('visittext').textContent = '👀 Ты в гостях у ' + (label || 'друга');
      show('home');
    }
  }
  async function visitUser(id, label) { setGuestMode(id, label); await refresh(true); }
  async function goHome() { setGuestMode(null); show('home', { quiet: true, noMove: true }); await refresh(true); }
  $('returnbtn').addEventListener('click', goHome);

  // ---------- «ПРОВЕРКА»: админский питомец ----------
  // setTestMode(true)  — переходим к админскому питомцу (отдельная запись на сервере, общий питомец с Полиной не трогаем);
  // setTestMode(false) — возвращаемся к общему. Состояние берём заново, как при первом запуске.
  async function setTestMode(on) {
    if (testMode === on) return;
    testMode = on; peopleLoaded = false; seenTs = 0; dailyPopShown = false;
    setGuestMode(null);                                             // из гостей выходим, если были
    $('testnote').classList.toggle('on', on);
    $('visitcard').style.display = 'none';                          // «Навестить» вернётся после loadPeople
    $('a-test').textContent = on ? '↩ К общему питомцу' : '🧪 Проверка';
    $('a-testhint').textContent = on ? 'Сейчас ты с админским питомцем: всё, что делаешь (покупки, сброс, монеты), касается только его.'
      : 'Отдельный админский питомец: он только твой, Полина его не видит и не может навестить. Общий питомец остаётся как был.';
    show('home', { quiet: true, noMove: true });
    await refresh(true);
    toast(on ? '🧪 Админский питомец. Полина его не видит' : 'Вернулись к общему питомцу 🦦');
  }
  $('a-test').addEventListener('click', () => setTestMode(!testMode));
  $('testexit').addEventListener('click', () => setTestMode(false));
  function renderVisit() {
    const box = $('visitlist'); box.textContent = '';
    if (!PEOPLE.length) { box.appendChild(el('div', 'empty', 'Пока некого навестить 🏡')); return; }
    PEOPLE.forEach(p => {
      const b = el('button', 'srow'); b.appendChild(el('span', 'e', '🦦'));
      b.appendChild(el('span', 'm', p.name)); b.appendChild(el('span', 'r', 'Зайти ›'));
      b.addEventListener('click', () => visitUser(p.id, p.name)); box.appendChild(b);
    });
  }

  async function refresh(first) {
    try {
      await loadPeople();
      const body = (first || !CAT) ? { catalog: 1 } : {};
      if (viewingUserId !== null && viewingUserId !== myId) body.view_user_id = viewingUserId;
      const r = await api('/api/pet/state', body);
      if (!r.ok) throw new Error('bad');
      if (r.catalog) CAT = r.catalog;
      const st = r.state; myId = r.you;
      // Если текущий пользователь совпал с выбранным — это обычный режим.
      if (viewingUserId === myId) setGuestMode(null);
      render(st, first);
      if (!viewingUserId && !first && st.last_ts && st.last_ts > seenTs && st.last_actor_id !== myId && st.last_action) {
        SFX.play('partner'); say((st.last_actor || 'Партнёр') + ' ' + (ACTIONS[st.last_action] || 'играет с') + ' ' + (['play', 'forage', 'angle'].includes(st.last_action) || !ACTIONS[st.last_action] ? 'питомцем' : 'питомца') + ' 💞');
      }
      seenTs = Math.max(seenTs, st.last_ts || 0);
      if (first) greet(st);
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG);
    }
  }
  function greet(st) {
    if (st.sleeping) { say(st.name + ' спит… 💤', 3000); return; }
    say({ hungry: 'Я проголодался… 🐟', sleepy: 'Так хочется спать… 💤', sad: 'Поиграем? Мне скучно…', happy: 'Ура, вы пришли! 💕', ok: 'Привет! 🦦' }[st.mood], 3800);
  }

