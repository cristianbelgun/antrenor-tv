# Sunet și muzică Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add audible timer cues, a per-second tempo tick (with figure animation in sync), and energetic background music (generated, or the user's MP3s from `muzica/`) to Antrenor TV.

**Architecture:** Pure modules decide *what* sounds when:
- `tempo.js`: rep cycles per exercise.
- `music.js`: a seeded composition and its notes per bar.
- Session effects: which cue fires at which moment.

One `audio.js` module owns the single AudioContext:
- a music bus and a signal bus, with ducking;
- the tick scheduler;
- the generated-music scheduler;
- the MP3 player;
- the volume setting.

`app.js` tells `audio.js` which screen is showing.

**Tech Stack:** Vanilla JS (ES2017 classic scripts), Web Audio API, PHP 7.4+ (`api.php`), node:test, Playwright (pre-installed).

**Spec:** `docs/superpowers/specs/2026-11-25-sunet-si-muzica-design.md`. Base app spec: `docs/superpowers/specs/2026-11-25-antrenor-tv-design.md`.

## Global Constraints

- Chromium 79+: no `?.`, `??`, ES modules, class fields. Module pattern as in existing `js/*.js` (attach to `window.AT`, `module.exports` for Node).
- No sound before the first key press. Music never plays on `home`.
- Music tempo is **120 BPM**. The tick is 1 per second, i.e. every 2 beats.
- Cue sounds:
  - short: 880 Hz, 120 ms
  - long: 660 Hz, 600 ms
  - double: two short ones, 120 ms apart
  - high double (`high2`): two 1046 Hz, 120 ms
- Ducking: music drops to 30% while a cue sounds and recovers in ~0.4 s. The tick never ducks.
- Volume: 0–100 in steps of 10, default 60, stored at `localStorage['at.music']`. At 0 the music engine is stopped.
- Music runs from the warm-up (or the first exercise on resume) until summary, exit or home, with a ~1 s fade-out.
- All UI copy in Romanian with diacritics.
- Tests: `node --test "test/*.test.js"` and `node test/e2e.spec.js`.

## Review Focus

1. **Audio before any key press or a suspended AudioContext:** nothing throws, the app works silently. Test: Task 4 `audio calls before init are safe`.
2. **MP3 list request fails or returns 403:** generated music is used. Test: Task 4 `playlist failure falls back to generated`.
3. **Volume 0:** the music engine stops entirely (CPU), but cues and ticks still sound. Test: Task 4 `volume 0 stops music but not cues`.
4. **Leaving the exercise screen mid-tempo** (OK, ◀▶, Back): the ticks stop at once. Test: Task 6 e2e `tempo stops when leaving exercise`.
5. **Resumed workout** (no warm-up): music starts on the first exercise screen. Test: Task 4 `sceneMode` table.

---

## File Structure

```
js/tempo.js          NEW  rep cycles per exercise, "Ritm:" text, tick times, figure position at time t
js/music.js          NEW  seeded composition + notes per bar (pure); no Web Audio here
js/audio.js          NEW  AudioContext, buses, cues, ducking, ticks, music scheduler, MP3 player, volume
js/session.js        MOD  cue effects (rest 3-2-1, warm-up changes, plank 30 s / target), volume effects
js/figures.js        MOD  mount(svg, id, opts) can follow a tempo cycle
js/ui.js             MOD  "Ritm: …", volume badge, home music line; beep effects go to audio
js/app.js            MOD  init audio on first key; scene changes; tempo start/stop; playlist load
index.html           MOD  script tags for tempo.js, music.js, audio.js (before ui.js)
api.php              MOD  GET action=music → mp3 list from muzica/
scripts/build-zip.sh MOD  include muzica/CITESTE-MA.txt
docs/configurare.md  MOD  paragraph on adding MP3s
```

---

### Task 1: Tempo cycles

**Files:** Create `js/tempo.js`. Test: `test/tempo.test.js`.

**Interfaces:**
- Produces `AT.tempo`:
  - `forExercise(exerciseId: string, level: number) -> Tempo | null`. Null for levels 0 and 3, and for plank.
    - `Tempo = { exerciseId, level, period: number /*s*/, phases: [{ label: string, sec: number, to: 0|1|null }] }`
    - `to` is the figure key the phase moves toward; `null` = hold.
  - `text(t: Tempo) -> string`, e.g. `'Ritm: jos 3 s · sus 1 s'`
  - `ticks(t: Tempo, fromSec: number, toSec: number) -> [{ at: number /*s from cycle start*/, accent: boolean }]`. One per whole second; accent when `at % period === 0`.
  - `position(t: Tempo, sec: number) -> number /*0..1*/`. Figure pose parameter at time `sec` from cycle start: moves with ease-in-out within a phase and stays still in a hold.

