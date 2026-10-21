  // ================= Экспорт и отправка =================
  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('чтение картинки')); fr.readAsDataURL(blob);
  });
  const canvasToBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('не удалось закодировать')), type, q));

  function scaled(src, maxSide, viaPixels) {
    const k = Math.min(1, maxSide / Math.max(src.width, src.height));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(src.width * k)); out.height = Math.max(1, Math.round(src.height * k));
    const x = out.getContext('2d');
    if (viaPixels && k === 1) x.putImageData(src.getContext('2d').getImageData(0, 0, src.width, src.height), 0, 0);
    else { x.fillStyle = S.paper.color; x.fillRect(0, 0, out.width, out.height); x.drawImage(src, 0, 0, out.width, out.height); }
    return out;
  }

  // Картинка после кодирования декодируется обратно и сверяется с листом:
  // на некоторых iPhone кодирование canvas иногда портит часть изображения.
  async function matchesSource(dataURL, src) {
    const img = new Image(); img.src = dataURL; await img.decode();
    const chk = document.createElement('canvas'); chk.width = img.naturalWidth; chk.height = img.naturalHeight;
    const cc = chk.getContext('2d', { willReadFrequently: true }); cc.drawImage(img, 0, 0);
    const sc = src.getContext('2d', { willReadFrequently: true });
    let bad = 0;
    for (const fy of [0.03, 0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.92, 0.97])
      for (const fx of [0.04, 0.5, 0.96]) {
        const a = cc.getImageData(Math.floor(fx * (chk.width - 1)), Math.floor(fy * (chk.height - 1)), 1, 1).data;
        const b = sc.getImageData(Math.floor(fx * (src.width - 1)), Math.floor(fy * (src.height - 1)), 1, 1).data;
        if (Math.abs(a[0] - b[0]) > 60 || Math.abs(a[1] - b[1]) > 60 || Math.abs(a[2] - b[2]) > 60) bad++;
      }
    return bad <= 2;
  }

  async function exportImage(type) {
    const src = flatten(true);
    const strategies = [
      { note: 'full', max: 1280, px: false }, { note: 'pixels', max: 4096, px: true },
      { note: 'small', max: 800, px: false }, { note: 'tiny', max: 480, px: false },
    ];
    const ext = type === 'image/png' ? 'png' : 'jpg';
    for (const s of strategies) {
      try {
        const blob = await canvasToBlob(scaled(src, s.max, s.px), type, 0.92);
        if (blob.size > 1400 * 1024) continue;   // сервер принимает до 2 МБ (base64 раздувает на треть)
        const dataURL = await blobToDataURL(blob);
        if (await matchesSource(dataURL, src)) return { image: dataURL, note: ext + '-' + s.note };
      } catch (e) { /* пробуем следующий способ */ }
    }
    throw new Error('не удалось подготовить картинку');
  }

  function setSending(v) {
    S.sending = v; const b = $('send'); b.disabled = v; b.classList.toggle('busy', v);
    b.querySelector('span').textContent = v ? 'Отправляю' : 'Отправить';
  }

  async function sendDrawing() {
    if (S.sending) return;
    if (!S.dirty) { toast('Сначала нарисуй что-нибудь.'); haptic('err'); return; }
    setSending(true);
    try {
      if (!tg.initData) {
        // Холст открыт кнопкой из инлайн-режима: загружаем рисунок и возвращаемся в чат,
        // где бот предложит готовый рисунок.
        const res = await exportImage('image/png');
        const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stash: true, image: res.image, note: res.note }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (!data.token) throw new Error('нет метки');
        $('send').classList.add('done'); haptic('ok'); call(tg.disableClosingConfirmation);
        setTimeout(() => call(tg.switchInlineQuery, 'draw ' + data.token), 180);
      } else {
        // Обычный режим (/draw в личке с ботом): данные пользователя подписаны Telegram
        const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
        const chat = tg.initDataUnsafe && tg.initDataUnsafe.chat;
        const inline = !!(tg.initDataUnsafe && tg.initDataUnsafe.query_id);
        const res = await exportImage(inline ? 'image/jpeg' : 'image/png');
        const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: (chat && chat.id) || (user && user.id),
            name: (user && (user.first_name || user.username)) || 'Друг', image: res.image,
            init_data: tg.initData, note: res.note }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        $('send').classList.add('done'); haptic('ok'); call(tg.disableClosingConfirmation);
        setTimeout(() => call(tg.close), 220);
      }
    } catch (err) {
      setSending(false); haptic('err');
      toast('Не удалось отправить. Попробуй ещё раз.');
      console.error(err);
    }
  }
  $('send').onclick = sendDrawing;

