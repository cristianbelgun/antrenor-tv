const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { spawn } = require('child_process');

let dir, port, proc, URL_;

function freePort() {
  return new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
}

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-'));
  fs.copyFileSync(path.join(__dirname, '..', 'api.php'), path.join(dir, 'api.php'));
  fs.writeFileSync(path.join(dir, 'config.php'), "<?php return ['secret' => 'test-secret'];\n");
  port = await freePort();
  proc = spawn('php', ['-S', '127.0.0.1:' + port, '-t', dir], { stdio: 'ignore', env: Object.assign({}, process.env, { PHP_CLI_SERVER_WORKERS: '4' }) });
  URL_ = 'http://127.0.0.1:' + port + '/api.php';
  for (let i = 0; i < 50; i++) {
    try { await fetch(URL_ + '?action=all&secret=x'); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('php server did not start');
});
test.after(() => { proc && proc.kill(); });

const get = (secret) => fetch(URL_ + '?action=all&secret=' + encodeURIComponent(secret));
const post = (body) => fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const setOp = (id) => ({ kind: 'set', data: { id, workoutId: 'w1', exerciseId: 'pushup', setIndex: 1, value: 12, unit: 'reps', method: 0, at: '2026-11-25T18:00:00Z' } });
const histFile = () => path.join(dir, 'data', 'history.json');

test('wrong secret is rejected and nothing is written', async () => {
  const r1 = await get('nope');
  assert.strictEqual(r1.status, 403);
  assert.deepStrictEqual(await r1.json(), { ok: false, error: 'unauthorized' });
  const r2 = await post({ secret: 'nope', ops: [setOp('x')] });
  assert.strictEqual(r2.status, 403);
  assert.strictEqual(fs.existsSync(histFile()), false);
});

test('empty history on first GET', async () => {
  const r = await get('test-secret');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.strictEqual(r.headers.get('cache-control'), 'no-store');
  assert.deepStrictEqual(await r.json(), { ok: true, workouts: [], sets: [], state: null });
});

test('two sets are stored and returned', async () => {
  const r = await post({ secret: 'test-secret', ops: [setOp('s1'), setOp('s2')] });
  assert.deepStrictEqual(await r.json(), { ok: true, applied: 2 });
  const h = await (await get('test-secret')).json();
  assert.deepStrictEqual(h.sets.map(s => s.id), ['s1', 's2']);
  assert.strictEqual(h.sets[0].value, 12);
});

test('duplicate set id is ignored', async () => {
  const r = await post({ secret: 'test-secret', ops: [setOp('s1'), setOp('s2')] });
  assert.deepStrictEqual(await r.json(), { ok: true, applied: 0 });
  const h = await (await get('test-secret')).json();
  assert.strictEqual(h.sets.length, 2);
});

test('workout is replaced by id, state is overwritten', async () => {
  const w = { id: 'w1', type: 'A', startedAt: '2026-11-25T18:00:00Z', finishedAt: null };
  await post({ secret: 'test-secret', ops: [{ kind: 'workout', data: w }] });
  const r = await post({ secret: 'test-secret', ops: [{ kind: 'workout', data: Object.assign({}, w, { finishedAt: '2026-11-25T18:40:00Z' }) },
    { kind: 'state', data: { firstWorkoutAt: '2026-11-25T18:00:00Z', progression: { pushup: { level: 1, extraSets: 0 } } } }] });
  assert.deepStrictEqual(await r.json(), { ok: true, applied: 2 });
  const h = await (await get('test-secret')).json();
  assert.strictEqual(h.workouts.length, 1);
  assert.strictEqual(h.workouts[0].finishedAt, '2026-11-25T18:40:00Z');
  assert.strictEqual(h.state.progression.pushup.level, 1);
});

test('malformed body gives 400', async () => {
  const r = await post('{not json');
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(await r.json(), { ok: false, error: 'bad_request' });
  const r2 = await post({ secret: 'test-secret', ops: [{ kind: 'evil', data: { id: 'a' } }] });
  assert.strictEqual(r2.status, 400);
});

test('parallel posts keep every set (lock works)', async () => {
  const before = (await (await get('test-secret')).json()).sets.length;
  await Promise.all(Array.from({ length: 10 }, (_, i) => post({ secret: 'test-secret', ops: [setOp('p' + i)] })));
  const h = await (await get('test-secret')).json();
  assert.strictEqual(h.sets.length, before + 10);
});

test('corrupt history file is not overwritten', async () => {
  fs.writeFileSync(histFile(), '{"workouts":[{"id":"w1"');
  const g = await get('test-secret');
  assert.strictEqual(g.status, 500);
  const r = await post({ secret: 'test-secret', ops: [setOp('after-corrupt')] });
  assert.strictEqual(r.status, 500);
  assert.strictEqual(fs.readFileSync(histFile(), 'utf8'), '{"workouts":[{"id":"w1"');
});
