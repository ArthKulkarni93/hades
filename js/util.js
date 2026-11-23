'use strict';
// ---------------------------------------------------------------------------
// Emberwake — shared math / color / misc helpers
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sign = (v) => (v < 0 ? -1 : 1);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function weightedPick(items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return items.length ? items[0] : null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function rotateToward(a, target, maxStep) {
  const d = angleDiff(a, target);
  if (Math.abs(d) <= maxStep) return target;
  return a + Math.sign(d) * maxStep;
}
function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}
// frame-rate independent exponential smoothing
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// distance from point to segment
function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

// circle vs arc (sector) overlap test
function circleInArc(cx, cy, cr, ox, oy, radius, angle, arc) {
  const dx = cx - ox, dy = cy - oy;
  const d = Math.hypot(dx, dy);
  if (d > radius + cr) return false;
  if (d < cr + 4) return true;
  if (arc >= TAU - 0.001) return true;
  const a = Math.atan2(dy, dx);
  const slack = Math.asin(clamp(cr / d, 0, 1));
  return Math.abs(angleDiff(angle, a)) <= arc / 2 + slack;
}

const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

// ---- color helpers --------------------------------------------------------
const _rgbCache = new Map();
function hexToRgb(hex) {
  let c = _rgbCache.get(hex);
  if (c) return c;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _rgbCache.set(hex, c);
  return c;
}
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  const r = Math.round(lerp(a[0], b[0], t)), g = Math.round(lerp(a[1], b[1], t)), bl = Math.round(lerp(a[2], b[2], t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// cheap deterministic hash noise for tile decoration
function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 982451653) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// tiny wait helper for generator-driven behaviours: `yield* wait(0.5)`
function* wait(seconds) {
  let t = seconds;
  while (t > 0) {
    const dt = yield;
    t -= dt || 0;
  }
}
