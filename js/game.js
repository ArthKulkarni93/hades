'use strict';
// ---------------------------------------------------------------------------
// Game: global state, the Hearth (hub), run flow, rooms, rewards, bosses,
// death/victory, camera and the main update/render.
// ---------------------------------------------------------------------------

const REALMS = [
  {
    id: 'cinder', name: 'The Cinder Pit', sub: 'Where the sun’s embers fell', theme: 'cinder', music: 'cinder', rooms: 6, boss: 'warden',
    pool: [['cinderling', 4], ['wisp', 3], ['fusebug', 2], ['brute', 1.6]],
  },
  {
    id: 'archive', name: 'The Drowned Archive', sub: 'Where memory sank', theme: 'archive', music: 'archive', rooms: 6, boss: 'angler',
    pool: [['jelly', 3], ['eel', 3], ['wraith', 2.5], ['shellguard', 2], ['cinderling', 0.6]],
  },
  {
    id: 'court', name: 'The Dawnless Court', sub: 'Where the night was crowned', theme: 'court', music: 'court', rooms: 6, boss: 'regent',
    pool: [['thrall', 3.5], ['lancer', 3], ['seraph', 3], ['sentinel', 2]],
  },
];

const G = {
  state: 'boot', prevState: null,
  scene: null, player: null, run: null,
  cam: { x: 0, y: 0, scale: 1 },
  viewW: 1, viewH: 1, dpr: 1,
  hitstop: 0, slowmo: 0, trauma: 0, hurtVignette: 0,
  god: false, debug: false, fps: 60,
  swallowInput: false, deathT: 0,
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount * 0.045 * (Save.data ? Save.data.settings.shake : 1)); },
  screenToWorld(sx, sy) {
    const c = this.cam;
    return { x: c.x + (sx * this.dpr - this.viewW / 2) / c.scale, y: c.y + (sy * this.dpr - this.viewH / 2) / c.scale };
  },
};

const TALLOW = '#ffcf8a';
const TALLOW_LINES = {
  intro: [
    'Ah. Awake, are you? Easy now, little spark. Easy.',
    'You fell down the chimney of the world, same as all the embers did, the night the Pale Regent put out the sun.',
    'They all went cold. Every last one. Except you.',
    'Up those stairs is the Ascent: the Cinder Pit, the Drowned Archive, then the Regent’s own Court. Climb it, and maybe the sky remembers how to burn.',
    'And if you gutter out... well. The Hearth always takes you back. That’s what hearths are for.',
  ],
  generic: [
    'Back again? Warm yourself a moment. The dark isn’t going anywhere, more’s the pity.',
    'Spend your ash at the altar, spark. Old embers make good kindling.',
    'I melted down to this shape guarding the last coals. Worth it, if you ask me. Nobody asks me.',
    'The constellations still watch over the deep places. Stag, Hound, Owl, Serpent, Moth. Take what they offer.',
    'Try a different Form from the rack sometime. The sun was never just one shape.',
    'Dash through their blows, not away from them. Fire doesn’t flinch.',
    'Every time you climb, you get a little brighter. I can see it from here.',
  ],
  warden: ['The Kiln Warden, was it? Big brute. He stoked the sun’s forge once, before he swore himself to the dark.', 'Watch for when he charges. A walking furnace can’t turn quickly — let him hit the wall.'],
  angler: ['That Angler... its light is a lie, spark. Don’t follow it.', 'When it sinks below, keep moving. It strikes where you stand.'],
  regent: ['You saw Him. The Pale Regent.', 'You’re the closest any ember has come. I felt the stone grow warm.'],
  win: ['You did it. I felt it — warmth, up through all this stone. Light, in the deep places!', 'Will you climb again? The night has a way of creeping back. And there are deeper marks of the Night Pact, now, if you’re feeling brave.'],
  winAgain: ['Another dawn. You make it look almost easy, spark.', 'Deeper pacts await, if you want them. I’ll keep the coals warm.'],
};

