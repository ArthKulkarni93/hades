'use strict';
// ---------------------------------------------------------------------------
// Tile maps: generation, collision, raycasts, flow-field pathing, and static
// pre-rendering of floors / walls for each realm.
// ---------------------------------------------------------------------------

const TILE = 48;
const WALL_H = 34;
const T_FLOOR = 0, T_WALL = 1, T_PIT = 2;

const THEMES = {
  hearth: {
    floor: '#3b2a24', floor2: '#47322a', grout: '#1f140f', wallTop: '#5c4033', wallFace: '#2f1d16', wallEdge: '#9a6a4a',
    void: '#0b0605', accent: '#ff9a4a', darkness: 0.34, decor: 'hearth', pit: '#050202', dust: '#ffb070',
  },
  cinder: {
    floor: '#3a2e2e', floor2: '#463735', grout: '#170f10', wallTop: '#574443', wallFace: '#271c1d', wallEdge: '#8a6a60',
    void: '#080405', accent: '#ff7a2e', darkness: 0.46, decor: 'cracks', pit: '#120403', dust: '#ff8a3c',
  },
  archive: {
    floor: '#23373f', floor2: '#2a434c', grout: '#0b161b', wallTop: '#35535e', wallFace: '#14252c', wallEdge: '#5f95a2',
    void: '#02070a', accent: '#4fe0d0', darkness: 0.52, decor: 'water', pit: '#010a10', dust: '#7ff0e6',
  },
  court: {
    floor: '#4c4757', floor2: '#575163', grout: '#25222c', wallTop: '#857e92', wallFace: '#3a3444', wallEdge: '#dccb8c',
    void: '#08070c', accent: '#ffd98a', darkness: 0.36, decor: 'gold', pit: '#06050a', dust: '#ffe9b0',
  },
};

