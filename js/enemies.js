'use strict';
// ---------------------------------------------------------------------------
// Enemies: the Enemy actor, movement helpers, and every foe of the three
// realms. Attacks are generator functions: `yield` waits one frame and
// receives dt; `yield* wait(s)` waits s seconds.
// ---------------------------------------------------------------------------

class Enemy extends Actor {
  constructor(def, x, y, opts = {}) {
    super(x, y, def.r);
    this.def = def;
    this.type = def.id;
    this.team = 'enemy';
    const hpScale = opts.hpScale || 1;
    this.maxHp = this.hp = Math.round(def.hp * hpScale);
    this.elite = !!opts.elite;
    this.dmgMult = 1;
    if (this.elite) {
      this.maxHp = this.hp = Math.round(this.maxHp * 1.7);
      this.r = Math.round(def.r * 1.18);
      this.maxArmor = this.armor = Math.round(this.maxHp * 0.6);
      this.dmgMult = 1.25;
    }
    if (def.armor) this.maxArmor = this.armor = Math.round(def.armor * hpScale);
    this.speed = def.speed * (this.elite ? 1.08 : 1);
    this.mass = (def.mass || 1) * (this.elite ? 1.4 : 1);
    this.flinch = !!def.flinch && !this.elite;
    this.flying = !!def.flying;
    this.color = def.color;
    this.projColor = def.projColor;
    this.deathColors = def.deathColors;
    this.shieldArc = def.shieldArc || 0;
    this.hitOffset = def.flying ? 12 : 0;
    this.shootOffset = def.shootOffset !== undefined ? def.shootOffset : def.flying ? 22 : 14;
    this.isBoss = !!def.boss;
    this.immovable = !!def.immovable;
    this.action = null;
    this.stun = 0;
    this.spawnT = 0.45;
    this.thinkT = rand(0.5, 1.1);
    this.anim = rand(10);
    this.wind = 0;
    this.losT = 0; this.hasLos = true; this.hasShot = true;
    this.strafeDir = chance(0.5) ? 1 : -1; this.strafeT = rand(1, 2.5);
    this.contactCd = 0;
    this.mem = {};
    this.lastHitT = 0;
    const p = G.player;
    this.facing = p ? angleTo(x, y, p.x, p.y) : Math.PI / 2;
    if (def.init) def.init(this);
  }

  dmg(base) { return base * this.dmgMult; }
  cancelAction() { this.action = null; this.actionId++; this.wind = 0; this.untargetable = false; if (!this.isBoss) this.invuln = false; if (this.def.onCancel) this.def.onCancel(this); }
  doAction(gen) { this.actionId++; this.action = gen; }

