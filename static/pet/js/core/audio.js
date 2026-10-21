  // ---------- звуки: всё синтезируется в браузере (без файлов), 8-битный «пиксельный» стиль ----------
  const SFX = (() => {
    let ctx = null, master = null, on = true, vol = 0.6;
    try {
      if (localStorage.getItem('pet_snd') === '0') on = false;
      const w = parseFloat(localStorage.getItem('pet_vol')); if (w >= 0 && w <= 1) vol = w;
    } catch (e) {}
    function ensure() {
      if (!on || vol <= 0) return null;
      try {
        if (!ctx) {
          const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
          ctx = new C(); ctx.onstatechange = () => sync(); master = ctx.createGain(); master.gain.value = vol * 0.5; master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { return null; }
      return ctx;
    }
    // нота: частота, старт (сек от «сейчас»), длина, форма волны, громкость, скольжение частоты
    function tone(f, t, d, o) {
      o = o || {}; const c = ctx, t0 = c.currentTime + t, g = c.createGain(), os = c.createOscillator();
      os.type = o.type || 'square'; os.frequency.setValueAtTime(f, t0);
      if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t0 + d);
      const v = o.v == null ? 0.22 : o.v;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      os.connect(g); g.connect(master); os.start(t0); os.stop(t0 + d + 0.03);
    }
    function noise(t, d, o) {
      o = o || {}; const c = ctx, t0 = c.currentTime + t, n = Math.max(1, Math.floor(c.sampleRate * d));
      const buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = o.type || 'bandpass'; flt.frequency.setValueAtTime(o.f || 1800, t0);
      if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t0 + d);
      flt.Q.value = o.q || 1.2;
      const g = c.createGain(); g.gain.setValueAtTime(o.v == null ? 0.3 : o.v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      src.connect(flt); flt.connect(g); g.connect(master); src.start(t0);
    }
    const seq = (notes, step, o) => notes.forEach((f, i) => tone(f, i * step, step * 1.6, o));
    const LIB = {
      click() { tone(1200, 0, 0.03, { v: 0.1 }); },
      pet() { tone(659, 0, 0.09, { type: 'triangle', v: 0.25 }); tone(880, 0.07, 0.14, { type: 'triangle', v: 0.25 }); },
      coin() { tone(988, 0, 0.07, { v: 0.16 }); tone(1319, 0.07, 0.22, { v: 0.16 }); },
      feed() { for (let i = 0; i < 3; i++) noise(i * 0.13, 0.07, { f: 2400 - i * 300, q: 2, v: 0.5 }); tone(330, 0.42, 0.12, { type: 'triangle', v: 0.2 }); tone(494, 0.5, 0.18, { type: 'triangle', v: 0.2 }); },
      play() { tone(250, 0, 0.18, { type: 'triangle', to: 720, v: 0.3 }); tone(720, 0.17, 0.2, { type: 'triangle', to: 380, v: 0.25 }); tone(520, 0.4, 0.1, { v: 0.12 }); tone(780, 0.48, 0.14, { v: 0.12 }); },
      sleep() { seq([523, 440, 392, 330, 262], 0.28, { type: 'triangle', v: 0.2 }); },
      wake() { seq([392, 494, 587, 784], 0.13, { type: 'triangle', v: 0.22 }); },
      level() { seq([523, 659, 784, 1047], 0.1, { v: 0.15 }); tone(1047, 0.4, 0.5, { v: 0.15 }); tone(1319, 0.4, 0.5, { v: 0.1 }); },
      buy() { tone(880, 0, 0.07, { v: 0.15 }); tone(1175, 0.08, 0.07, { v: 0.15 }); tone(1568, 0.16, 0.25, { v: 0.15 }); },
      wear() { noise(0, 0.16, { f: 600, to: 3200, q: 0.8, v: 0.3 }); tone(784, 0.14, 0.12, { type: 'triangle', v: 0.18 }); },
      place() { tone(180, 0, 0.12, { type: 'sine', to: 70, v: 0.5 }); noise(0, 0.05, { f: 400, v: 0.2 }); },
      claim() { seq([659, 784, 988], 0.09, { v: 0.15 }); tone(1319, 0.3, 0.35, { v: 0.15 }); tone(988, 0.3, 0.35, { v: 0.1 }); },
      no() { tone(220, 0, 0.12, { v: 0.18 }); tone(165, 0.12, 0.2, { v: 0.18 }); },
      move() { noise(0, 0.05, { f: 500, q: 1.5, v: 0.35 }); noise(0.16, 0.05, { f: 420, q: 1.5, v: 0.35 }); noise(0.32, 0.05, { f: 500, q: 1.5, v: 0.3 }); },
      ok() { tone(784, 0, 0.08, { type: 'triangle', v: 0.2 }); tone(1047, 0.08, 0.14, { type: 'triangle', v: 0.2 }); },
      door() { noise(0, 0.2, { f: 300, to: 900, q: 3, v: 0.3 }); tone(180, 0.02, 0.22, { type: 'sawtooth', to: 140, v: 0.07 }); noise(0.32, 0.08, { f: 200, v: 0.4 }); },
      cast() { noise(0, 0.28, { f: 500, to: 3200, q: 1, v: 0.28 }); },
      splash() { noise(0, 0.14, { f: 1400, to: 300, q: 0.9, v: 0.3 }); tone(650, 0, 0.1, { type: 'sine', to: 220, v: 0.2 }); },
      bite() { tone(1400, 0, 0.04, { type: 'square', v: 0.12 }); tone(1100, 0.05, 0.05, { type: 'square', v: 0.1 }); },
      catch() { noise(0, 0.12, { f: 1000, to: 300, v: 0.25 }); seq([659, 784, 988, 1319], 0.08, { v: 0.14 }); },
      miss() { tone(392, 0, 0.14, { type: 'triangle', v: 0.16 }); tone(294, 0.14, 0.24, { type: 'triangle', v: 0.16 }); },
      forage() { noise(0, 0.1, { f: 3000, q: 0.8, v: 0.3 }); noise(0.13, 0.1, { f: 2500, q: 0.8, v: 0.3 }); noise(0.26, 0.09, { f: 3300, q: 0.8, v: 0.25 }); tone(660, 0.4, 0.08, { type: 'triangle', v: 0.2 }); tone(990, 0.48, 0.16, { type: 'triangle', v: 0.2 }); },
      angle() { noise(0, 0.28, { f: 400, to: 3000, q: 1, v: 0.3 }); tone(600, 0.4, 0.14, { type: 'sine', to: 180, v: 0.3 }); noise(0.4, 0.1, { f: 900, to: 300, v: 0.25 }); tone(784, 0.8, 0.1, { type: 'triangle', v: 0.15 }); tone(1047, 0.9, 0.2, { type: 'triangle', v: 0.15 }); },
      unlock() { seq([392, 523, 659, 784, 1047], 0.11, { type: 'triangle', v: 0.2 }); tone(1047, 0.6, 0.6, { v: 0.12 }); tone(1319, 0.6, 0.6, { v: 0.1 }); },
      ach() { seq([784, 988, 1175, 1568], 0.08, { v: 0.14 }); tone(1568, 0.34, 0.5, { v: 0.12 }); },
      partner() { tone(880, 0, 0.12, { type: 'sine', v: 0.2 }); tone(1175, 0.14, 0.22, { type: 'sine', v: 0.2 }); },
    };
    // ---------- фон природы: ветер, шелест листвы, птицы днём, сверчки и сова ночью, вода у озера ----------
    let want = null, amb = null, nightFn = () => false, birdT = null, nbuf = null;
    function noiseBuf() {
      if (nbuf) return nbuf;
      const n = Math.floor(ctx.sampleRate * 4), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let l = 0, mx = 0.001;
      for (let i = 0; i < n; i++) { l = (l + 0.03 * (Math.random() * 2 - 1)) / 1.03; d[i] = l; if (Math.abs(l) > mx) mx = Math.abs(l); }
      for (let i = 0; i < n; i++) d[i] = d[i] / mx * 0.9;
      return (nbuf = b);
    }
    const ZONE = { yard: [0.5, 0.6, 0], forest: [0.85, 1, 0], lake: [0.55, 0.5, 1] };
    function ambZone(zone) {
      const z = ZONE[zone] || ZONE.forest, t = ctx.currentTime;
      amb.wind.g.gain.setTargetAtTime(0.55 * z[0], t, 0.8); amb.leaves.g.gain.setTargetAtTime(0.06 * z[1], t, 0.8); amb.water.g.gain.setTargetAtTime(0.02 + 0.2 * z[2], t, 0.8);
      amb.zone = zone;
    }
    function ambStart(zone) {
      const t = ctx.currentTime, bus = ctx.createGain(), srcs = [];
      bus.gain.setValueAtTime(0.0001, t); bus.gain.linearRampToValueAtTime(1, t + 2); bus.connect(master);
      const mk = (type, f, q, gain) => {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf(); s.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const g = ctx.createGain(); g.gain.value = gain; s.connect(fl); fl.connect(g); g.connect(bus); s.start(0, Math.random() * 3); srcs.push(s); return { g, fl };
      };
      const lfo = (param, rate, depth) => { const o = ctx.createOscillator(), d = ctx.createGain(); o.frequency.value = rate; d.gain.value = depth; o.connect(d); d.connect(param); o.start(); srcs.push(o); };
      const wind = mk('lowpass', 480, 0.7, 0.4), leaves = mk('bandpass', 3600, 0.5, 0.05), water = mk('bandpass', 650, 0.9, 0.1);
      lfo(wind.g.gain, 0.09, 0.22); lfo(wind.fl.frequency, 0.06, 180); lfo(leaves.g.gain, 0.17, 0.035); lfo(water.g.gain, 0.45, 0.05);
      amb = { bus, srcs, wind, leaves, water, zone: null };
      ambZone(zone); birdT = setTimeout(birdLoop, 700);
    }
    function ambStop() {
      clearTimeout(birdT); if (!amb) return; const a = amb; amb = null;
      try { const t = ctx.currentTime; a.bus.gain.cancelScheduledValues(t); a.bus.gain.setTargetAtTime(0, t, 0.15); } catch (e) {}
      setTimeout(() => a.srcs.forEach(s => { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} }), 900);
    }
    function sync() {
      if (want && on && vol > 0 && !document.hidden) {
        if (!ensure() || ctx.state !== 'running') return;       // ждём первого касания
        if (!amb) ambStart(want); else if (amb.zone !== want) ambZone(want);
      } else ambStop();
    }
    function chirp() {
      const k = Math.floor(Math.random() * 4), f = 2200 + Math.random() * 2200;
      if (k === 0) { tone(f, 0, 0.07, { type: 'sine', to: f * 1.35, v: 0.1 }); tone(f * 1.1, 0.11, 0.07, { type: 'sine', to: f * 1.5, v: 0.1 }); }
      else if (k === 1) { for (let i = 0; i < 6; i++) tone(f + (i % 2) * 500, i * 0.045, 0.04, { type: 'sine', v: 0.08 }); }
      else if (k === 2) tone(f * 1.4, 0, 0.22, { type: 'sine', to: f * 0.8, v: 0.1 });
      else [1, 1.25, 1].forEach((m, i) => tone(f * m, i * 0.09, 0.08, { type: 'sine', v: 0.09 }));
    }
    function birdLoop() {
      if (!amb) return; let wait;
      try {
        const z = amb.zone;
        if (nightFn()) {
          for (let i = 0; i < 3; i++) tone(4100 + Math.random() * 300, i * 0.075, 0.05, { type: 'sine', v: 0.06 });
          if (z === 'forest' && Math.random() < 0.15) { tone(420, 0.3, 0.3, { type: 'sine', to: 360, v: 0.14 }); tone(400, 0.8, 0.4, { type: 'sine', to: 320, v: 0.14 }); }
          wait = 700 + Math.random() * 900;
        } else {
          chirp(); if (z === 'lake' && Math.random() < 0.25) { noise(0.5, 0.12, { f: 900, to: 300, v: 0.25 }); tone(700, 0.5, 0.1, { type: 'sine', to: 300, v: 0.12 }); }
          wait = (z === 'forest' ? 900 : z === 'yard' ? 1500 : 2800) + Math.random() * 3200;
        }
      } catch (e) { wait = 3000; }
      birdT = setTimeout(birdLoop, wait);
    }
    document.addEventListener('visibilitychange', () => sync());
    return {
      play(name, delay) {
        const run = () => { if (!ensure() || !LIB[name]) return; try { LIB[name](); } catch (e) {} };
        if (delay) setTimeout(run, delay); else run();
      },
      unlock() { ensure(); if (want) sync(); },
      ambient(zone) { want = zone || null; sync(); },
      setNight(f) { nightFn = f; },
      get on() { return on; }, get vol() { return vol; },
      setOn(v) { on = !!v; try { localStorage.setItem('pet_snd', on ? '1' : '0'); } catch (e) {} if (on) ensure(); sync(); },
      setVol(v) { vol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('pet_vol', String(vol)); } catch (e) {} if (master) master.gain.value = vol * 0.5; else if (vol > 0) ensure(); sync(); },
    };
  })();
  // браузер разрешает звук только после касания — «будим» звук при первом нажатии
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, () => SFX.unlock(), { passive: true }));

  const haptic = (k) => { const h = tg.HapticFeedback; if (!h) return; try { k === 'err' ? h.notificationOccurred('error') : k === 'ok' ? h.notificationOccurred('success') : h.impactOccurred('light'); } catch (e) {} };

