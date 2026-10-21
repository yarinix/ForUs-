  // ---------- связь с сервером: подпись Telegram уходит с каждым запросом ----------
  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ init_data: tg.initData || '', test: testMode ? 1 : 0 }, body || {})),   // test — режим «Проверка»: сервер возьмёт админского питомца
    });
    if (res.status === 403) throw new Error('auth');
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }
  const veil = (text) => { $('veiltxt').textContent = text; $('veil').style.display = 'flex'; };
  const AUTH_MSG = 'Не получилось подтвердить, что это ты. Закрой игру и открой её заново через бота 🦦';

