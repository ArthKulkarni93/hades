'use strict';
// ---------------------------------------------------------------------------
// Boot + main loop
// ---------------------------------------------------------------------------
(function boot() {
  let last = performance.now();
  let crashed = false;

  function frame(now) {
    requestAnimationFrame(frame);
    if (crashed) return;
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);
    G.fps = lerp(G.fps, 1 / Math.max(dt, 1e-3), 0.05);
    try {
      Input.poll(dt);
      Game.update(dt);
      Game.lateUpdate();
      Game.render();
      Input.endFrame();
    } catch (err) {
      crashed = true;
      console.error(err);
      const box = document.getElementById('crash');
      if (box) {
        box.classList.remove('hidden');
        box.querySelector('pre').textContent = String(err && err.stack ? err.stack : err);
      }
    }
  }

  function start() {
    Game.init();
    window.EW = { G, Game, Save, UI, Input, Sound, Music, REALMS, PATRONS, BLESSINGS, DUOS, WEAPONS, ENEMIES, BOSSES };
    requestAnimationFrame((t) => { last = t; frame(t); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
