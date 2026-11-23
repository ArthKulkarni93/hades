'use strict';
// ---------------------------------------------------------------------------
// Weapons ("Forms"), Casts, and Sunforge upgrades.
// A weapon exposes init / update / attack / special / dashAttack / draw.
// attack()/special() return true when they started an action.
// ---------------------------------------------------------------------------

function meleeArc(p, o) {
  const swing = o.swing || {};
  let n = 0;
  for (const e of G.scene.enemies) {
    if (e.dead || e.spawning) continue;
    if (circleInArc(e.x, e.y, e.r, p.x, p.y, o.range, o.angle, o.arc)) {
      hitEnemy(e, o.dmg, { source: o.source || 'attack', angle: angleTo(p.x, p.y, e.x, e.y), knock: o.knock || 0, heavy: o.heavy, swing, x: e.x, y: e.y });
      n++;
    }
  }
  if (o.props !== false) hitProps(p.x, p.y, o.range, o.angle, o.arc);
  if (n > 0) { G.hitstop = Math.max(G.hitstop, o.heavy ? 0.055 : 0.028); if (o.heavy) G.shake(2.5); }
  return n;
}

function meleeLine(p, o) {
  const swing = o.swing || {};
  const dx = Math.cos(o.angle), dy = Math.sin(o.angle);
  let n = 0;
  for (const e of G.scene.enemies) {
    if (e.dead || e.spawning) continue;
    const rx = e.x - p.x, ry = e.y - p.y;
    const t = rx * dx + ry * dy;
    if (t < -e.r || t > o.length + e.r) continue;
    const perp = Math.abs(rx * -dy + ry * dx);
    if (perp > o.width / 2 + e.r) continue;
    hitEnemy(e, o.dmg, { source: o.source || 'attack', angle: o.angle, knock: o.knock || 0, heavy: o.heavy, swing, x: e.x, y: e.y });
    n++;
  }
  hitProps(p.x + dx * o.length * 0.5, p.y + dy * o.length * 0.5, o.length * 0.6, o.angle, TAU);
  if (n > 0) G.hitstop = Math.max(G.hitstop, o.heavy ? 0.05 : 0.028);
  return n;
}

// training dummies & breakables live in scene.props with .hittable
function hitProps(x, y, range, angle, arc) {
  for (const pr of G.scene.props) {
    if (!pr.hittable) continue;
    if (circleInArc(pr.x, pr.y, pr.r || 18, x, y, range, angle, arc)) pr.onHit && pr.onHit(angle);
  }
}