  update(dt, sc) {
    this.anim += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.lastHitT > 0) this.lastHitT -= dt;
    if (this._immuneT > 0) this._immuneT -= dt;
    if (this._blockT > 0) this._blockT -= dt;
    if (this.vulnerable > 0) this.vulnerable -= dt;
    if (this.contactCd > 0) this.contactCd -= dt;
    updateStatus(this, dt);
    if (this.dead) return;
    const p = G.player;
    this.losT -= dt;
    if (this.losT <= 0 && p) {
      this.losT = rand(0.18, 0.3);
      this.hasLos = sc.map.walkLos(this.x, this.y, p.x, p.y, this.r * 0.7);
      this.hasShot = sc.map.los(this.x, this.y - 10, p.x, p.y - 10);
    }
    const sm = speedMultOf(this);
    const frozen = this.st.frozen > 0;
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      this.vx = this.vy = 0;
    } else if (frozen) {
      this.vx = this.vy = 0;
    } else if (this.stun > 0) {
      this.stun -= dt;
      this.vx *= 0.8; this.vy *= 0.8;
    } else if (p && !p.dead) {
      const adt = dt * sm;
      if (this.action) {
        const r = this.action.next(adt);
        if (r.done) { this.action = null; this.wind = 0; }
      } else {
        this.thinkT -= adt;
        this.def.ai(this, adt, sc);
      }
    } else {
      this.vx *= 0.9; this.vy *= 0.9;
    }
    // physics
    const fr = this.def.friction || 7;
    this.kx *= Math.exp(-fr * dt); this.ky *= Math.exp(-fr * dt);
    const mvx = frozen ? 0 : this.vx * sm, mvy = frozen ? 0 : this.vy * sm;
    const dx = (mvx + this.kx) * dt, dy = (mvy + this.ky) * dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(5, this.r * 0.5)));
    const kspeed = Math.hypot(this.kx, this.ky);
    for (let i = 0; i < steps; i++) {
      this.x += dx / steps; this.y += dy / steps;
      const hit = sc.map.collide(this, this.r, true);
      if (hit) {
        if (this.slamT > 0 && kspeed > 230) { this.onWallSlam(hit); break; }
        if (this.onWall) this.onWall(hit);
      }
    }
    if (this.slamT > 0) this.slamT -= dt;
    // contact damage
    if (this.def.contact && p && !p.dead && !frozen && this.spawnT <= 0 && this.stun <= 0 && this.contactCd <= 0) {
      if (dist2(this.x, this.y, p.x, p.y) < (this.r + p.r - 2) ** 2) {
        if (damagePlayer(this.dmg(this.def.contact), { angle: angleTo(this.x, this.y, p.x, p.y), enemy: this })) this.contactCd = 0.9;
      }
    }
  }

  onWallSlam(hit) {
    this.slamT = 0;
    const sc = G.scene;
    const b = G.run && G.run.build;
    Sound.play('thud');
    sc.particles.burst(this.x - hit.nx * this.r, this.y - hit.ny * this.r, 12, { color: ['#c8c0b8', '#8ff5d2'], speed: 200, life: 0.4, size: 3, type: 'shard' });
    G.shake(3);
    if (b && b.has('stag_wall')) hitEnemy(this, b.vals('stag_wall').dmg, { source: 'wall', secondary: true, heavy: true });
    if (b && b.has('duo_northwind') && !this.dead) {
      hitEnemy(this, b.vals('duo_northwind').dmg, { source: 'frost', secondary: true });
      if (!this.isBoss && !this.dead) freezeEnemy(this, 1.5);
    }
    this.kx *= -0.25; this.ky *= -0.25;
  }

  // ---- movement helpers ----
  dirTo(a, speedMult = 1) {
    this.vx = Math.cos(a) * this.speed * speedMult;
    this.vy = Math.sin(a) * this.speed * speedMult;
  }
  avoid(a, probe = 44) {
    const map = G.scene.map;
    const offs = [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.3, -2.3, Math.PI];
    for (const o of offs) {
      const aa = a + o * this.strafeDir;
      const px = this.x + Math.cos(aa) * probe, py = this.y + Math.sin(aa) * probe;
      if (!map.blockedAt(px, py)) return aa;
    }
    return a;
  }
  chase(speedMult = 1) {
    const p = G.player;
    const map = G.scene.map;
    if (this.hasLos) { this.dirTo(this.avoid(angleTo(this.x, this.y, p.x, p.y), this.r + 14), speedMult); return; }
    const wp = map.flowStep(this.x, this.y);
    if (wp) this.dirTo(angleTo(this.x, this.y, wp.x, wp.y), speedMult);
    else this.dirTo(this.avoid(angleTo(this.x, this.y, p.x, p.y)), speedMult);
  }
  keepAway(min, max, dt, speedMult = 1) {
    const p = G.player;
    const d = dist(this.x, this.y, p.x, p.y);
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = rand(1.2, 2.6); }
    if (d > max || !this.hasLos) { this.chase(speedMult); return; }
    const a = angleTo(this.x, this.y, p.x, p.y);
    let want;
    if (d < min) want = a + Math.PI + this.strafeDir * 0.6;
    else want = a + this.strafeDir * Math.PI / 2;
    this.dirTo(this.avoid(want), speedMult * (d < min ? 1 : 0.55));
  }
  faceToward(a, rate, dt) { this.facing = rate ? rotateToward(this.facing, a, rate * dt) : a; }
  touching(extra = 0) {
    const p = G.player;
    return p && !p.dead && dist2(this.x, this.y, p.x, p.y) < (this.r + p.r + extra) ** 2;
  }
  angleToPlayer() { const p = G.player; return angleTo(this.x, this.y, p.x, p.y); }
  distToPlayer() { const p = G.player; return dist(this.x, this.y, p.x, p.y); }

  light() {
    if (this.def.light) return this.def.light(this);
    if (!this.def.glow) return { x: this.x, y: this.y - this.r, r: 95, color: '#ffffff', a: 0.55 };
    return { x: this.x, y: this.y - this.r, r: Math.max(95, this.def.glow) * (1 + (this.wind || 0) * 0.5), color: this.def.glowColor || this.color, a: 0.9 };
  }

  drawShadow(ctx) {
    const a = this.flying ? 0.22 : 0.35;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath(); ctx.ellipse(this.x, this.y + 1, this.r * (this.flying ? 0.8 : 1.05), this.r * 0.38, 0, 0, TAU); ctx.fill();
  }

  draw(ctx) {
    const t = this.anim;
    const sk = this.spawnT > 0 ? ease.outBack(clamp(1 - this.spawnT / 0.45, 0, 1)) : 1;
    let ox = 0;
    if (this.wind > 0) ox = Math.sin(t * 70) * this.wind * 1.8;
    const frozen = this.st.frozen > 0;
    const flash = this.flash > 0;
    const C = flash ? FLASH_TINT : frozen ? ICE_TINT : NO_TINT;
    ctx.save();
    ctx.translate(this.x + ox, this.y);
    if (sk !== 1) ctx.scale(sk, sk);
    if (this.elite) {
      ctx.strokeStyle = rgba('#ffe9a0', 0.5 + 0.25 * Math.sin(t * 5));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 1, this.r * 1.25, this.r * 0.5, 0, 0, TAU); ctx.stroke();
    }
    if (this.alpha !== undefined) ctx.globalAlpha = this.alpha;
    this.def.draw(ctx, this, t, C);
    ctx.restore();
    if (frozen) {
      ctx.save();
      ctx.fillStyle = 'rgba(170,220,255,0.28)';
      ctx.strokeStyle = 'rgba(230,248,255,0.75)';
      ctx.lineWidth = 1.5;
      const h = this.r * 2.3, w = this.r * 1.35;
      const by = this.y - (this.flying ? this.r * 1.1 + 10 : this.r * 0.9);
      ctx.beginPath();
      ctx.moveTo(this.x - w, by + h * 0.25); ctx.lineTo(this.x - w * 0.6, by - h * 0.5); ctx.lineTo(this.x + w * 0.5, by - h * 0.55);
      ctx.lineTo(this.x + w, by + h * 0.15); ctx.lineTo(this.x + w * 0.7, by + h * 0.55); ctx.lineTo(this.x - w * 0.7, by + h * 0.5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  drawOverlay(ctx) {
    if (this.dead || this.spawnT > 0.2 || this.isBoss) return;
    if (this.isDummy) { drawStatusIcons(ctx, this, this.x, this.y - 70); return; }
    const showBar = this.lastHitT > 0 || this.elite || this.armor > 0 || this.hp < this.maxHp;
    const top = this.y - this.r * 2 - (this.flying ? 26 : 14) - (this.def.barOffset || 0);
    if (showBar) {
      const w = clamp(this.r * 2.4, 32, 72);
      const x0 = this.x - w / 2;
      ctx.fillStyle = 'rgba(10,6,12,0.8)';
      ctx.fillRect(x0 - 1, top - 1, w + 2, 6);
      ctx.fillStyle = '#d8344a';
      ctx.fillRect(x0, top, w * clamp(this.hp / this.maxHp, 0, 1), 4);
      if (this.maxArmor > 0 && this.armor > 0) {
        ctx.fillStyle = 'rgba(10,6,12,0.8)';
        ctx.fillRect(x0 - 1, top - 6, w + 2, 5);
        ctx.fillStyle = '#c8c0b4';
        ctx.fillRect(x0, top - 5, w * clamp(this.armor / this.maxArmor, 0, 1), 3);
      }
    }
    drawStatusIcons(ctx, this, this.x, top - (this.armor > 0 ? 12 : 6));
  }
}

const NO_TINT = (c) => c;
const FLASH_TINT = () => '#ffffff';
const ICE_TINT = (c) => (c && c[0] === '#' ? mixHex(c, '#cfeeff', 0.55) : 'rgba(200,235,255,0.85)');

function drawStatusIcons(ctx, e, x, y) {
  const st = e.st;
  let items = 0;
  if (st.chill > 0) items++;
  if (st.blight > 0) items++;
  if (st.hex > 0) items++;
  if (!items) return;
  let cx = x - (items - 1) * 11;
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (st.chill > 0) {
    ctx.fillStyle = 'rgba(10,20,30,0.75)';
    ctx.beginPath(); ctx.arc(cx, y - 6, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a8dcff'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; ctx.moveTo(cx + Math.cos(a) * 5, y - 6 + Math.sin(a) * 5); ctx.lineTo(cx - Math.cos(a) * 5, y - 6 - Math.sin(a) * 5); }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(st.chill), cx + 7, y - 1);
    cx += 22;
  }
  if (st.blight > 0) {
    ctx.fillStyle = 'rgba(10,25,12,0.75)';
    ctx.beginPath(); ctx.arc(cx, y - 6, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7cf08e';
    ctx.beginPath(); ctx.moveTo(cx, y - 12); ctx.quadraticCurveTo(cx + 5, y - 5, cx, y - 2); ctx.quadraticCurveTo(cx - 5, y - 5, cx, y - 12); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(st.blight), cx + 7, y - 1);
    cx += 22;
  }
  if (st.hex > 0) {
    const k = st.hex / 1.2;
    ctx.fillStyle = 'rgba(20,8,30,0.8)';
    ctx.beginPath(); ctx.arc(cx, y - 6, 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c99bff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, y - 6, 7, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    ctx.fillStyle = '#e8d4ff';
    ctx.beginPath(); ctx.arc(cx, y - 6, 2.5, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// shared attack pieces
// ---------------------------------------------------------------------------
function* windup(e, dur) {
  e.wind = 0.01;
  let t = 0;
  while (t < dur) {
    const dt = yield;
    t += dt;
    e.wind = clamp(t / dur, 0.01, 1);
  }
  e.wind = 0;
}

function* lungeAt(e, ang, speed, time, dmg) {
  let t = 0, hit = false;
  while (t < time) {
    const dt = yield;
    t += dt;
    e.vx = Math.cos(ang) * speed; e.vy = Math.sin(ang) * speed;
    if (!hit && e.touching(4)) hit = !!damagePlayer(e.dmg(dmg), { angle: ang, enemy: e, knock: 260 });
  }
  e.vx = e.vy = 0;
  return hit;
}

function trackLine(e, len, width, dur, trackFor, color = '#ff4a3a') {
  const tl = FX.telegraphLine(e.x, e.y, e.angleToPlayer(), len, width, dur, color, e, (fx, dt) => {
    fx.x = e.x; fx.y = e.y;
    if (fx.t < trackFor && G.player) fx.angle = rotateToward(fx.angle, e.angleToPlayer(), 4 * dt);
  });
  G.scene.addEffect(tl);
  return tl;
}

// ---------------------------------------------------------------------------
// Enemy definitions
// ---------------------------------------------------------------------------
const ENEMIES = {
  // ======================= THE CINDER PIT ================================
  cinderling: {
    id: 'cinderling', name: 'Cinderling', r: 12, hp: 34, speed: 132, mass: 0.8, flinch: true, cost: 1,
    color: '#ff7a3d', glow: 60, deathColors: ['#ff7a3d', '#3a2a2a', '#ffd27a'],
    ai(e, dt) {
      const d = e.distToPlayer();
      e.chase(1);
      e.facing = e.angleToPlayer();
      if (d < 165 && e.hasLos && e.thinkT <= 0) e.doAction(ENEMIES.cinderling.lunge(e));
    },
    *lunge(e) {
      e.vx = e.vy = 0;
      const ang = e.angleToPlayer();
      e.facing = ang;
      G.scene.addEffect(FX.telegraphLine(e.x, e.y, ang, 150, e.r * 2, 0.5, '#ff5a3a', e));
      yield* windup(e, 0.5);
      Sound.play('swing', { pitch: 1.4 });
      yield* lungeAt(e, ang, 640, 0.22, 9);
      yield* wait(0.55);
      e.thinkT = rand(0.5, 1.1);
    },
    draw(ctx, e, t, C) {
      const moving = Math.hypot(e.vx, e.vy) > 10;
      const hop = moving ? Math.abs(Math.sin(t * 12)) * 4 : 0;
      const sq = moving ? 1 + Math.sin(t * 24) * 0.07 : 1;
      const r = e.r;
      ctx.translate(0, -hop);
      ctx.fillStyle = C('#5e4241');
      ctx.strokeStyle = C('#1a0c0c'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.85, r * 1.05 * sq, r * 0.92 / sq, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C('rgba(255,170,120,0.35)'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.85, r * 0.95 * sq, r * 0.82 / sq, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = C('#7a5650');
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 1.25, r * 0.45, r * 0.25, -0.4, 0, TAU); ctx.fill();
      const glow = clamp(0.55 + 0.35 * Math.sin(t * 6) + e.wind * 0.8, 0, 1);
      ctx.strokeStyle = C(rgba('#ff7a3d', glow));
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 0.25, -r * 0.95); ctx.lineTo(r * 0.1, -r * 0.6); ctx.lineTo(r * 0.55, -r * 1.15); ctx.stroke();
      const fx = Math.cos(e.facing) * r * 0.35;
      ctx.fillStyle = C(e.wind > 0 ? '#ffffff' : '#ffd27a');
      ctx.beginPath(); ctx.arc(fx - 4, -r * 0.95, 2.1, 0, TAU); ctx.arc(fx + 4, -r * 0.95, 2.1, 0, TAU); ctx.fill();
      if (e.wind > 0) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, -r * 0.8, r * 3, '#ff5a1a', e.wind * 0.7); }
    },
  },

  wisp: {
    id: 'wisp', name: 'Ash Wisp', r: 13, hp: 28, speed: 96, flying: true, flinch: true, cost: 1.5,
    color: '#ffb36b', projColor: '#ff8a3a', glow: 80, deathColors: ['#c8c0b8', '#ff8a3a', '#5a5050'],
    ai(e, dt) {
      e.keepAway(200, 340, dt);
      e.facing = e.angleToPlayer();
      if (e.thinkT <= 0 && e.hasShot && e.distToPlayer() < 520) e.doAction(ENEMIES.wisp.volley(e));
      if (Math.random() < 0.3) G.scene.particles.spawn({ x: e.x + rand(-6, 6), y: e.y - 18 + rand(-4, 4), vx: rand(-10, 10), vy: rand(-30, -10), life: 0.8, size: 4, color: '#3a3438', type: 'smoke', add: false, drag: 1 });
    },
    *volley(e) {
      e.vx *= 0.3; e.vy *= 0.3;
      yield* windup(e, 0.55);
      const n = e.elite ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const a = e.angleToPlayer() + rand(-0.06, 0.06);
        enemyShoot(e, a, 235, e.dmg(8), { r: 7 });
        Sound.play('enemyShoot');
        yield* wait(0.13);
      }
      yield* wait(0.35);
      e.thinkT = rand(1.5, 2.3);
    },
    draw(ctx, e, t, C) {
      const fy = -22 + Math.sin(t * 3) * 3;
      ctx.fillStyle = C('#4a4246');
      ctx.beginPath();
      ctx.moveTo(-10, fy + 2);
      ctx.quadraticCurveTo(0, fy + 22 + Math.sin(t * 5) * 3, 10, fy + 2);
      ctx.fill();
      ctx.fillStyle = C('#8a7e84'); ctx.strokeStyle = C('#1c1418'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, fy, e.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C('#aaa0a4');
      ctx.beginPath(); ctx.arc(-4, fy - 4, e.r * 0.45, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, fy + 1, 22 + e.wind * 22, '#ff7a2e', 0.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = C('#ffd27a');
      ctx.beginPath(); ctx.arc(Math.cos(e.facing) * 3, fy + 1, 4 + e.wind * 2, 0, TAU); ctx.fill();
    },
  },

  brute: {
    id: 'brute', name: 'Slag Brute', r: 26, hp: 150, speed: 66, mass: 3, cost: 3,
    color: '#ff5a1a', glow: 110, deathColors: ['#ff5a1a', '#3a2622', '#ffb347'], barOffset: 6,
    ai(e, dt) {
      e.chase(1);
      e.facing = e.angleToPlayer();
      if (e.distToPlayer() < 135 && e.thinkT <= 0) e.doAction(ENEMIES.brute.slam(e));
    },
    *slam(e) {
      e.vx = e.vy = 0;
      const R = 125;
      G.scene.addEffect(FX.telegraphCircle(e.x, e.y, R, 0.85, '#ff4a2a', e));
      Sound.play('warn');
      yield* windup(e, 0.85);
      Sound.play('slam');
      G.shake(7);
      const sc = G.scene;
      sc.addEffect(FX.ring(e.x, e.y, 20, R, 0.35, '#ffb347', 8));
      sc.particles.burst(e.x, e.y, 26, { color: ['#ff7a2e', '#3a2a2a', '#ffd27a'], speed: 300, life: 0.6, size: 4, drag: 4 });
      sc.addEffect(FX.decal(e.x, e.y, R * 0.6, 'rgba(255,90,20,0.25)', 3));
      enemyAoe(e.x, e.y, R, e.dmg(16), e, 420);
      if (e.elite) ringShot(e, 10, 210, e.dmg(9), rand(TAU), { r: 7 });
      yield* wait(0.95);
      e.thinkT = rand(0.7, 1.3);
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      const moving = Math.hypot(e.vx, e.vy) > 5;
      const step = moving ? Math.sin(t * 7) * 2 : 0;
      const raise = e.wind * 14;
      // arms
      ctx.fillStyle = C('#56383a'); ctx.strokeStyle = C('#1a0c0a'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-r * 0.95, -r * 0.7 - raise + step, r * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.7 - raise - step, r * 0.42, 0, TAU); ctx.fill(); ctx.stroke();
      // body
      ctx.fillStyle = C('#6a4840');
      ctx.strokeStyle = C('#1a0c0a'); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.9, r * 0.95, r * 0.95, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C('#80584c');
      ctx.beginPath(); ctx.ellipse(0, -r * 1.35, r * 0.6, r * 0.35, 0, 0, TAU); ctx.fill();
      // molten seams
      const g = clamp(0.5 + 0.3 * Math.sin(t * 4) + e.wind, 0, 1);
      ctx.strokeStyle = C(rgba('#ff7a2e', g)); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.4); ctx.lineTo(-r * 0.1, -r * 0.9); ctx.lineTo(r * 0.4, -r * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 1.3); ctx.lineTo(r * 0.3, -r * 1.05); ctx.stroke();
      // fists glow
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, -r * 0.95, -r * 0.7 - raise + step, r * 0.9, '#ff6a1a', 0.4 + e.wind * 0.6);
      drawGlow(ctx, r * 0.95, -r * 0.7 - raise - step, r * 0.9, '#ff6a1a', 0.4 + e.wind * 0.6);
      ctx.globalCompositeOperation = 'source-over';
      const fx = Math.cos(e.facing) * r * 0.25;
      ctx.fillStyle = C('#ffd27a');
      ctx.fillRect(fx - 8, -r * 1.15, 5, 3); ctx.fillRect(fx + 3, -r * 1.15, 5, 3);
    },
  },

  fusebug: {
    id: 'fusebug', name: 'Fusebug', r: 11, hp: 22, speed: 150, flinch: true, cost: 1,
    color: '#ffd04a', glow: 40, deathColors: ['#ffd04a', '#5a3a10', '#ffffff'],
    ai(e, dt) {
      e.chase(1);
      e.facing = e.angleToPlayer();
      if (e.distToPlayer() < 75 && e.spawnT <= 0) e.doAction(ENEMIES.fusebug.fuse(e, 0.75));
    },
    *fuse(e, dur) {
      e.vx = e.vy = 0;
      e.mem.lit = true;
      G.scene.addEffect(FX.telegraphCircle(e.x, e.y, 85, dur, '#ffb02a'));
      Sound.play('warn');
      yield* windup(e, dur);
      ENEMIES.fusebug.explode(e);
    },
    explode(e) {
      if (e.mem.boomed) return;
      e.mem.boomed = true;
      const sc = G.scene;
      Sound.play('explode', { size: 0.7 });
      G.shake(6);
      sc.addEffect(FX.flash(e.x, e.y - 8, 130, '#ffb02a', 0.3));
      sc.addEffect(FX.ring(e.x, e.y, 8, 85, 0.3, '#ffe08a', 6));
      sc.particles.burst(e.x, e.y - 8, 26, { color: ['#ffd04a', '#ff7a2e', '#ffffff'], speed: 320, life: 0.5, size: 4 });
      enemyAoe(e.x, e.y, 85, e.dmg(14), e, 380);
      for (const o of enemiesInRadius(e.x, e.y, 85)) if (o !== e) hitEnemy(o, 30, { source: 'fire', secondary: true, angle: angleTo(e.x, e.y, o.x, o.y), knock: 200, enemySource: true });
      if (!e.dead) { e.noDrops = true; killEnemy(e); }
    },
    init(e) {
      e.onDeath = () => {
        if (e.mem.boomed) return;
        const x = e.x, y = e.y;
        G.scene.addEffect(FX.telegraphCircle(x, y, 85, 0.35, '#ffb02a'));
        G.scene.after(0.35, () => { const fake = { x, y, dmg: (v) => v * e.dmgMult, mem: {}, dead: true }; ENEMIES.fusebug.explode(fake); });
      };
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      const legs = Math.sin(t * 20) * 2;
      ctx.strokeStyle = C('#3a2a10'); ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * r * 0.5, -r * 0.4); ctx.lineTo(s * r * 1.1, -r * 0.1 + legs * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * r * 0.5, -r * 0.6); ctx.lineTo(s * r * 1.1, -r * 0.8 - legs * s); ctx.stroke();
      }
      const blink = e.wind > 0 && Math.floor(t * (10 + e.wind * 20)) % 2 === 0;
      ctx.fillStyle = C(blink ? '#fff0a0' : '#e09a28'); ctx.strokeStyle = C('#2a1606'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.6, r * 0.9, r * 0.75, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C('#5a3a10'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(0, r * 0.1); ctx.stroke();
      // fuse
      ctx.strokeStyle = C('#2a1a10'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.quadraticCurveTo(r * 0.5, -r * 1.8, r * 0.2, -r * 2.1); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, r * 0.2, -r * 2.1, 10 + Math.sin(t * 30) * 3 + e.wind * 12, '#ffd04a', 0.9);
      if (Math.random() < 0.3) G.scene.particles.spawn({ x: e.x + r * 0.2, y: e.y - r * 2.1, vx: rand(-40, 40), vy: rand(-60, -10), life: 0.3, size: 1.5, color: '#ffe08a', type: 'spark' });
    },
  },

  // ======================= THE DROWNED ARCHIVE ===========================
  jelly: {
    id: 'jelly', name: 'Lantern Jelly', r: 16, hp: 52, speed: 52, flying: true, cost: 2,
    color: '#5fe8d8', projColor: '#7ff0e6', glow: 120, deathColors: ['#5fe8d8', '#2a6a70', '#ffffff'],
    ai(e, dt) {
      const d = e.distToPlayer();
      if (d < 150) e.keepAway(150, 300, dt, 0.8);
      else { e.chase(0.7); e.vx += Math.cos(e.anim * 1.3) * 20; e.vy += Math.sin(e.anim * 1.7) * 20; }
      if (e.thinkT <= 0 && d < 560) e.doAction(ENEMIES.jelly.pulse(e));
    },
    *pulse(e) {
      e.vx *= 0.2; e.vy *= 0.2;
      yield* windup(e, 0.6);
      const off = rand(TAU);
      const n = e.elite ? 14 : 10;
      ringShot(e, n, 150, e.dmg(9), off, { kind: 'bubble', r: 8, color: '#7ff0e6' });
      Sound.play('enemyShoot'); Sound.play('splash');
      if (e.elite) { yield* wait(0.3); ringShot(e, n, 150, e.dmg(9), off + Math.PI / n, { kind: 'bubble', r: 8, color: '#7ff0e6' }); }
      yield* wait(0.5);
      e.thinkT = rand(2.1, 3.0);
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      const fy = -28 + Math.sin(t * 2.4) * 4;
      const pulse = 1 + Math.sin(t * 4) * 0.05 + e.wind * 0.15;
      ctx.strokeStyle = C(rgba('#5fe8d8', 0.55)); ctx.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.3, fy + 4);
        for (let k = 1; k <= 4; k++) ctx.lineTo(i * r * 0.3 + Math.sin(t * 4 + k + i) * 3, fy + 4 + k * 6);
        ctx.stroke();
      }
      ctx.fillStyle = C(rgba('#3ab0b0', 0.55));
      ctx.beginPath(); ctx.ellipse(0, fy, r * pulse, r * 0.85 * pulse, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C('#a8fff5'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, fy, r * pulse, r * 0.85 * pulse, 0, Math.PI, 0); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, fy - 4, 26 + e.wind * 30, '#5fe8d8', 0.75);
      ctx.fillStyle = C('#e8fffa');
      ctx.beginPath(); ctx.arc(0, fy - 5, 4 + e.wind * 3, 0, TAU); ctx.fill();
    },
  },

  eel: {
    id: 'eel', name: 'Tide Eel', r: 13, hp: 52, speed: 118, cost: 2,
    color: '#3fb5c0', glow: 50, deathColors: ['#3fb5c0', '#1a4a50', '#a8fff5'],
    init(e) { e.mem.trail = []; for (let i = 0; i < 6; i++) e.mem.trail.push({ x: e.x, y: e.y }); },
    ai(e, dt) {
      const d = e.distToPlayer();
      if (d > 260) e.chase(1); else e.keepAway(180, 320, dt, 0.9);
      e.facing = Math.atan2(e.vy, e.vx) || e.facing;
      if (d < 420 && e.hasLos && e.thinkT <= 0) e.doAction(ENEMIES.eel.dash(e));
    },
    *dash(e) {
      e.vx = e.vy = 0;
      const tl = trackLine(e, 430, 30, 0.7, 0.45, '#4fe0d0');
      yield* windup(e, 0.7);
      const ang = tl.angle;
      e.facing = ang;
      Sound.play('dash');
      let traveled = 0, hit = false;
      e.onWall = () => { traveled = 9999; };
      while (traveled < 430) {
        const dt = yield;
        traveled += 760 * dt;
        e.vx = Math.cos(ang) * 760; e.vy = Math.sin(ang) * 760;
        if (!hit && e.touching(4)) hit = !!damagePlayer(e.dmg(13), { angle: ang, enemy: e });
        if (Math.random() < 0.6) G.scene.particles.spawn({ x: e.x, y: e.y - 6, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.4, size: 3, color: '#7ff0e6' });
      }
      e.onWall = null;
      e.vx = e.vy = 0;
      yield* wait(0.7);
      e.thinkT = rand(0.9, 1.6);
    },
    draw(ctx, e, t, C) {
      const tr = e.mem.trail;
      // update trail (visual only)
      const head = tr[0];
      const dx = e.x - head.x, dy = e.y - head.y;
      if (dx * dx + dy * dy > 36) { tr.unshift({ x: e.x, y: e.y }); tr.length = 7; }
      for (let i = tr.length - 1; i >= 1; i--) {
        const s = tr[i];
        const rr = e.r * (1 - i * 0.11);
        ctx.fillStyle = C(i % 2 ? '#2a8a94' : '#3fb5c0');
        ctx.beginPath(); ctx.ellipse(s.x - e.x, s.y - e.y - 8, rr, rr * 0.75, 0, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = C('#4fd0d8'); ctx.strokeStyle = C('#08262a'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -9, e.r * 1.05, e.r * 0.8, e.facing, 0, TAU); ctx.fill(); ctx.stroke();
      const ex = Math.cos(e.facing) * e.r * 0.5, ey = Math.sin(e.facing) * e.r * 0.4 - 11;
      ctx.fillStyle = C(e.wind > 0 ? '#ffffff' : '#e8fffa');
      ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, TAU); ctx.fill();
      if (e.wind > 0) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, -9, 40, '#4fe0d0', e.wind * 0.7); }
    },
  },

  shellguard: {
    id: 'shellguard', name: 'Shellguard', r: 20, hp: 96, speed: 68, mass: 2.4, cost: 3, shieldArc: 2.1,
    color: '#8fb0b8', glow: 40, deathColors: ['#8fb0b8', '#3a4a50', '#ffffff'],
    ai(e, dt) {
      e.chase(0.9);
      e.faceToward(e.angleToPlayer(), 2.3, dt);
      if (e.distToPlayer() < 115 && e.thinkT <= 0) e.doAction(ENEMIES.shellguard.thrust(e));
    },
    *thrust(e) {
      e.vx = e.vy = 0;
      const a = e.facing;
      G.scene.addEffect(FX.telegraphCone(e.x, e.y, a, 1.4, 125, 0.6, '#ff4a3a', e));
      yield* windup(e, 0.6);
      Sound.play('swingHeavy');
      G.scene.addEffect(FX.slash(e.x, e.y - 10, a, 1.4, 120, '#cfe8f0', 0.18));
      const p = G.player;
      if (circleInArc(p.x, p.y, p.r, e.x, e.y, 125, a, 1.4)) damagePlayer(e.dmg(15), { angle: a, enemy: e, knock: 320 });
      yield* wait(0.85);
      e.thinkT = rand(0.8, 1.4);
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      const walk = Math.hypot(e.vx, e.vy) > 5 ? Math.sin(t * 14) * 3 : 0;
      ctx.strokeStyle = C('#4a5a60'); ctx.lineWidth = 2.5;
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
        ctx.beginPath(); ctx.moveTo(s * r * 0.5, -r * 0.5 + k * 6); ctx.lineTo(s * r * 1.15, -r * 0.2 + k * 8 + walk * s * (k ? -1 : 1)); ctx.stroke();
      }
      ctx.fillStyle = C('#6a8890'); ctx.strokeStyle = C('#0e1a1e'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -r * 0.75, r, r * 0.78, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C('#a8c8d0'); ctx.lineWidth = 1.5;
      for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(0, -r * 0.75, r * (1 - i * 0.3), r * 0.78 * (1 - i * 0.3), 0, 0, TAU); ctx.stroke(); }
      // shield plate
      const a = e.facing;
      ctx.save();
      ctx.translate(0, -r * 0.7);
      ctx.strokeStyle = C(e.wind > 0 ? '#ffffff' : '#d8e8ec'); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.08, a - 1.0, a + 1.0); ctx.stroke();
      ctx.strokeStyle = C('#ffe9a0'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.08, a - 0.9, a + 0.9); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C('#e8fffa');
      ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55 - 4, -r * 0.8 + Math.sin(a) * r * 0.3, 2.2, 0, TAU); ctx.arc(Math.cos(a) * r * 0.55 + 4, -r * 0.8 + Math.sin(a) * r * 0.3, 2.2, 0, TAU); ctx.fill();
    },
  },

  wraith: {
    id: 'wraith', name: 'Ink Wraith', r: 14, hp: 44, speed: 90, flying: true, cost: 2,
    color: '#8a7ac8', projColor: '#b09aff', glow: 60, deathColors: ['#3a2a5a', '#b09aff', '#000000'],
    ai(e, dt) {
      e.keepAway(170, 320, dt, 0.8);
      e.facing = e.angleToPlayer();
      if (e.thinkT <= 0) e.doAction(ENEMIES.wraith.blink(e));
    },
    *blink(e) {
      e.vx = e.vy = 0;
      const sc = G.scene;
      for (let t = 0; t < 0.35;) { const dt = yield; t += dt; e.alpha = 1 - t / 0.35; }
      e.untargetable = true; e.invuln = true;
      sc.particles.burst(e.x, e.y - 20, 12, { color: '#2a1a3a', speed: 90, life: 0.6, size: 6, type: 'smoke', add: false });
      const p = G.player;
      const spot = sc.map.randomOpenPoint({ awayX: p.x, awayY: p.y, minDist: 170, maxDist: 280, clearance: 1 });
      e.x = spot.x; e.y = spot.y;
      yield* wait(0.25);
      e.untargetable = false; e.invuln = false;
      for (let t = 0; t < 0.3;) { const dt = yield; t += dt; e.alpha = t / 0.3; }
      e.alpha = undefined;
      yield* windup(e, 0.35);
      const base = e.angleToPlayer();
      const n = e.elite ? 7 : 5;
      for (let i = 0; i < n; i++) enemyShoot(e, base + (i - (n - 1) / 2) * 0.2, 270, e.dmg(9), { kind: 'shard', r: 6, color: '#b09aff' });
      Sound.play('enemyShoot');
      yield* wait(0.6);
      e.thinkT = rand(1.9, 2.9);
    },
    onCancel(e) { e.alpha = undefined; },
    draw(ctx, e, t, C) {
      const fy = -24 + Math.sin(t * 2.2) * 3;
      ctx.fillStyle = C('#2a2040'); ctx.strokeStyle = C('rgba(190,160,255,0.55)'); ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-e.r, fy + 4);
      ctx.quadraticCurveTo(-e.r * 1.1, fy - e.r * 1.4, 0, fy - e.r * 1.5);
      ctx.quadraticCurveTo(e.r * 1.1, fy - e.r * 1.4, e.r, fy + 4);
      for (let i = 3; i >= -3; i--) ctx.lineTo(i * e.r / 3, fy + 10 + Math.sin(t * 5 + i) * 4 + (i % 2) * 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, fy - e.r * 0.6, 20 + e.wind * 18, '#8a6aff', 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = C('#d8c8ff');
      const fx = Math.cos(e.facing) * 3;
      ctx.beginPath(); ctx.ellipse(fx - 4, fy - e.r * 0.6, 2, 3, 0, 0, TAU); ctx.ellipse(fx + 4, fy - e.r * 0.6, 2, 3, 0, 0, TAU); ctx.fill();
    },
  },

  // ======================= THE DAWNLESS COURT ============================
  lancer: {
    id: 'lancer', name: 'Gilded Lancer', r: 16, hp: 82, speed: 104, mass: 1.6, cost: 2.5,
    color: '#ffd98a', glow: 50, deathColors: ['#ffd98a', '#6a5a3a', '#ffffff'],
    ai(e, dt) {
      const d = e.distToPlayer();
      if (d > 330) e.chase(1); else e.keepAway(200, 340, dt, 0.7);
      e.faceToward(e.angleToPlayer(), 5, dt);
      if (e.hasLos && e.thinkT <= 0 && d < 520) e.doAction(ENEMIES.lancer.charge(e));
    },
    *charge(e) {
      e.vx = e.vy = 0;
      const tl = trackLine(e, 540, 34, 0.75, 0.5, '#ffcc4a');
      Sound.play('warn');
      yield* windup(e, 0.75);
      const ang = tl.angle;
      e.facing = ang;
      Sound.play('dash');
      let traveled = 0, hit = false, wall = false;
      e.onWall = () => { wall = true; };
      while (traveled < 540 && !wall) {
        const dt = yield;
        traveled += 840 * dt;
        e.vx = Math.cos(ang) * 840; e.vy = Math.sin(ang) * 840;
        if (!hit && e.touching(6)) hit = !!damagePlayer(e.dmg(18), { angle: ang, enemy: e, knock: 380 });
        if (Math.random() < 0.5) G.scene.particles.spawn({ x: e.x, y: e.y - 6, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.35, size: 2.5, color: '#ffe9a0', type: 'spark' });
      }
      e.onWall = null;
      e.vx = e.vy = 0;
      if (wall) {
        Sound.play('thud'); G.shake(4);
        G.scene.addText(e.x, e.y - 40, 'STUNNED', '#ffe9a0', 12, { life: 0.8 });
        G.scene.particles.burst(e.x, e.y - 10, 14, { color: ['#ffe9a0', '#8a8078'], speed: 200, life: 0.4, size: 3, type: 'shard' });
        e.vulnerable = 1.3;
        yield* wait(1.3);
      } else yield* wait(0.6);
      e.thinkT = rand(1.0, 1.8);
    },
    draw(ctx, e, t, C) {
      const r = e.r, a = e.facing;
      const step = Math.hypot(e.vx, e.vy) > 5 ? Math.sin(t * 12) * 2 : 0;
      // lance (behind if facing up)
      const drawLance = () => {
        ctx.save();
        ctx.translate(0, -r * 0.9);
        ctx.rotate(a);
        ctx.strokeStyle = C('#8a7040'); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.lineTo(r * 2.6, 0); ctx.stroke();
        ctx.fillStyle = C(e.wind > 0 ? '#ffffff' : '#ffe9a0');
        ctx.beginPath(); ctx.moveTo(r * 2.6, -4); ctx.lineTo(r * 3.4, 0); ctx.lineTo(r * 2.6, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      if (Math.sin(a) < 0) drawLance();
      ctx.fillStyle = C('#5a5468');
      ctx.fillRect(-r * 0.55, -r * 0.5 + step, r * 0.4, r * 0.5);
      ctx.fillRect(r * 0.15, -r * 0.5 - step, r * 0.4, r * 0.5);
      ctx.fillStyle = C('#cfc8dc'); ctx.strokeStyle = C('#2a2434'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -r * 1.0, r * 0.75, r * 0.7, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C('#e8e2f0');
      ctx.beginPath(); ctx.arc(0, -r * 1.75, r * 0.45, 0, TAU); ctx.fill();
      ctx.strokeStyle = C('#ffd98a'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -r * 1.0, r * 0.75, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = C('#c04040');
      ctx.beginPath(); ctx.moveTo(0, -r * 2.2); ctx.quadraticCurveTo(-r * 0.8, -r * 2.5, -r * 0.9, -r * 1.7); ctx.quadraticCurveTo(-r * 0.3, -r * 2.0, 0, -r * 2.2); ctx.fill();
      ctx.fillStyle = C('#1a1424');
      ctx.fillRect(Math.cos(a) * 3 - 5, -r * 1.8, 10, 2.5);
      if (Math.sin(a) >= 0) drawLance();
    },
  },

  seraph: {
    id: 'seraph', name: 'Choir Seraph', r: 15, hp: 66, speed: 74, flying: true, cost: 2.5,
    color: '#fff3c8', projColor: '#ffe08a', glow: 110, deathColors: ['#fff3c8', '#ffd98a', '#ffffff'],
    ai(e, dt) {
      e.keepAway(220, 360, dt, 0.8);
      e.facing = e.angleToPlayer();
      if (e.thinkT <= 0 && e.distToPlayer() < 600) e.doAction(chance(0.5) ? ENEMIES.seraph.spiral(e) : ENEMIES.seraph.burst(e));
    },
    *spiral(e) {
      e.vx = e.vy = 0;
      yield* windup(e, 0.5);
      let a = rand(TAU), t = 0, shot = 0;
      const dur = e.elite ? 2.0 : 1.4;
      while (t < dur) {
        const dt = yield;
        t += dt; shot -= dt;
        if (shot <= 0) {
          shot = 0.075;
          enemyShoot(e, a, 165, e.dmg(8), { r: 6, color: '#ffe08a' });
          enemyShoot(e, a + Math.PI, 165, e.dmg(8), { r: 6, color: '#ffe08a' });
          a += 0.38;
          Sound.play('enemyShoot');
        }
      }
      yield* wait(0.6);
      e.thinkT = rand(2.2, 3.0);
    },
    *burst(e) {
      e.vx = e.vy = 0;
      yield* windup(e, 0.5);
      for (let w = 0; w < 3; w++) {
        const base = e.angleToPlayer();
        for (let i = -2; i <= 2; i++) enemyShoot(e, base + i * 0.16, 250, e.dmg(9), { r: 6, color: '#ffe08a' });
        Sound.play('enemyShoot');
        yield* wait(0.28);
      }
      yield* wait(0.5);
      e.thinkT = rand(2.0, 2.8);
    },
    draw(ctx, e, t, C) {
      const fy = -30 + Math.sin(t * 2) * 4;
      const flap = Math.sin(t * 8) * 0.25;
      ctx.fillStyle = C(rgba('#fff3c8', 0.85));
      for (const s of [-1, 1]) {
        for (const k of [0, 1]) {
          ctx.save();
          ctx.translate(0, fy);
          ctx.rotate(s * (0.5 + k * 0.6 + flap));
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 26, -6); ctx.lineTo(s * 20, 6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
      ctx.strokeStyle = C('#ffd98a'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, fy, e.r * 0.85, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, fy, 26 + e.wind * 26, '#ffe08a', 0.75);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = C('#ffffff');
      ctx.beginPath(); ctx.ellipse(0, fy, 6, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = C('#3a2a10');
      ctx.beginPath(); ctx.arc(Math.cos(e.facing) * 2, fy + Math.sin(e.facing) * 1.5, 2.2, 0, TAU); ctx.fill();
    },
  },

  sentinel: {
    id: 'sentinel', name: 'Pale Sentinel', r: 22, hp: 165, speed: 48, mass: 3.2, cost: 3.5,
    color: '#e8e4f0', glow: 70, glowColor: '#ffb0b0', deathColors: ['#e8e4f0', '#8a8496', '#ffffff'], barOffset: 12,
    ai(e, dt) {
      const d = e.distToPlayer();
      if (d > 380) e.chase(1); else if (d < 180) e.keepAway(180, 400, dt, 0.8); else { e.vx *= 0.9; e.vy *= 0.9; }
      e.faceToward(e.angleToPlayer(), 3, dt);
      if (e.hasShot && e.thinkT <= 0) e.doAction(ENEMIES.sentinel.beam(e));
    },
    *beam(e) {
      e.vx = e.vy = 0;
      const tl = trackLine(e, 900, 10, 1.0, 0.75, '#ff7a7a');
      tl.x = e.x; tl.y = e.y;
      Sound.play('warn');
      yield* windup(e, 1.0);
      const ang = tl.angle;
      const sc = G.scene;
      const len = 900 * sc.map.raycast(e.x, e.y, e.x + Math.cos(ang) * 900, e.y + Math.sin(ang) * 900);
      Sound.play('beam');
      sc.addEffect(makeBeam(e.x, e.y - 30, ang, len, 26, 0.45, '#ffd0d0'));
      const p = G.player;
      let t = 0, hit = false;
      while (t < 0.45) {
        const dt = yield;
        t += dt;
        if (!hit && distToSegment(p.x, p.y, e.x, e.y, e.x + Math.cos(ang) * len, e.y + Math.sin(ang) * len) < 13 + p.r * 0.7) hit = !!damagePlayer(e.dmg(18), { angle: ang, enemy: e, knock: 280 });
      }
      yield* wait(0.8);
      e.thinkT = rand(1.8, 2.6);
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      ctx.fillStyle = C('#8a8496');
      ctx.fillRect(-r * 0.8, -r * 0.5, r * 1.6, r * 0.5);
      ctx.fillStyle = C('#d8d4e0'); ctx.strokeStyle = C('#2a2434'); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, -r * 0.4); ctx.lineTo(-r * 0.6, -r * 2.4); ctx.lineTo(r * 0.6, -r * 2.4); ctx.lineTo(r * 0.75, -r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C('#f0ecf8');
      ctx.fillRect(-r * 0.6, -r * 2.4, r * 1.2, r * 0.35);
      ctx.strokeStyle = C('#d9c88a'); ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.4, -r * 2.4); ctx.lineTo(i * r * 0.5, -r * 2.85); ctx.stroke(); }
      const ex = Math.cos(e.facing) * r * 0.25, ey = -r * 1.65;
      ctx.fillStyle = C('#2a2030');
      ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.35, r * 0.22, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, ex, ey, 18 + e.wind * 30, '#ff8a8a', 0.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = C('#ffe0e0');
      ctx.beginPath(); ctx.arc(ex, ey, 3 + e.wind * 2, 0, TAU); ctx.fill();
    },
  },

  thrall: {
    id: 'thrall', name: 'Hollow Thrall', r: 11, hp: 30, speed: 172, flinch: true, cost: 1,
    color: '#d8d0e8', glow: 0, deathColors: ['#d8d0e8', '#6a6478', '#ffffff'],
    ai(e) {
      e.chase(1);
      e.facing = e.angleToPlayer();
      if (e.distToPlayer() < 48 && e.thinkT <= 0) e.doAction(ENEMIES.thrall.swipe(e));
    },
    *swipe(e) {
      e.vx *= 0.2; e.vy *= 0.2;
      const a = e.angleToPlayer();
      yield* windup(e, 0.3);
      G.scene.addEffect(FX.slash(e.x, e.y - 8, a, 1.8, 52, '#e8e0ff', 0.14));
      Sound.play('swing', { pitch: 1.6 });
      const p = G.player;
      if (circleInArc(p.x, p.y, p.r, e.x, e.y, 54, a, 1.8)) damagePlayer(e.dmg(8), { angle: a, enemy: e });
      yield* wait(0.5);
      e.thinkT = rand(0.3, 0.7);
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      const run = Math.hypot(e.vx, e.vy) > 10 ? Math.sin(t * 18) * 2.5 : 0;
      ctx.fillStyle = C('#6a6478');
      ctx.fillRect(-r * 0.5, -r * 0.5 + run, r * 0.35, r * 0.5);
      ctx.fillRect(r * 0.15, -r * 0.5 - run, r * 0.35, r * 0.5);
      ctx.fillStyle = C('#cfc8dc'); ctx.strokeStyle = C('#2a2434'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(Math.cos(e.facing) * 2, -r * 1.05, r * 0.8, r * 0.75, Math.cos(e.facing) * 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C('#1a1424');
      const fx = Math.cos(e.facing) * r * 0.4;
      ctx.beginPath(); ctx.arc(fx - 3, -r * 1.2, 2.2, 0, TAU); ctx.arc(fx + 3, -r * 1.2, 2.2, 0, TAU); ctx.fill();
      if (e.wind > 0) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, -r, 30, '#e8e0ff', e.wind * 0.6); }
    },
  },
};

// long-lived damaging beam visual
function makeBeam(x, y, ang, len, width, dur, color) {
  return {
    layer: 'top', t: 0,
    update(dt) { this.t += dt; return this.t < dur; },
    draw(ctx) {
      const k = this.t / dur;
      const w = width * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85 * 0.6);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - k * 0.5;
      ctx.fillStyle = rgba(color, 0.35);
      ctx.fillRect(0, -w, len, w * 2);
      ctx.fillStyle = rgba(color, 0.8);
      ctx.fillRect(0, -w * 0.45, len, w * 0.9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -w * 0.15, len, w * 0.3);
      ctx.restore();
    },
  };
}
