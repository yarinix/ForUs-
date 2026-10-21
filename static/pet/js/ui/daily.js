  // =====================================================================
  // ЕЖЕДНЕВНЫЙ БОНУС. Всё считает сервер (pet_ach.py → daily_view): серию, награды дней и «можно ли забрать сегодня».
  // Клиент только рисует календарь из 7 дней и по кнопке просит действие claim_daily.
  // =====================================================================
  let dailyBusy = false, dailyPopShown = false;   // dailyPopShown — окно бонуса уже показывали в этом запуске
  // fillDaily(box, popup) — рисует содержимое бонуса дня в контейнер box: строка-статус, календарь текущей недели серии (4 + 3 дня),
  // кнопка «Забрать» и правила. Один и тот же рисунок идёт и на экран «Бонус дня» (popup = false), и в окно, которое всплывает
  // при первом заходе за день (popup = true: без длинных правил). Состояния дня: claimed (✓, приглушён), today (золотая рамка), future.
  // Подарок дня показывается эмодзи из каталога еды.
  function fillDaily(box, popup) {
    box.textContent = '';
    const D = S && S.daily;
    if (!D || !CAT) { box.appendChild(el('div', 'empty', 'Загружаем бонус…')); return; }
    $('dstreak').textContent = '🔥 ' + D.streak;
    box.appendChild(el('div', 'qinfo' + (D.can_claim ? ' ok' : ''), D.can_claim
      ? '🔥 Серия: ' + D.streak + ' · сегодня день ' + D.day + ' из 7'
      : '✅ Сегодня бонус получен' + (D.by ? ' · ' + D.by : '') + '. Завтра будет день ' + (D.day % 7 + 1)));
    const grid = el('div', 'dgrid');
    D.days.forEach(d => {
      const c = el('div', 'dday ' + d.state + (d.day === 7 ? ' d7' : ''));
      c.appendChild(el('small', null, d.day === 7 ? 'День 7 · сундук' : 'День ' + d.day));
      c.appendChild(el('b', null, '+' + d.coins + ' 🪙'));
      c.appendChild(el('span', null, '+' + d.xp + ' XP'));
      if (d.item && CAT[d.item]) c.appendChild(el('div', 'gift', CAT[d.item].e));
      grid.appendChild(c);
    });
    box.appendChild(grid);
    if (D.can_claim) { const b = el('button', 'buy', '🎁 Забрать бонус'); b.addEventListener('click', claimDaily); box.appendChild(b); }
    box.appendChild(el('div', 'dnote', D.boost ? 'Бонус серии: +' + D.boost + '% к монетам и опыту' : 'Каждая пройденная неделя серии добавляет +25% к монетам и опыту (до +100%)'));
    if (popup) return;
    box.appendChild(el('div', 'dnote', 'Заходите каждый день: награда растёт. Пропустите день — серия начнётся заново.'));
    box.appendChild(el('div', 'dnote', 'Лучшая серия: ' + D.best + ' · бонусов забрано: ' + D.total));
  }
  // renderDaily — экран «Бонус дня» в меню
  function renderDaily() { const box = $('dbody'); if (box) fillDaily(box, false); }

  // ---------- окно бонуса дня: всплывает при первом заходе за день ----------
  // Условия показа (maybeDailyPop, вызывается из render): бонус сегодня ещё не забран, это не гостевой режим и на этом
  // устройстве окно сегодня ещё не показывали. «Сегодня» — номер дня с сервера (D.today, по BOT_TIMEZONE), он хранится в localStorage
  // отдельно для общего и админского питомца. Если закрыть окно кнопкой «Позже», до завтра оно не вернётся: бонус всё равно ждёт
  // в Меню → «Бонус дня» (на «Меню» горит красная точка).
  function openDailyPop() { fillDaily($('dpopbody'), true); $('dailypop').classList.add('on'); SFX.play('ach'); haptic('ok'); }
  function closeDailyPop() { $('dailypop').classList.remove('on'); }
  function maybeDailyPop(D) {
    if (!D || !D.can_claim || isGuest() || dailyPopShown) return;
    const key = 'otter_dailypop_' + (testMode ? 'admin' : 'main');
    let seen = null; try { seen = localStorage.getItem(key); } catch (e) { /* без хранилища покажем один раз за запуск */ }
    if (seen !== null && String(seen) === String(D.today)) return;
    dailyPopShown = true;
    try { localStorage.setItem(key, String(D.today)); } catch (e) { /* ничего страшного */ }
    setTimeout(() => { if (S && S.daily && S.daily.can_claim) openDailyPop(); }, 900);   // чуть позже, чтобы сначала нарисовалась сцена
  }
  $('dpopclose').addEventListener('click', closeDailyPop);
  $('dailypop').addEventListener('click', (e) => { if (e.target === $('dailypop')) closeDailyPop(); });
  // claimDaily — «Забрать бонус»: действие claim_daily на сервер; в ответе новое состояние и, возможно, новые достижения (серия)
  async function claimDaily() {
    if (dailyBusy) return; dailyBusy = true; haptic('light');
    try { const r = await rpc('claim_daily'); if (r) { closeDailyPop(); toast(r.say, 4500); haptic(r.ok ? 'ok' : 'err'); } } finally { dailyBusy = false; }
  }
  function onAch(r) {
    if (!r || !r.ach_new || !r.ach_new.length) return;
    const t = r.ach_new.map(a => a.e + ' ' + a.n).join('\n');
    setTimeout(() => { toast('🏆 Достижение!\n' + t, 4200); SFX.play('ach'); }, 700);
  }

