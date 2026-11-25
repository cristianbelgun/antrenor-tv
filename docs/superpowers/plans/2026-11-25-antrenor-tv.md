# Antrenor TV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web app for an LG webOS TV that guides the user's A/B strength workouts with animated stick figures, a rest timer and per-set rep logging, with history kept in a Google Sheet.

**Architecture:** Plain HTML/CSS/JS files with no build step, served by GitHub Pages. The logic lives in pure modules (program data, schedule, progression, workout state machine, sync store), each attached to `window.AT` and also exported for Node tests. The UI is a thin renderer plus key handler over the state machine. History goes to `localStorage` first, then to a Google Apps Script web app that writes rows into a Google Sheet.

**Tech Stack:** Vanilla JS (ES2017, classic scripts, no ES modules, no bundler), CSS with container-relative units, SVG figures, Node 22 `node:test` for unit tests, Playwright (pre-installed) for the end-to-end smoke test, and Google Apps Script for the Sheet backend.

**Spec:** `docs/superpowers/specs/2026-11-25-antrenor-tv-design.md` (approved sketches: `docs/superpowers/specs/2026-11-25-schite-ecrane.html`)

## Global Constraints

- All UI text is in Romanian, with diacritics (ă, â, î, ș, ț).
- Target: LG UA74003LB, webOS 25 expected. Code must also run on Chromium 79+: no optional chaining, no `??`, no ES modules, no top-level await, no CSS `:has()`.
- Keys: ArrowUp/Down/Left/Right, Enter (keyCode 13) = OK, Back = keyCode 461 or Escape/Backspace. Everything focusable is also clickable (Magic Remote pointer).
- Layout: 16:9 stage, dark theme, sizes in `cqw` or `vw`, matching the sketch. Target number ~8% of width, exercise name ~4.6%, secondary text ≥1.5%.
- Default rest is 90 s; ▲▼ change it by ±15 s within 60–120 s. Beep at 3 s left and at 0.
- Warm-up timer: 6:00.
- Training days: Monday, Wednesday, Friday (`Date.getDay()` 1, 3, 5).
- First 14 days after `firstWorkoutAt`: 2 sets per exercise.
- Sheet sync: GET timeout 5 s; the offline banner text is `Fără conexiune, salvez pe televizor`.
- No claude.ai dependency of any kind (Cloudflare blocks the TV).
- Third-party exercise images are not used. All figures are drawn procedurally.
- Every Node test runs with `node --test test/`.

## Review Focus

1. **TV loses Wi-Fi mid-workout:** sets keep saving locally, the workout continues, and the outbox flushes on next load with no duplicate rows. Test: Task 5 `flush retries and server dedupes by id` and Task 6 `duplicate set id is ignored`.
2. **Page closed mid-workout and reopened the same day:** the home screen offers to continue at the right exercise and set. Test: Task 2 `findResumable` and Task 4 `resume starts at next unsaved set`.
3. **Unfinished workout from a previous day:** it is auto-closed and counts toward the A/B alternation. Test: Task 2 `closeStale + nextWorkoutType`.
4. **Very first run with empty history:** the plan shows Antrenamentul A, "Ultima dată: —" and the log default equals the target minimum. Test: Task 3 `lastValues empty`, Task 4 `log default without history`.
5. **Key repeat or double OK on the log screen:** exactly one set is saved. Test: Task 4 `OK on log emits one saveSet and leaves log screen`.

---

## File Structure

```
index.html            stage markup + script tags in dependency order
css/app.css           tokens, stage, the 7 screens
js/config.js          AT.config = { sheetUrl, secret } (filled in Task 9)
js/program.js         exercises + workouts (data only)
js/schedule.js        which workout, set counts, week number, resume / stale
js/progression.js     last values, top, method level, suggestion copy, advance
js/session.js         pure state machine: next(state, action, ctx) -> {state, effects}
js/store.js           localStorage + outbox + Sheet sync
js/figures.js         skeleton, poses for 11 exercises, SVG renderer
js/ui.js              render(state) per screen + key mapping + effects runner
js/app.js             bootstrap: load store, start ticking, wire keys
apps-script/Code.gs   Sheet backend (doGet/doPost + pure handlers)
test/*.test.js        node:test unit tests
test/e2e.spec.js      Playwright smoke (run with node, not @playwright/test)
docs/configurare.md   Romanian setup guide (GitHub Pages + Sheet)
```

