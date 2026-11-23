'use strict';
// ---------------------------------------------------------------------------
// The five constellations, their blessings, Conjunctions (duo blessings),
// and the Build that turns owned blessings into stats + combat hooks.
// ---------------------------------------------------------------------------

const PATRONS = {
  stag: {
    id: 'stag', name: 'The Stag', epithet: 'Constellation of the Gale', element: 'Gale', color: PATRON_COLORS.stag,
    blurb: 'Speed, force and the open wind.',
    lines: [
      'Run, little flame. Nothing that walks can catch what flies.',
      'The wind still remembers the sun. So do I. Take this, and be quick.',
      'Antlers were made for breaking things. Borrow mine.',
      'Do not slow down. The dark is patient, but it is not fast.',
      'A spark that stands still is a spark that goes out.',
      'Strike, and let the gale carry them into the stone.',
    ],
  },
  hound: {
    id: 'hound', name: 'The Hound', epithet: 'Constellation of the Storm', element: 'Storm', color: PATRON_COLORS.hound,
    blurb: 'Chain lightning and thunder from above.',
    lines: [
      'HA! There you are! I can smell you burning from up here!',
      'Bite first, spark. Ask questions never!',
      'Thunder is just the sky barking. Let me bark for you!',
      'Chase them down! Chase them ALL down!',
      'Good spark. Best spark. Go get them.',
      'I have been howling at this dark for an age. Now it howls back.',
    ],
  },
  owl: {
    id: 'owl', name: 'The Owl', epithet: 'Constellation of the Frost', element: 'Frost', color: PATRON_COLORS.owl,
    blurb: 'Chill that slows, freezes and shatters.',
    lines: [
      'Patience, ember. Cold is only the slow road to stillness.',
      'I have watched this dark for a thousand years. It has weaknesses. Freeze them.',
      'Every flame needs a little frost, to know its own heat.',
      'Breathe. Aim. Strike. Then let them shatter.',
      'The night is long. Let us make it longer for them.',
      'Even fire can learn the virtue of stillness.',
    ],
  },
  serpent: {
    id: 'serpent', name: 'The Serpent', epithet: 'Constellation of the Bloom', element: 'Bloom', color: PATRON_COLORS.serpent,
    blurb: 'Blight that festers, spreads and renews.',
    lines: [
      'Ssso small, and ssso bright. Let me help you grow.',
      'Rot is only life in a hurry, little ember.',
      'A bite need not kill quickly. It need only kill.',
      'Shed your fear like an old skin. Take my gift.',
      'Everything that grows, devours. You will learn.',
      'Patience is a poison too. The ssslowest one.',
    ],
  },
  moth: {
    id: 'moth', name: 'The Moth', epithet: 'Constellation of the Eclipse', element: 'Eclipse', color: PATRON_COLORS.moth,
    blurb: 'Critical strikes and delayed, ruinous Hexes.',
    lines: [
      'Oh... you are so warm. Let me stay near. Just a little.',
      'Every moth dreams of a flame like you. Do not go out before I wake.',
      'In the dark, the sharpest edge is the one no one sees.',
      'I will lend you my shadow. Give it back... someday.',
      'Burn brighter, please. I can almost remember the sun.',
      'Mmm. Closer. Closer. There.',
    ],
  },
};
const PATRON_IDS = Object.keys(PATRONS);

const RARITY = [
  { id: 'common', name: 'Common', color: '#e9e1d3' },
  { id: 'rare', name: 'Rare', color: '#62b4ff' },
  { id: 'epic', name: 'Epic', color: '#c77dff' },
  { id: 'legendary', name: 'Legendary', color: '#ffb347' },
  { id: 'conjunction', name: 'Conjunction', color: '#ff9ad5' },
];

const SLOT_NAMES = { attack: 'Attack', special: 'Special', cast: 'Cast', dash: 'Dash', passive: 'Passive' };

const BASE_STATS = {
  maxHp: 80, speed: 255, damage: 1, attackDmg: 1, specialDmg: 1, castDmg: 1,
  crit: 0.03, critMult: 2, slotCrit: {}, knockMult: {},
  dashCharges: 1, dashRecharge: 0.5,
  castCharges: 3, castRegen: 3.4,
  evade: 0, blightBase: 3, blightMult: 1, blightDps: 3, blightMax: 8, chainBonus: 0, lightningMult: 1, freezeDur: 1.5,
  chillDmgReduce: 0, barrierMax: 0, barrierRecharge: 0, dashTrample: 0, dashThunder: 0,
  goldMult: 1, healMult: 1,
};

function cloneStats(s) {
  const o = Object.assign({}, s);
  o.slotCrit = Object.assign({}, s.slotCrit);
  o.knockMult = Object.assign({}, s.knockMult);
  return o;
}

