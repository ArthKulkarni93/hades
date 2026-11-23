'use strict';
// ---------------------------------------------------------------------------
// Scene: one chamber — its map, actors, effects, props, encounter, and the
// full render pipeline (y-sorted world, lighting, overlays).
// ---------------------------------------------------------------------------

const REWARD_NAMES = {
  gold: 'Gilded Cache', vitality: 'Heart of Embers', ash: 'Ash Reliquary', forge: 'Sunforge', fragment: 'Star Fragment',
  shop: 'Wandering Peddler', fountain: 'Ember Well', boss: 'Guardian', respite: 'Respite', exit: 'Ascend', hearth: 'Return',
};
function rewardLabel(r) {
  if (!r) return '';
  if (r.kind === 'blessing') return `Blessing of ${PATRONS[r.patron].name}`;
  return REWARD_NAMES[r.kind] || r.kind;
}
function rewardColor(r) {
  if (!r) return '#ffffff';
  return r.kind === 'blessing' ? PATRONS[r.patron].color : REWARD_COLORS[r.kind] || '#ffffff';
}

class Prop {
  constructor(o) {
    this.x = 0; this.y = 0; this.r = 20; this.range = 58; this.prompt = null; this.sortOffset = 0; this.t = rand(10);
    this.active = true; this.solid = false; this.dead = false;
    Object.assign(this, o);
  }
  update(dt, sc) { this.t += dt; if (this.onUpdate) this.onUpdate(dt, sc, this); }
  canInteract() { return this.active && !!this.prompt && (!this.cond || this.cond(this)); }
  get sortY() { return this.y + this.sortOffset; }
  draw(ctx) { if (this.drawFn) this.drawFn(ctx, this); }
  drawShadow(ctx) {
    if (this.shadow === false) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 2, this.r * 1.1, this.r * 0.4, 0, 0, TAU); ctx.fill();
  }
  drawOver(ctx) { if (this.overFn) this.overFn(ctx, this); }
  light() { return this.lightFn ? this.lightFn(this) : null; }
}

class Coin {
  constructor(x, y, value) {
    this.x = x; this.y = y; this.z = 4;
    const a = rand(TAU), sp = rand(60, 200);
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp; this.vz = rand(120, 220);
    this.value = value; this.t = 0; this.dead = false;
  }
  update(dt, sc) {
    this.t += dt;
    const p = G.player;
    this.vz -= 600 * dt; this.z += this.vz * dt;
    if (this.z < 0) { this.z = 0; this.vz *= -0.4; this.vx *= 0.6; this.vy *= 0.6; }
    const d = p ? dist(this.x, this.y, p.x, p.y) : 9999;
    if (p && !p.dead && this.t > 0.35 && (d < 140 || this.t > 1.4 || sc.cleared)) {
      const a = angleTo(this.x, this.y, p.x, p.y);
      const sp = 260 + this.t * 300;
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
    } else { this.vx *= Math.exp(-3 * dt); this.vy *= Math.exp(-3 * dt); }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (p && d < 20 && this.t > 0.3) {
      this.dead = true;
      const v = Math.max(1, Math.round(this.value * (p.stats.goldMult || 1)));
      if (G.run) G.run.gold += v;
      Sound.play('coin');
      sc.particles.burst(this.x, this.y - 6, 4, { color: '#ffd76a', speed: 80, life: 0.25, size: 2 });
    }
  }
  get sortY() { return this.y; }
  drawShadow(ctx) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(this.x, this.y + 1, 5, 2, 0, 0, TAU); ctx.fill(); }
  draw(ctx) {
    const w = Math.abs(Math.cos(this.t * 8)) * 5 + 1;
    ctx.fillStyle = '#e0a020';
    ctx.beginPath(); ctx.ellipse(this.x, this.y - 6 - this.z, w, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.ellipse(this.x - w * 0.2, this.y - 7 - this.z, w * 0.5, 3, 0, 0, TAU); ctx.fill();
  }
}

