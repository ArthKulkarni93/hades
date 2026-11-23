'use strict';
// ---------------------------------------------------------------------------
// Audio: every sound is synthesized with WebAudio (no asset files).
// Sound  -> one-shot effects
// Music  -> small generative score with intensity layers
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  noiseBuf: null,
  sfxVol: 0.7,
  musicVol: 0.45,
  last: Object.create(null),

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5;
      comp.attack.value = 0.003; comp.release.value = 0.18;
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
      const len = Math.floor(ctx.sampleRate * 2);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      Music.attach(this);
    } catch (e) {
      this.ctx = null;
    }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolumes(sfx, music) { this.sfxVol = sfx; this.musicVol = music; this.applyVolumes(); },
  applyVolumes() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = this.sfxVol * 0.9;
    this.musicBus.gain.value = this.musicVol * 0.55;
  },

  tone(o) {
    const ctx = this.ctx;
    const t0 = (o.at || ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + (o.slide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.a || 0.004, dur = o.dur, v = o.v === undefined ? 0.2 : o.v;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + a);
    if (o.hold && a + o.hold < dur - 0.02) g.gain.setValueAtTime(Math.max(0.0002, v), t0 + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.setValueAtTime(o.ff || 2000, t0);
      if (o.ff2) f.frequency.exponentialRampToValueAtTime(o.ff2, t0 + dur);
      f.Q.value = o.q || 0.8;
      osc.connect(f); node = f;
    }
    node.connect(g);
    g.connect(o.bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  },

  noise(o) {
    const ctx = this.ctx;
    const t0 = (o.at || ctx.currentTime) + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.ff || 2000, t0);
    if (o.ff2) f.frequency.exponentialRampToValueAtTime(o.ff2, t0 + o.dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    const a = o.a || 0.003, v = o.v === undefined ? 0.2 : o.v;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + o.dur + 0.05);
  },

  play(name, opts) {
    if (!this.ctx || this.sfxVol <= 0.001) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = this.ctx.currentTime;
    const th = SFX_THROTTLE[name] !== undefined ? SFX_THROTTLE[name] : 0.025;
    if (this.last[name] !== undefined && now - this.last[name] < th) return;
    this.last[name] = now;
    try { fn(this, opts || {}); } catch (e) { /* never let audio break the game */ }
  },
};

const SFX_THROTTLE = { hit: 0.03, enemyShoot: 0.05, coin: 0.04, zap: 0.06, poison: 0.08, step: 0.1, armor: 0.05, tick: 0.05, spawn: 0.08, freeze: 0.06 };

