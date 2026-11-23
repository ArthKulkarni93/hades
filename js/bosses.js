'use strict';
// ---------------------------------------------------------------------------
// Bosses: The Kiln Warden, The Lantern Angler, The Pale Regent.
// Each boss picks weighted "moves" (generators) and changes phase at 50%.
// ---------------------------------------------------------------------------

function bossMovePicker(e, moves) {
  const ok = moves.filter((m) => (!m.phase || m.phase <= e.phase) && (!m.cond || m.cond(e)) && (e.mem.cd[m.id] || 0) <= 0 && m.id !== e.mem.lastMove);
  const list = ok.length ? ok : moves.filter((m) => !m.phase || m.phase <= e.phase);
  const m = weightedPick(list, (x) => x.w);
  e.mem.lastMove = m.id;
  e.mem.cd[m.id] = m.cd || 0;
  return m;
}

function bossTick(e, dt) {
  for (const k in e.mem.cd) e.mem.cd[k] -= dt;
}

function bossInit(e) {
  e.mem.cd = {};
  e.phase = 1;
  e.thinkT = 1.2;
  e.immovable = true;
  e.mass = 50;
  e.noDrops = true;
}

function bossPhaseCheck(e, sc) {
  if (e.phase === 1 && e.hp <= e.maxHp * 0.5) {
    e.phase = 2;
    e.cancelAction();
    e.doAction(e.def.phaseShift(e, sc));
    return true;
  }
  return false;
}

// a projectile-like ring wave that the player must dash through or outrun
function makeShockwave(x, y, speed, maxR, dmg, color, enemy, gaps = null) {
  return {
    layer: 'top', t: 0, r: 10, hit: false, hazard: true,
    update(dt) {
      this.t += dt;
      this.r += speed * dt;
      const p = G.player;
      if (!this.hit && p && !p.dead) {
        const d = dist(x, y, p.x, p.y);
        if (Math.abs(d - this.r) < 14 + p.r * 0.5) {
          let inGap = false;
          if (gaps) {
            const a = angleTo(x, y, p.x, p.y);
            inGap = gaps.some((g) => Math.abs(angleDiff(g, a)) < 0.32);
          }
          if (!inGap) this.hit = !!damagePlayer(dmg, { angle: angleTo(x, y, p.x, p.y), enemy, knock: 300 });
        }
      }
      return this.r < maxR;
    },
    draw(ctx) {
      const a = 1 - this.r / maxR;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(color, 0.35 * a + 0.2);
      ctx.lineWidth = 16;
      const segs = gaps ? gaps.slice().sort((p, q) => p - q) : null;
      if (!segs) {
        ctx.beginPath(); ctx.arc(x, y, this.r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.7 * a + 0.2); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, this.r, 0, TAU); ctx.stroke();
      } else {
        for (let i = 0; i < segs.length; i++) {
          const a0 = segs[i] + 0.32, a1 = (i + 1 < segs.length ? segs[i + 1] : segs[0] + TAU) - 0.32;
          ctx.strokeStyle = rgba(color, 0.35 * a + 0.2); ctx.lineWidth = 16;
          ctx.beginPath(); ctx.arc(x, y, this.r, a0, a1); ctx.stroke();
          ctx.strokeStyle = rgba('#ffffff', 0.7 * a + 0.2); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, this.r, a0, a1); ctx.stroke();
        }
      }
      ctx.restore();
    },
  };
}