class TileMap {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.t = new Uint8Array(w * h).fill(T_WALL);
    this.pw = w * TILE; this.ph = h * TILE;
    this.flow = new Int16Array(w * h).fill(-1);
    this._q = new Int32Array(w * h);
    this.flowTile = -1;
    this.lights = [];
    this.torches = [];
    this.decor = [];
    this.features = [];
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inside(x, y) ? this.t[y * this.w + x] : T_WALL; }
  set(x, y, v) { if (this.inside(x, y)) this.t[y * this.w + x] = v; }
  solid(x, y) { return this.get(x, y) === T_WALL; }
  blocked(x, y) { const v = this.get(x, y); return v === T_WALL || v === T_PIT; }
  solidAt(wx, wy) { return this.solid(Math.floor(wx / TILE), Math.floor(wy / TILE)); }
  blockedAt(wx, wy) { return this.blocked(Math.floor(wx / TILE), Math.floor(wy / TILE)); }
  floorAt(wx, wy) { return this.get(Math.floor(wx / TILE), Math.floor(wy / TILE)) === T_FLOOR; }

  // push a circle out of solid tiles; returns averaged normal or null
  collide(ent, r, blockPits = true) {
    let hit = false, nx = 0, ny = 0;
    for (let iter = 0; iter < 2; iter++) {
      const minTx = Math.floor((ent.x - r) / TILE), maxTx = Math.floor((ent.x + r) / TILE);
      const minTy = Math.floor((ent.y - r) / TILE), maxTy = Math.floor((ent.y + r) / TILE);
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          const v = this.get(tx, ty);
          if (!(v === T_WALL || (blockPits && v === T_PIT))) continue;
          const x0 = tx * TILE, y0 = ty * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
          const cx = clamp(ent.x, x0, x1), cy = clamp(ent.y, y0, y1);
          let dx = ent.x - cx, dy = ent.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2), push = r - d;
            dx /= d; dy /= d;
            ent.x += dx * push; ent.y += dy * push;
            nx += dx; ny += dy;
          } else {
            const l = ent.x - x0, rr = x1 - ent.x, u = ent.y - y0, dn = y1 - ent.y;
            const m = Math.min(l, rr, u, dn);
            if (m === l) { ent.x = x0 - r; nx -= 1; }
            else if (m === rr) { ent.x = x1 + r; nx += 1; }
            else if (m === u) { ent.y = y0 - r; ny -= 1; }
            else { ent.y = y1 + r; ny += 1; }
          }
          hit = true;
        }
      }
    }
    if (!hit) return null;
    const nl = Math.hypot(nx, ny) || 1;
    return { nx: nx / nl, ny: ny / nl };
  }

  // fraction [0..1] along segment before hitting a wall (pits optional)
  raycast(x0, y0, x1, y1, blockPits = false) {
    const dx = x1 - x0, dy = y1 - y0;
    let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
    const ex = Math.floor(x1 / TILE), ey = Math.floor(y1 / TILE);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const tDX = adx > 1e-9 ? TILE / adx : Infinity;
    const tDY = ady > 1e-9 ? TILE / ady : Infinity;
    let tMX = adx > 1e-9 ? (dx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / adx : Infinity;
    let tMY = ady > 1e-9 ? (dy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / ady : Infinity;
    let t = 0;
    for (let i = 0; i < 256; i++) {
      const v = this.get(tx, ty);
      if (v === T_WALL || (blockPits && v === T_PIT)) return t;
      if (tx === ex && ty === ey) return 1;
      if (tMX < tMY) { t = tMX; tMX += tDX; tx += stepX; }
      else { t = tMY; tMY += tDY; ty += stepY; }
      if (t > 1) return 1;
    }
    return 1;
  }
  los(x0, y0, x1, y1) { return this.raycast(x0, y0, x1, y1, false) >= 1; }
  walkLos(x0, y0, x1, y1, r = 0) {
    if (this.raycast(x0, y0, x1, y1, true) < 1) return false;
    if (r <= 0) return true;
    const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
    return this.raycast(x0 + ox, y0 + oy, x1 + ox, y1 + oy, true) >= 1 && this.raycast(x0 - ox, y0 - oy, x1 - ox, y1 - oy, true) >= 1;
  }

  computeFlow(wx, wy) {
    const sx = clamp(Math.floor(wx / TILE), 0, this.w - 1), sy = clamp(Math.floor(wy / TILE), 0, this.h - 1);
    const start = sy * this.w + sx;
    if (start === this.flowTile) return;
    this.flowTile = start;
    const f = this.flow, q = this._q, w = this.w, h = this.h;
    f.fill(-1);
    if (this.blocked(sx, sy)) return;
    let head = 0, tail = 0;
    f[start] = 0; q[tail++] = start;
    while (head < tail) {
      const i = q[head++];
      const x = i % w, y = (i / w) | 0;
      const d = f[i] + 1;
      if (x > 0) { const j = i - 1; if (f[j] < 0 && this.t[j] === T_FLOOR) { f[j] = d; q[tail++] = j; } }
      if (x < w - 1) { const j = i + 1; if (f[j] < 0 && this.t[j] === T_FLOOR) { f[j] = d; q[tail++] = j; } }
      if (y > 0) { const j = i - w; if (f[j] < 0 && this.t[j] === T_FLOOR) { f[j] = d; q[tail++] = j; } }
      if (y < h - 1) { const j = i + w; if (f[j] < 0 && this.t[j] === T_FLOOR) { f[j] = d; q[tail++] = j; } }
    }
  }

  // next waypoint toward the flow source from a world position
  flowStep(wx, wy) {
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (!this.inside(tx, ty)) return null;
    const cur = this.flow[ty * this.w + tx];
    let best = cur >= 0 ? cur : 32767, bx = -1, by = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (this.blocked(nx, ny)) continue;
        if (dx && dy && (this.blocked(tx + dx, ty) || this.blocked(tx, ty + dy))) continue;
        const v = this.flow[ny * this.w + nx];
        if (v >= 0 && v < best) { best = v; bx = nx; by = ny; }
      }
    }
    if (bx < 0) return null;
    return { x: (bx + 0.5) * TILE, y: (by + 0.5) * TILE };
  }

  // is there floor with clearance around (tile coords)?
  open(tx, ty, rad = 1) {
    for (let y = ty - rad; y <= ty + rad; y++) for (let x = tx - rad; x <= tx + rad; x++) if (this.get(x, y) !== T_FLOOR) return false;
    return true;
  }

  randomOpenPoint(opts = {}) {
    const { awayX, awayY, minDist = 0, maxDist = Infinity, clearance = 1, tries = 120 } = opts;
    for (let i = 0; i < tries; i++) {
      const tx = randInt(1, this.w - 2), ty = randInt(1, this.h - 2);
      if (!this.open(tx, ty, clearance)) continue;
      const x = (tx + 0.5) * TILE + rand(-8, 8), y = (ty + 0.5) * TILE + rand(-8, 8);
      if (awayX !== undefined) {
        const d = dist(x, y, awayX, awayY);
        if (d < minDist || d > maxDist) continue;
      }
      if (opts.avoid && opts.avoid.some((p) => dist(x, y, p.x, p.y) < (p.r || 80))) continue;
      return { x, y };
    }
    // fallback: any floor
    for (let i = 0; i < 400; i++) {
      const tx = randInt(1, this.w - 2), ty = randInt(1, this.h - 2);
      if (this.get(tx, ty) === T_FLOOR) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    }
    return { x: this.pw / 2, y: this.ph / 2 };
  }

  // nearest floor point to a world position (for dropping rewards safely)
  nearestFloor(wx, wy, clearance = 1) {
    const sx = Math.floor(wx / TILE), sy = Math.floor(wy / TILE);
    for (let r = 0; r < 12; r++) {
      for (let y = sy - r; y <= sy + r; y++) {
        for (let x = sx - r; x <= sx + r; x++) {
          if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r) continue;
          if (this.open(x, y, clearance)) return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
        }
      }
    }
    return { x: wx, y: wy };
  }
}