// helpers for requirements
const hasAnyOf = (b, ids) => ids.some((id) => b.has(id));
const CHILL_SOURCES = ['owl_attack', 'owl_special', 'owl_cast', 'owl_dash'];
const BLIGHT_SOURCES = ['serpent_attack', 'serpent_special', 'serpent_cast', 'serpent_dash'];
const LIGHTNING_SOURCES = ['hound_attack', 'hound_special', 'hound_cast', 'hound_dash', 'hound_endless', 'hound_ward'];
const KNOCK_SOURCES = ['stag_attack', 'stag_special', 'stag_cast'];

// shared swing-limited trigger (so one sweeping blow doesn't spawn 8 storms)
function swingAllow(ctx, key, max) {
  const sw = ctx.o && ctx.o.swing;
  if (!sw) return true;
  sw[key] = (sw[key] || 0) + 1;
  return sw[key] <= max;
}

const BLESSINGS = [
  // ---------------------------------------------------------------- STAG
  {
    id: 'stag_attack', patron: 'stag', slot: 'attack', name: 'Galeforce Strikes',
    desc: 'Your Attack deals <b>+{dmg}%</b> damage and blasts foes back.',
    vals: { dmg: [30, 45, 60] }, lvl: { dmg: 10 },
    stats(s, v) { s.attackDmg *= 1 + v.dmg / 100; s.knockMult.attack = 2.6; },
    onHit(ctx) { G.scene.particles.burst(ctx.e.x, ctx.e.y - 10, 4, { color: '#8ff5d2', speed: 200, life: 0.3, size: 2, type: 'spark', angle: ctx.angle, spread: 0.6 }); },
  },
  {
    id: 'stag_special', patron: 'stag', slot: 'special', name: 'Rending Gust',
    desc: 'Your Special deals <b>+{dmg}%</b> damage and hurls foes away.',
    vals: { dmg: [40, 60, 80] }, lvl: { dmg: 12 },
    stats(s, v) { s.specialDmg *= 1 + v.dmg / 100; s.knockMult.special = 3; },
  },
  {
    id: 'stag_cast', patron: 'stag', slot: 'cast', name: 'Whirlwind',
    desc: 'Your Cast becomes a roaming whirlwind that drags foes in, striking for <b>{dmg}</b> damage again and again.',
    vals: { dmg: [10, 14, 18] }, lvl: { dmg: 3 }, cast: 'whirlwind',
  },
  {
    id: 'stag_dash', patron: 'stag', slot: 'dash', name: 'Tailwind',
    desc: 'Gain <b>+1 Dash</b>. After dashing, move <b>+{spd}%</b> faster for 1.5s.',
    vals: { spd: [20, 30, 40] }, lvl: { spd: 8 },
    stats(s) { s.dashCharges += 1; },
    onDash(p, v) { p.speedBuffT = 1.5; p.speedBuff = v.spd / 100; },
  },
  {
    id: 'stag_fleet', patron: 'stag', slot: 'passive', name: 'Fleetfoot',
    desc: 'You move <b>+{spd}%</b> faster.',
    vals: { spd: [10, 15, 20] }, lvl: { spd: 4 },
    stats(s, v) { s.speed *= 1 + v.spd / 100; },
  },
  {
    id: 'stag_wall', patron: 'stag', slot: 'passive', name: 'Wallbreaker',
    desc: 'Foes you knock into walls take <b>{dmg}</b> damage.',
    vals: { dmg: [40, 60, 80] }, lvl: { dmg: 15 },
    requires: (b) => hasAnyOf(b, KNOCK_SOURCES),
  },
  {
    id: 'stag_evade', patron: 'stag', slot: 'passive', name: 'Second Wind',
    desc: '<b>{pct}%</b> chance to evade incoming damage entirely.',
    vals: { pct: [8, 12, 16] }, lvl: { pct: 3 },
    stats(s, v) { s.evade += v.pct / 100; },
  },
  {
    id: 'stag_stampede', patron: 'stag', slot: 'passive', legendary: true, name: 'Stampede',
    desc: 'Your Dash tramples foes in your path for <b>{dmg}</b> damage and flings them aside.',
    vals: { dmg: [45] }, lvl: { dmg: 10 },
    requires: (b) => b.has('stag_dash') && b.patronCount('stag') >= 2,
    stats(s, v) { s.dashTrample = v.dmg; },
  },

  // ---------------------------------------------------------------- HOUND
  {
    id: 'hound_attack', patron: 'hound', slot: 'attack', name: 'Thunder Fangs',
    desc: 'Your Attack arcs chain lightning to <b>{n}</b> nearby foes for <b>{dmg}</b> damage.',
    vals: { dmg: [10, 14, 18], n: [2, 2, 3] }, lvl: { dmg: 3 },
    onHit(ctx, v) { if (swingAllow(ctx, 'chain', 2)) chainLightning(ctx.e, v.dmg, v.n); },
  },
  {
    id: 'hound_special', patron: 'hound', slot: 'special', name: 'Skyfall',
    desc: 'Your Special calls down a lightning strike for <b>{dmg}</b> damage.',
    vals: { dmg: [30, 45, 60] }, lvl: { dmg: 10 },
    onHit(ctx, v) { if (swingAllow(ctx, 'sky', 3)) { const e = ctx.e; G.scene.after(0.06, () => strikeLightning(e.x, e.y, v.dmg, 55)); } },
  },
  {
    id: 'hound_cast', patron: 'hound', slot: 'cast', name: 'Ball Lightning',
    desc: 'Your Cast becomes a slow orb that zaps every foe near it for <b>{dmg}</b> damage.',
    vals: { dmg: [9, 12, 15] }, lvl: { dmg: 3 }, cast: 'ballLightning',
  },
  {
    id: 'hound_dash', patron: 'hound', slot: 'dash', name: 'Static Step',
    desc: 'Dashing leaves a spark that strikes nearby foes for <b>{dmg}</b> damage.',
    vals: { dmg: [20, 30, 40] }, lvl: { dmg: 8 },
    onDash(p, v, sx, sy) {
      G.scene.addEffect(FX.flash(sx, sy - 6, 40, '#fff27a', 0.2));
      G.scene.after(0.18, () => { if (enemiesInRadius(sx, sy, 75).length) strikeLightning(sx, sy, v.dmg, 75); else G.scene.addEffect(FX.ring(sx, sy, 4, 40, 0.25, '#fff27a', 2)); });
    },
  },
  {
    id: 'hound_conductor', patron: 'hound', slot: 'passive', name: 'Conductor',
    desc: 'Chain lightning jumps to <b>+{n}</b> more foes.',
    vals: { n: [1, 1, 2] }, lvl: {},
    requires: (b) => b.has('hound_attack') || b.has('hound_cast'),
    stats(s, v) { s.chainBonus += v.n; },
  },
  {
    id: 'hound_volt', patron: 'hound', slot: 'passive', name: 'High Voltage',
    desc: 'Your lightning deals <b>+{pct}%</b> damage.',
    vals: { pct: [25, 40, 55] }, lvl: { pct: 10 },
    requires: (b) => hasAnyOf(b, LIGHTNING_SOURCES),
    stats(s, v) { s.lightningMult *= 1 + v.pct / 100; },
  },
  {
    id: 'hound_ward', patron: 'hound', slot: 'passive', name: 'Storm Ward',
    desc: 'When you take damage, lightning strikes up to 3 nearby foes for <b>{dmg}</b>.',
    vals: { dmg: [35, 50, 65] }, lvl: { dmg: 12 },
    onHurt(dmg, o, v) {
      const p = G.player;
      const targets = enemiesInRadius(p.x, p.y, 320).sort((a, b) => dist2(p.x, p.y, a.x, a.y) - dist2(p.x, p.y, b.x, b.y)).slice(0, 3);
      targets.forEach((e, i) => G.scene.after(0.08 * i, () => strikeLightning(e.x, e.y, v.dmg, 45)));
    },
  },
  {
    id: 'hound_endless', patron: 'hound', slot: 'passive', legendary: true, name: 'Endless Storm',
    desc: 'Every 1.6s, lightning strikes a random nearby foe for <b>{dmg}</b> damage.',
    vals: { dmg: [35] }, lvl: { dmg: 8 },
    requires: (b) => b.patronCount('hound') >= 2,
    tick(dt, v, entry) {
      entry.t = (entry.t || 0) + dt;
      if (entry.t < 1.6) return;
      entry.t = 0;
      const p = G.player;
      const list = enemiesInRadius(p.x, p.y, 520);
      if (list.length) { const e = pick(list); strikeLightning(e.x, e.y, v.dmg, 50); }
    },
  },

  // ---------------------------------------------------------------- OWL
  {
    id: 'owl_attack', patron: 'owl', slot: 'attack', name: 'Rime Talons',
    desc: 'Your Attack deals <b>+{dmg}%</b> damage and inflicts <b>Chill</b>.',
    vals: { dmg: [10, 15, 20] }, lvl: { dmg: 5 },
    stats(s, v) { s.attackDmg *= 1 + v.dmg / 100; },
    onHit(ctx) { applyChill(ctx.e, 1); },
  },
  {
    id: 'owl_special', patron: 'owl', slot: 'special', name: 'Frost Feather',
    desc: 'Your Special deals <b>+{dmg}%</b> damage and inflicts <b>2 Chill</b>.',
    vals: { dmg: [20, 30, 40] }, lvl: { dmg: 8 },
    stats(s, v) { s.specialDmg *= 1 + v.dmg / 100; },
    onHit(ctx) { applyChill(ctx.e, 2); },
  },
  {
    id: 'owl_cast', patron: 'owl', slot: 'cast', name: 'Hailstone',
    desc: 'Your Cast bursts into a frost nova for <b>{dmg}</b> damage, inflicting <b>3 Chill</b>.',
    vals: { dmg: [40, 55, 70] }, lvl: { dmg: 10 }, cast: 'hailstone',
  },
  {
    id: 'owl_dash', patron: 'owl', slot: 'dash', name: 'Glacial Step',
    desc: 'Dashing leaves a frost burst that deals <b>{dmg}</b> damage and inflicts <b>2 Chill</b>.',
    vals: { dmg: [12, 18, 24] }, lvl: { dmg: 5 },
    onDash(p, v, sx, sy) { frostNova(sx, sy, 80, v.dmg, 2, 'dash'); },
  },
  {
    id: 'owl_shatter', patron: 'owl', slot: 'passive', name: 'Shatter',
    desc: '<b>Frozen</b> foes take <b>+{pct}%</b> damage. Slaying a Frozen foe makes it explode for <b>{dmg}</b>.',
    vals: { pct: [30, 45, 60], dmg: [40, 50, 60] }, lvl: { pct: 10, dmg: 10 },
    requires: (b) => hasAnyOf(b, CHILL_SOURCES),
    modDamage(ctx, v) { if (ctx.e.st.frozen > 0) ctx.mult *= 1 + v.pct / 100; },
    onKill(e, ctx, v) {
      if (e.st.frozen <= 0) return;
      Sound.play('shatter');
      G.scene.particles.burst(e.x, e.y - 10, 26, { color: ['#e8f7ff', '#9fd8ff', '#ffffff'], speed: 300, life: 0.6, size: 5, type: 'shard', drag: 3 });
      G.scene.addEffect(FX.ring(e.x, e.y, 8, 95, 0.35, '#cfeeff', 5));
      aoeDamage(e.x, e.y, 95, v.dmg, { source: 'frost', secondary: true, exclude: new Set([e]) });
    },
  },
  {
    id: 'owl_patience', patron: 'owl', slot: 'passive', name: "Winter's Patience",
    desc: '<b>Chilled</b> foes deal <b>{pct}%</b> less damage.',
    vals: { pct: [15, 22, 30] }, lvl: { pct: 5 },
    requires: (b) => hasAnyOf(b, CHILL_SOURCES),
    stats(s, v) { s.chillDmgReduce = Math.min(0.7, v.pct / 100); },
  },
  {
    id: 'owl_ward', patron: 'owl', slot: 'passive', name: 'Hoarfrost Ward',
    desc: 'Begin each chamber with a frost ward that blocks one hit. It reforms after <b>{sec}s</b>.',
    vals: { sec: [24, 18, 12] }, lvl: { sec: -2 },
    stats(s, v) { s.barrierMax = 1; s.barrierRecharge = Math.max(5, v.sec); },
  },
  {
    id: 'owl_zero', patron: 'owl', slot: 'passive', legendary: true, name: 'Absolute Zero',
    desc: 'When a foe <b>Freezes</b>, nearby foes Freeze with it. Freeze lasts <b>50%</b> longer.',
    vals: {}, lvl: {},
    requires: (b) => b.patronCount('owl') >= 2 && hasAnyOf(b, CHILL_SOURCES),
    stats(s) { s.freezeDur = 2.25; },
  },

  // ---------------------------------------------------------------- SERPENT
  {
    id: 'serpent_attack', patron: 'serpent', slot: 'attack', name: 'Venom Fangs',
    desc: 'Your Attack inflicts <b>Blight</b>, dealing <b>{dps}</b> damage per second per stack.',
    vals: { dps: [3, 4, 5] }, lvl: { dps: 1 },
    stats(s, v) { s.blightBase = Math.max(s.blightBase, v.dps); },
    onHit(ctx) { applyBlight(ctx.e, 1); },
  },
  {
    id: 'serpent_special', patron: 'serpent', slot: 'special', name: 'Spitting Bloom',
    desc: 'Your Special inflicts <b>3 Blight</b> stacks, each dealing <b>{dps}</b> damage per second.',
    vals: { dps: [3, 4, 5] }, lvl: { dps: 1 },
    stats(s, v) { s.blightBase = Math.max(s.blightBase, v.dps); },
    onHit(ctx) { applyBlight(ctx.e, 3); },
  },
  {
    id: 'serpent_cast', patron: 'serpent', slot: 'cast', name: 'Spore Pod',
    desc: 'Your Cast bursts into a toxic cloud for 4s, Blighting foes inside (<b>{dps}</b>/s per stack).',
    vals: { dps: [3, 4, 5] }, lvl: { dps: 1 }, cast: 'sporePod',
    stats(s, v) { s.blightBase = Math.max(s.blightBase, v.dps); },
  },
  {
    id: 'serpent_dash', patron: 'serpent', slot: 'dash', name: 'Bramble Trail',
    desc: 'Dashing leaves a trail of thorns that deals <b>{dmg}</b> damage and inflicts Blight.',
    vals: { dmg: [14, 20, 26] }, lvl: { dmg: 5 },
    onDash(p, v, sx, sy, ex, ey) { G.scene.addEffect(makeThorns(sx, sy, ex, ey, v.dmg)); },
  },
  {
    id: 'serpent_virulence', patron: 'serpent', slot: 'passive', name: 'Virulence',
    desc: 'Blight stacks up to <b>+{n}</b> more times and deals <b>+{pct}%</b> damage.',
    vals: { n: [3, 4, 5], pct: [20, 30, 40] }, lvl: { pct: 10 },
    requires: (b) => hasAnyOf(b, BLIGHT_SOURCES),
    stats(s, v) { s.blightMax += v.n; s.blightMult *= 1 + v.pct / 100; },
  },
  {
    id: 'serpent_regrowth', patron: 'serpent', slot: 'passive', name: 'Regrowth',
    desc: 'Restore <b>{hp}</b> Health whenever you clear a chamber.',
    vals: { hp: [6, 9, 12] }, lvl: { hp: 3 },
    onClear(v) { G.player.heal(v.hp, true); },
  },
  {
    id: 'serpent_contagion', patron: 'serpent', slot: 'passive', name: 'Contagion',
    desc: 'When a <b>Blighted</b> foe dies, its Blight spreads to every foe nearby.',
    vals: {}, lvl: {},
    requires: (b) => hasAnyOf(b, BLIGHT_SOURCES),
    onKill(e) {
      if (e.st.blight <= 0) return;
      const n = Math.max(1, Math.ceil(e.st.blight * 0.75));
      for (const o of enemiesInRadius(e.x, e.y, 160)) {
        if (o === e) continue;
        applyBlight(o, n);
        G.scene.addEffect(FX.bolt(e.x, e.y - 8, o.x, o.y - 8, '#7cf08e', 0.3, 1.5));
      }
      G.scene.particles.burst(e.x, e.y - 8, 14, { color: ['#7cf08e', '#3a8a40'], speed: 150, life: 0.6, size: 4 });
    },
  },
  {
    id: 'serpent_ouro', patron: 'serpent', slot: 'passive', legendary: true, name: 'Ouroboros',
    desc: 'Foes at maximum Blight burst for <b>{burst}</b> damage, then keep 3 stacks.',
    vals: { burst: [80] }, lvl: { burst: 20 },
    requires: (b) => b.patronCount('serpent') >= 2 && hasAnyOf(b, BLIGHT_SOURCES),
  },

  // ---------------------------------------------------------------- MOTH
  {
    id: 'moth_attack', patron: 'moth', slot: 'attack', name: 'Umbral Wings',
    desc: 'Your Attack gains <b>+{pct}%</b> Critical chance.',
    vals: { pct: [12, 18, 24] }, lvl: { pct: 3 },
    stats(s, v) { s.slotCrit.attack = (s.slotCrit.attack || 0) + v.pct / 100; },
  },
  {
    id: 'moth_special', patron: 'moth', slot: 'special', name: 'Dusk Mark',
    desc: 'Your Special <b>Hexes</b> foes. After 1.2s the Hex bursts for <b>{dmg}</b> damage.',
    vals: { dmg: [50, 70, 90] }, lvl: { dmg: 15 },
    onHit(ctx, v) { applyHex(ctx.e, v.dmg); },
  },
  {
    id: 'moth_cast', patron: 'moth', slot: 'cast', name: 'Black Sun',
    desc: 'Your Cast becomes a void that pulls foes in, then collapses for <b>{dmg}</b> damage.',
    vals: { dmg: [60, 80, 100] }, lvl: { dmg: 15 }, cast: 'blackSun',
  },
  {
    id: 'moth_dash', patron: 'moth', slot: 'dash', name: 'Veilstep',
    desc: 'Your first hit within 1s of dashing deals <b>+{pct}%</b> damage.',
    vals: { pct: [50, 75, 100] }, lvl: { pct: 15 },
    onDash(p) { p.veilT = 1.0; },
    modDamage(ctx, v) {
      const p = G.player;
      if (p && p.veilT > 0 && SLOT_SOURCES.has(ctx.source)) { ctx.mult *= 1 + v.pct / 100; p.veilT = 0; ctx.veil = true; G.scene.addEffect(FX.flash(ctx.e.x, ctx.e.y - 10, 60, '#c99bff', 0.2)); }
    },
  },
  {
    id: 'moth_hunger', patron: 'moth', slot: 'passive', name: "Moth's Hunger",
    desc: 'Critical hits deal <b>+{pct}%</b> damage.',
    vals: { pct: [30, 45, 60] }, lvl: { pct: 10 },
    stats(s, v) { s.critMult += v.pct / 100; },
  },
  {
    id: 'moth_lastlight', patron: 'moth', slot: 'passive', name: 'Last Light',
    desc: 'While below 40% Health, you deal <b>+{pct}%</b> damage.',
    vals: { pct: [25, 35, 50] }, lvl: { pct: 8 },
    modDamage(ctx, v) { const p = G.player; if (p && p.hp < p.maxHp * 0.4) ctx.mult *= 1 + v.pct / 100; },
  },
  {
    id: 'moth_eclipse', patron: 'moth', slot: 'passive', name: 'Eclipse',
    desc: 'Hex bursts deal <b>+{bonus}%</b> damage and leap to a nearby foe.',
    vals: { bonus: [30, 45, 60] }, lvl: { bonus: 10 },
    requires: (b) => b.has('moth_special') || b.has('moth_total'),
  },
  {
    id: 'moth_total', patron: 'moth', slot: 'passive', legendary: true, name: 'Total Eclipse',
    desc: 'Your Critical hits <b>Hex</b> foes for <b>{dmg}</b> damage.',
    vals: { dmg: [60] }, lvl: { dmg: 15 },
    requires: (b) => b.patronCount('moth') >= 2,
    onHit(ctx, v) { if (ctx.crit) applyHex(ctx.e, v.dmg); },
  },
];