Module pattern for every `js/*.js` file, so the same file loads in the browser and in Node:

```js
(function (root) {
  var AT = root.AT = root.AT || {};
  // ... define, then:
  AT.schedule = { /* exports */ };
  if (typeof module === 'object' && module.exports) module.exports = AT.schedule;
})(typeof window !== 'undefined' ? window : globalThis);
```

In Node, `require` dependencies first (for example `require('../js/program.js')` before `schedule.js`), since they share `globalThis.AT`.

## Shared data shapes (used by every task)

```
Exercise  { id, name, sets, min, max, unit: 'reps'|'seconds', per: null|'picior'|'parte', tip }
Workout   { id, type: 'A'|'B', startedAt: ISO, finishedAt: ISO|null }
SetRec    { id, workoutId, type, exerciseId, exerciseName, setIndex (1-based), value, unit, method: 0|1|2|3, at: ISO }
State     { firstWorkoutAt: ISO|null, progression: { [exerciseId]: { level: 0|1|2|3, extraSets: 0|1, plankTarget?: number } } }
History   { workouts: Workout[], sets: SetRec[], state: State }
```

IDs come from `AT.store.newId()`, which returns `Date.now().toString(36) + '-' + random base36 (8 chars)`.

---

### Task 1: Scaffold + program data

**Files:**
- Create: `package.json` (`{"name":"antrenor-tv","private":true,"scripts":{"test":"node --test test/"}}`), `.gitignore` (`node_modules/`, `test-results/`), `js/program.js`
- Test: `test/program.test.js`

**Interfaces:**
- Produces: `AT.program.EXERCISES: { [id]: Exercise }`, `AT.program.WORKOUTS: { A: string[], B: string[] }`, `AT.program.exercise(id) -> Exercise` (throws on an unknown id), `AT.program.WARMUP: string[]`

- [ ] **Step 1: Write the failing test** `test/program.test.js`:
  - `WORKOUTS.A` deep-equals `['goblet-squat','pushup','db-row','overhead-press','biceps-curl','plank']`, and `WORKOUTS.B` deep-equals `['rdl','reverse-lunge','floor-press','lateral-raise','biceps-curl','dead-bug']`.
  - Every id in both lists exists in `EXERCISES`. There are exactly 11 exercises.
  - Spot values: `exercise('pushup')` → `{sets:3,min:8,max:15,unit:'reps',per:null}`. `exercise('plank')` → `{min:30,max:45,unit:'seconds'}`. `exercise('reverse-lunge')` → `{min:10,max:10,per:'picior'}`. `exercise('dead-bug')` → `{min:10,max:12,per:'parte'}`. `exercise('lateral-raise')` → `{min:12,max:15}`.
  - Every exercise has a non-empty `name` and `tip`.
  - `WARMUP.length === 4`.
- [ ] **Step 2: Run** `node --test test/` and expect FAIL (cannot find module).
- [ ] **Step 3: Implement `js/program.js`.** Names, targets and tips are copied verbatim from the table in spec §5. Use these `WARMUP` lines: `Mers pe loc – 1 min`, `Rotiri de brațe – 1 min`, `Balansări de șold – 2 min`, `Genuflexiuni fără greutate – 2 min`.
- [ ] **Step 4: Run** `node --test test/` and expect PASS.
- [ ] **Step 5: Commit** `feat: program data for workouts A and B`

### Task 2: Schedule

**Files:** Create `js/schedule.js`. Test: `test/schedule.test.js`.

**Interfaces:**
- Consumes: `AT.program`
- Produces:
  - `nextWorkoutType(workouts: Workout[]) -> 'A'|'B'`: opposite of the type of the most recent workout by `startedAt` (finished or not); `'A'` if there are none.
  - `isTrainingDay(date: Date) -> boolean`
  - `setsFor(exerciseId, state: State, today: Date) -> number`: `2` if `firstWorkoutAt` is null or `today < firstWorkoutAt + 14 days`; otherwise `exercise.sets + (progression[id].extraSets || 0)`.
  - `weekNumber(state, today) -> number`: `1` if `firstWorkoutAt` is null; otherwise `floor(days since first / 7) + 1`.
  - `findResumable(workouts, today) -> Workout|null`: unfinished and `startedAt` on the same local calendar day.
  - `closeStale(workouts, sets, today) -> Workout[]`: unfinished workouts from earlier days, returned as copies with `finishedAt` = latest `at` of their sets, or `startedAt` if they have none.

