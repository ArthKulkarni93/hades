'use strict';
// ---------------------------------------------------------------------------
// The Ember — player character: input buffering, actions, dash, cast.
// ---------------------------------------------------------------------------

const DASH_SPEED = 1120;
const DASH_TIME = 0.155;

class Player extends Actor {
  constructor(x, y, weaponId, build) {
    super(x, y, 13);
    this.team = 'player';
    this.build = build;
    this.weaponId = weaponId;
    this.weapon = WEAPONS[weaponId] || WEAPONS.blade;
    this.stats = build.stats;
    this.maxHp = this.stats.maxHp;
    this.hp = this.maxHp;
    this.aim = -Math.PI / 2;
    this.invuln = 0; this.hurtFlash = 0;
    this.dashing = 0; this.dashDir = 0; this.dashCharges = this.stats.dashCharges; this.dashRecharge = 0; this.postDash = 0;
    this.dashStartX = x; this.dashStartY = y; this.dashHit = new Set();
    this.castCharges = this.stats.castCharges; this.castTimer = 0;
    this.action = null; this.buffer = null;
    this.speedBuffT = 0; this.speedBuff = 0; this.veilT = 0;
    this.barrier = 0; this.barrierT = 0;
    this.moveX = 0; this.moveY = 0;
    this.anim = rand(10); this.walkT = 0; this.ghostT = 0;
    this.deathT = 0;
    this.noCastT = 0;
    this.weapon.init(this);
  }

  applyStats(s) {
    const prevMax = this.maxHp;
    this.stats = s;
    this.maxHp = Math.round(s.maxHp);
    if (this.maxHp > prevMax) this.hp += this.maxHp - prevMax;
    this.hp = Math.min(this.hp, this.maxHp);
    if (this.dashCharges > s.dashCharges) this.dashCharges = s.dashCharges;
    if (this.castCharges > s.castCharges) this.castCharges = s.castCharges;
  }

  get moving() { return Math.abs(this.moveX) + Math.abs(this.moveY) > 0.1; }

  readInput() {
    const mv = Input.moveVec();
    this.moveX = mv.x; this.moveY = mv.y;
    const lockAim = this.action && this.action.lockAim;
    if (!lockAim) {
      if (Input.aimMode === 'mouse') {
        const w = G.screenToWorld(Input.mouse.x, Input.mouse.y);
        this.aim = Math.atan2(w.y - (this.y - 14), w.x - this.x);
      } else if (Input.aimMode === 'touch') {
        const e = nearestEnemy(this.x, this.y, 470);
        if (e) this.aim = angleTo(this.x, this.y - 14, e.x, e.y - 10);
        else if (this.moving) this.aim = Math.atan2(mv.y, mv.x);
      } else {
        let a = null;
        if (Input.aimMode === 'stick') a = Input.stickAim();
        if (a === null && this.moving) a = Math.atan2(mv.y, mv.x);
        if (a !== null) this.aim = this.assistAim(a);
      }
    }
    if (Input.pressed('dash')) this.buffer = { k: 'dash', t: 0.16 };
    else if (Input.pressed('attack')) this.buffer = { k: 'attack', t: 0.24 };
    else if (Input.pressed('special')) this.buffer = { k: 'special', t: 0.24 };
    else if (Input.pressed('cast')) this.buffer = { k: 'cast', t: 0.24 };
  }