const SFX = {
  swing(s, o) {
    const p = o.pitch || 1;
    s.noise({ dur: 0.13, v: 0.13, filter: 'bandpass', ff: 900 * p, ff2: 3200 * p, q: 1.4 });
    s.tone({ f: 240 * p, f2: 120 * p, dur: 0.09, v: 0.04, type: 'triangle' });
  },
  swingHeavy(s) {
    s.noise({ dur: 0.22, v: 0.2, filter: 'bandpass', ff: 500, ff2: 2200, q: 1.2 });
    s.tone({ f: 160, f2: 70, dur: 0.18, v: 0.08, type: 'triangle' });
  },
  hit(s, o) {
    const p = o.pitch || 1;
    s.tone({ f: 190 * p, f2: 55, dur: 0.12, v: 0.32, type: 'sine' });
    s.noise({ dur: 0.06, v: 0.22, filter: 'lowpass', ff: 3500, ff2: 600 });
  },
  crit(s) {
    s.tone({ f: 220, f2: 50, dur: 0.16, v: 0.36 });
    s.noise({ dur: 0.08, v: 0.25, filter: 'highpass', ff: 1800 });
    s.tone({ f: 1500, f2: 900, dur: 0.18, v: 0.09, type: 'triangle' });
    s.tone({ f: 2250, dur: 0.12, v: 0.05, type: 'sine', delay: 0.02 });
  },
  armor(s) {
    s.tone({ f: 880, dur: 0.08, v: 0.07, type: 'square', filter: 'bandpass', ff: 2000, q: 3 });
    s.tone({ f: 1760, f2: 1500, dur: 0.14, v: 0.06, type: 'triangle' });
  },
  armorBreak(s) {
    s.noise({ dur: 0.35, v: 0.3, filter: 'bandpass', ff: 2500, ff2: 600, q: 2 });
    s.tone({ f: 600, f2: 150, dur: 0.3, v: 0.12, type: 'square', filter: 'lowpass', ff: 1800 });
  },
  dash(s) {
    s.noise({ dur: 0.2, v: 0.17, filter: 'bandpass', ff: 700, ff2: 2600, q: 0.9 });
  },
  cast(s) {
    s.tone({ f: 260, f2: 1100, dur: 0.16, v: 0.08, type: 'sawtooth', filter: 'lowpass', ff: 2400 });
    s.noise({ dur: 0.12, v: 0.08, filter: 'highpass', ff: 2500 });
  },
  arrow(s, o) {
    const p = o.power || 0.5;
    s.noise({ dur: 0.1, v: 0.12 + p * 0.1, filter: 'highpass', ff: 2200 });
    s.tone({ f: 900 + p * 500, f2: 380, dur: 0.12, v: 0.06, type: 'triangle' });
  },
  charged(s) { s.tone({ f: 1320, dur: 0.18, v: 0.08, type: 'triangle' }); s.tone({ f: 1980, dur: 0.22, v: 0.05, delay: 0.04 }); },
  disc(s) {
    s.noise({ dur: 0.22, v: 0.1, filter: 'bandpass', ff: 1400, ff2: 2400, q: 4 });
    s.tone({ f: 500, f2: 900, dur: 0.15, v: 0.04, type: 'triangle' });
  },
  catch(s) { s.tone({ f: 700, f2: 1000, dur: 0.07, v: 0.06, type: 'triangle' }); },
  enemyShoot(s) { s.tone({ f: 560, f2: 330, dur: 0.11, v: 0.06, type: 'sine' }); },
  hurt(s) {
    s.tone({ f: 170, f2: 55, dur: 0.3, v: 0.28, type: 'sawtooth', filter: 'lowpass', ff: 900 });
    s.noise({ dur: 0.22, v: 0.3, filter: 'lowpass', ff: 1200, ff2: 300 });
  },
  enemyDie(s, o) {
    const big = o.big ? 1 : 0;
    s.noise({ dur: 0.3 + big * 0.3, v: 0.22 + big * 0.1, filter: 'lowpass', ff: 1800, ff2: 180 });
    s.tone({ f: 240 - big * 80, f2: 45, dur: 0.26 + big * 0.2, v: 0.18 });
  },
  explode(s, o) {
    const sz = o.size || 1;
    s.noise({ dur: 0.55 * sz, v: 0.4, filter: 'lowpass', ff: 2200, ff2: 90 });
    s.tone({ f: 130, f2: 30, dur: 0.5 * sz, v: 0.38 });
  },
  zap(s) {
    for (let i = 0; i < 3; i++) s.noise({ dur: 0.05, v: 0.12, filter: 'highpass', ff: 2600 + Math.random() * 2000, delay: i * 0.03, rate: 0.7 + Math.random() });
    s.tone({ f: 1400, f2: 180, dur: 0.14, v: 0.05, type: 'square', filter: 'lowpass', ff: 3000 });
  },
  thunder(s) {
    s.noise({ dur: 0.08, v: 0.28, filter: 'highpass', ff: 2000 });
    s.noise({ dur: 0.7, v: 0.3, filter: 'lowpass', ff: 900, ff2: 80, delay: 0.03 });
    s.tone({ f: 90, f2: 35, dur: 0.6, v: 0.25 });
  },
  freeze(s) {
    s.tone({ f: 1900, f2: 2600, dur: 0.22, v: 0.06, type: 'triangle' });
    s.tone({ f: 3100, dur: 0.3, v: 0.04, delay: 0.03 });
    s.noise({ dur: 0.15, v: 0.06, filter: 'highpass', ff: 5000 });
  },
  shatter(s) {
    s.noise({ dur: 0.35, v: 0.22, filter: 'highpass', ff: 3000, ff2: 1200 });
    for (let i = 0; i < 3; i++) s.tone({ f: 2000 + Math.random() * 1600, dur: 0.15, v: 0.04, type: 'triangle', delay: i * 0.04 });
  },
  poison(s) {
    s.tone({ f: 330, f2: 520, dur: 0.1, v: 0.05, type: 'sine' });
    s.noise({ dur: 0.08, v: 0.05, filter: 'bandpass', ff: 700, q: 4 });
  },
  hex(s) {
    s.tone({ f: 95, f2: 60, dur: 0.45, v: 0.26 });
    s.tone({ f: 620, f2: 310, dur: 0.3, v: 0.06, type: 'triangle' });
    s.noise({ dur: 0.25, v: 0.12, filter: 'bandpass', ff: 400, ff2: 1600, q: 2 });
  },
  gust(s) { s.noise({ dur: 0.3, v: 0.16, filter: 'bandpass', ff: 400, ff2: 1500, q: 0.6 }); },
  coin(s) {
    s.tone({ f: 1320, dur: 0.06, v: 0.05, type: 'square', filter: 'lowpass', ff: 4000 });
    s.tone({ f: 1980, dur: 0.12, v: 0.05, type: 'square', filter: 'lowpass', ff: 4000, delay: 0.05 });
  },
  pickup(s) {
    [660, 880, 1320].forEach((f, i) => s.tone({ f, dur: 0.18, v: 0.07, type: 'triangle', delay: i * 0.05 }));
  },
  blessing(s) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => s.tone({ f, dur: 1.3, v: 0.06, type: 'sine', a: 0.02, delay: i * 0.06 }));
    s.noise({ dur: 0.8, v: 0.05, filter: 'highpass', ff: 6000, a: 0.1 });
  },
  heal(s) {
    s.tone({ f: 440, f2: 880, dur: 0.45, v: 0.08, type: 'sine', a: 0.02 });
    [880, 1108, 1318].forEach((f, i) => s.tone({ f, dur: 0.3, v: 0.04, type: 'triangle', delay: 0.1 + i * 0.07 }));
  },
  door(s) {
    s.noise({ dur: 0.9, v: 0.25, filter: 'lowpass', ff: 500, ff2: 120 });
    s.tone({ f: 70, f2: 45, dur: 0.9, v: 0.22 });
  },
  unlock(s) {
    s.tone({ f: 440, f2: 880, dur: 0.25, v: 0.07, type: 'triangle' });
    s.tone({ f: 660, f2: 1320, dur: 0.35, v: 0.05, type: 'triangle', delay: 0.08 });
  },
  ui(s) { s.tone({ f: 880, dur: 0.05, v: 0.05, type: 'sine' }); },
  uiMove(s) { s.tone({ f: 620, dur: 0.035, v: 0.03, type: 'sine' }); },
  uiBack(s) { s.tone({ f: 520, f2: 380, dur: 0.07, v: 0.05, type: 'sine' }); },
  deny(s) { s.tone({ f: 180, dur: 0.12, v: 0.08, type: 'square', filter: 'lowpass', ff: 800 }); },
  buy(s) { SFX.coin(s); SFX.pickup(s); },
  spawn(s) {
    s.tone({ f: 180, f2: 520, dur: 0.35, v: 0.04, type: 'triangle' });
    s.noise({ dur: 0.3, v: 0.04, filter: 'bandpass', ff: 600, ff2: 2000, q: 2 });
  },
  warn(s) { s.tone({ f: 320, f2: 520, dur: 0.18, v: 0.045, type: 'triangle' }); },
  slam(s) {
    s.noise({ dur: 0.45, v: 0.38, filter: 'lowpass', ff: 1300, ff2: 80 });
    s.tone({ f: 100, f2: 30, dur: 0.4, v: 0.4 });
  },
  beam(s) {
    s.tone({ f: 220, f2: 180, dur: 0.6, v: 0.09, type: 'sawtooth', filter: 'lowpass', ff: 1800 });
    s.noise({ dur: 0.5, v: 0.06, filter: 'highpass', ff: 3000 });
  },
  roar(s) {
    s.noise({ dur: 1.1, v: 0.3, filter: 'bandpass', ff: 260, ff2: 600, q: 1.2, a: 0.08 });
    s.tone({ f: 85, f2: 52, dur: 1.1, v: 0.24, type: 'sawtooth', filter: 'lowpass', ff: 500, a: 0.06 });
  },
  bossDie(s) {
    s.noise({ dur: 2.2, v: 0.4, filter: 'lowpass', ff: 3000, ff2: 60 });
    s.tone({ f: 160, f2: 25, dur: 2.0, v: 0.42 });
    [392, 523, 659, 784].forEach((f, i) => s.tone({ f, dur: 2.2, v: 0.05, a: 0.4, delay: 0.6 + i * 0.12 }));
  },
  defy(s) {
    [261.6, 392, 523.3, 784].forEach((f, i) => s.tone({ f, dur: 1.4, v: 0.08, type: 'triangle', a: 0.02, delay: i * 0.05 }));
    s.noise({ dur: 0.8, v: 0.2, filter: 'bandpass', ff: 400, ff2: 3000 });
  },
  death(s) {
    s.tone({ f: 330, f2: 82, dur: 1.6, v: 0.18, type: 'triangle', a: 0.02 });
    s.tone({ f: 247, f2: 61, dur: 1.8, v: 0.12, type: 'sine', a: 0.02, delay: 0.1 });
    s.noise({ dur: 1.2, v: 0.15, filter: 'lowpass', ff: 1200, ff2: 100 });
  },
  evade(s) { s.noise({ dur: 0.12, v: 0.1, filter: 'bandpass', ff: 3000, q: 2 }); },
  barrier(s) { s.tone({ f: 1200, f2: 600, dur: 0.3, v: 0.08, type: 'triangle' }); s.noise({ dur: 0.2, v: 0.1, filter: 'highpass', ff: 4000 }); },
  roomClear(s) {
    [392, 493.9, 587.3, 784].forEach((f, i) => s.tone({ f, dur: 0.9, v: 0.06, type: 'triangle', a: 0.01, delay: i * 0.09 }));
  },
  thud(s) { s.tone({ f: 120, f2: 50, dur: 0.15, v: 0.2 }); },
  splash(s) { s.noise({ dur: 0.4, v: 0.18, filter: 'bandpass', ff: 1200, ff2: 400, q: 0.8 }); },
};