// delayed falling hazard
function makeFallingBlast(x, y, r, delay, dmg, color, enemy) {
  return {
    layer: 'floor', t: 0, done: false, hazard: true,
    update(dt, sc) {
      this.t += dt;
      if (!this.done && this.t >= delay) {
        this.done = true;
        Sound.play('explode', { size: 0.5 });
        sc.addEffect(FX.skyStrike(x, y, color, 0.3, r));
        sc.addEffect(FX.ring(x, y, 4, r, 0.25, color, 4));
        sc.particles.burst(x, y, 14, { color: [color, '#ffffff'], speed: 220, life: 0.35, size: 3, type: 'spark' });
        enemyAoe(x, y, r, dmg, enemy, 240);
        G.shake(2);
      }
      return this.t < delay + 0.05;
    },
    draw(ctx) {
      const k = clamp(this.t / delay, 0, 1);
      ctx.fillStyle = rgba(color, 0.08 + 0.16 * k);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(color, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    },
  };
}

const BOSSES = {
  // ========================================================================
  warden: {
    id: 'warden', boss: true, name: 'The Kiln Warden', epithet: 'Keeper of the Banked Forge',
    r: 42, hp: 2500, speed: 92, mass: 50, color: '#ff6a1a', projColor: '#ff8a3a', glow: 220,
    deathColors: ['#ff6a1a', '#3a2622', '#ffd27a', '#ffffff'], shootOffset: 52,
    intro: ['Another ember crawls out of the ash.', 'I banked the sun’s forge for ten thousand years. I will bank you too.'],
    introRepeat: ['Back again, spark? The forge is always hungry.', 'Kneel at the kiln, little light.'],
    init(e) { bossInit(e); },
    ai(e, dt, sc) {
      bossTick(e, dt);
      if (bossPhaseCheck(e, sc)) return;
      const d = e.distToPlayer();
      e.facing = e.angleToPlayer();
      if (d > 160) e.chase(1); else { e.vx *= 0.85; e.vy *= 0.85; }
      if (e.thinkT <= 0) {
        const m = bossMovePicker(e, BOSSES.warden.moves);
        e.doAction(m.fn(e, sc));
      }
    },
    moves: [
      { id: 'slam', w: 3, cd: 0, fn: function* (e, sc) {
        const p = G.player;
        // leap toward player then slam
        const tx = p.x, ty = p.y;
        const R = 150;
        sc.addEffect(FX.telegraphCircle(tx, ty, R, 0.9, '#ff4a2a', e));
        Sound.play('warn');
        e.vx = e.vy = 0;
        const sx = e.x, sy = e.y;
        e.wind = 0.01;
        for (let t = 0; t < 0.9;) {
          const dt = yield; t += dt;
          const k = ease.inOutQuad(clamp(t / 0.9, 0, 1));
          e.x = lerp(sx, tx, k); e.y = lerp(sy, ty, k);
          e.z = Math.sin(k * Math.PI) * 90;
          e.wind = k;
          sc.map.collide(e, e.r, true);
        }
        e.z = 0; e.wind = 0;
        Sound.play('slam'); G.shake(12);
        sc.particles.burst(e.x, e.y, 40, { color: ['#ff7a2e', '#3a2a2a', '#ffd27a'], speed: 380, life: 0.7, size: 5, drag: 4 });
        sc.addEffect(FX.decal(e.x, e.y, 90, 'rgba(255,90,20,0.25)', 5));
        enemyAoe(e.x, e.y, R, 22, e, 500);
        sc.addEffect(makeShockwave(e.x, e.y, 380, 700, 14, '#ff8a3a', e));
        if (e.phase >= 2) { yield* wait(0.35); sc.addEffect(makeShockwave(e.x, e.y, 380, 700, 14, '#ff8a3a', e)); }
        yield* wait(0.9);
        e.thinkT = rand(0.3, 0.7);
      } },
      { id: 'charge', w: 2.5, cd: 2, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        const tl = trackLine(e, 900, 70, 0.8, 0.55, '#ff4a2a');
        Sound.play('roar');
        yield* windup(e, 0.8);
        const ang = tl.angle;
        let wall = false, hit = false, traveled = 0;
        e.onWall = () => { wall = true; };
        while (!wall && traveled < 1000) {
          const dt = yield;
          traveled += 720 * dt;
          e.vx = Math.cos(ang) * 720 / speedMultOf(e); e.vy = Math.sin(ang) * 720 / speedMultOf(e);
          if (!hit && e.touching(8)) hit = !!damagePlayer(24, { angle: ang, enemy: e, knock: 500 });
          if (Math.random() < 0.8) sc.particles.spawn({ x: e.x + rand(-20, 20), y: e.y, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.5, size: 5, color: pick(['#ff7a2e', '#3a2a2a']) });
        }
        e.onWall = null;
        e.vx = e.vy = 0;
        Sound.play('slam'); G.shake(10);
        sc.particles.burst(e.x, e.y - 30, 30, { color: ['#c8c0b8', '#ff7a2e'], speed: 300, life: 0.6, size: 5, type: 'shard' });
        ringShot(e, e.phase >= 2 ? 16 : 10, 220, 10, rand(TAU));
        sc.addText(e.x, e.y - 90, 'STAGGERED', '#ffe9a0', 16, { life: 1 });
        e.vulnerable = 1.6;
        yield* wait(1.6);
        e.thinkT = rand(0.3, 0.6);
      } },
      { id: 'spray', w: 2.5, cd: 1, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        yield* windup(e, 0.55);
        const volleys = e.phase >= 2 ? 4 : 3;
        for (let v = 0; v < volleys; v++) {
          const base = e.angleToPlayer() + (v % 2 ? 0.12 : -0.12);
          for (let i = -3; i <= 3; i++) enemyShoot(e, base + i * 0.17, 270, 10, { r: 8 });
          Sound.play('enemyShoot');
          yield* wait(0.32);
        }
        yield* wait(0.6);
        e.thinkT = rand(0.4, 0.8);
      } },
      { id: 'summon', w: 1.4, cd: 9, cond: (e) => e.hp < e.maxHp * 0.8 && liveEnemies().length < 5, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        Sound.play('roar');
        yield* windup(e, 0.7);
        const n = e.phase >= 2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const pt = sc.map.randomOpenPoint({ awayX: G.player.x, awayY: G.player.y, minDist: 180, clearance: 1 });
          sc.spawnEnemy(chance(0.25) ? 'fusebug' : 'cinderling', pt.x, pt.y, { hpScale: 1.2 });
        }
        yield* wait(0.8);
        e.thinkT = rand(0.5, 0.9);
      } },
      { id: 'furnace', w: 2.2, cd: 6, phase: 2, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        Sound.play('roar');
        yield* windup(e, 0.7);
        let a = rand(TAU), t = 0, shot = 0;
        while (t < 3.0) {
          const dt = yield;
          t += dt; shot -= dt;
          if (shot <= 0) {
            shot = 0.09;
            for (let k = 0; k < 3; k++) enemyShoot(e, a + (k * TAU) / 3, 200, 10, { r: 8 });
            a += 0.21;
            Sound.play('enemyShoot');
          }
        }
        yield* wait(0.8);
        e.thinkT = rand(0.4, 0.8);
      } },
    ],
    *phaseShift(e, sc) {
      e.vx = e.vy = 0;
      e.invuln = true;
      Sound.play('roar');
      G.shake(10);
      sc.addText(e.x, e.y - 110, 'THE FORGE ROARS', '#ffb347', 20, { life: 1.8, vy: -20 });
      for (let t = 0; t < 1.4;) { const dt = yield; t += dt; e.wind = 0.5 + 0.5 * Math.sin(t * 20); if (Math.random() < 0.8) sc.particles.spawn({ x: e.x + rand(-40, 40), y: e.y - rand(20, 90), vx: rand(-40, 40), vy: -rand(60, 160), life: 0.7, size: 4, color: pick(['#ff7a2e', '#ffd27a']) }); }
      e.wind = 0;
      e.invuln = false;
      ringShot(e, 20, 230, 10, 0);
      sc.addEffect(makeShockwave(e.x, e.y, 400, 800, 14, '#ffb347', e));
      e.speed *= 1.15;
      e.thinkT = 0.4;
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      ctx.translate(0, -(e.z || 0));
      const moving = Math.hypot(e.vx, e.vy) > 5;
      const step = moving ? Math.sin(t * 6) * 3 : 0;
      const raise = e.wind * 18;
      const heat = clamp(0.55 + 0.25 * Math.sin(t * 3) + e.wind * 0.6 + (e.phase >= 2 ? 0.3 : 0), 0, 1);
      // legs
      ctx.fillStyle = C('#2a1e1c');
      ctx.fillRect(-r * 0.6, -r * 0.55 + step, r * 0.45, r * 0.55);
      ctx.fillRect(r * 0.15, -r * 0.55 - step, r * 0.45, r * 0.55);
      // arms / huge fists
      for (const s of [-1, 1]) {
        ctx.fillStyle = C('#3a2a26');
        ctx.beginPath(); ctx.ellipse(s * r * 1.05, -r * 1.15 - raise, r * 0.32, r * 0.5, s * 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = C('#4a3430');
        ctx.beginPath(); ctx.arc(s * r * 1.15, -r * 0.65 - raise * 1.6, r * 0.42, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, s * r * 1.15, -r * 0.65 - raise * 1.6, r * 0.9, '#ff6a1a', 0.3 + e.wind * 0.6);
        ctx.globalCompositeOperation = 'source-over';
      }
      // torso: a walking furnace
      ctx.fillStyle = C('#4c3632');
      ctx.beginPath();
      ctx.moveTo(-r * 0.85, -r * 0.5); ctx.lineTo(-r * 0.95, -r * 1.7); ctx.quadraticCurveTo(0, -r * 2.25, r * 0.95, -r * 1.7); ctx.lineTo(r * 0.85, -r * 0.5); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = C('#6e524a'); ctx.lineWidth = 3;
      ctx.stroke();
      // grate
      ctx.fillStyle = C('#1a0e0a');
      ctx.fillRect(-r * 0.5, -r * 1.45, r, r * 0.65);
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createLinearGradient(0, -r * 1.45, 0, -r * 0.8);
      fg.addColorStop(0, rgba('#ff4a0a', heat * 0.7)); fg.addColorStop(1, rgba('#ffd27a', heat));
      ctx.fillStyle = fg;
      ctx.fillRect(-r * 0.46, -r * 1.4, r * 0.92, r * 0.56);
      drawGlow(ctx, 0, -r * 1.1, r * 1.8, '#ff6a1a', heat * 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = C('#2a1a16'); ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.25, -r * 1.45); ctx.lineTo(i * r * 0.25, -r * 0.8); ctx.stroke(); }
      // head / chimney with eyes
      ctx.fillStyle = C('#3a2a26');
      ctx.fillRect(-r * 0.32, -r * 2.35, r * 0.64, r * 0.5);
      const fx = Math.cos(e.facing) * r * 0.08;
      ctx.fillStyle = C(e.phase >= 2 ? '#ffffff' : '#ffd27a');
      ctx.fillRect(fx - r * 0.24, -r * 2.15, r * 0.16, r * 0.08);
      ctx.fillRect(fx + r * 0.08, -r * 2.15, r * 0.16, r * 0.08);
      if (Math.random() < 0.35) G.scene.particles.spawn({ x: e.x + rand(-8, 8), y: e.y - r * 2.4 - (e.z || 0), vx: rand(-15, 15), vy: -rand(40, 90), life: 1.2, size: 7, color: '#2a2224', type: 'smoke', add: false, drag: 0.6 });
    },
  },

  // ========================================================================
  angler: {
    id: 'angler', boss: true, name: 'The Lantern Angler', epithet: 'Liar in the Deep Light',
    r: 44, hp: 4000, speed: 110, mass: 50, color: '#4fe0d0', projColor: '#7ff0e6', glow: 160, flying: true,
    deathColors: ['#4fe0d0', '#1a3a40', '#e8fffa', '#ffffff'], shootOffset: 40,
    intro: ['Follow the light, little flame...', 'Follow it doooown.'],
    introRepeat: ['Such a pretty glow. Mine is prettier.', 'Come closer. Closer. The light is warm, I promise.'],
    init(e) { bossInit(e); e.mem.lure = { x: e.x, y: e.y - 120 }; e.darkRoom = true; },
    ai(e, dt, sc) {
      bossTick(e, dt);
      if (bossPhaseCheck(e, sc)) return;
      const d = e.distToPlayer();
      e.faceToward(e.angleToPlayer(), 2.5, dt);
      if (d > 260) e.chase(0.9); else if (d < 160) e.keepAway(160, 300, dt, 0.8); else { e.vx *= 0.9; e.vy *= 0.9; }
      if (e.thinkT <= 0) {
        const m = bossMovePicker(e, BOSSES.angler.moves);
        e.doAction(m.fn(e, sc));
      }
    },
    moves: [
      { id: 'snap', w: 3, cd: 0, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        const tl = trackLine(e, 620, 90, 0.75, 0.5, '#4fe0d0');
        Sound.play('warn');
        yield* windup(e, 0.75);
        const ang = tl.angle;
        e.facing = ang;
        Sound.play('roar');
        let traveled = 0, hit = false, wall = false;
        e.onWall = () => { wall = true; };
        while (traveled < 620 && !wall) {
          const dt = yield;
          traveled += 900 * dt;
          e.vx = Math.cos(ang) * 900 / speedMultOf(e); e.vy = Math.sin(ang) * 900 / speedMultOf(e);
          e.mem.jaw = 1;
          if (!hit && e.touching(10)) hit = !!damagePlayer(24, { angle: ang, enemy: e, knock: 480 });
        }
        e.onWall = null;
        e.vx = e.vy = 0; e.mem.jaw = 0;
        if (e.phase >= 2) ringShot(e, 12, 170, 10, rand(TAU), { kind: 'bubble', r: 9, color: '#7ff0e6' });
        yield* wait(0.75);
        e.thinkT = rand(0.3, 0.7);
      } },
      { id: 'rings', w: 2.5, cd: 1, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        yield* windup(e, 0.6);
        const waves = e.phase >= 2 ? 4 : 3;
        const off = rand(TAU);
        for (let w = 0; w < waves; w++) {
          ringShot(e, 14, 160, 10, off + (w % 2) * (Math.PI / 14), { kind: 'bubble', r: 9, color: '#7ff0e6' });
          Sound.play('splash');
          yield* wait(0.45);
        }
        yield* wait(0.5);
        e.thinkT = rand(0.4, 0.8);
      } },
      { id: 'wisps', w: 1.8, cd: 5, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        e.mem.lureFlash = 1;
        Sound.play('warn');
        yield* windup(e, 0.7);
        e.mem.lureFlash = 0;
        const n = e.phase >= 2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.6;
          const lx = e.mem.lure.x, ly = e.mem.lure.y;
          const pr = new Proj({
            x: lx, y: ly, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, team: 'enemy', dmg: 12, r: 10, life: 5.5, color: '#bffff5', homing: 1.6, light: 90, enemy: e,
            onDeath(q, s2) { s2.addEffect(FX.flash(q.x, q.y, 50, '#7ff0e6', 0.2)); s2.particles.burst(q.x, q.y, 8, { color: '#bffff5', speed: 140, life: 0.3, size: 3 }); },
          });
          sc.addProj(pr);
        }
        Sound.play('enemyShoot');
        yield* wait(0.8);
        e.thinkT = rand(0.5, 0.9);
      } },
      { id: 'undertow', w: 1.6, cd: 7, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        Sound.play('splash');
        yield* windup(e, 0.5);
        const cx = e.x, cy = e.y;
        let t = 0, shot = 0, a = rand(TAU);
        const dur = e.phase >= 2 ? 3.2 : 2.6;
        sc.addEffect(makeWhirlpool(cx, cy, 340, dur + 0.4));
        while (t < dur) {
          const dt = yield;
          t += dt; shot -= dt;
          const p = G.player;
          const d = dist(p.x, p.y, cx, cy);
          if (d < 360 && d > 30 && p.dashing <= 0) {
            const pull = 120 * (1 - d / 400);
            p.kx += ((cx - p.x) / d) * pull * dt * 8; p.ky += ((cy - p.y) / d) * pull * dt * 8;
          }
          if (shot <= 0) {
            shot = 0.22;
            for (let k = 0; k < 4; k++) enemyShoot(e, a + (k * TAU) / 4, 140, 9, { kind: 'bubble', r: 8, color: '#7ff0e6' });
            a += 0.33;
          }
          if (d < e.r + 20) damagePlayer(14, { angle: angleTo(cx, cy, p.x, p.y), enemy: e, knock: 380 });
        }
        yield* wait(0.5);
        e.thinkT = rand(0.4, 0.8);
      } },
      { id: 'dive', w: 2.4, cd: 4, phase: 2, fn: function* (e, sc) {
        // submerge and burst from below the player
        e.vx = e.vy = 0;
        Sound.play('splash');
        for (let t = 0; t < 0.5;) { const dt = yield; t += dt; e.alpha = 1 - t / 0.5; }
        e.invuln = true; e.untargetable = true; e.alpha = 0;
        const bursts = 3;
        for (let b = 0; b < bursts; b++) {
          const p = G.player;
          let tx = p.x, ty = p.y;
          const tc = FX.telegraphCircle(tx, ty, 110, 0.85, '#4fe0d0');
          sc.addEffect(tc);
          for (let t = 0; t < 0.85;) {
            const dt = yield; t += dt;
            if (t < 0.5) { tx = lerp(tx, G.player.x, 0.08); ty = lerp(ty, G.player.y, 0.08); tc.x = tx; tc.y = ty; }
            if (Math.random() < 0.5) sc.particles.spawn({ x: tx + rand(-60, 60), y: ty + rand(-40, 40), vy: -30, life: 0.4, size: 3, color: '#7ff0e6' });
          }
          const pos = sc.map.nearestFloor(tx, ty, 1);
          e.x = pos.x; e.y = pos.y;
          e.alpha = 1;
          Sound.play('roar'); Sound.play('splash'); G.shake(9);
          enemyAoe(tx, ty, 110, 20, e, 420);
          sc.particles.burst(tx, ty, 30, { color: ['#7ff0e6', '#2a8a94', '#ffffff'], speed: 320, life: 0.6, size: 4 });
          ringShot(e, 10, 170, 9, rand(TAU), { kind: 'bubble', r: 8, color: '#7ff0e6' });
          if (b < bursts - 1) {
            yield* wait(0.35);
            for (let t = 0; t < 0.3;) { const dt = yield; t += dt; e.alpha = 1 - t / 0.3; }
            e.alpha = 0;
          }
        }
        e.invuln = false; e.untargetable = false; e.alpha = undefined;
        yield* wait(0.9);
        e.thinkT = rand(0.4, 0.8);
      } },
    ],
    onCancel(e) { e.alpha = undefined; e.mem.jaw = 0; e.mem.lureFlash = 0; },
    *phaseShift(e, sc) {
      e.vx = e.vy = 0;
      e.invuln = true;
      Sound.play('roar');
      sc.addText(e.x, e.y - 120, 'THE DEEP WAKES', '#7ff0e6', 20, { life: 1.8, vy: -20 });
      sc.darkness = Math.min(0.9, (sc.darkness || 0.7) + 0.12);
      for (let t = 0; t < 1.2;) { const dt = yield; t += dt; e.wind = 0.5 + 0.5 * Math.sin(t * 16); }
      e.wind = 0; e.invuln = false;
      ringShot(e, 24, 170, 10, 0, { kind: 'bubble', r: 9, color: '#7ff0e6' });
      e.speed *= 1.15;
      e.thinkT = 0.5;
    },
    light(e) {
      const L = e.mem.lure;
      return { x: L.x, y: L.y, r: 260 + (e.mem.lureFlash ? 140 : 0) + Math.sin(e.anim * 3) * 20, color: '#7ff0e6' };
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      const fy = -40 + Math.sin(t * 1.6) * 6;
      const a = e.facing;
      const dir = Math.cos(a) >= 0 ? 1 : -1;
      // lure position (world coords tracked for lighting)
      const lx = dir * r * 1.6 + Math.sin(t * 2) * 8, ly = fy - r * 1.5 + Math.cos(t * 2.4) * 6;
      e.mem.lure.x = e.x + lx; e.mem.lure.y = e.y + ly;
      // body
      ctx.save();
      ctx.translate(0, fy);
      ctx.scale(dir, 1);
      ctx.fillStyle = C('#123038');
      ctx.beginPath(); ctx.moveTo(-r * 1.6, 0); ctx.lineTo(-r * 2.3, -r * 0.6); ctx.lineTo(-r * 2.2, r * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C('#1a4048');
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 1.05, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = C('#245460');
      ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.3, r * 1.0, r * 0.5, 0, 0, TAU); ctx.fill();
      // fins
      ctx.fillStyle = C('#0e2a30');
      ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.95); ctx.lineTo(r * 0.2, -r * 1.5); ctx.lineTo(r * 0.5, -r * 0.9); ctx.closePath(); ctx.fill();
      // jaw
      const jaw = (e.mem.jaw || 0) * 0.5 + e.wind * 0.3;
      ctx.fillStyle = C('#05121a');
      ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.1); ctx.lineTo(r * 1.55, -r * 0.2 - jaw * r * 0.5); ctx.lineTo(r * 1.55, r * 0.35 + jaw * r * 0.6); ctx.lineTo(r * 0.6, r * 0.3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C('#e8fffa');
      for (let i = 0; i < 5; i++) {
        const tx = r * 0.75 + i * r * 0.17;
        ctx.beginPath(); ctx.moveTo(tx, -r * 0.12 - jaw * r * 0.3 * (i / 5)); ctx.lineTo(tx + 4, r * 0.05); ctx.lineTo(tx + 8, -r * 0.12 - jaw * r * 0.3 * (i / 5)); ctx.fill();
        ctx.beginPath(); ctx.moveTo(tx, r * 0.3 + jaw * r * 0.4 * (i / 5)); ctx.lineTo(tx + 4, r * 0.12); ctx.lineTo(tx + 8, r * 0.3 + jaw * r * 0.4 * (i / 5)); ctx.fill();
      }
      // eye
      ctx.fillStyle = C('#d8fff8');
      ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.4, r * 0.16, 0, TAU); ctx.fill();
      ctx.fillStyle = '#05121a';
      ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.4, r * 0.07, 0, TAU); ctx.fill();
      // stalk
      ctx.strokeStyle = C('#1a4048'); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 0.95); ctx.quadraticCurveTo(r * 0.9, -r * 2.2, lx * dir, ly - fy); ctx.stroke();
      ctx.restore();
      // lure (world-up independent of flip)
      ctx.globalCompositeOperation = 'lighter';
      const flash = e.mem.lureFlash ? 1.6 + Math.sin(t * 40) * 0.4 : 1;
      drawGlow(ctx, lx, ly, 46 * flash, '#7ff0e6', 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#f0fffc';
      ctx.beginPath(); ctx.arc(lx, ly, 7, 0, TAU); ctx.fill();
    },
  },

  // ========================================================================
  regent: {
    id: 'regent', boss: true, name: 'The Pale Regent', epithet: 'Who Put Out the Sun',
    r: 30, hp: 5800, speed: 120, mass: 50, color: '#f0ecff', projColor: '#ffe9b0', glow: 200,
    deathColors: ['#f0ecff', '#ffd98a', '#8a84a0', '#ffffff'], shootOffset: 60, flying: true,
    intro: ['So. The sun sends its last crumb to plead.', 'I gave this world rest from burning. You would undo my mercy?'],
    introRepeat: ['Still you climb. Still I wait.', 'Kneel, ember, and go dark.'],
    init(e) { bossInit(e); },
    ai(e, dt, sc) {
      bossTick(e, dt);
      if (bossPhaseCheck(e, sc)) return;
      const d = e.distToPlayer();
      e.facing = e.angleToPlayer();
      if (e.phase === 1) { if (d < 140) e.keepAway(140, 300, dt, 0.8); else if (d > 340) e.chase(0.8); else { e.vx *= 0.9; e.vy *= 0.9; } }
      else { e.vx *= 0.9; e.vy *= 0.9; }
      if (e.thinkT <= 0) {
        const m = bossMovePicker(e, BOSSES.regent.moves);
        e.doAction(m.fn(e, sc));
      }
    },
    moves: [
      { id: 'sweep', w: 2, cd: 2, cond: (e) => e.distToPlayer() < 200, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        const a = e.angleToPlayer();
        sc.addEffect(FX.telegraphCone(e.x, e.y, a, 2.6, 190, 0.6, '#ff5a7a', e));
        yield* windup(e, 0.6);
        Sound.play('swingHeavy');
        sc.addEffect(FX.slash(e.x, e.y - 30, a, 2.6, 190, '#fff0d0', 0.25, 0.4));
        const p = G.player;
        if (circleInArc(p.x, p.y, p.r, e.x, e.y, 190, a, 2.6)) damagePlayer(22, { angle: a, enemy: e, knock: 520 });
        yield* wait(0.5);
        e.thinkT = rand(0.2, 0.5);
      } },
      { id: 'lances', w: 3, cd: 1, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        const n = e.phase >= 2 ? 7 : 5;
        const base = e.angleToPlayer();
        const spread = 0.42;
        const lines = [];
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * spread;
          const len = 1000 * sc.map.raycast(e.x, e.y, e.x + Math.cos(a) * 1000, e.y + Math.sin(a) * 1000);
          lines.push({ a, len });
          sc.addEffect(FX.telegraphLine(e.x, e.y, a, len, 24, 0.85, '#ffd98a', e));
        }
        Sound.play('warn');
        yield* windup(e, 0.85);
        Sound.play('beam');
        G.shake(5);
        const p = G.player;
        let hit = false;
        for (const L of lines) {
          sc.addEffect(makeBeam(e.x, e.y - 20, L.a, L.len, 16, 0.4, '#fff0c0'));
          if (!hit && distToSegment(p.x, p.y, e.x, e.y, e.x + Math.cos(L.a) * L.len, e.y + Math.sin(L.a) * L.len) < 12 + p.r * 0.7) hit = !!damagePlayer(20, { angle: L.a, enemy: e, knock: 300 });
        }
        yield* wait(0.7);
        e.thinkT = rand(0.4, 0.7);
      } },
      { id: 'halo', w: 2.5, cd: 2, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        yield* windup(e, 0.5);
        const rings = e.phase >= 2 ? 4 : 3;
        for (let i = 0; i < rings; i++) {
          const gaps = [];
          const g0 = rand(TAU);
          const ng = e.phase >= 2 ? 2 : 3;
          for (let k = 0; k < ng; k++) gaps.push(g0 + (k * TAU) / ng);
          sc.addEffect(makeShockwave(e.x, e.y, 260, 900, 16, '#ffd98a', e, gaps));
          Sound.play('beam');
          yield* wait(0.65);
        }
        yield* wait(0.5);
        e.thinkT = rand(0.4, 0.8);
      } },
      { id: 'blink', w: 2, cd: 3, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        for (let t = 0; t < 0.3;) { const dt = yield; t += dt; e.alpha = 1 - t / 0.3; }
        e.untargetable = true; e.invuln = true;
        const ox = e.x, oy = e.y;
        sc.addEffect(makeFallingBlast(ox, oy, 120, 0.6, 18, '#ffd98a', e));
        const p = G.player;
        const spot = sc.map.randomOpenPoint({ awayX: p.x, awayY: p.y, minDist: 220, maxDist: 420, clearance: 2 });
        e.x = spot.x; e.y = spot.y;
        yield* wait(0.3);
        e.untargetable = false; e.invuln = false;
        for (let t = 0; t < 0.25;) { const dt = yield; t += dt; e.alpha = t / 0.25; }
        e.alpha = undefined;
        for (let w = 0; w < 2; w++) {
          const base = e.angleToPlayer();
          for (let i = -3; i <= 3; i++) enemyShoot(e, base + i * 0.13, 300, 10, { kind: 'shard', r: 7, color: '#ffe9b0' });
          Sound.play('enemyShoot');
          yield* wait(0.25);
        }
        yield* wait(0.4);
        e.thinkT = rand(0.3, 0.6);
      } },
      { id: 'court', w: 1.4, cd: 10, cond: () => liveEnemies().length < 4, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        yield* windup(e, 0.6);
        const kinds = e.phase >= 2 ? ['lancer', 'thrall', 'thrall', 'seraph'] : ['thrall', 'thrall', 'lancer'];
        for (const k of kinds) {
          const pt = sc.map.randomOpenPoint({ awayX: G.player.x, awayY: G.player.y, minDist: 200, clearance: 1 });
          sc.spawnEnemy(k, pt.x, pt.y, { hpScale: 1.1 });
        }
        yield* wait(0.6);
        e.thinkT = rand(0.5, 0.9);
      } },
      { id: 'cross', w: 2.6, cd: 5, phase: 2, fn: function* (e, sc) {
        // rotating cross beams centred on the Regent
        e.vx = e.vy = 0;
        const arms = 4;
        let a0 = rand(TAU);
        for (let k = 0; k < arms; k++) sc.addEffect(FX.telegraphLine(e.x, e.y, a0 + (k * TAU) / arms, 900, 22, 0.9, '#ff7a9a', e));
        Sound.play('warn');
        yield* windup(e, 0.9);
        Sound.play('beam');
        const dir = chance(0.5) ? 1 : -1;
        const beam = makeRotatingBeams(e, a0, arms, dir * 0.75, 3.6);
        sc.addEffect(beam);
        let t = 0, shot = 0;
        while (t < 3.6) {
          const dt = yield;
          t += dt; shot -= dt;
          if (shot <= 0) { shot = 0.7; ringShot(e, 10, 150, 9, rand(TAU), { r: 7, color: '#ffe9b0' }); }
        }
        yield* wait(0.5);
        e.thinkT = rand(0.4, 0.7);
      } },
      { id: 'stars', w: 2.4, cd: 4, phase: 2, fn: function* (e, sc) {
        e.vx = e.vy = 0;
        yield* windup(e, 0.5);
        for (let i = 0; i < 14; i++) {
          const p = G.player;
          const pt = i % 3 === 0 ? { x: p.x + rand(-20, 20), y: p.y + rand(-20, 20) } : sc.map.randomOpenPoint({ awayX: p.x, awayY: p.y, minDist: 0, maxDist: 320 });
          sc.addEffect(makeFallingBlast(pt.x, pt.y, 70, 0.9, 16, '#ffd98a', e));
          yield* wait(0.14);
        }
        yield* wait(0.8);
        e.thinkT = rand(0.3, 0.6);
      } },
    ],
    onCancel(e) { e.alpha = undefined; },
    *phaseShift(e, sc) {
      e.vx = e.vy = 0;
      e.invuln = true;
      Sound.play('roar');
      G.shake(12);
      Game.bossLine(e, 'Enough. See what lies beyond the light.');
      sc.darkness = 0.72;
      const cx = sc.map.pw / 2, cy = sc.map.ph / 2 + 20;
      const sx = e.x, sy = e.y;
      for (let t = 0; t < 1.6;) {
        const dt = yield; t += dt;
        const k = ease.inOutQuad(clamp(t / 1.2, 0, 1));
        e.x = lerp(sx, cx, k); e.y = lerp(sy, cy, k);
        e.wind = 0.5 + 0.5 * Math.sin(t * 18);
        if (Math.random() < 0.8) sc.particles.spawn({ x: e.x + rand(-60, 60), y: e.y - rand(0, 120), vx: 0, vy: -rand(40, 120), life: 0.8, size: 3, color: pick(['#ffd98a', '#f0ecff']) });
      }
      e.wind = 0; e.invuln = false;
      sc.addEffect(makeShockwave(e.x, e.y, 420, 900, 14, '#f0ecff', e));
      e.thinkT = 0.5;
    },
    draw(ctx, e, t, C) {
      const r = e.r;
      const fy = -18 + Math.sin(t * 1.5) * 5;
      const p2 = e.phase >= 2;
      // robe
      ctx.fillStyle = C(p2 ? '#2a2438' : '#d8d2e6');
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, fy);
      ctx.quadraticCurveTo(-r * 0.9, fy - r * 1.6, -r * 0.45, fy - r * 2.6);
      ctx.lineTo(r * 0.45, fy - r * 2.6);
      ctx.quadraticCurveTo(r * 0.9, fy - r * 1.6, r * 1.1, fy);
      for (let i = 4; i >= -4; i--) ctx.lineTo(i * r * 0.275, fy + Math.sin(t * 3 + i) * 3 + (i % 2) * 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C('#ffd98a'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, fy - r * 2.5); ctx.lineTo(0, fy - r * 0.2); ctx.stroke();
      // sleeves / hands
      ctx.fillStyle = C(p2 ? '#3a3248' : '#e8e2f2');
      ctx.beginPath(); ctx.ellipse(-r * 0.95, fy - r * 1.6 - e.wind * 8, r * 0.3, r * 0.55, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * 0.95, fy - r * 1.6 - e.wind * 8, r * 0.3, r * 0.55, -0.4, 0, TAU); ctx.fill();
      // scepter
      const sa = e.facing;
      ctx.save();
      ctx.translate(r * 0.95, fy - r * 1.5);
      ctx.rotate(-1.2 + Math.cos(sa) * 0.2);
      ctx.strokeStyle = C('#b8a060'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, r * 0.8); ctx.lineTo(0, -r * 1.3); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, -r * 1.35, 24 + e.wind * 20, '#fff0c0', 0.8);
      ctx.restore();
      // head: a featureless pale mask
      ctx.fillStyle = C('#f4f0fa');
      ctx.beginPath(); ctx.ellipse(0, fy - r * 2.95, r * 0.42, r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = C(p2 ? '#ff6a8a' : '#2a2438');
      ctx.beginPath(); ctx.ellipse(-r * 0.15, fy - r * 2.98, r * 0.07, r * 0.12, 0, 0, TAU); ctx.ellipse(r * 0.15, fy - r * 2.98, r * 0.07, r * 0.12, 0, 0, TAU); ctx.fill();
      // halo crown
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(p2 ? '#ff9ab0' : '#ffe9b0', 0.9); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, fy - r * 3.5, r * 0.7, r * 0.22, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + t * 0.6;
        const hx = Math.cos(a) * r * 0.7, hy = fy - r * 3.5 + Math.sin(a) * r * 0.22;
        drawGlow(ctx, hx, hy - 6, 10, p2 ? '#ff9ab0' : '#ffe9b0', 0.9);
      }
      drawGlow(ctx, 0, fy - r * 3.4, r * 2.2, p2 ? '#ff6a8a' : '#ffe9b0', 0.25);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
};