  // gentle aim assist for keyboard/gamepad aiming
  assistAim(a) {
    if (!G.scene) return a;
    let best = null, bestScore = 0.42;
    for (const e of G.scene.enemies) {
      if (e.dead || e.spawning || e.untargetable) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d > 420) continue;
      const diff = Math.abs(angleDiff(a, angleTo(this.x, this.y, e.x, e.y)));
      const score = diff + d / 2500;
      if (diff < 0.42 && score < bestScore) { bestScore = score; best = e; }
    }
    return best ? angleTo(this.x, this.y - 14, best.x, best.y - 10) : a;
  }

  startAction(o) {
    if (this.action && this.action.onEnd) this.action.onEnd(this.action);
    this.action = Object.assign({ t: 0, dur: 0.3, lock: 0.2, dashCancel: 0.1, move: 0.5, events: [], hold: false }, o);
    this.action.events = (o.events || []).map((e) => ({ t: e.t, fn: e.fn, done: false }));
  }

  cancelAction() {
    if (this.action && this.action.onEnd) this.action.onEnd(this.action);
    this.action = null;
  }

  startDash() {
    const full = this.dashCharges >= this.stats.dashCharges;
    this.dashCharges--;
    if (full) this.dashRecharge = this.stats.dashRecharge;
    this.dashDir = this.moving ? Math.atan2(this.moveY, this.moveX) : this.aim;
    this.dashing = DASH_TIME;
    this.dashStartX = this.x; this.dashStartY = this.y;
    this.dashHit.clear();
    this.ghostT = 0;
    Sound.play('dash');
    G.scene.particles.burst(this.x, this.y, 10, { color: ['#ffb46a', '#ffffff'], speed: 160, life: 0.3, size: 2.5, angle: this.dashDir + Math.PI, spread: 0.8 });
    G.scene.particles.burst(this.x, this.y, 6, { color: '#2a2228', speed: 50, life: 0.6, size: 7, type: 'smoke', add: false });
  }

  endDash() {
    this.postDash = 0.22;
    this.invuln = Math.max(this.invuln, 0.06);
    if (G.run && this.build === G.run.build) this.build.onDash(this, this.dashStartX, this.dashStartY, this.x, this.y);
  }

  tryCast() {
    if (this.castCharges <= 0) {
      if (this.noCastT <= 0) {
        this.noCastT = 0.6;
        Sound.play('deny');
        G.scene.addText(this.x, this.y - 46, 'NO FLARES', '#c8a898', 12, { life: 0.6, vy: -40 });
      }
      return true;
    }
    const full = this.castCharges >= this.stats.castCharges;
    this.castCharges--;
    if (full) this.castTimer = this.stats.castRegen;
    const slot = this.build.slots.cast;
    const def = slot ? BLESSING_BY_ID[slot] : null;
    const ang = this.aim;
    this.startAction({
      name: 'cast', dur: 0.24, lock: 0.15, dashCancel: 0.06, move: 0.5,
      events: [{ t: 0.04, fn: () => {
        if (def && def.cast && CASTS[def.cast]) CASTS[def.cast](this, ang, this.build.vals(def.id));
        else CASTS.ember(this, ang);
        G.scene.addEffect(FX.flash(this.x + Math.cos(ang) * 16, this.y - 14 + Math.sin(ang) * 16, 40, '#ffb46a', 0.15));
      } }],
    });
    return true;
  }

  processBuffer() {
    const b = this.buffer;
    if (!b) return;
    const a = this.action;
    if (b.k === 'dash') {
      if (this.dashCharges > 0 && this.dashing <= 0 && (!a || a.t >= a.dashCancel)) {
        if (a) this.cancelAction();
        this.buffer = null;
        this.startDash();
      }
      return;
    }
    if (this.dashing > 0) return;
    if (a && a.t < a.lock) return;
    let ok = false;
    if (b.k === 'attack') ok = this.postDash > 0 && this.weapon.dashAttack ? this.weapon.dashAttack(this) : this.weapon.attack(this);
    else if (b.k === 'special') ok = this.weapon.special(this);
    else if (b.k === 'cast') ok = this.tryCast();
    if (ok) { this.buffer = null; this.postDash = 0; }
  }

  heal(n, show = true) {
    if (this.dead) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n * (this.stats.healMult || 1));
    const gained = Math.round(this.hp - before);
    this.hp = Math.round(this.hp);
    if (show && gained > 0 && G.scene) {
      G.scene.addText(this.x, this.y - 46, `+${gained}`, '#7cf08e', 18, { life: 1, vy: -50 });
      G.scene.particles.burst(this.x, this.y - 16, 14, { color: ['#7cf08e', '#d8ffd0'], speed: 90, life: 0.8, size: 3, vz: 60 });
      Sound.play('heal');
    }
    return gained;
  }

  onLethal() {
    const run = G.run;
    if (run && run.defies > 0) {
      run.defies--;
      this.hp = Math.round(this.maxHp * 0.4);
      this.invuln = 2.2;
      Sound.play('defy');
      const sc = G.scene;
      sc.addText(this.x, this.y - 54, 'SECOND FLAME', '#ffd27a', 22, { life: 1.8, vy: -30, pop: 2 });
      sc.addEffect(FX.ring(this.x, this.y - 10, 10, 280, 0.6, '#ffd27a', 8));
      sc.addEffect(FX.flash(this.x, this.y - 10, 300, '#ffb347', 0.6));
      sc.particles.burst(this.x, this.y - 14, 50, { color: ['#ffd27a', '#ff7a2e', '#ffffff'], speed: 380, life: 0.9, size: 4 });
      for (const e of enemiesInRadius(this.x, this.y, 280)) {
        if (e.immovable) continue;
        const a = angleTo(this.x, this.y, e.x, e.y);
        e.kx += Math.cos(a) * 700 / e.mass; e.ky += Math.sin(a) * 700 / e.mass;
        e.stun = Math.max(e.stun || 0, 0.8);
      }
      for (const pr of sc.projectiles) if (pr.team === 'enemy') pr.die(sc, 'cleared');
      G.hitstop = 0.3;
      G.shake(12);
      return;
    }
    this.hp = 0;
    this.dead = true;
    this.deathT = 0;
    this.cancelAction();
    Game.onPlayerDeath();
  }

  update(dt, sc) {
    this.anim += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.postDash > 0) this.postDash -= dt;
    if (this.speedBuffT > 0) this.speedBuffT -= dt;
    if (this.veilT > 0) this.veilT -= dt;
    if (this.noCastT > 0) this.noCastT -= dt;
    if (this.buffer) { this.buffer.t -= dt; if (this.buffer.t <= 0) this.buffer = null; }
    const s = this.stats;
    if (this.dashCharges < s.dashCharges && this.dashing <= 0) {
      this.dashRecharge -= dt;
      if (this.dashRecharge <= 0) { this.dashCharges++; this.dashRecharge = s.dashRecharge; }
    }
    if (this.castCharges < s.castCharges) {
      this.castTimer -= dt;
      if (this.castTimer <= 0) {
        this.castCharges++;
        this.castTimer = s.castRegen;
        sc.particles.burst(this.x, this.y - 16, 5, { color: '#ffb46a', speed: 60, life: 0.4, size: 2 });
      }
    }
    if (s.barrierMax > 0 && this.barrier < s.barrierMax && s.barrierRecharge > 0) {
      this.barrierT -= dt;
      if (this.barrierT <= 0) {
        this.barrier = s.barrierMax;
        Sound.play('barrier');
        sc.addEffect(FX.ring(this.x, this.y - 16, 40, 18, 0.3, '#bfe6ff', 3));
      }
    }
    this.weapon.update(this, dt);
    if (this.ws.swing) this.ws.swing.t += dt;

    if (this.dead) {
      this.deathT += dt;
      this.kx *= Math.exp(-6 * dt); this.ky *= Math.exp(-6 * dt);
      this.x += this.kx * dt; this.y += this.ky * dt;
      sc.map.collide(this, this.r, true);
      if (Math.random() < 0.5 && this.deathT < 1.2) sc.particles.spawn({ x: this.x + rand(-8, 8), y: this.y - 20 - rand(10), vx: rand(-20, 20), vy: -rand(30, 80), life: 0.8, size: 3, color: pick(['#ff7a2e', '#ffb347', '#5a4a4a']) });
      return;
    }

    this.processBuffer();

    let mvx = 0, mvy = 0;
    if (this.dashing > 0) {
      this.dashing -= dt;
      mvx = Math.cos(this.dashDir) * DASH_SPEED;
      mvy = Math.sin(this.dashDir) * DASH_SPEED;
      this.vx = mvx * 0.25; this.vy = mvy * 0.25;
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.028;
        const gx = this.x, gy = this.y, ga = this.aim;
        sc.addEffect(FX.ghost((ctx) => drawEmberSilhouette(ctx, gx, gy, ga), 0.22));
      }
      if (Math.random() < 0.8) sc.particles.spawn({ x: this.x + rand(-6, 6), y: this.y - rand(4, 24), vx: -mvx * 0.05, vy: -mvy * 0.05, life: 0.35, size: 3, color: pick(['#ff9a4a', '#ffd27a']) });
      if (s.dashTrample > 0 || s.dashThunder > 0) this.dashContact(sc);
      if (this.dashing <= 0) { this.dashing = 0; this.endDash(); }
    } else {
      let sp = s.speed * (this.speedBuffT > 0 ? 1 + this.speedBuff : 1);
      const a = this.action;
      if (a) {
        a.t += dt;
        for (const ev of a.events) if (!ev.done && a.t >= ev.t) { ev.done = true; ev.fn(); }
        if (a.update) a.update(dt, a);
        sp *= a.move;
        if (a.lunge && a.t < a.lunge.time) {
          mvx += Math.cos(a.lunge.angle) * a.lunge.speed;
          mvy += Math.sin(a.lunge.angle) * a.lunge.speed;
        }
        if (this.action === a && a.t >= a.dur && !a.hold) { if (a.onEnd) a.onEnd(a); this.action = null; }
      }
      this.vx = damp(this.vx, this.moveX * sp, 20, dt);
      this.vy = damp(this.vy, this.moveY * sp, 20, dt);
      mvx += this.vx; mvy += this.vy;
      if (this.moving) this.walkT += dt;
    }

    this.kx *= Math.exp(-9 * dt); this.ky *= Math.exp(-9 * dt);
    const dx = (mvx + this.kx) * dt, dy = (mvy + this.ky) * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
    for (let i = 0; i < steps; i++) {
      this.x += dx / steps; this.y += dy / steps;
      sc.map.collide(this, this.r, true);
    }
  }

  dashContact(sc) {
    const s = this.stats;
    for (const e of sc.enemies) {
      if (e.dead || e.spawning || this.dashHit.has(e)) continue;
      if (dist2(this.x, this.y, e.x, e.y) > (this.r + e.r + 16) ** 2) continue;
      this.dashHit.add(e);
      const side = angleDiff(this.dashDir, angleTo(this.x, this.y, e.x, e.y)) > 0 ? 1 : -1;
      if (s.dashTrample > 0) hitEnemy(e, s.dashTrample, { source: 'dash', angle: this.dashDir + side * 1.2, knock: 380, heavy: true });
      if (s.dashThunder > 0) { const tgt = e; sc.after(0.05, () => { if (!tgt.dead) strikeLightning(tgt.x, tgt.y, s.dashThunder, 40); }); }
    }
  }

  light() {
    const f = 1 + Math.sin(this.anim * 9) * 0.03 + Math.sin(this.anim * 23) * 0.02;
    return { x: this.x, y: this.y - 20, r: (this.dead ? Math.max(0, 260 - this.deathT * 160) : 270) * f, color: '#ff9a4a' };
  }

  drawShadow(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 1, 13, 5, 0, 0, TAU); ctx.fill();
  }

  draw(ctx) {
    const t = this.anim;
    if (this.dead) {
      const k = clamp(this.deathT / 1.1, 0, 1);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      drawEmberBody(ctx, this.x, this.y + k * 6, this.aim, t, 0, 1 - k * 0.8, false);
      ctx.restore();
      return;
    }
    const blink = this.invuln > 0.08 && this.dashing <= 0 && this.hurtFlash <= 0.25 && Math.floor(t * 22) % 2 === 0 && this.invuln < 2.5;
    const bob = this.moving && this.dashing <= 0 ? Math.sin(this.walkT * 15) * 1.6 : Math.sin(t * 3) * 0.7;
    const behind = Math.sin(this.aim) < -0.35;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    if (behind) this.weapon.draw(ctx, this, t);
    drawEmberBody(ctx, this.x, this.y, this.aim, t, bob, 1, this.hurtFlash > 0);
    if (!behind) this.weapon.draw(ctx, this, t);
    if (this.barrier > 0) {
      ctx.strokeStyle = rgba('#bfe6ff', 0.5 + 0.2 * Math.sin(t * 5));
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(this.x, this.y - 18, 20, 26, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

// The Ember's look: a small charcoal-cloaked figure with a living flame for a head
function drawEmberBody(ctx, x, y, aim, t, bob, flameScale = 1, hurt = false) {
  const faceX = Math.cos(aim), faceY = Math.sin(aim);
  ctx.save();
  ctx.translate(x, y);
  // cloak
  const sway = Math.sin(t * 4) * 1.2;
  ctx.fillStyle = hurt ? '#6a2a2a' : '#262030';
  ctx.beginPath();
  ctx.moveTo(-12 + sway * 0.3, 0);
  ctx.quadraticCurveTo(-13, -12 + bob, -7, -21 + bob);
  ctx.lineTo(7, -21 + bob);
  ctx.quadraticCurveTo(13, -12 + bob, 12 + sway * 0.3, 0);
  ctx.quadraticCurveTo(6, 3, 0, 1);
  ctx.quadraticCurveTo(-6, 3, -12 + sway * 0.3, 0);
  ctx.closePath();
  ctx.fill();
  // rim light from the head flame
  ctx.strokeStyle = 'rgba(255,150,70,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-7, -21 + bob); ctx.quadraticCurveTo(-13, -12 + bob, -12, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7, -21 + bob); ctx.quadraticCurveTo(13, -12 + bob, 12, -2); ctx.stroke();
  // collar
  ctx.fillStyle = '#3a2c3c';
  ctx.beginPath(); ctx.ellipse(0, -20 + bob, 9, 3.5, 0, 0, TAU); ctx.fill();
  // flame head
  const hy = -29 + bob;
  const s = flameScale;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, 0, hy, 34 * s, '#ff7a2e', 0.55);
  ctx.globalCompositeOperation = 'source-over';
  const f1 = Math.sin(t * 11) * 2, f2 = Math.sin(t * 17 + 1) * 1.6, f3 = Math.sin(t * 7 + 2) * 1.2;
  const layers = [
    { c: '#ff6a1f', w: 10, h: 20 + f1, ox: f3 * 0.5 },
    { c: '#ffa13d', w: 7.5, h: 15 + f2, ox: f3 * 0.3 },
    { c: '#ffe7a8', w: 4.5, h: 9 + f1 * 0.5, ox: 0 },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.c;
    ctx.beginPath();
    ctx.moveTo(-L.w * s, hy + 4);
    ctx.bezierCurveTo(-L.w * s, hy - L.h * 0.3 * s, (L.ox - 2) * s, hy - L.h * 0.6 * s, (L.ox - faceX * 2) * s, hy - L.h * s);
    ctx.bezierCurveTo((L.ox + 2) * s, hy - L.h * 0.6 * s, L.w * s, hy - L.h * 0.3 * s, L.w * s, hy + 4);
    ctx.quadraticCurveTo(0, hy + 8 * s, -L.w * s, hy + 4);
    ctx.fill();
  }
  // eyes
  if (s > 0.4) {
    ctx.fillStyle = '#3a1406';
    const ex = faceX * 3.2, ey = hy + 1 + faceY * 1.5;
    ctx.beginPath(); ctx.ellipse(ex - 3, ey, 1.4, 2.2, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex + 3, ey, 1.4, 2.2, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawEmberSilhouette(ctx, x, y, aim) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ff7a2e';
  ctx.beginPath();
  ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-13, -12, -7, -21); ctx.lineTo(7, -21); ctx.quadraticCurveTo(13, -12, 12, 0); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffb347';
  ctx.beginPath(); ctx.ellipse(0, -29, 8, 11, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