// ---------------------------------------------------------------------------
const WEAPONS = {
  blade: {
    id: 'blade', name: 'Cinderblade', title: 'Form of the First Forge', color: '#ff9a4a', cost: 0,
    desc: 'A swift ember-sword. Fast combos up close, with a flaming crescent to reach the far ones.',
    moves: [['Attack', 'Three-strike combo. The last blow is heavy.'], ['Special', 'Flame Crescent: a piercing wave of fire.'], ['Dash + Attack', 'Dash-Strike: a lunging thrust.']],
    init(p) { p.ws = { combo: 0, comboT: 0, swing: null }; },
    update(p, dt) { p.ws.comboT -= dt; },
    combo(p) {
      const wide = p.build.hasForge('blade_wide') ? 1.35 : 1, reach = p.build.hasForge('blade_wide') ? 1.15 : 1;
      return [
        { dmg: 20, range: 84 * reach, arc: 2.2 * wide, knock: 130, dur: 0.3, lock: 0.19, hit: 0.06, lunge: 170 },
        { dmg: 22, range: 86 * reach, arc: 2.3 * wide, knock: 140, dur: 0.3, lock: 0.19, hit: 0.06, lunge: 170 },
        { dmg: 42, range: 98 * reach, arc: 3.2 * wide, knock: 320, dur: 0.46, lock: 0.36, hit: 0.11, lunge: 280, heavy: true },
      ];
    },
    attack(p) {
      const ws = p.ws;
      const steps = this.combo(p);
      const i = ws.comboT > 0 ? (ws.combo + 1) % steps.length : 0;
      const st = steps[i];
      const spd = p.build.hasForge('blade_flurry') ? 1.25 : 1;
      ws.combo = i;
      ws.comboT = (st.dur / spd) + 0.32;
      const ang = p.aim;
      const dir = i % 2 === 0 ? 1 : -1;
      ws.swing = { t: 0, dur: (st.hit + 0.1) / spd, from: ang - dir * st.arc / 2, to: ang + dir * st.arc / 2 };
      p.startAction({
        name: 'attack', dur: st.dur / spd, lock: st.lock / spd, dashCancel: (st.hit + 0.02) / spd, move: 0.25,
        lunge: { speed: st.lunge, time: 0.09, angle: ang },
        events: [{ t: st.hit / spd, fn: () => {
          Sound.play(st.heavy ? 'swingHeavy' : 'swing', { pitch: 1 + i * 0.1 });
          G.scene.addEffect(FX.slash(p.x, p.y - 10, ang, st.arc, st.range, '#ffb46a', st.heavy ? 0.2 : 0.15, 0.55, p));
          meleeArc(p, { range: st.range, arc: st.arc, angle: ang, dmg: st.dmg, knock: st.knock, heavy: st.heavy, swing: {} });
          if (st.heavy) {
            G.shake(2);
            if (p.build.hasForge('blade_reaver')) this.crescent(p, ang, 0.6);
          }
        } }],
      });
      return true;
    },
    crescent(p, ang, scale = 1) {
      G.scene.addProj(new Proj({
        x: p.x + Math.cos(ang) * 20, y: p.y - 10 + Math.sin(ang) * 20, vx: Math.cos(ang) * 660, vy: Math.sin(ang) * 660,
        r: 24 * scale, dmg: 30 * scale, source: 'special', pierce: Infinity, life: 0.62, kind: 'crescent', color: '#ff9a4a',
        knock: 160, light: 120, trail: 0.02, trailColor: '#ff8a3a', swing: {},
        onHit(pr, e) { hitEnemy(e, pr.dmg, { source: 'special', angle: Math.atan2(pr.vy, pr.vx), knock: pr.knock, swing: pr.swing, x: pr.x, y: pr.y }); },
      }));
    },
    special(p) {
      const ang = p.aim;
      p.startAction({
        name: 'special', dur: 0.4, lock: 0.34, dashCancel: 0.14, move: 0.3,
        events: [{ t: 0.1, fn: () => {
          Sound.play('swingHeavy');
          Sound.play('cast');
          G.scene.addEffect(FX.slash(p.x, p.y - 10, ang, 1.6, 60, '#ffd28a', 0.18, 0.6, p));
          if (p.build.hasForge('blade_twin')) { for (const off of [-0.28, 0, 0.28]) this.crescent(p, ang + off, off === 0 ? 1 : 0.8); }
          else this.crescent(p, ang, 1);
        } }],
      });
      p.ws.swing = { t: 0, dur: 0.2, from: ang - 0.8, to: ang + 0.8 };
      return true;
    },
    dashAttack(p) {
      const ang = p.aim;
      const mult = p.build.hasForge('blade_riposte') ? 2.2 : 1;
      p.startAction({
        name: 'dashstrike', dur: 0.34, lock: 0.24, dashCancel: 0.12, move: 0.2,
        lunge: { speed: 380, time: 0.1, angle: ang },
        events: [{ t: 0.05, fn: () => {
          Sound.play('swingHeavy');
          G.scene.addEffect(FX.thrust(p.x, p.y - 10, ang, 130, 34, '#ffc47a', 0.16));
          meleeLine(p, { angle: ang, length: 130, width: 60, dmg: 32 * mult, knock: 240, heavy: true, swing: {} });
        } }],
      });
      p.ws.swing = { t: 0, dur: 0.12, from: ang, to: ang };
      p.ws.comboT = 0;
      return true;
    },
    draw(ctx, p, t) {
      const ws = p.ws;
      let a;
      if (ws.swing && ws.swing.t < ws.swing.dur) a = lerp(ws.swing.from, ws.swing.to, ease.outCubic(ws.swing.t / ws.swing.dur));
      else a = p.aim + (Math.cos(p.aim) >= 0 ? 0.9 : -0.9);
      const hx = p.x + Math.cos(p.aim) * 8, hy = p.y - 14 + Math.sin(p.aim) * 4;
      const L = 30;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, L * 0.6, 0, 26, '#ff8a3a', 0.35);
      ctx.restore();
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a);
      ctx.fillStyle = '#3a2a2a';
      ctx.fillRect(-6, -2, 8, 4);
      ctx.fillStyle = '#c9a060';
      ctx.fillRect(1, -5, 3, 10);
      const g = ctx.createLinearGradient(4, 0, L, 0);
      g.addColorStop(0, '#ffd8a0'); g.addColorStop(1, '#ff7a2e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(L - 4, -2); ctx.lineTo(L + 3, 0); ctx.lineTo(L - 4, 2.5); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
  },

  bow: {
    id: 'bow', name: 'Dawnbow', title: 'Form of the Long Light', color: '#ffd27a', cost: 30,
    desc: 'Hold Attack to draw. Release at full draw for a Perfect Shot. Strikes from afar.',
    moves: [['Hold Attack', 'Draw and loose. Release right at full draw for a Perfect Shot.'], ['Special', 'Sunburst Volley: a fan of arrows.'], ['Dash + Attack', 'Snap Shot: an instant strong arrow.']],
    init(p) { p.ws = { charge: 0, charging: false, flashT: 0, chimed: false }; },
    update(p, dt) { p.ws.flashT -= dt; },
    chargeTime(p) { return p.build.hasForge('bow_trigger') ? 0.32 : 0.52; },
    fire(p, k, perfect, ang) {
      const pierceAll = p.build.hasForge('bow_pierce');
      const dmg = lerp(12, 44, k) * (perfect ? 1.4 : 1);
      const speed = lerp(760, 1400, k);
      const color = perfect ? '#fff6c0' : '#ffd27a';
      Sound.play('arrow', { power: k });
      const sunfire = perfect && p.build.hasForge('bow_sunfire');
      G.scene.addProj(new Proj({
        x: p.x + Math.cos(ang) * 16, y: p.y - 14 + Math.sin(ang) * 16, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        r: 6 + k * 2, dmg, source: 'attack', pierce: pierceAll || perfect ? Infinity : k >= 1 ? 1 : 0, life: 0.9, kind: 'arrow', power: k, color,
        knock: 60 + k * 120, heavy: perfect, light: 80, critBonus: perfect ? 0.2 : 0, swing: {},
        wall: p.build.hasForge('bow_ricochet') ? 'bounce' : 'die', bounces: 2,
        onHit(pr, e) {
          hitEnemy(e, pr.dmg, { source: 'attack', angle: Math.atan2(pr.vy, pr.vx), knock: pr.knock, heavy: pr.heavy, critBonus: pr.critBonus, swing: pr.swing, x: pr.x, y: pr.y });
          if (sunfire) {
            G.scene.addEffect(FX.flash(pr.x, pr.y, 90, '#ffd27a', 0.25));
            G.scene.addEffect(FX.ring(pr.x, pr.y, 6, 70, 0.3, '#ffe9a0', 4));
            Sound.play('explode', { size: 0.6 });
            aoeDamage(pr.x, pr.y, 70, 40, { source: 'fire', secondary: true, exclude: new Set([e]) });
          }
        },
      }));
      if (perfect) {
        G.scene.addText(p.x, p.y - 46, 'PERFECT', '#fff6c0', 13, { life: 0.6, vy: -50 });
        G.scene.addEffect(FX.flash(p.x + Math.cos(ang) * 20, p.y - 14 + Math.sin(ang) * 20, 50, '#fff6c0', 0.15));
      }
    },
    attack(p) {
      const ws = p.ws;
      ws.charge = 0; ws.charging = true; ws.chimed = false;
      const ct = this.chargeTime(p);
      p.startAction({
        name: 'charge', dur: 99, lock: 99, dashCancel: 0, move: 0.45, hold: true,
        update: (dt, a) => {
          if (!a.hold) return;
          ws.charge += dt;
          if (!ws.chimed && ws.charge >= ct) { ws.chimed = true; ws.flashT = 0.15; Sound.play('charged'); }
          if (!Input.down('attack') || p.forceRelease) {
            p.forceRelease = false;
            const k = clamp((ws.charge - 0.05) / (ct - 0.05), 0, 1);
            const perfect = ws.charge >= ct && ws.charge <= ct + 0.17;
            this.fire(p, k, perfect, p.aim);
            ws.charging = false;
            a.hold = false;
            a.dur = a.t + 0.14; a.lock = a.t + 0.09; a.move = 0.6;
          }
        },
        onEnd: () => { ws.charging = false; },
      });
      return true;
    },
    special(p) {
      const n = p.build.hasForge('bow_volley') ? 9 : 5;
      const spread = p.build.hasForge('bow_volley') ? 0.95 : 0.55;
      const ang = p.aim;
      p.startAction({
        name: 'special', dur: 0.5, lock: 0.44, dashCancel: 0.1, move: 0.35,
        events: [{ t: 0.08, fn: () => {
          Sound.play('arrow', { power: 0.8 });
          const swing = {};
          for (let i = 0; i < n; i++) {
            const a = ang - spread / 2 + (spread * i) / (n - 1);
            G.scene.addProj(new Proj({
              x: p.x + Math.cos(a) * 14, y: p.y - 14 + Math.sin(a) * 14, vx: Math.cos(a) * 1000, vy: Math.sin(a) * 1000,
              r: 6, dmg: 10, source: 'special', life: 0.55, kind: 'arrow', power: 0.3, color: '#ffb84a', knock: 70, light: 50, swing,
              wall: p.build.hasForge('bow_ricochet') ? 'bounce' : 'die', bounces: 2,
              pierce: p.build.hasForge('bow_pierce') ? Infinity : 0,
              onHit(pr, e) { hitEnemy(e, pr.dmg, { source: 'special', angle: Math.atan2(pr.vy, pr.vx), knock: pr.knock, swing: pr.swing, x: pr.x, y: pr.y }); },
            }));
          }
        } }],
      });
      return true;
    },
    dashAttack(p) {
      p.startAction({
        name: 'snap', dur: 0.26, lock: 0.2, dashCancel: 0.08, move: 0.4,
        events: [{ t: 0.03, fn: () => this.fire(p, 0.75, false, p.aim) }],
      });
      return true;
    },
    draw(ctx, p) {
      const ws = p.ws;
      const a = p.aim;
      const hx = p.x + Math.cos(a) * 12, hy = p.y - 14 + Math.sin(a) * 8;
      const ct = this.chargeTime(p);
      const k = ws.charging ? clamp(ws.charge / ct, 0, 1) : 0;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a);
      ctx.strokeStyle = '#c89a50'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-4, 0, 15, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.lineWidth = 1;
      const pull = -4 - k * 12;
      const ex = -4 + Math.cos(1.2) * 15, ey = Math.sin(1.2) * 15;
      ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(pull, 0); ctx.lineTo(ex, ey); ctx.stroke();
      if (ws.charging) {
        ctx.globalCompositeOperation = 'lighter';
        const full = ws.charge >= ct;
        drawGlow(ctx, 8, 0, 18 + k * 20, full ? '#fff6c0' : '#ffb84a', 0.5 + k * 0.4);
        ctx.strokeStyle = full ? '#ffffff' : '#ffd27a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pull, 0); ctx.lineTo(16, 0); ctx.stroke();
      }
      ctx.restore();
      if (ws.charging) {
        // charge ring around the ember
        ctx.save();
        ctx.strokeStyle = ws.charge >= ct ? (ws.charge <= ct + 0.17 ? '#ffffff' : '#ffd27a') : rgba('#ffd27a', 0.7);
        ctx.lineWidth = ws.flashT > 0 ? 4 : 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y - 16, 26, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
        ctx.restore();
      }
    },
  },

  wheel: {
    id: 'wheel', name: 'Sunwheel', title: 'Form of the Turning Day', color: '#ffb347', cost: 50,
    desc: 'Hurl a blazing disc that returns to you. Detonate it mid-flight with your Special.',
    moves: [['Attack', 'Throw the wheel. It strikes going out and coming back.'], ['Special', 'Detonate a thrown wheel, or spin it around you.'], ['Dash + Attack', 'A swift throw.']],
    init(p) { p.ws = { inHand: p.build.hasForge('wheel_twin') ? 2 : 1, out: [], spin: 0, detCd: 0 }; },
    update(p, dt) {
      const ws = p.ws;
      ws.spin += dt * 14;
      if (ws.detCd > 0) ws.detCd -= dt;
      const max = p.build.hasForge('wheel_twin') ? 2 : 1;
      ws.out = ws.out.filter((d) => !d.dead);
      if (ws.inHand + ws.out.length < max) ws.inHand = max - ws.out.length;
    },
    throwDisc(p, ang, speedMult = 1) {
      const ws = p.ws;
      const far = p.build.hasForge('wheel_far');
      const quick = p.build.hasForge('wheel_quick') ? 1.35 : 1;
      const range = far ? 420 : 300;
      const speed = 820 * quick * speedMult;
      const back = p.build.hasForge('wheel_boomerang') ? 2 : 1;
      ws.inHand--;
      Sound.play('disc');
      const pr = new Proj({
        x: p.x + Math.cos(ang) * 18, y: p.y - 12 + Math.sin(ang) * 18, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        r: far ? 17 : 14, dmg: 24, source: 'attack', pierce: Infinity, life: 99, kind: 'disc', color: '#ffb347', knock: 110, light: 110,
        phase: 'out', traveled: 0, range, speed, swing: {},
        onUpdate(d, dt) {
          if (d.phase === 'out') {
            d.traveled += Math.hypot(d.vx, d.vy) * dt;
            const k = d.traveled / d.range;
            const sp = d.speed * Math.max(0.25, 1 - k * 0.75);
            const a = Math.atan2(d.vy, d.vx);
            d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp;
            if (d.traveled >= d.range) d.turn();
          } else {
            const pl = G.player;
            const a = angleTo(d.x, d.y, pl.x, pl.y - 12);
            d.retSpeed = Math.min(1250 * quick, (d.retSpeed || 200) + 2600 * dt);
            d.vx = Math.cos(a) * d.retSpeed; d.vy = Math.sin(a) * d.retSpeed;
            if (dist(d.x, d.y, pl.x, pl.y - 12) < 26) {
              d.dead = true;
              pl.ws.inHand++;
              Sound.play('catch');
              G.scene.particles.burst(pl.x, pl.y - 12, 6, { color: '#ffd27a', speed: 120, life: 0.25, size: 2.5, type: 'spark' });
            }
          }
          if (Math.random() < 0.6) G.scene.particles.spawn({ x: d.x + rand(-6, 6), y: d.y + rand(-6, 6), vx: rand(-30, 30), vy: rand(-30, 30), life: 0.3, size: 3, color: pick(['#ffb347', '#ff7a2e', '#ffe0a0']) });
        },
        onWall(d) { if (d.phase === 'out') d.turn(); },
        onHit(d, e) {
          hitEnemy(e, d.dmg * (d.phase === 'return' ? back : 1), { source: 'attack', angle: Math.atan2(d.vy, d.vx), knock: d.knock, swing: d.swing, x: d.x, y: d.y });
        },
        drawFn(ctx, d) {
          const ready = !(G.player && G.player.ws && G.player.ws.detCd > 0);
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.globalCompositeOperation = 'lighter';
          drawGlow(ctx, 0, 0, d.r * (ready ? 3.4 : 2.4), ready ? '#ffb347' : '#ff7a2e', ready ? 0.8 : 0.45);
          ctx.restore();
          drawWheel(ctx, d.x, d.y, d.r, d.t * 22);
          if (ready) { ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 5 + Math.sin(d.t * 18) * 1.5, 0, TAU); ctx.stroke(); }
        },
      });
      pr.turn = function () {
        if (this.phase !== 'out') return;
        this.phase = 'return';
        this.wall = 'pass';
        this.hit.clear();
        this.swing = {};
        this.retSpeed = 220;
      };
      ws.out.push(pr);
      G.scene.addProj(pr);
    },
    attack(p) {
      if (p.ws.inHand <= 0) return false;
      const ang = p.aim;
      p.startAction({
        name: 'attack', dur: 0.24, lock: 0.17, dashCancel: 0.06, move: 0.65,
        events: [{ t: 0.04, fn: () => this.throwDisc(p, ang) }],
      });
      return true;
    },
    special(p) {
      const ws = p.ws;
      const live = ws.out.filter((d) => !d.dead);
      if (live.length) {
        if (ws.detCd > 0) return false;
        ws.detCd = 0.9;
        const over = p.build.hasForge('wheel_overheat');
        const r = over ? 125 : 90, dmg = over ? 70 : 46;
        // detonate the farthest wheel
        live.sort((a, b) => dist2(p.x, p.y, b.x, b.y) - dist2(p.x, p.y, a.x, a.y));
        const d = live[0];
        d.dead = true;
        ws.inHand++;
        Sound.play('explode', { size: over ? 1 : 0.75 });
        G.shake(5);
        G.scene.addEffect(FX.flash(d.x, d.y, r * 1.4, '#ff9a3a', 0.3));
        G.scene.addEffect(FX.ring(d.x, d.y, 10, r, 0.3, '#ffd27a', 6));
        G.scene.particles.burst(d.x, d.y, 30, { color: ['#ffb347', '#ff6a2a', '#fff0c0'], speed: r * 3.2, life: 0.5, size: 4, drag: 4 });
        aoeDamage(d.x, d.y, r, dmg, { source: 'special', knock: 260, heavy: true, swing: {} });
        G.scene.particles.burst(p.x, p.y - 12, 8, { color: '#ffd27a', speed: 120, life: 0.3, size: 3, type: 'spark' });
        p.startAction({ name: 'detonate', dur: 0.16, lock: 0.12, dashCancel: 0, move: 0.8 });
        return true;
      }
      const ang = p.aim;
      p.startAction({
        name: 'special', dur: 0.42, lock: 0.34, dashCancel: 0.12, move: 0.55,
        events: [{ t: 0.08, fn: () => {
          Sound.play('swingHeavy');
          G.scene.addEffect(FX.slash(p.x, p.y - 10, ang, TAU * 0.98, 92, '#ffb347', 0.25, 0.45, p));
          meleeArc(p, { range: 92, arc: TAU, angle: ang, dmg: 26, knock: 200, source: 'special', swing: {} });
        } }],
      });
      return true;
    },
    dashAttack(p) {
      if (p.ws.inHand <= 0) return false;
      const ang = p.aim;
      p.startAction({ name: 'attack', dur: 0.2, lock: 0.14, dashCancel: 0.04, move: 0.7, events: [{ t: 0.02, fn: () => this.throwDisc(p, ang, 1.3) }] });
      return true;
    },
    draw(ctx, p) {
      if (p.ws.inHand <= 0) return;
      const a = p.aim;
      for (let i = 0; i < p.ws.inHand; i++) {
        const off = i === 0 ? 0 : -1.4;
        const hx = p.x + Math.cos(a + off) * 15, hy = p.y - 14 + Math.sin(a + off) * 9;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, hx, hy, 26, '#ff9a3a', 0.35);
        ctx.restore();
        drawWheel(ctx, hx, hy, 10, p.ws.spin * 0.3);
      }
    },
  },
};
const WEAPON_IDS = Object.keys(WEAPONS);