const Game = {
  canvas: null,
  ctx: null,

  init() {
    Save.load();
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    Input.init(this.canvas);
    UI.init();
    Touch.init();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    G.debug = /[?&]debug/.test(location.search);
    const unlock = () => {
      Sound.init();
      Sound.setVolumes(Save.data.settings.sfx, Save.data.settings.music);
      Sound.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('blur', () => { if (G.state === 'play' && !UI.overlayOpen) UI.openPause(); });
    window.addEventListener('beforeunload', () => { if (G.run) this.commitRun(false, true); });
    this.enterTitle();
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxPx = 4200000;
    if (w * h * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (w * h));
    G.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    G.viewW = this.canvas.width;
    G.viewH = this.canvas.height;
    G.cam.baseScale = Touch.enabled ? Math.min(G.viewH / 540, G.viewW / 880) : Math.min(G.viewH / 700, G.viewW / 1060);
    G.cam.scale = G.cam.baseScale * (G.scene && G.scene.zoom ? G.scene.zoom : 1);
  },

  // ------------------------------------------------------------------ title & hub
  enterTitle() {
    G.run = null;
    G.state = 'title';
    this.buildHub();
    this.snapCamera();
    UI.showHUD(false);
    UI.openTitle();
    Music.play('title');
    UI.fade(0, 0.9);
  },

  quitToTitle() {
    if (G.run) this.commitRun(false, true);
    UI.showHUD(false);
    this.enterTitle();
  },

  async enterHub(fromTitle) {
    G.state = 'transition';
    if (!fromTitle) await UI.fade(1, 0.4);
    G.run = null;
    this.buildHub();
    this.snapCamera();
    UI.showHUD(true);
    UI.cache = {};
    Music.play('hub');
    Music.setIntensity(0);
    await UI.fade(0, 0.5);
    G.state = 'play';
    if (!Save.flag('metTallow')) {
      Save.setFlag('metTallow'); Save.save();
      setTimeout(() => this.talkTallow(true), 400);
    } else if (!fromTitle) {
      UI.banner('The Hearth', 'Rest. Then climb again.', 2.2);
    }
  },

  buildHub() {
    const sc = new Scene({ kind: 'hub', theme: 'hearth' });
    sc.zoom = Touch.enabled ? 0.9 : 0.86;
    G.scene = sc;
    const build = new Build(null);
    build.recalc();
    G.player = new Player(sc.entrance.x, sc.entrance.y, Save.data.weapon, build);
    G.player.aim = -Math.PI / 2;
    const T = TILE;
    // the great hearth on the north wall
    sc.addProp(new Prop({
      kind: 'hearth', x: 5.5 * T, y: T, r: 60, sortOffset: 0.4, shadow: false, range: 0,
      drawFn: (ctx, p) => drawHearthfire(ctx, p.x, p.y, p.t),
      lightFn: (p) => ({ x: p.x, y: p.y + 30, r: 420 + Math.sin(p.t * 7) * 14 + Math.sin(p.t * 17) * 8, color: '#ff8a3a', a: 1 }),
      onUpdate: (dt, s, p) => { if (Math.random() < 0.5) s.particles.spawn({ x: p.x + rand(-40, 40), y: p.y - 10, vx: rand(-20, 20), vy: -rand(40, 110), life: rand(1, 2), size: rand(1.5, 3), color: pick(['#ffb347', '#ff7a2e', '#ffe0a0']), drag: 0.4 }); },
    }));
    // Old Tallow
    sc.addProp(new Prop({
      kind: 'npc', x: 8.2 * T, y: 3.4 * T, r: 18, range: 72, solid: true, promptH: 86,
      prompt: () => 'Talk to Old Tallow',
      interact: () => this.talkTallow(false),
      drawFn: (ctx, p) => drawTallow(ctx, p.x, p.y, p.t),
      lightFn: (p) => ({ x: p.x, y: p.y - 60, r: 120, color: '#ffcf8a', a: 0.7 }),
    }));
    // Kindling Altar
    sc.addProp(new Prop({
      kind: 'altar', x: 3.2 * T, y: 8.6 * T, r: 24, range: 74, solid: true, promptH: 80,
      prompt: () => 'Kindling Altar (upgrades)',
      interact: () => UI.openUpgrades(),
      drawFn: (ctx, p) => drawAltar(ctx, p.x, p.y, p.t),
      lightFn: (p) => ({ x: p.x, y: p.y - 30, r: 160, color: '#ff9a4a', a: 0.9 }),
    }));
    // Rack of Forms
    sc.addProp(new Prop({
      kind: 'armory', x: 20.8 * T, y: 8.6 * T, r: 26, range: 76, solid: true, promptH: 92,
      prompt: () => 'Rack of Forms (weapons)',
      interact: () => UI.openWeapons(),
      drawFn: (ctx, p) => drawArmory(ctx, p.x, p.y, p.t),
      lightFn: (p) => ({ x: p.x, y: p.y - 40, r: 140, color: '#ffd27a', a: 0.6 }),
    }));
    // Chronicle
    sc.addProp(new Prop({
      kind: 'chronicle', x: 17.4 * T, y: 3.4 * T, r: 18, range: 70, solid: true, promptH: 76,
      prompt: () => 'The Chronicle',
      interact: () => UI.openChronicle(),
      drawFn: (ctx, p) => drawLectern(ctx, p.x, p.y, p.t),
      lightFn: (p) => ({ x: p.x, y: p.y - 34, r: 110, color: '#bfe6ff', a: 0.6 }),
    }));
    // Night Pact (after first dawn)
    if (Save.data.maxHeat > 0) {
      sc.addProp(new Prop({
        kind: 'pact', x: 14.6 * T, y: 2.7 * T, r: 16, range: 64, solid: true, promptH: 74,
        prompt: () => `The Night Pact (mark ${Save.data.heat})`,
        interact: () => UI.openNightPact(),
        drawFn: (ctx, p) => drawPactBrazier(ctx, p.x, p.y, p.t),
        lightFn: (p) => ({ x: p.x, y: p.y - 30, r: 130, color: '#b07aff', a: 0.8 }),
      }));
    }
    // exit: the Ascent
    const slot = sc.doorSlots[0];
    const door = makeDoor(slot, { label: 'Begin the Ascent', reward: { kind: 'exit' }, action: 'startRun' });
    door.locked = false;
    door.open = 1;
    sc.doors.push(door);
    sc.addProp(door);
    // training wick
    const dummy = sc.addEnemyNow('dummy', 19.6 * T, 12 * T, { def: DUMMY_DEF });
    dummy.isDummy = true;
    dummy.spawnT = 0;
  },

  refreshHubPlayer() {
    if (G.run || !G.scene || G.scene.kind !== 'hub') return;
    const old = G.player;
    const build = new Build(null);
    build.recalc();
    const p = new Player(old.x, old.y, Save.data.weapon, build);
    p.aim = old.aim;
    G.player = p;
    UI.cache = {};
  },

  talkTallow(first) {
    const d = Save.data;
    let lines;
    if (first) lines = TALLOW_LINES.intro;
    else if (d.lastRun && d.lastRun.victory && !d.lastRun.talked) {
      lines = d.wins > 1 ? TALLOW_LINES.winAgain : TALLOW_LINES.win;
      d.lastRun.talked = true; Save.save();
    } else if (d.lastRun && !d.lastRun.talked && d.lastRun.boss && TALLOW_LINES[d.lastRun.boss]) {
      lines = TALLOW_LINES[d.lastRun.boss];
      d.lastRun.talked = true; Save.save();
    } else {
      this._tallowIdx = ((this._tallowIdx === undefined ? randInt(0, 6) : this._tallowIdx) + 1) % TALLOW_LINES.generic.length;
      lines = [TALLOW_LINES.generic[this._tallowIdx]];
    }
    UI.talk(lines.map((t) => ({ speaker: 'Old Tallow', text: t, color: TALLOW })));
  },

  // ------------------------------------------------------------------ runs
  async startRun() {
    if (G.state === 'transition') return;
    Save.data.runs++;
    Save.save();
    const heat = Save.data.heat || 0;
    const run = {
      realm: 0, room: 0, depth: 0, gold: 50 * Save.rank('start'), ashEarned: 0, kills: 0, time: 0,
      build: null, rerolls: Save.rank('reroll'), defies: Save.rank('defy'), maxDefies: Save.rank('defy'),
      forgeTaken: [false, false, false], maxHpBonus: 0, rarityBonus: 0,
      enemyHpMult: 1, enemyDmgMult: 1, heat, damageTaken: 0, roomDamage: 0, blessingsTaken: 0, buildVersion: 1,
      lastShop: -9, sinceBlessing: 0, weapon: Save.data.weapon, lastHitBy: 'the dark', roomsCleared: 0,
    };
    run.build = new Build(run);
    run.build.recalc();
    G.run = run;
    G.player = new Player(0, 0, run.weapon, run.build);
    UI.cache = {};
    await this.goToRoom({ kind: 'combat', reward: { kind: 'blessing', patron: pick(PATRON_IDS) } }, true);
  },

  planExits(run, kind) {
    const realm = REALMS[run.realm];
    const N = realm.rooms;
    const i = run.room;
    if (kind === 'boss') {
      if (run.realm >= REALMS.length - 1) return [{ kind: 'victory', label: 'The Dawn Gate', reward: { kind: 'exit' } }];
      const nr = REALMS[run.realm + 1];
      return [{ kind: 'combat', newRealm: true, label: `Ascend to ${nr.name}`, reward: { kind: 'blessing', patron: pick(PATRON_IDS) } }];
    }
    if (i + 1 === N) return [{ kind: 'respite', label: 'Respite', reward: { kind: 'respite' } }];
    if (i + 1 > N) return [{ kind: 'boss', label: BOSSES[realm.boss].name, reward: { kind: 'boss' } }];
    return this.rollOptions(run, i + 1);
  },

  rollOptions(run, idx) {
    const nRoll = Math.random();
    let n = nRoll < 0.15 ? 1 : nRoll < 0.7 ? 2 : 3;
    const out = [];
    const used = new Set();
    const kinds = new Set();
    for (let k = 0; k < n; k++) {
      let kind = 'combat';
      const r = Math.random();
      if (idx >= 2 && !kinds.has('shop') && run.lastShop < idx - 2 && r < 0.14) kind = 'shop';
      else if (idx >= 2 && !kinds.has('fountain') && r < 0.21 && G.player && G.player.hp < G.player.maxHp * 0.85) kind = 'fountain';
      else if (idx >= 3 && !kinds.has('elite') && r < 0.36) kind = 'elite';
      kinds.add(kind);
      let reward;
      if (kind === 'shop' || kind === 'fountain') reward = { kind };
      else reward = this.rollReward(run, used, out);
      out.push({ kind, reward });
    }
    // make sure blessings keep flowing
    if (run.sinceBlessing >= 2 && !out.some((o) => o.reward.kind === 'blessing')) {
      const c = out.find((o) => o.kind === 'combat' || o.kind === 'elite');
      if (c) c.reward = { kind: 'blessing', patron: this.pickPatron(run, used) };
    }
    return out;
  },

  pickPatron(run, used) {
    const ids = PATRON_IDS.filter((p) => !used.has(p));
    const p = weightedPick(ids.length ? ids : PATRON_IDS, (id) => 1 + Math.min(2, run.build.patronCount(id)) * 0.35);
    used.add(p);
    return p;
  },

  rollReward(run, used, existing) {
    const has = (k) => existing.some((o) => o.reward && o.reward.kind === k);
    const table = [
      ['blessing', 46],
      ['gold', has('gold') ? 0 : 13],
      ['vitality', has('vitality') ? 0 : 11],
      ['ash', has('ash') ? 0 : 12],
      ['fragment', has('fragment') || !offerLevelUps(run.build).length ? 0 : 10],
      ['forge', has('forge') || run.forgeTaken[run.realm] ? 0 : 8],
    ];
    const kind = weightedPick(table, (x) => x[1])[0];
    if (kind === 'blessing') return { kind, patron: this.pickPatron(run, used) };
    return { kind };
  },

  makeWaves(run, kind) {
    const realm = REALMS[run.realm];
    const idx = run.room;
    const nWaves = kind === 'elite' ? 2 : idx < 1 ? 2 : idx < 4 ? (chance(0.5) ? 2 : 3) : 3;
    const base = 3.6 + idx * 0.7 + run.realm * 1.6 + run.heat * 0.4;
    const waves = [];
    for (let w = 0; w < nWaves; w++) {
      let budget = base * (w === nWaves - 1 ? 1.15 : 1) * (kind === 'elite' ? 0.75 : 1);
      const list = [];
      if (kind === 'elite' && w === nWaves - 1) {
        const pool = realm.pool.filter(([t]) => ENEMIES[t].cost >= 2);
        const ne = run.realm >= 1 ? 2 : 1;
        for (let i = 0; i < ne; i++) {
          const [t] = weightedPick(pool, (x) => x[1]);
          list.push({ type: t, elite: true });
          budget -= ENEMIES[t].cost * 2;
        }
      }
      let guard = 0;
      while (budget > 0.6 && guard++ < 30 && list.length < 10) {
        const cands = realm.pool.filter(([t]) => ENEMIES[t].cost <= budget + 0.6);
        if (!cands.length) break;
        const [t] = weightedPick(cands, (x) => x[1]);
        const elite = kind !== 'elite' && idx >= 3 && chance(0.05 + run.realm * 0.04 + run.heat * 0.03);
        list.push({ type: t, elite });
        budget -= ENEMIES[t].cost * (elite ? 2.2 : 1);
      }
      if (!list.length) list.push({ type: realm.pool[0][0] });
      waves.push(list);
    }
    return waves;
  },

  async goToRoom(next, first = false) {
    const run = G.run;
    if (!run) return;
    G.state = 'transition';
    if (!first) Sound.play('door');
    await UI.fade(1, first ? 0.45 : 0.3);
    if (next.newRealm) { run.realm++; run.room = 0; }
    else if (!first) run.room++;
    run.depth++;
    run.roomDamage = 0;
    const realm = REALMS[run.realm];
    const kind = next.kind;
    if (kind === 'shop' || kind === 'respite') run.lastShop = run.room;
    const exits = this.planExits(run, kind);
    const combat = kind === 'combat' || kind === 'elite';
    run.enemyHpMult = (1 + 0.035 * run.room + 0.08 * run.realm) * (1 + 0.12 * run.heat);
    run.enemyDmgMult = (1 + 0.03 * run.room + 0.06 * run.realm) * (1 + 0.1 * run.heat);
    const sc = new Scene({ kind, realmIdx: run.realm, theme: realm.theme, reward: combat ? next.reward : null, exits });
    G.scene = sc;
    G.camFocus = null;
    if (combat && next.reward && next.reward.kind === 'blessing') run.sinceBlessing = 0; else run.sinceBlessing++;
    const p = G.player;
    p.x = sc.entrance.x; p.y = sc.entrance.y;
    p.vx = p.vy = p.kx = p.ky = 0;
    p.cancelAction(); p.dashing = 0; p.buffer = null;
    p.aim = -Math.PI / 2;
    p.invuln = 0.6;
    if (p.stats.barrierMax) { p.barrier = p.stats.barrierMax; p.barrierT = p.stats.barrierRecharge; }
    if (p.weapon.id === 'wheel') p.weapon.init(p);
    sc.doorSlots.forEach((slot, i) => {
      if (!exits[i]) return;
      const d = makeDoor(slot, exits[i]);
      sc.doors.push(d);
      sc.addProp(d);
    });
    const cx = sc.map.pw / 2, cy = sc.map.ph / 2;
    if (combat) {
      sc.encounter = new Encounter(sc, this.makeWaves(run, kind));
      if (kind === 'elite') sc.eliteBonus = true;
    } else if (kind === 'shop') { makeShop(sc, cx, cy - 10); sc.unlockDoors(); }
    else if (kind === 'fountain') { sc.addProp(makeFountain(cx, cy)); sc.unlockDoors(); }
    else if (kind === 'respite') { sc.addProp(makeFountain(cx - 190, cy + 20)); makeShop(sc, cx + 80, cy); sc.unlockDoors(); }
    else if (kind === 'boss') this.setupBoss(sc, realm);
    this.snapCamera();
    UI.cache = {};
    if (kind === 'boss') Music.play(run.realm === REALMS.length - 1 ? 'final' : 'boss');
    else Music.play(realm.music);
    Music.setIntensity(combat ? 1 : 0);
    await UI.fade(0, 0.4);
    G.state = 'play';
    if (run.room === 0) UI.banner(realm.name, realm.sub, 2.6);
    else if (kind === 'elite') UI.banner('A Fierce Chamber', 'Stronger foes guard a richer prize', 2);
    else if (kind === 'shop') UI.banner('The Wandering Peddler', '', 1.8, 'small');
    else if (kind === 'fountain') UI.banner('An Ember Well', '', 1.8, 'small');
    else if (kind === 'respite') UI.banner('Respite', 'Something terrible waits beyond', 2.2);
    if (kind === 'boss') this.bossIntro(sc);
  },

  setupBoss(sc, realm) {
    const def = BOSSES[realm.boss];
    const run = G.run;
    const boss = sc.addEnemyNow(null, sc.map.pw / 2, sc.map.ph * 0.36, { def, hpScale: 1 + 0.12 * run.heat });
    boss.spawnT = 0;
    boss.thinkT = 999;
    sc.boss = boss;
    if (def.id === 'angler') sc.darkness = 0.74;
    if (def.id === 'regent') sc.darkness = 0.3;
  },

  bossIntro(sc) {
    const boss = sc.boss;
    const def = boss.def;
    const met = Save.flag('met_' + def.id);
    Save.setFlag('met_' + def.id); Save.save();
    Sound.play('roar');
    G.shake(6);
    UI.banner(def.name, def.epithet, 2.8, 'boss');
    G.camFocus = { x: boss.x, y: boss.y - 40, until: performance.now() + 60000 };
    const lines = (met ? [pick(def.introRepeat)] : def.intro).map((t) => ({ speaker: def.name, text: t, color: def.color }));
    const tryTalk = () => {
      if (G.scene !== sc) { G.camFocus = null; return; }
      if (UI.overlayOpen || G.state !== 'play') { setTimeout(tryTalk, 300); return; }
      UI.talk(lines, () => { boss.thinkT = 0.6; Music.setIntensity(2); G.camFocus = null; });
    };
    setTimeout(tryTalk, 900);
  },

  bossLine(e, text) {
    UI.toast(`<b style="color:${e.def.color}">${esc(e.def.name)}</b> — ${esc(text)}`, 3.2);
  },

  onBossDefeated(boss) {
    const sc = G.scene, run = G.run;
    if (!run) return;
    Save.data.bossKills[boss.def.id] = (Save.data.bossKills[boss.def.id] || 0) + 1;
    G.slowmo = 1.8;
    G.shake(14);
    Sound.play('bossDie');
    sc.addEffect(FX.flash(boss.x, boss.y - 40, 500, '#ffffff', 0.8));
    sc.addEffect(FX.ring(boss.x, boss.y - 20, 20, 520, 1.0, boss.def.color, 10));
    sc.particles.burst(boss.x, boss.y - 40, 120, { color: boss.def.deathColors, speed: 520, life: 1.4, size: 6, drag: 2.5 });
    for (const e of sc.enemies) if (!e.dead && e !== boss) { e.noDrops = true; killEnemy(e); }
    for (const pr of sc.projectiles) if (pr.team === 'enemy') pr.die(sc, 'cleared');
    for (const fx of sc.effects) if (fx.hazard || fx.owner) fx.dead = true;
    sc.cleared = true;
    Music.setIntensity(0);
    const ashGain = Math.round([30, 45, 70][run.realm] * (1 + 0.15 * run.heat));
    run.ashEarned += ashGain;
    run.roomsCleared++;
    setTimeout(() => {
      if (G.scene !== sc) return;
      UI.banner(`${boss.def.name} Falls`, `+${ashGain} Ash`, 2.6, 'boss');
      sc.addProp(makeRewardPickup({ kind: 'vitality' }, boss.x, Math.min(boss.y + 40, sc.map.ph - TILE * 2.5)));
      if (run.realm === REALMS.length - 1) {
        UI.toast(`<b style="color:#ffe9b0">The Dawn Gate</b> — it is opening.`, 3.5);
      }
    }, 1400);
  },

  roomClearBonus() {
    const run = G.run, sc = G.scene, p = G.player;
    run.roomsCleared++;
    const ash = Math.round((2 + (sc.eliteBonus ? 10 : 0)) * (1 + 0.15 * run.heat));
    run.ashEarned += ash;
    sc.addText(p.x, p.y - 60, `+${ash} Ash`, '#e6dccf', 14, { life: 1.4, vy: -30 });
  },

  enterDoor(door) {
    if (door.locked || G.state !== 'play') return;
    const next = door.next;
    if (next.action === 'startRun') return this.startRun();
    if (next.kind === 'victory') return this.victory();
    this.goToRoom(next);
  },

  // ------------------------------------------------------------------ rewards
  collectReward(prop) {
    const run = G.run, sc = G.scene, p = G.player;
    if (!run) return;
    prop.dead = true;
    const r = prop.reward;
    const done = () => sc.unlockDoors();
    Sound.play('pickup');
    sc.particles.burst(prop.x, prop.y - 30, 24, { color: [rewardColor(r), '#ffffff'], speed: 220, life: 0.6, size: 3 });
    switch (r.kind) {
      case 'blessing': this.offerBlessing(r.patron, done); break;
      case 'gold': {
        const v = Math.round((55 + randInt(0, 30) + run.realm * 25) * (p.stats.goldMult || 1));
        run.gold += v;
        Sound.play('coin');
        sc.addText(p.x, p.y - 60, `+${v} Gold`, '#ffd76a', 18, { life: 1.4, vy: -40 });
        done();
        break;
      }
      case 'vitality': {
        run.maxHpBonus += 25;
        run.build.recalc();
        run.buildVersion++;
        Sound.play('heal');
        sc.addText(p.x, p.y - 60, '+25 Max Health', '#ff8a9a', 18, { life: 1.4, vy: -40 });
        done();
        break;
      }
      case 'ash': {
        const v = Math.round((14 + run.realm * 6) * (1 + 0.15 * run.heat));
        run.ashEarned += v;
        sc.addText(p.x, p.y - 60, `+${v} Ash`, '#e6dccf', 18, { life: 1.4, vy: -40 });
        done();
        break;
      }
      case 'fragment': this.offerFragment(done); break;
      case 'forge': run.forgeTaken[run.realm] = true; this.offerForgeChoice(done); break;
      default: done();
    }
  },

  offerBlessing(patronId, onDone) {
    const run = G.run;
    const pat = PATRONS[patronId];
    let offers = offerBlessings(patronId, run.build, 3);
    if (!offers.length) {
      if (offerLevelUps(run.build).length) { this.offerFragment(onDone, `${pat.name} has nothing new to give, but brightens what you carry.`); return; }
      run.gold += 100;
      UI.toast('The stars are silent. You find <b>100 gold</b> instead.');
      if (onDone) onDone();
      return;
    }
    const line = pick(pat.lines);
    const show = () => {
      UI.openChoice({
        kicker: 'A blessing from', title: pat.name, titleColor: pat.color, epithet: pat.epithet, glyph: { patron: patronId }, line,
        cards: offers.map((o) => UI.blessingCard(o.def, o.rarity, run.build)),
        onPick: (i) => {
          const o = offers[i];
          run.build.add(o.def, o.rarity);
          run.blessingsTaken++;
          run.buildVersion++;
          UI.closeOverlay();
          this.blessFx(o.def.duo ? RARITY[4].color : pat.color);
          UI.toast(`<b style="color:${pat.color}">${esc(o.def.name)}</b> <span style="color:${RARITY[o.rarity].color}">${RARITY[o.rarity].name}</span>`);
          if (onDone) onDone();
        },
        reroll: { left: run.rerolls, fn: () => { run.rerolls--; offers = offerBlessings(patronId, run.build, 3); show(); } },
      });
    };
    show();
  },

  offerFragment(onDone, line) {
    const run = G.run;
    const cands = offerLevelUps(run.build, 3);
    if (!cands.length) { run.gold += 60; UI.toast('Nothing to empower. <b>+60 gold</b>.'); if (onDone) onDone(); return; }
    UI.openChoice({
      kicker: 'A Star Fragment', title: 'Empower a Blessing', titleColor: '#fff0a6', glyph: { kind: 'fragment' },
      line: line || 'Starlight, gathered up and given back.',
      cards: cands.map((entry) => UI.blessingCard(entry.def, entry.rarity, run.build, { vals: computeVals(entry.def, entry.rarity, entry.level + 1), note: `Level ${entry.level} → <b>${entry.level + 1}</b>` })),
      onPick: (i) => {
        run.build.levelUp(cands[i].id);
        run.buildVersion++;
        UI.closeOverlay();
        this.blessFx('#fff0a6');
        UI.toast(`<b style="color:#fff0a6">${esc(cands[i].def.name)}</b> empowered to level ${cands[i].level}`);
        if (onDone) onDone();
      },
    });
  },

  offerForgeChoice(onDone) {
    const run = G.run;
    const opts = offerForge(run.build, run.weapon);
    if (!opts.length) { run.gold += 80; if (onDone) onDone(); return; }
    UI.openChoice({
      kicker: 'The Sunforge', title: `Reforge the ${WEAPONS[run.weapon].name}`, titleColor: '#ff9d4a', glyph: { kind: 'forge' },
      line: 'Old fire remembers every shape it ever held.',
      cards: opts.map((f) => ({ title: f.name, tag: f.weapon ? WEAPONS[f.weapon].name : 'Any Form', rarity: 'forge', rarityName: 'Sunforge', rarityColor: '#ff9d4a', color: '#ff9d4a', icon: iconURL('forge', { size: 40 }), desc: f.desc })),
      onPick: (i) => {
        run.build.addForge(opts[i].id);
        run.buildVersion++;
        UI.closeOverlay();
        this.blessFx('#ff9d4a');
        UI.toast(`<b style="color:#ff9d4a">${esc(opts[i].name)}</b> forged`);
        if (onDone) onDone();
      },
    });
  },

  blessFx(color) {
    const p = G.player, sc = G.scene;
    sc.addEffect(FX.ring(p.x, p.y - 16, 10, 120, 0.6, color, 5));
    sc.addEffect(FX.flash(p.x, p.y - 16, 160, color, 0.5));
    sc.particles.burst(p.x, p.y - 16, 36, { color: [color, '#ffffff'], speed: 260, life: 0.8, size: 3.5 });
  },

  buyItem(prop) {
    const it = prop.item, run = G.run, p = G.player, sc = G.scene;
    if (run.gold < it.price) {
      Sound.play('deny');
      sc.addText(prop.x, prop.y - 60, 'Not enough gold', '#c8a898', 13, { life: 0.9 });
      return;
    }
    run.gold -= it.price;
    prop.sold = true;
    Sound.play('buy');
    sc.particles.burst(prop.x, prop.y - 30, 18, { color: ['#ffd76a', '#ffffff'], speed: 160, life: 0.5, size: 3 });
    switch (it.kind) {
      case 'heal': p.heal(Math.round(p.maxHp * 0.35)); break;
      case 'vitality': run.maxHpBonus += 25; run.build.recalc(); run.buildVersion++; sc.addText(p.x, p.y - 60, '+25 Max Health', '#ff8a9a', 16); break;
      case 'blessing': this.offerBlessing(pick(PATRON_IDS), null); break;
      case 'fragment': this.offerFragment(null); break;
      case 'forge': run.forgeTaken[run.realm] = true; this.offerForgeChoice(null); break;
      case 'ash': run.ashEarned += 25; sc.addText(p.x, p.y - 60, '+25 Ash', '#e6dccf', 16); break;
      case 'defy': run.defies = Math.min(run.maxDefies, run.defies + 1); sc.addText(p.x, p.y - 60, 'Second Flame restored', '#ffd27a', 15); break;
    }
  },

  // ------------------------------------------------------------------ death / victory
  onPlayerDeath() {
    if (!G.run) return;
    G.state = 'dying';
    G.deathT = 2.2;
    G.slowmo = 1.4;
    Sound.play('death');
    Music.setIntensity(0);
    UI.banner('The Flame Gutters', '', 2.4, 'death');
  },

  commitRun(victory, abandoned = false) {
    const run = G.run;
    if (!run) return null;
    const d = Save.data;
    let ash = run.ashEarned;
    if (victory) ash += Math.round(100 * (1 + 0.15 * run.heat));
    d.ash += ash;
    d.totalAsh += ash;
    d.kills += run.kills;
    const depth = run.realm * (REALMS[0].rooms + 2) + run.room + 1;
    d.bestDepth = Math.max(d.bestDepth, depth);
    let unlock = '';
    if (victory) {
      d.wins++;
      if (!d.bestTime || run.time < d.bestTime) d.bestTime = Math.round(run.time);
      if (run.heat + 1 > d.maxHeat && run.heat < 8) { d.maxHeat = run.heat + 1; unlock = `The Night Pact deepens: mark ${d.maxHeat} can now be sworn at the Hearth.`; }
    } else if (!abandoned) d.deaths++;
    const sc = G.scene;
    d.lastRun = { victory, boss: sc && sc.kind === 'boss' && !victory ? REALMS[run.realm].boss : null, realm: run.realm, room: run.room, talked: false };
    Save.save();
    const summary = {
      time: run.time, rooms: run.roomsCleared, kills: run.kills, blessings: run.build.list.length, ash, gold: run.gold, unlock,
      line: victory ? 'The Dawn Gate opens. Light pours into the deep places, and far above, a dead sun remembers how to burn.'
        : `Snuffed out by ${run.lastHitBy} in ${REALMS[run.realm].name}${sc && sc.kind === 'boss' ? '' : `, chamber ${run.room + 1}`}.`,
    };
    G.run = null;
    return summary;
  },

  finishDeath() {
    const summary = this.commitRun(false);
    G.state = 'menu';
    UI.showHUD(false);
    if (summary) UI.openRunEnd(false, summary);
  },

  abandonRun() {
    const summary = this.commitRun(false, true);
    UI.showHUD(false);
    if (summary) { summary.line = 'You let the flame sink back to the Hearth.'; UI.openRunEnd(false, summary); }
  },

  async victory() {
    G.state = 'transition';
    Sound.play('defy');
    Music.play('victory');
    const flash = document.getElementById('fade');
    flash.style.background = '#fff6e0';
    await UI.fade(1, 1.2);
    const summary = this.commitRun(true);
    UI.showHUD(false);
    flash.style.background = '';
    await UI.fade(0, 0.8);
    G.state = 'menu';
    UI.openRunEnd(true, summary);
  },

  // ------------------------------------------------------------------ camera
  snapCamera() {
    const p = G.player, sc = G.scene;
    if (!p || !sc) return;
    const t = this.cameraTarget();
    G.cam.x = t.x; G.cam.y = t.y;
  },

  cameraTarget() {
    const p = G.player, sc = G.scene, c = G.cam;
    c.scale = c.baseScale * (sc.zoom || 1);
    let tx = p.x, ty = p.y - 24;
    if (G.camFocus && G.camFocus.until > performance.now()) { tx = lerp(tx, G.camFocus.x, 0.85); ty = lerp(ty, G.camFocus.y, 0.85); }
    else if (G.state === 'title') { tx = sc.map.pw / 2 + Math.sin(sc.time * 0.15) * 60; ty = sc.map.ph / 2 - 40; }
    else if (Input.aimMode === 'mouse' && !p.dead && G.state === 'play') {
      const w = G.screenToWorld(Input.mouse.x, Input.mouse.y);
      tx += clamp((w.x - p.x) * 0.16, -80, 80);
      ty += clamp((w.y - p.y) * 0.16, -60, 60);
    }
    const vw = G.viewW / c.scale, vh = G.viewH / c.scale;
    const minX = vw / 2 - 40, maxX = sc.map.pw - vw / 2 + 40;
    tx = minX > maxX ? sc.map.pw / 2 : clamp(tx, minX, maxX);
    const minY = vh / 2 - WALL_H - 110, maxY = sc.map.ph - vh / 2 + 8;
    ty = minY > maxY ? (sc.map.ph - WALL_H - 110) / 2 : clamp(ty, minY, maxY);
    return { x: tx, y: ty };
  },

  updateCamera(dt) {
    const t = this.cameraTarget();
    G.cam.x = damp(G.cam.x, t.x, 7, dt);
    G.cam.y = damp(G.cam.y, t.y, 7, dt);
  },

  // ------------------------------------------------------------------ loop
  update(rdt) {
    const st = G.state;
    if (st === 'menu' || st === 'title') {
      if (st === 'menu' && Input.pressed('build') && UI.overlay.querySelector('.build-view')) { UI.closeOverlay(); return; }
      UI.updateNav(rdt);
      if (G.scene) {
        G.scene.time += rdt;
        G.scene.particles.update(rdt);
        for (const pr of G.scene.props) pr.t += rdt;
        if (st === 'title') { G.scene.ambient(rdt); this.updateCamera(rdt); }
      }
      return;
    }
    if (st === 'dialogue') {
      UI.updateDialogue(rdt);
      if (G.scene) { G.scene.time += rdt; G.scene.particles.update(rdt); for (const pr of G.scene.props) pr.t += rdt; if (G.player) this.updateCamera(rdt); }
      return;
    }
    if (st === 'transition' || !G.scene || !G.player) return;
    if (st === 'play') {
      if (Input.pressed('pause')) { UI.openPause(); return; }
      if (Input.pressed('build') && G.run) { UI.openBuild(); return; }
      if (G.debug) this.debugKeys();
    }
    const p = G.player;
    if (!G.swallowInput && st === 'play') p.readInput();
    else { p.moveX = p.moveY = 0; p.buffer = null; }
    G.swallowInput = false;
    if (st === 'play' && Input.pressed('interact')) G.scene.interact();
    if (G.state !== st && G.state !== 'dying') { this.postUpdate(rdt); return; }
    let dt = rdt;
    if (G.slowmo > 0) { G.slowmo -= rdt; dt *= 0.3; }
    if (G.hitstop > 0) { G.hitstop -= rdt; dt = 0; }
    if (dt > 0) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) {
        G.scene.update(sub);
        if (G.state === 'transition') break;
      }
      if (G.run) G.run.time += dt;
    }
    if (G.state === 'dying') {
      G.deathT -= rdt;
      if (G.deathT <= 0) this.finishDeath();
    }
    this.postUpdate(rdt);
  },

  postUpdate(rdt) {
    if (!G.scene || !G.player) return;
    this.updateCamera(rdt);
    G.trauma = Math.max(0, G.trauma - rdt * 1.6);
    G.hurtVignette = Math.max(0, G.hurtVignette - rdt * 2.4);
    const p = G.player;
    const low = G.run && p.hp > 0 && p.hp / p.maxHp < 0.25 ? 0.25 + 0.15 * Math.sin(performance.now() / 180) : 0;
    UI.hurt(Math.max(G.hurtVignette * 0.85, low));
    UI.updateHUD();
  },

  lateUpdate() { Touch.update(); },

  render() {
    const ctx = this.ctx;
    if (!G.scene) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#050305';
      ctx.fillRect(0, 0, G.viewW, G.viewH);
      return;
    }
    const tr = G.trauma * G.trauma;
    const now = performance.now() / 1000;
    const sx = (Math.sin(now * 47.3) + Math.sin(now * 31.7) * 0.6) * tr * 11;
    const sy = (Math.cos(now * 43.1) + Math.sin(now * 27.9) * 0.6) * tr * 11;
    const cam = { x: G.cam.x + sx, y: G.cam.y + sy, scale: G.cam.scale };
    G.scene.render(ctx, cam, G.viewW, G.viewH);
    // mouse reticle (system cursor is hidden over the canvas)
    if (Input.aimMode === 'mouse' && Input.mouse.seen && G.state !== 'title' && !UI.overlayOpen) {
      const mx = Input.mouse.x * G.dpr, my = Input.mouse.y * G.dpr, k = G.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = 'rgba(20,10,10,0.6)'; ctx.lineWidth = 4 * k;
      ctx.beginPath(); ctx.arc(mx, my, 9 * k, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,205,150,0.9)'; ctx.lineWidth = 1.6 * k;
      ctx.beginPath(); ctx.arc(mx, my, 9 * k, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffe2c0';
      ctx.beginPath(); ctx.arc(mx, my, 1.8 * k, 0, TAU); ctx.fill();
    }
  },

  debugKeys() {
    const k = Input.pressedKeys;
    const sc = G.scene;
    if (k.has('Digit1')) for (const e of sc.enemies) if (!e.dead && !e.isDummy) hitEnemy(e, 99999, { source: 'other', enemySource: true });
    if (k.has('Digit2') && sc.encounter && !sc.cleared) { for (const e of sc.enemies) e.dead = true; sc.enemies.length = 0; sc.pendingSpawns = 0; sc.encounter.done = true; sc.onCleared(); }
    if (k.has('Digit3') && G.run) this.offerBlessing(pick(PATRON_IDS), null);
    if (k.has('Digit4') && G.run) { G.run.room = REALMS[G.run.realm].rooms; this.goToRoom({ kind: 'boss', reward: { kind: 'boss' } }); }
    if (k.has('Digit5')) { if (G.run) G.run.gold += 300; Save.data.ash += 100; Save.save(); }
    if (k.has('Digit6')) { G.god = !G.god; UI.toast(`God mode ${G.god ? 'on' : 'off'}`); }
    if (k.has('Digit7') && G.run && G.run.realm < REALMS.length - 1) { G.run.room = 0; this.goToRoom({ kind: 'combat', newRealm: true, reward: { kind: 'blessing', patron: pick(PATRON_IDS) } }); }
    if (k.has('Digit8') && G.run) this.offerForgeChoice(null);
  },
};