function makeRotatingBeams(e, a0, arms, speed, dur) {
  const hitCd = { t: 0 };
  return {
    layer: 'top', t: 0, a: a0, hazard: true,
    update(dt, sc) {
      this.t += dt;
      this.a += speed * dt * (e.st.chill > 0 ? speedMultOf(e) : 1);
      hitCd.t -= dt;
      const p = G.player;
      if (p && !p.dead && hitCd.t <= 0) {
        for (let k = 0; k < arms; k++) {
          const a = this.a + (k * TAU) / arms;
          if (distToSegment(p.x, p.y, e.x, e.y, e.x + Math.cos(a) * 1000, e.y + Math.sin(a) * 1000) < 14 + p.r * 0.6) {
            if (damagePlayer(16, { angle: a + Math.PI / 2, enemy: e, knock: 260 })) hitCd.t = 0.8;
            break;
          }
        }
      }
      return this.t < dur && !e.dead;
    },
    draw(ctx, sc) {
      const fade = Math.min(1, (dur - this.t) / 0.3, this.t / 0.15);
      for (let k = 0; k < arms; k++) {
        const a = this.a + (k * TAU) / arms;
        const len = 1000 * G.scene.map.raycast(e.x, e.y, e.x + Math.cos(a) * 1000, e.y + Math.sin(a) * 1000);
        ctx.save();
        ctx.translate(e.x, e.y - 10);
        ctx.rotate(a);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(255,120,150,0.3)';
        ctx.fillRect(0, -16, len, 32);
        ctx.fillStyle = 'rgba(255,200,210,0.85)';
        ctx.fillRect(0, -6, len, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, -2, len, 4);
        ctx.restore();
      }
    },
  };
}

function makeWhirlpool(x, y, r, dur) {
  return {
    layer: 'floor', t: 0, hazard: true,
    update(dt) { this.t += dt; return this.t < dur; },
    draw(ctx) {
      const a = Math.min(1, this.t / 0.3, (dur - this.t) / 0.4);
      ctx.save();
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = '#4fe0d0';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const rr = r * (0.2 + i * 0.18);
        const st = -this.t * (2.5 - i * 0.3) + i;
        ctx.beginPath(); ctx.arc(x, y, rr, st, st + 4.2); ctx.stroke();
      }
      ctx.restore();
    },
  };
}