function drawWheel(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.78;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a2a10';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff0c0';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Casts
// ---------------------------------------------------------------------------
const CASTS = {
  ember(p, a) {
    Sound.play('cast');
    G.scene.addProj(new Proj({
      x: p.x + Math.cos(a) * 16, y: p.y - 14 + Math.sin(a) * 16, vx: Math.cos(a) * 980, vy: Math.sin(a) * 980,
      r: 9, dmg: 34, source: 'cast', pierce: Infinity, life: 0.55, kind: 'bolt', color: '#ff8a3a', knock: 90, light: 120, trail: 0.015, trailColor: '#ffb46a',
    }));
  },

  whirlwind(p, a, v) {
    Sound.play('gust');
    const lastHit = new Map();
    G.scene.addProj(new Proj({
      x: p.x + Math.cos(a) * 20, y: p.y - 6 + Math.sin(a) * 20, vx: Math.cos(a) * 270, vy: Math.sin(a) * 270,
      r: 34, dmg: v.dmg, source: 'cast', pierce: Infinity, life: 2.6, kind: 'whirl', color: '#8ff5d2', light: 90, wall: 'bounce', bounces: 4,
      onUpdate(pr, dt, sc) {
        for (const e of sc.enemies) {
          if (e.dead || e.spawning || e.immovable) continue;
          const d = dist(pr.x, pr.y, e.x, e.y);
          if (d < 150 && d > 6) {
            const pull = (1 - d / 150) * 900 * dt / e.mass;
            e.kx += ((pr.x - e.x) / d) * pull; e.ky += ((pr.y - e.y) / d) * pull;
          }
        }
        if (pr.t % 0.12 < dt) Sound.play('gust');
      },
      onHit(pr, e) {
        const now = pr.t;
        const last = lastHit.get(e);
        if (last !== undefined && now - last < 0.28) return;
        lastHit.set(e, now);
        hitEnemy(e, pr.dmg, { source: 'cast', angle: angleTo(pr.x, pr.y, e.x, e.y), knock: 30 });
      },
      drawFn(ctx, pr) {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.globalCompositeOperation = 'lighter';
        const fade = Math.min(1, pr.life / 0.4);
        drawGlow(ctx, 0, 0, 60, '#8ff5d2', 0.3 * fade);
        ctx.strokeStyle = rgba('#c8fff0', 0.7 * fade);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const rr = 10 + i * 8;
          const st = pr.t * (9 - i) + i * 1.3;
          ctx.beginPath(); ctx.ellipse(0, -i * 6, rr, rr * 0.45, 0, st, st + 3.6); ctx.stroke();
        }
        ctx.restore();
      },
    }));
    // each hit uses its own cooldown, so clear the pierce hit-set each frame
    const pr = G.scene.projectiles[G.scene.projectiles.length - 1];
    const orig = pr.onUpdate;
    pr.onUpdate = function (q, dt, sc) { q.hit.clear(); orig(q, dt, sc); };
  },

  ballLightning(p, a, v) {
    Sound.play('zap');
    G.scene.addProj(new Proj({
      x: p.x + Math.cos(a) * 16, y: p.y - 14 + Math.sin(a) * 16, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230,
      r: 13, dmg: 0, source: 'cast', pierce: Infinity, life: 3.2, kind: 'ball', color: '#fff27a', light: 140, wall: 'bounce', bounces: 3, zapT: 0,
      onUpdate(pr, dt, sc) {
        pr.zapT -= dt;
        if (pr.zapT <= 0) {
          pr.zapT = 0.3;
          let any = false;
          for (const e of enemiesInRadius(pr.x, pr.y, 125, sc)) {
            any = true;
            sc.addEffect(FX.bolt(pr.x, pr.y, e.x, e.y - 12, '#fff27a', 0.16, 2));
            hitEnemy(e, v.dmg, { source: 'cast', angle: angleTo(pr.x, pr.y, e.x, e.y), knock: 20, color: '#fff27a' });
            SECONDARY_HOOKS.lightning(e);
            if (G.run.build.has('duo_hailstorm')) applyChill(e, 1);
          }
          if (any) Sound.play('zap');
        }
      },
      onHit() {},
      drawFn(ctx, pr) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const fade = Math.min(1, pr.life / 0.3);
        drawGlow(ctx, pr.x, pr.y, 46, '#fff27a', 0.7 * fade);
        ctx.strokeStyle = rgba('#ffffff', 0.8 * fade); ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          let a0 = rand(TAU);
          ctx.moveTo(pr.x + Math.cos(a0) * 4, pr.y + Math.sin(a0) * 4);
          for (let k = 1; k < 4; k++) { a0 += rand(-0.8, 0.8); ctx.lineTo(pr.x + Math.cos(a0) * (4 + k * 5), pr.y + Math.sin(a0) * (4 + k * 5)); }
          ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 6, 0, TAU); ctx.fill();
        ctx.restore();
      },
    }));
  },

  hailstone(p, a, v) {
    Sound.play('cast');
    G.scene.addProj(new Proj({
      x: p.x + Math.cos(a) * 16, y: p.y - 14 + Math.sin(a) * 16, vx: Math.cos(a) * 820, vy: Math.sin(a) * 820,
      r: 10, dmg: 0, source: 'cast', pierce: 0, life: 0.5, kind: 'shard', color: '#9fd8ff', light: 100, trail: 0.02, trailColor: '#cfeeff',
      onHit() {},
      onDeath(pr) { frostNova(pr.x, pr.y + 8, 115, v.dmg, 3, 'cast'); G.shake(3); },
    }));
  },

  sporePod(p, a, v) {
    Sound.play('cast');
    G.scene.addProj(new Proj({
      x: p.x + Math.cos(a) * 16, y: p.y - 14 + Math.sin(a) * 16, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
      r: 10, dmg: 0, source: 'cast', pierce: 0, life: 0.45, kind: 'orb', color: '#7cf08e', light: 80, trail: 0.03, trailColor: '#3a8a40',
      onHit() {},
      onDeath(pr, sc) {
        Sound.play('poison');
        sc.addEffect(makeSporeCloud(pr.x, pr.y + 10, 105, 4));
      },
    }));
  },

  blackSun(p, a, v) {
    Sound.play('hex');
    G.scene.addProj(new Proj({
      x: p.x + Math.cos(a) * 16, y: p.y - 14 + Math.sin(a) * 16, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
      r: 12, dmg: 0, source: 'cast', pierce: Infinity, life: 1.7, kind: 'void', color: '#c99bff', light: 0,
      onUpdate(pr, dt, sc) {
        pr.vx *= Math.exp(-4 * dt); pr.vy *= Math.exp(-4 * dt);
        for (const e of sc.enemies) {
          if (e.dead || e.spawning || e.immovable) continue;
          const d = dist(pr.x, pr.y, e.x, e.y);
          if (d < 180 && d > 8) {
            const pull = (1 - d / 180) * 1300 * dt / e.mass;
            e.kx += ((pr.x - e.x) / d) * pull; e.ky += ((pr.y - e.y) / d) * pull;
          }
        }
        if (Math.random() < 0.7) {
          const ang = rand(TAU), rr = rand(60, 150);
          sc.particles.spawn({ x: pr.x + Math.cos(ang) * rr, y: pr.y + Math.sin(ang) * rr, vx: -Math.cos(ang) * rr * 2.5, vy: -Math.sin(ang) * rr * 2.5, life: 0.35, size: 2.5, color: '#c99bff', drag: 0 });
        }
      },
      onHit() {},
      onWall(pr) { pr.vx = 0; pr.vy = 0; },
      onDeath(pr, sc) {
        Sound.play('explode', { size: 0.9 });
        G.shake(6);
        sc.addEffect(FX.flash(pr.x, pr.y, 170, '#9a6aff', 0.35));
        sc.addEffect(FX.ring(pr.x, pr.y, 140, 6, 0.3, '#c99bff', 6));
        sc.particles.burst(pr.x, pr.y, 30, { color: ['#c99bff', '#4a2a7a', '#ffffff'], speed: 320, life: 0.5, size: 4, type: 'spark' });
        aoeDamage(pr.x, pr.y, 125, v.dmg, { source: 'cast', heavy: true, knock: 120 });
      },
      drawFn(ctx, pr) {
        const k = Math.min(1, pr.t / 0.3);
        const rr = 10 + 14 * k + Math.sin(pr.t * 20) * 1.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, pr.x, pr.y, rr * 3.2, '#9a6aff', 0.55);
        ctx.restore();
        ctx.fillStyle = '#05010a';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#e0c8ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, rr, 0, TAU); ctx.stroke();
      },
    }));
  },
};