// ---------------------------------------------------------------------------
// Training wick (hub dummy)
// ---------------------------------------------------------------------------
const DUMMY_DEF = {
  id: 'dummy', name: 'Training Wick', r: 16, hp: 99999, speed: 0, mass: 50, immovable: true, color: '#d8b070', glow: 0,
  init(e) {
    e.noDrops = true;
    e.onBeforeDeath = () => { e.hp = e.maxHp; return false; };
    e.onDamaged = () => { e.mem.wob = 1; };
    e.thinkT = 999;
  },
  ai(e, dt) {
    e.vx = e.vy = 0;
    if (e.lastHitT <= 0) e.hp = e.maxHp;
    e.mem.wob = Math.max(0, (e.mem.wob || 0) - dt * 2.5);
  },
  draw(ctx, e, t, C) {
    const w = (e.mem.wob || 0) * Math.sin(t * 30) * 0.25;
    ctx.save();
    ctx.rotate(w);
    ctx.fillStyle = C('#5a4030');
    ctx.fillRect(-3, -50, 6, 50);
    ctx.fillStyle = C('#e8d4a8');
    ctx.beginPath(); ctx.ellipse(0, -30, 14, 18, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C('#b89868'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, -26); ctx.lineTo(12, -26); ctx.moveTo(-12, -36); ctx.lineTo(12, -36); ctx.stroke();
    ctx.fillStyle = C('#f0e0c0');
    ctx.beginPath(); ctx.ellipse(0, -54, 9, 10, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C('#3a2a20'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -64); ctx.lineTo(0, -70); ctx.stroke();
    ctx.fillStyle = C('#3a2a20');
    ctx.beginPath(); ctx.arc(-3, -55, 1.5, 0, TAU); ctx.arc(3, -55, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Hub art
// ---------------------------------------------------------------------------
function drawHearthfire(ctx, x, y, t) {
  const w = 150, h = 92;
  // stone mantle on the wall face
  ctx.fillStyle = '#3e2a22';
  ctx.fillRect(x - w / 2 - 16, y - h - 18, w + 32, 20);
  ctx.fillStyle = '#5a3e30';
  ctx.fillRect(x - w / 2 - 16, y - h - 22, w + 32, 6);
  ctx.fillStyle = '#4a3228';
  ctx.fillRect(x - w / 2 - 16, y - h, 18, h);
  ctx.fillRect(x + w / 2 - 2, y - h, 18, h);
  // firebox
  ctx.fillStyle = '#0c0504';
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 2, y); ctx.lineTo(x - w / 2 + 2, y - h + 20); ctx.quadraticCurveTo(x, y - h - 10, x + w / 2 - 2, y - h + 20); ctx.lineTo(x + w / 2 - 2, y); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y - 20, 120, '#ff6a1a', 0.9);
  for (let i = 0; i < 7; i++) {
    const fx = x - 50 + i * 17;
    const fh = 40 + Math.sin(t * 6 + i * 1.7) * 12 + Math.sin(t * 13 + i) * 6;
    const g = ctx.createLinearGradient(0, y, 0, y - fh);
    g.addColorStop(0, 'rgba(255,220,150,0.95)'); g.addColorStop(0.5, 'rgba(255,120,40,0.8)'); g.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(fx - 14, y); ctx.quadraticCurveTo(fx - 10, y - fh * 0.6, fx + Math.sin(t * 5 + i) * 4, y - fh); ctx.quadraticCurveTo(fx + 10, y - fh * 0.6, fx + 14, y); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // logs
  ctx.fillStyle = '#2a1810';
  ctx.fillRect(x - 46, y - 10, 92, 8);
  ctx.fillStyle = '#3a2216';
  ctx.fillRect(x - 36, y - 16, 72, 7);
}

function drawTallow(ctx, x, y, t) {
  // Old Tallow: a great melted candle with kind eyes and a poker
  const bob = Math.sin(t * 1.4) * 1;
  ctx.fillStyle = '#d8c8a8';
  ctx.beginPath();
  ctx.moveTo(x - 20, y);
  ctx.quadraticCurveTo(x - 26, y - 4, x - 22, y - 10);
  ctx.lineTo(x - 18, y - 52 + bob);
  ctx.quadraticCurveTo(x, y - 60 + bob, x + 18, y - 52 + bob);
  ctx.lineTo(x + 22, y - 10);
  ctx.quadraticCurveTo(x + 26, y - 4, x + 20, y);
  ctx.closePath(); ctx.fill();
  // drips
  ctx.fillStyle = '#e8dcc0';
  for (const [dx, len] of [[-12, 18], [-2, 10], [9, 24], [15, 12]]) {
    ctx.beginPath(); ctx.moveTo(x + dx - 3, y - 50 + bob); ctx.lineTo(x + dx - 3, y - 50 + len + bob); ctx.arc(x + dx, y - 50 + len + bob, 3, Math.PI, 0, true); ctx.lineTo(x + dx + 3, y - 50 + bob); ctx.fill();
  }
  ctx.fillStyle = '#f4ead4';
  ctx.beginPath(); ctx.ellipse(x, y - 53 + bob, 17, 5, 0, 0, TAU); ctx.fill();
  // face
  ctx.fillStyle = '#5a3a20';
  ctx.beginPath(); ctx.arc(x - 6, y - 36 + bob, 2, 0, TAU); ctx.arc(x + 6, y - 36 + bob, 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8a6a48'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y - 30 + bob, 4, 0.2, Math.PI - 0.2); ctx.stroke();
  // wick + flame
  ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 55 + bob); ctx.lineTo(x + 1, y - 62 + bob); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y - 68 + bob, 22, '#ffb347', 0.9);
  ctx.fillStyle = '#ffd27a';
  const f = Math.sin(t * 9) * 1.5;
  ctx.beginPath(); ctx.moveTo(x - 4, y - 62 + bob); ctx.quadraticCurveTo(x - 3, y - 70 + bob, x + f, y - 76 + bob); ctx.quadraticCurveTo(x + 4, y - 70 + bob, x + 4, y - 62 + bob); ctx.fill();
  ctx.restore();
  // poker
  ctx.strokeStyle = '#4a4040'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x + 22, y - 22); ctx.lineTo(x + 32, y - 2); ctx.stroke();
}

function drawAltar(ctx, x, y, t) {
  ctx.fillStyle = '#3a2c2a';
  ctx.fillRect(x - 26, y - 26, 52, 26);
  ctx.fillStyle = '#4e3c38';
  ctx.fillRect(x - 30, y - 32, 60, 8);
  ctx.fillStyle = '#2a1e1c';
  ctx.beginPath(); ctx.ellipse(x, y - 34, 20, 7, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y - 36, 44, '#ff7a2e', 0.7 + 0.15 * Math.sin(t * 3));
  for (let i = 0; i < 5; i++) {
    const a = t * 0.8 + i * 1.256;
    ctx.fillStyle = 'rgba(255,170,90,0.9)';
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * 12, y - 36 + Math.sin(a) * 4, 2.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#d8c8b8';
  ctx.font = '700 9px "Cinzel", serif'; ctx.textAlign = 'center';
  ctx.fillText('✵', x, y - 10);
}

function drawArmory(ctx, x, y, t) {
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(x - 34, y - 70, 6, 70);
  ctx.fillRect(x + 28, y - 70, 6, 70);
  ctx.fillRect(x - 36, y - 72, 72, 6);
  ctx.fillRect(x - 36, y - 30, 72, 5);
  const owned = Save.data.weapons;
  const sel = Save.data.weapon;
  const slots = [['blade', x - 18], ['bow', x], ['wheel', x + 18]];
  for (const [id, sx] of slots) {
    ctx.save();
    ctx.globalAlpha = owned.includes(id) ? 1 : 0.3;
    if (id === sel) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, sx, y - 50, 26, WEAPONS[id].color, 0.7); ctx.restore(); }
    if (id === 'blade') {
      ctx.fillStyle = '#ffb46a'; ctx.fillRect(sx - 2, y - 66, 4, 30);
      ctx.fillStyle = '#c9a060'; ctx.fillRect(sx - 6, y - 38, 12, 3);
    } else if (id === 'bow') {
      ctx.strokeStyle = '#c89a50'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx + 6, y - 50, 14, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,200,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx + 6 + Math.cos(Math.PI * 0.6) * 14, y - 50 + Math.sin(Math.PI * 0.6) * 14); ctx.lineTo(sx + 6 + Math.cos(Math.PI * 1.4) * 14, y - 50 + Math.sin(Math.PI * 1.4) * 14); ctx.stroke();
    } else drawWheel(ctx, sx, y - 50, 8, t * 0.5);
    ctx.restore();
  }
}

