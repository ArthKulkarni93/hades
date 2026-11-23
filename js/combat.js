'use strict';
// ---------------------------------------------------------------------------
// Combat core: actors, status effects, the damage pipeline, projectiles,
// and shared helpers used by weapons, blessings, enemies and bosses.
// ---------------------------------------------------------------------------

const SOURCE_COLORS = {
  attack: '#ffffff', special: '#ffffff', cast: '#ffd9b0', dash: '#ffffff', lightning: '#fff27a', blight: '#7cf08e',
  hex: '#d7a8ff', frost: '#a8dcff', wall: '#8ff5d2', thorns: '#9cf08e', nova: '#a8dcff', fire: '#ffae6a', other: '#ffffff',
};
const DOT_SOURCES = new Set(['blight', 'thorns', 'cloud']);
const SLOT_SOURCES = new Set(['attack', 'special', 'cast', 'dash']);

class Actor {
  constructor(x, y, r) {
    this.x = x; this.y = y; this.r = r;
    this.vx = 0; this.vy = 0;
    this.kx = 0; this.ky = 0;
    this.hp = 1; this.maxHp = 1;
    this.armor = 0; this.maxArmor = 0;
    this.dead = false;
    this.flash = 0;
    this.mass = 1;
    this.actionId = 0;
    this.facing = 0;
    this.slamT = 0;
    this.st = { chill: 0, chillT: 0, frozen: 0, freezeCd: 0, blight: 0, blightT: 0, blightTick: 0, blightDps: 3, hex: 0, hexDmg: 0 };
  }
}

