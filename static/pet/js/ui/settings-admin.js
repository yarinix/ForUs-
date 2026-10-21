  // ---------- настройки: имя питомца ----------
  function renderSettings() {
    if (S) $('nameinp').value = S.name;
    $('sndtoggle').textContent = SFX.on ? '🔊 Звуки: вкл' : '🔇 Звуки: выкл'; $('sndvol').value = Math.round(SFX.vol * 100);
  }
  $('sndtoggle').addEventListener('click', () => { SFX.setOn(!SFX.on); renderSettings(); if (SFX.on) SFX.play('ok'); haptic('light'); });
  $('sndvol').addEventListener('input', () => SFX.setVol(+$('sndvol').value / 100));
  $('sndvol').addEventListener('change', () => SFX.play('coin'));
  $('namesave').addEventListener('click', async () => {
    const v = $('nameinp').value.trim();
    if (!v) { toast('Имя не может быть пустым ✏️'); return; }
    const r = await rpc('rename', { name: v });
    if (r) { toast(r.say); haptic(r.ok ? 'ok' : 'err'); if (r.ok) $('nameinp').blur(); }
  });
  $('nameinp').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('namesave').click(); });

  // ---------- админка (сервер всё равно проверяет, что ты админ) ----------
  const A_FIELDS = ['happy', 'hunger', 'energy', 'coins', 'level', 'xp', 'name', 'room'];
  function renderAdmin() { A_FIELDS.forEach(k => { $('a-' + k).value = ''; $('a-' + k).placeholder = (S && S[k] != null && k !== 'room') ? String(S[k]) : ''; }); }
  async function adm(op, params) {
    if (viewingUserId !== null && viewingUserId !== myId) { toast('В гостях нельзя управлять питомцем 👀'); return null; }
    try {
      const r = await api('/api/pet/admin', { op, params: params || {} });
      if (r.state) render(r.state);
      if (r.say) toast(r.say);
      haptic(r.ok ? 'ok' : 'err');
      return r;
    } catch (e) {
      if (String(e.message) === 'auth') toast('Нет доступа к админке'); else toast('Связь потерялась 📡');
      return null;
    }
  }
  $('a-apply').addEventListener('click', async () => {
    const p = {}; A_FIELDS.forEach(k => { const v = $('a-' + k).value.trim(); if (v !== '') p[k] = v; });
    if (await adm('set', p)) renderAdmin();
  });
  $('a-fill').addEventListener('click', () => adm('fill'));
  document.querySelectorAll('[data-adm]').forEach(b => b.addEventListener('click', async () => {
    const d = b.dataset, run = () => adm(d.adm, { hours: d.h, amount: d.amount, notify: d.n === '1' }).then(renderAdmin);
    if (d.confirm) {
      if (tg.showConfirm) tg.showConfirm(d.confirm, (ok) => ok && run()); else if (window.confirm(d.confirm)) run();
    } else run();
  }));
  $('a-log').addEventListener('click', async () => {
    const r = await adm('log'); if (!r || !r.log) return;
    $('admlog').textContent = r.log.length ? r.log.map(l => l.at.slice(5, 16) + '  ' + l.who + '  ' + l.action + (l.ok ? '' : ' ✗') + (l.coins ? '  ' + (l.coins > 0 ? '+' : '') + l.coins + '🪙' : '')).join('\n') : 'Пока пусто';
  });

