'use strict';
// ---------------------------------------------------------------------------
// Procedural icons: constellation glyphs for the five patrons, reward icons,
// slot icons. Usable on the game canvas and (via data URLs) in the DOM.
// ---------------------------------------------------------------------------

const GLYPHS = {
  stag: {
    stars: [[0, 0.82], [-0.3, 0.22], [0.3, 0.22], [-0.16, -0.14], [0.16, -0.14], [-0.5, -0.48], [0.5, -0.48], [-0.32, -0.9], [0.32, -0.9], [-0.9, -0.58], [0.9, -0.58]],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [3, 5], [5, 7], [5, 9], [4, 6], [6, 8], [6, 10]],
    bright: [0, 7, 8],
  },
  hound: {
    stars: [[0.82, -0.22], [0.5, -0.45], [0.42, -0.82], [0.22, -0.08], [-0.35, -0.16], [-0.82, -0.58], [-0.45, 0.3], [-0.76, 0.76], [0.25, 0.36], [0.52, 0.76]],
    lines: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [4, 6], [6, 7], [3, 8], [8, 9]],
    bright: [1, 5, 9],
  },
  owl: {
    stars: [[-0.32, -0.32], [0.32, -0.32], [-0.52, -0.82], [0.52, -0.82], [0, -0.02], [-0.56, 0.32], [0.56, 0.32], [0, 0.82]],
    lines: [[2, 0], [0, 4], [4, 1], [1, 3], [0, 5], [5, 7], [7, 6], [6, 1]],
    bright: [0, 1, 7],
  },
  serpent: {
    stars: [[-0.78, 0.78], [-0.36, 0.56], [-0.58, 0.1], [-0.1, -0.08], [0.36, 0.12], [0.62, -0.3], [0.36, -0.7], [0.02, -0.86]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
    bright: [0, 6],
  },
  moth: {
    stars: [[0, -0.42], [0, 0.56], [-0.88, -0.62], [-0.6, 0.05], [-0.44, 0.66], [0.88, -0.62], [0.6, 0.05], [0.44, 0.66], [-0.3, -0.9], [0.3, -0.9]],
    lines: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 1], [0, 5], [5, 6], [6, 7], [7, 1], [0, 8], [0, 9]],
    bright: [0, 2, 5],
  },
};

const REWARD_COLORS = {
  gold: '#ffcc55', vitality: '#ff5d73', ash: '#e6dccf', forge: '#ff9d4a', fragment: '#fff0a6',
  shop: '#ffd27a', fountain: '#6fd6ff', boss: '#ff5050', respite: '#9ee6b0', exit: '#ffb36b', hearth: '#ff9a4a',
};

