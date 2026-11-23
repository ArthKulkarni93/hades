'use strict';
// ---------------------------------------------------------------------------
// Persistent meta-progression (localStorage, always wrapped in try/catch).
// ---------------------------------------------------------------------------

const SAVE_KEY = 'emberwake.save.v1';

const Save = {
  data: null,

  defaults() {
    return {
      version: 1,
      ash: 0,
      totalAsh: 0,
      upgrades: {},
      weapons: ['blade'],
      weapon: 'blade',
      runs: 0,
      deaths: 0,
      wins: 0,
      bestTime: 0,
      bestDepth: 0,
      kills: 0,
      flags: {},
      lastDeath: null,
      lastRun: null,
      bossKills: {},
      heat: 0,
      maxHeat: 0,
      settings: { sfx: 0.7, music: 0.45, shake: 1, numbers: true, assist: false, fps: false },
    };
  },

  load() {
    const def = this.defaults();
    let d = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) d = JSON.parse(raw);
    } catch (e) { d = null; }
    if (d && typeof d === 'object') {
      this.data = Object.assign(def, d);
      this.data.settings = Object.assign(this.defaults().settings, d.settings || {});
      if (!Array.isArray(this.data.weapons) || !this.data.weapons.length) this.data.weapons = ['blade'];
      if (!this.data.weapons.includes(this.data.weapon)) this.data.weapon = this.data.weapons[0];
    } else {
      this.data = def;
    }
    return this.data;
  },

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
  },

  reset() {
    const settings = this.data ? this.data.settings : undefined;
    this.data = this.defaults();
    if (settings) this.data.settings = settings;
    this.save();
  },

  rank(id) { return (this.data && this.data.upgrades[id]) || 0; },
  flag(name) { return !!(this.data && this.data.flags[name]); },
  setFlag(name, v = true) { if (this.data) this.data.flags[name] = v; },
};
