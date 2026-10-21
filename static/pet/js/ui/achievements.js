  // ---------- достижения ----------
  let achBusy = false;
  const fmtN = (n) => Number(n).toLocaleString('ru');
  function achRow(i) {
    const d = el('div', 'q arow' + (i.claimed ? ' claimed' : i.done ? ' done' : '')), it = i.item && CAT[i.item];
    d.appendChild(el('div', 'ae', i.e));
    const m = el('div', 'ab'); m.appendChild(el('div', 'qt', i.n)); m.appendChild(el('div', 'qh', i.d));
    const bar = el('div', 'qbar'), f = el('div'); f.style.width = Math.min(100, i.progress / i.goal * 100) + '%'; bar.appendChild(f); m.appendChild(bar);
    const row = el('div', 'qrow'); row.appendChild(el('span', 'qp', fmtN(i.progress) + '/' + fmtN(i.goal)));
    row.appendChild(el('span', 'qr', '🪙' + i.coins + ' · ' + i.xp + ' XP' + (it ? ' · ' + it.e : '')));
    if (i.done && !i.claimed) { const b = el('button', 'buy', 'Забрать'); b.addEventListener('click', () => claimAch(i.id)); row.appendChild(b); }
    else if (i.claimed) row.appendChild(el('span', 'qp', '✓'));
    m.appendChild(row); d.appendChild(m); return d;
  }
  function renderAch() {
    const box = $('abody'); if (!box) return; box.textContent = '';
    const A = S && S.ach;
    if (!A || !CAT) { box.appendChild(el('div', 'empty', 'Загружаем достижения…')); return; }
    $('acount').textContent = A.done + ' / ' + A.total;
    box.appendChild(el('div', 'qinfo' + (A.ready ? ' ok' : ''), A.ready ? '🎁 Наград к получению: ' + A.ready : 'Открыто ' + A.done + ' из ' + A.total + '. Награду можно забрать один раз'));
    const ready = A.items.filter(i => i.done && !i.claimed), prog = A.items.filter(i => !i.done).sort((a, b) => b.progress / b.goal - a.progress / a.goal), got = A.items.filter(i => i.claimed);
    [['🎁 Можно забрать', ready], ['⏳ В процессе', prog], ['🏆 Получено', got]].forEach(([t, list]) => {
      if (!list.length) return; const h = el('div', 'qcat', t); h.appendChild(el('small', null, String(list.length))); box.appendChild(h); list.forEach(i => box.appendChild(achRow(i)));
    });
  }
  async function claimAch(id) {
    if (achBusy) return; achBusy = true; haptic('light');
    try { const r = await rpc('claim_ach', { item: id }); if (r) { toast(r.say, 4500); haptic(r.ok ? 'ok' : 'err'); } } finally { achBusy = false; }
  }