// ---------------------------------------------------------------------------
// Music — lookahead sequencer with chords, bass, arps and drums.
// ---------------------------------------------------------------------------
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};
const MUSIC_MODES = {
  title:   { root: 45, scale: 'minor', prog: [0, 5, 2, 6], bpm: 70, bars: 2, drums: 0, bright: 900 },
  hub:     { root: 50, scale: 'dorian', prog: [0, 3, 5, 4], bpm: 76, bars: 2, drums: 0, bright: 1100 },
  cinder:  { root: 45, scale: 'minor', prog: [0, 5, 3, 4], bpm: 100, bars: 1, drums: 1, bright: 1400 },
  archive: { root: 47, scale: 'dorian', prog: [0, 6, 5, 3], bpm: 92, bars: 1, drums: 1, bright: 1200 },
  court:   { root: 52, scale: 'harmonic', prog: [0, 5, 3, 4], bpm: 108, bars: 1, drums: 1, bright: 1700 },
  boss:    { root: 45, scale: 'phrygian', prog: [0, 1, 0, 6], bpm: 132, bars: 1, drums: 2, bright: 2000 },
  final:   { root: 47, scale: 'harmonic', prog: [0, 5, 1, 4], bpm: 138, bars: 1, drums: 2, bright: 2200 },
  victory: { root: 48, scale: 'major', prog: [0, 4, 5, 3], bpm: 84, bars: 2, drums: 0, bright: 1800 },
};

