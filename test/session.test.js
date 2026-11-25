const test = require('node:test');
const assert = require('node:assert');
require('../js/program.js'); require('../js/schedule.js'); require('../js/progression.js');
const S = require('../js/session.js');

// Mimics the UI: applies save effects to history, keeps a clock.
function harness(history, startIso) {
  const h = history || { workouts: [], sets: [], state: { firstWorkoutAt: null, progression: {} } };
  let n = 0, now = new Date(startIso || '2026-11-25T18:00:00').getTime();
  const ctx = { history: h, newId: () => 'id' + (++n) };
  const log = { effects: [], screens: [] };
  let s = S.home(h, new Date(now));
  function apply(effects) {
    effects.forEach(e => {
      log.effects.push(e);
      if (e.type === 'saveSet') h.sets.push(e.set);
      if (e.type === 'saveWorkout') { h.workouts = h.workouts.filter(w => w.id !== e.workout.id); h.workouts.push(e.workout); }
      if (e.type === 'saveState') h.state = e.state;
    });
  }
  const api = {
    get s() { return s; }, h, log,
    act(type, advanceMs) {
      if (advanceMs) now += advanceMs;
      const r = S.next(s, { type, now: new Date(now) }, ctx);
      s = r.state; apply(r.effects);
      if (log.screens[log.screens.length - 1] !== s.screen) log.screens.push(s.screen);
      return r;
    },
    wait(ms) { // TICK every 250 ms
      for (let t = 0; t < ms; t += 250) api.act('TICK', 250);
    }
  };
  log.screens.push(s.screen);
  return api;
}

test('full workout B on empty history (2 sets each in first weeks)', () => {
  const h = { workouts: [{ id: 'old', type: 'A', startedAt: '2026-11-23T18:00:00', finishedAt: '2026-11-23T18:45:00' }], sets: [], state: { firstWorkoutAt: null, progression: {} } };
  const t = harness(h);
  assert.strictEqual(t.s.screen, 'home');
  assert.strictEqual(t.s.nextType, 'B');
  const r = t.act('OK');
  assert.deepStrictEqual(r.effects.map(e => e.type).sort(), ['fullscreen', 'saveWorkout']);
  assert.strictEqual(t.s.screen, 'warmup');
  t.act('OK');
  let guard = 0;
  while (t.s.screen !== 'summary' && guard++ < 200) {
    if (t.s.screen === 'exercise') t.act('OK');
    else if (t.s.screen === 'plank') t.act('OK', 30000);
    else if (t.s.screen === 'log') t.act('OK');
    else if (t.s.screen === 'rest') t.act('OK');
    else throw new Error('unexpected screen ' + t.s.screen);
  }
  const saved = t.log.effects.filter(e => e.type === 'saveSet').map(e => e.set);
  assert.strictEqual(saved.length, 12);
  assert.deepStrictEqual(saved.map(s => s.exerciseId + ':' + s.setIndex).slice(0, 4), ['rdl:1', 'rdl:2', 'reverse-lunge:1', 'reverse-lunge:2']);
  assert.ok(saved.every(s => s.type === 'B' && s.method === 0 && s.unit === 'reps'));
  assert.deepStrictEqual(t.log.screens.slice(0, 6), ['home', 'warmup', 'exercise', 'log', 'rest', 'exercise']);
  const wk = t.h.workouts.find(w => w.type === 'B');
  assert.ok(wk.finishedAt);
  assert.strictEqual(t.log.effects.filter(e => e.type === 'saveState').length, 1);
  assert.ok(t.h.state.firstWorkoutAt);
});

test('warmup ends by itself after 6 minutes', () => {
  const t = harness();
  t.act('OK');
  t.wait(359000);
  assert.strictEqual(t.s.screen, 'warmup');
  t.wait(1500);
  assert.strictEqual(t.s.screen, 'exercise');
});

test('log default without history is the target minimum', () => {
  const t = harness();
  t.act('OK'); t.act('OK'); t.act('OK');
  assert.strictEqual(t.s.screen, 'log');
  assert.strictEqual(t.s.value, 12); // goblet squat min
});

test('log default uses last values per set, then the last one', () => {
  const h = {
    workouts: [{ id: 'p', type: 'A', startedAt: '2026-11-20T18:00:00', finishedAt: '2026-11-20T18:40:00' },
               { id: 'q', type: 'B', startedAt: '2026-11-23T18:00:00', finishedAt: '2026-11-23T18:40:00' }],
    sets: [{ id: 's1', workoutId: 'p', exerciseId: 'goblet-squat', setIndex: 1, value: 12, method: 0, at: '2026-11-20T18:05:00' },
           { id: 's2', workoutId: 'p', exerciseId: 'goblet-squat', setIndex: 2, value: 11, method: 0, at: '2026-11-20T18:08:00' }],
    state: { firstWorkoutAt: '2026-11-01T18:00:00', progression: {} }
  };
  const t = harness(h);
  t.act('OK'); t.act('OK');
  t.act('OK'); assert.strictEqual(t.s.value, 12); t.act('OK'); t.act('OK');
  t.act('OK'); assert.strictEqual(t.s.value, 11); t.act('OK'); t.act('OK');
  assert.strictEqual(t.s.setIndex, 3);
  t.act('OK'); assert.strictEqual(t.s.value, 11);
});