// ---------------------------------------------------------------------------
// Room generation
// ---------------------------------------------------------------------------
function generateRoomMap(opts) {
  const kind = opts.kind || 'combat';
  const exits = opts.exits || 1;
  let w, h;
  if (kind === 'boss') { w = 30; h = 21; }
  else if (kind === 'shop' || kind === 'fountain' || kind === 'respite') { w = 18; h = 13; }
  else if (kind === 'elite') { w = 26; h = 18; }
  else { w = 2 * randInt(10, 13); h = randInt(14, 18); }
  const map = new TileMap(w, h);
  const cx = w / 2;

  // --- interior shape
  const shape = kind === 'combat' || kind === 'elite' ? pick(['rect', 'octagon', 'cross', 'oval', 'rect', 'octagon', 'twin']) : kind === 'boss' ? 'octagon' : 'octagon';
  const cut = randInt(3, 5);
  const cw = Math.round(w * 0.22), ch = Math.round(h * 0.26);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let ok = true;
      const lx = x - 1, ly = y - 1, rx = w - 2 - x, ry = h - 2 - y;
      if (shape === 'octagon') {
        if (lx + ly < cut || rx + ly < cut || lx + ry < cut || rx + ry < cut) ok = false;
      } else if (shape === 'cross') {
        if ((lx < cw || rx < cw) && (ly < ch || ry < ch)) ok = false;
      } else if (shape === 'oval') {
        const ex = (x + 0.5 - cx) / (w / 2 - 1), ey = (y + 0.5 - h / 2) / (h / 2 - 1);
        if (ex * ex + ey * ey > 1.08) ok = false;
      }
      if (ok) map.set(x, y, T_FLOOR);
    }
  }
  if (shape === 'twin') {
    // pit band across the middle with bridges
    const my = Math.floor(h / 2);
    for (let x = 3; x < w - 3; x++) {
      if (Math.abs(x + 0.5 - cx) < 2 || x === 3 || x === w - 4) continue;
      map.set(x, my, T_PIT); map.set(x, my - 1, T_PIT);
    }
  }

  // --- door positions (top wall, 2 tiles wide)
  const doorCols = [];
  if (kind === 'boss' || exits === 1) doorCols.push(cx - 1);
  else if (exits === 2) { doorCols.push(Math.round(w * 0.28) - 1, w - Math.round(w * 0.28) - 1); }
  else { doorCols.push(Math.round(w * 0.2) - 1, cx - 1, w - Math.round(w * 0.2) - 1); }
  const entranceCol = cx - 1;

  const protectedPts = [];
  for (const c of doorCols) protectedPts.push({ x: c + 1, y: 1 });
  protectedPts.push({ x: entranceCol + 1, y: h - 2 });

  // --- obstacles (mirror symmetric)
  if (kind === 'combat' || kind === 'elite' || kind === 'boss') {
    const pattern = kind === 'boss' ? pick(['pillars4', 'none', 'pillars4']) : pick(['pillars', 'pillars', 'pits', 'columns', 'center', 'mixed', 'none']);
    const placeBlock = (x, y, bw, bh, type) => {
      for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) {
        if (protectedPts.some((p) => Math.abs(p.x - xx) <= 2 && Math.abs(p.y - yy) <= 2)) continue;
        if (map.get(xx, yy) === T_FLOOR) map.set(xx, yy, type);
        const mx = w - 1 - xx;
        if (map.get(mx, yy) === T_FLOOR) map.set(mx, yy, type);
      }
    };
    if (pattern === 'pillars' || pattern === 'mixed') {
      const n = randInt(2, 3);
      for (let i = 0; i < n; i++) {
        const bw = randInt(1, 2), bh = randInt(1, 2);
        placeBlock(randInt(3, Math.floor(cx) - 2), randInt(3, h - 5), bw, bh, T_WALL);
      }
    }
    if (pattern === 'pits' || pattern === 'mixed') {
      const n = randInt(1, 2);
      for (let i = 0; i < n; i++) placeBlock(randInt(3, Math.floor(cx) - 3), randInt(4, h - 6), randInt(2, 3), randInt(2, 3), T_PIT);
    }
    if (pattern === 'columns') {
      const sx = randInt(3, 4), sy = randInt(3, 4);
      for (let y = 3; y < h - 3; y += sy) for (let x = 3; x < cx - 1; x += sx) placeBlock(x, y, 1, 1, T_WALL);
    }
    if (pattern === 'center') {
      const type = chance(0.5) ? T_WALL : T_PIT;
      const bw = randInt(1, 2), bh = randInt(2, 3);
      placeBlock(Math.floor(cx) - bw, Math.floor(h / 2) - 1, bw, bh, type);
    }
    if (pattern === 'pillars4') {
      const px = Math.round(w * 0.27), py = Math.round(h * 0.3);
      placeBlock(px, py, 2, 2, T_WALL);
      placeBlock(px, h - py - 2, 2, 2, T_WALL);
    }
  }

  // --- carve door corridors
  const carveCol = (col, fromY, dir) => {
    for (let k = 0; k < h; k++) {
      const y = fromY + dir * k;
      if (y <= 0 || y >= h - 1) break;
      const a = map.get(col, y), b = map.get(col + 1, y);
      if (k > 1 && a === T_FLOOR && b === T_FLOOR && map.get(col, y + dir) === T_FLOOR && map.get(col + 1, y + dir) === T_FLOOR) break;
      map.set(col, y, T_FLOOR); map.set(col + 1, y, T_FLOOR);
    }
  };
  for (const c of doorCols) carveCol(c, 1, 1);
  carveCol(entranceCol, h - 2, -1);

  // --- keep only the region connected to the entrance
  const seen = new Uint8Array(w * h);
  const stack = [(h - 2) * w + entranceCol];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!map.inside(nx, ny)) continue;
      const j = ny * w + nx;
      if (seen[j] || map.t[j] !== T_FLOOR) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  for (let i = 0; i < w * h; i++) if (map.t[i] === T_FLOOR && !seen[i]) map.t[i] = T_WALL;
  // pits that are no longer next to reachable floor become wall
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (map.get(x, y) !== T_PIT) continue;
    let near = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.get(x + dx, y + dy) === T_FLOOR) near = true;
    if (!near) map.set(x, y, T_WALL);
  }

  const doors = doorCols.map((c) => ({ col: c, x: (c + 1) * TILE, y: TILE, row: 0 }));
  const entrance = { x: (entranceCol + 1) * TILE, y: (h - 2) * TILE + TILE * 0.5, col: entranceCol };
  decorateMap(map, opts.theme || 'cinder', doors, entrance);
  return { map, doors, entrance };
}