// ---------------------------------------------------------------- CONJUNCTIONS
const DUOS = [
  {
    id: 'duo_thunderhooves', patrons: ['stag', 'hound'], name: 'Thunderhooves',
    desc: 'Every foe you Dash past is struck by lightning for <b>{dmg}</b> damage.',
    vals: { dmg: [30] }, lvl: { dmg: 8 },
    requires: (b) => b.patronCount('stag') > 0 && hasAnyOf(b, LIGHTNING_SOURCES),
    stats(s, v) { s.dashThunder = v.dmg; },
  },
  {
    id: 'duo_hailstorm', patrons: ['hound', 'owl'], name: 'Hailstorm',
    desc: 'Your lightning inflicts <b>Chill</b>.', vals: {}, lvl: {},
    requires: (b) => hasAnyOf(b, LIGHTNING_SOURCES) && b.patronCount('owl') > 0,
  },
  {
    id: 'duo_frostbloom', patrons: ['owl', 'serpent'], name: 'Frostbloom',
    desc: 'Blight damage inflicts <b>Chill</b>, and <b>Frozen</b> foes take double Blight damage.', vals: {}, lvl: {},
    requires: (b) => hasAnyOf(b, BLIGHT_SOURCES) && b.patronCount('owl') > 0,
    modDamage(ctx) { if (ctx.source === 'blight' && ctx.e.st.frozen > 0) ctx.mult *= 2; },
  },
  {
    id: 'duo_nightshade', patrons: ['serpent', 'moth'], name: 'Nightshade',
    desc: 'Blight damage can be <b>Critical</b>, and you gain <b>+{pct}%</b> Critical chance.',
    vals: { pct: [8] }, lvl: { pct: 2 },
    requires: (b) => hasAnyOf(b, BLIGHT_SOURCES) && b.patronCount('moth') > 0,
    stats(s, v) { s.crit += v.pct / 100; },
  },
  {
    id: 'duo_moonlit', patrons: ['moth', 'stag'], name: 'Moonlit Gale',
    desc: 'Critical hits deal <b>+{pct}%</b> damage and blast foes away.',
    vals: { pct: [30] }, lvl: { pct: 8 },
    requires: (b) => b.patronCount('moth') > 0 && b.patronCount('stag') > 0,
    stats(s, v) { s.critMult += v.pct / 100; },
    onHit(ctx) { if (ctx.crit && !ctx.e.immovable) { const a = ctx.angle !== undefined ? ctx.angle : angleTo(G.player.x, G.player.y, ctx.e.x, ctx.e.y); ctx.e.kx += Math.cos(a) * 420 / ctx.e.mass; ctx.e.ky += Math.sin(a) * 420 / ctx.e.mass; ctx.e.slamT = 0.4; } },
  },
  {
    id: 'duo_starfall', patrons: ['hound', 'moth'], name: 'Starfall',
    desc: 'Hex bursts call down lightning for <b>{dmg}</b> damage.',
    vals: { dmg: [40] }, lvl: { dmg: 10 },
    requires: (b) => (b.has('moth_special') || b.has('moth_total')) && b.patronCount('hound') > 0,
  },
  {
    id: 'duo_northwind', patrons: ['owl', 'stag'], name: 'Northwind',
    desc: 'Foes you knock into walls are instantly <b>Frozen</b> and take <b>{dmg}</b> damage.',
    vals: { dmg: [30] }, lvl: { dmg: 10 },
    requires: (b) => hasAnyOf(b, KNOCK_SOURCES) && b.patronCount('owl') > 0,
  },
  {
    id: 'duo_acidrain', patrons: ['serpent', 'hound'], name: 'Acid Rain',
    desc: 'Your lightning inflicts <b>2 Blight</b>.', vals: {}, lvl: {},
    requires: (b) => hasAnyOf(b, LIGHTNING_SOURCES) && b.patronCount('serpent') > 0,
  },
  {
    id: 'duo_seedwind', patrons: ['stag', 'serpent'], name: 'Seed on the Wind',
    desc: 'Foes you knock back gain <b>2 Blight</b>, and Blight lasts much longer.', vals: {}, lvl: {},
    requires: (b) => hasAnyOf(b, KNOCK_SOURCES) && b.patronCount('serpent') > 0,
    onHit(ctx) { if ((ctx.source === 'attack' || ctx.source === 'special') && ctx.o.knock) { applyBlight(ctx.e, 2); ctx.e.st.blightT = 9; } },
  },
  {
    id: 'duo_starless', patrons: ['owl', 'moth'], name: 'Starless Night',
    desc: 'Critical hits inflict <b>2 Chill</b>. <b>Frozen</b> foes are always struck Critically.', vals: {}, lvl: {},
    requires: (b) => b.patronCount('owl') > 0 && b.patronCount('moth') > 0,
    modDamage(ctx) { if (ctx.e.st.frozen > 0 && !DOT_SOURCES.has(ctx.source)) ctx.o.crit = true; },
    onHit(ctx) { if (ctx.crit) applyChill(ctx.e, 2); },
  },
];
for (const d of DUOS) { d.duo = true; d.slot = 'passive'; d.patron = d.patrons[0]; }