test('OK on log emits one saveSet and leaves log screen', () => {
  const t = harness();
  t.act('OK'); t.act('OK'); t.act('OK'); t.act('UP');
  const r1 = t.act('OK');
  assert.strictEqual(r1.effects.filter(e => e.type === 'saveSet').length, 1);
  assert.strictEqual(r1.effects[0].set.value, 13);
  assert.strictEqual(t.s.screen, 'rest');
  const r2 = t.act('OK');
  assert.strictEqual(r2.effects.filter(e => e.type === 'saveSet').length, 0);
});

test('plank: OK, 38 s, OK logs 38 seconds', () => {
  const h = { workouts: [], sets: [], state: { firstWorkoutAt: null, progression: {} } };
  const t = harness(h);
  t.act('OK'); t.act('OK');
  for (let i = 0; i < 5; i++) t.act('RIGHT');
  assert.strictEqual(t.s.exIds[t.s.exIndex], 'plank');
  t.act('OK'); assert.strictEqual(t.s.screen, 'plank');
  t.act('OK', 38000);
  assert.strictEqual(t.s.screen, 'log');
  assert.strictEqual(t.s.value, 38);
  const r = t.act('OK');
  assert.strictEqual(r.effects[0].set.unit, 'seconds');
});

test('rest: ±15 s within 60–120, one short beep at 3 s, long beep at 0', () => {
  const t = harness();
  t.act('OK'); t.act('OK'); t.act('OK'); t.act('OK');
  assert.strictEqual(t.s.screen, 'rest');
  t.act('UP'); assert.strictEqual(t.s.restTotal, 105000);
  t.act('UP'); t.act('UP'); assert.strictEqual(t.s.restTotal, 120000);
  t.act('DOWN'); t.act('DOWN'); t.act('DOWN'); t.act('DOWN'); t.act('DOWN');
  assert.strictEqual(t.s.restTotal, 60000);
  const before = t.log.effects.length;
  t.wait(60000);
  const beeps = t.log.effects.slice(before).filter(e => e.type === 'beep');
  assert.deepStrictEqual(beeps.map(b => b.long), [false, true]);
  assert.strictEqual(t.s.screen, 'exercise');
  assert.strictEqual(t.s.setIndex, 2);
});

test('resume starts at next unsaved set', () => {
  const w = { id: 'today', type: 'B', startedAt: '2026-11-25T17:30:00', finishedAt: null };
  const mk = (ex, i) => ({ id: ex + i, workoutId: 'today', type: 'B', exerciseId: ex, setIndex: i, value: 10, unit: 'reps', method: 0, at: '2026-11-25T17:4' + i + ':00' });
  const h = { workouts: [w], sets: [mk('rdl', 1), mk('rdl', 2), mk('rdl', 3), mk('reverse-lunge', 1)],
    state: { firstWorkoutAt: '2026-11-01T18:00:00', progression: {} } };
  const t = harness(h);
  assert.strictEqual(t.s.resumable.id, 'today');
  t.act('OK');
  assert.strictEqual(t.s.screen, 'exercise');
  assert.strictEqual(t.s.exIds[t.s.exIndex], 'reverse-lunge');
  assert.strictEqual(t.s.setIndex, 2);
});

test('restart instead of resume creates a new workout of the same type', () => {
  const w = { id: 'today', type: 'B', startedAt: '2026-11-25T17:30:00', finishedAt: null };
  const t = harness({ workouts: [w], sets: [], state: { firstWorkoutAt: null, progression: {} } });
  t.act('DOWN');
  const r = t.act('OK');
  const nw = r.effects.find(e => e.type === 'saveWorkout').workout;
  assert.notStrictEqual(nw.id, 'today');
  assert.strictEqual(nw.type, 'B');
  assert.strictEqual(t.s.screen, 'warmup');
});

test('BACK on log saves nothing; exit confirm returns home with resumable', () => {
  const t = harness();
  t.act('OK'); t.act('OK'); t.act('OK');
  const r = t.act('BACK');
  assert.strictEqual(r.effects.length, 0);
  assert.strictEqual(t.s.screen, 'exercise');
  t.act('BACK'); assert.strictEqual(t.s.screen, 'confirmExit');
  t.act('BACK'); assert.strictEqual(t.s.screen, 'exercise');
  t.act('BACK'); t.act('OK');
  assert.strictEqual(t.s.screen, 'home');
  assert.ok(t.s.resumable);
});

test('rest day: home still offers the workout', () => {
  const t = harness(null, '2026-11-26T18:00:00');
  assert.strictEqual(t.s.dayKind, 'rest');
  t.act('OK');
  assert.strictEqual(t.s.screen, 'warmup');
});

test('resumePosition reports the exercise and set to continue at', () => {
  const w = { id: 'today', type: 'B', startedAt: '2026-11-25T17:30:00', finishedAt: null };
  const h = { workouts: [w], sets: [{ id: 'a', workoutId: 'today', exerciseId: 'rdl', setIndex: 1 }, { id: 'b', workoutId: 'today', exerciseId: 'rdl', setIndex: 2 }],
    state: { firstWorkoutAt: null, progression: {} } };
  assert.deepStrictEqual(S.resumePosition(w, h, new Date('2026-11-25T18:00:00')), { exIndex: 1, setIndex: 1 });
});
