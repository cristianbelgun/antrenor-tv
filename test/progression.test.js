const test = require('node:test');
const assert = require('node:assert');
require('../js/program.js'); require('../js/schedule.js');
const P = require('../js/progression.js');

const today = new Date('2026-12-30T18:00:00');
const base = (prog) => ({ firstWorkoutAt: '2026-11-01T18:00:00', progression: prog || {} });
const sets = (ex, vals, method, wid) => vals.map((v, i) => ({ id: wid + ex + i, workoutId: wid || 'w', exerciseId: ex, setIndex: i + 1, value: v, method: method || 0, at: '2026-12-30T18:0' + i + ':00' }));

test('lastValues empty', () => {
  assert.deepStrictEqual(P.lastValues('pushup', { workouts: [], sets: [], state: base() }), []);
});

test('lastValues: newest finished workout, skips unfinished and excluded', () => {
  const h = {
    workouts: [
      { id: 'w1', type: 'A', startedAt: '2026-12-21T18:00:00', finishedAt: '2026-12-21T18:40:00' },
      { id: 'w2', type: 'A', startedAt: '2026-12-25T18:00:00', finishedAt: '2026-12-25T18:40:00' },
      { id: 'w3', type: 'A', startedAt: '2026-12-28T18:00:00', finishedAt: null }
    ],
    sets: sets('pushup', [10, 9], 0, 'w1').concat(sets('pushup', [12, 11, 11], 0, 'w2'), sets('pushup', [14], 0, 'w3')),
    state: base()
  };
  assert.deepStrictEqual(P.lastValues('pushup', h), [12, 11, 11]);
  assert.deepStrictEqual(P.lastValues('pushup', h, 'w2'), [10, 9]);
  assert.strictEqual(P.lastSameType('A', h, 'w2').id, 'w1');
  assert.strictEqual(P.lastSameType('B', h), null);
});

test('advance 0→1 when all sets reach the top', () => {
  const s = P.advance(base(), sets('pushup', [15, 15, 16]), ['pushup'], today);
  assert.strictEqual(s.progression.pushup.level, 1);
});

test('advance: no change when one set is below top', () => {
  const s = P.advance(base(), sets('pushup', [15, 14, 15]), ['pushup'], today);
  assert.strictEqual((s.progression.pushup || { level: 0 }).level, 0);
});

test('advance: no change when sets used another method, or too few sets', () => {
  const s = P.advance(base({ pushup: { level: 1, extraSets: 0 } }), sets('pushup', [15, 15, 15], 0), ['pushup'], today);
  assert.strictEqual(s.progression.pushup.level, 1);
  const s2 = P.advance(base(), sets('pushup', [15, 15]), ['pushup'], today);
  assert.strictEqual((s2.progression.pushup || { level: 0 }).level, 0);
});

test('advance to level 3 adds an extra set', () => {
  const s = P.advance(base({ pushup: { level: 2, extraSets: 0 } }), sets('pushup', [15, 15, 15], 2), ['pushup'], today);
  assert.deepStrictEqual(s.progression.pushup, { level: 3, extraSets: 1 });
});

test('plank at level 3 raises target by 5 up to 60', () => {
  let st = base({ plank: { level: 3, extraSets: 1 } });
  st = P.advance(st, sets('plank', [45, 45, 46, 45], 3), ['plank'], today);
  assert.strictEqual(st.progression.plank.plankTarget, 50);
  st = base({ plank: { level: 3, extraSets: 1, plankTarget: 55 } });
  st = P.advance(st, sets('plank', [55, 55, 55, 55], 3), ['plank'], today);
  assert.strictEqual(st.progression.plank.plankTarget, 60);
  st = P.advance(st, sets('plank', [60, 60, 60, 60], 3), ['plank'], today);
  assert.strictEqual(st.progression.plank.plankTarget, 60);
  assert.strictEqual(P.top('plank', st), 60);
});

test('reverse lunge hits at 10', () => {
  const s = P.advance(base(), sets('reverse-lunge', [10, 10, 10]), ['reverse-lunge'], today);
  assert.strictEqual(s.progression['reverse-lunge'].level, 1);
});

test('suggestion copy', () => {
  assert.strictEqual(P.suggestion('pushup', base()), null);
  assert.strictEqual(P.suggestion('pushup', base({ pushup: { level: 1 } })), 'Ai atins 15 la toate seriile. Încearcă azi coborârea lentă, în 3 secunde.');
  assert.strictEqual(P.suggestion('pushup', base({ pushup: { level: 2 } })), 'Ai atins 15 la toate seriile cu coborâre lentă. Adaugă azi o pauză de 1–2 secunde în poziția grea.');
  assert.strictEqual(P.suggestion('pushup', base({ pushup: { level: 3, extraSets: 1 } })), 'Ai atins 15 la toate seriile. Azi faci o serie în plus.');
  assert.strictEqual(P.suggestion('plank', base({ plank: { level: 3, extraSets: 1, plankTarget: 50 } })), 'Ținta de azi: 50 de secunde.');
});

test('advance sets firstWorkoutAt and does not mutate input', () => {
  const st = { firstWorkoutAt: null, progression: {} };
  const snap = JSON.stringify(st);
  const s = P.advance(st, sets('pushup', [9, 9]), ['pushup'], today);
  assert.strictEqual(JSON.stringify(st), snap);
  assert.strictEqual(s.firstWorkoutAt, '2026-12-30T18:00:00');
});

test('lastSameType ignores workouts with no sets', () => {
  const h = { workouts: [
      { id: 'w1', type: 'A', startedAt: '2026-12-21T18:00:00', finishedAt: '2026-12-21T18:40:00' },
      { id: 'w2', type: 'A', startedAt: '2026-12-25T18:00:00', finishedAt: '2026-12-25T18:00:00' }],
    sets: sets('pushup', [10], 0, 'w1'), state: base() };
  assert.strictEqual(P.lastSameType('A', h, 'now').id, 'w1');
});