function makeSpawnPortal(x, y, r, dur, onDone, color = '#ff5a4a') {
  let done = false;
  return {
    layer: 'floor', t: 0, hazard: true,
    update(dt, sc) {
      this.t += dt;
      if (Math.random() < 0.6) sc.particles.spawn({ x: x + rand(-r, r), y: y + rand(-r * 0.4, r * 0.4), vy: -rand(40, 120), life: 0.5, size: 2.5, color });
      if (!done && this.t >= dur) { done = true; onDone(); sc.particles.burst(x, y - 10, 14, { color: [color, '#ffffff'], speed: 160, life: 0.4, size: 3 }); }
      return this.t < dur + 0.2;
    },
    draw(ctx) {
      const k = clamp(this.t / dur, 0, 1);
      const rr = (r + 14) * (0.4 + 0.6 * k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(color, 0.8 * (1 - Math.max(0, this.t - dur) / 0.2));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.45, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(color, 0.18 * k);
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.45, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
    light() { return { x, y, r: 90, color, a: 0.6 }; },
  };
}

// ---------------------------------------------------------------------------
class Encounter {
  constructor(scene, waves) {
    this.scene = scene;
    this.waves = waves;
    this.wave = -1;
    this.delay = 0.9;
    this.done = false;
  }
  aliveCount() {
    let n = this.scene.pendingSpawns;
    for (const e of this.scene.enemies) if (!e.dead && !e.isDummy) n++;
    return n;
  }
  update(dt) {
    if (this.done) return;
    const alive = this.aliveCount();
    if (this.wave < 0) {
      this.delay -= dt;
      if (this.delay <= 0) this.nextWave();
      return;
    }
    const last = this.wave >= this.waves.length - 1;
    const threshold = last ? 0 : Math.floor(this.waves[this.wave].length * 0.25);
    if (alive <= threshold) {
      if (!last) {
        this.delay -= dt;
        if (this.delay <= 0) this.nextWave();
      } else if (alive === 0) {
        this.done = true;
        this.scene.onCleared();
      }
    } else this.delay = 0.7;
  }
  nextWave() {
    this.wave++;
    const sc = this.scene;
    const p = G.player;
    const used = [];
    for (const spec of this.waves[this.wave]) {
      const pt = sc.map.randomOpenPoint({ awayX: p.x, awayY: p.y, minDist: 230, clearance: 1, avoid: used });
      used.push({ x: pt.x, y: pt.y, r: 56 });
      sc.spawnEnemy(spec.type, pt.x, pt.y, { elite: spec.elite, hpScale: G.run ? G.run.enemyHpMult : 1 });
    }
    this.delay = 0.7;
  }
}

// ---------------------------------------------------------------------------
class Scene {
  constructor(opts) {
    this.kind = opts.kind;
    this.realmIdx = opts.realmIdx;
    this.themeId = opts.theme;
    this.theme = THEMES[opts.theme];
    const gen = opts.kind === 'hub' ? generateHubMap() : generateRoomMap({ kind: opts.kind, exits: (opts.exits || [1]).length, theme: opts.theme });
    this.map = gen.map;
    this.entrance = gen.entrance;
    this.doorSlots = gen.doors;
    const pre = prerenderMap(this.map);
    this.floorCanvas = pre.floor;
    this.wallRows = pre.rows;
    this.darkness = this.theme.darkness;
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.pickups = [];
    this.props = [];
    this.texts = [];
    this.timers = [];
    this.particles = new ParticleSystem();
    this.time = 0;
    this.pendingSpawns = 0;
    this.peaceful = ['hub', 'shop', 'fountain', 'respite'].includes(opts.kind);
    this.cleared = this.peaceful;
    this.encounter = null;
    this.doors = [];
    this.reward = opts.reward || null;
    this.rewardTaken = !this.reward;
    this.focus = null;
    this.ambientT = 0;
    this.lastKill = null;
    this.boss = null;
  }

  after(delay, fn) { this.timers.push({ t: delay, fn }); }
  addEffect(fx) { this.effects.push(fx); return fx; }
  addProj(p) { this.projectiles.push(p); return p; }
  addText(x, y, text, color, size, opts) { if (this.texts.length < 140) this.texts.push(new FloatText(x, y, text, color, size, opts)); }
  addProp(p) { this.props.push(p); return p; }

  spawnEnemy(type, x, y, opts = {}) {
    const def = ENEMIES[type] || BOSSES[type];
    if (!def) return;
    this.pendingSpawns++;
    Sound.play('spawn');
    this.addEffect(makeSpawnPortal(x, y, def.r, 0.75, () => {
      this.pendingSpawns--;
      if (G.scene !== this) return;
      const e = new Enemy(def, x, y, opts);
      this.enemies.push(e);
    }, opts.elite ? '#ffe08a' : '#ff5a4a'));
  }

  addEnemyNow(type, x, y, opts = {}) {
    const def = ENEMIES[type] || BOSSES[type] || opts.def;
    const e = new Enemy(def, x, y, opts);
    this.enemies.push(e);
    return e;
  }

  onEnemyKilled(e) {
    this.lastKill = { x: e.x, y: e.y };
    if (e.isBoss) Game.onBossDefeated(e);
  }

  onCleared() {
    if (this.cleared) return;
    this.cleared = true;
    Sound.play('roomClear');
    for (const pr of this.projectiles) if (pr.team === 'enemy') pr.die(this, 'cleared');
    for (const fx of this.effects) if (fx.hazard || fx.owner) fx.dead = true;
    Music.setIntensity(0);
    if (G.run) {
      G.run.build.onClear();
      if (this.kind !== 'boss') Game.roomClearBonus();
    }
    UI.banner('Chamber Cleared', '', 1.4, 'small');
    if (this.reward) {
      const pos = this.lastKill ? this.map.nearestFloor(this.lastKill.x, this.lastKill.y, 1) : this.map.nearestFloor(this.map.pw / 2, this.map.ph / 2, 1);
      this.addProp(makeRewardPickup(this.reward, pos.x, pos.y));
    } else this.unlockDoors();
  }

  unlockDoors() {
    let any = false;
    for (const d of this.doors) if (d.locked) { d.locked = false; any = true; }
    if (any) Sound.play('unlock');
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this.time += dt;
    if (this.timers.length) {
      const due = [];
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { this.timers.splice(i, 1); due.push(tm); }
      }
      for (let i = due.length - 1; i >= 0; i--) due[i].fn();
    }
    const p = G.player;
    if (p) this.map.computeFlow(p.x, p.y);
    if (this.encounter) this.encounter.update(dt);
    if (p) p.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    this.separate();
    compact(this.projectiles, (pr) => { pr.update(dt, this); return !pr.dead; });
    compact(this.effects, (fx) => !fx.dead && fx.update(dt, this) !== false);
    compact(this.enemies, (e) => !e.dead);
    compact(this.pickups, (c) => { c.update(dt, this); return !c.dead; });
    compact(this.props, (pr) => { pr.update(dt, this); return !pr.dead; });
    compact(this.texts, (t) => t.update(dt));
    this.particles.update(dt);
    this.solidProps();
    if (G.run && G.run.build && !this.peaceful && !this.cleared) G.run.build.tick(dt);
    this.ambient(dt);
    this.updateFocus();
  }

  separate() {
    const E = this.enemies;
    const p = G.player;
    for (let i = 0; i < E.length; i++) {
      const a = E[i];
      if (a.dead) continue;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j];
        if (b.dead || a.flying !== b.flying) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2), push = rr - d, nx = dx / d, ny = dy / d;
        const tm = a.mass + b.mass;
        if (!a.immovable) { a.x -= nx * push * (b.immovable ? 1 : b.mass / tm); a.y -= ny * push * (b.immovable ? 1 : b.mass / tm); }
        if (!b.immovable) { b.x += nx * push * (a.immovable ? 1 : a.mass / tm); b.y += ny * push * (a.immovable ? 1 : a.mass / tm); }
      }
      if (p && !p.dead && p.dashing <= 0 && !a.flying && a.spawnT <= 0) {
        const dx = p.x - a.x, dy = p.y - a.y, rr = a.r + p.r - 4;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = rr - d, nx = dx / d, ny = dy / d;
          const share = a.immovable ? 1 : 0.35;
          p.x += nx * push * share; p.y += ny * push * share;
          if (!a.immovable) { a.x -= nx * push * (1 - share); a.y -= ny * push * (1 - share); }
        }
      }
    }
  }

  solidProps() {
    const p = G.player;
    for (const pr of this.props) {
      if (!pr.solid) continue;
      const bodies = p && !p.dead ? [p, ...this.enemies] : this.enemies;
      for (const b of bodies) {
        if (b.flying) continue;
        const dx = b.x - pr.x, dy = b.y - pr.y, rr = pr.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          b.x = pr.x + (dx / d) * rr; b.y = pr.y + (dy / d) * rr;
        }
      }
    }
  }

  ambient(dt) {
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = 0.06;
    const cam = G.cam;
    const vw = G.viewW / cam.scale, vh = G.viewH / cam.scale;
    const x = cam.x + rand(-vw / 2, vw / 2), y = cam.y + rand(-vh / 2, vh / 2);
    const col = this.theme.dust;
    if (this.themeId === 'archive') this.particles.spawn({ x, y, vx: rand(-8, 8), vy: rand(-20, -6), life: rand(2, 4), size: rand(1, 2.2), color: col, drag: 0, alpha: 0.5 });
    else if (this.themeId === 'court') this.particles.spawn({ x, y, vx: rand(-10, 10), vy: rand(6, 18), life: rand(2.5, 4), size: rand(1, 2), color: col, drag: 0, alpha: 0.4 });
    else this.particles.spawn({ x, y, vx: rand(-14, 14), vy: rand(-30, -10), life: rand(1.6, 3.2), size: rand(1, 2.2), color: col, drag: 0, alpha: 0.7 });
  }

  updateFocus() {
    const p = G.player;
    this.focus = null;
    if (!p || p.dead || G.state !== 'play') return;
    let best = null, bd = Infinity;
    for (const pr of this.props) {
      if (!pr.canInteract()) continue;
      const fx = pr.focusX !== undefined ? pr.focusX : pr.x, fy = pr.focusY !== undefined ? pr.focusY : pr.y;
      const d = dist(p.x, p.y, fx, fy);
      if (d < pr.range && d < bd) { bd = d; best = pr; }
    }
    this.focus = best;
  }

  interact() {
    if (this.focus && this.focus.interact) {
      const f = this.focus;
      f.interact(f);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- render
  collectLights() {
    const L = [];
    const map = this.map;
    for (const l of map.lights) {
      const f = l.flicker ? 1 + Math.sin(this.time * 9 + l.seed) * 0.05 + Math.sin(this.time * 23 + l.seed * 2) * 0.03 : 1;
      L.push({ x: l.x, y: l.y, r: l.r * f, color: l.color, a: l.a || 1 });
    }
    if (G.player) L.push(G.player.light());
    for (const e of this.enemies) { const l = e.light(); if (l) L.push(l); }
    for (const pr of this.projectiles) if (pr.light) L.push({ x: pr.x, y: pr.y, r: pr.light, color: pr.color, a: 0.9 });
    for (const pr of this.props) { const l = pr.light(); if (l) L.push(l); }
    for (const fx of this.effects) {
      if (fx.light) { const l = fx.light(); if (l) L.push(l); }
      else if (fx.r && fx.layer === 'floor' && fx.x !== undefined) L.push({ x: fx.x, y: fx.y, r: fx.r * 1.4, color: '#ff6a5a', a: 0.6 });
    }
    return L;
  }

  render(ctx, cam, W, H) {
    const t = this.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.theme.void;
    ctx.fillRect(0, 0, W, H);
    const s = cam.scale;
    const ox = W / 2 - cam.x * s, oy = H / 2 - cam.y * s;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.floorCanvas, 0, 0);

    for (const fx of this.effects) if (fx.layer === 'decal') fx.draw(ctx, this);
    for (const fx of this.effects) if (fx.layer === 'floor') fx.draw(ctx, this);

    // shadows
    const p = G.player;
    for (const pr of this.props) pr.drawShadow(ctx);
    for (const c of this.pickups) c.drawShadow(ctx);
    for (const e of this.enemies) e.drawShadow(ctx);
    if (p) p.drawShadow(ctx);
    for (const fx of this.effects) if (fx.layer === 'floorTop') fx.draw(ctx, this);

    // y-sorted world
    const list = [];
    for (const row of this.wallRows) list.push({ k: row.key, o: row, f: 0 });
    for (const tc of this.map.torches) list.push({ k: (tc.row + 1) * TILE + 0.5, o: tc, f: 1 });
    for (const pr of this.props) list.push({ k: pr.sortY, o: pr, f: 2 });
    for (const c of this.pickups) list.push({ k: c.sortY, o: c, f: 2 });
    for (const e of this.enemies) list.push({ k: e.y, o: e, f: 2 });
    if (p) list.push({ k: p.y, o: p, f: 2 });
    list.sort((a, b) => a.k - b.k);
    for (const it of list) {
      if (it.f === 0) ctx.drawImage(it.o.canvas, 0, it.o.y0);
      else if (it.f === 1) drawTorch(ctx, it.o, t);
      else it.o.draw(ctx);
    }

    // lighting
    this.renderLighting(ctx, cam, W, H, ox, oy);
    ctx.setTransform(s, 0, 0, s, ox, oy);

    // bright layers above the darkness
    for (const pr of this.projectiles) pr.draw(ctx);
    for (const fx of this.effects) if (fx.layer === 'top' || !fx.layer) fx.draw(ctx, this);
    this.particles.draw(ctx);

    // overlays
    for (const pr of this.props) pr.drawOver(ctx);
    for (const e of this.enemies) e.drawOverlay(ctx);
    for (const tx of this.texts) tx.draw(ctx);
    if (p && !p.dead && G.state === 'play') {
      const a = p.aim, r0 = 30;
      const cx = p.x + Math.cos(a) * r0, cy = p.y - 14 + Math.sin(a) * r0;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = 'rgba(255,200,140,0.55)';
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -5); ctx.lineTo(-1, 0); ctx.lineTo(-3, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (this.focus) drawPrompt(ctx, this.focus);
  }

  renderLighting(ctx, cam, W, H, ox, oy) {
    const dark = this.darkness;
    if (dark <= 0.01) return;
    const k = 0.25;
    const lw = Math.ceil(W * k), lh = Math.ceil(H * k);
    let lc = Scene.lightCanvas;
    if (!lc) lc = Scene.lightCanvas = makeCanvas(lw, lh);
    if (lc.width !== lw || lc.height !== lh) { lc.width = lw; lc.height = lh; }
    const g = lc.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = this.theme.void;
    g.fillRect(0, 0, lw, lh);
    g.setTransform(cam.scale * k, 0, 0, cam.scale * k, ox * k, oy * k);
    g.globalCompositeOperation = 'destination-out';
    const spr = GlowSprites.get('#ffffff', 128);
    const lights = this.collectLights();
    for (const l of lights) {
      g.globalAlpha = clamp(l.a === undefined ? 1 : l.a, 0, 1);
      g.drawImage(spr, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    g.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = dark;
    ctx.drawImage(lc, 0, 0, W, H);
    ctx.globalAlpha = 1;
    // colored bloom of the lights
    ctx.setTransform(cam.scale, 0, 0, cam.scale, ox, oy);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.r < 40) continue;
      drawGlow(ctx, l.x, l.y, l.r * 0.55, l.color, 0.09 * (l.a === undefined ? 1 : l.a));
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function compact(arr, keep) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (keep(v)) arr[w++] = v;
  }
  arr.length = w;
}

function drawTorch(ctx, tc, t) {
  const x = tc.x, y = tc.y;
  ctx.fillStyle = '#1a1210';
  ctx.fillRect(x - 6, y - 2, 12, 9);
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(x - 8, y - 4, 16, 4);
  const f = Math.sin(t * 13 + tc.seed) * 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y - 10, 34, tc.color, 0.8);
  ctx.fillStyle = rgba(tc.color, 0.95);
  ctx.beginPath(); ctx.moveTo(x - 6, y - 3); ctx.quadraticCurveTo(x - 4, y - 14 + f, x + f * 0.5, y - 22 + f); ctx.quadraticCurveTo(x + 4, y - 14, x + 6, y - 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff0c8';
  ctx.beginPath(); ctx.ellipse(x, y - 8, 2.5, 5, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawPrompt(ctx, pr) {
  const key = Input.lastDevice === 'pad' ? 'B' : 'E';
  const label = typeof pr.prompt === 'function' ? pr.prompt(pr) : pr.prompt;
  const x = pr.promptX !== undefined ? pr.promptX : pr.x;
  const y = (pr.promptY !== undefined ? pr.promptY : pr.y - (pr.promptH || 60)) + Math.sin(G.scene.time * 4) * 2;
  ctx.font = '600 13px "Alegreya Sans", system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  const w = tw + 34, h = 24;
  ctx.fillStyle = 'rgba(14,9,16,0.86)';
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,140,0.55)'; ctx.lineWidth = 1;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 6); ctx.stroke();
  ctx.fillStyle = '#ffcf8a';
  roundRect(ctx, x - w / 2 + 5, y - 8, 16, 16, 3); ctx.fill();
  ctx.fillStyle = '#1a1012';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(key, x - w / 2 + 13, y + 0.5);
  ctx.fillStyle = '#f4e6d4';
  ctx.font = '600 13px "Alegreya Sans", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x - w / 2 + 26, y + 0.5);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Prop factories
// ---------------------------------------------------------------------------
function makeDoor(slot, next) {
  const color = rewardColor(next.reward);
  return new Prop({
    kind: 'door', x: slot.x, y: slot.y, r: 40, range: 74, sortOffset: 0.3, shadow: false,
    focusX: slot.x, focusY: slot.y + 30, promptY: slot.y - 6,
    next, locked: true, open: 0, color,
    prompt: (d) => (next.label || rewardLabel(next.reward)) + (next.kind === 'elite' ? '  ·  Fierce Chamber' : ''),
    cond: (d) => !d.locked,
    interact: (d) => Game.enterDoor(d),
    onUpdate(dt, sc, d) { d.open = approach(d.open, d.locked ? 0 : 1, dt * 2); },
    drawFn(ctx, d) {
      const x = d.x, y = d.y;
      const w = TILE * 1.7, h = WALL_H + 30;
      const top = y - h;
      // opening
      ctx.fillStyle = '#060406';
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, top + 22); ctx.quadraticCurveTo(x, top - 14, x + w / 2, top + 22); ctx.lineTo(x + w / 2, y); ctx.closePath();
      ctx.fill();
      if (d.open > 0) {
        ctx.save();
        ctx.clip();
        const g = ctx.createLinearGradient(0, top, 0, y);
        g.addColorStop(0, rgba(d.color, 0.15 * d.open));
        g.addColorStop(1, rgba(d.color, 0.75 * d.open));
        ctx.fillStyle = g;
        ctx.fillRect(x - w / 2, top - 20, w, h + 20);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const yy = y - ((d.t * 30 + i * 18) % h);
          ctx.fillStyle = rgba(d.color, 0.25 * d.open);
          ctx.fillRect(x - w / 2 + 6 + i * 13, yy, 3, 10);
        }
        ctx.restore();
      }
      // frame
      ctx.strokeStyle = d.locked ? '#4a3a3a' : rgba(d.color, 0.9);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, top + 22); ctx.quadraticCurveTo(x, top - 14, x + w / 2, top + 22); ctx.lineTo(x + w / 2, y);
      ctx.stroke();
      ctx.fillStyle = '#3a2e2e';
      ctx.fillRect(x - w / 2 - 9, top + 14, 10, h - 14);
      ctx.fillRect(x + w / 2 - 1, top + 14, 10, h - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - w / 2 - 9, top + 14, 3, h - 14);
      // floor glow
      if (d.open > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, x, y + 6, 70, d.color, 0.5 * d.open);
        ctx.restore();
      }
    },
    overFn(ctx, d) {
      const x = d.x, y = d.y - WALL_H - 38 + Math.sin(d.t * 2.5) * 3;
      ctx.save();
      ctx.globalAlpha = d.locked ? 0.75 : 1;
      if (next.kind === 'elite') {
        ctx.strokeStyle = 'rgba(255,80,70,0.9)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(x, y, 27, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#ff5a4a';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + d.t * 0.5;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26); ctx.lineTo(x + Math.cos(a + 0.12) * 34, y + Math.sin(a + 0.12) * 34); ctx.lineTo(x + Math.cos(a + 0.24) * 26, y + Math.sin(a + 0.24) * 26); ctx.fill();
        }
      }
      drawOrb(ctx, x, y, 20, d.color, d.t);
      drawRewardSymbol(ctx, next.reward.kind, x, y, 13, d.t, next.reward.patron);
      ctx.restore();
    },
    lightFn(d) { return { x: d.x, y: d.y + 10, r: 90 + d.open * 90, color: d.color, a: 0.5 + d.open * 0.5 }; },
  });
}