const BLESSING_BY_ID = {};
for (const b of BLESSINGS) BLESSING_BY_ID[b.id] = b;
for (const d of DUOS) BLESSING_BY_ID[d.id] = d;

// secondary-effect hooks living outside the blessing list
const SECONDARY_HOOKS = {
  lightning(e) {
    const b = G.run && G.run.build;
    if (!b) return;
    if (b.has('duo_acidrain')) applyBlight(e, 2);
  },
};

function computeVals(def, rarity, level) {
  const out = {};
  for (const k in def.vals) {
    const arr = def.vals[k];
    const base = arr[Math.min(rarity, arr.length - 1)];
    const inc = (def.lvl && def.lvl[k]) || 0;
    out[k] = Math.round((base + inc * (level - 1)) * 10) / 10;
  }
  return out;
}

function blessingText(def, vals) {
  return def.desc.replace(/\{(\w+)\}/g, (m, k) => (vals[k] !== undefined ? vals[k] : m));
}

// ---- thorn trail & frost nova helpers used by dash blessings ----------------
function frostNova(x, y, r, dmg, chill, source = 'nova') {
  const sc = G.scene;
  Sound.play('freeze');
  sc.addEffect(FX.ring(x, y, 6, r, 0.35, '#cfeeff', 5));
  sc.addEffect(FX.flash(x, y, r * 0.9, '#9fd8ff', 0.25));
  sc.particles.burst(x, y, 18, { color: ['#e8f7ff', '#9fd8ff'], speed: r * 2.6, life: 0.4, size: 3.5, type: 'shard', drag: 5 });
  const o = source === 'cast' || source === 'dash' ? { source } : { source: 'nova', secondary: true };
  o.each = (e) => applyChill(e, chill);
  aoeDamage(x, y, r, dmg, o);
}

