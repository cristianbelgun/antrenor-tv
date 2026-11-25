const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/tempo.js');

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('no tempo for levels 0 and 3, nor for plank', () => {
  assert.strictEqual(T.forExercise('pushup', 0), null);
  assert.strictEqual(T.forExercise('pushup', 3), null);
  assert.strictEqual(T.forExercise('plank', 1), null);
});

test('cycle length per level', () => {
  assert.strictEqual(T.forExercise('goblet-squat', 1).period, 4);
  assert.strictEqual(T.forExercise('db-row', 2).period, 6);
});

test('text per exercise group', () => {
  assert.strictEqual(T.text(T.forExercise('goblet-squat', 1)), 'Ritm: jos 3 s · sus 1 s');
  assert.strictEqual(T.text(T.forExercise('biceps-curl', 2)), 'Ritm: sus 1 s · ține 2 s · jos 3 s');
  assert.strictEqual(T.text(T.forExercise('dead-bug', 1)), 'Ritm: întinde 3 s · revino 1 s');
  assert.strictEqual(T.text(T.forExercise('floor-press', 2)), 'Ritm: jos 3 s · ține 2 s · sus 1 s');
});

test('one tick per second, accent at the start of each rep', () => {
  const ts = T.ticks(T.forExercise('goblet-squat', 1), 0, 8);
  assert.deepStrictEqual(ts.map(t => t.at), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepStrictEqual(ts.filter(t => t.accent).map(t => t.at), [0, 4]);
});

test('figure position follows the phases', () => {
  const g = T.forExercise('goblet-squat', 1);
  assert.ok(near(T.position(g, 0), 0));
  assert.ok(near(T.position(g, 3), 1));
  const mid = T.position(g, 1.5);
  assert.ok(mid > 0 && mid < 1);
  assert.ok(near(T.position(g, 4), 0));
  const c = T.forExercise('biceps-curl', 2);
  assert.ok(near(T.position(c, 1), 1));
  assert.ok(near(T.position(c, 2.5), 1));
  assert.ok(near(T.position(c, 6), 0));
});