function makeRewardPickup(reward, x, y) {
  const color = rewardColor(reward);
  const pr = new Prop({
    kind: 'reward', x, y, r: 16, range: 64, reward, color, spawnT: 0, promptH: 78,
    prompt: () => 'Take ' + rewardLabel(reward),
    interact: (p) => Game.collectReward(p),
    onUpdate(dt, sc, p) {
      p.spawnT = Math.min(1, p.spawnT + dt * 1.5);
      if (Math.random() < 0.25) sc.particles.spawn({ x: p.x + rand(-14, 14), y: p.y - 30 + rand(-14, 14), vy: -rand(20, 50), life: 0.8, size: 2.2, color });
    },
    drawFn(ctx, p) {
      const k = ease.outBack(p.spawnT);
      const y = p.y - 34 - Math.sin(p.t * 2.6) * 4;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, p.y - 140, 0, p.y);
      g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, 0.25 * k));
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 18 * k, p.y - 140, 36 * k, 140);
      ctx.restore();
      ctx.save();
      ctx.translate(p.x, y); ctx.scale(k, k); ctx.translate(-p.x, -y);
      drawOrb(ctx, p.x, y, 19, color, p.t);
      drawRewardSymbol(ctx, reward.kind, p.x, y, 13, p.t, reward.patron);
      ctx.restore();
    },
    lightFn(p) { return { x: p.x, y: p.y - 30, r: 170, color, a: 0.9 }; },
  });
  Sound.play('pickup');
  return pr;
}