// The Hearth: hand-authored hub chamber
function generateHubMap() {
  const w = 24, h = 15;
  const map = new TileMap(w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const lx = x - 1, ly = y - 1, rx = w - 2 - x, ry = h - 2 - y;
    if (lx + ly < 2 || rx + ly < 2 || lx + ry < 2 || rx + ry < 2) continue;
    map.set(x, y, T_FLOOR);
  }
  // two pillars flanking the hearth rug
  map.set(6, 6, T_WALL); map.set(17, 6, T_WALL);
  map.set(6, 10, T_WALL); map.set(17, 10, T_WALL);
  const doors = [{ col: 11, x: 12 * TILE, y: TILE, row: 0 }];
  const entrance = { x: 12 * TILE, y: 11.5 * TILE, col: 11 };
  decorateMap(map, 'hearth', doors, entrance, { hub: true });
  return { map, doors, entrance };
}

function decorateMap(map, themeId, doors, entrance, opts = {}) {
  const th = THEMES[themeId];
  map.theme = themeId;
  // torches on the top-facing wall faces (wall tile with floor below)
  const candidates = [];
  for (let y = 0; y < map.h - 1; y++) {
    for (let x = 1; x < map.w - 1; x++) {
      if (map.get(x, y) === T_WALL && map.get(x, y + 1) === T_FLOOR) {
        if (doors.some((d) => y === 0 && x >= d.col - 1 && x <= d.col + 2)) continue;
        candidates.push({ x, y });
      }
    }
  }
  shuffle(candidates);
  const want = opts.hub ? 0 : Math.min(candidates.length, randInt(3, 6));
  const used = [];
  for (const c of candidates) {
    if (used.length >= want) break;
    if (used.some((u) => Math.abs(u.x - c.x) + Math.abs(u.y - c.y) < 4)) continue;
    used.push(c);
  }
  for (const c of used) {
    const tx = (c.x + 0.5) * TILE, ty = (c.y + 1) * TILE - WALL_H * 0.55;
    map.torches.push({ x: tx, y: ty, row: c.y, color: th.accent, seed: rand(100) });
    map.lights.push({ x: tx, y: ty + 20, r: 230, color: th.accent, flicker: true, seed: rand(100) });
  }
  if (opts.hub) {
    // big hearth fire is added by the hub props; soft fill light
    map.lights.push({ x: map.pw / 2, y: map.ph / 2, r: 520, color: '#ff9a4a', flicker: false, a: 0.5 });
  }
  // larger glowing features (vents, pools, candles) with their own light
  if (!opts.hub) {
    const nf = themeId === 'cinder' ? randInt(2, 4) : themeId === 'archive' ? randInt(2, 4) : randInt(2, 3);
    const placed = [];
    for (let i = 0, tries = 0; i < nf && tries < 80; tries++) {
      const tx = randInt(2, map.w - 3), ty = randInt(2, map.h - 3);
      if (!map.open(tx, ty, 1)) continue;
      const fx = (tx + 0.5) * TILE, fy = (ty + 0.5) * TILE;
      if (placed.some((p) => dist(p.x, p.y, fx, fy) < 260)) continue;
      if (dist(fx, fy, entrance.x, entrance.y) < 140) continue;
      placed.push({ x: fx, y: fy });
      const kind = themeId === 'cinder' ? 'vent' : themeId === 'archive' ? 'pool' : 'sigil';
      map.features.push({ x: fx, y: fy, kind, r: rand(16, 26), seed: rand(100) });
      const col = kind === 'vent' ? '#ff6a1a' : kind === 'pool' ? '#3fe0d0' : '#ffd98a';
      map.lights.push({ x: fx, y: fy, r: kind === 'vent' ? 190 : 170, color: col, flicker: kind === 'vent', seed: rand(100), a: 0.85 });
      i++;
    }
  }
  // floor decor (static, drawn into the floor canvas)
  const decorCount = Math.floor(map.w * map.h * 0.03);
  for (let i = 0; i < decorCount; i++) {
    const tx = randInt(1, map.w - 2), ty = randInt(1, map.h - 2);
    if (map.get(tx, ty) !== T_FLOOR) continue;
    map.decor.push({ x: (tx + rand(0.1, 0.9)) * TILE, y: (ty + rand(0.1, 0.9)) * TILE, kind: th.decor, r: rand(), s: rand(0.6, 1.4) });
  }
}