// ---- helpers ----------------------------------------------------------------
function liveEnemies(scene = G.scene) {
  return scene ? scene.enemies.filter((e) => !e.dead && !e.spawning) : [];
}
function enemiesInRadius(x, y, r, scene = G.scene) {
  const out = [];
  if (!scene) return out;
  for (const e of scene.enemies) {
    if (e.dead || e.spawning) continue;
    if (dist2(x, y, e.x, e.y) <= (r + e.r) * (r + e.r)) out.push(e);
  }
  return out;
}
function nearestEnemy(x, y, maxR = Infinity, exclude = null, scene = G.scene) {
  let best = null, bd = maxR * maxR;
  if (!scene) return null;
  for (const e of scene.enemies) {
    if (e.dead || e.spawning || e.untargetable || (exclude && exclude.has(e))) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function playerStats() { return (G.player && G.player.stats) || BASE_STATS; }

// ---- status effects -----------------------------------------------------
const CHILL_MAX = 5;
function applyChill(e, stacks = 1) {
  if (e.dead || stacks <= 0) return;
  const st = e.st;
  if (st.frozen > 0) return;
  const max = e.isBoss ? 3 : CHILL_MAX;
  st.chill = Math.min(max, st.chill + stacks);
  st.chillT = 4;
  if (!e.isBoss && st.chill >= CHILL_MAX && st.freezeCd <= 0) freezeEnemy(e, playerStats().freezeDur || 1.5);
}

function freezeEnemy(e, dur, spread = true) {
  if (e.dead || e.isBoss) return;
  e.st.frozen = dur;
  e.st.chill = 0;
  e.cancelAction && e.cancelAction();
  Sound.play('freeze');
  const sc = G.scene;
  sc.particles.burst(e.x, e.y - 10, 14, { color: ['#d8f1ff', '#9fd8ff', '#ffffff'], speed: 160, life: 0.5, size: 4, type: 'shard', drag: 4 });
  sc.addText(e.x, e.y - e.r - 20, 'FROZEN', '#bfe6ff', 13, { vy: -40, life: 0.9, pop: 1.2 });
  if (spread && G.run && G.run.build.has('owl_zero')) {
    for (const o of enemiesInRadius(e.x, e.y, 130)) if (o !== e && o.st.frozen <= 0 && o.st.freezeCd <= 0) freezeEnemy(o, dur, false);
    sc.addEffect(FX.ring(e.x, e.y, 10, 130, 0.4, '#bfe6ff', 5));
  }
}

function applyBlight(e, stacks = 1) {
  if (e.dead || stacks <= 0) return;
  const s = playerStats();
  const st = e.st;
  const max = s.blightMax || 8;
  st.blight = Math.min(max, st.blight + stacks);
  st.blightT = 4.5;
  st.blightDps = s.blightDps || 3;
  if (st.blightTick <= 0) st.blightTick = 0.5;
  if (st.blight >= max && G.run && G.run.build.has('serpent_ouro') && !e.ouroCd) {
    e.ouroCd = 1.2;
    const v = G.run.build.vals('serpent_ouro');
    hitEnemy(e, v.burst, { source: 'blight', secondary: true, color: '#7cf08e', crit: false });
    st.blight = 3;
    G.scene.addEffect(FX.ring(e.x, e.y, 6, 70, 0.35, '#7cf08e', 5));
    G.scene.particles.burst(e.x, e.y - 8, 16, { color: ['#7cf08e', '#c6ff9e'], speed: 180, life: 0.5, size: 4 });
  }
}

function applyHex(e, dmg) {
  if (e.dead || dmg <= 0) return;
  if (e.st.hex > 0) { e.st.hexDmg = Math.max(e.st.hexDmg, dmg); return; }
  e.st.hex = 1.2;
  e.st.hexDmg = dmg;
}

function hexBurst(e) {
  const dmg = e.st.hexDmg;
  e.st.hex = 0; e.st.hexDmg = 0;
  if (e.dead || dmg <= 0) return;
  const sc = G.scene;
  Sound.play('hex');
  sc.addEffect(FX.ring(e.x, e.y - 10, 8, 80, 0.35, '#c99bff', 6));
  sc.addEffect(FX.flash(e.x, e.y - 10, 90, '#b07aff', 0.3));
  sc.particles.burst(e.x, e.y - 10, 18, { color: ['#c99bff', '#6a3aa8', '#ffffff'], speed: 220, life: 0.5, size: 4, type: 'spark' });
  const b = G.run && G.run.build;
  let mult = 1;
  if (b && b.has('moth_eclipse')) mult += b.vals('moth_eclipse').bonus / 100;
  hitEnemy(e, dmg * mult, { source: 'hex', secondary: true, heavy: true });
  if (b && b.has('duo_starfall')) { const sv = b.vals('duo_starfall'); const ex = e.x, ey = e.y; sc.after(0.12, () => strikeLightning(ex, ey, sv.dmg, 60)); }
  if (b && b.has('moth_eclipse')) {
    const o = nearestEnemy(e.x, e.y, 220, new Set([e]));
    if (o && o.st.hex <= 0) { applyHex(o, dmg * 0.6); sc.addEffect(FX.bolt(e.x, e.y - 10, o.x, o.y - 10, '#c99bff', 0.25, 2)); }
  }
}

function updateStatus(e, dt) {
  const st = e.st;
  if (st.freezeCd > 0) st.freezeCd -= dt;
  if (st.frozen > 0) {
    st.frozen -= dt;
    if (st.frozen <= 0) { st.frozen = 0; st.freezeCd = 2.5; G.scene.particles.burst(e.x, e.y - 8, 8, { color: '#cfeeff', speed: 90, life: 0.4, size: 3, type: 'shard' }); }
  }
  if (st.chillT > 0) { st.chillT -= dt; if (st.chillT <= 0) st.chill = 0; }
  if (e.ouroCd) { e.ouroCd -= dt; if (e.ouroCd <= 0) e.ouroCd = 0; }
  if (st.blight > 0) {
    st.blightT -= dt;
    st.blightTick -= dt;
    if (st.blightTick <= 0) {
      st.blightTick += 0.5;
      const dmg = st.blight * st.blightDps * 0.5;
      const b = G.run && G.run.build;
      hitEnemy(e, dmg, { source: 'blight', secondary: true, silent: true, crit: b && b.has('duo_nightshade') ? undefined : false });
      if (b && b.has('duo_frostbloom') && !e.dead) applyChill(e, 1);
    }
    if (st.blightT <= 0) { st.blight = 0; st.blightTick = 0; }
  }
  if (st.hex > 0) {
    st.hex -= dt;
    if (st.hex <= 0) hexBurst(e);
  }
}

function speedMultOf(e) {
  if (e.st.frozen > 0) return 0;
  return 1 - e.st.chill * (e.isBoss ? 0.07 : 0.09);
}

// ---- lightning ----------------------------------------------------------------
function chainLightning(from, dmg, bounces, range = 230) {
  const sc = G.scene;
  if (!sc) return;
  const s = playerStats();
  bounces += s.chainBonus || 0;
  const hitSet = new Set([from]);
  let cur = from;
  let didJump = false;
  for (let i = 0; i < bounces; i++) {
    const next = nearestEnemy(cur.x, cur.y, range, hitSet);
    if (!next) break;
    hitSet.add(next);
    sc.addEffect(FX.bolt(cur.x, cur.y - 12, next.x, next.y - 12, '#fff27a', 0.22, 2.5));
    lightningHit(next, dmg);
    cur = next;
    didJump = true;
  }
  if (!didJump && !from.dead) {
    // lone target: arc back into it for reduced damage
    sc.addEffect(FX.bolt(from.x + rand(-40, 40), from.y - 80, from.x, from.y - 12, '#fff27a', 0.2, 2));
    lightningHit(from, dmg * 0.5);
  }
  Sound.play('zap');
}

function lightningHit(e, dmg) {
  const s = playerStats();
  hitEnemy(e, dmg * (s.lightningMult || 1), { source: 'lightning', secondary: true });
  if (G.run && G.run.build.has('duo_hailstorm')) applyChill(e, 1);
  G.scene.particles.burst(e.x, e.y - 12, 6, { color: ['#fff27a', '#ffffff'], speed: 220, life: 0.25, size: 2.5, type: 'spark' });
}

function strikeLightning(x, y, dmg, radius = 60) {
  const sc = G.scene;
  sc.addEffect(FX.skyStrike(x, y, '#fff27a', 0.35, radius));
  sc.addEffect(FX.ring(x, y, 4, radius, 0.3, '#fff27a', 4));
  sc.particles.burst(x, y, 14, { color: ['#fff27a', '#ffffff'], speed: 260, life: 0.3, size: 3, type: 'spark' });
  Sound.play('thunder');
  G.shake(4);
  for (const e of enemiesInRadius(x, y, radius)) lightningHit(e, dmg);
}

// ---- the damage pipeline ------------------------------------------------------
function hitEnemy(e, base, o = {}) {
  if (!e || e.dead || e.spawning) return 0;
  const sc = G.scene;
  const source = o.source || 'other';
  const isDot = DOT_SOURCES.has(source);
  if (e.invuln) {
    if (!isDot && !o.silent && (!e._immuneT || e._immuneT <= 0)) { sc.addText(e.x, e.y - e.r - 14, 'IMMUNE', '#9a8aa8', 12, { life: 0.5 }); e._immuneT = 0.4; }
    return 0;
  }
  // frontal shields block direct hits
  if (e.shieldArc && !isDot && !o.secondary && o.angle !== undefined && e.st.frozen <= 0) {
    const incoming = o.angle + Math.PI;
    if (Math.abs(angleDiff(e.facing, incoming)) < e.shieldArc / 2) {
      Sound.play('armor');
      sc.particles.burst(e.x + Math.cos(e.facing) * e.r, e.y + Math.sin(e.facing) * e.r - 8, 7, { color: ['#ffffff', '#ffe9a0'], speed: 240, life: 0.25, size: 2.5, type: 'spark', angle: e.facing, spread: 1 });
      if (!e._blockT || e._blockT <= 0) { sc.addText(e.x, e.y - e.r - 16, 'BLOCKED', '#d8d0c0', 12, { life: 0.5 }); e._blockT = 0.35; }
      e.onBlocked && e.onBlocked(o);
      return 0;
    }
  }

  const playerSrc = o.enemySource ? false : true;
  const s = playerStats();
  const build = G.run ? G.run.build : null;
  const ctx = { e, source, base, mult: o.mult || 1, crit: false, angle: o.angle, x: o.x !== undefined ? o.x : e.x, y: o.y !== undefined ? o.y : e.y, o };
  if (playerSrc) {
    ctx.mult *= s.damage;
    if (source === 'attack') ctx.mult *= s.attackDmg;
    else if (source === 'special') ctx.mult *= s.specialDmg;
    else if (source === 'cast') ctx.mult *= s.castDmg;
    if (build) build.modDamage(ctx);
    if (e.vulnerable > 0) ctx.mult *= 1.5;
    let critChance = o.crit === false ? 0 : (s.crit || 0) + (o.critBonus || 0) + ((s.slotCrit && s.slotCrit[source]) || 0);
    if (isDot && !(build && build.has('duo_nightshade'))) critChance = 0;
    if (o.crit === true || Math.random() < critChance) {
      ctx.crit = true;
      ctx.mult *= s.critMult || 2;
    }
  }
  let dmg = Math.max(1, Math.round(base * ctx.mult));
  ctx.dmg = dmg;

  // armor absorbs first
  let armorHit = 0;
  if (e.armor > 0) {
    armorHit = Math.min(e.armor, dmg);
    e.armor -= armorHit;
    dmg -= armorHit;
    if (e.armor <= 0) {
      e.armor = 0;
      Sound.play('armorBreak');
      sc.addText(e.x, e.y - e.r - 26, 'ARMOR BROKEN', '#e8e0d0', 14, { life: 1, pop: 1.3 });
      sc.particles.burst(e.x, e.y - e.r * 0.6, 22, { color: ['#c8c0b8', '#8a8078', '#ffffff'], speed: 260, life: 0.6, size: 4, type: 'shard', drag: 3 });
      e.stun = Math.max(e.stun || 0, e.isBoss ? 0.6 : 1.1);
      e.cancelAction && !e.isBoss && e.cancelAction();
    } else if (!isDot) Sound.play('armor');
  }
  e.hp -= dmg;
  e.flash = isDot ? Math.max(e.flash, 0.05) : 0.12;
  e.lastHitT = 2.5;

  // feedback
  const settings = Save.data.settings;
  if (settings.numbers && (dmg > 0 || armorHit > 0)) {
    const total = dmg + armorHit;
    let color = o.color || SOURCE_COLORS[source] || '#ffffff';
    let size = isDot ? 12 : 15 + Math.min(10, total / 12);
    if (ctx.crit) { color = '#ffd84a'; size += 6; }
    if (armorHit > 0 && dmg === 0) color = '#b8b0a8';
    sc.addText(e.x, e.y - e.r - 12, ctx.crit ? `${total}!` : `${total}`, color, size, { pop: ctx.crit ? 2 : 1.5 });
  }
  if (!isDot && !o.silent) {
    const a = o.angle !== undefined ? o.angle : rand(TAU);
    const col = ctx.crit ? '#ffd84a' : o.sparkColor || (source === 'lightning' ? '#fff27a' : source === 'hex' ? '#c99bff' : '#ffc890');
    sc.particles.burst(ctx.x, ctx.y - 10, ctx.crit ? 12 : 6, { color: [col, '#ffffff'], speed: 280, life: 0.28, size: 2.5, type: 'spark', angle: a, spread: 0.9 });
    if (source !== 'lightning' && source !== 'hex') Sound.play(ctx.crit ? 'crit' : 'hit', { pitch: e.isBoss ? 0.8 : 1 + rand(-0.08, 0.08) });
    if (ctx.crit) { G.hitstop = Math.max(G.hitstop, 0.05); G.shake(3); sc.addEffect(FX.flash(e.x, e.y - 10, 50, '#ffd84a', 0.15)); }
    else if (o.heavy) { G.hitstop = Math.max(G.hitstop, 0.035); G.shake(2.5); }
  }

  // knockback
  if (o.knock && !e.immovable) {
    let k = o.knock;
    if (playerSrc && s.knockMult && s.knockMult[source]) k *= s.knockMult[source];
    k /= e.mass;
    const a = o.angle !== undefined ? o.angle : angleTo(G.player.x, G.player.y, e.x, e.y);
    e.kx += Math.cos(a) * k;
    e.ky += Math.sin(a) * k;
    if (k > 260) e.slamT = 0.4;
  }
  if (!isDot && e.flinch && source !== 'lightning') e.stun = Math.max(e.stun || 0, 0.12);

  if (playerSrc && build && !o.noHooks) build.onHit(ctx, o.secondary);
  if (e.hp <= 0 && !e.dead) killEnemy(e, ctx);
  else if (e.onDamaged) e.onDamaged(ctx);
  return dmg;
}

function killEnemy(e, ctx = {}) {
  if (e.dead) return;
  const sc = G.scene;
  if (e.onBeforeDeath && e.onBeforeDeath(ctx) === false) return;
  e.dead = true;
  e.hp = 0;
  const big = e.r > 22;
  Sound.play('enemyDie', { big });
  sc.particles.burst(e.x, e.y - e.r * 0.6, big ? 34 : 18, { color: e.deathColors || [e.color || '#ff9a4a', '#3a2a2a', '#ffffff'], speed: big ? 260 : 200, life: 0.7, size: big ? 5 : 3.5, drag: 3.5 });
  sc.particles.burst(e.x, e.y - e.r * 0.5, 8, { color: '#2a2228', speed: 60, life: 1.0, size: 8, type: 'smoke', add: false, drag: 1.5 });
  sc.addEffect(FX.decal(e.x, e.y, e.r * 1.3, 'rgba(10,6,8,0.6)', 8));
  if (big) { G.hitstop = Math.max(G.hitstop, 0.06); G.shake(5); }
  if (G.run) {
    G.run.kills++;
    if (G.run.build) G.run.build.onKill(e, ctx);
  }
  if (e.onDeath) e.onDeath(ctx);
  // occasional coin drops
  if (!e.noDrops && G.run && !e.isBoss && chance(0.32)) spawnCoins(e.x, e.y, randInt(1, 3) + (e.elite ? 3 : 0));
  if (sc.onEnemyKilled) sc.onEnemyKilled(e);
}

function damagePlayer(amount, o = {}) {
  const p = G.player;
  if (!p || p.dead || amount <= 0) return false;
  if (p.invuln > 0 || p.dashing > 0 || G.god || !G.scene || G.scene.peaceful) return false;
  const s = p.stats;
  const sc = G.scene;
  if (s.evade > 0 && Math.random() < s.evade) {
    p.invuln = 0.35;
    Sound.play('evade');
    sc.addText(p.x, p.y - 40, 'EVADED', '#8ff5d2', 15, { life: 0.7 });
    sc.particles.burst(p.x, p.y - 18, 10, { color: '#8ff5d2', speed: 180, life: 0.35, size: 2.5, type: 'spark' });
    return 'evade';
  }
  if (p.barrier > 0) {
    p.barrier--;
    p.invuln = 0.6;
    p.barrierT = s.barrierRecharge || 0;
    Sound.play('barrier');
    sc.addText(p.x, p.y - 40, 'WARDED', '#bfe6ff', 15, { life: 0.7 });
    sc.addEffect(FX.ring(p.x, p.y - 16, 10, 70, 0.35, '#bfe6ff', 4));
    sc.particles.burst(p.x, p.y - 16, 16, { color: ['#d8f1ff', '#9fd8ff'], speed: 200, life: 0.45, size: 3.5, type: 'shard' });
    return 'barrier';
  }
  let dmg = amount;
  if (o.enemy && o.enemy.st && o.enemy.st.chill > 0 && s.chillDmgReduce) dmg *= 1 - s.chillDmgReduce;
  if (G.run) dmg *= G.run.enemyDmgMult;
  if (Save.data.settings.assist) dmg *= 0.6;
  dmg = Math.max(1, Math.round(dmg));
  if (G.run) G.run.lastHitBy = o.enemy && o.enemy.def ? o.enemy.def.name : o.by || 'the dark';
  p.hp -= dmg;
  p.invuln = 0.8;
  p.hurtFlash = 0.35;
  if (o.angle !== undefined) {
    const k = o.knock !== undefined ? o.knock : 220;
    p.kx += Math.cos(o.angle) * k; p.ky += Math.sin(o.angle) * k;
  }
  sc.addText(p.x, p.y - 42, `-${dmg}`, '#ff5d6a', 20, { pop: 1.8, life: 0.9 });
  sc.particles.burst(p.x, p.y - 16, 14, { color: ['#ff5d6a', '#ffb0a0', '#ffffff'], speed: 220, life: 0.45, size: 3, type: 'spark' });
  Sound.play('hurt');
  G.shake(8);
  G.hitstop = Math.max(G.hitstop, 0.08);
  G.hurtVignette = 1;
  if (G.run) { G.run.damageTaken += dmg; G.run.roomDamage += dmg; }
  if (G.run && G.run.build) G.run.build.onHurt(dmg, o);
  if (p.hp <= 0) p.onLethal(o);
  return true;
}

// area damage helper (player source)
function aoeDamage(x, y, r, dmg, o = {}) {
  const hits = enemiesInRadius(x, y, r);
  for (const e of hits) {
    if (o.exclude && o.exclude.has(e)) continue;
    hitEnemy(e, dmg, Object.assign({ angle: angleTo(x, y, e.x, e.y), x: e.x, y: e.y }, o));
    if (o.each) o.each(e);
  }
  return hits;
}

// enemy-sourced area damage against the player
function enemyAoe(x, y, r, dmg, enemy, knock = 260) {
  const p = G.player;
  if (!p || p.dead) return false;
  if (dist(x, y, p.x, p.y) <= r + p.r * 0.7) return damagePlayer(dmg, { angle: angleTo(x, y, p.x, p.y), enemy, knock });
  return false;
}

function spawnCoins(x, y, n) {
  const sc = G.scene;
  for (let i = 0; i < n; i++) {
    sc.pickups.push(new Coin(x + rand(-6, 6), y + rand(-6, 6), randInt(1, 2)));
  }
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------
class Proj {
  constructor(o) {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.r = 6; this.team = 'player'; this.dmg = 10; this.source = 'cast';
    this.life = 2; this.pierce = 0; this.kind = 'orb'; this.color = '#ff9a4a';
    this.wall = 'die'; this.bounces = 0; this.knock = 0; this.homing = 0;
    this.t = 0; this.dead = false; this.hit = new Set();
    this.light = 0; this.trail = 0; this.trailT = 0; this.spin = 0;
    this.enemy = null; this.critBonus = 0; this.heavy = false;
    Object.assign(this, o);
    this.maxLife = this.life;
  }

  update(dt, sc) {
    this.t += dt;
    this.life -= dt;
    if (this.onUpdate) { this.onUpdate(this, dt, sc); if (this.dead) return; }
    if (this.homing && this.team === 'enemy' && G.player && !G.player.dead) {
      const want = angleTo(this.x, this.y, G.player.x, G.player.y - 10);
      const cur = Math.atan2(this.vy, this.vx), sp = Math.hypot(this.vx, this.vy);
      const na = rotateToward(cur, want, this.homing * dt);
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }
    if (this.accel) {
      const sp = Math.hypot(this.vx, this.vy), na = Math.max(0, sp + this.accel * dt);
      if (sp > 0) { this.vx *= na / sp; this.vy *= na / sp; }
    }
    const spd = Math.hypot(this.vx, this.vy) * dt;
    const steps = Math.max(1, Math.ceil(spd / Math.max(4, this.r * 0.9)));
    const sx = (this.vx * dt) / steps, sy = (this.vy * dt) / steps;
    for (let i = 0; i < steps; i++) {
      const ox = this.x, oy = this.y;
      this.x += sx; this.y += sy;
      if (this.wall !== 'pass' && sc.map.solidAt(this.x, this.y)) {
        if (this.wall === 'bounce' && this.bounces > 0) {
          this.bounces--;
          const hx = sc.map.solidAt(this.x, oy), hy = sc.map.solidAt(ox, this.y);
          if (hx || !hy) this.vx = -this.vx;
          if (hy || !hx) this.vy = -this.vy;
          this.x = ox; this.y = oy;
          this.hit.clear();
          return;
        }
        if (this.onWall) { this.onWall(this, sc); if (this.dead) return; this.x = ox; this.y = oy; }
        else { this.die(sc, 'wall'); return; }
      }
      if (this.team === 'player') {
        for (const e of sc.enemies) {
          if (e.dead || e.spawning || this.hit.has(e)) continue;
          const rr = this.r + e.r;
          if (dist2(this.x, this.y, e.x, e.y - (e.hitOffset || 0)) < rr * rr) {
            this.hitEnemy(e, sc);
            if (this.dead) return;
          }
        }
      } else if (this.team === 'enemy') {
        const p = G.player;
        if (p && !p.dead) {
          const rr = this.r + p.r * 0.75;
          if (dist2(this.x, this.y, p.x, p.y - 12) < rr * rr) {
            const hurt = damagePlayer(this.dmg, { angle: Math.atan2(this.vy, this.vx), enemy: this.enemy, knock: this.knockP || 160 });
            if (hurt) { this.die(sc, 'hit'); return; }
          }
        }
      }
    }
    if (this.trail) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = this.trail;
        sc.particles.spawn({ x: this.x + rand(-2, 2), y: this.y + rand(-2, 2), vx: -this.vx * 0.05, vy: -this.vy * 0.05, life: 0.3, size: this.r * 0.6, color: this.trailColor || this.color, type: 'dot' });
      }
    }
    if (this.life <= 0) this.die(sc, 'expire');
  }

  hitEnemy(e, sc) {
    this.hit.add(e);
    const ang = Math.atan2(this.vy, this.vx);
    if (this.onHit) this.onHit(this, e, sc);
    else hitEnemy(e, this.dmg, { source: this.source, angle: ang, knock: this.knock, x: this.x, y: this.y, critBonus: this.critBonus, heavy: this.heavy, crit: this.forceCrit });
    if (this.pierce !== Infinity) {
      this.pierce--;
      if (this.pierce < 0) this.die(sc, 'hit');
    }
  }

  die(sc, why) {
    if (this.dead) return;
    this.dead = true;
    if (this.onDeath) this.onDeath(this, sc, why);
    else if (why !== 'expire' || this.team === 'enemy') {
      sc.particles.burst(this.x, this.y, 6, { color: [this.color, '#ffffff'], speed: 140, life: 0.25, size: 2.5, type: 'spark' });
    }
  }

  draw(ctx) {
    if (this.drawFn) { this.drawFn(ctx, this); return; }
    const a = Math.atan2(this.vy, this.vx);
    const fade = Math.min(1, this.life / 0.1);
    switch (this.kind) {
      case 'bolt': {
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 0, 0, this.r * 4, this.color, 0.8 * fade);
        const g = ctx.createLinearGradient(-this.r * 5, 0, this.r, 0);
        g.addColorStop(0, rgba(this.color, 0));
        g.addColorStop(1, rgba('#fff4d8', 1));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(-this.r * 1.6, 0, this.r * 3, this.r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'arrow': {
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 0, 0, 22 + this.power * 18, this.color, 0.7);
        ctx.strokeStyle = rgba(this.color, 0.6); ctx.lineWidth = 2 + this.power * 2;
        ctx.beginPath(); ctx.moveTo(-26 - this.power * 16, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      case 'crescent': {
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, this.life / 0.15);
        drawGlow(ctx, 0, 0, this.r * 2.2, this.color, 0.6);
        ctx.fillStyle = rgba(this.color, 0.85);
        ctx.beginPath();
        ctx.arc(-this.r * 0.4, 0, this.r * 1.1, -1.25, 1.25);
        ctx.arc(-this.r * 0.95, 0, this.r * 0.95, 1.1, -1.1, true);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#fff7e0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-this.r * 0.4, 0, this.r * 1.1, -1.1, 1.1); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'bubble': {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, this.x, this.y, this.r * 2.6, this.color, 0.45);
        ctx.restore();
        ctx.strokeStyle = rgba(this.color, 0.95); ctx.lineWidth = 2;
        ctx.fillStyle = rgba(this.color, 0.25);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(this.x - this.r * 0.35, this.y - this.r * 0.35, this.r * 0.25, 0, TAU); ctx.fill();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 0, 0, this.r * 3, this.color, 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(this.r * 1.8, 0); ctx.lineTo(0, -this.r * 0.6); ctx.lineTo(-this.r * 1.4, 0); ctx.lineTo(0, this.r * 0.6); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      default: { // orb
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, this.x, this.y, this.r * 3.2, this.color, 0.75 * fade);
        ctx.restore();
        ctx.fillStyle = rgba(this.color, 1);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.55, 0, TAU); ctx.fill();
      }
    }
  }
}

// convenience for enemies
function enemyShoot(e, angle, speed, dmg, o = {}) {
  const p = new Proj(Object.assign({
    x: e.x + Math.cos(angle) * (e.r + 4), y: e.y - (e.shootOffset !== undefined ? e.shootOffset : 14) + Math.sin(angle) * (e.r + 4),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    team: 'enemy', dmg, r: 7, life: 4, color: e.projColor || '#ff7a3d', enemy: e, light: 50,
  }, o));
  G.scene.addProj(p);
  return p;
}

function ringShot(e, n, speed, dmg, offset = 0, o = {}) {
  for (let i = 0; i < n; i++) enemyShoot(e, offset + (i / n) * TAU, speed, dmg, o);
}