Phase tables (spec §6). `top` = goblet-squat, pushup, rdl, reverse-lunge, floor-press; `bottom` = db-row, biceps-curl, lateral-raise, overhead-press; `dead-bug` separate. Labels:

| group | level 1 | level 2 |
|---|---|---|
| top | `jos` 3 →1, `sus` 1 →0 | `jos` 3 →1, `ține` 2 null, `sus` 1 →0 |
| bottom | `sus` 1 →1, `jos` 3 →0 | `sus` 1 →1, `ține` 2 null, `jos` 3 →0 |
| dead-bug | `întinde` 3 →1, `revino` 1 →0 | `întinde` 3 →1, `ține` 2 null, `revino` 1 →0 |

- [ ] **Step 1: Write failing tests:**
  - `forExercise('pushup',0)`, `('pushup',3)` and `('plank',1)` are null.
  - `forExercise('goblet-squat',1).period === 4`; `('db-row',2).period === 6`.
  - `text(forExercise('goblet-squat',1)) === 'Ritm: jos 3 s · sus 1 s'`; `text(forExercise('biceps-curl',2)) === 'Ritm: sus 1 s · ține 2 s · jos 3 s'`; `text(forExercise('dead-bug',1)) === 'Ritm: întinde 3 s · revino 1 s'`.
  - `ticks(level1, 0, 8)` gives at = [0..7] with accents at 0 and 4 only.
  - `position(goblet L1, 0) === 0`, `position(…, 3) === 1`, `position(…, 1.5)` is strictly between 0 and 1, `position(…, 4) === 0`.
  - `position(curl L2, 1) === 1`, `position(curl L2, 2.5) === 1` (hold), `position(curl L2, 6) === 0`.
- [ ] **Step 2: Run** `node --test test/tempo.test.js` and expect FAIL (module missing).
- [ ] **Step 3: Implement** `js/tempo.js`.
- [ ] **Step 4: Run** the tests and expect PASS.
- [ ] **Step 5: Commit** `feat: tempo cycles per exercise`

### Task 2: Cue and volume effects in the state machine

**Files:** Modify `js/session.js`. Test: `test/session.test.js` (update the existing beep test, add new ones).

**Interfaces:**
- Consumes: `AT.progression.top`
- Produces: the effect `{type:'beep', kind:'short'|'long'|'double'|'high2'}` (replaces `{type:'beep', long}`), and `{type:'volume', delta: 10|-10}`.

Rules:
- **rest TICK:** `short` once each when crossing 3, 2 and 1 s left; `long` at 0 (then go to the exercise, as now). Track the last cue second in state, e.g. `s.cueSec`.
- **warmup TICK:**
  - `double` once each when elapsed crosses 60, 120 and 240 s (`elapsed = t - (warmupEnd - 360000)`);
  - `long` at the end, as now.
- **plank TICK** (currently a no-op): `short` once when elapsed reaches 30 s; `high2` once when it reaches `AT.progression.top('plank', history.state)`.
- **exercise and warmup UP/DOWN:** emit `volume` ±10 and do not change the state.

- [ ] **Step 1: Update and write failing tests:**
  - Rewrite `rest: ±15 s …` so the beeps across a 60 s rest are `['short','short','short','long']` (by `kind`).
  - `warm-up cues at 1, 2, 4 min`: waiting 360 s gives kinds `['double','double','double','long']`.
  - `plank cues at 30 s and target`: waiting 46 s on plank gives `['short','high2']`; with `plankTarget: 50` the `high2` arrives only after 50 s.
  - `UP on exercise emits volume +10`: the effect is `{type:'volume',delta:10}` and the screen is unchanged; `DOWN on warmup` gives `-10`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** in `js/session.js`.
- [ ] **Step 4: Run** `node --test "test/*.test.js"` and expect PASS.
- [ ] **Step 5: Commit** `feat: timer cues and volume effects`

### Task 3: Music composition (pure)

**Files:** Create `js/music.js`. Test: `test/music.test.js`.

**Interfaces:**
- Produces `AT.music`:
  - `BPM = 120`
  - `compose(seed: number) -> Composition`: deterministic for a seed. Picks a minor key (root MIDI 45–52) and a 4-chord progression from at least 4 options.
  - `bar(c: Composition, index: number, mode: 'play'|'rest') -> Note[]`
    - `Note = { inst: 'kick'|'hat'|'clap'|'bass'|'lead', beat: number /*0..4*/, midi?: number, dur: number /*beats*/ }`
  - `rng(seed) -> () => number`: small seeded PRNG (mulberry32).