- [ ] **Step 1: Write failing tests**:
  - `nextWorkoutType([])` is `'A'`. After an A it is `'B'`. After the sequence A, B, A (finished) it is `'B'`.
  - `isTrainingDay` is true on 2026-11-23 (Mon), 25 (Wed) and 27 (Fri), and false on 24, 26, 28 and 29.
  - `setsFor('pushup')`: 2 on day 13 after first, 3 on day 14, and 4 when `progression.pushup.extraSets === 1` on day 20.
  - `weekNumber` is 1 on day 0, 1 on day 6 and 3 on day 14.
  - `findResumable` returns today's unfinished workout and ignores yesterday's.
  - `closeStale + nextWorkoutType`: yesterday's unfinished A gets `finishedAt` = its last set time, and `nextWorkoutType` is then `'B'`.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** with local-date comparison (`toDateString()`).
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat: workout schedule rules`

### Task 3: Progression

**Files:** Create `js/progression.js`. Test: `test/progression.test.js`.

**Interfaces:**
- Consumes: `AT.program`, `AT.schedule.setsFor`
- Produces:
  - `lastValues(exerciseId, history, excludeWorkoutId?) -> number[]`: values by `setIndex` from the most recent **finished** workout (any type, my call: biceps curls appear in both A and B) that has sets of this exercise; `[]` if there is none.
  - `lastSameType(type, history, excludeWorkoutId) -> Workout|null`: used by the summary.
  - `top(exerciseId, state) -> number`: `progression.plank.plankTarget` for plank if set; otherwise `exercise.max`.
  - `suggestion(exerciseId, state) -> string|null`: copy for the current level (below), or null at level 0.
  - `advance(state, workoutSets: SetRec[], workoutExerciseIds: string[], today) -> State`: returns a new state; it never mutates.
  - `METHOD_LABEL = ['', 'coborâre lentă', 'pauză în poziția grea', 'serie în plus']`

Exact copy for `suggestion` (T = `top()`):
- level 1: `Ai atins ${T} la toate seriile. Încearcă azi coborârea lentă, în 3 secunde.`
- level 2: `Ai atins ${T} la toate seriile cu coborâre lentă. Adaugă azi o pauză de 1–2 secunde în poziția grea.`
- level 3 (not plank): `Ai atins ${T} la toate seriile. Azi faci o serie în plus.`
- plank at level 3 with `plankTarget`: `Ținta de azi: ${T} de secunde.`

`advance` rule, applied per exercise in the workout: the exercise "hit" if the number of saved sets ≥ `setsFor(...)`, every value ≥ `top()`, and every set's `method === level`. On a hit:
- level 0→1, 1→2, 2→3 (at 3, set `extraSets: 1`).
- At level 3, plank gets `plankTarget = min(60, (plankTarget || 45) + 5)`; other exercises stay.

`advance` also sets `firstWorkoutAt` if it is null (to the earliest set `at`).

- [ ] **Step 1: Write failing tests**:
  - `lastValues empty` returns `[]`.
  - `lastValues` picks the newest finished workout and ignores an unfinished one, plus the `excludeWorkoutId` case.
  - `advance` 0→1 when all of pushup's 3 sets are ≥ 15. No change when one set is 14. No change when a set has `method` ≠ level.
  - At level 3 the result has `extraSets:1`.
  - Plank at level 3: `plankTarget` goes 45→50, then 55→60, and stays at 60.
  - `suggestion` returns the exact strings for levels 1, 2 and 3, and null at 0.
  - Reverse lunge hits with all values ≥ 10.
  - `advance` does not mutate its input (deep-equal snapshot before and after).
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat: progression rules and suggestion copy`

### Task 4: Workout state machine

**Files:** Create `js/session.js`. Test: `test/session.test.js`.

