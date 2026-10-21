  // ---- декор 42×42, рисуется в родном разрешении ----
  function decorArt(type) {
    const flowerBlob = (x, y, c) => { rect(x - 1, y, 3, 3, shade(c, -.35)); rect(x - 1, y - 1, 3, 3, c); rect(x, y - 1, 1, 1, shade(c, .5)); rect(x, y, 1, 1, '#ffd23a'); };
    shadow(21, 38, 16, 3, .34);
    if (type === 'bench') {
      board(7, 26, 4, 11, 2, true); board(31, 26, 4, 11, 3, true); board(10, 22, 3, 8, 4, true); board(29, 22, 3, 8, 5, true);
      board(6, 8, 30, 4, 11); board(6, 13, 30, 4, 12); board(5, 18, 32, 4, 13);
      board(3, 23, 36, 5, 14); board(2, 28, 38, 4, 15); rect(2, 32, 38, 1, 'rgba(40,20,10,.45)');
      board(2, 17, 4, 12, 16, true); board(36, 17, 4, 12, 17, true);
      rect(7, 9, 1, 1, '#d8d8d8'); rect(34, 9, 1, 1, '#d8d8d8'); rect(4, 24, 1, 1, '#d8d8d8'); rect(37, 24, 1, 1, '#d8d8d8');
      rect(8, 36, 3, 1, '#5e9a3a'); rect(31, 36, 3, 1, '#5e9a3a'); tuft(3, 36); tuft(36, 36);
      return;
    }
    if (type === 'flowers') {
      ellipse(21, 24, 17, 7, '#2a1c10'); ellipse(21, 23, 16, 6, '#3b2616');
      blob(21, 17, 15, 9, CANOPY, 91);
      [[8, 14, '#f27a9f'], [14, 9, '#ffd84a'], [21, 12, '#ffffff'], [28, 9, '#b08be0'], [34, 14, '#ff9a52'], [11, 19, '#e8524a'], [18, 17, '#fff6e6'], [25, 18, '#f27a9f'], [31, 19, '#ffd84a'], [21, 6, '#e8524a']].forEach(([x, y, c], i) => { rect(x, y, 1, 4, LEAF[1]); i % 3 === 0 ? daisy(x, y) : flowerBlob(x, y, c); });
      [[6, 8], [36, 8]].forEach(([x, y], i) => { rect(x, y, 1, 10, LEAF[2]); rect(x - 1, y - 5, 3, 6, '#7a55b8'); rect(x - 1, y - 5, 1, 5, '#b997e0'); rect(x, y - 6, 1, 1, '#d6bdf2'); });
      board(3, 25, 36, 4, 3); board(2, 28, 38, 9, 4); rect(13, 28, 1, 9, W6[0]); rect(28, 28, 1, 9, W6[0]); rect(2, 31, 38, 2, '#3c4046'); rect(2, 31, 38, 1, '#6c727a'); rect(2, 34, 38, 1, W6[1]);
      rect(8, 29, 1, 1, '#d8d8d8'); rect(33, 29, 1, 1, '#d8d8d8');
      for (let i = 0; i < 5; i++) { rect(5 + i * 8, 36, 2, 3, LEAF[2]); } rect(1, 30, 2, 8, LEAF[2]); rect(0, 34, 2, 4, LEAF[3]);
      return;
    }
    if (type === 'lantern') {
      ellipse(21, 37, 9, 3, STONE[0]); ellipse(21, 36, 8, 2, STONE[2]); rect(14, 31, 14, 6, STONE[0]); rect(15, 32, 12, 4, STONE[2]); rect(15, 32, 12, 1, STONE[3]); rect(18, 34, 1, 2, STONE[1]); rect(24, 33, 1, 3, STONE[1]);
      rect(19, 14, 5, 18, W6[0]); rect(20, 15, 3, 16, W6[3]); rect(20, 15, 1, 16, W6[4]); rect(22, 15, 1, 16, W6[2]);
      rect(23, 15, 8, 3, W6[0]); rect(24, 16, 6, 1, W6[4]); rect(29, 17, 1, 4, '#3a3a3a');
      rect(15, 2, 15, 3, '#2a1c10'); rect(17, 0, 11, 3, '#2a1c10'); rect(18, 1, 9, 1, '#7a5a38'); rect(20, -1, 5, 1, '#2a1c10');
      rect(14, 5, 17, 16, '#2a1c10'); rect(16, 6, 13, 13, '#ffd877'); rect(17, 7, 4, 10, '#fff6c8'); rect(21, 6, 2, 13, '#b87a20'); rect(26, 8, 2, 8, '#e6a83a'); rect(22, 12, 2, 4, '#ff9a30'); rect(22, 10, 1, 3, '#ffcf58');
      rect(14, 19, 17, 2, '#3a2a1a'); rect(16, 21, 13, 1, '#7a5a38'); return;
    }
    if (type === 'pond') {
      ellipse(21, 28, 19, 10, STONE[0]); for (let yy = -9; yy <= 9; yy++) { const half = Math.round(17 * Math.sqrt(1 - yy * yy / 100)); for (let xx = -half; xx <= half; xx++) { const d = Math.hypot(xx / 17, yy / 9.5); rect(21 + xx, 27 + yy, 1, 1, dither(21 + xx, 27 + yy, .8 - d * .5 - (d > .8 ? .2 : 0) + Math.sin(xx * .8 + yy) * .05, WATER)); } }
      for (let a = 0; a < 6.283; a += .26) { const k = Math.floor(a * 10); mossStone(Math.round(21 + Math.cos(a) * 18 - 3), Math.round(27 + Math.sin(a) * 9.5 - 2), 6 + Math.floor(rnd(k, 2) * 3), 5, rnd(k, 3) < .4); }
      rect(11, 24, 6, 1, WATER[6]); rect(26, 31, 5, 1, WATER[5]); rect(14, 30, 3, 1, WATER[5]);
      lily(28, 26, true); lily(14, 30, false); rect(13, 27, 3, 2, '#3a9a3a'); rect(13, 26, 1, 1, '#fff'); rect(15, 26, 1, 1, '#fff'); rect(14, 26, 1, 1, '#111');
      reeds(5, 25, 2, 31); return;
    }
    if (type === 'beehive') {
      for (const [x, y] of [[8, 34], [30, 35], [20, 36]]) tuft(x, y);
      for (const [x, y, c] of [[6, 33, '#ffd84a'], [33, 34, '#b08be0'], [36, 32, '#f27a9f']]) { rect(x, y - 4, 1, 6, LEAF[2]); flowerBlob(x, y - 5, c); }
      board(10, 28, 3, 9, 5, true); board(29, 28, 3, 9, 6, true); rect(12, 30, 18, 2, W6[1]);
      board(8, 22, 26, 7, 7); rect(8, 24, 26, 1, W6[1]);
      rect(9, 14, 24, 9, W6[0]); rect(10, 15, 22, 7, '#e0b25a'); rect(10, 15, 22, 1, '#f4d286'); rect(10, 18, 22, 1, '#b88437'); rect(10, 21, 22, 1, '#b88437'); grain(10, 15, 22, 7, 44, '#c8943c', '#efc874');
      rect(17, 16, 8, 5, '#2a1c10'); rect(18, 17, 6, 4, '#0e0804'); rect(16, 21, 10, 2, W6[3]); rect(16, 21, 10, 1, W6[5]);
      rect(6, 11, 30, 4, W6[0]); rect(7, 12, 28, 2, W6[3]); rect(7, 12, 28, 1, W6[5]);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) { const sx = 10 + i * 5 + (r % 2) * 2 - r * 1, sy = 5 + r * 3; rect(sx, sy, 5, 3, shade(W6[3], (rnd(r, i) - .5) * .2)); rect(sx, sy + 2, 5, 1, W6[1]); }
      rect(14, 2, 14, 3, W6[0]); rect(16, 0, 10, 3, W6[0]); rect(17, 1, 8, 1, W6[4]); rect(21, -1, 1, 1, W6[0]); return;
    }
    if (type === 'well') {
      ellipse(21, 33, 15, 6, STONE[0]); rect(6, 24, 30, 10, STONE[0]);
      for (let y = 25; y < 34; y += 4) for (let x = 7 + (y % 8 ? 0 : 4); x < 35; x += 8) { rect(x, y, 7, 3, STONE[2]); rect(x, y, 7, 1, STONE[3]); rect(x, y + 2, 7, 1, STONE[1]); }
      ellipse(21, 25, 14, 5, STONE[0]); ellipse(21, 25, 13, 4, STONE[2]); ellipse(21, 25, 10, 3, '#0f4f69'); ellipse(21, 25, 9, 2, WATER[3]); rect(15, 25, 5, 1, WATER[6]);
      rect(7, 28, 3, 1, '#5e9a3a'); rect(30, 31, 4, 1, '#5e9a3a');
      board(7, 7, 4, 19, 8, true); board(31, 7, 4, 19, 9, true); board(18, 11, 6, 3, 10); rect(20, 14, 2, 9, '#e8d3a0'); rect(17, 22, 8, 5, W6[0]); rect(18, 22, 6, 4, W6[3]); rect(18, 22, 6, 1, W6[5]);
      tileRoofSmall(); return;
    }
    if (type === 'sprinkler') {
      ellipse(21, 37, 6, 2, STONE[0]); rect(19, 16, 5, 22, '#3a4852'); rect(20, 16, 2, 22, '#8aa0ae'); rect(16, 28, 11, 4, '#33566e'); rect(17, 29, 9, 2, '#6aa4c8');
      rect(12, 10, 19, 6, '#33566e'); rect(13, 11, 17, 4, '#6aa4c8'); rect(14, 11, 6, 1, '#b4d8f0'); rect(18, 6, 7, 5, '#33566e'); rect(19, 7, 5, 3, '#8aa0ae'); rect(14, 13, 2, 1, '#1a3a52'); rect(27, 13, 2, 1, '#1a3a52'); return;
    }
  }
  function tileRoofSmall() {
    for (let r = 0; r < 6; r++) { const yy = 3 + r * 2, half = 6 + r * 3; for (let x = 21 - half; x <= 21 + half; x += 4) { rect(x, yy, 4, 2, shade(W6[3], (rnd(r, x) - .5) * .18 + (x < 21 ? .1 : -.06))); rect(x, yy + 1, 4, 1, W6[1]); } }
    rect(8, 14, 26, 2, W6[0]); rect(9, 14, 24, 1, W6[4]); rect(18, 0, 6, 3, W6[0]); rect(19, 1, 4, 1, W6[5]);
  }


  // ---- дикие участки: пока клетка закрыта, на ней живёт своя маленькая жизнь ----
  const MOSS = ['#222c29', '#3c4945', '#5d6f68', '#8a9d93', '#b6c5b8'];
  function tallGrass(x, y, s) { for (let i = 0; i < 10; i++) { const bx = x - 9 + i * 2 + Math.floor(rnd(s, i) * 2), h = 6 + Math.floor(rnd(s, i + 9) * 9), c = GRASS[1 + i % 3]; rect(bx, y - h, 1, h, c); rect(bx + (i % 2 ? 1 : -1), y - h - 1, 1, 2, GRASS[4]); if (i % 3 === 0) { rect(bx, y - h - 3, 1, 3, '#d8c070'); rect(bx - 1, y - h - 2, 1, 1, '#b89a40'); } } }
  function boulder(x, y, s) { shadow(x + 1, y + 3, 11, 3, .34); blob(x, y - 4, 10, 7, MOSS, s); rect(x - 5, y - 10, 7, 1, '#6aa844'); rect(x - 3, y - 11, 4, 1, '#8ac85a'); rect(x + 2, y - 3, 1, 4, MOSS[0]); rect(x + 3, y + 1, 2, 1, MOSS[0]); tuft(x - 11, y + 1); tuft(x + 9, y + 2); }
  function stump(x, y, s) { shadow(x, y + 3, 9, 3, .34); rect(x - 7, y - 8, 14, 11, W6[0]); rect(x - 6, y - 8, 12, 10, W6[2]); grain(x - 6, y - 8, 12, 10, s + 5, W6[1], W6[3], true); rect(x - 6, y - 8, 3, 10, W6[3]); rect(x - 8, y + 1, 4, 3, W6[1]); rect(x + 5, y + 1, 4, 3, W6[1]); ellipse(x, y - 9, 7, 3, W6[0]); ellipse(x, y - 9, 6, 2, '#dcb878'); ellipse(x, y - 9, 3, 1, '#b88a48'); rect(x, y - 9, 1, 1, '#8a5a28'); rect(x - 5, y - 10, 4, 1, '#f0d8a0'); rect(x + 6, y - 2, 4, 3, '#f1e6cf'); rect(x + 6, y - 4, 5, 2, '#d8443a'); rect(x + 7, y - 4, 1, 1, '#fff'); }
  function berryBush(x, y, s) { shadow(x, y + 2, 12, 3, .3); blob(x, y - 6, 11, 8, CANOPY, s); for (let i = 0; i < 9; i++) { const bx = x - 8 + rnd(s, i) * 16, by = y - 11 + rnd(s, i + 9) * 11, c = s % 2 ? '#d8344a' : '#4a58c0'; rect(bx, by, 2, 2, shade(c, -.4)); rect(bx, by, 2, 1, c); rect(bx, by, 1, 1, shade(c, .5)); } }
  function mushrooms(x, y, s) { shadow(x, y + 2, 9, 2, .3); [[-5, 1, 5, '#d8443a', 1], [2, 0, 6, '#e8604a', 1], [7, 2, 4, '#c8884a', 0]].forEach(([dx, dy, w, c, dots]) => { rect(x + dx + Math.floor(w / 2) - 1, y + dy - 3, 2, 4, '#f1e6cf'); ellipse(x + dx + Math.floor(w / 2), y + dy - 4, Math.ceil(w / 2) + 1, 2, shade(c, -.35)); ellipse(x + dx + Math.floor(w / 2), y + dy - 5, Math.ceil(w / 2) + 1, 2, c); rect(x + dx, y + dy - 6, 2, 1, shade(c, .4)); if (dots) { rect(x + dx + 2, y + dy - 6, 1, 1, '#fff'); rect(x + dx + 4, y + dy - 5, 1, 1, '#fff'); } }); }
  function fern(x, y, s) { for (let k = 0; k < 7; k++) { const a = -1.3 + k * .43; for (let tt = 0; tt < 13; tt++) { const fx = x + Math.sin(a) * tt * .85, fy = y - Math.cos(a) * tt * .75 + tt * tt * .012; rect(fx, fy, 1, 1, GRASS[1]); if (tt % 2 === 0 && tt > 2) { rect(fx - 1, fy + 1, 1, 1, GRASS[4]); rect(fx + 1, fy + 1, 1, 1, GRASS[3]); } } } }
  function flowerPatch(x, y, s) { const hue = BLOOM[1 + Math.floor(rnd(s, 3) * 6)]; for (let i = 0; i < 8; i++) { const fx = x - 10 + rnd(s, i + 20) * 20, fy = y - 6 + rnd(s, i + 30) * 12; rect(fx - 1, fy + 1, 3, 2, GRASS[2]); i % 3 === 0 ? daisy(Math.round(fx), Math.round(fy)) : flower(fx, fy, i % 2 ? hue : BLOOM[(i + 2) % BLOOM.length]); } }
  function fallenLog(x, y, s) { shadow(x, y + 3, 13, 3, .34); rect(x - 13, y - 6, 26, 9, W6[0]); rect(x - 12, y - 5, 24, 7, W6[2]); grain(x - 12, y - 5, 24, 7, s + 8, W6[1], W6[3]); rect(x - 12, y - 5, 24, 1, W6[4]); rect(x - 12, y + 1, 24, 1, W6[1]); ellipse(x - 13, y - 2, 3, 4, W6[0]); ellipse(x - 13, y - 2, 2, 3, '#dcb878'); rect(x - 13, y - 2, 1, 1, '#8a5a28'); rect(x - 4, y - 8, 3, 3, W6[2]); rect(x + 3, y - 6, 8, 1, '#6aa844'); rect(x + 4, y - 7, 4, 1, '#8ac85a'); }
  function wildCell(px, py, s) {
    for (let i = 0; i < 4; i++) tuft(px + 4 + Math.floor(rnd(s, i) * 34), py + 8 + Math.floor(rnd(s, i + 9) * 28), GRASS[0], GRASS[1], GRASS[4]);
    const kind = Math.floor(rnd(s, 77) * 11), ox = px + 10 + Math.floor(rnd(s, 78) * 20), oy = py + 20 + Math.floor(rnd(s, 79) * 14);
    [tallGrass, tallGrass, boulder, stump, berryBush, mushrooms, fern, flowerPatch, fallenLog, flowerPatch, tallGrass][kind](ox, oy, s);
    for (let i = 0; i < 2; i++) { const fx = px + 4 + rnd(s, i + 20) * 34, fy = py + 6 + rnd(s, i + 30) * 30; i % 2 ? daisy(Math.round(fx), Math.round(fy)) : flower(fx, fy, BLOOM[Math.floor(rnd(s, i + 40) * BLOOM.length)]); }
  }

  // ---- уютные детали по краям поляны ----
  function appleTree(x, y) {
    shadow(x + 4, y + 5, 20, 5, .34); rect(x - 4, y - 18, 8, 24, W6[0]); rect(x - 3, y - 18, 6, 23, W6[2]); grain(x - 3, y - 18, 6, 23, 801, W6[1], W6[3], true); rect(x - 3, y - 18, 2, 23, W6[3]); rect(x - 7, y + 2, 5, 3, W6[1]); rect(x + 3, y + 2, 5, 3, W6[1]);
    blob(x - 8, y - 26, 13, 11, CANOPY, 811); blob(x + 9, y - 25, 13, 11, CANOPY, 812); blob(x, y - 34, 15, 12, CANOPY, 813);
    [[-14, -26], [-6, -20], [4, -24], [12, -29], [-2, -36], [10, -19], [-9, -34], [16, -24], [0, -28]].forEach(([dx, dy]) => { rect(x + dx, y + dy, 3, 3, '#7a1418'); rect(x + dx, y + dy, 3, 2, '#d8302c'); rect(x + dx, y + dy, 1, 1, '#ff9a8a'); rect(x + dx + 1, y + dy - 1, 1, 1, '#2a5a1a'); });
    [[-10, 4], [8, 6], [-4, 7]].forEach(([dx, dy]) => { rect(x + dx, y + dy, 3, 3, '#7a1418'); rect(x + dx, y + dy, 3, 2, '#d8302c'); rect(x + dx, y + dy, 1, 1, '#ff9a8a'); });
    tuft(x - 14, y + 3); tuft(x + 14, y + 4);
  }
  function arbor(x, y) {
    shadow(x + 12, y + 44, 16, 3, .3);
    board(x, y + 4, 5, 40, 1, true); board(x + 24, y + 4, 5, 40, 2, true); board(x - 2, y, 33, 5, 3);
    rect(x + 3, y - 5, 23, 3, W6[0]); rect(x + 5, y - 7, 19, 3, W6[0]); rect(x + 4, y - 4, 21, 1, W6[3]); rect(x + 7, y - 6, 15, 1, W6[3]); rect(x + 10, y - 9, 9, 3, W6[0]); rect(x + 11, y - 8, 7, 1, W6[3]);
    for (let i = 0; i < 9; i++) blob(x + 1 + (i % 2) * 3, y + 6 + i * 4, 4, 4, CANOPY, 820 + i); for (let i = 0; i < 9; i++) blob(x + 27 - (i % 2) * 3, y + 6 + i * 4, 4, 4, CANOPY, 830 + i);
    for (let i = 0; i < 7; i++) blob(x + 3 + i * 3.6, y + 1 + (i % 2), 4, 3, CANOPY, 840 + i);
    for (let i = 0; i < 16; i++) { const rx = i < 4 ? x + 3 + i * 7 : i < 10 ? x - 1 + (i % 2) * 5 : x + 26 + (i % 2) * 5, ry = i < 4 ? y - 1 : y + 6 + (i * 5) % 34, c = i % 3 ? '#e84a78' : '#ff9ab8'; rect(rx, ry, 3, 3, shade(c, -.4)); rect(rx, ry, 3, 2, c); rect(rx, ry, 1, 1, shade(c, .5)); }
    for (let i = 0; i < 5; i++) { stone(x + 8 + (i % 2) * 5, y + 46 + i * 5, 9, 4); }
  }
  function picnic(x, y) {
    shadow(x + 20, y + 14, 24, 4, .26);
    for (let j = 0; j < 17; j++) { const off = Math.round((17 - j) * .25); for (let i = 0; i < 40; i++) { const chk = (Math.floor(i / 4) + Math.floor(j / 4)) % 2; rect(x + off + i, y + j, 1, 1, chk ? '#f4ecd8' : '#cf3d3a'); } }
    rect(x + 4, y + 17, 40, 1, '#8a2420');
    rect(x + 6, y + 3, 15, 10, W6[0]); rect(x + 7, y + 4, 13, 8, '#b98648'); rect(x + 7, y + 4, 13, 2, '#d8a864'); rect(x + 6, y + 2, 15, 2, W6[2]); rect(x + 9, y - 3, 2, 6, W6[1]); rect(x + 16, y - 3, 2, 6, W6[1]); rect(x + 9, y - 4, 9, 2, W6[2]); rect(x + 9, y + 6, 3, 3, '#f4ecd8'); rect(x + 14, y + 7, 3, 3, '#d8302c');
    rect(x + 26, y + 6, 8, 7, '#e8e0cc'); rect(x + 26, y + 6, 8, 1, '#fff'); rect(x + 34, y + 8, 3, 3, '#e8e0cc'); rect(x + 28, y + 3, 4, 3, '#e8e0cc'); rect(x + 38, y + 10, 3, 3, '#c04a38'); rect(x + 38, y + 10, 3, 1, '#f08a7a'); ellipse(x + 3, y + 10, 3, 2, '#d8302c'); ellipse(x + 3, y + 10, 2, 1, '#ff8a7a');
  }
  function wheelbarrow(x, y) {
    shadow(x + 8, y + 12, 14, 3, .3); rect(x, y, 22, 4, W6[0]); rect(x + 1, y - 7, 20, 9, '#2a2622'); rect(x + 2, y - 6, 18, 8, '#4a5a5a'); rect(x + 2, y - 6, 18, 2, '#7a8a8a'); rect(x + 18, y + 2, 12, 2, W6[0]); rect(x + 19, y + 2, 11, 1, W6[3]);
    ellipse(x + 4, y + 9, 4, 4, '#1c1c20'); ellipse(x + 4, y + 9, 3, 3, '#4a4a52'); ellipse(x + 4, y + 9, 1, 1, '#9a9aa2'); rect(x + 8, y + 2, 2, 8, W6[1]);
    ellipse(x + 11, y - 7, 9, 3, '#3b2616'); for (let i = 0; i < 6; i++) { rect(x + 5 + i * 3, y - 11 + (i % 2) * 2, 1, 5, LEAF[2]); i % 2 ? daisy(x + 5 + i * 3, y - 12 + (i % 2) * 2) : flower(x + 5 + i * 3, y - 11, ['#f27a9f', '#ffd84a', '#b08be0'][i % 3]); }
  }
  function birdhouse(x, y) {
    shadow(x + 1, y + 24, 5, 2, .3); rect(x, y, 3, 25, W6[0]); rect(x + 1, y + 1, 1, 24, W6[3]); rect(x - 7, y - 14, 17, 14, W6[0]); rect(x - 6, y - 13, 15, 12, '#b57e44'); rect(x - 6, y - 13, 15, 2, '#d8a864'); rect(x - 1, y - 10, 5, 5, '#1c1008'); rect(x - 1, y - 4, 5, 2, W6[1]);
    rect(x - 9, y - 18, 21, 5, W6[0]); rect(x - 8, y - 17, 19, 3, '#c4502f'); rect(x - 8, y - 17, 19, 1, '#e2683f'); rect(x - 5, y - 21, 13, 4, W6[0]); rect(x - 4, y - 20, 11, 2, '#c4502f');
    rect(x + 6, y - 22, 4, 3, '#3a7ad0'); rect(x + 7, y - 24, 3, 3, '#5a9af0'); rect(x + 10, y - 23, 2, 1, '#f0a020'); rect(x + 7, y - 23, 1, 1, '#111'); rect(x + 3, y - 20, 4, 1, '#2a5aa0');
  }
  function coop(x, y) {
    shadow(x + 18, y + 28, 22, 3, .32);
    rect(x, y + 6, 34, 22, W6[0]); for (let i = 0; i < 7; i++) { rect(x + 1 + i * 5, y + 7, 4, 20, i % 2 ? '#b78a56' : '#a6783f'); rect(x + 1 + i * 5, y + 7, 1, 20, W6[4]); }
    rect(x + 6, y + 16, 9, 12, '#2a1c10'); rect(x + 7, y + 17, 7, 11, '#14100a'); rect(x + 4, y + 28, 13, 2, W6[2]); for (let i = 0; i < 4; i++) rect(x + 5 + i * 3, y + 24 + i % 2, 2, 5, W6[3]);
    rect(x + 20, y + 12, 10, 8, W6[0]); rect(x + 21, y + 13, 8, 6, '#79b7cf'); rect(x + 24, y + 13, 1, 6, W6[2]);
    rect(x - 3, y + 2, 40, 6, W6[0]); rect(x - 2, y + 3, 38, 3, '#c4502f'); rect(x - 2, y + 3, 38, 1, '#e2683f'); rect(x + 3, y - 2, 28, 5, W6[0]); rect(x + 4, y - 1, 26, 3, '#b8442a'); rect(x + 4, y - 1, 26, 1, '#e2683f');
    rect(x + 27, y + 24, 10, 1, W6[0]); rect(x + 31, y + 25, 1, 4, W6[0]); for (let i = 0; i < 3; i++) rect(x + 28 + i * 3, y + 29, 2, 1, '#e6c45a');
  }
  function flowerRow(x, y, w, seed) { board(x, y + 3, w, 4, seed); for (let i = 0; i < w; i += 3) { rect(x + i, y - 1, 3, 4, LEAF[2]); rect(x + i, y - 1, 3, 1, LEAF[4]); i % 6 ? flower(x + i + 1, y - 1, BLOOM[(i / 3 | 0) % BLOOM.length]) : daisy(x + i + 1, y - 2); } }

  function lightRays(g) {
    withCtx(g, () => {
      for (let i = 0; i < 7; i++) {
        const x0 = 20 + i * 88 + rnd(i, 3) * 20, w = 18 + rnd(i, 4) * 26, sk = 150 + rnd(i, 5) * 60;
        const gr = g.createLinearGradient(x0, 0, x0 + sk * .5, H * .8); gr.addColorStop(0, 'rgba(255,244,170,.11)'); gr.addColorStop(.55, 'rgba(255,244,170,.04)'); gr.addColorStop(1, 'rgba(255,244,170,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w, 0); g.lineTo(x0 + w + sk, H); g.lineTo(x0 + sk * .55, H); g.closePath(); g.fill();
      }
      const sun = g.createRadialGradient(40, 0, 4, 40, 0, 190); sun.addColorStop(0, 'rgba(255,240,170,.16)'); sun.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 34; i++) { const x = rnd(i, 61) * W, y = rnd(i, 62) * H; if (inGrid(x, y, 0)) continue; if (x < 80 || x > 440 || y < 60 || y > 330) continue; g.fillStyle = 'rgba(255,248,190,.10)'; g.beginPath(); g.ellipse(x, y, 6 + rnd(i, 63) * 9, 3 + rnd(i, 64) * 4, .3, 0, 6.283); g.fill(); }
      const vg = g.createRadialGradient(W / 2, H / 2, H * .38, W / 2, H / 2, H * .95); vg.addColorStop(0, 'rgba(10,30,20,0)'); vg.addColorStop(1, 'rgba(10,30,20,.38)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    });
  }

  function buildBg() {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    waterSpots.length = 0; lights.length = 0; smokeAt.length = 0;
    paintGround(g);
    const cd = (fn, o) => castDraw(g, fn, o);
    withCtx(g, () => {
      meadow();
      cd(treeRing, { len: 10, dx: .9, dy: .85, a: .4 });
      cd(house, { len: 12, dx: 1, dy: .45, a: .36 });
    });
    lightRays(g);
    return c;
  }
  function drawSpriteAt(type, x, y, k = 1) { cx.imageSmoothingEnabled = false; cx.drawImage(sprImg(type), Math.round(x), Math.round(y), Math.round(28 * k), Math.round(28 * k)); }

