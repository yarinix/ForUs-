  // ---------- задания ----------
  let questBusy = false;
  const fmtQLeft = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ' ч ' : '') + m + ' мин'; };
  function updateQTimer() {
    const Q = S && S.quests; if (!Q) return;
    $('qtimer').textContent = '⏳ ' + fmtQLeft(Q.ends - (Date.now() / 1000 + skew));
  }
  function renderQuests() {
    const box = $('qbody'); if (!box) return; box.textContent = '';
    const Q = S && S.quests;
    if (!Q || !CAT) { box.appendChild(el('div', 'empty', 'Загружаем задания…')); return; }
    updateQTimer();
    const total = Q.items.length, got = Q.items.filter(i => i.claimed).length, bi = CAT[Q.bonus.item];
    box.appendChild(el('div', 'qinfo' + (Q.all_claimed ? ' ok' : ''), Q.all_claimed
      ? 'Все задания дня выполнены — бонус получен 🎉'
      : 'Забрано ' + got + ' из ' + total + '. Заберёшь все — бонус: 🪙' + Q.bonus.coins + ' + ' + Q.bonus.xp + ' XP' + (bi ? ' + ' + bi.e : '')));
    [1, 2, 3, 4].forEach(cat => {
      const items = Q.items.filter(i => i.cat === cat), meta = Q.cats[String(cat)]; if (!items.length || !meta) return;
      const head = el('div', 'qcat', meta.e + ' ' + meta.n); head.appendChild(el('small', null, meta.d)); box.appendChild(head);
      items.forEach(i => {
        const d = el('div', 'q' + (i.claimed ? ' claimed' : i.done ? ' done' : ''));
        d.appendChild(el('div', 'qt', i.text)); if (i.hint) d.appendChild(el('div', 'qh', i.hint));
        const bar = el('div', 'qbar'), fill = el('div'); fill.style.width = Math.min(100, i.progress / i.target * 100) + '%'; bar.appendChild(fill); d.appendChild(bar);
        const row = el('div', 'qrow'), it = i.item && CAT[i.item];
        row.appendChild(el('span', 'qp', i.progress + '/' + i.target));
        row.appendChild(el('span', 'qr', '🪙' + i.coins + ' · ' + i.xp + ' XP' + (it ? ' · ' + it.e : '')));
        const b = el('button', 'buy' + (i.claimed ? ' off' : i.done ? '' : ' poor'), i.claimed ? 'Получено ✓' : i.done ? 'Забрать' : 'В процессе');
        b.disabled = i.claimed || !i.done;
        b.addEventListener('click', () => claimQuest(i.id)); row.appendChild(b); d.appendChild(row); box.appendChild(d);
      });
    });
  }
  async function claimQuest(id) {
    if (questBusy) return; questBusy = true; haptic('light');
    try { const r = await rpc('claim', { item: id }); if (r) { toast(r.say, 4500); haptic(r.ok ? 'ok' : 'err'); } } finally { questBusy = false; }
  }
  setInterval(() => { if (tab === 'quests') updateQTimer(); }, 30000);