function makeFountain(x, y) {
  return new Prop({
    kind: 'fountain', x, y, r: 30, range: 70, solid: true, used: false, promptH: 70,
    prompt: () => 'Drink from the Ember Well',
    cond: (f) => !f.used,
    interact: (f) => {
      f.used = true;
      const p = G.player;
      const amt = Math.round(p.maxHp * 0.4);
      p.heal(amt, true);
      Sound.play('splash');
      G.scene.particles.burst(f.x, f.y - 30, 24, { color: ['#ffb46a', '#fff0c8'], speed: 160, life: 0.8, size: 3, vz: 80 });
    },
    drawFn(ctx, f) {
      ctx.fillStyle = '#3a2e30';
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 8, 34, 16, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4e4044';
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 14, 34, 16, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = f.used ? '#2a1a14' : '#ff9a4a';
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 15, 27, 11, 0, 0, TAU); ctx.fill();
      if (!f.used) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, f.x, f.y - 16, 60, '#ff8a3a', 0.6 + 0.1 * Math.sin(f.t * 3));
        ctx.fillStyle = 'rgba(255,240,200,0.6)';
        for (let i = 0; i < 3; i++) { const a = f.t * 1.5 + i * 2.1; ctx.beginPath(); ctx.ellipse(f.x + Math.cos(a) * 14, f.y - 15 + Math.sin(a) * 5, 4, 1.5, 0, 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      ctx.fillStyle = '#5a4a4e';
      ctx.fillRect(f.x - 5, f.y - 46, 10, 30);
      ctx.beginPath(); ctx.ellipse(f.x, f.y - 46, 12, 5, 0, 0, TAU); ctx.fill();
    },
    lightFn(f) { return f.used ? null : { x: f.x, y: f.y - 20, r: 200, color: '#ff9a4a', a: 0.9 }; },
  });
}

