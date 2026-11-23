'use strict';
// ---------------------------------------------------------------------------
// Input: keyboard + mouse + gamepad, mapped to named actions.
// ---------------------------------------------------------------------------

const BINDINGS = {
  attack:   { keys: ['KeyJ'], mouse: [0], pad: [2] },
  special:  { keys: ['KeyK'], mouse: [2], pad: [3] },
  cast:     { keys: ['KeyQ', 'KeyL'], mouse: [1], pad: [5, 7] },
  dash:     { keys: ['Space', 'ShiftLeft', 'ShiftRight'], pad: [0] },
  interact: { keys: ['KeyE', 'KeyF'], pad: [1] },
  pause:    { keys: ['Escape', 'KeyP'], pad: [9] },
  build:    { keys: ['Tab', 'KeyI'], pad: [8] },
  // menu navigation
  up:      { keys: ['ArrowUp', 'KeyW'], pad: [12], stick: 'up' },
  down:    { keys: ['ArrowDown', 'KeyS'], pad: [13], stick: 'down' },
  left:    { keys: ['ArrowLeft', 'KeyA'], pad: [14], stick: 'left' },
  right:   { keys: ['ArrowRight', 'KeyD'], pad: [15], stick: 'right' },
  confirm: { keys: ['Enter', 'NumpadEnter', 'Space', 'KeyE'], pad: [0] },
  back:    { keys: ['Escape', 'Backspace'], pad: [1] },
};

const KEYBOARD_AIM_KEYS = new Set(['KeyJ', 'KeyK', 'KeyL']);

