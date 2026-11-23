# Emberwake

*The sun is dead. You are what remains.*

A roguelite action dungeon-crawler for the browser. You play the last Ember of a dead sun,
fighting your way up out of the deep through three realms, chamber by chamber. Pick up
blessings from five star-constellations along the way, then fall back to the Hearth to grow
stronger and climb again.

All art is drawn procedurally on a `<canvas>`, and all sound and music is synthesized with
WebAudio, so there are no asset files and no build step.

## Play

Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari). That's it.

If your browser is strict about local files, serve the folder instead:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Progress (Ash, upgrades, unlocked weapons, records) is saved in `localStorage`.

## Controls

| Action    | Keyboard & mouse        | Gamepad        |
|-----------|-------------------------|----------------|
| Move      | `W` `A` `S` `D`         | Left stick     |
| Aim       | Mouse                   | Right stick    |
| Attack    | Left click / `J`        | X / □          |
| Special   | Right click / `K`       | Y / △          |
| Cast      | `Q` / `L` / Middle click| RB / RT        |
| Dash      | `Space` / `Shift`       | A / ✕          |
| Interact  | `E`                     | B / ○          |
| Blessings | `Tab`                   | Back / Select  |
| Pause     | `Esc` / `P`             | Start          |

You can't be hurt while dashing, so dash *through* attacks. Attack right after a dash to
do a Dash-Strike. Without a mouse, attacks aim where you're moving, with gentle aim assist.

## How a run works

- **The Hearth** is the hub. Talk to Old Tallow, spend Ash at the **Kindling Altar**
  (permanent upgrades), choose a weapon at the **Rack of Forms**, check your records in
  **The Chronicle**, and practise on the training wick. When you're ready, take the stairs.
- **Three realms**, each with six chambers, a Respite (Ember Well and shop), and a guardian:
  - *The Cinder Pit*, guarded by **The Kiln Warden**
  - *The Drowned Archive*, guarded by **The Lantern Angler**
  - *The Dawnless Court*, ruled by **The Pale Regent**
- Clear a chamber to earn its reward, then choose your next door. Each door shows what's
  behind it: a blessing, gold, max health, Ash, a Star Fragment, the Sunforge, a shop or a well.
- **Blessings** come from five constellations, and each one has its own element:

  | Constellation | Element | What it does |
  |---------------|---------|--------------|
  | The Stag      | Gale    | Speed, knockback, wall-slams, an extra dash |
  | The Hound     | Storm   | Chain lightning and strikes from above |
  | The Owl       | Frost   | Chill that slows, freezes and shatters |
  | The Serpent   | Bloom   | Stacking Blight (poison) that spreads |
  | The Moth      | Eclipse | Critical hits and delayed Hex bursts |

  Each blessing goes into one slot (Attack, Special, Cast or Dash) or is a passive.
  Legendaries and **Conjunctions** (one for every pair of constellations) appear once you
  meet their requirements.
- **Weapons**: the **Cinderblade** (combo sword), the **Dawnbow** (hold to draw, release at
  full draw for a Perfect Shot) and the **Sunwheel** (a thrown disc you can detonate in
  mid-flight). The **Sunforge** gives each weapon its own upgrades.
- When you die, you keep all the Ash you earned. Restore the dawn once to unlock the
  **Night Pact**, which raises the difficulty for bigger rewards.

## Settings & accessibility

The pause menu has: SFX/music volume, screen-shake intensity, damage numbers,
**Gentle Flame** (take 40% less damage) and an FPS counter.

## For developers

Plain JavaScript (classic `<script>` tags), with no dependencies or bundler.

```
index.html        page shell + HUD/menus markup
css/style.css     UI styling
js/util.js        math, color, easing helpers
js/input.js       keyboard / mouse / gamepad → actions
js/audio.js       synthesized SFX + generative music
js/save.js        localStorage persistence
js/icons.js       constellation glyphs, reward & slot icons
js/fx.js          particles, telegraphs, slashes, lightning, floating text
js/map.js         room generation, collision, raycasts, flow-field pathing, pre-rendering
js/combat.js      actors, status effects, damage pipeline, projectiles
js/blessings.js   constellations, blessings, Conjunctions, the Build
js/weapons.js     weapons, casts, Sunforge upgrades
js/player.js      the Ember: input buffering, actions, dash, cast
js/enemies.js     enemy actor + all foes (attacks are generator functions)
js/bosses.js      the three guardians
js/scene.js       a chamber: update loop, render pipeline, lighting, props, shop
js/ui.js          HUD, dialogue, choice cards, menus, hub screens
js/game.js        state machine, hub, run flow, rewards, camera
js/main.js        boot + main loop
```

Add `?debug` to the URL for test keys during a run: `1` kill all · `2` clear chamber ·
`3` blessing · `4` jump to guardian · `5` +gold/Ash · `6` god mode · `7` next realm · `8` Sunforge.