// ---- shop ----------------------------------------------------------------
const SHOP_LINES = [
  'Lights for sale! Lovely lights! Click-click.',
  'Mirra trades in warm things. You are very warm. Hmm.',
  'Coin for comfort, comfort for coin. Fair, yes?',
  'Down here, even a beetle needs a lantern.',
  'Buy something shiny before the dark eats it.',
];

function makeShopItems(run) {
  const items = [{ kind: 'heal', price: 55, label: 'Ember Draught', desc: 'Restore 35% Health.' }];
  const pool = [
    { kind: 'vitality', price: 115, label: 'Heart of Embers', desc: '+25 Max Health.' },
    { kind: 'blessing', price: 150, label: 'Bottled Starlight', desc: 'A random Blessing.' },
    { kind: 'fragment', price: 105, label: 'Star Fragment', desc: 'Empower a Blessing.', cond: () => offerLevelUps(run.build).length > 0 },
    { kind: 'forge', price: 165, label: 'Sunforge Coal', desc: 'Reforge your weapon.', cond: () => !run.forgeTaken[run.realm] },
    { kind: 'ash', price: 90, label: 'Ash Reliquary', desc: '+25 Ash.' },
    { kind: 'defy', price: 190, label: 'Second Flame', desc: 'Restore one revival.', cond: () => run.defies < run.maxDefies },
  ];
  const ok = shuffle(pool.filter((p) => !p.cond || p.cond()));
  for (const it of ok.slice(0, 3)) items.push(it);
  return items;
}

