  // ---- вода ----
  function pondShape(px, py, rx, ry, seed, withStones = true) {
    ellipse(px, py + 2, rx + 5, ry + 5, GRASS[0]); ellipse(px, py, rx + 4, ry + 4, '#3d7a22');
    for (let yy = -ry - 1; yy <= ry + 1; yy++) {
      const wob = 1 + .07 * Math.sin(yy * .7 + seed), half = Math.round(rx * Math.sqrt(Math.max(0, 1 - yy * yy / (ry * ry + .01))) * wob);
      for (let xx = -half; xx <= half; xx++) {
        const wx = px + xx, wy = py + yy, d = Math.hypot(xx / (rx * wob), yy / ry);
        let v = .78 - d * .5 - (yy / ry) * .12 - (xx / rx) * .06 + Math.sin(wx * .55 + wy * .9 + seed) * .05 + (noise2(wx, wy, 7, seed) - .5) * .22;
        if (d > .84) v -= .22;
        rect(wx, wy, 1, 1, dither(wx, wy, v, WATER));
      }
    }
    for (let i = 0; i < 9; i++) { const w = 3 + Math.floor(rnd(seed, i) * 8), sx = px - rx * .65 + rnd(seed, i + 9) * rx * 1.2, sy = py - ry * .7 + rnd(seed, i + 19) * ry * 1.3; if (Math.hypot((sx - px) / rx, (sy - py) / ry) < .72) { rect(sx, sy, w, 1, WATER[5]); rect(sx + 1, sy + 1, Math.max(1, w - 3), 1, WATER[4]); } }
    if (withStones) for (let a = 0; a < 6.283; a += .15) {
      const k = Math.floor(a * 20), rr = 1 + (rnd(seed + 5, k) - .5) * .13, w = 5 + Math.floor(rnd(seed + 3, k) * 4);
      mossStone(Math.round(px + Math.cos(a) * (rx + 2) * rr - w / 2), Math.round(py + Math.sin(a) * (ry + 2) * rr - 2), w, 4 + (rnd(seed + 8, k) < .3 ? 1 : 0), rnd(seed + 6, k) < .45);
    }
    for (let i = 0; i < 8; i++) waterSpots.push({ x: Math.round(px + (rnd(seed, i + 40) - .5) * rx * 1.3), y: Math.round(py + (rnd(seed, i + 50) - .5) * ry * 1.1), k: i });
  }
  function lily(x, y, bloom) {
    ellipse(x, y + 1, 5, 3, WATER[0]); ellipse(x, y, 5, 3, LEAF[0]); ellipse(x, y, 4, 2, LEAF[2]); rect(x - 3, y - 1, 4, 1, LEAF[3]); rect(x - 1, y, 5, 1, LEAF[1]); rect(x + 1, y - 2, 5, 1, WATER[3]); rect(x + 2, y - 1, 3, 1, WATER[3]);
    rect(x - 1, y - 1, 1, 1, LEAF[4]);
    if (bloom) { rect(x - 2, y - 4, 5, 5, '#a8446a'); rect(x - 1, y - 5, 3, 1, '#d36a92'); rect(x - 2, y - 3, 5, 3, '#f7a8c6'); rect(x - 1, y - 4, 3, 1, '#ffd6e6'); rect(x - 1, y - 3, 3, 2, '#fff2f8'); rect(x, y - 3, 1, 1, '#ffd23a'); }
  }
  function reeds(x, y, n, seed) {
    for (let i = 0; i < n; i++) {
      const rx0 = x + i * 3 + Math.floor(rnd(seed, i) * 3), h = 10 + Math.floor(rnd(seed, i + 9) * 8);
      rect(rx0, y - h, 1, h, LEAF[1]); rect(rx0 + 1, y - h + 4, 1, h - 4, LEAF[2]);
      if (rnd(seed, i + 19) < .6) { rect(rx0 - 1, y - h - 4, 3, 6, '#4a2a14'); rect(rx0, y - h - 4, 1, 5, '#8a5a30'); rect(rx0, y - h - 6, 1, 2, '#c8b080'); }
      else { rect(rx0 - 2, y - 6, 2, 1, LEAF[3]); rect(rx0 + 2, y - 9, 2, 1, LEAF[3]); }
    }
  }
  function dockV(x, y, w, h) {
    for (let j = 0; j < h; j += 4) { board(x, y + j, w, 4, j); }
    [[x - 2, y + h - 8], [x + w - 3, y + h - 8], [x - 2, y + 1], [x + w - 3, y + 1]].forEach(([px, py]) => { rect(px, py, 5, 11, W6[0]); rect(px + 1, py + 1, 3, 9, W6[3]); rect(px + 1, py + 1, 3, 2, W6[5]); rect(px + 3, py + 3, 1, 7, W6[2]); });
    rect(x + 2, y + 6, 1, 1, '#d8d8d8'); rect(x + w - 3, y + 14, 1, 1, '#d8d8d8');
    rect(x - 5, y + h + 3, w + 10, 1, WATER[5]); rect(x - 2, y + h + 5, w + 4, 1, WATER[4]);
  }
  function stream() {
    const edge = x => Math.round((30 + 4 * Math.sin(x / 15) + (x - 262) * .05) * Math.max(0, Math.min(1, (x - 262) / 12, (470 - x) / 16)));
    for (let x = 262; x <= 470; x++) {
      const yb = edge(x); if (yb < 2) continue;
      rect(x, 0, 1, yb + 4, GRASS[0]); rect(x, 0, 1, yb + 2, '#3d7a22');
      for (let y = 0; y < yb; y++) { let v = .72 - (y / yb) * .15 - ((yb - y) < 5 ? .25 : 0) + Math.sin(x * .3 + y * .7) * .06 + (noise2(x, y, 6, 4) - .5) * .25; rect(x, y, 1, 1, dither(x, y, v, WATER)); }
      if (x % 29 === 0) { waterSpots.push({ x, y: Math.max(2, yb - 9), k: x }); rect(x + 2, 6 + rnd(x, 3) * 12, 7, 1, WATER[5]); rect(x + 4, 8 + rnd(x, 4) * 10, 5, 1, WATER[6]); }
    }
    for (let x = 268; x < 468; x += 7 + Math.floor(rnd(x, 5) * 4)) { const yb = edge(x); if (yb > 3) mossStone(x, yb, 6 + Math.floor(rnd(x, 6) * 4), 5, rnd(x, 7) < .5); }
    reeds(300, 41, 3, 5); reeds(420, 40, 4, 8); reeds(272, 31, 2, 2);
    for (let y = 4; y < 46; y += 4) board(334, y, 36, 4, y);
    [[331, 1], [366, 1], [331, 38], [366, 38]].forEach(([px, py]) => { rect(px, py, 6, 12, W6[0]); rect(px + 1, py + 1, 4, 10, W6[3]); rect(px + 1, py + 1, 4, 2, W6[5]); rect(px + 4, py + 3, 1, 8, W6[2]); });
    rect(332, 14, 2, 1, '#d8d8d8'); rect(364, 14, 2, 1, '#d8d8d8'); rect(364, 47, 14, 2, 'rgba(10,40,60,.35)');
  }
  function pathDirt() {
    const PAL = ['#a97c40', '#bf9150', '#d3a85f', '#e3bd75', '#efd28f', '#f7e3ac'];
    for (let y = 284; y <= H + 2; y++) {
      const t = (y - 286) / 98, c = Math.round(474 + t * 58 + 5 * Math.sin(t * 3.2)), taper = Math.min(1, (y - 282) / 9), hw = Math.round((9 + t * 15) * taper + rnd(y, 3) * 2);
      for (let x = c - hw - 2; x <= c + hw + 2; x++) {
        const d = Math.abs(x - c) / (hw + 2), v = .78 - d * .6 + (noise2(x, y, 5, 6) - .5) * .35;
        rect(x, y, 1, 1, dither(x, y, v, PAL));
      }
      if (rnd(y, 9) < .25) rect(c - hw + 3 + rnd(y, 4) * hw * 1.6, y, 2, 1, PAL[0]);
      if (rnd(y, 10) < .12) rect(c + rnd(y, 11) * hw - 3, y, 1, 1, PAL[5]);
      if (rnd(y, 12) < .22) tuft(c - hw - 3 - Math.floor(rnd(y, 13) * 3), y, GRASS[1], GRASS[3], GRASS[5]);
      if (rnd(y, 14) < .2) tuft(c + hw + 2 + Math.floor(rnd(y, 15) * 3), y, GRASS[1], GRASS[3], GRASS[5]);
    }
    for (let i = 0; i < 6; i++) { const y = 306 + i * 14, c = Math.round(474 + ((y - 286) / 98) * 58); rect(c - 6 + (i % 2) * 9, y, 2, 3, PAL[1]); rect(c - 3 + (i % 2) * 9, y + 4, 2, 3, PAL[1]); }
    for (let i = 0; i < 12; i++) { const y = 296 + Math.floor(rnd(i, 70) * 86), c = Math.round(474 + ((y - 286) / 98) * 58); stone(c - 10 + Math.floor(rnd(i, 71) * 20), y, 3, 2); }
  }

  // ---- постройки ----
  function tileRoof(y0, y1, tl, tr, bl, br, base) {
    const rowH = 5;
    for (let r = 0, y = y0; y <= y1; r++, y += rowH) {
      for (let py = y; py < Math.min(y + rowH, y1 + 1); py++) {
        const t = (py - y0) / (y1 - y0), xl = Math.round(tl + (bl - tl) * t), xr = Math.round(tr + (br - tr) * t), mid = (xl + xr) / 2, off = (r % 2) * 3;
        for (let tx = xl - off - 6, i = 0; tx <= xr; tx += 7, i++) {
          const a = Math.max(tx, xl), b = Math.min(tx + 6, xr); if (b < a) continue;
          let k = (rnd(r * 13 + i, y) - .5) * .22 + (tx < mid ? .12 : -.08) + (noise2(a + i * 3, py, 4, r) - .5) * .16;
          let col = shade(base, k);
          if (py === y) col = shade(col, .22); else if (py >= y + rowH - 1) col = shade(col, -.45); else if (py === y + rowH - 2) col = shade(col, -.2);
          rect(a, py, b - a + 1, 1, col);
          if (tx >= xl && tx <= xr) rect(tx, py, 1, 1, shade(col, -.3));
        }
        rect(xl, py, 1, 1, shade(base, -.6)); rect(xr, py, 1, 1, shade(base, -.6));
      }
    }
  }
  function ivy(x, y, h, seed) { for (let i = 0; i < h; i += 3) { blob(x + Math.round((rnd(seed, i) - .5) * 4), y + i, 3, 3, CANOPY, seed + i); if (rnd(seed, i + 5) < .35) rect(x + 2, y + i, 1, 1, '#f27a9f'); } }
  function house() {
    shadow(90, 97, 60, 4, .34);
    rect(44, 44, 88, 52, W8[0]);
    for (let yy = 45; yy < 95; yy++) for (let xx = 45; xx < 131; xx++) rect(xx, yy, 1, 1, dither(xx, yy, .64 + (noise2(xx, yy, 6, 9) - .5) * .5 - (yy - 45) / 50 * .14 + (rnd(xx, yy) - .5) * .12, PLASTER));
    rect(45, 45, 86, 3, W6[2]); rect(45, 66, 86, 2, W6[2]); [45, 72, 100, 129].forEach((x, i) => { rect(x, 45, 3, 48, W6[2]); rect(x, 45, 1, 48, W6[4]); grain(x, 45, 3, 48, 200 + i, W6[1], W6[3], true); });
    rect(46, 48, 84, 1, 'rgba(60,35,15,.25)');
    stoneWall(45, 84, 86, 11, 7);
    [[53, 50], [105, 50]].forEach(([x, y], n) => {
      rect(x - 4, y - 1, 4, 17, '#3f7f86'); rect(x - 3, y, 2, 15, '#58a3a8'); rect(x + 16, y - 1, 4, 17, '#3f7f86'); rect(x + 17, y, 2, 15, '#58a3a8');
      rect(x - 1, y - 1, 18, 16, W6[0]); rect(x, y, 16, 14, '#79b7cf');
      for (let j = 0; j < 14; j++) rect(x, y + j, 16, 1, dither(x, y + j, .35 + j / 14 * .5, ['#4f8aa4', '#6aa8c2', '#8cc8dc', '#b4e0ee']));
      rect(x + 1, y + 1, 4, 3, '#e6f6fb'); rect(x + 7, y, 2, 14, '#ead6a6'); rect(x, y + 6, 16, 2, '#ead6a6');
      rect(x, y, 3, 8, '#f4e6e0'); rect(x + 1, y, 1, 8, '#fff6f0'); rect(x + 13, y, 3, 8, '#f4e6e0'); rect(x + 14, y, 1, 8, '#fff6f0');
      lights.push({ x, y, w: 16, h: 14 });
      board(x - 4, y + 15, 24, 6, n); rect(x - 3, y + 19, 22, 1, W6[1]);
      for (let i = 0; i < 6; i++) { const c = ['#f27a9f', '#ffd84a', '#ffffff', '#e8524a', '#b08be0', '#ff9a52'][i]; rect(x - 3 + i * 4, y + 12, 4, 4, LEAF[2]); rect(x - 3 + i * 4, y + 12, 4, 1, LEAF[4]); flower(x - 2 + i * 4, y + 12, c); }
    });
    rect(76, 61, 22, 34, W6[0]); rect(77, 62, 20, 33, W6[3]); for (let x = 80; x < 96; x += 5) rect(x, 67, 1, 28, W6[1]); grain(77, 62, 20, 33, 321, W6[2], W6[4], true);
    rect(77, 62, 20, 2, W6[5]); rect(80, 64, 14, 10, W6[0]); rect(81, 65, 12, 8, '#79b7cf'); rect(82, 66, 3, 3, '#e6f6fb'); rect(86, 65, 2, 8, W6[3]); rect(81, 69, 12, 1, W6[3]);
    rect(78, 76, 4, 1, '#3a3a3a'); rect(78, 87, 4, 1, '#3a3a3a'); rect(92, 82, 2, 3, '#f0c040'); rect(92, 82, 1, 1, '#fff2a0');
    lights.push({ x: 81, y: 65, w: 12, h: 8 });
    rect(72, 94, 30, 5, STONE[0]); rect(73, 95, 28, 3, STONE[2]); rect(73, 95, 28, 1, STONE[3]); rect(76, 99, 22, 3, '#7a4c28'); rect(77, 99, 20, 2, '#a06c3c'); rect(79, 99, 16, 1, '#c58f55');
    ellipse(72, 91, 4, 3, W6[0]); rect(69, 88, 7, 6, W6[3]); rect(69, 88, 7, 1, W6[5]); ellipse(72, 87, 4, 2, LEAF[2]); flower(70, 86, '#f27a9f'); flower(74, 85, '#ffd84a');
    ellipse(103, 91, 4, 3, W6[0]); rect(100, 88, 7, 6, W6[3]); rect(100, 88, 7, 1, W6[5]); ellipse(103, 87, 4, 2, LEAF[2]); flower(101, 85, '#ffffff'); flower(105, 86, '#e8524a');
    ivy(46, 52, 36, 11); ivy(129, 60, 24, 17);
    tileRoof(2, 44, 52, 120, 28, 144, '#c4502f');
    rect(24, 43, 124, 4, '#4e1c16'); rect(25, 43, 122, 1, '#e2683f'); rect(25, 46, 122, 1, '#3a120e'); rect(44, 47, 88, 3, 'rgba(40,25,10,.4)'); rect(44, 50, 88, 2, 'rgba(40,25,10,.18)');
    rect(52, 0, 66, 2, '#f08a5c'); rect(52, 2, 66, 1, '#7c2b1f');
    for (let i = 0; i < 6; i++) { const mx = 34 + rnd(i, 41) * 100, my = 8 + rnd(i, 42) * 30; if (mx > 56 && mx < 118 || my > 20) rect(mx, my, 3, 1, '#6d9a3e'); }
    stoneWall(64, -2, 20, 22, 13, false); rect(62, -2, 24, 4, STONE6[1]); rect(63, -2, 22, 1, STONE6[4]); rect(66, 2, 16, 1, '#1a1816');
    smokeAt.push({ x: 74, y: -2 });
  }
  function shed() {
    shadow(502, 85, 52, 4, .34);
    rect(464, 40, 80, 44, W6[0]); for (let x = 465, i = 0; x < 543; x += 5, i++) { rect(x, 41, 4, 42, i % 2 ? W6[3] : '#b47c42'); rect(x, 41, 1, 42, W6[4]); rect(x + 4, 41, 1, 42, W6[1]); grain(x, 41, 4, 42, 90 + i, W6[2], W6[4], true); if (i % 4 === 1) { rect(x + 1, 55 + (i % 3) * 8, 2, 2, W6[1]); } }
    rect(464, 40, 80, 3, W6[1]); rect(464, 80, 80, 4, 'rgba(60,40,10,.3)');
    rect(475, 52, 20, 33, W6[0]); rect(476, 53, 18, 32, W6[2]); for (let x = 479; x < 494; x += 4) rect(x, 53, 1, 32, W6[1]); rect(476, 53, 18, 2, W6[4]);
    rect(479, 56, 12, 9, W6[0]); rect(480, 57, 10, 7, '#79b7cf'); rect(481, 58, 3, 3, '#e6f6fb'); rect(485, 57, 1, 7, W6[2]); rect(477, 60, 4, 1, '#3a3a3a'); rect(477, 76, 4, 1, '#3a3a3a'); rect(489, 71, 2, 3, '#f0c040'); lights.push({ x: 480, y: 57, w: 10, h: 7 });
    rect(504, 49, 22, 17, W6[0]); rect(505, 50, 20, 15, '#79b7cf'); for (let j = 0; j < 15; j++) rect(505, 50 + j, 20, 1, dither(505, 50 + j, .35 + j / 15 * .5, ['#4f8aa4', '#6aa8c2', '#8cc8dc', '#b4e0ee'])); rect(506, 51, 4, 3, '#e6f6fb'); rect(514, 50, 2, 15, '#d8c28a'); rect(505, 56, 20, 2, '#d8c28a'); lights.push({ x: 505, y: 50, w: 20, h: 15 });
    board(501, 66, 28, 6, 4); for (let i = 0; i < 7; i++) { rect(502 + i * 4, 62, 4, 4, LEAF[2]); rect(502 + i * 4, 62, 4, 1, LEAF[4]); flower(503 + i * 4, 63, ['#ffffff', '#f27a9f', '#ffd84a', '#b08be0', '#ffffff', '#f27a9f', '#e8524a'][i]); }
    tileRoof(2, 40, 474, 534, 456, 552, '#3a7549');
    rect(452, 38, 108, 4, '#16341f'); rect(453, 38, 106, 1, '#7ac078'); rect(453, 41, 106, 1, '#0e2415'); rect(453, 42, 106, 3, 'rgba(10,30,15,.4)'); rect(474, 0, 62, 2, '#8fd08a');
    for (let i = 0; i < 6; i++) rect(462 + rnd(i, 51) * 84, 8 + rnd(i, 52) * 28, 4, 1, '#7ab84a');
    rect(443, 58, 15, 22, W6[0]); rect(444, 59, 13, 20, W6[3]); rect(444, 59, 4, 20, W6[4]); rect(444, 64, 13, 1, W6[0]); rect(444, 74, 13, 1, W6[0]); rect(444, 65, 13, 1, W6[5]); grain(444, 59, 13, 20, 77, W6[2], W6[4], true); ellipse(450, 58, 7, 3, '#2a1a0e'); ellipse(450, 58, 6, 2, '#1f7da6');
    // поленница
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) { const lx = 458 + c * 6 + r * 3, ly = 76 - r * 5; ellipse(lx + 3, ly + 2, 3, 3, W6[1]); ellipse(lx + 3, ly + 2, 2, 2, '#d8b070'); rect(lx + 2, ly + 1, 1, 1, W6[3]); }
    [[480, 88], [494, 92], [508, 89], [522, 93]].forEach(([x, y], i) => mossStone(x, y, 11, 5, i % 2 === 0));
    rect(540, 72, 4, 14, W6[0]); clump(548, 80, 12, 9, 71, 8);
  }
  function fenceV(x, y0, y1) {
    board(x + 1, y0 + 2, 3, y1 - y0 - 2, 3, true);
    for (let y = y0, i = 0; y < y1 - 6; y += 15, i++) { board(x - 1, y, 7, 12, 30 + i, true); if (rnd(i, y) < .5) rect(x, y + 11, 2, 1, '#5e9a3a'); tuft(x - 3, y + 12, GRASS[1], GRASS[3], GRASS[6]); }
  }
  function fenceH(x0, x1, y) {
    board(x0, y + 3, x1 - x0, 3, 5); board(x0, y + 9, x1 - x0, 3, 6);
    for (let x = x0, i = 0; x <= x1 - 4; x += 15, i++) { board(x, y, 6, 16, 60 + i, true); rect(x + 2, y + 5, 1, 1, '#d8d8d8'); tuft(x - 2, y + 15, GRASS[1], GRASS[3], GRASS[6]); }
  }
  function scarecrow(x, y) {
    shadow(x + 1, y + 1, 10, 3, .34); rect(x - 6, y - 7, 13, 9, W6[0]); rect(x - 5, y - 6, 11, 7, W6[3]); rect(x - 5, y - 6, 11, 1, W6[5]); rect(x, y - 6, 1, 7, W6[1]); rect(x - 5, y - 3, 11, 1, W6[2]);
    rect(x - 1, y - 38, 4, 40, W6[0]); rect(x, y - 37, 2, 38, W6[3]); rect(x, y - 37, 1, 38, W6[4]);
    rect(x - 13, y - 29, 28, 5, W6[0]); rect(x - 12, y - 28, 26, 3, W6[3]); rect(x - 12, y - 28, 26, 1, W6[5]);
    rect(x - 8, y - 31, 18, 16, '#2a1c10'); rect(x - 7, y - 30, 16, 14, '#c9b27a'); for (let j = 0; j < 14; j += 2) rect(x - 7, y - 30 + j, 16, 1, '#d8c48a'); rect(x - 7, y - 30, 3, 14, '#e0cb94'); rect(x - 4, y - 25, 6, 6, '#3f6e78'); rect(x - 3, y - 24, 4, 4, '#5b8a8a'); rect(x - 3, y - 22, 4, 1, '#c9b27a'); rect(x - 7, y - 19, 16, 2, '#7a6638'); rect(x + 2, y - 27, 1, 1, '#5a3a20'); rect(x + 5, y - 22, 1, 1, '#5a3a20');
    for (let i = 0; i < 4; i++) { rect(x - 17 + i * 2, y - 27 + i, 4, 2, '#e6c45a'); rect(x + 14 - i, y - 28 + i, 4, 2, '#e6c45a'); rect(x - 16 + i, y - 25 + i, 3, 1, '#c89c30'); }
    for (let i = 0; i < 5; i++) rect(x - 5 + i * 3, y - 16 + (i % 2), 2, 4, '#e6c45a');
    ellipse(x + 1, y - 38, 7, 7, '#2a1c10'); ellipse(x + 1, y - 38, 6, 6, '#ecd09a'); ellipse(x, y - 39, 4, 3, '#f6e0b0'); rect(x - 3, y - 40, 2, 2, '#2a1c10'); rect(x + 2, y - 40, 2, 2, '#2a1c10'); rect(x - 2, y - 34, 1, 1, '#8a4a2a'); rect(x - 1, y - 33, 4, 1, '#8a4a2a'); rect(x + 3, y - 34, 1, 1, '#8a4a2a'); rect(x - 4, y - 37, 1, 1, '#e08a7a'); rect(x + 5, y - 37, 1, 1, '#e08a7a');
    rect(x - 10, y - 43, 23, 3, '#2a1c10'); rect(x - 9, y - 42, 21, 2, '#d6a84a'); rect(x - 9, y - 42, 21, 1, '#f0d070'); rect(x - 6, y - 50, 15, 8, '#2a1c10'); rect(x - 5, y - 49, 13, 7, '#d6a84a'); rect(x - 5, y - 49, 3, 7, '#f0d070'); rect(x - 5, y - 45, 13, 2, '#8a3a2a'); rect(x - 5, y - 45, 13, 1, '#b0503a');
    rect(x + 8, y - 34, 6, 5, '#1c1c24'); rect(x + 9, y - 35, 4, 2, '#2c2c38'); rect(x + 13, y - 33, 2, 1, '#f0a020'); rect(x + 10, y - 33, 1, 1, '#fff');
  }
  function stove() {
    shadow(500, 153, 40, 4, .34);
    board(468, 128, 46, 6, 5); rect(470, 134, 4, 18, W6[0]); rect(471, 134, 2, 17, W6[3]); rect(508, 134, 4, 18, W6[0]); rect(509, 134, 2, 17, W6[3]); rect(472, 140, 38, 2, W6[1]);
    ellipse(480, 125, 9, 4, W6[0]); ellipse(480, 125, 8, 3, W6[3]); ellipse(478, 122, 3, 2, '#b02a1a'); ellipse(478, 122, 2, 1, '#e0402f'); ellipse(484, 122, 3, 2, '#c87010'); ellipse(484, 122, 2, 1, '#f09a32'); rect(479, 118, 3, 2, LEAF[3]); rect(496, 123, 13, 5, '#b8b4a0'); rect(496, 123, 13, 1, '#f5f1e2'); rect(497, 125, 11, 1, '#8a8670');
    stoneWall(509, 112, 32, 22, 21, false);
    for (let yy = -9; yy < 0; yy++) { const half = Math.round(16 * Math.sqrt(1 - yy * yy / 81)); for (let xx = -half; xx <= half; xx++) rect(525 + xx, 112 + yy, 1, 1, dither(525 + xx, 112 + yy, .86 + yy / 9 * .4 - xx / 16 * .1 + (rnd(525 + xx, yy) - .5) * .2, STONE6)); }
    rect(514, 116, 22, 18, STONE6[0]); rect(515, 117, 20, 1, STONE6[4]); rect(516, 118, 18, 15, '#1c1612'); ellipse(525, 118, 9, 3, '#1c1612'); rect(520, 126, 10, 7, '#c8501a'); rect(522, 128, 6, 5, '#f09a32'); rect(523, 130, 4, 3, '#ffd877'); rect(515, 133, 20, 1, STONE[1]);
    stoneWall(530, 92, 12, 22, 23, false); rect(528, 90, 16, 4, STONE6[1]); rect(529, 90, 14, 1, STONE6[5]); rect(531, 92, 10, 1, '#14100c');
    lights.push({ x: 521, y: 126, w: 8, h: 6, fire: true }); smokeAt.push({ x: 536, y: 90 });
    rect(463, 88, 4, 46, W6[0]); rect(464, 89, 2, 44, W6[3]); rect(464, 89, 1, 44, W6[4]); rect(463, 88, 18, 4, W6[0]); rect(464, 89, 16, 1, W6[5]); rect(478, 92, 1, 7, '#e8d3a0');
    rect(474, 99, 9, 12, '#2a1c10'); rect(475, 100, 7, 10, '#ffd877'); rect(477, 101, 2, 6, '#fff6c8'); rect(473, 98, 11, 2, '#3a2a1a'); lights.push({ x: 475, y: 100, w: 7, h: 10, lamp: true });
    board(539, 124, 19, 8, 8); for (let i = 0; i < 5; i++) { rect(540 + i * 4, 119, 4, 5, LEAF[2]); flower(541 + i * 4, 120, ['#ffffff', '#f27a9f', '#ffd84a', '#b08be0', '#ffffff'][i]); }
    for (let i = 0; i < 3; i++) { rect(468 + i * 7, 143 + (i % 2), 6, 3, W6[3]); rect(468 + i * 7, 143 + (i % 2), 6, 1, W6[5]); }
  }
  function benchYard(x, y) {
    shadow(x + 20, y + 25, 23, 3, .34); board(x + 2, y + 14, 4, 11, 3, true); board(x + 34, y + 14, 4, 11, 4, true);
    board(x + 1, y, 38, 4, 5); board(x + 1, y + 5, 38, 3, 6); board(x - 2, y + 9, 44, 6, 7); rect(x - 2, y + 15, 44, 1, 'rgba(40,20,10,.4)'); rect(x - 1, y + 10, 1, 1, '#d8d8d8'); rect(x + 40, y + 10, 1, 1, '#d8d8d8');
    tuft(x - 3, y + 24, GRASS[1], GRASS[3], GRASS[5]); tuft(x + 41, y + 24, GRASS[1], GRASS[3], GRASS[5]);
  }
  function lampPost(x, y) {
    rect(x, y, 4, 34, W6[0]); rect(x + 1, y + 1, 2, 32, W6[3]); rect(x + 1, y + 1, 1, 32, W6[4]);
    rect(x - 5, y - 15, 14, 16, '#2a1c10'); rect(x - 4, y - 14, 12, 14, '#ffd877'); rect(x - 2, y - 13, 4, 9, '#fff6c8'); rect(x + 3, y - 14, 1, 14, '#a8681c'); rect(x - 4, y - 8, 12, 1, '#a8681c');
    rect(x - 6, y - 18, 16, 3, '#2a1c10'); rect(x - 5, y - 17, 14, 1, '#7a5a38'); rect(x - 1, y - 21, 6, 3, '#2a1c10'); lights.push({ x: x - 4, y: y - 14, w: 12, h: 14, lamp: true });
    rect(x - 3, y + 33, 10, 3, STONE[0]); rect(x - 2, y + 33, 8, 2, STONE[2]);
  }
  function bucketBarrel(x, y) { rect(x, y, 14, 15, W6[0]); rect(x + 1, y + 1, 12, 13, W6[3]); rect(x + 1, y + 1, 4, 13, W6[4]); rect(x + 1, y + 5, 12, 1, W6[0]); rect(x + 1, y + 10, 12, 1, W6[0]); grain(x + 1, y + 1, 12, 13, 9 + x, W6[2], W6[4], true); ellipse(x + 7, y, 7, 2, W6[0]); ellipse(x + 7, y, 6, 1, WATER[3]); rect(x + 4, y, 3, 1, WATER[5]); }
  function toolCorner() {
    drawSpriteAt('water', 22, 212, 1); drawSpriteAt('fertilizer', 88, 206, 1);
    board(34, 232, 24, 5, 3); rect(36, 237, 3, 11, W6[0]); rect(37, 237, 1, 10, W6[3]); rect(53, 237, 3, 11, W6[0]); rect(54, 237, 1, 10, W6[3]);
    board(63, 240, 12, 6, 2); rect(64, 246, 3, 7, W6[0]); rect(71, 246, 3, 7, W6[0]);
    rect(26, 225, 14, 2, '#777'); rect(40, 218, 2, 10, W6[3]); rect(40, 218, 1, 10, W6[4]); rect(36, 218, 8, 1, '#8a8a8a');
  }

