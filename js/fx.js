'use strict';
// ---------------------------------------------------------------------------
// Visual effects: particles, glow sprites, floating text, and short-lived
// "effects" (telegraphs, slashes, rings, beams, lightning ...).
// An effect is any object with update(dt, scene) -> bool(alive) and
// draw(ctx, scene). Effects with layer 'floor' draw under actors.
// ---------------------------------------------------------------------------

// ---- glow sprite cache ----------------------------------------------------
const GlowSprites = {
  cache: new Map(),
  get(color, size = 128) {
    const key = color + size;
    let c = this.cache.get(key);
    if (c) return c;
    c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const h = size / 2;
    const grad = g.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.25, rgba(color, 0.55));
    grad.addColorStop(0.6, rgba(color, 0.14));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.cache.set(key, c);
    return c;
  },
};

function drawGlow(ctx, x, y, radius, color, alpha = 1) {
  if (alpha <= 0.01 || radius <= 0.5) return;
  const spr = GlowSprites.get(color);
  const prevA = ctx.globalAlpha;
  ctx.globalAlpha = prevA * alpha;
  ctx.drawImage(spr, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = prevA;
}

// ---- particles --------------------------------------------------------------
class ParticleSystem {
  constructor(max = 1400) {
    this.max = max;
    this.list = [];
    this.pool = [];
  }
  clear() { this.pool.push(...this.list); this.list.length = 0; }
  spawn(o) {
    if (this.list.length >= this.max) return null;
    const p = this.pool.pop() || {};
    p.x = o.x; p.y = o.y;
    p.z = o.z || 0;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = p.maxLife = o.life || 0.5;
    p.size = o.size || 3;
    p.size2 = o.size2 !== undefined ? o.size2 : 0;
    p.color = o.color || '#ffffff';
    p.drag = o.drag !== undefined ? o.drag : 3;
    p.grav = o.grav || 0;
    p.type = o.type || 'dot';
    p.add = o.add !== undefined ? o.add : true;
    p.rot = o.rot || 0;
    p.vr = o.vr || 0;
    p.alpha = o.alpha !== undefined ? o.alpha : 1;
    this.list.push(p);
    return p;
  }
  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = o.angle !== undefined ? o.angle + rand(-(o.spread || Math.PI), o.spread || Math.PI) : rand(TAU);
      const sp = rand(o.speedMin || 40, o.speed || 200);
      this.spawn({
        x: x + rand(-(o.jitter || 0), o.jitter || 0), y: y + rand(-(o.jitter || 0), o.jitter || 0), z: o.z,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: o.vz !== undefined ? rand(o.vz * 0.5, o.vz) : 0,
        life: rand((o.life || 0.5) * 0.6, o.life || 0.5), size: rand((o.size || 3) * 0.6, o.size || 3), size2: o.size2,
        color: Array.isArray(o.color) ? pick(o.color) : o.color, drag: o.drag, grav: o.grav, type: o.type, add: o.add,
        rot: rand(TAU), vr: rand(-8, 8), alpha: o.alpha,
      });
    }
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1]; L.pop(); this.pool.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vz -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.grav && p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; }
      p.rot += p.vr * dt;
    }
  }
  draw(ctx) {
    const L = this.list;
    // normal-blend particles first, then additive
    for (let pass = 0; pass < 2; pass++) {
      const additive = pass === 1;
      if (additive) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        if (p.add !== additive) continue;
        const t = p.life / p.maxLife;
        const s = p.size2 ? lerp(p.size2, p.size, t) : p.size * (0.4 + 0.6 * t);
        const a = p.alpha * (p.type === 'smoke' ? Math.min(1, t * 1.5) * 0.5 : Math.min(1, t * 2));
        const y = p.y - p.z;
        if (p.type === 'glow') {
          drawGlow(ctx, p.x, y, s * 3, p.color, a);
          continue;
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.type === 'spark') {
          const sp = Math.hypot(p.vx, p.vy) * 0.03 + 1;
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillRect(-s * sp, -s * 0.35, s * sp * 2, s * 0.7);
          ctx.restore();
        } else if (p.type === 'shard') {
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (p.type === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, y, lerp(p.size * 3, p.size, t), 0, TAU); ctx.stroke();
        } else if (p.type === 'square') {
          ctx.fillRect(p.x - s / 2, y - s / 2, s, s);
        } else {
          ctx.beginPath(); ctx.arc(p.x, y, s, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---- floating combat text ---------------------------------------------------
class FloatText {
  constructor(x, y, text, color, size = 16, opts = {}) {
    this.x = x + rand(-6, 6); this.y = y;
    this.vy = opts.vy !== undefined ? opts.vy : -70;
    this.vx = opts.vx !== undefined ? opts.vx : rand(-20, 20);
    this.text = text; this.color = color; this.size = size;
    this.life = this.maxLife = opts.life || 0.8;
    this.pop = opts.pop !== undefined ? opts.pop : 1.6;
    this.outline = opts.outline || 'rgba(10,5,15,0.85)';
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy *= Math.exp(-3 * dt);
    return this.life > 0;
  }
  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const sc = t < 0.12 ? lerp(this.pop, 1, t / 0.12) : 1;
    ctx.globalAlpha = Math.min(1, this.life / (this.maxLife * 0.4));
    ctx.font = `700 ${Math.round(this.size * sc)}px "Cinzel", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = this.outline;
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

// ---- effect implementations ---------------------------------------------
const FX = {
  // Telegraph circle (danger zone). Purely visual unless owner action dies.
  telegraphCircle(x, y, r, dur, color = '#ff3b3b', owner = null) {
    const token = owner ? owner.actionId : 0;
    return {
      layer: 'floor', t: 0, x, y, r, dur, color, owner,
      update(dt) {
        this.t += dt;
        if (this.owner && (this.owner.dead || this.owner.actionId !== token)) return false;
        return this.t < this.dur;
      },
      draw(ctx) {
        const k = clamp(this.t / this.dur, 0, 1);
        ctx.fillStyle = rgba(this.color, 0.1 + 0.12 * k);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(this.color, 0.28);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(this.color, 0.75);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.stroke();
      },
    };
  },

  telegraphLine(x, y, angle, length, width, dur, color = '#ff3b3b', owner = null, follow = null) {
    const token = owner ? owner.actionId : 0;
    return {
      layer: 'floor', t: 0, x, y, angle, length, width, dur, color, owner,
      update(dt) {
        this.t += dt;
        if (this.owner && (this.owner.dead || this.owner.actionId !== token)) return false;
        if (follow) follow(this, dt);
        return this.t < this.dur;
      },
      draw(ctx) {
        const k = clamp(this.t / this.dur, 0, 1);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = rgba(this.color, 0.08 + 0.1 * k);
        ctx.fillRect(0, -this.width / 2, this.length, this.width);
        ctx.fillStyle = rgba(this.color, 0.3);
        ctx.fillRect(0, -this.width / 2, this.length * k, this.width);
        ctx.strokeStyle = rgba(this.color, 0.7);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -this.width / 2, this.length, this.width);
        ctx.restore();
      },
    };
  },

  telegraphCone(x, y, angle, arc, r, dur, color = '#ff3b3b', owner = null) {
    const token = owner ? owner.actionId : 0;
    return {
      layer: 'floor', t: 0, dur, owner,
      update(dt) {
        this.t += dt;
        if (this.owner && (this.owner.dead || this.owner.actionId !== token)) return false;
        return this.t < this.dur;
      },
      draw(ctx) {
        const k = clamp(this.t / this.dur, 0, 1);
        ctx.fillStyle = rgba(color, 0.1 + 0.1 * k);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, angle - arc / 2, angle + arc / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba(color, 0.28);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * k, angle - arc / 2, angle + arc / 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba(color, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, angle - arc / 2, angle + arc / 2); ctx.closePath(); ctx.stroke();
      },
    };
  },

  // melee swoosh visual
  slash(x, y, angle, arc, r, color, dur = 0.16, width = 0.5, follow = null) {
    return {
      layer: 'top', t: 0, x, y,
      update(dt) { this.t += dt; if (follow) { this.x = follow.x; this.y = follow.y - 10; } return this.t < dur; },
      draw(ctx) {
        const k = this.t / dur;
        const a0 = angle - arc / 2, a1 = angle + arc / 2;
        const sweep = ease.outCubic(Math.min(1, k * 1.8));
        const head = lerp(a0, a1, sweep);
        const tail = lerp(a0, a1, Math.max(0, sweep - 0.85 + k * 0.6));
        const alpha = 1 - k;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        const inner = r * (1 - width);
        ctx.fillStyle = rgba(color, 0.55);
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, tail, head);
        ctx.arc(this.x, this.y, inner, head, tail, true);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgba('#ffffff', 0.85);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(this.x, this.y, r * 0.97, tail, head); ctx.stroke();
        ctx.restore();
      },
    };
  },

  // thrust visual (spear-like streak)
  thrust(x, y, angle, length, width, color, dur = 0.14) {
    return {
      layer: 'top', t: 0,
      update(dt) { this.t += dt; return this.t < dur; },
      draw(ctx) {
        const k = this.t / dur;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(angle);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        const L = length * ease.outCubic(Math.min(1, k * 2.5));
        const g = ctx.createLinearGradient(0, 0, L, 0);
        g.addColorStop(0, rgba(color, 0));
        g.addColorStop(0.7, rgba(color, 0.7));
        g.addColorStop(1, rgba('#ffffff', 0.9));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -width / 2); ctx.lineTo(L, 0); ctx.lineTo(0, width / 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      },
    };
  },

  ring(x, y, r0, r1, dur, color, width = 4) {
    return {
      layer: 'top', t: 0,
      update(dt) { this.t += dt; return this.t < dur; },
      draw(ctx) {
        const k = ease.outCubic(this.t / dur);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - this.t / dur;
        ctx.strokeStyle = color;
        ctx.lineWidth = width * (1 - k * 0.6);
        ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, k), 0, TAU); ctx.stroke();
        ctx.restore();
      },
    };
  },

  flash(x, y, r, color, dur = 0.2) {
    return {
      layer: 'top', t: 0,
      update(dt) { this.t += dt; return this.t < dur; },
      draw(ctx) {
        const k = this.t / dur;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, x, y, r * (0.6 + k * 0.6), color, 1 - k);
        ctx.restore();
      },
    };
  },

  // jagged lightning bolt between two points
  bolt(x1, y1, x2, y2, color = '#fff27a', dur = 0.22, width = 3) {
    const pts = [];
    const n = Math.max(3, Math.floor(dist(x1, y1, x2, y2) / 18));
    const nx = -(y2 - y1), ny = x2 - x1;
    const nl = Math.hypot(nx, ny) || 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = i === 0 || i === n ? 0 : rand(-14, 14);
      pts.push([lerp(x1, x2, t) + (nx / nl) * off, lerp(y1, y2, t) + (ny / nl) * off]);
    }
    return {
      layer: 'top', t: 0,
      update(dt) { this.t += dt; return this.t < dur; },
      draw(ctx) {
        const k = this.t / dur;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(color, 0.4);
        ctx.lineWidth = width * 3.5;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.restore();
      },
    };
  },

  // big vertical strike from the sky
  skyStrike(x, y, color = '#fff27a', dur = 0.35, radius = 60) {
    return {
      layer: 'top', t: 0,
      update(dt) { this.t += dt; return this.t < dur; },
      draw(ctx) {
        const k = this.t / dur;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        const w = 14 * (1 - k) + 2;
        const g = ctx.createLinearGradient(x, y - 400, x, y);
        g.addColorStop(0, rgba(color, 0));
        g.addColorStop(1, rgba('#ffffff', 1));
        ctx.fillStyle = g;
        ctx.fillRect(x - w / 2, y - 400, w, 400);
        drawGlow(ctx, x, y, radius * 1.6, color, 1 - k);
        ctx.restore();
      },
    };
  },

  // dash afterimage / ghost of a sprite: draw callback snapshots
  ghost(drawFn, dur = 0.25) {
    return {
      layer: 'floorTop', t: 0,
      update(dt) { this.t += dt; return this.t < dur; },
      draw(ctx) {
        ctx.save();
        ctx.globalAlpha = 0.45 * (1 - this.t / dur);
        drawFn(ctx);
        ctx.restore();
      },
    };
  },

  // floor scorch / decal that fades slowly
  decal(x, y, r, color, dur = 6) {
    const rot = rand(TAU);
    return {
      layer: 'decal', t: 0,
      update(dt) { this.t += dt; return this.t < dur; },
      draw(ctx) {
        const a = Math.min(1, (dur - this.t) / 1.5) * 0.5;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(rot);
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.7, 0, 0, TAU); ctx.fill();
        ctx.restore();
      },
    };
  },
};