function makeShop(scene, cx, cy) {
  // merchant
  scene.addProp(new Prop({
    kind: 'npc', x: cx, y: cy - 70, r: 20, range: 70, solid: true, promptH: 76,
    prompt: () => 'Talk',
    interact: () => UI.say('Mirra the Peddler', pick(SHOP_LINES), '#ffd27a'),
    drawFn(ctx, p) { drawMerchant(ctx, p.x, p.y, p.t); },
    lightFn(p) { return { x: p.x + 22, y: p.y - 40, r: 220, color: '#ffd27a', a: 1 }; },
  }));
  const items = makeShopItems(G.run);
  const n = items.length;
  items.forEach((it, i) => {
    const x = cx + (i - (n - 1) / 2) * 92, y = cy + 30;
    const icon = it.kind === 'heal' ? 'vitality' : it.kind === 'defy' ? 'hearth' : it.kind === 'blessing' ? 'fragment' : it.kind;
    scene.addProp(new Prop({
      kind: 'shopitem', x, y, r: 18, range: 52, item: it, sold: false, promptH: 74,
      prompt: (p) => `${it.label} — ${it.price} gold`,
      cond: (p) => !p.sold,
      interact: (p) => Game.buyItem(p),
      drawFn(ctx, p) {
        ctx.fillStyle = '#2e2426';
        ctx.fillRect(p.x - 18, p.y - 16, 36, 18);
        ctx.fillStyle = '#4a3a3a';
        ctx.fillRect(p.x - 20, p.y - 20, 40, 6);
        if (!p.sold) {
          const y = p.y - 38 + Math.sin(p.t * 2.4) * 3;
          const col = REWARD_COLORS[icon] || '#ffd27a';
          drawOrb(ctx, p.x, y, 14, col, p.t);
          drawRewardSymbol(ctx, icon, p.x, y, 9, p.t);
        }
      },
      overFn(ctx, p) {
        if (p.sold) return;
        const afford = G.run && G.run.gold >= it.price;
        ctx.font = '700 12px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,10,0.9)';
        ctx.strokeText(`${it.price}`, p.x, p.y + 12);
        ctx.fillStyle = afford ? '#ffd76a' : '#a07a6a';
        ctx.fillText(`${it.price}`, p.x, p.y + 12);
      },
      lightFn(p) { return p.sold ? null : { x: p.x, y: p.y - 30, r: 90, color: '#ffd27a', a: 0.6 }; },
    }));
  });
}

