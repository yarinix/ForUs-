  // ---------- мелкие помощники интерфейса ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function toast(text, ms = 2300) {
    if (!text) return; const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
  }
  // pxCanvas — превращает слой (canvas) в картинку для интерфейса: вырезает кусок crop = [x, y, ширина, высота]
  // и увеличивает в k раз. Класс 'pxi' отключает сглаживание, чтобы пиксели оставались чёткими.
  function pxCanvas(src, k, crop) {
    const [cx, cy, cw, ch] = crop || [0, 0, src.width, src.height];
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.className = 'pxi';
    cv.style.width = (cw * k) + 'px'; cv.style.height = (ch * k) + 'px';
    cv.getContext('2d').drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch); return cv;
  }
  // ---------- ПРЕВЬЮ ОДЕЖДЫ (витрина магазина и гардероб) ----------
  // WL — кэш картинок: каждая вещь рисуется один раз, потому что рисунок вещи не меняется,
  // а магазин перерисовывается после каждого действия (монеты, покупки).
  const WL = {};
  // CROP — какой кусок выдры показать для слота: [x, y, ширина, высота] в пикселях слоя 84×92.
  // голова — голова с головным убором; верх — туловище; костюм и спина — почти вся выдра (крылья шире туловища); аксессуар — голова и грудь.
  const CROP = { head: [14, 10, 56, 46], top: [14, 46, 56, 44], suit: [14, 38, 56, 52], acc: [14, 36, 56, 48], back: [8, 38, 68, 52] };
  // wearPreview(id) — готовая картинка вещи для карточки. Рисуем целую выдру в позе покоя и надеваем на неё ТОЛЬКО эту вещь:
  // четвёртый параметр drawOtter (ov) подменяет «что надето» вместо настоящего состояния. Дальше drawOtter сам вызывает
  // drawHead → drawWear (голова, аксессуар) и bodyBack / bodyFront / backFront (спина, верх, костюм).
  // Потом вырезаем нужный кусок (CROP) и увеличиваем ×2.
  function wearPreview(id) {
    const c = CAT[id]; if (!WL[id]) WL[id] = drawOtter(0, 'idle', false, { [c.s]: id });
    return pxCanvas(WL[id].c, 2, CROP[c.s]);
  }
  // furnPreview(id) — картинка мебели для карточки: берём готовый рисунок из FURN (furnLayer) и увеличиваем так, чтобы влез в 88 px
  function furnPreview(id, kmax) {
    const f = furnLayer(id); if (!f) return el('div', 'emo', '❔');
    return pxCanvas(f.c, Math.max(1, Math.min(kmax || 2, Math.floor(88 / Math.max(f.w, f.h)))));
  }
  // rpc(action, extra) — отправляет действие на сервер (buy / wear / unwear / place / …) и сразу перерисовывает игру новым состоянием.
  // Возвращает ответ сервера {ok, say, state} или null, если связь пропала. Одновременно играет звук (покупка, одевание…).
  // В гостях (чужой питомец) действия запрещены — только смотреть.
  async function rpc(action, extra) {
    if (viewingUserId !== null && viewingUserId !== myId) { toast('В гостях можно только смотреть 👀'); return null; }
    try {
      const before = S;
      const r = await api('/api/pet/action', Object.assign({ action }, extra || {}));
      if (r.state) { render(r.state); seenTs = Math.max(seenTs, r.state.last_ts || 0); }
      SFX.play(r.ok ? ({ buy: 'buy', wear: 'wear', unwear: 'wear', place: 'place', unplace: 'place', claim: 'claim', claim_ach: 'claim', claim_daily: 'claim', unlock: 'unlock' }[action] || 'ok') : 'no');
      if (r.ok && r.state && before && r.state.level > before.level) SFX.play('level', 650);
      if (r.ok) onAch(r);
      return r;
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG); else toast('Связь потерялась, попробуй ещё раз 📡');
      return null;
    }
  }
  // owns(id) — куплена ли вещь (одежда и мебель покупаются один раз; еда копится в запасе S.inv)
  const owns = (id) => !!(S && (S.owned || []).includes(id));