**Interfaces:**
- Consumes: `AT.program`, `AT.schedule`, `AT.progression`, `AT.store.newId` (inject via `ctx.newId` so tests don't need the store).
- Produces: `AT.session.home(history, now: Date) -> SState` and `AT.session.next(s: SState, action, ctx) -> { state: SState, effects: Effect[] }`
  - `action`: `{type:'OK'|'UP'|'DOWN'|'LEFT'|'RIGHT'|'BACK'|'TICK', now: Date}`
  - `ctx`: `{ history: History, newId: () => string }`
  - `Effect`: `{type:'saveWorkout', workout}` | `{type:'saveSet', set}` | `{type:'saveState', state}` | `{type:'beep', long:boolean}` | `{type:'fullscreen'}`
  - `SState.screen` is one of `'home'|'warmup'|'exercise'|'plank'|'log'|'rest'|'summary'|'confirmExit'`. Other fields are the builder's choice, but must include `workout`, `exIds`, `exIndex`, `setIndex`, `setsPlanned` (array per exercise), `value`, `restTotal`, `restEnd` (ms), `warmupEnd` (ms), `plankStart`, `resumable` (Workout|null), `dayKind` (`'training'|'rest'`).

Transitions (anything not listed is a no-op):

| screen | action | result |
|---|---|---|
| home | OK | if `resumable` exists: resume (below). Otherwise create the workout (`saveWorkout`, plus `fullscreen`) → warmup, `warmupEnd = now + 360000` |
| home | DOWN/UP | toggles the focused button between primary and secondary: on a rest day, "Fă totuși antrenamentul X"; with a resumable workout, "Începe din nou", which starts a new workout of the same type |
| warmup | OK, or TICK past `warmupEnd` | → exercise 0, set 1 |
| exercise | OK | plank → `plank` with `plankStart = now`; otherwise → log with `value` = `lastValues[setIndex-1]`, else the last element of `lastValues`, else `exercise.min` |
| exercise | LEFT/RIGHT | previous/next exercise, set index = first unsaved set of that exercise |
| exercise | BACK | → confirmExit |
| plank | OK | → log with `value = round((now − plankStart)/1000)` |
| log | UP/DOWN | `value` ±1, min 0 |
| log | OK | emit **one** `saveSet` (`method = progression level`). Last set of last exercise → summary (emit `saveWorkout` with `finishedAt`, then `saveState` with `advance(...)`). Otherwise → rest, `restTotal = 90000`, `restEnd = now + 90000` |
| log | BACK | → exercise, nothing saved |
| rest | UP/DOWN | `restTotal` ±15000 within 60000–120000, and `restEnd` moves by the same delta |
| rest | TICK | emit `beep{long:false}` once when crossing 3 s left. At 0: `beep{long:true}`, then advance to the next set or next exercise |
| rest | OK | skip to the next set or exercise |
| confirmExit | OK | → home (the workout stays unfinished and resumable) |
| confirmExit | BACK | → exercise |
| summary | OK | → home (recomputed) |

**Resume:** for each exercise, count saved sets for this workout and go to the first exercise whose count < planned, at set count + 1.

- [ ] **Step 1: Write failing tests** with a fixed `now` and a fake `newId` counter:
  - **Full workout B on empty history:** drive it with actions. Expect 2 sets per exercise (first two weeks), 12 `saveSet` effects in order, and the screen sequence home→warmup→exercise→log→rest…→summary. The summary emits `saveWorkout` with `finishedAt` set and one `saveState`.
  - `log default without history`: value equals `exercise.min`. With history `[12,11]`, set 2 defaults to 11 and set 3 defaults to 11.
  - `OK on log emits one saveSet and leaves log screen`: a second OK on the resulting rest screen emits no `saveSet`.
  - Plank: OK, then 38 s later OK → log value 38, unit `seconds`.
  - Rest: UP at 90 s → 105 s total, and UP ×3 caps at 120 s. Exactly one short beep when TICK crosses 3 s left.
  - `resume starts at next unsaved set`: today's B with 3 sets of `rdl` saved and 1 of `reverse-lunge` (3 planned) resumes at reverse-lunge set 2.
  - BACK on log saves nothing. BACK then OK on confirmExit → home with `resumable` set.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** `next` as a switch on the screen. No timers, DOM or Date.now inside: time comes only from `action.now`.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat: workout state machine`

### Task 5: Store and sync client

**Files:** Create `js/store.js`. Test: `test/store.test.js`.

**Interfaces:**
- Produces:
  - `AT.store.newId() -> string`
  - `AT.store.create({ storage, fetchFn, url, secret, timeoutMs = 5000 }) -> Store`
  - `Store.load() -> Promise<{ history: History, online: boolean }>`: reads local data and calls `GET url?secret=…&action=all` (with timeout). On success it merges remote and local by id (a local workout with `finishedAt` wins over a remote one without it) and saves the merge locally. On failure it returns local only with `online:false`. Before returning it applies `AT.schedule.closeStale` and queues those workouts.
  - `Store.saveWorkout(w)`, `Store.saveSet(s)`, `Store.saveState(st)`: write locally and push `{kind:'workout'|'set'|'state', data}` to the outbox (also in storage). They return immediately and trigger `flush()` in the background.
  - `Store.flush() -> Promise<boolean>`: `POST url`, `Content-Type: text/plain;charset=utf-8`, body `JSON.stringify({secret, ops})`. It clears the outbox only on a response `{ok:true}`. Only one flush runs at a time; if another is requested meanwhile, it runs again after.
  - `Store.online: boolean` (last known)
- localStorage keys: `at.history` (History JSON) and `at.outbox` (ops array). Wrap every storage access in try/catch.

- [ ] **Step 1: Write failing tests** with an in-memory `storage` and a scripted `fetchFn`:
  - `load` merges remote and local without duplicates.
  - `load` with a fetch that never resolves returns after `timeoutMs` (use 50 in the test) with `online:false` and local data.
  - `saveSet` with fetch rejecting leaves 1 op in the outbox. A new store on the same storage keeps it, and `flush` with a working fetch clears it. Call this test `flush retries and server dedupes by id`: the posted ops keep the same `set.id` across retries.
  - A stale unfinished workout from yesterday comes back closed from `load`, and a `workout` op is queued.
  - Storage that throws on every call: `load` still resolves.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat: local store with Sheet sync outbox`

### Task 6: Google Apps Script backend

**Files:** Create `apps-script/Code.gs`. Test: `test/apps-script.test.js` (loads `Code.gs` with `vm.runInNewContext` and a fake `SpreadsheetApp`, `ContentService` and `PropertiesService`).

**Interfaces:**
- Consumes: the POST and GET contract from Task 5.
- Produces, in the Apps Script global scope:
  - `doGet(e)` and `doPost(e)`: thin wrappers that return `ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)`.
  - `handleGet(params, ss)` → `{ok:true, workouts, sets, state}`, or `{ok:false, error:'unauthorized'}`.
  - `handlePost(body, ss)` → `{ok:true, applied:n}`, or unauthorized.
  - The secret is read from `PropertiesService.getScriptProperties().getProperty('SECRET')`.
- Sheets (created if missing, header row as given):
  - `Serii`: `id, data_ora, antrenament_id, tip, exercitiu_id, exercitiu, seria, valoare, unitate, metoda`, where `unitate` is written as `repetari` or `secunde`.
  - `Antrenamente`: `antrenament_id, tip, inceput, sfarsit`
  - `Stare`: cell A1 holds the State JSON.
- Behavior:
  - A `set` op whose id already exists is ignored.
  - A `workout` op updates the row with the same id, or appends one.
  - A `state` op overwrites A1.
  - Wrap writes in `LockService.getScriptLock()` with a 10 s wait.

- [ ] **Step 1: Write failing tests**:
  - The wrong secret returns unauthorized and writes nothing.
  - Two `set` ops produce 2 rows. `duplicate set id is ignored`: posting the same op again keeps 2 rows.
  - The workout op with `finishedAt` updates the existing row instead of appending.
  - `handleGet` round-trips what was posted (values as numbers, units mapped back to `reps` and `seconds`).
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** (Apps Script V8, plain functions, no `require`).
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Commit** `feat: Apps Script backend for the Sheet`

### Task 7: Figures

**Files:** Create `js/figures.js`. Test: `test/figures.test.js`. Create `test/contact-sheet.js`, a Playwright script that writes `test-results/figures.png`.

**Interfaces:**
- Produces:
  - `AT.figures.POSES: { [exerciseId]: { keys: Pose[], ground: 'feet'|'lying'|'kneel' } }` for all 11 exercises.
  - `AT.figures.skeleton(pose: Pose) -> { [joint]: [x,y] }`, with joints `ankle, toe, knee, hip, shoulder, elbow, hand, head` plus a second leg and arm where the movement needs them (`ankle2, knee2, toe2, elbow2, hand2`). In the 200×200 viewBox the ground is y=182.
  - `AT.figures.pose(exerciseId, p: 0..1) -> Pose`: interpolates `keys[0]`→`keys[1]` (and `keys[2]` if present) with eased `p`.
  - `AT.figures.mount(svgEl, exerciseId) -> { stop() }`: draws in the sketch style (stroke `#f1f4ef`, width 7, round caps, head r=10, dumbbells as `#c6f05a` rects of 10×22 rx 3) and loops with a 3200 ms cycle `p = (1 − cos 2πt)/2`. Under `prefers-reduced-motion` it draws static `p = 0.5`.
- Pose: segment angles in degrees (`shin, thigh, torso, upperArm, foreArm`, with `…2` for the second limb) plus `ankleX` and a `base` mode. Segment lengths: shin 44, thigh 44, torso 52, upper arm 26, forearm 24, neck 16 (shoulder to head centre).

Biomechanics each animation must show (from the spec's tips):
- **goblet-squat:** dumbbell at the chest, hips go back and down to roughly thigh-parallel, torso lean ≤ 40°, knee stays within ~15 px of the toe x.
- **pushup:** straight line from head to heel (shoulder, hip and ankle collinear within 6°).
- **db-row:** hip hinge, torso 35–50° above horizontal, back straight, elbows pull back past the torso.
- **overhead-press:** standing; hands go from shoulder height to above the head.
- **biceps-curl:** upper arm vertical and still, forearm rotates.
- **plank:** forearm plank, static body line, with gentle breathing motion only (±1 px).
- **rdl:** knees soft and nearly fixed, hips back, torso to ~45° from vertical, dumbbells stay near the legs.
- **reverse-lunge:** one leg steps back, front knee over the ankle.
- **floor-press:** lying on the back, elbows touch the floor at the bottom.
- **lateral-raise:** front view allowed; arms rise to shoulder height, elbows slightly bent.
- **dead-bug:** lying on the back; opposite arm and leg extend.

- [ ] **Step 1: Write failing tests**:
  - Every A/B exercise has a pose.
  - For p in {0, 0.25, 0.5, 0.75, 1}: all joint y ≤ 182.5, and the computed distances knee–ankle, hip–knee and shoulder–hip equal the segment lengths ±0.5.
  - Pushup collinearity ≤ 6° at all p.
  - Goblet squat: |knee.x − toe.x| ≤ 15 at p = 1.
- [ ] **Step 2: Run** and expect FAIL.
- [ ] **Step 3: Implement** poses and the renderer.
- [ ] **Step 4: Run** and expect PASS.
- [ ] **Step 5: Visual check:** `node test/contact-sheet.js` renders an 11 × 3 grid (p = 0, 0.5, 1) to `test-results/figures.png`. Open it and check each row against the biomechanics list. Fix any figure that reads wrong.
- [ ] **Step 6: Commit** `feat: procedural exercise figures`

### Task 8: UI, styling, bootstrap and end-to-end test

**Files:** Create `index.html`, `css/app.css`, `js/config.js` (`AT.config = { sheetUrl: '', secret: '' }`), `js/ui.js`, `js/app.js`. Test: `test/e2e.spec.js`.

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `AT.ui.render(root: HTMLElement, s: SState, history: History, online: boolean)`
  - `AT.ui.keyToAction(e: KeyboardEvent) -> action|null`: 37/38/39/40 → LEFT/UP/RIGHT/DOWN; 13 → OK; 461, 27 or 8 → BACK. Calls `preventDefault` on all of them.
  - `AT.ui.runEffects(effects, store)`: save effects go to the store. `beep` uses Web Audio: a short beep is 880 Hz for 150 ms; the long one is 660 Hz for 600 ms, and the AudioContext is created on the first key press. `fullscreen` calls `requestFullscreen` and ignores rejection.
- `app.js`:
  - Load the store, then `home()`, render, and `setInterval` TICK every 250 ms (re-render only when the displayed second changes).
  - Request a wake lock, ignoring failure.
  - Empty `sheetUrl` means local-only mode with the offline banner.
- Screens follow the sketch markup and CSS (`docs/superpowers/specs/2026-11-25-schite-ecrane.html`): the `.tv` stage fills the viewport at 16:9 (letterboxed) and `cqw` units carry over unchanged. Screen copy is taken from the sketch, plus:
  - Home on a rest day: `Azi: recuperare` with the line `Mers 25–35 min și stretching ușor`, and a secondary button `Fă totuși antrenamentul ${type}`.
  - Home with a resumable workout: `Continuă antrenamentul ${type} (exercițiul ${n}, seria ${k})` plus `Începe din nou`.
  - Warm-up: the `WARMUP` list with an `m:ss` countdown and the hint `OK = sari peste`.
  - Exercise screen: the label `pe picior` or `pe parte` next to the target when `per` is set; under the tip, the `suggestion()` line when it is non-null; `Ultima dată: —` when there is no history.
  - Plank screen: a large up-counting `s` with markers at 30 and 45, plus the hint `OK = gata`.
  - confirmExit: `Ieși din antrenament?` with the hints `OK = da` and `Înapoi = nu`.
  - Summary: as in the sketch. Diff vs `lastSameType`, and the head line `+N repetări față de data trecută` (use `−N` when negative, `La fel ca data trecută` when 0, and `Primul antrenament ${type}. Bravo!` when there is no previous one). Plank seconds are excluded from the totals.
  - Offline banner, top right, small: `Fără conexiune, salvez pe televizor`.

- [ ] **Step 1: Write the failing e2e test** `test/e2e.spec.js`. It serves the repo with a tiny `http.createServer` static handler, then launches Playwright Chromium at 1920×1080. It routes the Sheet URL (set `AT.config` through `page.addInitScript`) to a fake that records POSTs, with a fixed clock via `page.clock.install({time: new Date('2026-11-25T18:00:00')})`. It then drives one whole Workout A with the keyboard:
  - home shows `Antrenamentul A`
  - Enter starts the warm-up; Enter skips it
  - the exercise shows `Genuflexiuni cu gantera` and `Seria 1 din 2`
  - Enter → log; ArrowUp; Enter → the rest screen shows `Pauză`; `page.clock.runFor(91000)` → set 2
  - … continue through plank (Enter, `runFor(40000)`, Enter → value 40) to the summary
  - expect the summary to contain `Primul antrenament A`; the fake server received 12 set ops with unique ids; and `localStorage['at.outbox']` is empty
  - also save a screenshot of each screen type into `test-results/` for a visual look
- [ ] **Step 2: Run** `node test/e2e.spec.js` and expect FAIL.
- [ ] **Step 3: Implement** the HTML, CSS, ui.js and app.js.
- [ ] **Step 4: Run** `node test/e2e.spec.js` and expect PASS. Then run `node --test test/` and expect PASS. Look at the screenshots and compare them with the sketch.
- [ ] **Step 5: Commit** `feat: TV screens, key handling and bootstrap`

### Task 9: Deployment and setup guide (needs the user)

**Files:** Create `docs/configurare.md` (in Romanian). Modify `js/config.js`.

- [ ] **Step 1: Write `docs/configurare.md`** with numbered steps for a non-programmer:
  - Create the Sheet, then Extensions → Apps Script.
  - Paste `apps-script/Code.gs`.
  - Project Settings → Script properties → `SECRET` = a value I generate (`openssl rand -hex 24`, given to the user in chat, never committed).
  - Deploy → New deployment → Web app, Execute as *Me*, access *Anyone*. Copy the URL.
  - Make a GitHub account and a repo `antrenor-tv`; Settings → Pages → branch `main`, folder `/`.
  - On the TV: open the address in the LG browser and add it to favourites.
- [ ] **Step 2:** Ask the user for the Apps Script URL and the GitHub repo. Attach the repo with `add_repo` (push access). Put `sheetUrl` and `secret` in `js/config.js` (the repo's `config.js` holds them, which the spec accepts: the secret only blocks stray writes).
- [ ] **Step 3: Verify the backend from here:** `curl -sL "<sheetUrl>?secret=<secret>&action=all"` returns `{"ok":true,...}`. If the host is blocked, ask the user to open the URL on their phone instead.
- [ ] **Step 4: Push** to `main` and wait for Pages. `curl -sI https://<user>.github.io/antrenor-tv/` returns 200.
- [ ] **Step 5: Ask the user** to open the page on the TV, do warm-up plus one set, then check that a row appears in the `Serii` sheet. Record the outcome and anything that renders wrong on the TV.
- [ ] **Step 6: Commit** `docs: setup guide; config for deployment`
