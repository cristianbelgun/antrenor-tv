const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/music.js');

const beats = (notes, inst) => notes.filter(n => n.inst === inst).map(n => n.beat);

test('120 BPM and deterministic per seed', () => {
  assert.strictEqual(M.BPM, 120);
  assert.deepStrictEqual(M.compose(7), M.compose(7));
  const keys = new Set();
  for (let s = 1; s <= 10; s++) { const c = M.compose(s); keys.add(c.root + ':' + JSON.stringify(c.progression)); }
  assert.ok(keys.size > 1);
});

test('drum pattern of a normal bar', () => {
  const c = M.compose(3);
  const b = M.bar(c, 0, 'play');
  assert.deepStrictEqual(beats(b, 'kick'), [0, 1, 2, 3]);
  assert.deepStrictEqual(beats(b, 'clap'), [1, 3]);
  assert.deepStrictEqual(beats(b, 'hat'), [0.5, 1.5, 2.5, 3.5]);
});

test('rest mode never has the lead', () => {
  for (let s = 1; s <= 5; s++) {
    const c = M.compose(s);
    for (let i = 0; i < 64; i++) assert.strictEqual(M.bar(c, i, 'rest').filter(n => n.inst === 'lead').length, 0);
  }
});

test('lead comes and goes between 8-bar sections', () => {
  let withLead = false, without = false;
  for (let s = 1; s <= 5; s++) {
    const c = M.compose(s);
    for (let sec = 0; sec < 8; sec++) {
      const has = M.bar(c, sec * 8 + 1, 'play').some(n => n.inst === 'lead');
      if (has) withLead = true; else without = true;
    }
  }
  assert.ok(withLead && without);
});

test('bass stays within two octaves of the root, at most 24 notes per bar', () => {
  for (let s = 1; s <= 5; s++) {
    const c = M.compose(s);
    for (let i = 0; i < 64; i++) {
      const b = M.bar(c, i, 'play');
      assert.ok(b.length <= 24, 'bar size ' + b.length);
      b.filter(n => n.inst === 'bass').forEach(n => assert.ok(Math.abs(n.midi - c.root) <= 24, n.midi + ' vs ' + c.root));
    }
  }
});

test('the chord changes each bar in a 4-bar cycle', () => {
  const c = M.compose(2);
  assert.strictEqual(M.chordAt(c, 0), M.chordAt(c, 4));
  assert.strictEqual(M.chordAt(c, 1), c.progression[1]);
});
