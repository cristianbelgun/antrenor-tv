const test = require('node:test');
const assert = require('node:assert');
require('../js/program.js'); require('../js/schedule.js');
const ST = require('../js/store.js');

function memStorage() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
const ok = (obj) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
const NOW = new Date('2026-11-25T18:00:00');
const empty = { ok: true, workouts: [], sets: [], state: null };

test('newId is unique', () => {
  const a = new Set(); for (let i = 0; i < 500; i++) a.add(ST.newId());
  assert.strictEqual(a.size, 500);
});

test('load merges remote and local without duplicates', async () => {
  const storage = memStorage();
  storage.setItem('at.history', JSON.stringify({ workouts: [{ id: 'w1', type: 'A', startedAt: '2026-11-25T17:00:00', finishedAt: '2026-11-25T17:40:00' }],
    sets: [{ id: 's1', workoutId: 'w1', at: '2026-11-25T17:05:00' }], state: { firstWorkoutAt: '2026-11-01', progression: {} } }));
  const remote = { ok: true,
    workouts: [{ id: 'w1', type: 'A', startedAt: '2026-11-25T17:00:00', finishedAt: null }, { id: 'w0', type: 'B', startedAt: '2026-11-23T17:00:00', finishedAt: '2026-11-23T17:40:00' }],
    sets: [{ id: 's1', workoutId: 'w1', at: '2026-11-25T17:05:00' }, { id: 's0', workoutId: 'w0', at: '2026-11-23T17:05:00' }],
    state: { firstWorkoutAt: '2026-11-01', progression: { pushup: { level: 1, extraSets: 0 } } } };
  const calls = [];
  const store = ST.create({ storage, url: 'api.php', secret: 'k', fetchFn: (u, o) => { calls.push(u); return ok(remote); }, now: () => NOW });
  const r = await store.load();
  assert.strictEqual(r.online, true);
  assert.ok(calls[0].indexOf('api.php?action=all&secret=k') === 0);
  assert.deepStrictEqual(r.history.workouts.map(w => w.id).sort(), ['w0', 'w1']);
  assert.strictEqual(r.history.workouts.find(w => w.id === 'w1').finishedAt, '2026-11-25T17:40:00');
  assert.strictEqual(r.history.sets.length, 2);
  assert.strictEqual(r.history.state.progression.pushup.level, 1);
});

test('load times out and falls back to local', async () => {
  const store = ST.create({ storage: memStorage(), url: 'api.php', secret: 'k', timeoutMs: 50, fetchFn: () => new Promise(() => {}), now: () => NOW });
  const t0 = Date.now();
  const r = await store.load();
  assert.ok(Date.now() - t0 < 1000);
  assert.strictEqual(r.online, false);
  assert.deepStrictEqual(r.history.workouts, []);
});

test('flush retries and server dedupes by id', async () => {
  const storage = memStorage();
  let fail = true; const posted = [];
  const fetchFn = (u, o) => {
    if (o && o.method === 'POST') { posted.push(JSON.parse(o.body)); return fail ? Promise.reject(new Error('offline')) : ok({ ok: true, applied: 1 }); }
    return ok(empty);
  };
  const s1 = ST.create({ storage, url: 'api.php', secret: 'k', fetchFn, now: () => NOW });
  await s1.load();
  s1.saveSet({ id: 'set-1', workoutId: 'w', at: '2026-11-25T18:01:00' });
  await s1.flush();
  assert.strictEqual(JSON.parse(storage.getItem('at.outbox')).length, 1);
  fail = false;
  const s2 = ST.create({ storage, url: 'api.php', secret: 'k', fetchFn, now: () => NOW });
  await s2.load();
  await s2.flush();
  assert.deepStrictEqual(JSON.parse(storage.getItem('at.outbox')), []);
  const ids = posted.map(p => p.ops.map(o => o.data.id).join(','));
  assert.ok(ids.every(x => x.indexOf('set-1') >= 0));
  assert.strictEqual(posted[posted.length - 1].secret, 'k');
  assert.strictEqual(JSON.parse(storage.getItem('at.history')).sets.length, 1);
});

test('POST uses text/plain', async () => {
  let hdr;
  const store = ST.create({ storage: memStorage(), url: 'api.php', secret: 'k', now: () => NOW,
    fetchFn: (u, o) => { if (o && o.method === 'POST') hdr = o.headers['Content-Type']; return ok({ ok: true, applied: 1 }); } });
  store.saveState({ firstWorkoutAt: null, progression: {} });
  await store.flush();
  assert.strictEqual(hdr, 'text/plain;charset=utf-8');
});

test('stale unfinished workout is closed on load and queued', async () => {
  const storage = memStorage();
  storage.setItem('at.history', JSON.stringify({ workouts: [{ id: 'y', type: 'A', startedAt: '2026-11-24T18:00:00', finishedAt: null }],
    sets: [{ id: 'a', workoutId: 'y', at: '2026-11-24T18:10:00' }], state: { firstWorkoutAt: null, progression: {} } }));
  const store = ST.create({ storage, url: 'api.php', secret: 'k', fetchFn: () => Promise.reject(new Error('x')), now: () => NOW });
  const r = await store.load();
  assert.strictEqual(r.history.workouts[0].finishedAt, '2026-11-24T18:10:00');
  const out = JSON.parse(storage.getItem('at.outbox'));
  assert.ok(out.some(o => o.kind === 'workout' && o.data.id === 'y'));
});

test('throwing storage still loads', async () => {
  const store = ST.create({ storage: throwing, url: 'api.php', secret: 'k', fetchFn: () => ok(empty), now: () => NOW });
  const r = await store.load();
  assert.ok(r.history);
  store.saveSet({ id: 'z', workoutId: 'w', at: 'x' });
});

test('no secret means local only, no network', async () => {
  let called = false;
  const store = ST.create({ storage: memStorage(), url: 'api.php', secret: '', fetchFn: () => { called = true; return ok(empty); }, now: () => NOW });
  const r = await store.load();
  store.saveSet({ id: 'z', workoutId: 'w', at: 'x' });
  await store.flush();
  assert.strictEqual(called, false);
  assert.strictEqual(r.online, false);
});