function makeThorns(sx, sy, ex, ey, dmg) {
  const len = Math.max(1, dist(sx, sy, ex, ey));
  const n = Math.max(3, Math.floor(len / 26));
  const spikes = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    spikes.push({ x: lerp(sx, ex, t) + rand(-8, 8), y: lerp(sy, ey, t) + rand(-8, 8), a: rand(TAU), s: rand(0.7, 1.2) });
  }
  const hitT = new Map();
  return {
    layer: 'floor', t: 0, dur: 3.5,
    update(dt, sc) {
      this.t += dt;
      for (const e of sc.enemies) {
        if (e.dead || e.spawning || e.flying) continue;
        if (distToSegment(e.x, e.y, sx, sy, ex, ey) > e.r + 14) continue;
        const last = hitT.get(e) || -9;
        if (this.t - last < 0.6) continue;
        hitT.set(e, this.t);
        hitEnemy(e, dmg, { source: 'thorns', secondary: true });
        applyBlight(e, 1);
      }
      return this.t < this.dur;
    },
    draw(ctx) {
      const a = Math.min(1, (this.dur - this.t) / 0.6) * Math.min(1, this.t / 0.1);
      ctx.save();
      ctx.globalAlpha = a;
      for (const s of spikes) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.fillStyle = '#2f5a2a';
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const aa = (k / 5) * TAU;
          ctx.lineTo(Math.cos(aa) * 9 * s.s, Math.sin(aa) * 9 * s.s);
          ctx.lineTo(Math.cos(aa + 0.6) * 3, Math.sin(aa + 0.6) * 3);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9cf08e';
        ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
  };
}

