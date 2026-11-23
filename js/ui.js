'use strict';
// ---------------------------------------------------------------------------
// DOM UI: HUD, banners, dialogue, choice cards, menus, hub screens.
// ---------------------------------------------------------------------------

const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const UI = {
  hud: null,
  cache: {},
  nav: { items: [], index: 0, onBack: null, lock: 0, cols: 0 },
  overlayOpen: false,
  dialogueState: null,
  bannerTimer: null,

  init() {
    this.hud = $('#hud');
    this.overlay = $('#overlay');
    this.dialogue = $('#dialogue');
    this.bannerEl = $('#banner');
    this.fadeEl = $('#fade');
    this.vignette = $('#vignette');
    this.bossBar = $('#boss-bar');
    this.fpsEl = $('#fps');
    this.toastEl = $('#toast');
    this.dialogue.addEventListener('pointerdown', (e) => { e.preventDefault(); this._clickAdvance = true; });
    this.overlay.addEventListener('mousemove', (e) => {
      const t = e.target.closest('[data-nav]');
      if (t) { const i = this.nav.items.indexOf(t); if (i >= 0 && i !== this.nav.index) { this.nav.index = i; this.paintNav(); } }
    });
  },

  // ------------------------------------------------------------------ HUD
  showHUD(on) { this.hud.classList.toggle('hidden', !on); },

  set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  },

  updateHUD() {
    const p = G.player, run = G.run;
    if (!p) return;
    const maxHp = Math.round(p.maxHp), hp = Math.max(0, Math.ceil(p.hp));
    this.set('hpw', maxHp, (v) => { $('#hp .hp-bar').style.width = `${Math.min(360, 170 + v * 1.0)}px`; });
    this.set('hp', `${hp}/${maxHp}`, () => {
      $('#hp .fill').style.width = `${(hp / maxHp) * 100}%`;
      $('#hp .text').textContent = `${hp} / ${maxHp}`;
      $('#hp').classList.toggle('low', hp / maxHp < 0.3);
    });
    // trailing damage bar
    const lagEl = $('#hp .lag');
    this._lag = this._lag === undefined ? hp / maxHp : damp(this._lag, hp / maxHp, 4, 1 / 60);
    if (this._lag < hp / maxHp) this._lag = hp / maxHp;
    lagEl.style.width = `${this._lag * 100}%`;

    const s = p.stats;
    this.set('dash', `${p.dashCharges}/${s.dashCharges}`, () => this.pips('#dash-pips', p.dashCharges, s.dashCharges, 'dash'));
    this.set('cast', `${p.castCharges}/${s.castCharges}`, () => this.pips('#cast-pips', p.castCharges, s.castCharges, 'cast'));
    const defies = run ? run.defies : Save.rank('defy');
    const maxD = run ? run.maxDefies : Save.rank('defy');
    this.set('defy', `${defies}/${maxD}`, () => this.pips('#defy-pips', defies, maxD, 'defy'));
    this.set('gold', run ? run.gold : -1, (v) => { $('#gold').style.display = v < 0 ? 'none' : ''; $('#gold .v').textContent = v; });
    this.set('ash', Save.data.ash + (run ? run.ashEarned : 0), (v) => { $('#ash .v').textContent = v; });
    const sc = G.scene;
    const realmLabel = run && sc ? (sc.kind === 'boss' ? REALMS[run.realm].name : REALMS[run.realm].name) : 'The Hearth';
    const roomLabel = run && sc ? (sc.kind === 'boss' ? 'Guardian' : sc.kind === 'respite' ? 'Respite' : `Chamber ${run.room + 1}`) : '';
    this.set('realm', realmLabel, (v) => { $('#hud-realm').textContent = v; });
    this.set('room', roomLabel, (v) => { $('#hud-room').textContent = v; });
    if (run) this.set('build', run.buildVersion, () => this.renderBuildIcons());
    else this.set('build', 'none', () => { $('#hud-build').innerHTML = ''; });
    // boss bar
    const boss = sc && sc.boss && !sc.boss.dead ? sc.boss : null;
    this.set('bossOn', !!boss, (v) => this.bossBar.classList.toggle('hidden', !v));
    if (boss) {
      this.set('bossName', boss.def.name, (v) => { $('.boss-name', this.bossBar).textContent = v; $('.boss-epithet', this.bossBar).textContent = boss.def.epithet; });
      const k = clamp(boss.hp / boss.maxHp, 0, 1);
      this.set('bossHp', Math.round(k * 400), () => { $('.fill', this.bossBar).style.width = `${k * 100}%`; });
      this._bossLag = this._bossLag === undefined ? k : damp(this._bossLag, k, 3, 1 / 60);
      if (this._bossLag < k) this._bossLag = k;
      $('.lag', this.bossBar).style.width = `${this._bossLag * 100}%`;
    } else this._bossLag = undefined;
    if (Save.data.settings.fps) this.fpsEl.textContent = `${G.fps | 0} fps`;
    this.fpsEl.style.display = Save.data.settings.fps ? '' : 'none';
  },

  pips(sel, cur, max, kind) {
    const box = $(sel);
    box.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const d = el('span', `pip pip-${kind}${i < cur ? ' on' : ''}`);
      box.appendChild(d);
    }
    const group = box.closest('.pip-group');
    (group || box).style.display = max > 0 ? '' : 'none';
  },

  renderBuildIcons() {
    const box = $('#hud-build');
    box.innerHTML = '';
    const b = G.run.build;
    const row = el('div', 'slots');
    for (const slot of ['attack', 'special', 'cast', 'dash']) {
      const id = b.slots[slot];
      const cell = el('div', 'slot-cell' + (id ? ' filled' : ''));
      if (id) {
        const def = BLESSING_BY_ID[id];
        cell.style.setProperty('--c', PATRONS[def.patron].color);
        cell.innerHTML = `<img src="${iconURL('glyph', { patron: def.patron, size: 48 })}" alt=""><span class="lv">${b.get(id).level > 1 ? b.get(id).level : ''}</span>`;
        cell.title = `${def.name} (${SLOT_NAMES[slot]})`;
      } else {
        cell.innerHTML = `<img src="${iconURL('slot', { slot, size: 40, color: '#6a5a5a' })}" alt="">`;
        cell.title = `${SLOT_NAMES[slot]}: empty`;
      }
      row.appendChild(cell);
    }
    box.appendChild(row);
    const pass = el('div', 'passives');
    for (const entry of b.list) {
      if (entry.def.slot !== 'passive') continue;
      const d = entry.def;
      const c = d.duo ? RARITY[4].color : PATRONS[d.patron].color;
      const chip = el('div', 'passive-chip');
      chip.style.setProperty('--c', c);
      chip.innerHTML = `<img src="${iconURL('glyph', { patron: d.patron, size: 32 })}" alt="">`;
      chip.title = d.name;
      pass.appendChild(chip);
    }
    for (const fid of b.forge) {
      const chip = el('div', 'passive-chip forge');
      chip.style.setProperty('--c', '#ff9d4a');
      chip.innerHTML = `<img src="${iconURL('forge', { size: 32 })}" alt="">`;
      chip.title = FORGE_BY_ID[fid].name;
      pass.appendChild(chip);
    }
    box.appendChild(pass);
  },

  // ------------------------------------------------------------------ banners & fx
  banner(title, sub = '', dur = 2.2, style = '') {
    const b = this.bannerEl;
    b.className = 'banner ' + style;
    b.innerHTML = `<div class="b-title">${esc(title)}</div>${sub ? `<div class="b-sub">${esc(sub)}</div>` : ''}`;
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), dur * 1000);
  },

  toast(html, dur = 2.4) {
    const t = el('div', 'toast-item', html);
    this.toastEl.appendChild(t);
    setTimeout(() => t.classList.add('out'), dur * 1000);
    setTimeout(() => t.remove(), dur * 1000 + 500);
  },

  fade(to, dur = 0.35) {
    return new Promise((res) => {
      this.fadeEl.style.transition = `opacity ${dur}s ease`;
      this.fadeEl.style.opacity = to ? '1' : '0';
      setTimeout(res, dur * 1000 + 20);
    });
  },

  hurt(k) { this.vignette.style.opacity = String(clamp(k, 0, 1)); },

  // ------------------------------------------------------------------ dialogue
  // lines: [{ speaker, text, color }] ; blocking; resolves when finished
  talk(lines, onDone) {
    G.prevState = G.state === 'dialogue' ? G.prevState : G.state;
    G.state = 'dialogue';
    this.dialogueState = { lines, i: 0, shown: 0, onDone, lock: 0.15 };
    this.dialogue.classList.remove('hidden');
    this.renderDialogue();
  },

  say(speaker, text, color) { this.talk([{ speaker, text, color }]); },

  renderDialogue() {
    const d = this.dialogueState;
    const line = d.lines[d.i];
    $('.speaker', this.dialogue).textContent = line.speaker;
    $('.speaker', this.dialogue).style.color = line.color || '#ffcf8a';
    $('.text', this.dialogue).textContent = line.text.slice(0, Math.floor(d.shown));
    $('.hint', this.dialogue).textContent = d.shown >= line.text.length ? (d.i < d.lines.length - 1 ? 'Continue  ›' : 'Close  ›') : '';
  },

  updateDialogue(dt) {
    const d = this.dialogueState;
    if (!d) return;
    const line = d.lines[d.i];
    if (d.lock > 0) d.lock -= dt;
    if (d.shown < line.text.length) d.shown = Math.min(line.text.length, d.shown + dt * 60);
    const adv = d.lock <= 0 && (this._clickAdvance || Input.pressed('confirm') || Input.pressed('interact') || Input.pressed('attack') || Input.pressed('back'));
    this._clickAdvance = false;
    if (adv) {
      if (d.shown < line.text.length) d.shown = line.text.length;
      else if (d.i < d.lines.length - 1) { d.i++; d.shown = 0; Sound.play('uiMove'); }
      else { this.endDialogue(); return; }
    }
    this.renderDialogue();
  },

  endDialogue() {
    const d = this.dialogueState;
    this.dialogueState = null;
    this.dialogue.classList.add('hidden');
    G.state = G.prevState || 'play';
    G.swallowInput = true;
    if (d && d.onDone) d.onDone();
  },

  // ------------------------------------------------------------------ overlay / nav
  openOverlay(node, navOpts = {}) {
    if (!this.overlayOpen) G.prevState = G.state;
    this.overlay.innerHTML = '';
    this.overlay.appendChild(node);
    this.overlay.classList.remove('hidden');
    this.overlayOpen = true;
    if (G.state !== 'title') G.state = 'menu';
    this.setNav(navOpts);
  },

  closeOverlay() {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
    this.overlayOpen = false;
    this.nav.items = [];
    if (G.state === 'menu') G.state = G.prevState && G.prevState !== 'menu' ? G.prevState : 'play';
    G.swallowInput = true;
  },

  setNav(o = {}) {
    this.nav.items = Array.from(this.overlay.querySelectorAll('[data-nav]'));
    this.nav.index = clamp(o.start || 0, 0, Math.max(0, this.nav.items.length - 1));
    this.nav.onBack = o.onBack || null;
    this.nav.lock = 0.18;
    this.nav.hotkeys = o.hotkeys || false;
    this.paintNav();
  },

  paintNav() {
    this.nav.items.forEach((it, i) => it.classList.toggle('focus', i === this.nav.index));
    const it = this.nav.items[this.nav.index];
    if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest' });
  },

  updateNav(dt) {
    const n = this.nav;
    if (n.lock > 0) { n.lock -= dt; return; }
    if (!n.items.length) { if (Input.pressed('back') && n.onBack) n.onBack(); return; }
    let moved = 0;
    const cur = n.items[n.index];
    const isRange = cur && cur.tagName === 'INPUT' && cur.type === 'range';
    if (isRange && (Input.pressed('left') || Input.pressed('right'))) {
      const step = Input.pressed('left') ? -5 : 5;
      cur.value = String(clamp(+cur.value + step, +cur.min, +cur.max));
      cur.dispatchEvent(new Event('input'));
      Sound.play('uiMove');
      return;
    }
    if (Input.pressed('left') || Input.pressed('up')) moved = -1;
    if (Input.pressed('right') || Input.pressed('down')) moved = 1;
    if (moved) {
      n.index = (n.index + moved + n.items.length) % n.items.length;
      this.paintNav();
      Sound.play('uiMove');
    }
    if (n.hotkeys) {
      for (let k = 1; k <= Math.min(9, n.items.length); k++) {
        if (Input.pressedKeys.has('Digit' + k)) { const it = n.items[k - 1]; if (it && it.dataset.hot !== 'no') { n.index = k - 1; this.paintNav(); it.click(); return; } }
      }
    }
    if (Input.pressed('confirm')) {
      const it = n.items[n.index];
      if (it) it.click();
      return;
    }
    if (Input.pressed('back') && n.onBack) n.onBack();
  },

  // ------------------------------------------------------------------ choice cards
  // opts: { kicker, title, titleColor, epithet, glyph:{patron}|{kind}, line, cards:[{...}], onPick(i), reroll:{left, fn}, closable }
  openChoice(opts) {
    const panel = el('div', 'panel choice');
    const head = el('div', 'choice-head');
    if (opts.glyph) {
      const img = el('img', 'choice-glyph');
      img.src = opts.glyph.patron ? iconURL('glyph', { patron: opts.glyph.patron, size: 128 }) : iconURL(opts.glyph.kind, { size: 128, orb: true });
      head.appendChild(img);
    }
    const ht = el('div', 'choice-titles');
    ht.innerHTML = `${opts.kicker ? `<div class="kicker">${esc(opts.kicker)}</div>` : ''}<div class="choice-title" style="color:${opts.titleColor || '#ffcf8a'}">${esc(opts.title)}</div>${opts.epithet ? `<div class="choice-epithet">${esc(opts.epithet)}</div>` : ''}`;
    head.appendChild(ht);
    panel.appendChild(head);
    if (opts.line) panel.appendChild(el('div', 'choice-line', `“${esc(opts.line)}”`));
    const cards = el('div', 'cards');
    opts.cards.forEach((c, i) => {
      const card = el('button', `card rarity-${c.rarity || 'common'}`);
      card.dataset.nav = '1';
      card.style.setProperty('--rc', c.rarityColor || '#e9e1d3');
      card.style.setProperty('--pc', c.color || '#ffcf8a');
      card.innerHTML = `
        <div class="card-top">
          ${c.icon ? `<img class="card-icon" src="${c.icon}" alt="">` : ''}
          <span class="card-tag">${esc(c.tag || '')}</span>
          <span class="card-rarity">${esc(c.rarityName || '')}</span>
        </div>
        <div class="card-title">${esc(c.title)}</div>
        <div class="card-desc">${c.desc}</div>
        ${c.note ? `<div class="card-note">${c.note}</div>` : ''}
        <div class="card-key">${i + 1}</div>`;
      card.addEventListener('click', () => {
        if (card.disabled) return;
        Sound.play('blessing');
        opts.onPick(i);
      });
      cards.appendChild(card);
    });
    panel.appendChild(cards);
    const foot = el('div', 'choice-foot');
    if (opts.reroll && opts.reroll.left > 0) {
      const rb = el('button', 'btn ghost', `Reroll choices <span class="count">${opts.reroll.left} left</span>`);
      rb.dataset.nav = '1'; rb.dataset.hot = 'no';
      rb.addEventListener('click', () => { Sound.play('ui'); opts.reroll.fn(); });
      foot.appendChild(rb);
    }
    if (opts.closable) {
      const cb = el('button', 'btn ghost', 'Decline');
      cb.dataset.nav = '1'; cb.dataset.hot = 'no';
      cb.addEventListener('click', () => { Sound.play('uiBack'); opts.onClose && opts.onClose(); });
      foot.appendChild(cb);
    }
    if (foot.children.length) panel.appendChild(foot);
    this.openOverlay(panel, { hotkeys: true, onBack: opts.closable ? () => opts.onClose && opts.onClose() : null });
  },

  blessingCard(def, rarity, build, extra = {}) {
    const vals = extra.vals || computeVals(def, rarity, extra.level || 1);
    const rar = RARITY[rarity];
    const prev = build.replacing(def);
    let note = '';
    if (prev) note = `Replaces <b>${esc(prev.def.name)}</b>`;
    if (extra.note) note = extra.note;
    const tag = def.duo ? `${PATRONS[def.patrons[0]].element} + ${PATRONS[def.patrons[1]].element}` : SLOT_NAMES[def.slot];
    return {
      title: def.name, tag, rarity: rar.id, rarityName: rar.name, rarityColor: rar.color,
      color: PATRONS[def.patron].color,
      icon: def.slot !== 'passive' ? iconURL('slot', { slot: def.slot, size: 40, color: PATRONS[def.patron].color }) : iconURL('glyph', { patron: def.patron, size: 40 }),
      desc: blessingText(def, vals), note,
    };
  },

  // ------------------------------------------------------------------ menus
  menuButton(label, fn, cls = 'btn') {
    const b = el('button', cls, label);
    b.dataset.nav = '1';
    b.addEventListener('click', () => { Sound.play('ui'); fn(); });
    return b;
  },

  openPause() {
    const panel = el('div', 'panel menu');
    panel.appendChild(el('h2', 'menu-title', 'Paused'));
    const inRun = !!G.run;
    const list = el('div', 'menu-list');
    list.appendChild(this.menuButton('Resume', () => this.closeOverlay()));
    if (inRun) list.appendChild(this.menuButton('Blessings', () => this.openBuild(() => this.openPause())));
    list.appendChild(this.menuButton('Settings', () => this.openSettings(() => this.openPause())));
    list.appendChild(this.menuButton('Controls', () => this.openControls(() => this.openPause())));
    if (inRun) list.appendChild(this.menuButton('Abandon Run', () => this.confirm('Abandon this run?', 'Your flame returns to the Hearth. Ash earned so far is kept.', () => { this.closeOverlay(); Game.abandonRun(); }, () => this.openPause())));
    list.appendChild(this.menuButton('Quit to Title', () => this.confirm('Quit to title?', inRun ? 'The current run will be abandoned (ash earned is kept).' : 'Progress is saved.', () => { this.closeOverlay(); Game.quitToTitle(); }, () => this.openPause())));
    panel.appendChild(list);
    this.openOverlay(panel, { onBack: () => this.closeOverlay() });
  },

  confirm(title, text, yes, no) {
    const panel = el('div', 'panel menu small');
    panel.appendChild(el('h2', 'menu-title', esc(title)));
    panel.appendChild(el('p', 'menu-text', esc(text)));
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Yes', yes));
    row.appendChild(this.menuButton('No', no, 'btn ghost'));
    panel.appendChild(row);
    this.openOverlay(panel, { start: 1, onBack: no });
  },

  openSettings(back) {
    const st = Save.data.settings;
    const panel = el('div', 'panel menu');
    panel.appendChild(el('h2', 'menu-title', 'Settings'));
    const list = el('div', 'menu-list settings');
    const slider = (label, key, apply) => {
      const row = el('label', 'set-row');
      row.innerHTML = `<span>${label}</span><input type="range" min="0" max="100" value="${Math.round(st[key] * 100)}"><span class="val">${Math.round(st[key] * 100)}</span>`;
      const inp = row.querySelector('input');
      inp.dataset.nav = '1';
      inp.addEventListener('input', () => { st[key] = inp.value / 100; row.querySelector('.val').textContent = inp.value; apply(); Save.save(); });
      inp.addEventListener('keydown', (e) => { if (e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault(); });
      inp.click = () => {};
      return row;
    };
    const toggle = (label, getText, fn) => {
      const b = el('button', 'btn set-toggle', `<span>${label}</span><span class="val">${getText()}</span>`);
      b.dataset.nav = '1';
      b.addEventListener('click', () => { fn(); b.querySelector('.val').textContent = getText(); Save.save(); Sound.play('ui'); });
      return b;
    };
    list.appendChild(slider('Sound effects', 'sfx', () => Sound.setVolumes(st.sfx, st.music)));
    list.appendChild(slider('Music', 'music', () => Sound.setVolumes(st.sfx, st.music)));
    list.appendChild(toggle('Screen shake', () => ['Off', 'Reduced', 'Full'][st.shake === 1 ? 2 : st.shake === 0.5 ? 1 : 0], () => { st.shake = st.shake === 1 ? 0.5 : st.shake === 0.5 ? 0 : 1; }));
    list.appendChild(toggle('Damage numbers', () => (st.numbers ? 'On' : 'Off'), () => { st.numbers = !st.numbers; }));
    list.appendChild(toggle('Gentle Flame (take 40% less damage)', () => (st.assist ? 'On' : 'Off'), () => { st.assist = !st.assist; }));
    list.appendChild(toggle('Show FPS', () => (st.fps ? 'On' : 'Off'), () => { st.fps = !st.fps; }));
    list.appendChild(this.menuButton('Erase all progress', () => this.confirm('Erase all progress?', 'Ash, upgrades, weapons and records will be lost forever.', () => { Save.reset(); this.closeOverlay(); Game.quitToTitle(); }, () => this.openSettings(back)), 'btn danger'));
    list.appendChild(this.menuButton('Back', back, 'btn ghost'));
    panel.appendChild(list);
    this.openOverlay(panel, { onBack: back });
  },

  openControls(back) {
    const panel = el('div', 'panel menu wide');
    panel.appendChild(el('h2', 'menu-title', 'Controls'));
    const rows = [
      ['Move', 'W A S D', 'Left stick'],
      ['Aim', 'Mouse', 'Right stick'],
      ['Attack', 'Left click / J', 'X / □'],
      ['Special', 'Right click / K', 'Y / △'],
      ['Cast', 'Q / L / Middle click', 'RB / RT'],
      ['Dash', 'Space / Shift', 'A / ✕'],
      ['Interact', 'E', 'B / ○'],
      ['Blessings', 'Tab', 'Back / Select'],
      ['Pause', 'Esc / P', 'Start'],
    ];
    const tbl = el('div', 'controls-table');
    tbl.innerHTML = `<div class="ct-h">Action</div><div class="ct-h">Keyboard &amp; Mouse</div><div class="ct-h">Gamepad</div>` +
      rows.map((r) => `<div>${r[0]}</div><div><kbd>${r[1]}</kbd></div><div><kbd>${r[2]}</kbd></div>`).join('');
    panel.appendChild(tbl);
    panel.appendChild(el('p', 'menu-text', 'Dash makes you briefly untouchable — dash <i>through</i> attacks. Attack right after a dash for a Dash-Strike. Without a mouse, attacks aim where you move (with gentle aim assist).'));
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Back', back, 'btn ghost'));
    panel.appendChild(row);
    this.openOverlay(panel, { onBack: back });
  },

  openBuild(back) {
    const b = G.run && G.run.build;
    const panel = el('div', 'panel menu wide build-view');
    panel.appendChild(el('h2', 'menu-title', 'Blessings'));
    if (!b || (!b.list.length && !b.forge.length)) panel.appendChild(el('p', 'menu-text', 'No blessings yet. The constellations are watching.'));
    else {
      const grid = el('div', 'build-grid');
      const order = ['attack', 'special', 'cast', 'dash'];
      const sorted = b.list.slice().sort((x, y) => {
        const ix = order.indexOf(x.def.slot), iy = order.indexOf(y.def.slot);
        return (ix < 0 ? 9 : ix) - (iy < 0 ? 9 : iy);
      });
      for (const e of sorted) {
        const d = e.def;
        const rar = RARITY[e.rarity];
        const item = el('div', 'build-item');
        item.style.setProperty('--pc', d.duo ? RARITY[4].color : PATRONS[d.patron].color);
        item.innerHTML = `<img src="${iconURL('glyph', { patron: d.patron, size: 56 })}" alt="">
          <div><div class="bi-title">${esc(d.name)} <span class="bi-lv">Lv ${e.level}</span></div>
          <div class="bi-tag" style="color:${rar.color}">${rar.name} · ${d.duo ? 'Conjunction' : SLOT_NAMES[d.slot]}</div>
          <div class="bi-desc">${blessingText(d, e.vals)}</div></div>`;
        grid.appendChild(item);
      }
      for (const fid of b.forge) {
        const f = FORGE_BY_ID[fid];
        const item = el('div', 'build-item');
        item.style.setProperty('--pc', '#ff9d4a');
        item.innerHTML = `<img src="${iconURL('forge', { size: 56, orb: true })}" alt=""><div><div class="bi-title">${esc(f.name)}</div><div class="bi-tag" style="color:#ff9d4a">Sunforge</div><div class="bi-desc">${f.desc}</div></div>`;
        grid.appendChild(item);
      }
      panel.appendChild(grid);
    }
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Back', back || (() => this.closeOverlay()), 'btn ghost'));
    panel.appendChild(row);
    this.openOverlay(panel, { onBack: back || (() => this.closeOverlay()) });
  },

  // ------------------------------------------------------------------ hub screens
  openUpgrades() {
    const panel = el('div', 'panel menu wide altar');
    panel.appendChild(el('h2', 'menu-title', 'The Kindling Altar'));
    panel.appendChild(el('p', 'menu-text', 'Feed the altar the ash of fallen runs. What burns here stays burned.'));
    const ashRow = el('div', 'ash-total', `<img src="${iconURL('ash', { size: 40 })}" alt=""> <span>${Save.data.ash}</span> Ash`);
    panel.appendChild(ashRow);
    const list = el('div', 'upgrade-list');
    for (const u of UPGRADES) {
      const rank = Save.rank(u.id);
      const maxed = rank >= u.max;
      const cost = maxed ? 0 : u.cost(rank);
      const can = !maxed && Save.data.ash >= cost;
      const b = el('button', `upgrade${maxed ? ' maxed' : ''}${can ? '' : ' poor'}`);
      b.dataset.nav = '1';
      const pips = Array.from({ length: u.max }, (_, i) => `<span class="rk${i < rank ? ' on' : ''}"></span>`).join('');
      b.innerHTML = `<div class="up-main"><div class="up-name">${esc(u.name)}</div><div class="up-desc">${esc(u.desc)}</div><div class="up-ranks">${pips}</div></div>
        <div class="up-cost">${maxed ? 'MAX' : `<img src="${iconURL('ash', { size: 28 })}" alt="">${cost}`}</div>`;
      b.addEventListener('click', () => {
        if (maxed) return;
        if (Save.data.ash < cost) { Sound.play('deny'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        Save.data.ash -= cost;
        Save.data.upgrades[u.id] = rank + 1;
        Save.save();
        Sound.play('buy');
        const idx = this.nav.index;
        this.openUpgrades();
        this.nav.index = idx; this.paintNav();
        Game.refreshHubPlayer();
      });
      list.appendChild(b);
    }
    panel.appendChild(list);
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Done', () => this.closeOverlay(), 'btn ghost'));
    panel.appendChild(row);
    this.openOverlay(panel, { onBack: () => this.closeOverlay() });
  },

  openWeapons() {
    const panel = el('div', 'panel menu wide armory');
    panel.appendChild(el('h2', 'menu-title', 'Rack of Forms'));
    panel.appendChild(el('p', 'menu-text', 'The sun took many shapes. Choose the one you will carry upward.'));
    const grid = el('div', 'weapon-grid');
    let start = 0;
    WEAPON_IDS.forEach((id, i) => {
      const w = WEAPONS[id];
      const owned = Save.data.weapons.includes(id);
      const sel = Save.data.weapon === id;
      if (sel) start = i;
      const card = el('button', `weapon-card${sel ? ' selected' : ''}${owned ? '' : ' locked'}`);
      card.dataset.nav = '1';
      card.style.setProperty('--wc', w.color);
      card.innerHTML = `<canvas width="120" height="90"></canvas>
        <div class="wc-name">${esc(w.name)}</div><div class="wc-title">${esc(w.title)}</div>
        <div class="wc-desc">${esc(w.desc)}</div>
        <ul class="wc-moves">${w.moves.map((m) => `<li><b>${esc(m[0])}</b> ${esc(m[1])}</li>`).join('')}</ul>
        <div class="wc-state">${sel ? 'Equipped' : owned ? 'Equip' : `Unlock · <img src="${iconURL('ash', { size: 24 })}" alt="">${w.cost}`}</div>`;
      const cv = card.querySelector('canvas');
      drawWeaponPreview(cv, id);
      card.addEventListener('click', () => {
        if (!owned) {
          if (Save.data.ash < w.cost) { Sound.play('deny'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); return; }
          Save.data.ash -= w.cost;
          Save.data.weapons.push(id);
          Sound.play('buy');
        } else Sound.play('ui');
        Save.data.weapon = id;
        Save.save();
        Game.refreshHubPlayer();
        this.openWeapons();
      });
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    panel.appendChild(el('div', 'ash-total', `<img src="${iconURL('ash', { size: 40 })}" alt=""> <span>${Save.data.ash}</span> Ash`));
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Done', () => this.closeOverlay(), 'btn ghost'));
    panel.appendChild(row);
    this.openOverlay(panel, { start, onBack: () => this.closeOverlay() });
  },

  openChronicle() {
    const d = Save.data;
    const panel = el('div', 'panel menu wide chronicle');
    panel.appendChild(el('h2', 'menu-title', 'The Chronicle'));
    const stats = [
      ['Ascents attempted', d.runs], ['Dawns restored', d.wins], ['Times guttered', d.deaths],
      ['Deepest chamber', d.bestDepth], ['Fastest dawn', d.bestTime ? formatTime(d.bestTime) : '—'], ['Foes extinguished', d.kills],
      ['Kiln Warden felled', d.bossKills.warden || 0], ['Lantern Angler felled', d.bossKills.angler || 0], ['Pale Regent felled', d.bossKills.regent || 0],
      ['Ash gathered (all time)', d.totalAsh],
    ];
    const grid = el('div', 'stat-grid');
    grid.innerHTML = stats.map((s) => `<div class="st-k">${esc(s[0])}</div><div class="st-v">${esc(s[1])}</div>`).join('');
    panel.appendChild(grid);
    panel.appendChild(el('h3', 'sub-title', 'The Constellations'));
    const pg = el('div', 'patron-grid');
    for (const id of PATRON_IDS) {
      const p = PATRONS[id];
      const c = el('div', 'patron-card');
      c.style.setProperty('--pc', p.color);
      c.innerHTML = `<img src="${iconURL('glyph', { patron: id, size: 72 })}" alt=""><div class="pc-name">${esc(p.name)}</div><div class="pc-ep">${esc(p.epithet)}</div><div class="pc-blurb">${esc(p.blurb)}</div>`;
      pg.appendChild(c);
    }
    panel.appendChild(pg);
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Close', () => this.closeOverlay(), 'btn ghost'));
    panel.appendChild(row);
    this.openOverlay(panel, { onBack: () => this.closeOverlay() });
  },

  openNightPact() {
    const d = Save.data;
    const panel = el('div', 'panel menu small');
    panel.appendChild(el('h2', 'menu-title', 'The Night Pact'));
    panel.appendChild(el('p', 'menu-text', 'Swear the dark a little deeper. Each mark makes foes hardier (+12% health) and crueler (+10% damage), and grants +15% Ash.'));
    const val = el('div', 'heat-val', `${d.heat}`);
    panel.appendChild(val);
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Fewer', () => { d.heat = Math.max(0, d.heat - 1); Save.save(); this.openNightPact(); }, 'btn ghost'));
    row.appendChild(this.menuButton('More', () => { d.heat = Math.min(d.maxHeat, d.heat + 1); Save.save(); this.openNightPact(); }, 'btn'));
    panel.appendChild(row);
    panel.appendChild(el('p', 'menu-text dim', `Highest unlocked: ${d.maxHeat}. Restore the dawn to unlock deeper marks.`));
    const r2 = el('div', 'menu-row');
    r2.appendChild(this.menuButton('Done', () => this.closeOverlay(), 'btn ghost'));
    panel.appendChild(r2);
    this.openOverlay(panel, { start: 1, onBack: () => this.closeOverlay() });
  },

  // ------------------------------------------------------------------ title / end screens
  openTitle() {
    const panel = el('div', 'title-screen');
    panel.innerHTML = `<div class="logo"><div class="logo-main">EMBERWAKE</div><div class="logo-sub">The sun is dead. You are what remains.</div></div>`;
    const list = el('div', 'title-menu');
    const hasSave = Save.data.runs > 0;
    list.appendChild(this.menuButton(hasSave ? 'Continue' : 'Begin', () => { this.closeOverlay(); Game.enterHub(true); }, 'btn big'));
    list.appendChild(this.menuButton('Controls', () => this.openControls(() => this.openTitle()), 'btn ghost'));
    list.appendChild(this.menuButton('Settings', () => this.openSettings(() => this.openTitle()), 'btn ghost'));
    panel.appendChild(list);
    panel.appendChild(el('div', 'title-foot', 'WASD move · Mouse aim · Click attack · Right-click special · Space dash · Q cast · E interact'));
    this.openOverlay(panel, {});
  },

  openRunEnd(victory, summary) {
    const panel = el('div', `panel menu end ${victory ? 'victory' : 'death'}`);
    panel.appendChild(el('div', 'end-title', victory ? 'Dawn Returns' : 'The Flame Gutters'));
    panel.appendChild(el('div', 'end-sub', esc(summary.line)));
    const grid = el('div', 'stat-grid');
    const rows = [
      ['Time', formatTime(summary.time)], ['Chambers cleared', summary.rooms], ['Foes extinguished', summary.kills],
      ['Blessings gathered', summary.blessings], ['Ash earned', `+${summary.ash}`], ['Gold left behind', summary.gold],
    ];
    grid.innerHTML = rows.map((s) => `<div class="st-k">${esc(s[0])}</div><div class="st-v">${esc(s[1])}</div>`).join('');
    panel.appendChild(grid);
    if (summary.unlock) panel.appendChild(el('p', 'menu-text unlock', summary.unlock));
    const row = el('div', 'menu-row');
    row.appendChild(this.menuButton('Return to the Hearth', () => { this.closeOverlay(); Game.enterHub(false); }, 'btn big'));
    panel.appendChild(row);
    this.openOverlay(panel, {});
  },
};

// ---------------------------------------------------------------------------
// Permanent upgrades (Kindling Altar)
// ---------------------------------------------------------------------------
const UPGRADES = [
  { id: 'heart', name: 'Ember Heart', desc: '+10 Max Health per rank.', max: 5, cost: (r) => 10 + r * 10 },
  { id: 'might', name: 'Blazing Spirit', desc: '+6% damage per rank.', max: 5, cost: (r) => 15 + r * 15 },
  { id: 'defy', name: 'Second Flame', desc: 'Once per run, rise again with 40% Health. (+1 per rank)', max: 3, cost: (r) => [35, 80, 140][r] },
  { id: 'dash', name: 'Quickening', desc: '+1 Dash charge.', max: 1, cost: () => 60 },
  { id: 'cast', name: 'Kindled Flares', desc: '+1 Cast charge per rank.', max: 2, cost: (r) => [30, 70][r] },
  { id: 'luck', name: 'Star-Touched', desc: 'Blessings are more often Rare or Epic.', max: 3, cost: (r) => 30 + r * 25 },
  { id: 'reroll', name: 'Fickle Fates', desc: '+1 Reroll of blessing choices per run.', max: 3, cost: (r) => 30 + r * 20 },
  { id: 'gold', name: 'Gilded Touch', desc: '+20% Gold found per rank.', max: 3, cost: (r) => 20 + r * 15 },
  { id: 'start', name: 'Warm Start', desc: 'Begin each run with +50 Gold per rank.', max: 2, cost: (r) => 25 + r * 25 },
];

function drawWeaponPreview(cv, id) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const cx = cv.width / 2, cy = cv.height / 2;
  g.save();
  g.globalCompositeOperation = 'lighter';
  drawGlow(g, cx, cy, 50, WEAPONS[id].color, 0.5);
  g.restore();
  g.save();
  g.translate(cx, cy);
  if (id === 'blade') {
    g.rotate(-0.7);
    g.fillStyle = '#3a2a2a'; g.fillRect(-34, -3, 14, 6);
    g.fillStyle = '#c9a060'; g.fillRect(-21, -8, 4, 16);
    const gr = g.createLinearGradient(-16, 0, 40, 0);
    gr.addColorStop(0, '#ffd8a0'); gr.addColorStop(1, '#ff7a2e');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(-17, -5); g.lineTo(32, -3); g.lineTo(42, 0); g.lineTo(32, 4); g.lineTo(-17, 5); g.closePath(); g.fill();
  } else if (id === 'bow') {
    g.strokeStyle = '#c89a50'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.arc(-10, 0, 34, -1.15, 1.15); g.stroke();
    g.strokeStyle = 'rgba(255,240,200,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-10 + Math.cos(1.15) * 34, -Math.sin(1.15) * 34); g.lineTo(-22, 0); g.lineTo(-10 + Math.cos(1.15) * 34, Math.sin(1.15) * 34); g.stroke();
    g.strokeStyle = '#ffd27a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-22, 0); g.lineTo(34, 0); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(40, 0); g.lineTo(30, -5); g.lineTo(30, 5); g.closePath(); g.fill();
  } else {
    drawWheel(g, 0, 0, 26, 0.3);
  }
  g.restore();
}
