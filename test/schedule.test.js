const test = require('node:test');
const assert = require('node:assert');
require('../js/program.js');
const S = require('../js/schedule.js');

const d = (s) => new Date(s);
const DAY = 86400000;
const wk = (id, type, startedAt, finishedAt) => ({ id, type, startedAt, finishedAt: finishedAt === undefined ? startedAt : finishedAt });

test('nextWorkoutType alternates, starts with A', () => {
  assert.strictEqual(S.nextWorkoutType([]), 'A');
  assert.strictEqual(S.nextWorkoutType([wk('1', 'A', '2026-11-23T18:00:00')]), 'B');
  assert.strictEqual(S.nextWorkoutType([
    wk('1', 'A', '2026-11-23T18:00:00'), wk('3', 'A', '2026-11-27T18:00:00'), wk('2', 'B', '2026-11-25T18:00:00')
  ]), 'B');
});

test('isTrainingDay is Mon/Wed/Fri', () => {
  [23, 25, 27].forEach(n => assert.strictEqual(S.isTrainingDay(d('2026-11-' + n + 'T10:00:00')), true, n));
  [24, 26, 28, 29].forEach(n => assert.strictEqual(S.isTrainingDay(d('2026-11-' + n + 'T10:00:00')), false, n));
});

test('setsFor: 2 sets for the first 14 days, then program + extra', () => {
  const first = '2026-11-01T18:00:00';
  const st = { firstWorkoutAt: first, progression: {} };
  const t0 = d(first).getTime();
  assert.strictEqual(S.setsFor('pushup', { firstWorkoutAt: null, progression: {} }, d(first)), 2);
  assert.strictEqual(S.setsFor('pushup', st, new Date(t0 + 13 * DAY)), 2);
  assert.strictEqual(S.setsFor('pushup', st, new Date(t0 + 14 * DAY)), 3);
  assert.strictEqual(S.setsFor('pushup', { firstWorkoutAt: first, progression: { pushup: { level: 3, extraSets: 1 } } }, new Date(t0 + 20 * DAY)), 4);
});

test('weekNumber', () => {
  const first = '2026-11-01T18:00:00', t0 = d(first).getTime();
  const st = { firstWorkoutAt: first, progression: {} };
  assert.strictEqual(S.weekNumber({ firstWorkoutAt: null }, d(first)), 1);
  assert.strictEqual(S.weekNumber(st, new Date(t0)), 1);
  assert.strictEqual(S.weekNumber(st, new Date(t0 + 6 * DAY)), 1);
  assert.strictEqual(S.weekNumber(st, new Date(t0 + 14 * DAY)), 3);
});

test('findResumable: only an unfinished workout from today', () => {
  const today = d('2026-11-25T19:00:00');
  const y = wk('y', 'A', '2026-11-24T18:00:00', null);
  const t = wk('t', 'B', '2026-11-25T18:00:00', null);
  assert.strictEqual(S.findResumable([y], today), null);
  assert.strictEqual(S.findResumable([y, t], today).id, 't');
  assert.strictEqual(S.findResumable([wk('f', 'A', '2026-11-25T17:00:00')], today), null);
});

test('closeStale + nextWorkoutType', () => {
  const today = d('2026-11-25T19:00:00');
  const y = wk('y', 'A', '2026-11-24T18:00:00', null);
  const t = wk('t', 'B', '2026-11-25T18:00:00', null);
  const sets = [{ workoutId: 'y', at: '2026-11-24T18:20:00' }, { workoutId: 'y', at: '2026-11-24T18:31:00' }];
  const closed = S.closeStale([y, t], sets, today);
  assert.strictEqual(closed.length, 1);
  assert.strictEqual(closed[0].id, 'y');
  assert.strictEqual(closed[0].finishedAt, '2026-11-24T18:31:00');
  assert.strictEqual(y.finishedAt, null, 'input not mutated');
  assert.strictEqual(S.closeStale([wk('e', 'A', '2026-11-20T18:00:00', null)], [], today)[0].finishedAt, '2026-11-20T18:00:00');
  assert.strictEqual(S.nextWorkoutType([closed[0]]), 'B');
});