// ---------------------------------------------------------------------------
// Build: owned blessings + forge upgrades -> stats & hooks
// ---------------------------------------------------------------------------
class Build {
  constructor(run) {
    this.run = run;
    this.list = [];
    this.byId = new Map();
    this.slots = { attack: null, special: null, cast: null, dash: null };
    this.forge = [];
    this.stats = cloneStats(BASE_STATS);
  }
  has(id) { return this.byId.has(id); }
  get(id) { return this.byId.get(id); }
  vals(id) { const b = this.byId.get(id); return b ? b.vals : null; }
  patronCount(p) {
    let n = 0;
    for (const b of this.list) if (b.def.patron === p || (b.def.patrons && b.def.patrons.includes(p))) n++;
    return n;
  }
  replacing(def) {
    if (!def.slot || def.slot === 'passive') return null;
    const cur = this.slots[def.slot];
    return cur ? this.byId.get(cur) : null;
  }
  add(def, rarity) {
    if (def.slot && def.slot !== 'passive') {
      const prev = this.slots[def.slot];
      if (prev) this.remove(prev);
      this.slots[def.slot] = def.id;
    }
    const entry = { id: def.id, def, rarity, level: 1, vals: computeVals(def, rarity, 1) };
    this.list.push(entry);
    this.byId.set(def.id, entry);
    this.recalc();
    return entry;
  }
  remove(id) {
    const e = this.byId.get(id);
    if (!e) return;
    this.byId.delete(id);
    this.list = this.list.filter((x) => x !== e);
    for (const k in this.slots) if (this.slots[k] === id) this.slots[k] = null;
    // dependents that no longer qualify stay (as in many roguelites), only stats recalc
    this.recalc();
  }
  levelUp(id, n = 1) {
    const e = this.byId.get(id);
    if (!e) return;
    e.level += n;
    e.vals = computeVals(e.def, e.rarity, e.level);
    this.recalc();
  }
  addForge(id) { if (!this.forge.includes(id)) this.forge.push(id); this.recalc(); }
  hasForge(id) { return this.forge.includes(id); }

