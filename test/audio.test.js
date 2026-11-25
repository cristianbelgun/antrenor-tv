const test = require('node:test');
const assert = require('node:assert');
require('../js/program.js'); require('../js/tempo.js'); require('../js/music.js');
const A = require('../js/audio.js');

// Minimal fake Web Audio: records what gets started.
function param(v) {
  const calls = [];
  return { value: v, calls,
    setValueAtTime(x, t) { calls.push(['set', x, t]); }, linearRampToValueAtTime(x, t) { calls.push(['ramp', x, t]); },
    exponentialRampToValueAtTime() {}, cancelScheduledValues(t) { calls.push(['cancel', t]); }, setTargetAtTime() {} };
}
function node(extra) { return Object.assign({ connect() { return this; }, disconnect() {} }, extra || {}); }
function FakeCtx() {
  const self = this;
  this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.started = [];
  this.destination = node();
  this.resume = () => Promise.resolve();
  this.createGain = () => node({ gain: param(1) });
  this.createOscillator = () => node({ type: 'sine', frequency: param(440), start(t) { self.started.push(['osc', t]); }, stop() {} });
  this.createBiquadFilter = () => node({ type: 'lowpass', frequency: param(1000), Q: param(1) });
  this.createBuffer = (ch, len) => ({ getChannelData: () => new Float32Array(len) });
  this.createBufferSource = () => node({ buffer: null, start(t) { self.started.push(['noise', t]); }, stop() {} });
  this.createMediaElementSource = () => node();
}
function memStorage() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }
const make = (storage) => A.create({ storage: storage || memStorage(), setInterval: () => 0, clearInterval() {}, setTimeout: () => 0 });

test('audio calls before init are safe', () => {
  const a = make();
  a.signal('short'); a.setScene('exercise'); a.startTempo(AT.tempo.forExercise('pushup', 1)); a.stopTempo(); a.changeVolume(10);
  assert.strictEqual(a.state().ctx, false);
});

test('sceneMode table', () => {
  const m = {}; ['warmup', 'exercise', 'plank', 'rest', 'log', 'confirmExit', 'home', 'summary', 'loading'].forEach(s => m[s] = A.sceneMode(s));
  assert.deepStrictEqual(m, { warmup: 'play', exercise: 'play', plank: 'play', rest: 'rest', log: 'rest', confirmExit: 'rest', home: 'off', summary: 'off', loading: 'off' });
});

test('volume default, clamp and persistence', () => {
  const st = memStorage();
  const a = make(st);
  assert.strictEqual(a.volume(), 60);
  for (let i = 0; i < 5; i++) a.changeVolume(10);
  assert.strictEqual(a.volume(), 100);
  assert.strictEqual(make(st).volume(), 100);
  a.setVolume(-5);
  assert.strictEqual(a.volume(), 0);
  assert.strictEqual(st.getItem('at.music'), '0');
});

test('music follows scenes and starts generated', () => {
  const a = make();
  a.init({ Ctx: FakeCtx });
  assert.strictEqual(a.state().mode, 'off');
  a.setScene('exercise');
  assert.deepStrictEqual([a.state().mode, a.state().source], ['play', 'generated']);
  a.setScene('rest');
  assert.strictEqual(a.state().mode, 'rest');
  a.setScene('summary');
  assert.strictEqual(a.state().mode, 'off');
});

test('volume 0 stops music but not cues', () => {
  const a = make();
  a.init({ Ctx: FakeCtx });
  a.setScene('exercise');
  a.setVolume(0);
  assert.strictEqual(a.state().mode, 'off');
  a.signal('short');
  assert.strictEqual(a.events[a.events.length - 1].kind, 'short');
  a.setVolume(50);
  assert.strictEqual(a.state().mode, 'play');
});