- Rules:
  - kick on beats 0, 1, 2, 3; clap on 1 and 3; hat on 0.5, 1.5, 2.5, 3.5;
  - bass in eighths on the chord root, with the pattern varied per 8-bar section;
  - lead (arpeggio of chord tones) only in `play` mode, and in each 8-bar section present or absent according to the composition;
  - every 8th bar (index % 8 === 7) may be a drum break (no kick) according to the composition;
  - chord = `progression[index % 4]`.
- At most 24 notes per bar (CPU limit).

- [ ] **Step 1: Write failing tests:**
  - `compose(7)` deep-equals `compose(7)`, and `compose(7)` ≠ `compose(8)` for at least one of key or progression across seeds 1..10.
  - Bar 0 in `play` mode has kick beats `[0,1,2,3]`, clap `[1,3]` and 4 hats.
  - `rest` mode never contains `lead` in bars 0..63.
  - Across bars 0..63 in `play` mode, both "a section with lead" and "a section without lead" occur for some seed in 1..5 (variation exists).
  - Bass notes are within 2 octaves of the root.
  - Every bar has ≤ 24 notes.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** `js/music.js`.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat: generated music composition`

### Task 4: Audio engine

**Files:** Create `js/audio.js`. Test: `test/audio.test.js`, using a minimal fake AudioContext defined in the test that records created nodes and `start(when)` calls.

**Interfaces:**
- Consumes: `AT.music`, `AT.tempo`
- Produces `AT.audio`:
  - `init(opts?: {Ctx?, storage?})`: creates the context (call from a key press; safe to call repeatedly).
  - `sceneMode(screen) -> 'play'|'rest'|'off'`:
    - `warmup`, `exercise`, `plank` → `play`;
    - `rest`, `log`, `confirmExit` → `rest`;
    - `home`, `summary`, `loading` → `off`.
  - `setScene(screen)`: starts, switches or fades out music per `sceneMode`.
  - `signal(kind)`: plays a cue on the signal bus and ducks music for its length + 0.4 s.
  - `startTempo(t: Tempo) -> number`: starts ticks aligned to the next even music beat (or now + 0.1 s with MP3s or no music). Returns the cycle start as `performance.now()` milliseconds, for the figure.
  - `stopTempo()`
  - `setVolume(pct)` / `changeVolume(delta)` / `volume() -> number`: persisted at `at.music`. Default 60; clamped to 0–100.
  - `usePlaylist(files: string[], baseUrl: 'muzica/')`: an empty list means generated music.
  - `loadPlaylist(fetchFn, secret) -> Promise<void>`: calls `api.php?action=music&secret=…`. On any failure it keeps generated music.
  - `state() -> { ctx: boolean, mode, source: 'generated'|'mp3'|'none', tempo: boolean, volume }`
  - `events: Array<{type, kind?, at}>` holds the last 50 cues and ticks fired (for tests and debugging).
- Generated scheduler: a 100 ms `setInterval` look-ahead that schedules notes 0.25 s ahead via `AT.music.bar`. Instruments:
  - kick: sine with a pitch drop;
  - hat and clap: short noise bursts through a highpass/bandpass filter;
  - bass: square into a lowpass;
  - lead: triangle.
- MP3 player: `new Audio(url)` through `ctx.createMediaElementSource` into the music bus. On `ended`, the next shuffled file plays. If `createMediaElementSource` throws, the element plays directly with `volume` = pct/100 (no ducking).

- [ ] **Step 1: Write failing tests**:
  - `audio calls before init are safe`: `signal`, `setScene`, `startTempo`, `stopTempo` and `changeVolume` before `init` do not throw.
  - The `sceneMode` table matches the list above.
  - Volume: default 60; `changeVolume(10)` ×5 gives 100; `setVolume(-5)` gives 0; the value is persisted in the fake storage, and a new engine with the same storage reads 100 back.
  - `volume 0 stops music but not cues`: after `init` + `setScene('exercise')` + `setVolume(0)`, `state().mode === 'off'` for music, and `signal('short')` still appends to `events`.
  - `playlist failure falls back to generated`: `loadPlaylist` with a fetch that rejects or returns 403 gives `state().source === 'generated'` after `setScene('exercise')`. With `{ok:true, files:['a.mp3']}` it is `'mp3'`.
  - `startTempo` then `stopTempo`: `state().tempo` goes true → false.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** `js/audio.js`. Wrap every Web Audio call in try/catch, so a TV that refuses something stays silent instead of breaking.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Listen check:** write `test/listen.html` (not shipped), which plays 16 bars of generated music in `play` mode then 8 in `rest`, with cues and a tempo over it. Open it in Playwright, record nothing, just confirm no console errors. Note in the ledger that a human listen is pending.
- [ ] **Step 6: Commit** `feat: audio engine (cues, ducking, tempo ticks, music, mp3)`

### Task 5: MP3 list endpoint and packaging

**Files:** Modify `api.php`, `scripts/build-zip.sh`, `docs/configurare.md`. Test: `test/api.test.js`.

**Interfaces:**
- Produces:
  - `GET api.php?action=music&secret=S` → `{"ok":true,"files":["a.mp3",…]}`, sorted, `.mp3` only (case-insensitive), no subfolders or hidden files. Missing folder → `files: []`. Wrong secret → 403 as for `all`.
  - The zip contains `antrenor/muzica/CITESTE-MA.txt` (Romanian, 3 lines: put `.mp3` files here; they play in random order; delete them all to return to generated music).

- [ ] **Step 1: Write failing tests:**
  - With `muzica/` holding `b.mp3`, `A.MP3`, `x.txt`, `.hidden.mp3` and a subfolder `sub/c.mp3`, the result is `['A.MP3','b.mp3']`.
  - With no folder, `[]`.
  - The wrong secret gives 403.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** the `action=music` branch, the zip change and the docs paragraph (section „6. Muzica ta (opțional)”: cPanel File Manager → `antrenor/muzica` → Upload `.mp3`).
- [ ] **Step 4: Run** `node --test test/api.test.js`, `php -l api.php` and `bash scripts/build-zip.sh testkey123 && unzip -l dist/antrenor-tv.zip | grep CITESTE-MA` and expect PASS, no syntax errors and the file listed.
- [ ] **Step 5: Commit** `feat: optional mp3 folder`

### Task 6: Figures in tempo, UI and wiring

**Files:** Modify `js/figures.js`, `js/ui.js`, `js/app.js`, `index.html`. Test: `test/figures.test.js`, `test/e2e.spec.js`.

**Interfaces:**
- Consumes: `AT.tempo`, `AT.audio`
- Produces:
  - `AT.figures.mount(svg, exerciseId, opts?: { tempo?: Tempo, startAt?: number /*performance.now ms*/ })`. With a tempo, `p = AT.tempo.position(tempo, ((now - startAt)/1000) mod period)`; otherwise the current cosine loop.
  - Exercise screen:
    - adds `<div class="ritm">` with `AT.tempo.text(...)` under the tip when a tempo applies;
    - a volume badge `♪ 60%` (`#vol`, shown 2 s after a volume change, `Muzică oprită` at 0).
  - Home: the line `Muzică: 60% · schimbi din ▲▼ în timpul seriei` (or `Muzică: oprită · …` at 0).
  - `app.js`:
    - first keydown → `AT.audio.init()` + `AT.audio.loadPlaylist(fetch, secret)` once;
    - after each dispatch → `AT.audio.setScene(s.screen)`;
    - on entering `exercise` with a tempo → `startAt = AT.audio.startTempo(t)`, then mount the figure with it;
    - on leaving `exercise` → `AT.audio.stopTempo()`;
    - effects: `beep` → `AT.audio.signal(kind)`, `volume` → `AT.audio.changeVolume(delta)` + show the badge.
  - Remove the old `beep()` / `ensureAudio()` from `ui.js` (audio.js owns sound).