function drawLectern(ctx, x, y, t) {
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(x - 5, y - 30, 10, 30);
  ctx.fillRect(x - 14, y - 4, 28, 4);
  ctx.save();
  ctx.translate(x, y - 34);
  ctx.rotate(-0.15);
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(-18, -6, 36, 10);
  ctx.fillStyle = '#e8dcc4';
  ctx.fillRect(-16, -10, 15, 8); ctx.fillRect(1, -10, 15, 8);
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y - 44, 24 + Math.sin(t * 2) * 3, '#bfe6ff', 0.6);
  ctx.restore();
}

function drawPactBrazier(ctx, x, y, t) {
  ctx.fillStyle = '#241a2a';
  ctx.beginPath(); ctx.moveTo(x - 16, y - 24); ctx.lineTo(x + 16, y - 24); ctx.lineTo(x + 8, y); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y - 32, 30, '#9a6aff', 0.8);
  ctx.fillStyle = '#c99bff';
  const f = Math.sin(t * 8) * 2;
  ctx.beginPath(); ctx.moveTo(x - 9, y - 24); ctx.quadraticCurveTo(x - 6, y - 38, x + f, y - 48); ctx.quadraticCurveTo(x + 6, y - 38, x + 9, y - 24); ctx.fill();
  ctx.restore();
}