function drawGlyph(ctx, patronId, x, y, size, alpha = 1, t = 0, color) {
  const g = GLYPHS[patronId];
  if (!g) return;
  const col = color || (PATRON_COLORS[patronId] || '#ffffff');
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha;
  ctx.lineCap = 'round';
  // glow lines
  ctx.strokeStyle = rgba(col, 0.28);
  ctx.lineWidth = size * 0.11;
  ctx.beginPath();
  for (const [a, b] of g.lines) {
    ctx.moveTo(g.stars[a][0] * size, g.stars[a][1] * size);
    ctx.lineTo(g.stars[b][0] * size, g.stars[b][1] * size);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(col, 0.85);
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.stroke();
  // stars
  for (let i = 0; i < g.stars.length; i++) {
    const s = g.stars[i];
    const bright = g.bright.includes(i);
    const tw = 0.8 + 0.2 * Math.sin(t * 3 + i * 1.7);
    const r = size * (bright ? 0.1 : 0.065) * tw;
    ctx.fillStyle = rgba(col, 0.35);
    ctx.beginPath(); ctx.arc(s[0] * size, s[1] * size, r * 2.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s[0] * size, s[1] * size, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawOrb(ctx, x, y, r, color, t = 0) {
  const pulse = 1 + 0.05 * Math.sin(t * 4);
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 1.5 * pulse);
  g.addColorStop(0, rgba(color, 0.55));
  g.addColorStop(0.55, rgba(color, 0.22));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 1.5 * pulse, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(12,8,18,0.78)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(color, 0.95);
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.35);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, t * 0.8, t * 0.8 + Math.PI * 1.2); ctx.stroke();
}

function drawRewardSymbol(ctx, kind, x, y, s, t = 0, patron) {
  ctx.save();
  ctx.translate(x, y);
  const col = kind === 'blessing' ? (PATRON_COLORS[patron] || '#fff') : (REWARD_COLORS[kind] || '#fff');
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'blessing':
      ctx.restore();
      drawGlyph(ctx, patron, x, y, s * 0.78, 1, t);
      return;
    case 'gold': {
      for (let i = 2; i >= 0; i--) {
        const yy = s * 0.35 - i * s * 0.28;
        ctx.fillStyle = mixHex(col, '#7a4a10', 0.45);
        ctx.beginPath(); ctx.ellipse(0, yy + s * 0.08, s * 0.55, s * 0.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, yy, s * 0.55, s * 0.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(-s * 0.15, yy - s * 0.04, s * 0.18, s * 0.06, 0, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'vitality': {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.62);
      ctx.bezierCurveTo(-s * 0.95, 0, -s * 0.45, -s * 0.72, 0, -s * 0.25);
      ctx.bezierCurveTo(s * 0.45, -s * 0.72, s * 0.95, 0, 0, s * 0.62);
      ctx.fill();
      ctx.fillStyle = '#ffe2a0';
      const fl = 0.85 + 0.15 * Math.sin(t * 9);
      ctx.beginPath();
      ctx.moveTo(-s * 0.16, s * 0.15);
      ctx.quadraticCurveTo(0, -s * 0.55 * fl, s * 0.16, s * 0.15);
      ctx.quadraticCurveTo(0, s * 0.32, -s * 0.16, s * 0.15);
      ctx.fill();
      break;
    }
    case 'ash': {
      const pts = [[-0.35, 0.3], [0.35, 0.3], [0, -0.1]];
      for (const [px, py] of pts) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(px * s, py * s - s * 0.38);
        ctx.lineTo(px * s + s * 0.22, py * s);
        ctx.lineTo(px * s, py * s + s * 0.3);
        ctx.lineTo(px * s - s * 0.22, py * s);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff9a5a';
        ctx.beginPath(); ctx.arc(px * s, py * s, s * 0.06, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'forge': {
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, -s * 0.28);
      ctx.lineTo(s * 0.55, -s * 0.28);
      ctx.quadraticCurveTo(s * 0.75, -s * 0.26, s * 0.78, -s * 0.05);
      ctx.lineTo(s * 0.25, -s * 0.02);
      ctx.lineTo(s * 0.2, s * 0.25);
      ctx.lineTo(s * 0.45, s * 0.5);
      ctx.lineTo(-s * 0.45, s * 0.5);
      ctx.lineTo(-s * 0.2, s * 0.25);
      ctx.lineTo(-s * 0.25, -s * 0.02);
      ctx.quadraticCurveTo(-s * 0.6, -s * 0.05, -s * 0.7, -s * 0.28);
      ctx.fill();
      ctx.fillStyle = '#fff3c0';
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.6;
        const l = s * (0.55 + 0.1 * Math.sin(t * 6 + i));
        ctx.beginPath(); ctx.arc(Math.cos(a) * l * 0.9, -s * 0.35 + Math.sin(a) * l * 0.5, s * 0.06, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'fragment': {
      const rot = t * 0.6;
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = i % 2 === 0 ? s * 0.75 : s * 0.22;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.14, 0, TAU); ctx.fill();
      break;
    }
    case 'shop': {
      ctx.lineWidth = s * 0.09;
      ctx.beginPath(); ctx.arc(0, -s * 0.5, s * 0.16, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = mixHex(col, '#5a3a10', 0.4);
      ctx.fillRect(-s * 0.36, -s * 0.38, s * 0.72, s * 0.1);
      ctx.fillRect(-s * 0.36, s * 0.42, s * 0.72, s * 0.1);
      ctx.fillStyle = rgba(col, 0.9);
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.28); ctx.lineTo(s * 0.3, -s * 0.28);
      ctx.lineTo(s * 0.38, s * 0.42); ctx.lineTo(-s * 0.38, s * 0.42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.12, s * 0.2 * (0.9 + 0.1 * Math.sin(t * 8)), 0, 0, TAU); ctx.fill();
      break;
    }
    case 'fountain': case 'respite': {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.bezierCurveTo(s * 0.2, -s * 0.35, s * 0.55, -s * 0.05, s * 0.5, s * 0.25);
      ctx.arc(0, s * 0.22, s * 0.5, 0.05, Math.PI - 0.05);
      ctx.bezierCurveTo(-s * 0.55, -s * 0.05, -s * 0.2, -s * 0.35, 0, -s * 0.7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.ellipse(-s * 0.18, s * 0.15, s * 0.09, s * 0.16, -0.4, 0, TAU); ctx.fill();
      if (kind === 'respite') {
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.45, s * 0.14, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'boss': {
      ctx.beginPath();
      ctx.moveTo(-s * 0.62, s * 0.4);
      ctx.lineTo(-s * 0.7, -s * 0.35);
      ctx.lineTo(-s * 0.32, s * 0.02);
      ctx.lineTo(0, -s * 0.58);
      ctx.lineTo(s * 0.32, s * 0.02);
      ctx.lineTo(s * 0.7, -s * 0.35);
      ctx.lineTo(s * 0.62, s * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a0a10';
      ctx.beginPath(); ctx.arc(0, s * 0.18, s * 0.11, 0, TAU); ctx.fill();
      break;
    }
    case 'exit': case 'hearth': default: {
      ctx.lineWidth = s * 0.14;
      for (let i = 0; i < 2; i++) {
        const yy = s * 0.25 - i * s * 0.42 - ((t * 0.6) % 1) * s * 0.12;
        ctx.beginPath(); ctx.moveTo(-s * 0.45, yy + s * 0.25); ctx.lineTo(0, yy - s * 0.15); ctx.lineTo(s * 0.45, yy + s * 0.25); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawSlotIcon(ctx, slot, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  switch (slot) {
    case 'attack':
      ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.55); ctx.lineTo(s * 0.55, -s * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.55, s * 0.15); ctx.lineTo(-s * 0.15, s * 0.55); ctx.stroke();
      break;
    case 'special':
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU - Math.PI / 2;
        const r = i % 2 === 0 ? s * 0.7 : s * 0.25;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      break;
    case 'cast':
      ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.2, s * 0.32, 0, TAU); ctx.fill();
      ctx.lineWidth = Math.max(1.2, s * 0.1);
      ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.1); ctx.lineTo(-s * 0.6, s * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.02, s * 0.3); ctx.lineTo(-s * 0.3, s * 0.62); ctx.stroke();
      break;
    case 'dash':
      for (let i = 0; i < 2; i++) {
        const xx = -s * 0.35 + i * s * 0.45;
        ctx.beginPath(); ctx.moveTo(xx - s * 0.2, -s * 0.45); ctx.lineTo(xx + s * 0.2, 0); ctx.lineTo(xx - s * 0.2, s * 0.45); ctx.stroke();
      }
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6); ctx.lineTo(s * 0.45, 0); ctx.lineTo(0, s * 0.6); ctx.lineTo(-s * 0.45, 0); ctx.closePath();
      ctx.stroke();
  }
  ctx.restore();
}

const _iconCache = new Map();
// returns a data URL for DOM use
function iconURL(kind, opts = {}) {
  const size = opts.size || 64;
  const key = `${kind}|${opts.patron || ''}|${opts.slot || ''}|${size}|${opts.color || ''}|${opts.orb ? 1 : 0}`;
  let url = _iconCache.get(key);
  if (url) return url;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const h = size / 2;
  if (kind === 'glyph') {
    drawGlyph(ctx, opts.patron, h, h, size * 0.42, 1, 0.5, opts.color);
  } else if (kind === 'slot') {
    drawSlotIcon(ctx, opts.slot, h, h, size * 0.4, opts.color || '#fff');
  } else {
    if (opts.orb) {
      const col = kind === 'blessing' ? PATRON_COLORS[opts.patron] : (REWARD_COLORS[kind] || '#fff');
      drawOrb(ctx, h, h, size * 0.32, col, 0.3);
    }
    drawRewardSymbol(ctx, kind, h, h, size * (opts.orb ? 0.22 : 0.38), 0.3, opts.patron);
  }
  url = c.toDataURL();
  _iconCache.set(key, url);
  return url;
}

// patron colors are needed by icons before blessings.js loads its data
const PATRON_COLORS = {
  stag: '#8ff5d2',
  hound: '#ffe45c',
  owl: '#9fd8ff',
  serpent: '#7cf08e',
  moth: '#c99bff',
};