function drawMerchant(ctx, x, y, t) {
  // Mirra: a lantern-carrying beetle peddler
  const bob = Math.sin(t * 2) * 1.5;
  ctx.fillStyle = '#2a2030';
  ctx.beginPath(); ctx.ellipse(x, y - 18 + bob, 18, 20, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3a6a';
  ctx.beginPath(); ctx.ellipse(x - 6, y - 22 + bob, 13, 17, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 6, y - 22 + bob, 13, 17, 0.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8a6aa0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y - 38 + bob); ctx.lineTo(x, y - 4 + bob); ctx.stroke();
  ctx.fillStyle = '#1a1420';
  ctx.beginPath(); ctx.arc(x, y - 40 + bob, 9, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - 4, y - 47 + bob); ctx.quadraticCurveTo(x - 10, y - 60, x - 14, y - 56); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 4, y - 47 + bob); ctx.quadraticCurveTo(x + 10, y - 60, x + 14, y - 56); ctx.stroke();
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath(); ctx.arc(x - 3, y - 41 + bob, 1.8, 0, TAU); ctx.arc(x + 3, y - 41 + bob, 1.8, 0, TAU); ctx.fill();
  // lantern
  const lx = x + 24, ly = y - 32 + Math.sin(t * 2.2) * 2;
  ctx.strokeStyle = '#6a5040'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 12, y - 28 + bob); ctx.lineTo(lx, ly - 10); ctx.stroke();
  ctx.fillStyle = '#3a2a20'; ctx.fillRect(lx - 6, ly - 10, 12, 3); ctx.fillRect(lx - 6, ly + 8, 12, 3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, lx, ly, 36, '#ffd27a', 0.9);
  ctx.fillStyle = '#fff0c0'; ctx.fillRect(lx - 4, ly - 7, 8, 15);
  ctx.restore();
}