test('playlist failure falls back to generated', async () => {
  const a = make();
  a.init({ Ctx: FakeCtx });
  await a.loadPlaylist(() => Promise.reject(new Error('offline')), 'k');
  a.setScene('exercise');
  assert.strictEqual(a.state().source, 'generated');
  const b = make();
  b.init({ Ctx: FakeCtx });
  await b.loadPlaylist(() => Promise.resolve({ status: 403, json: () => Promise.resolve({ ok: false }) }), 'k');
  b.setScene('exercise');
  assert.strictEqual(b.state().source, 'generated');
  const c = make();
  c.init({ Ctx: FakeCtx });
  await c.loadPlaylist(() => Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, files: ['a.mp3'] }) }), 'k');
  c.setScene('exercise');
  assert.strictEqual(c.state().source, 'mp3');
});

test('tempo start and stop; ticks are scheduled one per second', () => {
  const a = make();
  a.init({ Ctx: FakeCtx });
  a.setScene('exercise');
  a.startTempo(AT.tempo.forExercise('goblet-squat', 1));
  assert.strictEqual(a.state().tempo, true);
  for (let i = 0; i < 45; i++) { a._ctx().currentTime += 0.1; a._pump(); }
  const ticks = a.events.filter(e => e.type === 'tick');
  assert.ok(ticks.length >= 4, 'ticks ' + ticks.length);
  assert.strictEqual(ticks[0].accent, true);
  assert.ok(Math.abs((ticks[1].at - ticks[0].at) - 1) < 1e-6);
  a.stopTempo();
  assert.strictEqual(a.state().tempo, false);
});

test('generated music schedules drum notes', () => {
  const a = make();
  a.init({ Ctx: FakeCtx });
  a.setScene('exercise');
  for (let i = 0; i < 25; i++) { a._ctx().currentTime += 0.1; a._pump(); }
  assert.ok(a._ctx().started.length > 10);
});

test('a tempo started before init begins cleanly after init', () => {
  const a = make();
  a.startTempo(AT.tempo.forExercise('pushup', 1));
  a.init({ Ctx: FakeCtx });
  a._ctx().currentTime = 100; // the TV has been on for a while
  a._pump();
  assert.ok(a.events.filter(e => e.type === 'tick').length <= 1, 'no burst of overdue ticks');
});

function musicBusOf(a) { return a._buses().music.gain.calls; }

test('a cue ducks the music and a following scene change keeps the duck', () => {
  for (const next of ['exercise', 'rest']) {
    const a = make();
    a.init({ Ctx: FakeCtx });
    a.setScene('exercise');
    a._ctx().currentTime = 5;
    a.signal('short');
    a.setScene(next);
    const calls = musicBusOf(a);
    const last = calls[calls.length - 1];
    assert.strictEqual(last[0], 'ramp', next);
    assert.ok(last[2] > 5.4, 'recovers after the cue, at ' + last[2]);
    assert.ok(calls.some(c => c[0] === 'set' && Math.abs(c[1] - 0.6 * 0.6 * 0.3) < 1e-9), 'ducked to 30%');
  }
});

test('a broken mp3 moves on, and all broken falls back to generated', () => {
  const made = [];
  global.Audio = function (url) {
    const ls = {}; this.url = url; made.push(this);
    this.addEventListener = (ev, f) => { ls[ev] = f; };
    this.play = () => { setImmediate(() => ls.error && ls.error()); return Promise.resolve(); };
    this.pause = () => {};
    this.fire = ev => ls[ev] && ls[ev]();
  };
  try {
    const a = make();
    a.init({ Ctx: FakeCtx });
    a.usePlaylist(['a.mp3', 'b.mp3']);
    a.setScene('exercise');
    assert.strictEqual(a.state().source, 'mp3');
    made[0].fire('error');
    assert.strictEqual(made.length, 2, 'next track started');
    made[1].fire('error');
    assert.strictEqual(a.state().source, 'generated');
    for (let i = 0; i < 25; i++) { a._ctx().currentTime += 0.1; a._pump(); }
    assert.ok(a._ctx().started.length > 10, 'generated music playing');
  } finally { delete global.Audio; }
});
