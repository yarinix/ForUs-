  // ---------- мебель: рисунки (низ по центру для пола, центр для стены) ----------
  const FLAMEMAP = { w: '#ffffff', y: '#ffe878', o: '#ff9a3c', r: '#e8505b' };
  const FLAME = [
    ['....y....', '...yoy...', '..yooy...', '..yowoy..', '.yowwoy..', '.yoorroy.', '.yorrrry.', '..yrrrry.', '...yrry..'],
    ['.....y...', '....yoy..', '...yooy..', '..yowoy..', '..yowwoy.', '.yoorroy.', '.yorrrry.', '..yrrrry.', '...yrry..'],
    ['...y.....', '..yoy....', '..yooy...', '..yowoy..', '.yowwoy..', '.yoorroy.', '.yorrrry.', '..yrrrry.', '...yrry..']];
  const FURN = {
    mushrooms: { w: 22, h: 16, draw: (L) => {
      // пластинки под шляпкой и объёмные ножки
      rect(L, 5, 9, 4, 6, '#f6e6c8'); rect(L, 5, 9, 1, 6, '#ffffff'); rect(L, 8, 9, 1, 6, '#d9c5a0');
      ell(L, 7, 8, 6.2, 4.3, ['#ff8080', '#e8505b', '#b82e39', '#8a1c26']);
      rect(L, 4, 9, 6, 1, '#e8d4b0');
      for (const [x, y] of [[4, 6], [5, 6], [8, 5], [9, 5], [7, 8], [10, 7]]) dot(L, x, y, '#ffffff');
      rect(L, 15, 11, 3, 4, '#f6e6c8'); rect(L, 15, 11, 1, 4, '#ffffff');
      ell(L, 16.5, 10.5, 4.4, 3.1, ['#ffc478', '#e68d3a', '#b8621c']);
      dot(L, 15, 9, '#fff6db'); dot(L, 17, 10, '#fff6db');
      rect(L, 11, 13, 2, 2, '#f6e6c8'); ell(L, 12, 12.5, 3, 2.2, ['#ff8080', '#e8505b', '#b02c37']); dot(L, 12, 12, '#ffffff');
      [[3, 15], [10, 15], [19, 15]].forEach(([x, y]) => { dot(L, x, y, '#3a9642'); dot(L, x + 1, y - 1, '#68cf72'); }); } },
    flowerbed: { w: 34, h: 18, draw: (L) => {
      // каменный бордюр вокруг клумбы и пышные цветы с листочками
      ell(L, 17, 14, 16, 3.8, ['#8f5b34', '#6b4022', '#4d2c16'], { d: .12 });
      for (let i = 0; i < 9; i++) {
        const sx = 3 + i * 3.5;
        ell(L, sx, 15.2, 1.8, 1.3, ['#e3ddd3', '#b8b0a4', '#857e74'], { d: 0.05 });
      }
      const cols = [['#ffa6c1', '#ff5a8a'], ['#fff285', '#f0b818'], ['#ffffff', '#cfe0f5'], ['#cfa6ff', '#9152de'], ['#ffc185', '#f07c24']];
      for (let i = 0; i < 8; i++) {
        const x = 4 + i * 4, h = 4 + ((i * 5) % 5), [cHi, cLo] = cols[i % 5];
        rect(L, x, 13 - h, 1, h, '#3a9642'); dot(L, x - 1, 12 - (h >> 1), '#68cf72'); dot(L, x + 1, 11 - (h >> 1), '#52b856');
        rect(L, x - 1, 11 - h, 3, 3, cLo); dot(L, x - 1, 11 - h, cHi); dot(L, x, 11 - h, cHi); dot(L, x, 12 - h, '#ffe866');
      } } },
    picnic: { w: 34, h: 18, draw: (L) => {
      for (let y = 5; y < 16; y++) {
        const s = Math.round((15 - y) * 0.45);
        for (let x = 2 + s; x < 28 + s; x++) {
          const gx = Math.floor(x / 4), gy = Math.floor(y / 3);
          const col = (gx + gy) % 2 === 0 ? '#fff7f2' : ((gx % 2) ? '#e8505b' : '#ff858d');
          dot(L, x, y, col);
        }
      }
      // плетёная корзинка для пикника, яблочко и кружка с лимонадом
      rect(L, 17, 3, 9, 6, '#c99358');
      for (let y = 4; y < 9; y++) for (let x = 17; x < 26; x++) if ((x + y) % 2 === 0) dot(L, x, y, '#a8723a');
      rect(L, 17, 3, 9, 1, '#e8bc84'); rect(L, 19, 1, 5, 2, '#7d4f2a'); rect(L, 18, 5, 7, 2, '#e8505b'); dot(L, 21, 5, '#ffffff');
      ell(L, 8, 8, 2.2, 2.2, ['#ff8585', '#e03e49', '#9e2028']); dot(L, 7, 7, '#ffffff'); dot(L, 8, 5, '#4eaa56');
      rect(L, 11, 4, 3, 5, '#99e0ff'); rect(L, 11, 4, 1, 5, '#ffffff'); rect(L, 12, 2, 1, 3, '#ff5a8a'); } },
    birdhouse: { w: 16, h: 34, draw: (L) => {
      rect(L, 7, 14, 2, 19, '#8f5e35'); rect(L, 7, 14, 1, 19, '#b57c4a');
      rect(L, 5, 31, 6, 2, '#6e4527'); rect(L, 5, 31, 6, 1, '#8f5e35');
      rect(L, 2, 7, 12, 9, '#ebb778'); rect(L, 2, 7, 2, 9, '#f7cf99'); rect(L, 12, 7, 2, 9, '#c78f52');
      rect(L, 5, 16, 6, 1, '#8f5e35');
      for (let r = 0; r < 6; r++) { const half = Math.round(2 + r * 1.4); rect(L, 8 - half, 1 + r, half * 2, 1, r % 2 ? '#c9523c' : '#eb6e57'); dot(L, 8 - half, 1 + r, '#ff9c8a'); }
      ell(L, 8, 11, 2.2, 2.2, ['#2a1722', '#140a10']); rect(L, 6, 14, 4, 1, '#f7cf99');
      // маленькая синичка на жёрдочке
      rect(L, 10, 12, 3, 2, '#4fa8ff'); dot(L, 11, 13, '#ffe27a'); dot(L, 13, 12, '#ff9a3c'); } },
    bench: { w: 34, h: 22, draw: (L) => {
      // кованые боковины и профилированные деревянные рейки со светотенью
      rect(L, 3, 2, 2, 13, '#4a5568'); rect(L, 29, 2, 2, 13, '#4a5568');
      for (const y of [2, 6]) {
        rect(L, 2, y, 30, 3, '#c99358'); rect(L, 2, y, 30, 1, '#e6b881'); rect(L, 2, y + 2, 30, 1, '#9c6839');
        dot(L, 4, y + 1, '#3d4654'); dot(L, 29, y + 1, '#3d4654');
      }
      rect(L, 2, 10, 30, 4, '#d19b60'); rect(L, 2, 10, 30, 1, '#edd5ae'); rect(L, 2, 13, 30, 1, '#966234');
      rect(L, 2, 14, 30, 1, '#6e4527');
      rect(L, 1, 9, 3, 5, '#3d4654'); rect(L, 30, 9, 3, 5, '#3d4654');
      rect(L, 4, 15, 3, 6, '#3d4654'); rect(L, 27, 15, 3, 6, '#3d4654');
      rect(L, 4, 15, 1, 6, '#64728a'); rect(L, 27, 15, 1, 6, '#64728a'); } },
    lamppost: { w: 14, h: 50, draw: (L) => {
      rect(L, 6, 12, 2, 36, '#3d4a5c'); rect(L, 6, 12, 1, 36, '#667891');
      rect(L, 4, 46, 6, 3, '#2b3545'); rect(L, 4, 46, 6, 1, '#52627a');
      rect(L, 5, 43, 4, 3, '#3d4a5c'); rect(L, 5, 22, 4, 2, '#52627a');
      rect(L, 3, 3, 8, 9, '#ffdf78'); rect(L, 4, 4, 6, 7, '#fff6bf'); rect(L, 6, 6, 2, 4, '#ffffff');
      rect(L, 3, 3, 1, 9, '#3d4a5c'); rect(L, 10, 3, 1, 9, '#3d4a5c');
      rect(L, 2, 2, 10, 2, '#3d4a5c'); rect(L, 2, 2, 10, 1, '#667891');
      rect(L, 4, 0, 6, 2, '#3d4a5c'); dot(L, 6, 0, '#8ba0bd');
      rect(L, 2, 12, 10, 1, '#3d4a5c'); } },
    campfire: { w: 24, h: 22, draw: (L) => {
      // раскалённые угли, фактурные поленья и каменный круг
      ell(L, 12, 17, 7, 2.2, ['#ff6b3d', '#c42b1c']);
      for (let t = 0; t < 15; t++) {
        rect(L, 5 + t, 16 - Math.round(t * 0.35), 1, 3, '#966236'); dot(L, 5 + t, 16 - Math.round(t * 0.35), '#c28854');
        rect(L, 19 - t, 16 - Math.round(t * 0.35), 1, 3, '#704422');
      }
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * 6.28;
        ell(L, 12 + Math.cos(a) * 9.5, 18 + Math.sin(a) * 2.6, 2.3, 1.9, ['#ded9d2', '#9c968f', '#635e58'], { d: .1 });
      }
      spr(L, 8, 3, FLAME[0], FLAMEMAP); } },
    boat: { w: 40, h: 24, draw: (L) => {
      flat(L, 20, 20, 18, 2.2, '#bfe8ff');
      // деревянный борт со шпангоутами, скамьями и веслом
      for (let y = 8; y < 19; y++) {
        const s = Math.round((y - 8) * 0.6);
        const col = y < 10 ? '#edd5ae' : (y % 3 === 0 ? '#7d4f2a' : (y % 2 ? '#b87d46' : '#a16836'));
        rect(L, 2 + s, y, 36 - s * 2, 1, col);
      }
      for (const rx of [11, 20, 29]) rect(L, rx, 10, 1, 7, '#6b4121');
      rect(L, 14, 7, 10, 2, '#d6a166'); rect(L, 14, 7, 10, 1, '#f0cb99');
      for (let t = 0; t < 14; t++) { dot(L, 23 + t, 4 + t, '#e3b278'); dot(L, 23 + t, 5 + t, '#9c6839'); }
      ell(L, 36, 18, 2.5, 1.8, ['#f0cb99', '#c99358']); } },
    tent: { w: 36, h: 30, draw: (L) => {
      // колышки и растяжки по бокам
      olin(L, 4, 24, 1, 28, '#d9cbb0'); dot(L, 1, 28, '#8f5e35');
      olin(L, 32, 24, 35, 28, '#d9cbb0'); dot(L, 35, 28, '#8f5e35');
      for (let r = 0; r < 26; r++) {
        const half = Math.round(1 + r * 0.66);
        for (let x = 18 - half; x <= 18 + half; x++) {
          const left = x < 18, seam = Math.abs(x - 18) === Math.round(half * 0.55);
          const col = seam ? (left ? '#e0702e' : '#b84c18') : (left ? (((x + r) % 6 < 2) ? '#ffb06b' : '#ff8c3b') : (((x + r) % 6 < 2) ? '#e3722e' : '#c9591e'));
          dot(L, x, 3 + r, col);
        }
      }
      // вход в палатку с отвёрнутыми пологами и тёплым спальником внутри
      for (let r = 0; r < 17; r++) {
        const half = Math.round(0.5 + r * 0.34);
        for (let x = 18 - half; x <= 18 + half; x++) dot(L, x, 12 + r, r > 13 ? '#5988db' : '#2e1b12');
        dot(L, 18 - half - 1, 12 + r, '#ffd699'); dot(L, 18 + half + 1, 12 + r, '#f0a860');
      }
      rect(L, 18, 0, 1, 4, '#8f5e35'); rect(L, 19, 0, 5, 2, '#ffe252'); dot(L, 23, 1, '#ff9a3c'); } },
    cactus: { w: 16, h: 27, draw: (L) => {
      ell(L, 8, 12, 4.2, 10, GRN);
      for (let y = 4; y < 20; y++) { dot(L, 6, y, '#2f7f3d'); dot(L, 8, y, '#9cf099'); dot(L, 10, y, '#23692c'); }
      ell(L, 3.5, 14, 2.5, 4.2, GRN); ell(L, 12.5, 10, 2.5, 4.2, GRN);
      for (const [x, y] of [[3, 8], [13, 6], [2, 13], [14, 11], [4, 17]]) dot(L, x, y, '#fff8cc');
      rect(L, 3, 21, 10, 2, '#eb9663'); rect(L, 3, 21, 10, 1, '#ffb88c');
      rect(L, 4, 23, 8, 3, '#c96a3d'); rect(L, 4, 23, 2, 3, '#e08354');
      spr(L, 6, 0, ['.p.p.', 'ppYpp', '.ppp.'], { p: '#ff8ab8', Y: '#ffe666' }); } },
    pouf: { w: 22, h: 16, draw: (L) => {
      // вязаный пуф с рельефными дольками и пуговкой сверху
      ell(L, 11, 9.2, 10, 6.4, ['#ffc2d6', '#ff80ab', '#d94c7d', '#a32c56'], { d: .12 });
      ell(L, 11, 5.5, 8.2, 3.2, ['#ffe0eb', '#ffb3cc', '#e8749c'], { d: .1 });
      for (const dx of [-5, 0, 5]) olin(L, 11 + dx * 0.6, 5, 11 + dx, 14, '#c43e6d');
      rect(L, 10, 5, 2, 1, '#fff0f6'); } },
    plant: { w: 24, h: 38, draw: (L) => {
      // керамический горшок с узором, земля и глянцевые листья фикуса с прожилками
      rect(L, 11, 15, 2, 12, '#7d4f2a');
      [[12, 10, 4.5, 8.2], [7, 17, 4.4, 7.2], [17, 17, 4.4, 7.2], [8.5, 8, 3.4, 6.2], [15.5, 8, 3.4, 6.2]].forEach(([cx, cy, rx, ry]) => {
        ell(L, cx, cy, rx, ry, GRN, { d: .12 });
        rect(L, Math.round(cx), Math.round(cy - ry * 0.5), 1, Math.round(ry), '#a8f5a6');
      });
      ell(L, 12, 26, 5.5, 1.5, ['#6b4226', '#4a2c18']);
      rect(L, 6, 26, 12, 3, '#eb9560'); rect(L, 6, 26, 12, 1, '#ffba8c');
      rect(L, 7, 29, 10, 7, '#c96a3d'); rect(L, 7, 29, 2, 7, '#e68655'); rect(L, 15, 29, 2, 7, '#9e4c25');
      for (let x = 7; x < 17; x += 2) dot(L, x, 31, '#ffe8cc'); } },
    table: { w: 26, h: 22, draw: (L) => {
      // точёная ножка, круглая столешница с салфеткой, чайник и чашечка с блюдцем
      rect(L, 11, 10, 4, 9, '#8f5e35'); rect(L, 11, 10, 1, 9, '#b87e4a'); rect(L, 10, 14, 6, 2, '#a66e3d');
      ell(L, 13, 20, 7.5, 2.2, ['#b57e4c', '#8f5e35', '#5e3b1f']);
      ell(L, 13, 8, 12.2, 3.8, ['#f0c993', '#d69e60', '#a8723a', '#7d4f25']);
      flat(L, 13, 7.5, 6.5, 1.8, '#fff7eb');
      // заварочный чайник и чашка с паром
      ell(L, 16, 5.5, 3.2, 2.6, ['#a8d8ff', '#5ca4eb', '#346fb3']); dot(L, 16, 2.5, '#ffe27a'); dot(L, 19, 5, '#5ca4eb');
      flat(L, 9.5, 7, 3, 1, '#ffffff');
      rect(L, 8, 3, 4, 4, '#ffffff'); rect(L, 8, 3, 1, 4, '#e6f0fa'); rect(L, 9, 4, 2, 1, '#b8723a'); dot(L, 12, 4, '#ffffff');
      dot(L, 9, 0, '#eef5fc'); dot(L, 10, 1, '#eef5fc'); } },
    lamp: { w: 16, h: 44, draw: (L) => {
      ell(L, 8, 42, 5.5, 2.2, ['#eef4fa', '#b5c4d6', '#74859c']);
      rect(L, 7, 13, 2, 29, '#8a9bb0'); rect(L, 7, 13, 1, 29, '#d0deed');
      rect(L, 9, 14, 1, 4, '#d9a63a'); dot(L, 9, 18, '#ffe878');
      spr(L, 1, 4, ['....hhhhhh....', '...hyyyyyyd...', '..yyhyyyyyyd..', '.yyyhyyyyyydd.', 'yyyyyyyyyyyydd', 'dddddddddddddd', 'b.b.b.b.b.b.b.'], { y: '#ffd96a', h: '#fff7c2', d: '#d99e2b', b: '#f5b842' }); } },
    tree: { w: 30, h: 46, draw: (L) => {
      // кадка со снегом, пышная многослойная хвоя, золотая мишура и блестящие шары
      rect(L, 11, 39, 8, 6, '#a85a32'); rect(L, 11, 39, 2, 6, '#cc7447'); rect(L, 10, 38, 10, 2, '#c96e40');
      for (let i = 0; i < 3; i++) {
        const top = 5 + i * 10, hw = 7 + i * 3.2;
        for (let r = 0; r < 13; r++) {
          const half = Math.round(r / 12 * hw);
          for (let x = 15 - half; x <= 15 + half; x++) {
            const c = (x + r) % 4 === 0 ? '#7ae384' : (x < 15 - half * 0.2 ? '#52ba5c' : x > 15 + half * 0.3 ? '#286e34' : '#3a9447');
            dot(L, x, top + r, c);
          }
        }
      }
      // золотая гирлянда-мишура по диагонали
      for (let t = 0; t < 12; t++) { dot(L, 10 + t, 15 + Math.round(t * 0.4), '#ffe878'); dot(L, 8 + t, 26 + Math.round(t * 0.45), '#ffe878'); }
      // объёмная звезда на макушке
      spr(L, 12, 0, ['..h..', '.hyy.', 'hyyyd', '.yyd.', 'y...d'], { h: '#ffffff', y: '#ffe252', d: '#d49412' });
      [[15, 13, '#ff4f6e', '#ffb3c1'], [11, 23, '#4fa8ff', '#bae0ff'], [19, 24, '#ffd93d', '#fff7bd'], [8, 33, '#ff4f6e', '#ffb3c1'], [22, 34, '#4fa8ff', '#bae0ff'], [15, 32, '#c06bff', '#e9c7ff'], [13, 18, '#ffd93d', '#fff7bd']].forEach(([x, y, c, hi]) => {
        rect(L, x, y, 3, 3, c); dot(L, x, y, hi);
      }); } },
    armchair: { w: 34, h: 30, draw: (L) => {
      // каретная стяжка спинки, пухлые валики подлокотников и уютная подушка
      rect(L, 3, 2, 28, 19, '#e06c7b'); rect(L, 4, 2, 26, 2, '#ffa8b2'); rect(L, 3, 3, 2, 16, '#f58c99'); rect(L, 29, 3, 2, 16, '#b84655');
      for (const [tx, ty] of [[9, 7], [17, 7], [25, 7], [13, 11], [21, 11]]) {
        dot(L, tx, ty, '#9e3543'); dot(L, tx, ty - 1, '#ffa8b2');
      }
      ell(L, 3.5, 13, 3.8, 3.2, ['#ffa8b2', '#e06c7b', '#b03e4d']);
      ell(L, 30.5, 13, 3.8, 3.2, ['#ffa8b2', '#e06c7b', '#b03e4d']);
      rect(L, 0, 13, 7, 13, '#c94f5e'); rect(L, 1, 13, 2, 12, '#e87684');
      rect(L, 27, 13, 7, 13, '#b84251'); rect(L, 27, 13, 2, 12, '#d95f6e');
      rect(L, 7, 16, 20, 9, '#f28895'); rect(L, 7, 16, 20, 2, '#ffb5be'); rect(L, 7, 23, 20, 2, '#c44b59');
      // декоративная подушечка на сиденье
      ell(L, 21, 14, 4.5, 3.2, ['#fff5d6', '#f2d694', '#c9a458']);
      rect(L, 2, 26, 3, 3, '#6e4527'); dot(L, 2, 26, '#9c6839');
      rect(L, 29, 26, 3, 3, '#6e4527'); dot(L, 29, 26, '#9c6839'); } },
    bookcase: { w: 30, h: 42, draw: (L) => {
      // резной карниз, глубокая ниша и разноцветные корешки книг с золотым тиснением
      rect(L, 0, 0, 30, 2, '#b07442'); rect(L, 0, 0, 30, 1, '#d99b66');
      rect(L, 1, 2, 28, 39, '#8f5630'); rect(L, 1, 2, 2, 39, '#ad6d40'); rect(L, 27, 2, 2, 39, '#6b3d1e');
      rect(L, 3, 3, 24, 36, '#4d2d18');
      const cols = [['#e8505b', '#ff8a92'], ['#4f83e8', '#8cb3ff'], ['#4eaa56', '#85de8b'], ['#edb826', '#ffe885'], ['#9b5de5', '#cba3ff'], ['#f08232', '#ffb880']];
      [3, 15, 27].forEach((y0, r) => {
        rect(L, 3, y0 + 10, 24, 2, '#9c6238'); rect(L, 3, y0 + 10, 24, 1, '#c48554');
        let x = 4, i = r * 3;
        while (x < 24) {
          const w = 3 + (i % 2), h = 7 + ((i * 5) % 4), [c, hi] = cols[i % cols.length];
          rect(L, x, y0 + 10 - h, w, h, c);
          rect(L, x, y0 + 10 - h, 1, h, hi);
          rect(L, x, y0 + 10 - h + 2, w, 1, '#ffe27a');
          x += w; i++;
        }
      }); } },
    aquarium: { w: 34, h: 30, draw: (L) => {
      rect(L, 2, 23, 30, 6, '#8f5630'); rect(L, 2, 23, 30, 1, '#c28353');
      rect(L, 5, 25, 10, 3, '#734222'); rect(L, 19, 25, 10, 3, '#734222');
      band(L, 3, 3, 28, 19, ['#c4f0ff', '#85d4fa', '#52b2e8', '#368ec4']);
      // коралл, камушки, пёстрый грунт и водоросли
      for (let x = 3; x < 31; x++) for (let y = 19; y < 22; y++) dot(L, x, y, ((x + y) % 3 === 0) ? '#d9b874' : ((x * 3 + y) % 5 === 0) ? '#ffffff' : '#f2da9b');
      ell(L, 15, 19, 3.2, 2, ['#9ea6b2', '#6c7480']);
      spr(L, 19, 14, ['.r.r.', 'rrrrr', '.rrr.', '..r..', '..r..'], { r: '#ff708d' });
      rect(L, 6, 11, 2, 8, '#389448'); rect(L, 5, 13, 1, 5, '#68cf72'); rect(L, 8, 14, 1, 5, '#68cf72');
      rect(L, 25, 10, 2, 9, '#389448'); rect(L, 27, 12, 1, 7, '#68cf72');
      rect(L, 2, 2, 30, 1, '#ffffff'); rect(L, 2, 2, 1, 21, '#e6f9ff'); rect(L, 31, 2, 1, 21, '#b5e6fa'); rect(L, 2, 22, 30, 1, '#85cbe8');
      for (let d = 0; d < 5; d++) dot(L, 5 + d, 5 + d, '#ffffff'); } },
    tv: { w: 34, h: 31, draw: (L) => {
      // тумба, корпус телевизора с решёткой динамика, ручками настройки и пейзажем на экране
      rect(L, 4, 24, 26, 7, '#8f5630'); rect(L, 4, 24, 26, 1, '#bf8050');
      rect(L, 7, 26, 20, 3, '#61381b');
      rect(L, 2, 3, 30, 21, '#32384a'); rect(L, 2, 3, 30, 1, '#5c6680'); rect(L, 2, 3, 1, 21, '#495269');
      band(L, 4, 5, 22, 17, ['#85d8ff', '#4da2eb', '#3478c2']);
      ell(L, 15, 20, 11, 4, ['#7fd08a', '#4aa858']);
      spr(L, 11, 9, SPR.heart.rows, SPR.heart.map);
      // панель управления справа от экрана
      for (let y = 6; y < 14; y += 2) rect(L, 27, y, 3, 1, '#1e222e');
      rect(L, 27, 15, 3, 2, '#d0dae8'); rect(L, 27, 18, 3, 2, '#d0dae8');
      dot(L, 28, 21, '#5cff8a');
      rect(L, 12, 0, 1, 3, '#d0dae8'); rect(L, 21, 0, 1, 3, '#d0dae8'); rect(L, 13, 2, 8, 1, '#94a3b8'); } },
    clock: { w: 18, h: 18, draw: (L) => {
      ell(L, 9, 9, 8.2, 8.2, ['#fff099', '#f2c03d', '#b88214']);
      ell(L, 9, 9, 6.5, 6.5, ['#ffffff', '#eef3fa', '#d5dfed']);
      for (const [x, y, c] of [[9, 3, '#e8505b'], [9, 14, '#5c6b82'], [14, 9, '#5c6b82'], [4, 9, '#5c6b82'], [12, 4, '#9aa8bd'], [14, 6, '#9aa8bd'], [6, 4, '#9aa8bd'], [4, 6, '#9aa8bd']]) dot(L, x, y, c);
      rect(L, 9, 4, 1, 5, OUT); rect(L, 9, 9, 4, 1, OUT); dot(L, 9, 9, '#e8505b'); } },
    picture: { w: 26, h: 22, draw: (L) => {
      // багетная золотисто-ореховая рама, морской закат с дорожкой солнца и чайкой
      rect(L, 1, 1, 24, 20, '#8f5630'); rect(L, 1, 1, 24, 1, '#c98855'); rect(L, 1, 1, 1, 20, '#b57443');
      rect(L, 2, 2, 22, 18, '#e8b84a');
      band(L, 3, 3, 20, 11, ['#ff7b54', '#ffa952', '#ffd56b', '#fff1a8']);
      ell(L, 13, 12, 4.2, 4.2, ['#ffffff', '#ffe875', '#ffae3d']);
      band(L, 3, 14, 20, 5, ['#4593de', '#2968b0', '#1b4982']);
      for (let y = 14; y < 19; y++) rect(L, 12 - (y & 1), y, 3 + (y & 1), 1, '#ffe285');
      spr(L, 7, 5, ['k.k', '.k.'], { k: '#5e3829' }); } },
    photo: { w: 20, h: 24, draw: (L) => {
      rect(L, 1, 1, 18, 22, '#ff9ab8'); rect(L, 1, 1, 18, 1, '#ffc9da'); rect(L, 1, 1, 1, 22, '#ffb5cc');
      rect(L, 3, 3, 14, 18, '#fff7f9');
      spr(L, 3, 6, SPR.heart.rows, SPR.heart.map);
      spr(L, 10, 11, SPR.heart.rows, { r: '#4f83e8', h: '#b3d1ff', d: '#28499e' });
      dot(L, 13, 5, '#ffd93d'); dot(L, 5, 16, '#ffd93d'); } },
    poster: { w: 22, h: 28, draw: (L) => {
      rect(L, 1, 1, 20, 26, '#faf6ed'); rect(L, 1, 1, 20, 1, '#ffffff');
      band(L, 3, 3, 16, 20, ['#8cc8ff', '#bae0ff', '#e3f3ff']);
      ell(L, 6, 11.5, 2.2, 2.2, FUR); ell(L, 16, 11.5, 2.2, 2.2, FUR);
      ell(L, 11, 15, 6.8, 5.8, FUR, { d: .12 }); ell(L, 11, 17, 3.8, 2.8, BELLY);
      dot(L, 8, 14, OTT_OUT); dot(L, 8, 13, '#ffffff');
      dot(L, 14, 14, OTT_OUT); dot(L, 14, 13, '#ffffff');
      dot(L, 6, 16, '#ff94a2'); dot(L, 16, 16, '#ff94a2');
      rect(L, 10, 16, 2, 1, OTT_OUT);
      rect(L, 5, 24, 12, 1, '#8aa6cc'); } },
    mirror: { w: 16, h: 28, draw: (L) => {
      ell(L, 8, 14, 7.2, 13.2, ['#fff2a6', '#edc045', '#b07e12']);
      ell(L, 8, 14, 5.6, 11.5, ['#eefaff', '#bce4fa', '#8bc8eb', '#6db3de']);
      for (let d = 0; d < 6; d++) { dot(L, 5 + (d >> 1), 7 + d, '#ffffff'); dot(L, 6 + (d >> 1), 6 + d, '#ffffff'); }
      dot(L, 10, 19, '#ffffff'); dot(L, 11, 20, '#ffffff');
      dot(L, 8, 1, '#fff8cc'); } },
    garland: { w: 56, h: 14, draw: (L) => {
      const yy = (x) => Math.round(2 + Math.sin(Math.PI * x / 55) * 6);
      for (let x = 0; x < 56; x++) dot(L, x, yy(x), '#5e3b1f');
      [['#ff5a6a', '#ffb8bf'], ['#ffd93d', '#fff8c4'], ['#4fa8ff', '#bae0ff'], ['#4eaa56', '#9cf5a2']].forEach(([c, hi], k) => {
        for (let x = 3 + k * 4; x < 55; x += 16) {
          const y = yy(x);
          rect(L, x, y, 2, 1, '#8a9bb0');
          rect(L, x, y + 1, 2, 3, c); dot(L, x, y + 1, hi);
        }
      }); } },
  };