// ---------------------------------------------------------------------------
// Static pre-rendering
// ---------------------------------------------------------------------------
function prerenderMap(map) {
  const th = THEMES[map.theme];
  const floor = makeCanvas(map.pw, map.ph);
  const g = floor.getContext('2d');
  const seed = randInt(1, 99999);
  g.fillStyle = th.void;
  g.fillRect(0, 0, map.pw, map.ph);

  // floor: grout base, then irregular flagstones
  g.fillStyle = th.grout;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.get(x, y) === T_FLOOR) g.fillRect(x * TILE, y * TILE, TILE, TILE);
  const assigned = new Uint8Array(map.w * map.h);
  const free = (x, y) => map.get(x, y) === T_FLOOR && !assigned[y * map.w + x];
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!free(x, y)) continue;
      const r = hash2(x, y, seed + 11);
      let bw = 1, bh = 1;
      const wide = free(x + 1, y), tall = free(x, y + 1);
      if (wide && tall && free(x + 1, y + 1) && r < 0.3) { bw = 2; bh = 2; }
      else if (wide && r < 0.58) bw = 2;
      else if (tall && r < 0.74) bh = 2;
      for (let yy = y; yy < y + bh; yy++) for (let xx = x; xx < x + bw; xx++) assigned[yy * map.w + xx] = 1;
      const px = x * TILE + 1.5, py = y * TILE + 1.5, pw = bw * TILE - 3, ph = bh * TILE - 3;
      const n = hash2(x, y, seed);
      g.fillStyle = mixHex(th.floor, th.floor2, n);
      roundRect(g, px, py, pw, ph, 5); g.fill();
      const gr = g.createLinearGradient(px, py, px + pw * 0.6, py + ph);
      gr.addColorStop(0, 'rgba(255,255,255,0.06)');
      gr.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = gr;
      roundRect(g, px, py, pw, ph, 5); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(px + 4, py + 2, pw - 8, 1.5);
      // speckles
      const sp = 4 + Math.floor(n * 8) * bw * bh;
      for (let k = 0; k < sp; k++) {
        const sx = px + hash2(x * 7 + k, y * 3, seed + 5) * pw, sy = py + hash2(x * 5, y * 11 + k, seed + 9) * ph;
        g.fillStyle = k % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.05)';
        g.fillRect(sx, sy, 2, 2);
      }
      if (n > 0.8) {
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2;
        g.beginPath();
        let cx = px + pw * (0.2 + 0.6 * hash2(x, y, seed + 21)), cy = py + 2;
        g.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx += (hash2(x + k, y, seed + 31) - 0.5) * 18; cy += ph / 4; g.lineTo(cx, cy); }
        g.stroke();
      }
    }
  }
  // soft spotlight toward the room centre
  {
    const cx = map.pw / 2, cy = map.ph / 2, R = Math.max(map.pw, map.ph) * 0.62;
    const vg = g.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
    vg.addColorStop(0, 'rgba(255,230,200,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vg;
    g.fillRect(0, 0, map.pw, map.ph);
  }

  // theme-specific floor art
  if (th.decor === 'gold') {
    // great inlaid circle
    const cx = map.pw / 2, cy = map.ph / 2;
    g.strokeStyle = rgba(th.wallEdge, 0.32);
    g.lineWidth = 3;
    for (const r of [Math.min(map.pw, map.ph) * 0.32, Math.min(map.pw, map.ph) * 0.22]) {
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    }
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * Math.min(map.pw, map.ph) * 0.22, cy + Math.sin(a) * Math.min(map.pw, map.ph) * 0.22);
      g.lineTo(cx + Math.cos(a) * Math.min(map.pw, map.ph) * 0.32, cy + Math.sin(a) * Math.min(map.pw, map.ph) * 0.32);
      g.stroke();
    }
  }
  if (th.decor === 'hearth') {
    // woven rug in the middle
    const rx = 8 * TILE, ry = 5.5 * TILE, rw = 8 * TILE, rh = 6 * TILE;
    g.fillStyle = '#5a2a22';
    g.fillRect(rx, ry, rw, rh);
    g.strokeStyle = '#b8743a'; g.lineWidth = 4;
    g.strokeRect(rx + 8, ry + 8, rw - 16, rh - 16);
    g.strokeStyle = '#7a3a2a'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(rx + rw / 2, ry + 26 + i * 22);
      g.lineTo(rx + rw / 2 + 60 - i * 6, ry + rh / 2);
      g.lineTo(rx + rw / 2, ry + rh - 26 - i * 22);
      g.lineTo(rx + rw / 2 - 60 + i * 6, ry + rh / 2);
      g.closePath(); g.stroke();
    }
  }
  for (const f of map.features) drawFeature(g, f, th);
  for (const d of map.decor) {
    g.save();
    g.translate(d.x, d.y);
    if (d.kind === 'cracks') {
      g.strokeStyle = rgba('#0a0606', 0.8); g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0);
      let ax = 0, ay = 0;
      for (let k = 0; k < 4; k++) { ax += rand(-14, 14) * d.s; ay += rand(-14, 14) * d.s; g.lineTo(ax, ay); }
      g.stroke();
      g.strokeStyle = rgba(th.accent, 0.22); g.lineWidth = 1;
      g.stroke();
      if (d.r > 0.6) { g.fillStyle = rgba('#5a4848', 0.6); g.beginPath(); g.arc(rand(-10, 10), rand(-10, 10), 3 * d.s, 0, TAU); g.fill(); }
    } else if (d.kind === 'water') {
      if (d.r > 0.5) {
        g.fillStyle = rgba('#3fb5c0', 0.12);
        g.beginPath(); g.ellipse(0, 0, 26 * d.s, 14 * d.s, d.r * 3, 0, TAU); g.fill();
        g.strokeStyle = rgba('#8ff5ff', 0.12); g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(-4, -2, 14 * d.s, 6 * d.s, d.r * 3, 0, Math.PI); g.stroke();
      } else {
        g.rotate(d.r * 6);
        g.fillStyle = rgba('#d8ccb0', 0.25);
        g.fillRect(-7 * d.s, -5 * d.s, 14 * d.s, 10 * d.s);
        g.strokeStyle = rgba('#5a5040', 0.3); g.lineWidth = 1;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-5 * d.s, -2 * d.s + k * 3 * d.s); g.lineTo(5 * d.s, -2 * d.s + k * 3 * d.s); g.stroke(); }
      }
    } else if (d.kind === 'gold') {
      g.strokeStyle = rgba('#e8e2f0', 0.08); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-18, -8); g.quadraticCurveTo(0, rand(-10, 10), 20, 6); g.stroke();
      if (d.r > 0.7) { g.fillStyle = rgba(th.wallEdge, 0.3); g.beginPath(); g.arc(0, 0, 2.5, 0, TAU); g.fill(); }
    } else if (d.kind === 'hearth') {
      if (d.r > 0.5) { g.fillStyle = rgba('#000000', 0.15); g.beginPath(); g.ellipse(0, 0, 10 * d.s, 5 * d.s, 0, 0, TAU); g.fill(); }
    }
    g.restore();
  }

  // pits
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) !== T_PIT) continue;
      const px = x * TILE, py = y * TILE;
      g.fillStyle = th.pit;
      g.fillRect(px, py, TILE, TILE);
      if (map.get(x, y - 1) !== T_PIT) {
        const gr = g.createLinearGradient(0, py, 0, py + TILE * 0.7);
        gr.addColorStop(0, mixHex(th.wallFace, '#000000', 0.2));
        gr.addColorStop(1, rgba(th.pit, 0));
        g.fillStyle = gr;
        g.fillRect(px, py, TILE, TILE * 0.7);
      }
      if (th.decor === 'cracks') {
        g.fillStyle = rgba('#ff5a1a', 0.05 + hash2(x, y, 7) * 0.08);
        g.fillRect(px, py + TILE * 0.5, TILE, TILE * 0.5);
      }
    }
  }

  // ambient occlusion near walls
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) === T_WALL) continue;
      const px = x * TILE, py = y * TILE;
      if (map.get(x, y - 1) === T_WALL) {
        const gr = g.createLinearGradient(0, py, 0, py + 22);
        gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px, py, TILE, 22);
      }
      if (map.get(x - 1, y) === T_WALL) {
        const gr = g.createLinearGradient(px, 0, px + 16, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px, py, 16, TILE);
      }
      if (map.get(x + 1, y) === T_WALL) {
        const gr = g.createLinearGradient(px + TILE, 0, px + TILE - 16, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px + TILE - 16, py, 16, TILE);
      }
    }
  }

  // wall row strips (y-sorted with actors)
  const rows = [];
  for (let y = 0; y < map.h; y++) {
    let any = false;
    for (let x = 0; x < map.w; x++) if (map.get(x, y) === T_WALL) { any = true; break; }
    if (!any) continue;
    const isBottom = y === map.h - 1;
    const hgt = isBottom ? 12 : WALL_H;
    const c = makeCanvas(map.pw, TILE + WALL_H);
    const wg = c.getContext('2d');
    const top = WALL_H - hgt; // y offset inside strip where top face begins
    for (let x = 0; x < map.w; x++) {
      if (map.get(x, y) !== T_WALL) continue;
      const px = x * TILE;
      const n = hash2(x, y, seed + 3);
      // top face
      wg.fillStyle = mixHex(th.wallTop, '#000000', n * 0.18);
      wg.fillRect(px, top, TILE, TILE);
      wg.fillStyle = rgba('#ffffff', 0.045);
      wg.fillRect(px + 3, top + 3, TILE - 6, TILE - 6);
      wg.strokeStyle = 'rgba(0,0,0,0.22)'; wg.lineWidth = 1;
      wg.beginPath();
      const off2 = (y % 2) * TILE * 0.5;
      wg.moveTo(px, top + TILE * 0.5); wg.lineTo(px + TILE, top + TILE * 0.5);
      wg.moveTo(px + ((TILE * 0.5 + off2) % TILE), top); wg.lineTo(px + ((TILE * 0.5 + off2) % TILE), top + TILE * 0.5);
      wg.moveTo(px + ((off2 + 1) % TILE), top + TILE * 0.5); wg.lineTo(px + ((off2 + 1) % TILE), top + TILE);
      wg.stroke();
      if (n > 0.7) { wg.fillStyle = 'rgba(0,0,0,0.12)'; wg.fillRect(px + 6, top + 6 + n * 20, 12, 8); }
      // rim highlight where top face meets open space
      wg.fillStyle = rgba(th.wallEdge, 0.55);
      if (map.get(x, y + 1) !== T_WALL) wg.fillRect(px, top + TILE - 3, TILE, 3);
      if (map.get(x, y - 1) !== T_WALL && y > 0) wg.fillRect(px, top, TILE, 2);
      if (map.get(x - 1, y) !== T_WALL) wg.fillRect(px, top, 2, TILE);
      if (map.get(x + 1, y) !== T_WALL) wg.fillRect(px + TILE - 2, top, 2, TILE);
      // front face
      if (map.get(x, y + 1) !== T_WALL) {
        const fy = top + TILE;
        const gr = wg.createLinearGradient(0, fy, 0, fy + hgt);
        gr.addColorStop(0, th.wallFace);
        gr.addColorStop(1, mixHex(th.wallFace, '#000000', 0.45));
        wg.fillStyle = gr;
        wg.fillRect(px, fy, TILE, hgt);
        if (hgt > 20) {
          wg.strokeStyle = rgba('#000000', 0.35); wg.lineWidth = 1;
          wg.beginPath();
          wg.moveTo(px, fy + hgt * 0.5); wg.lineTo(px + TILE, fy + hgt * 0.5);
          const off = (x % 2) * TILE * 0.5;
          wg.moveTo(px + off + TILE * 0.25, fy); wg.lineTo(px + off + TILE * 0.25, fy + hgt * 0.5);
          wg.moveTo(px + TILE * 0.5 + off * 0.5, fy + hgt * 0.5); wg.lineTo(px + TILE * 0.5 + off * 0.5, fy + hgt);
          wg.stroke();
        }
        wg.fillStyle = 'rgba(0,0,0,0.5)';
        wg.fillRect(px, fy + hgt - 2, TILE, 2);
      }
    }
    rows.push({ row: y, canvas: c, key: (y + 1) * TILE, y0: y * TILE - WALL_H });
  }
  return { floor, rows };
}