const Input = {
  keys: new Set(),
  pressedKeys: new Set(),
  releasedKeys: new Set(),
  mouse: { x: 0, y: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false] },
  pad: { connected: false, buttons: [], prev: [], axes: [0, 0, 0, 0], stickDir: { up: false, down: false, left: false, right: false }, stickPressed: {}, repeatT: 0 },
  aimMode: 'mouse',
  lastDevice: 'kbm',
  touch: { down: {}, pressed: {}, released: {} },
  anyPressed: false,
  canvas: null,
  enabled: true,

  init(canvas) {
    this.canvas = canvas;
    const blockKeys = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
      if (blockKeys.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.pressedKeys.add(e.code);
        this.anyPressed = true;
      }
      this.keys.add(e.code);
      this.lastDevice = 'kbm';
      if (KEYBOARD_AIM_KEYS.has(e.code)) this.aimMode = 'move';
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.releasedKeys.add(e.code);
    });
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearAll(); });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button > 2) return;
      e.preventDefault();
      this.mouse.down[e.button] = true;
      this.mouse.pressed[e.button] = true;
      this.anyPressed = true;
      this.lastDevice = 'kbm';
      this.aimMode = 'mouse';
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button > 2) return;
      if (this.mouse.down[e.button]) this.mouse.released[e.button] = true;
      this.mouse.down[e.button] = false;
    });
    window.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const nx = e.clientX - r.left, ny = e.clientY - r.top;
      if (Math.abs(nx - this.mouse.x) + Math.abs(ny - this.mouse.y) > 2) {
        this.aimMode = 'mouse';
        this.lastDevice = 'kbm';
      }
      this.mouse.x = nx; this.mouse.y = ny;
      this.mouse.seen = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', () => { this.pad.connected = true; });
    window.addEventListener('gamepaddisconnected', () => { this.pad.connected = false; });
  },

  clearAll() {
    for (const k of this.keys) this.releasedKeys.add(k);
    this.keys.clear();
    for (let i = 0; i < 3; i++) {
      if (this.mouse.down[i]) this.mouse.released[i] = true;
      this.mouse.down[i] = false;
    }
  },

  // called once per animation frame, before game logic
  poll(dt) {
    const pad = this.pad;
    let gp = null;
    if (navigator.getGamepads) {
      const pads = navigator.getGamepads();
      for (const p of pads) { if (p && p.connected) { gp = p; break; } }
    }
    pad.prev = pad.buttons;
    pad.stickPressed = {};
    if (gp) {
      pad.connected = true;
      pad.buttons = gp.buttons.map((b) => b.pressed || b.value > 0.5);
      pad.axes = [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0];
      for (let i = 0; i < pad.buttons.length; i++) {
        if (pad.buttons[i] && !pad.prev[i]) { this.anyPressed = true; this.lastDevice = 'pad'; }
      }
      const [lx, ly, rx, ry] = pad.axes;
      if (Math.hypot(lx, ly) > 0.3) this.lastDevice = 'pad';
      if (Math.hypot(rx, ry) > 0.35) { this.aimMode = 'stick'; this.lastDevice = 'pad'; }
      // stick -> discrete directions for menus (with key-repeat)
      const dirs = { up: ly < -0.6, down: ly > 0.6, left: lx < -0.6, right: lx > 0.6 };
      let anyDir = false;
      for (const d in dirs) {
        if (dirs[d]) anyDir = true;
        if (dirs[d] && !pad.stickDir[d]) { pad.stickPressed[d] = true; pad.repeatT = 0.38; }
      }
      if (anyDir) {
        pad.repeatT -= dt;
        if (pad.repeatT <= 0) {
          for (const d in dirs) if (dirs[d]) pad.stickPressed[d] = true;
          pad.repeatT = 0.12;
        }
      }
      pad.stickDir = dirs;
    } else {
      pad.buttons = [];
      pad.axes = [0, 0, 0, 0];
    }
  },

  endFrame() {
    this.touch.pressed = {};
    this.touch.released = {};
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    for (let i = 0; i < 3; i++) { this.mouse.pressed[i] = false; this.mouse.released[i] = false; }
    this.anyPressed = false;
  },

  _padDown(i) { return !!this.pad.buttons[i]; },
  _padPressed(i) { return !!this.pad.buttons[i] && !this.pad.prev[i]; },
  _padReleased(i) { return !this.pad.buttons[i] && !!this.pad.prev[i]; },

  down(action) {
    if (!this.enabled) return false;
    if (this.touch.down[action]) return true;
    const b = BINDINGS[action];
    if (!b) return false;
    if (b.keys) for (const k of b.keys) if (this.keys.has(k)) return true;
    if (b.mouse) for (const m of b.mouse) if (this.mouse.down[m]) return true;
    if (b.pad) for (const p of b.pad) if (this._padDown(p)) return true;
    if (b.stick && this.pad.stickDir[b.stick]) return true;
    return false;
  },
  pressed(action) {
    if (!this.enabled) return false;
    if (this.touch.pressed[action]) return true;
    const b = BINDINGS[action];
    if (!b) return false;
    if (b.keys) for (const k of b.keys) if (this.pressedKeys.has(k)) return true;
    if (b.mouse) for (const m of b.mouse) if (this.mouse.pressed[m]) return true;
    if (b.pad) for (const p of b.pad) if (this._padPressed(p)) return true;
    if (b.stick && this.pad.stickPressed[b.stick]) return true;
    return false;
  },
  released(action) {
    if (this.touch.released[action]) return true;
    const b = BINDINGS[action];
    if (!b) return false;
    if (b.keys) for (const k of b.keys) if (this.releasedKeys.has(k)) return true;
    if (b.mouse) for (const m of b.mouse) if (this.mouse.released[m]) return true;
    if (b.pad) for (const p of b.pad) if (this._padReleased(p)) return true;
    return false;
  },

  // movement vector (length <= 1)
  moveVec() {
    let x = 0, y = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      const [lx, ly] = this.pad.axes;
      const m = Math.hypot(lx, ly);
      if (m > 0.22) {
        const s = Math.min(1, (m - 0.22) / 0.7) / m;
        x += lx * s; y += ly * s;
      }
      if (typeof Touch !== 'undefined' && Touch.enabled) { x += Touch.stick.x; y += Touch.stick.y; }
      if (this._padDown(12)) y -= 1;
      if (this._padDown(13)) y += 1;
      if (this._padDown(14)) x -= 1;
      if (this._padDown(15)) x += 1;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  },

  stickAim() {
    const rx = this.pad.axes[2], ry = this.pad.axes[3];
    if (Math.hypot(rx, ry) > 0.35) return Math.atan2(ry, rx);
    return null;
  },
};
