const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/program.js');

test('workouts A and B list the right exercises', () => {
  assert.deepStrictEqual(P.WORKOUTS.A, ['goblet-squat','pushup','db-row','overhead-press','biceps-curl','plank']);
  assert.deepStrictEqual(P.WORKOUTS.B, ['rdl','reverse-lunge','floor-press','lateral-raise','biceps-curl','dead-bug']);
});

test('every workout id exists, 11 exercises', () => {
  for (const id of P.WORKOUTS.A.concat(P.WORKOUTS.B)) assert.ok(P.EXERCISES[id], id);
  assert.strictEqual(Object.keys(P.EXERCISES).length, 11);
});

test('spot values from the spec', () => {
  assert.deepStrictEqual(pick(P.exercise('pushup'), ['sets','min','max','unit','per']), {sets:3,min:8,max:15,unit:'reps',per:null});
  assert.deepStrictEqual(pick(P.exercise('plank'), ['min','max','unit']), {min:30,max:45,unit:'seconds'});
  assert.deepStrictEqual(pick(P.exercise('reverse-lunge'), ['min','max','per']), {min:10,max:10,per:'picior'});
  assert.deepStrictEqual(pick(P.exercise('dead-bug'), ['min','max','per']), {min:10,max:12,per:'parte'});
  assert.deepStrictEqual(pick(P.exercise('lateral-raise'), ['min','max']), {min:12,max:15});
});

test('names and tips present, warmup has 4 lines, unknown id throws', () => {
  for (const e of Object.values(P.EXERCISES)) { assert.ok(e.name.length > 0); assert.ok(e.tip.length > 0); }
  assert.strictEqual(P.WARMUP.length, 4);
  assert.throws(() => P.exercise('nope'));
});

function pick(o, ks) { const r = {}; ks.forEach(k => r[k] = o[k]); return r; }