function drawFeature(g, f, th) {
  g.save();
  g.translate(f.x, f.y);
  if (f.kind === 'vent') {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(0, 0, f.r * 1.5, f.r * 0.9, 0, 0, TAU); g.fill();
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r);
    gr.addColorStop(0, '#fff0b0'); gr.addColorStop(0.35, '#ff9a3a'); gr.addColorStop(1, '#5a1a08');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(0, 0, f.r, f.r * 0.6, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,140,60,0.5)'; g.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + f.seed;
      g.beginPath(); g.moveTo(Math.cos(a) * f.r, Math.sin(a) * f.r * 0.6);
      g.lineTo(Math.cos(a) * f.r * 2.2, Math.sin(a) * f.r * 1.3 + (k % 2 ? 6 : -6)); g.stroke();
    }
  } else if (f.kind === 'pool') {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r * 1.6);
    gr.addColorStop(0, 'rgba(120,255,240,0.55)'); gr.addColorStop(0.6, 'rgba(40,150,160,0.35)'); gr.addColorStop(1, 'rgba(20,60,70,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(0, 0, f.r * 1.7, f.r, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(180,255,250,0.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(0, 0, f.r * 1.2, f.r * 0.65, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(0, 0, f.r * 0.6, f.r * 0.3, 0, 0, TAU); g.stroke();
  } else {
    g.strokeStyle = 'rgba(255,217,138,0.55)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, f.r * 1.4, 0, TAU); g.stroke();
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + f.seed; g.lineTo(Math.cos(a) * f.r * 1.3, Math.sin(a) * f.r * 1.3); }
    g.closePath(); g.stroke();
    g.fillStyle = '#fff4d0';
    g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill();
  }
  g.restore();
}
