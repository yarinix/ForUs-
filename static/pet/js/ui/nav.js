  // ---------- навигация: Главная / Меню и разделы меню ----------
  const PANELS = ['loc', 'menu', 'shop', 'wardrobe', 'quests', 'visit', 'rewards', 'daily', 'settings', 'admin'];
  // show(t) — открывает раздел (home / menu / shop / wardrobe / …): прячет остальные панели и перерисовывает нужную
  function show(t, o) {
    o = o || {};
    if (view.fishGame) closeFishing();                 // ушли из рыбалки в другой раздел
    const edit = t === 'edit' || t === 'locedit'; if (t === 'edit') t = 'home'; if (t === 'locedit') t = 'loc';
    const guest = isGuest(), locked = t === 'loc' && !guest && S && !hasForest(S);
    tab = t; setEdit(edit && !locked);
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === (t === 'home' || t === 'loc' ? t : 'menu')));
    const stageOn = t === 'home' || (t === 'loc' && !locked);
    $('stage').style.display = stageOn ? '' : 'none';
    $('actions').style.display = (stageOn && !edit) ? '' : 'none';
    $('editbar').style.display = (stageOn && edit && !locked) ? 'flex' : 'none';
    const editing = !!(stageOn && edit && !locked);
    if (editing && view.normH) $('stage').style.flex = '0 0 ' + view.normH + 'px';   // замораживаем высоту комнаты как на главной
    else if (!editing) $('stage').style.flex = '';
    $('app').classList.toggle('editing', editing);
    PANELS.forEach(p => $('panel-' + p).style.display = (p === t && (p !== 'loc' || locked)) ? 'block' : 'none');
    if (t === 'shop') renderShop(); else if (t === 'wardrobe') renderWardrobe(); else if (t === 'settings') renderSettings(); else if (t === 'admin') renderAdmin();
    else if (t === 'quests') renderQuests(); else if (t === 'visit') renderVisit(); else if (t === 'rewards') renderAch(); else if (t === 'daily') renderDaily(); else if (t === 'loc') renderLoc();
    if (!o.noMove && !guest && S && !busy) {           // перемещаем питомца между домом и улицей
      if (t === 'home' && outdoor(S.room)) goIn(); else if (t === 'loc' && !locked && !outdoor(S.room)) goOut();
    }
    if (view && view.cur) updateLocBtn();
    syncAmbient();
    if (!o.quiet) { haptic('light'); SFX.play('click'); }
  }
  // updatePanels() — зовётся при каждом новом состоянии с сервера: обновляет открытый сейчас раздел (магазин, гардероб, задания)
  function updatePanels() {
    if ($('dailypop').classList.contains('on')) { if (S && S.daily && S.daily.can_claim) fillDaily($('dpopbody'), true); else closeDailyPop(); }   // бонус забрали (в том числе партнёр) — окно не нужно
    if (tab === 'shop') renderShop(); else if (tab === 'wardrobe') renderWardrobe(); else if (tab === 'quests') renderQuests();
    else if (tab === 'rewards') renderAch(); else if (tab === 'daily') renderDaily(); else if (tab === 'loc') { renderLoc(); if (view.edit) renderEditList(); }
    else if (tab === 'home' && view.edit) renderEditList();
  }
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));
  $('who').addEventListener('click', () => show('settings'));