- [ ] **Step 1: Write failing tests:**
  - figures: `tempo-driven pose follows AT.tempo.position`. Call an exported pure helper `AT.figures.paramAt(opts, nowMs)` and check it equals `AT.tempo.position` for a goblet L1 tempo at 0, 1.5 and 3 s; with no tempo it equals the cosine ease.
  - e2e `tempo shown and ticking`:
    - seed localStorage with state `progression: { 'goblet-squat': { level: 1, extraSets: 0 } }` and `firstWorkoutAt` 20 days earlier;
    - run A to the first exercise; the text contains `Ritm: jos 3 s · sus 1 s`;
    - after `runFor(4000)`, `AT.audio.events` has ≥ 3 ticks, the first one accented.
  - e2e `tempo stops when leaving exercise`: press Enter (to log); `AT.audio.state().tempo === false`.
  - e2e `music follows screens`:
    - `AT.audio.state().mode` is `'off'` on home before any key;
    - `'play'` on warm-up and exercise;
    - `'rest'` on rest;
    - `'off'` on summary (extend the existing workout A test).
  - e2e `volume keys`: ArrowUp on the exercise screen gives `#vol` text `♪ 70%`, and `localStorage['at.music'] === '70'`.
- [ ] **Step 2: Run** `node --test "test/*.test.js"` and `node test/e2e.spec.js` and expect FAIL.
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run** both commands and expect PASS. Look at the exercise screenshot (ritm line, badge).
- [ ] **Step 5: Commit** `feat: tempo ticks, music and cues wired into the TV app`

### Task 7: Release zip

- [ ] **Step 1:** Rebuild the zip with the existing key (`bash scripts/build-zip.sh <key>`) and smoke-test it with `php -S`: `api.php?action=music` returns `{"ok":true,"files":[]}`.
- [ ] **Step 2:** Push `main` to `origin`.
