<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>Наша выдра</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root {
    --bg: #0c1633; --bg2: #14224a; --card: #182a5c; --card2: #203570; --line: rgba(120,160,255,.22);
    --text: #f3f6ff; --dim: #9fb2e6; --blue: #2f7bff; --blue2: #5aa0ff;
    --heart: #ff4f8b; --food: #ffa23a; --energy: #3fd0ff; --coin: #ffcf3d; --ok: #3ddc84;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); overflow: hidden;
    font-family: ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
  #app { height: 100%; height: 100dvh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 9px;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px calc(env(safe-area-inset-bottom, 0px) + 8px);
    background: radial-gradient(120% 60% at 50% 0, #1a2f6b 0, var(--bg) 62%); }

  /* шапка */
  #head { display: flex; align-items: center; gap: 11px; background: linear-gradient(180deg, var(--card2), var(--card)); border: 1.5px solid var(--line);
    border-radius: 20px; padding: 9px 12px; box-shadow: 0 6px 18px rgba(0,0,0,.28); }
  #avatar { width: 50px; height: 50px; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #ffe6bf, #f2b977); border: 2.5px solid #ffd9a0; flex: 0 0 auto; overflow: hidden; }
  #avatar svg { width: 100%; height: 100%; display: block; }
  #who { flex: 1 1 auto; min-width: 0; }
  #pname { font-weight: 800; font-size: 19px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #lvlrow { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  #lvl { font-size: 12.5px; font-weight: 700; color: var(--dim); white-space: nowrap; }
  #xpbar { flex: 1; height: 7px; border-radius: 4px; background: rgba(255,255,255,.12); overflow: hidden; }
  #xpfill { height: 100%; width: 0; border-radius: 4px; background: linear-gradient(90deg, #7a5cff, #4aa3ff); transition: width .45s; }
  #coins { display: flex; align-items: center; gap: 7px; font-weight: 800; font-size: 17px; background: rgba(8,16,40,.55); border: 1.5px solid var(--line);
    border-radius: 18px; padding: 6px 12px 6px 7px; }
  .coin { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff3b0, var(--coin) 55%, #d89a12); border: 2px solid #b97c06; box-shadow: inset 0 -2px 0 rgba(0,0,0,.15); }

  /* показатели */
  #stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .pill { position: relative; height: 34px; border-radius: 17px; background: rgba(8,16,40,.6); border: 1.5px solid var(--line); overflow: hidden; display: flex; align-items: center; }
  .pill .fillbar { position: absolute; inset: 0 auto 0 0; width: 0; transition: width .45s; opacity: .55; }
  .pill .ico { position: relative; width: 34px; height: 100%; display: grid; place-items: center; font-size: 17px; flex: 0 0 auto; z-index: 1; }
  .pill b { position: relative; z-index: 1; font-size: 13.5px; font-weight: 800; margin-left: auto; padding-right: 11px; text-shadow: 0 1px 2px rgba(0,0,0,.5); }
  #p-happy .fillbar { background: linear-gradient(90deg, #ff4f8b, #ff86b0); }
  #p-hunger .fillbar { background: linear-gradient(90deg, #ff8f1f, #ffc260); }
  #p-energy .fillbar { background: linear-gradient(90deg, #1fa8ff, #6be0ff); }
  .pill.low { animation: lowpulse 1.4s ease-in-out infinite; border-color: #ff6a6a; }
  @keyframes lowpulse { 50% { box-shadow: 0 0 0 3px rgba(255,106,106,.28); } }

  /* комната */
  #stage { position: relative; flex: 1 1 auto; min-height: 190px; border-radius: 22px; overflow: hidden; border: 2px solid var(--line); box-shadow: 0 8px 22px rgba(0,0,0,.35); background: #3a2a1f; }
  #roomsvg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  #bubble { position: absolute; right: 8px; top: 12px; max-width: 58%; background: #fff; color: #2a2140; border-radius: 16px; padding: 9px 12px; font-size: 13.5px; font-weight: 800; line-height: 1.25;
    opacity: 0; transform: translateY(-6px) scale(.96); transition: opacity .2s, transform .2s; pointer-events: none; box-shadow: 0 5px 14px rgba(0,0,0,.28); }
  #bubble::after { content: ""; position: absolute; left: 16px; bottom: -8px; width: 16px; height: 16px; background: #fff; transform: rotate(45deg); border-radius: 3px; }
  #bubble.show { opacity: 1; transform: none; }
  .pop { position: absolute; font-weight: 900; font-size: 17px; color: #fff; pointer-events: none; text-shadow: 0 2px 0 rgba(0,0,0,.45), 0 0 8px rgba(0,0,0,.4); animation: rise 1.05s ease-out forwards; }
  @keyframes rise { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-58px) scale(1.15); } }

  /* страницы-заглушки */
  .panel { display: none; flex: 1 1 auto; min-height: 0; overflow: auto; background: linear-gradient(180deg, var(--card2), var(--card)); border: 1.5px solid var(--line); border-radius: 22px; padding: 20px 18px; }
  .panel h3 { margin: 0 0 8px; font-size: 20px; }
  .panel p { margin: 6px 0 12px; color: var(--dim); font-size: 14.5px; line-height: 1.45; }
  .soon { display: inline-block; background: rgba(47,123,255,.2); color: var(--blue2); border: 1.5px solid rgba(90,160,255,.45); border-radius: 12px; padding: 5px 11px; font-size: 12.5px; font-weight: 800; }
  .panel ul { margin: 0 0 14px; padding-left: 18px; color: var(--dim); font-size: 14px; line-height: 1.6; }

  /* кнопки действий */
  #actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .act { font: inherit; color: var(--text); border: 1.5px solid var(--line); border-radius: 18px; padding: 9px 2px 8px; background: linear-gradient(180deg, var(--card2), var(--card));
    display: flex; flex-direction: column; align-items: center; gap: 4px; font-weight: 800; font-size: 13px; box-shadow: 0 4px 0 rgba(4,10,30,.7), 0 8px 14px rgba(0,0,0,.25); transition: transform .08s, box-shadow .08s; }
  .act .em { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-size: 26px; background: radial-gradient(circle at 35% 25%, rgba(255,255,255,.28), rgba(255,255,255,.04)); }
  .act small { font-size: 10.5px; font-weight: 700; color: var(--dim); margin-top: -2px; }
  .act:active, .act.press { transform: translateY(3px); box-shadow: 0 1px 0 rgba(4,10,30,.7); }

  /* нижняя навигация */
  nav { display: grid; grid-template-columns: repeat(4, 1fr); background: rgba(8,16,40,.72); border: 1.5px solid var(--line); border-radius: 22px; padding: 5px; }
  nav button { font: inherit; font-size: 11.5px; font-weight: 800; color: var(--dim); background: none; border: 0; border-radius: 17px; padding: 7px 0 6px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  nav button span { font-size: 20px; line-height: 1; filter: grayscale(.5); }
  nav button.on { color: #fff; background: linear-gradient(180deg, #3b86ff, #2563d8); box-shadow: 0 3px 10px rgba(47,123,255,.45); }
  nav button.on span { filter: none; }

  #veil { position: fixed; inset: 0; background: rgba(8,14,34,.94); color: #fff; display: none; align-items: center; justify-content: center; text-align: center; padding: 30px; font-weight: 700; line-height: 1.45; z-index: 9; }

  /* ===== выдра: позы переключаются атрибутом data-look ===== */
  #otter .e-open, #otter .e-happy, #otter .e-closed, #otter .lids, #otter .m-smile, #otter .m-open, #otter .m-sad, #otter .m-yawn,
  #otter .fx-hearts, #otter .fx-zzz, #otter .fx-fish, #otter .fx-ball { display: none; }
  #otter[data-look="idle"] .e-open, #otter[data-look="idle"] .m-smile { display: inline; }
  #otter[data-look="happy"] .e-open, #otter[data-look="happy"] .m-smile { display: inline; }
  #otter[data-look="sleepy"] .e-open, #otter[data-look="sleepy"] .lids, #otter[data-look="sleepy"] .m-yawn { display: inline; }
  #otter[data-look="sad"] .e-open, #otter[data-look="sad"] .m-sad { display: inline; }
  #otter[data-look="feed"] .e-open, #otter[data-look="feed"] .m-open, #otter[data-look="feed"] .fx-fish { display: inline; }
  #otter[data-look="play"] .e-happy, #otter[data-look="play"] .m-open, #otter[data-look="play"] .fx-ball { display: inline; }
  #otter[data-look="sleep"] .e-closed, #otter[data-look="sleep"] .m-smile, #otter[data-look="sleep"] .fx-zzz { display: inline; }
  #otter[data-look="pet"] .e-happy, #otter[data-look="pet"] .m-smile, #otter[data-look="pet"] .fx-hearts { display: inline; }
  #otter[data-look="no"] .e-closed, #otter[data-look="no"] .m-sad { display: inline; }
  #otter[data-look="pet"] .blush, #otter[data-look="happy"] .blush { opacity: .85; }

  #otter .body { transform-box: fill-box; transform-origin: 50% 100%; animation: breathe 3.2s ease-in-out infinite; }
  #otter .tail { transform-box: fill-box; transform-origin: 0% 50%; animation: wag 2.6s ease-in-out infinite; }
  #otter .eyes { transform-box: fill-box; transform-origin: 50% 50%; animation: blink 5s infinite; }
  #otter[data-look="play"] .body { animation: hop .5s ease-in-out infinite; }
  #otter[data-look="play"] .tail, #otter[data-look="pet"] .tail { animation-duration: .5s; }
  #otter[data-look="sleep"] .body, #otter[data-look="sleepy"] .body { animation-duration: 5s; }
  #otter[data-look="no"] .body { animation: shake .45s ease-in-out 1; }
  #otter[data-look="sad"] .ear { transform-box: fill-box; transform-origin: 50% 100%; transform: rotate(0) translateY(3px); }
  #otter .fx-hearts text { animation: floatup 1.3s ease-out infinite; }
  #otter .fx-hearts text:nth-child(2) { animation-delay: .4s; } #otter .fx-hearts text:nth-child(3) { animation-delay: .8s; }
  #otter .fx-zzz text { animation: floatup 2.2s ease-out infinite; } #otter .fx-zzz text:nth-child(2) { animation-delay: .7s; } #otter .fx-zzz text:nth-child(3) { animation-delay: 1.4s; }
  #otter .fx-fish { animation: nibble .6s ease-in-out infinite; transform-box: fill-box; }
  #otter .fx-ball { animation: bounceball .5s ease-in infinite alternate; }
  @keyframes breathe { 50% { transform: scale(1.018, 1.03); } }
  @keyframes hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
  @keyframes wag { 50% { transform: rotate(9deg); } }
  @keyframes blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
  @keyframes shake { 20% { transform: translateX(-5px); } 60% { transform: translateX(5px); } }
  @keyframes floatup { from { opacity: 0; transform: translateY(8px); } 25% { opacity: 1; } to { opacity: 0; transform: translateY(-26px); } }
  @keyframes nibble { 50% { transform: translateY(-3px) rotate(-5deg); } }
  @keyframes bounceball { from { transform: translateY(0); } to { transform: translateY(-34px); } }
  @media (max-height: 640px) { #avatar { width: 42px; height: 42px; } .act .em { width: 36px; height: 36px; font-size: 22px; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
</head>
<body>

<!-- общие рисунки: голова выдры для аватарки -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <g id="otter-head">
      <circle cx="56" cy="58" r="11" fill="#7a4b30"/><circle cx="144" cy="58" r="11" fill="#7a4b30"/>
      <circle cx="56" cy="59" r="5" fill="#d9a07a"/><circle cx="144" cy="59" r="5" fill="#d9a07a"/>
      <ellipse cx="100" cy="94" rx="54" ry="47" fill="#8b5a3c"/>
      <ellipse cx="100" cy="108" rx="33" ry="23" fill="#f6e0bd"/>
      <circle cx="78" cy="88" r="7.5" fill="#2b1d24"/><circle cx="122" cy="88" r="7.5" fill="#2b1d24"/>
      <circle cx="80.5" cy="85" r="2.8" fill="#fff"/><circle cx="124.5" cy="85" r="2.8" fill="#fff"/>
      <ellipse cx="100" cy="99" rx="8" ry="5.5" fill="#2b1d24"/>
      <path d="M91 108 Q100 117 109 108" fill="none" stroke="#2b1d24" stroke-width="3" stroke-linecap="round"/>
      <circle cx="66" cy="104" r="7" fill="#ff8fa6" opacity=".55"/><circle cx="134" cy="104" r="7" fill="#ff8fa6" opacity=".55"/>
    </g>
  </defs>
</svg>

<div id="app">
  <header id="head">
    <div id="avatar"><svg viewBox="30 30 140 140"><use href="#otter-head"/></svg></div>
    <div id="who">
      <div id="pname">Бублик</div>
      <div id="lvlrow"><span id="lvl">Уровень 1</span><div id="xpbar"><div id="xpfill"></div></div></div>
    </div>
    <div id="coins"><i class="coin"></i><span id="coinv">0</span></div>
  </header>

  <div id="stats">
    <div class="pill" id="p-happy"><div class="fillbar"></div><span class="ico">💗</span><b id="v-happy">0/100</b></div>
    <div class="pill" id="p-hunger"><div class="fillbar"></div><span class="ico">🐟</span><b id="v-hunger">0/100</b></div>
    <div class="pill" id="p-energy"><div class="fillbar"></div><span class="ico">⚡</span><b id="v-energy">0/100</b></div>
  </div>

  <!-- ГЛАВНАЯ: комната с выдрой -->
  <div id="stage">
    <svg id="roomsvg" viewBox="0 0 360 400" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe7bf"/><stop offset="1" stop-color="#f1c98c"/></linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d49a63"/><stop offset="1" stop-color="#a9693a"/></linearGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#d7f1ff"/></linearGradient>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c9" stop-opacity=".55"/><stop offset="1" stop-color="#fff6c9" stop-opacity="0"/></linearGradient>
      </defs>
      <g transform="translate(0 66)">
      <rect y="-70" width="360" height="400" fill="url(#wall)"/>
      <rect y="168" width="360" height="9" fill="#e7b57a"/><rect y="176" width="360" height="3" fill="#b9814a"/>
      <polygon points="0,178 360,178 360,340 0,340" fill="url(#floor)"/>
      <g stroke="#8f5630" stroke-opacity=".38" stroke-width="1.4">
        <line x1="0" y1="206" x2="360" y2="206"/><line x1="0" y1="238" x2="360" y2="238"/><line x1="0" y1="272" x2="360" y2="272"/>
        <line x1="70" y1="178" x2="30" y2="206"/><line x1="170" y1="178" x2="160" y2="206"/><line x1="270" y1="178" x2="290" y2="206"/>
        <line x1="40" y1="206" x2="0" y2="238"/><line x1="140" y1="206" x2="120" y2="238"/><line x1="230" y1="206" x2="240" y2="238"/><line x1="330" y1="206" x2="350" y2="238"/>
        <line x1="90" y1="238" x2="60" y2="272"/><line x1="200" y1="238" x2="195" y2="272"/><line x1="310" y1="238" x2="330" y2="272"/>
      </g>
      <!-- окно -->
      <g>
        <rect x="14" y="34" width="116" height="112" rx="10" fill="#9a6538"/>
        <rect x="21" y="41" width="102" height="98" rx="6" fill="url(#sky)"/>
        <circle cx="46" cy="104" r="26" fill="#4fae5b"/><circle cx="82" cy="112" r="30" fill="#3f9a4d"/><circle cx="108" cy="98" r="20" fill="#5fc16a"/>
        <ellipse cx="86" cy="62" rx="20" ry="7" fill="#fff" opacity=".9"/><ellipse cx="98" cy="57" rx="11" ry="6" fill="#fff" opacity=".9"/>
        <rect x="70" y="41" width="5" height="98" fill="#9a6538"/><rect x="21" y="86" width="102" height="5" fill="#9a6538"/>
        <path d="M8 30 Q36 52 28 150 L8 150 Z" fill="#e9753b"/><path d="M136 30 Q108 52 116 150 L136 150 Z" fill="#e9753b"/>
        <rect x="4" y="28" width="136" height="8" rx="4" fill="#7a4524"/>
      </g>
      <polygon points="20,140 130,140 214,300 70,300" fill="url(#beam)"/>
      <!-- полка с растением и рамкой -->
      <g>
        <rect x="196" y="98" width="150" height="8" rx="3" fill="#8f5630"/><rect x="206" y="106" width="6" height="12" fill="#6e4023"/><rect x="330" y="106" width="6" height="12" fill="#6e4023"/>
        <path d="M222 98 h26 l-4 -22 h-18 z" fill="#d1613b"/><path d="M235 76 q-16 -22 -26 -10 q12 2 26 10 z M235 76 q10 -26 22 -18 q-8 6 -22 18 z M235 76 q2 -22 14 -26 q-2 12 -14 26" fill="#3ea34f"/>
        <rect x="262" y="58" width="40" height="40" rx="4" fill="#7a4524"/><rect x="267" y="63" width="30" height="30" fill="#bfe3ff"/><path d="M267 93 l10 -12 8 8 6 -6 6 10 z" fill="#5fae6a"/>
        <rect x="312" y="66" width="10" height="32" fill="#4a79d8"/><rect x="323" y="72" width="9" height="26" fill="#d8573f"/><rect x="333" y="68" width="9" height="30" fill="#4aa56b"/>
      </g>
      <g opacity=".85"><rect x="296" y="124" width="40" height="40" rx="6" fill="#e9b97c"/><circle cx="316" cy="148" r="8" fill="#b97b46"/><circle cx="305" cy="136" r="3.4" fill="#b97b46"/><circle cx="316" cy="132" r="3.4" fill="#b97b46"/><circle cx="327" cy="136" r="3.4" fill="#b97b46"/></g>
      <!-- ковёр -->
      <ellipse cx="175" cy="262" rx="124" ry="26" fill="#d9a773"/><ellipse cx="175" cy="262" rx="112" ry="21" fill="#f2d9b0"/><ellipse cx="175" cy="262" rx="76" ry="13" fill="#ecc78f"/>
      <!-- лежанка -->
      <g><ellipse cx="312" cy="252" rx="46" ry="24" fill="#2f4fa3"/><ellipse cx="312" cy="246" rx="46" ry="23" fill="#4b72d6"/><ellipse cx="312" cy="249" rx="31" ry="13" fill="#e8dcc6"/>
        <circle cx="312" cy="251" r="4.5" fill="#cdbb9b"/><circle cx="305" cy="246" r="2" fill="#cdbb9b"/><circle cx="312" cy="243" r="2" fill="#cdbb9b"/><circle cx="319" cy="246" r="2" fill="#cdbb9b"/></g>
      <!-- миска -->
      <g><ellipse cx="48" cy="270" rx="30" ry="9" fill="#1f3a8a"/><path d="M20 258 h56 l-6 14 q-22 8 -44 0 z" fill="#3b6fe0"/><ellipse cx="48" cy="258" rx="28" ry="8" fill="#2a4fb0"/><ellipse cx="48" cy="257" rx="22" ry="5.5" fill="#ffb55a"/><text x="48" y="265" font-size="11" text-anchor="middle">🐟</text></g>
      <!-- кость и мячик -->
      <g transform="translate(262 286) rotate(-14)"><rect x="0" y="-4" width="34" height="8" rx="3" fill="#fbf1de"/><circle cx="0" cy="-5" r="5" fill="#fbf1de"/><circle cx="0" cy="5" r="5" fill="#fbf1de"/><circle cx="34" cy="-5" r="5" fill="#fbf1de"/><circle cx="34" cy="5" r="5" fill="#fbf1de"/></g>
      <g><circle cx="238" cy="276" r="11" fill="#3b82f6"/><path d="M228 272 q10 6 20 0" stroke="#fff" stroke-width="2" fill="none"/><circle cx="234" cy="272" r="3" fill="#fff" opacity=".5"/></g>

      <!-- ВЫДРА -->
      <g id="otter" data-look="idle" transform="translate(70 62) scale(.98)">
        <ellipse cx="100" cy="212" rx="62" ry="9" fill="#000" opacity=".18"/>
        <g class="tail"><path d="M138 178 C186 170 202 206 168 216 C178 200 156 194 136 196 Z" fill="#7a4b30"/></g>
        <g class="body">
          <ellipse cx="100" cy="160" rx="47" ry="53" fill="#8b5a3c"/>
          <ellipse cx="100" cy="168" rx="31" ry="41" fill="#f6e0bd"/>
          <ellipse cx="77" cy="209" rx="19" ry="9" fill="#6f432a"/><ellipse cx="123" cy="209" rx="19" ry="9" fill="#6f432a"/>
          <g class="head">
            <g class="ear"><circle cx="56" cy="58" r="11" fill="#7a4b30"/><circle cx="56" cy="59" r="5" fill="#d9a07a"/></g>
            <g class="ear"><circle cx="144" cy="58" r="11" fill="#7a4b30"/><circle cx="144" cy="59" r="5" fill="#d9a07a"/></g>
            <ellipse cx="100" cy="94" rx="54" ry="47" fill="#8b5a3c"/>
            <ellipse cx="100" cy="108" rx="33" ry="23" fill="#f6e0bd"/>
            <g class="eyes">
              <g class="e-open"><circle cx="78" cy="88" r="7.5" fill="#2b1d24"/><circle cx="122" cy="88" r="7.5" fill="#2b1d24"/>
                <circle cx="80.5" cy="85" r="2.8" fill="#fff"/><circle cx="124.5" cy="85" r="2.8" fill="#fff"/><circle cx="76" cy="91" r="1.3" fill="#fff"/><circle cx="120" cy="91" r="1.3" fill="#fff"/></g>
              <g class="lids"><path d="M69 87 h18 v-2 a9 9 0 0 0 -18 0z" fill="#8b5a3c"/><path d="M113 87 h18 v-2 a9 9 0 0 0 -18 0z" fill="#8b5a3c"/><rect x="68" y="76" width="20" height="9" fill="#8b5a3c"/><rect x="112" y="76" width="20" height="9" fill="#8b5a3c"/></g>
              <g class="e-happy" fill="none" stroke="#2b1d24" stroke-width="3.4" stroke-linecap="round"><path d="M70 91 Q78 80 86 91"/><path d="M114 91 Q122 80 130 91"/></g>
              <g class="e-closed" fill="none" stroke="#2b1d24" stroke-width="3.4" stroke-linecap="round"><path d="M70 87 Q78 95 86 87"/><path d="M114 87 Q122 95 130 87"/></g>
            </g>
            <ellipse cx="100" cy="99" rx="8.5" ry="5.8" fill="#2b1d24"/><ellipse cx="98" cy="97.3" rx="2.6" ry="1.4" fill="#fff" opacity=".45"/>
            <g fill="#8b5a3c" opacity=".55"><circle cx="86" cy="110" r="1.4"/><circle cx="81" cy="113" r="1.4"/><circle cx="114" cy="110" r="1.4"/><circle cx="119" cy="113" r="1.4"/></g>
            <g class="m-smile"><path d="M90 108 Q100 118 110 108" fill="none" stroke="#2b1d24" stroke-width="3" stroke-linecap="round"/></g>
            <g class="m-open"><path d="M90 107 Q100 129 110 107 Z" fill="#5a2230"/><path d="M94 118 Q100 124 106 118 Q100 114 94 118Z" fill="#ff8da1"/></g>
            <g class="m-sad"><path d="M91 116 Q100 107 109 116" fill="none" stroke="#2b1d24" stroke-width="3" stroke-linecap="round"/></g>
            <g class="m-yawn"><ellipse cx="100" cy="114" rx="6" ry="7" fill="#5a2230"/></g>
            <circle class="blush" cx="64" cy="104" r="8" fill="#ff8fa6" opacity=".5"/><circle class="blush" cx="136" cy="104" r="8" fill="#ff8fa6" opacity=".5"/>
          </g>
          <ellipse cx="72" cy="158" rx="9" ry="14" fill="#7a4b30" transform="rotate(14 72 158)"/><ellipse cx="128" cy="158" rx="9" ry="14" fill="#7a4b30" transform="rotate(-14 128 158)"/>
        </g>
        <g class="fx-fish"><text x="96" y="152" font-size="34" text-anchor="middle">🐟</text></g>
        <g class="fx-ball"><circle cx="176" cy="196" r="12" fill="#3b82f6"/><path d="M165 192 q11 7 22 0" stroke="#fff" stroke-width="2.4" fill="none"/><circle cx="171" cy="191" r="3.4" fill="#fff" opacity=".55"/></g>
        <g class="fx-hearts" font-size="22" text-anchor="middle"><text x="40" y="60">💗</text><text x="162" y="50">💕</text><text x="100" y="28">💗</text></g>
        <g class="fx-zzz" font-size="22" font-weight="800" fill="#fff" text-anchor="middle" style="paint-order:stroke" stroke="#27407f" stroke-width="3"><text x="158" y="48">z</text><text x="172" y="30">Z</text><text x="188" y="12">Z</text></g>
      </g>
      </g>
    </svg>
    <div id="bubble"></div>
  </div>

  <!-- заглушки будущих разделов -->
  <section class="panel" id="panel-quests">
    <h3>Задания</h3>
    <p>Ежедневные дела для вас двоих. Например:</p>
    <ul><li>Покормить Бублика утром</li><li>Поиграть вместе</li><li>Уложить спать до полуночи</li></ul>
    <span class="soon">скоро</span>
  </section>
  <section class="panel" id="panel-house">
    <h3>Дом</h3>
    <p>Обустраивайте комнату: коврики, игрушки, лежанки, растения. Монетки уже копятся — скоро будет на что потратить.</p>
    <span class="soon">скоро</span>
  </section>
  <section class="panel" id="panel-rewards">
    <h3>Достижения</h3>
    <p>Награды за общую заботу и подарки за новые уровни.</p>
    <span class="soon">скоро</span>
  </section>

  <div id="actions">
    <button class="act" data-a="feed"><span class="em">🐟</span>Кормить<small>−5 монет</small></button>
    <button class="act" data-a="play"><span class="em">🎾</span>Играть<small>+монеты</small></button>
    <button class="act" data-a="sleep"><span class="em">🌙</span>Спать<small>+энергия</small></button>
    <button class="act" data-a="pet"><span class="em">🤍</span>Гладить<small>+счастье</small></button>
  </div>

  <nav>
    <button data-tab="home" class="on"><span>🐾</span>Главная</button>
    <button data-tab="quests"><span>📋</span>Задания</button>
    <button data-tab="house"><span>🏠</span>Дом</button>
    <button data-tab="rewards"><span>🏆</span>Достижения</button>
  </nav>
</div>
<div id="veil"><div id="veiltxt"></div></div>

<script>
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const tg = (window.Telegram && window.Telegram.WebApp) || {};
  const call = (fn, ...a) => { try { return fn && fn.apply(tg, a); } catch (e) {} };
  call(tg.ready); call(tg.expand); call(tg.disableVerticalSwipes);
  call(tg.setHeaderColor, '#0c1633'); call(tg.setBackgroundColor, '#0c1633');
  const haptic = (k) => { const h = tg.HapticFeedback; if (!h) return; try { k === 'err' ? h.notificationOccurred('error') : k === 'ok' ? h.notificationOccurred('success') : h.impactOccurred('light'); } catch (e) {} };

  // ---------- связь с сервером: подпись Telegram уходит с каждым запросом ----------
  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ init_data: tg.initData || '' }, body || {})),
    });
    if (res.status === 403) throw new Error('auth');
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }
  const veil = (text) => { $('veiltxt').textContent = text; $('veil').style.display = 'flex'; };
  const AUTH_MSG = 'Не получилось подтвердить, что это ты. Закрой игру и открой её заново через бота 🦦';

  // ---------- состояние ----------
  let S = null, busy = false, acting = false, bubbleTimer = null, lookTimer = null, seenTs = 0, myId = null;
  const ACTIONS = { feed: 'покормил(а)', play: 'поиграл(а) с', sleep: 'уложил(а) спать', pet: 'погладил(а)' };

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
  const otter = $('otter');
  function moodLook() {
    const m = S ? S.mood : 'ok';
    return { happy: 'happy', ok: 'idle', hungry: 'sad', sad: 'sad', sleepy: 'sleepy' }[m] || 'idle';
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
  function render(st) {
    S = st;
    $('pname').textContent = st.name; $('lvl').textContent = 'Уровень ' + st.level; $('coinv').textContent = st.coins;
    $('xpfill').style.width = Math.min(100, st.xp / st.xp_need * 100) + '%';
    setPill('p-happy', 'happy', st.happy); setPill('p-hunger', 'hunger', st.hunger); setPill('p-energy', 'energy', st.energy);
    if (!acting) otter.dataset.look = moodLook();
  }

  async function refresh(first) {
    try {
      const r = await api('/api/pet/state');
      if (!r.ok) throw new Error('bad');
      const st = r.state; myId = r.you;
      render(st);
      if (!first && st.last_ts && st.last_ts > seenTs && st.last_actor_id !== myId && st.last_action) {
        say((st.last_actor || 'Партнёр') + ' ' + (ACTIONS[st.last_action] || 'играет с') + ' ' + (st.last_action === 'play' || !ACTIONS[st.last_action] ? 'Бубликом' : 'Бублика') + ' 💞');
      }
      seenTs = Math.max(seenTs, st.last_ts || 0);
      if (first) greet(st);
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG);
    }
  }
  function greet(st) {
    say({ hungry: 'Я проголодался… 🐟', sleepy: 'Так хочется спать… 💤', sad: 'Поиграем? Мне скучно…', happy: 'Ура, вы пришли! 💕', ok: 'Привет! 🦦' }[st.mood], 3800);
  }

  async function act(name, btn) {
    if (busy) return; busy = true; btn.classList.add('press'); haptic('light');
    try {
      const r = await api('/api/pet/action', { action: name });
      const before = S;
      if (r.state) {
        render(r.state); seenTs = Math.max(seenTs, r.state.last_ts || 0);
        if (r.ok && before) {
          const dc = r.state.coins - before.coins, dx = (r.state.level > before.level) ? 0 : r.state.xp - before.xp;
          if (dc) pop((dc > 0 ? '+' : '') + dc + ' 🪙');
          if (dx > 0) setTimeout(() => pop('+' + dx + ' XP'), 170);
        }
      }
      say(r.say || '…');
      setLook(r.ok ? name : 'no', r.ok ? 2100 : 800);
      haptic(r.ok ? 'ok' : 'err');
    } catch (e) {
      if (String(e.message) === 'auth') veil(AUTH_MSG);
      else say('Связь с Бубликом потерялась, попробуй ещё раз 📡');
    } finally { setTimeout(() => btn.classList.remove('press'), 90); busy = false; }
  }
  document.querySelectorAll('.act').forEach(b => b.addEventListener('click', () => act(b.dataset.a, b)));

  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
    const tab = b.dataset.tab;
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
    $('stage').style.display = $('actions').style.display = tab === 'home' ? '' : 'none';
    ['quests', 'house', 'rewards'].forEach(t => $('panel-' + t).style.display = (t === tab) ? 'block' : 'none');
    haptic('light');
  }));

  // ---------- старт ----------
  if (!tg.initData) {
    veil('Эта игра открывается только из Telegram. Напиши боту /pet и нажми «🦦 Играть».');
  } else {
    refresh(true);
    setInterval(() => { if (!busy && !document.hidden) refresh(false); }, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
  }
})();
</script>
</body>
</html>