function makeSporeCloud(x, y, r, dur) {
  const puffs = [];
  for (let i = 0; i < 9; i++) puffs.push({ a: rand(TAU), d: rand(0, r * 0.7), s: rand(0.5, 1), sp: rand(-0.6, 0.6) });
  return {
    layer: 'floor', t: 0, tick: 0,
    update(dt, sc) {
      this.t += dt;
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = 0.5;
        for (const e of enemiesInRadius(x, y, r, sc)) applyBlight(e, 1);
      }
      if (Math.random() < 0.4) sc.particles.spawn({ x: x + rand(-r, r) * 0.7, y: y + rand(-r, r) * 0.5, vy: -20, life: 0.8, size: 3, color: '#7cf08e', drag: 1 });
      return this.t < dur;
    },
    draw(ctx) {
      const a = Math.min(1, (dur - this.t) / 0.6) * Math.min(1, this.t / 0.2);
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      for (const pf of puffs) {
        const ang = pf.a + this.t * pf.sp;
        const px = x + Math.cos(ang) * pf.d, py = y + Math.sin(ang) * pf.d * 0.6;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 0.55 * pf.s);
        g.addColorStop(0, 'rgba(124,240,142,0.55)'); g.addColorStop(1, 'rgba(60,140,70,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, r * 0.55 * pf.s, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
  };
}

// ---------------------------------------------------------------------------
// Sunforge upgrades (weapon reforging)
// ---------------------------------------------------------------------------
const FORGE = [
  { id: 'blade_sear', weapon: 'blade', name: 'Searing Edge', desc: 'Your Attack deals <b>+30%</b> damage.', stats(s) { s.attackDmg *= 1.3; } },
  { id: 'blade_wide', weapon: 'blade', name: 'Wide Arc', desc: 'Your Attack sweeps a <b>35%</b> wider arc with <b>15%</b> more reach.' },
  { id: 'blade_flurry', weapon: 'blade', name: 'Flurry', desc: 'Your Attack is <b>25%</b> faster.' },
  { id: 'blade_twin', weapon: 'blade', name: 'Triple Crescent', desc: 'Your Special looses <b>three</b> crescents in a fan.' },
  { id: 'blade_riposte', weapon: 'blade', name: 'Riposte', desc: 'Your Dash-Strike deals <b>+120%</b> damage.' },
  { id: 'blade_reaver', weapon: 'blade', name: "Reaver's Finish", desc: 'The final blow of your combo also launches a crescent.' },
  { id: 'bow_trigger', weapon: 'bow', name: 'Hair Trigger', desc: 'Your Attack draws <b>40%</b> faster.' },
  { id: 'bow_pierce', weapon: 'bow', name: 'Sunpiercer', desc: 'Your arrows pierce <b>all</b> foes.' },
  { id: 'bow_volley', weapon: 'bow', name: 'Sunburst', desc: 'Your Special looses <b>9</b> arrows in a wide fan.' },
  { id: 'bow_sunfire', weapon: 'bow', name: 'Sunfire Tip', desc: 'Perfect Shots explode for <b>40</b> damage on impact.' },
  { id: 'bow_ricochet', weapon: 'bow', name: 'Ricochet', desc: 'Your arrows rebound off walls <b>twice</b>.' },
  { id: 'bow_heavy', weapon: 'bow', name: 'Heartwood Draw', desc: 'Your Attack deals <b>+30%</b> damage.', stats(s) { s.attackDmg *= 1.3; } },
  { id: 'wheel_twin', weapon: 'wheel', name: 'Twin Wheels', desc: 'Carry a <b>second</b> Sunwheel.' },
  { id: 'wheel_far', weapon: 'wheel', name: 'Wide Orbit', desc: 'Your wheel flies <b>40%</b> farther and grows larger.' },
  { id: 'wheel_overheat', weapon: 'wheel', name: 'Overheat', desc: 'Detonations are <b>40%</b> larger and deal <b>+50%</b> damage.' },
  { id: 'wheel_boomerang', weapon: 'wheel', name: 'Homecoming', desc: 'Your returning wheel deals <b>double</b> damage.' },
  { id: 'wheel_quick', weapon: 'wheel', name: 'Quicksilver', desc: 'Your wheel flies <b>35%</b> faster.' },
  { id: 'wheel_keen', weapon: 'wheel', name: 'Keen Rim', desc: 'Your Attack deals <b>+30%</b> damage.', stats(s) { s.attackDmg *= 1.3; } },
  { id: 'gen_flare', weapon: null, name: 'Deep Kindling', desc: 'Gain <b>+1</b> Cast charge.', stats(s) { s.castCharges += 1; } },
  { id: 'gen_quickcast', weapon: null, name: 'Bright Embers', desc: 'Cast charges return <b>40%</b> faster.', stats(s) { s.castRegen *= 0.6; } },
  { id: 'gen_special', weapon: null, name: 'Tempered Core', desc: 'Your Special deals <b>+35%</b> damage.', stats(s) { s.specialDmg *= 1.35; } },
  { id: 'gen_cast', weapon: null, name: 'White Flame', desc: 'Your Cast deals <b>+50%</b> damage.', stats(s) { s.castDmg *= 1.5; } },
];
const FORGE_BY_ID = {};
for (const f of FORGE) FORGE_BY_ID[f.id] = f;

function offerForge(build, weaponId) {
  const own = FORGE.filter((f) => f.weapon === weaponId && !build.hasForge(f.id));
  const gen = FORGE.filter((f) => f.weapon === null && !build.hasForge(f.id));
  shuffle(own); shuffle(gen);
  const out = own.slice(0, 2);
  if (gen.length) out.push(gen[0]);
  while (out.length < 3 && own.length > out.length) out.push(own[out.length]);
  return out.slice(0, 3);
}
