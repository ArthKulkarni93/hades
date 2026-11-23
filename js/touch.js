'use strict';
// ---------------------------------------------------------------------------
// Touch controls: a floating left-thumb joystick plus action buttons.
// Only created on touch devices. Feeds Input via Input.touch.
// ---------------------------------------------------------------------------

const Touch = {
  enabled: false,
  root: null,
  stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  buttons: {},

  detect() {
    return ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  },

  init() {
    if (!this.detect()) return;
    this.enabled = true;
    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div class="t-stick-zone"></div>
      <div class="t-stick hidden"><div class="t-knob"></div></div>
      <div class="t-buttons">
        <button class="t-btn t-attack" data-a="attack">Attack</button>
        <button class="t-btn t-special" data-a="special">Special</button>
        <button class="t-btn t-dash" data-a="dash">Dash</button>
        <button class="t-btn t-cast" data-a="cast">Cast</button>
        <button class="t-btn t-interact hidden" data-a="interact">Use</button>
      </div>
      <button class="t-pause" data-a="pause">❚❚</button>`;
    document.getElementById('game-root').appendChild(root);
    this.root = root;
    const zone = root.querySelector('.t-stick-zone');
    const stickEl = root.querySelector('.t-stick');
    const knob = root.querySelector('.t-knob');
    const R = 56;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.stick.id !== null) return;
      this.stick.id = t.identifier;
      this.stick.ox = t.clientX; this.stick.oy = t.clientY;
      this.stick.x = 0; this.stick.y = 0;
      stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px';
      stickEl.classList.remove('hidden');
      knob.style.transform = 'translate(-50%,-50%)';
      Input.aimMode = 'touch'; Input.lastDevice = 'touch';
      Sound.init();
    }, { passive: false });
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stick.id) continue;
        e.preventDefault();
        let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.stick.x = dx / R; this.stick.y = dy / R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.stick.id) continue;
        this.stick.id = null; this.stick.x = 0; this.stick.y = 0;
        stickEl.classList.add('hidden');
      }
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    for (const b of root.querySelectorAll('[data-a]')) {
      const a = b.dataset.a;
      this.buttons[a] = b;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        Input.touch.down[a] = true;
        Input.touch.pressed[a] = true;
        Input.aimMode = 'touch'; Input.lastDevice = 'touch'; Input.anyPressed = true;
        b.classList.add('on');
        Sound.init();
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        if (Input.touch.down[a]) Input.touch.released[a] = true;
        Input.touch.down[a] = false;
        b.classList.remove('on');
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    }
  },

  // show controls only during play; show the Use button when something is interactable
  update() {
    if (!this.enabled) return;
    const show = G.state === 'play' || G.state === 'dying';
    this.root.classList.toggle('hidden', !show);
    const canUse = !!(G.scene && G.scene.focus);
    this.buttons.interact.classList.toggle('hidden', !canUse);
  },
};
