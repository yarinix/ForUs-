  // ---------- растения: общий рисунок для грядки и значков ----------
  function leaf(x, y, w, h, light = false) {
    rect(x, y, w, h, LEAF[0]);
    if (w > 2 && h > 2) {
      rect(x + 1, y + 1, w - 2, h - 2, LEAF[2]); rect(x + 1, y + 1, Math.max(1, w - 3), 1, light ? LEAF[4] : LEAF[3]);
      rect(x + 1, y + h - 2, w - 2, 1, LEAF[1]); if (w > 4) rect(x + 2, y + Math.floor(h / 2), w - 4, 1, LEAF[3]);
      if (w > 5) rect(x + w - 3, y + 1, 1, 1, LEAF[4]);
    }
  }
  // x, y: середина основания растения на земле.
  function plant(kind, stage, color, x, y) {
    x = Math.round(x); y = Math.round(y);
    if (stage <= 0) { rect(x - 1, y - 4, 2, 4, LEAF[1]); leaf(x - 4, y - 6, 4, 3); leaf(x + 1, y - 7, 4, 3, true); return; }
    if (stage === 1) { rect(x, y - 9, 2, 9, LEAF[1]); leaf(x - 5, y - 8, 5, 4); leaf(x + 2, y - 11, 5, 4, true); leaf(x - 3, y - 13, 4, 3); return; }
    if (stage === 2) {
      rect(x, y - 14, 2, 14, LEAF[1]); leaf(x - 6, y - 8, 6, 4); leaf(x + 2, y - 11, 6, 4, true); leaf(x - 5, y - 13, 5, 4); leaf(x + 2, y - 16, 5, 4);
      rect(x - 1, y - 19, 4, 4, shade(color, -.45)); rect(x, y - 18, 3, 3, color); rect(x, y - 18, 1, 1, shade(color, .55)); return;
    }
    const dk = shade(color, -.42), lt = shade(color, .5);
    if (kind === 'radish') {
      leaf(x - 7, y - 11, 6, 6); leaf(x - 3, y - 15, 6, 8, true); leaf(x + 2, y - 11, 6, 6);
      ellipse(x, y - 3, 4, 3, dk); ellipse(x, y - 3, 3, 2, color); rect(x - 2, y - 4, 2, 1, lt); rect(x, y, 1, 2, '#f4e6cf');
    } else if (kind === 'carrot') {
      rect(x - 4, y - 12, 2, 9, LEAF[1]); rect(x, y - 14, 2, 11, LEAF[1]); rect(x + 4, y - 11, 2, 8, LEAF[1]);
      leaf(x - 7, y - 16, 5, 5); leaf(x - 2, y - 19, 5, 6, true); leaf(x + 3, y - 15, 5, 5);
      ellipse(x, y - 2, 5, 3, '#8a4510'); ellipse(x, y - 2, 4, 2, '#f09a32'); rect(x - 2, y - 3, 3, 1, '#fbc56a'); rect(x - 1, y - 1, 2, 1, '#d9741c');
    } else if (kind === 'sunflower') {
      const sh = compact ? 13 : 20, hy = y - sh - 5;
      rect(x, y - sh, 2, sh, LEAF[0]); rect(x, y - sh, 1, sh, LEAF[2]);
      leaf(x - 7, y - 7, 7, 4); leaf(x + 2, y - sh + 5, 7, 4, true);
      ellipse(x + 1, hy, 8, 8, '#9c6410'); ellipse(x + 1, hy, 7, 7, color);
      for (let a = 0; a < 12; a++) { const ax = x + 1 + Math.round(Math.cos(a * .5236) * 7), ay = hy + Math.round(Math.sin(a * .5236) * 7); rect(ax, ay, 1, 1, '#ffe27a'); }
      ellipse(x + 1, hy, 4, 4, '#3f2512'); ellipse(x + 1, hy, 3, 3, '#6b4423'); rect(x, hy - 1, 1, 1, '#9a6a36'); rect(x + 2, hy + 1, 1, 1, '#9a6a36');
    } else if (kind === 'tomato') {
      rect(x + 5, y - 22, 1, 22, '#8d6a3c'); rect(x + 5, y - 22, 1, 3, '#b99358');
      leaf(x - 7, y - 15, 7, 5); leaf(x - 1, y - 20, 7, 5, true); leaf(x - 6, y - 8, 7, 5); leaf(x + 1, y - 13, 7, 5);
      [[-4, -5], [3, -8], [-1, -13]].forEach(([dx, dy]) => { ellipse(x + dx, y + dy, 3, 3, dk); ellipse(x + dx, y + dy, 2, 2, color); rect(x + dx - 1, y + dy - 2, 1, 1, lt); rect(x + dx, y + dy - 3, 1, 1, LEAF[3]); });
    } else if (kind === 'strawberry') {
      leaf(x - 9, y - 8, 8, 5); leaf(x + 1, y - 9, 8, 5, true); leaf(x - 5, y - 13, 8, 5);
      [[-6, -3], [4, -4], [0, -5]].forEach(([dx, dy]) => { ellipse(x + dx, y + dy, 2, 2, dk); rect(x + dx - 1, y + dy - 1, 3, 3, color); rect(x + dx - 1, y + dy - 1, 1, 1, lt); rect(x + dx, y + dy, 1, 1, '#ffe9a0'); });
      rect(x - 7, y - 16, 4, 4, '#cfd8c0'); rect(x - 6, y - 15, 2, 2, '#fffaf0'); rect(x - 5, y - 14, 1, 1, '#ffd84a');
      rect(x + 4, y - 14, 4, 4, '#cfd8c0'); rect(x + 5, y - 13, 2, 2, '#fffaf0'); rect(x + 6, y - 12, 1, 1, '#ffd84a');
    } else if (kind === 'lavender') {
      [[-6, 13], [0, 18], [6, 14]].forEach(([dx, h]) => {
        rect(x + dx, y - h, 1, h, LEAF[1]); rect(x + dx - 1, y - h - 8, 4, 9, shade(color, -.45)); rect(x + dx, y - h - 8, 2, 9, color);
        rect(x + dx, y - h - 8, 1, 6, shade(color, .45)); rect(x + dx, y - h - 9, 1, 1, shade(color, .6));
      });
      leaf(x - 8, y - 4, 5, 3); leaf(x + 3, y - 5, 5, 3, true);
    } else if (kind === 'pumpkin') {
      leaf(x - 11, y - 9, 8, 6); leaf(x + 4, y - 10, 8, 6, true);
      ellipse(x, y - 5, 8, 6, dk); ellipse(x, y - 5, 7, 5, color);
      rect(x - 3, y - 9, 1, 8, shade(color, -.22)); rect(x + 3, y - 9, 1, 8, shade(color, -.22)); rect(x - 6, y - 8, 2, 2, lt); rect(x, y - 10, 1, 1, lt);
      rect(x, y - 12, 3, 4, LEAF[1]); rect(x + 1, y - 12, 1, 3, LEAF[3]);
    } else {
      ellipse(x, y - 8, 8, 7, LEAF[0]); ellipse(x, y - 8, 7, 6, LEAF[2]); rect(x - 5, y - 12, 5, 2, LEAF[3]); rect(x + 1, y - 6, 4, 2, LEAF[1]);
      [[-4, -9], [3, -11], [4, -5], [-2, -4], [0, -13]].forEach(([dx, dy]) => { ellipse(x + dx, y + dy, 2, 2, '#26306e'); rect(x + dx - 1, y + dy - 1, 2, 2, '#4a5cc0'); rect(x + dx - 1, y + dy - 1, 1, 1, '#9aa6f0'); });
    }
  }

  // ---------- значки и украшения 24×24 (в саду рисуются ×2) ----------
  function sprite(ctx, type, stage = 3, color = '#ed6d88') {
    withCtx(ctx, () => {
      if (CROPS_LIST.includes(type)) { plant(type, stage, color, 14, compact ? 30 : 25); return; }
      const e = ellipse;
      if (type === 'bed') {
        rect(2, 6, 24, 20, '#3b2514'); rect(3, 7, 22, 4, '#b57e44'); rect(3, 7, 22, 1, '#e0b072');
        rect(3, 11, 3, 10, '#8f5c30'); rect(22, 11, 3, 10, '#7a4c28'); rect(6, 11, 16, 10, '#4a2f1d');
        for (let y = 13; y < 21; y += 3) rect(7, y, 14, 1, '#5e3f27');
        rect(3, 21, 22, 4, '#a06b36'); rect(3, 21, 22, 1, '#cf9a56'); plant('radish', 3, '#ed6d88', 14, 20); return;
      }
      if (type === 'coin') { e(14, 14, 11, 11, '#7a4c0a'); e(14, 14, 10, 10, '#e2a82a'); e(14, 14, 8, 8, '#f6d35a'); e(14, 14, 6, 6, '#e8b730'); rect(13, 9, 3, 11, '#a56a10'); rect(10, 11, 9, 2, '#a56a10'); rect(10, 16, 9, 2, '#a56a10'); rect(9, 8, 3, 3, '#fff3b0'); return; }
      if (type === 'harvest') {
        rect(5, 14, 20, 11, WOOD[0]); rect(6, 15, 18, 9, '#b77a3c'); for (let x = 8; x < 24; x += 4) rect(x, 15, 1, 9, '#8f5c30'); rect(6, 19, 18, 1, '#8f5c30'); rect(6, 15, 18, 1, '#d6a468');
        plank(4, 12, 22, 4); ellipse(10, 10, 4, 4, '#8c2418'); ellipse(10, 10, 3, 3, '#e0402f'); rect(9, 8, 1, 1, '#ff9a85'); rect(10, 6, 1, 2, LEAF[3]);
        rect(14, 4, 4, 9, '#9a4f12'); rect(15, 4, 2, 8, '#f09a32'); leaf(14, 1, 4, 4, true); ellipse(21, 10, 3, 3, '#2a5a2a'); ellipse(21, 10, 2, 2, '#6cb044'); return;
      }
      if (type === 'water') {
        rect(6, 12, 13, 12, '#27506f'); rect(7, 13, 11, 10, '#4f8cc0'); rect(7, 13, 11, 2, '#8fc0e6'); rect(7, 21, 11, 2, '#3d6e9a');
        rect(19, 14, 6, 3, '#27506f'); rect(20, 15, 5, 1, '#6aa4d4'); rect(24, 11, 3, 4, '#27506f'); rect(25, 12, 1, 2, '#8fc0e6'); rect(3, 13, 4, 2, '#27506f'); rect(3, 13, 2, 8, '#27506f'); rect(4, 14, 1, 6, '#6aa4d4');
        rect(26, 16, 1, 2, '#bfe9f5'); rect(25, 19, 1, 2, '#8fdcf0'); return;
      }
      if (type === 'well') {
        shadow(14, 25, 11, 2); e(14, 20, 11, 5, STONE[0]); rect(3, 15, 22, 7, STONE[0]); rect(4, 15, 20, 7, STONE[2]);
        for (let y = 16; y < 22; y += 3) { rect(4, y, 20, 1, STONE[1]); } for (let x = 7; x < 24; x += 6) { rect(x, 15, 1, 3, STONE[1]); rect(x + 3, 18, 1, 3, STONE[1]); }
        rect(4, 15, 20, 1, STONE[3]); e(14, 15, 9, 3, STONE[0]); e(14, 15, 8, 2, '#1f7da6'); rect(9, 14, 4, 1, '#7fd6ea');
        plank(4, 5, 3, 11, WOOD); plank(21, 5, 3, 11, WOOD); plank(2, 3, 24, 4, WOOD); rect(13, 7, 2, 7, '#e8d3a0'); plank(11, 12, 6, 4, WOOD); return;
      }
      if (type === 'sprinkler') { rect(13, 11, 3, 14, '#4a5a64'); rect(14, 11, 1, 14, '#9aa8b0'); rect(8, 8, 13, 4, '#33566e'); rect(9, 9, 11, 2, '#6aa4c8'); rect(12, 5, 5, 4, '#33566e'); [[4, 4], [8, 1], [19, 1], [23, 4], [5, 8], [22, 8]].forEach(([x, y]) => rect(x, y, 2, 3, '#8fdcf0')); return; }
      if (type === 'fertilizer') {
        rect(7, 8, 18, 17, WOOD[0]); rect(8, 9, 16, 15, '#c9a46a'); rect(8, 9, 16, 2, '#e3c78f'); rect(8, 22, 16, 2, '#a98048');
        rect(9, 5, 14, 5, WOOD[0]); rect(10, 6, 12, 3, '#dcbf8a'); rect(9, 10, 14, 2, '#7a4c28');
        rect(15, 14, 2, 7, LEAF[1]); leaf(10, 14, 5, 4); leaf(17, 13, 5, 4, true); return;
      }
      if (type === 'expand') {
        plank(3, 5, 22, 20); [[5, 7, '#77b24a'], [15, 7, '#a9d06a'], [5, 16, '#a9d06a'], [15, 16, '#77b24a']].forEach(([x, y, c]) => { rect(x, y, 9, 8, c); rect(x, y, 9, 1, shade(c, .35)); });
        rect(13, 5, 2, 20, WOOD[1]); rect(3, 14, 22, 2, WOOD[1]); return;
      }
      if (SPECIES_KEYS.includes(type) || PRODUCT_KEYS.includes(type) || type === 'feed' || type === 'pen') { drawFarmIcon(type); return; }
      shadow(14, 25, 10, 2);
      if (type === 'bench') {
        plank(4, 17, 3, 7); plank(21, 17, 3, 7); plank(3, 7, 22, 4); plank(3, 11, 22, 2, WOOD); plank(2, 13, 24, 5);
        rect(2, 13, 24, 1, WOOD[4]); rect(8, 14, 1, 3, WOOD[1]); rect(19, 14, 1, 3, WOOD[1]); return;
      }
      if (type === 'flowers') {
        e(14, 15, 11, 6, LEAF[0]); e(14, 15, 10, 5, LEAF[2]); rect(5, 13, 6, 2, LEAF[3]); rect(16, 12, 6, 2, LEAF[3]);
        [[7, 11, '#f06a8e'], [12, 8, '#ffd84a'], [17, 10, '#ffffff'], [21, 13, '#b08be0'], [10, 15, '#ffffff'], [16, 15, '#ff9a52'], [14, 12, '#ee5a5a']].forEach(([x, y, c]) => { rect(x - 1, y - 1, 3, 3, shade(c, -.3)); rect(x - 1, y, 3, 1, c); rect(x, y - 1, 1, 3, c); rect(x, y, 1, 1, '#ffe27a'); });
        plank(4, 19, 20, 6); rect(5, 22, 18, 1, WOOD[1]); rect(13, 20, 1, 5, WOOD[1]); return;
      }
      if (type === 'lantern') {
        rect(13, 10, 3, 15, WOOD[0]); rect(14, 11, 1, 13, WOOD[3]); plank(10, 22, 9, 3, WOOD);
        rect(8, 1, 13, 3, '#3a2a1a'); rect(9, 2, 11, 1, '#7a5a38'); rect(9, 4, 11, 9, '#3a2a1a'); rect(10, 5, 9, 7, '#ffd877'); rect(11, 6, 3, 5, '#fff3b8'); rect(14, 5, 1, 7, '#a56a20'); rect(9, 13, 11, 2, '#3a2a1a'); return;
      }
      if (type === 'pond') {
        e(14, 17, 12, 7, STONE[0]); e(14, 17, 11, 6, STONE[2]);
        for (let a = 0; a < 12; a++) { const x = 14 + Math.cos(a * .5236) * 10, y = 17 + Math.sin(a * .5236) * 5.5; rect(x - 2, y - 1, 4, 3, a % 2 ? STONE[1] : STONE[3]); rect(x - 2, y - 1, 4, 1, STONE[3]); }
        e(14, 17, 8, 4, '#1f7da6'); e(14, 17, 7, 3, '#3fb0d4'); rect(10, 16, 4, 1, '#bff0f7'); rect(17, 19, 3, 1, '#8fdcf0');
        e(17, 18, 3, 2, LEAF[1]); e(17, 18, 2, 1, LEAF[3]); rect(18, 17, 2, 1, '#3fb0d4'); rect(11, 15, 3, 3, '#f4a0c0'); rect(12, 16, 1, 1, '#fff2a0'); return;
      }
      if (type === 'beehive') {
        rect(7, 21, 3, 4, WOOD[0]); rect(19, 21, 3, 4, WOOD[0]); rect(6, 13, 17, 9, WOOD[0]); rect(7, 14, 15, 7, '#dcae5e'); rect(7, 14, 15, 1, '#f1cd86');
        rect(7, 17, 15, 1, '#b88437'); rect(7, 20, 15, 1, '#b88437'); rect(12, 18, 5, 4, '#3a2414'); rect(13, 19, 3, 3, '#1c1008');
        rect(4, 11, 21, 3, WOOD[0]); rect(5, 12, 19, 1, WOOD[2]); rect(7, 8, 15, 3, WOOD[0]); rect(8, 9, 13, 1, WOOD[3]); rect(10, 5, 9, 3, WOOD[0]); rect(11, 6, 7, 1, WOOD[4]); rect(12, 3, 5, 2, WOOD[0]);
        rect(23, 16, 2, 2, '#f2c230'); rect(24, 16, 1, 2, '#3a2414'); rect(3, 18, 2, 2, '#f2c230'); rect(4, 18, 1, 2, '#3a2414'); return;
      }
    });
  }