  recalc() {
    const s = cloneStats(BASE_STATS);
    s.maxHp += Save.rank('heart') * 10;
    s.damage += Save.rank('might') * 0.06;
    s.dashCharges += Save.rank('dash');
    s.castCharges += Save.rank('cast');
    s.goldMult += Save.rank('gold') * 0.2;
    if (this.run) s.maxHp += this.run.maxHpBonus;
    // slot blessings first, passives after (so multipliers stack on bases)
    const ordered = this.list.slice().sort((a, b) => (a.def.slot === 'passive' ? 1 : 0) - (b.def.slot === 'passive' ? 1 : 0));
    for (const b of ordered) if (b.def.stats) b.def.stats(s, b.vals);
    for (const id of this.forge) { const f = FORGE_BY_ID[id]; if (f && f.stats) f.stats(s); }
    s.blightDps = s.blightBase * s.blightMult;
    this.stats = s;
    if (G.player && G.player.build === this) G.player.applyStats(s);
  }

  modDamage(ctx) { for (const b of this.list) if (b.def.modDamage) b.def.modDamage(ctx, b.vals); }
  onHit(ctx, secondary) {
    if (secondary) {
      if (ctx.source === 'lightning') SECONDARY_HOOKS.lightning(ctx.e);
      return;
    }
    for (const b of this.list) {
      const d = b.def;
      if (!d.onHit) continue;
      if (d.slot !== 'passive' && d.slot !== ctx.source) continue;
      d.onHit(ctx, b.vals, b);
      if (ctx.e.dead) break;
    }
  }
  onKill(e, ctx) { for (const b of this.list) if (b.def.onKill) b.def.onKill(e, ctx, b.vals); }
  onHurt(dmg, o) { for (const b of this.list) if (b.def.onHurt) b.def.onHurt(dmg, o, b.vals); }
  onDash(p, sx, sy, ex, ey) { for (const b of this.list) if (b.def.onDash) b.def.onDash(p, b.vals, sx, sy, ex, ey); }
  onClear() { for (const b of this.list) if (b.def.onClear) b.def.onClear(b.vals); }
  tick(dt) { for (const b of this.list) if (b.def.tick) b.def.tick(dt, b.vals, b); }
}

