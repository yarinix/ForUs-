  // ---------- выбор еды ----------
  function closeSheet() { $('sheet').classList.remove('show'); }
  function openFeedSheet() {
    if (!CAT || !S) return;
    const box = $('sheetlist'); box.textContent = ''; $('sheettitle').textContent = 'Чем покормить?';
    Object.keys(CAT).filter(id => CAT[id].k === 'food').forEach(id => {
      const c = CAT[id], q = (S.inv || {})[id] || 0; if (!q && !c.base) return;
      const b = el('button', 'srow'); b.appendChild(el('span', 'e', c.e));
      const m = el('span', 'm', c.n); m.appendChild(el('small', null, 'Сытость +' + c.hu + ' · Радость +' + c.hp + (c.en ? ' · Энергия +' + c.en : '')));
      b.appendChild(m); b.appendChild(el('span', 'r', q ? '×' + q : c.p + ' 🪙'));
      b.addEventListener('click', () => { closeSheet(); act('feed', $('mainact'), { item: id }); });
      box.appendChild(b);
    });
    $('sheet').classList.add('show');
  }
  $('sheetclose').addEventListener('click', closeSheet);
  $('sheetshop').addEventListener('click', () => { closeSheet(); shopTab = 'food'; show('shop'); });
  $('sheet').addEventListener('pointerdown', (e) => { if (e.target === $('sheet')) closeSheet(); });

