  function animate(now) {
    if (!opened || document.hidden) return;
    if (now - lastFrame >= 40) { const dt = Math.min(150, now - (lastFrame || now)); lastFrame = now; const factor = Math.min(1, dt / 220); hero.x += (hero.tx - hero.x) * factor; hero.y += (hero.ty - hero.y) * factor; draw(now); }
    follow(now);
    animation = requestAnimationFrame(animate);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