// ---------------------------------------------------------------------------
// Offering logic
// ---------------------------------------------------------------------------
function rollRarity() {
  const luck = Save.rank('luck');
  const r = Math.random();
  const epic = 0.05 + luck * 0.035 + (G.run ? G.run.rarityBonus : 0) * 0.5;
  const rare = 0.2 + luck * 0.06 + (G.run ? G.run.rarityBonus : 0);
  if (r < epic) return 2;
  if (r < epic + rare) return 1;
  return 0;
}

function offerBlessings(patronId, build, n = 3) {
  const pool = BLESSINGS.filter((b) => b.patron === patronId && !build.has(b.id) && (!b.requires || b.requires(build)));
  const normal = pool.filter((b) => !b.legendary);
  const legends = pool.filter((b) => b.legendary);
  const duos = DUOS.filter((d) => d.patrons.includes(patronId) && !build.has(d.id) && d.requires(build));
  const picks = [];
  const avail = normal.slice();
  const weight = (b) => {
    if (b.slot === 'passive') return 0.9;
    return build.slots[b.slot] ? 0.6 : 1.7;
  };
  while (picks.length < n && avail.length) {
    const b = weightedPick(avail, weight);
    picks.push(b);
    avail.splice(avail.indexOf(b), 1);
  }
  const specials = [];
  if (duos.length && chance(0.4)) specials.push(pick(duos));
  if (legends.length && chance(0.22)) specials.push(pick(legends));
  for (const sp of specials) {
    if (picks.length < n) picks.push(sp);
    else picks[randInt(0, picks.length - 1)] = sp;
  }
  // de-duplicate, keep order
  const seen = new Set();
  const out = [];
  for (const d of picks) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ def: d, rarity: d.duo ? 4 : d.legendary ? 3 : rollRarity() });
  }
  return out;
}

function offerLevelUps(build, n = 3) {
  const cands = build.list.filter((b) => b.def.lvl && Object.keys(b.def.lvl).length > 0);
  shuffle(cands);
  return cands.slice(0, n);
}