const Music = {
  s: null,
  mode: null,
  pending: null,
  intensity: 0,
  step: 0,
  nextTime: 0,
  timer: null,
  bus: null,
  delay: null,

  attach(sound) {
    this.s = sound;
    const ctx = sound.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(sound.musicBus);
    // a soft echo for arps
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.32;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay);
    dl.connect(this.bus);
    if (this.pending) { const p = this.pending; this.pending = null; this.play(p); }
  },

  play(mode) {
    if (!this.s || !this.s.ctx) { this.pending = mode; return; }
    if (this.mode === mode) return;
    const ctx = this.s.ctx;
    const switching = !!this.mode;
    this.mode = mode;
    if (switching) {
      // quick dip so mode switches don't clash
      const g = this.bus.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(0.0, ctx.currentTime + 0.25);
      g.linearRampToValueAtTime(1.0, ctx.currentTime + 1.2);
      this.nextTime = ctx.currentTime + 0.3;
    } else {
      this.nextTime = ctx.currentTime + 0.1;
    }
    this.step = 0;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
  },

  stop() {
    this.mode = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  setIntensity(i) { this.intensity = i; },

  tick() {
    const s = this.s;
    if (!s || !s.ctx || !this.mode) return;
    const ctx = s.ctx;
    if (ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    const m = MUSIC_MODES[this.mode];
    const stepDur = 60 / m.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(m, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  },

  noteFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },

  chordNotes(m, degree, octave = 0) {
    const sc = SCALES[m.scale];
    const notes = [];
    for (const k of [0, 2, 4]) {
      const d = degree + k;
      const oct = Math.floor(d / sc.length);
      notes.push(m.root + 12 * (oct + octave) + sc[((d % sc.length) + sc.length) % sc.length]);
    }
    return notes;
  },

  playStep(m, step, t, stepDur) {
    const s = this.s;
    const barLen = 16 * m.bars;
    const inBar = step % barLen;
    const chordIdx = Math.floor(step / barLen) % m.prog.length;
    const degree = m.prog[chordIdx];
    const chord = this.chordNotes(m, degree, 0);
    const inten = this.intensity;
    const drumsOn = (m.drums > 0 && inten >= 1) || m.drums >= 2;
    const heavy = m.drums >= 2 || inten >= 2;

    // pad on chord change
    if (inBar === 0) {
      const dur = barLen * stepDur + 0.4;
      for (const n of chord) {
        for (const det of [-7, 7]) {
          s.tone({ at: t, f: this.noteFreq(n), dur, v: 0.028, type: 'sawtooth', a: 0.5, hold: dur - 1.0, detune: det, filter: 'lowpass', ff: m.bright * 0.6, q: 0.5, bus: this.bus });
        }
      }
      // low root drone
      s.tone({ at: t, f: this.noteFreq(chord[0] - 12), dur, v: 0.05, type: 'triangle', a: 0.3, hold: dur - 0.8, bus: this.bus });
    }

    // arp
    const arpEvery = inten >= 1 || m.drums >= 2 ? 2 : 4;
    if (inBar % arpEvery === 0) {
      const pattern = [0, 1, 2, 1, 2, 0, 1, 2];
      const idx = pattern[(step / arpEvery) % pattern.length | 0];
      const note = chord[idx] + 12 + (heavy && (step % 32) >= 16 ? 12 : 0);
      if (inten >= 1 || Math.random() < 0.7) {
        s.tone({ at: t, f: this.noteFreq(note), dur: stepDur * 2.2, v: 0.03, type: 'triangle', filter: 'lowpass', ff: m.bright * 1.6, bus: this.bus });
        if (this.delay) s.tone({ at: t, f: this.noteFreq(note), dur: stepDur * 1.5, v: 0.012, type: 'triangle', bus: this.delay });
      }
    }

    // bass
    if (inten >= 1 || m.drums >= 2) {
      const bassSteps = heavy ? [0, 3, 6, 8, 10, 14] : [0, 6, 8, 14];
      if (bassSteps.includes(inBar % 16)) {
        s.tone({ at: t, f: this.noteFreq(chord[0] - 24 + (inBar % 16 === 14 ? 7 : 0)), dur: stepDur * 1.8, v: 0.09, type: 'sawtooth', filter: 'lowpass', ff: 420, q: 2, bus: this.bus });
      }
    }

    // drums
    if (drumsOn) {
      const b = inBar % 16;
      const kickSteps = heavy ? [0, 4, 8, 11, 12] : [0, 8, 10];
      if (kickSteps.includes(b)) s.tone({ at: t, f: 140, f2: 42, dur: 0.22, v: 0.22, slide: 0.12, bus: this.bus });
      if (b === 4 || b === 12) {
        s.noise({ at: t, dur: 0.16, v: 0.09, filter: 'bandpass', ff: 1800, q: 0.9, bus: this.bus });
        s.tone({ at: t, f: 200, f2: 120, dur: 0.1, v: 0.05, bus: this.bus });
      }
      if (b % 2 === 0 || (heavy && Math.random() < 0.5)) {
        s.noise({ at: t, dur: 0.04, v: b % 4 === 2 ? 0.035 : 0.02, filter: 'highpass', ff: 7000, bus: this.bus });
      }
    }
  },
};
