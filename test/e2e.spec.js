// End-to-end smoke test: drives a whole Workout A with the keyboard (like the TV remote).
// Run: node test/e2e.spec.js
const { chromium } = require('playwright');
const assert = require('assert');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function fakeApi(page, state) {
  return page.route('**/api.php*', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      if (body.secret !== 'k') return route.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"unauthorized"}' });
      body.ops.forEach(o => { state.ops.push(o); if (o.kind === 'set' && !state.sets.some(s => s.id === o.data.id)) state.sets.push(o.data); });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, applied: body.ops.length }) });
    }
    if (state.forbidGet) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false,"error":"unauthorized"}' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign({ ok: true, workouts: [], sets: [], state: null }, state.remote || {})) });
  });
}

async function press(page, key) { await page.keyboard.press(key); await page.clock.runFor(600); }
async function text(page) { return page.locator('#app').innerText(); }
async function screen(page) { return page.locator('#app').getAttribute('data-screen'); }
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png') }); }

async function workoutA(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const api = { ops: [], sets: [] };
  await fakeApi(page, api);
  await page.clock.install({ time: new Date('2026-11-25T18:00:00') });
  await page.addInitScript(() => { window.AT = window.AT || {}; window.AT.config = { secret: 'k' }; });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app[data-screen="home"]');
  assert.match(await text(page), /Antrenamentul A/);
  await shot(page, 'e2e-1-home');

  await press(page, 'Enter');
  assert.strictEqual(await screen(page), 'warmup');
  assert.match(await text(page), /6:00|5:59/);
  await shot(page, 'e2e-2-warmup');
  await press(page, 'Enter');
  assert.strictEqual(await screen(page), 'exercise');
  let t = await text(page);
  assert.match(t, /Genuflexiuni cu gantera/);
  assert.match(t, /Seria 1 din 2/);
  assert.match(t, /Ultima dată: —/);
  await shot(page, 'e2e-3-exercise');

  await press(page, 'Enter');
  assert.strictEqual(await screen(page), 'log');
  await press(page, 'ArrowUp');
  assert.match(await text(page), /13/);
  await shot(page, 'e2e-4-log');
  await press(page, 'Enter');
  assert.strictEqual(await screen(page), 'rest');
  assert.match(await text(page), /Pauză/i);
  await shot(page, 'e2e-5-rest');
  await page.clock.runFor(91000);
  assert.strictEqual(await screen(page), 'exercise');
  assert.match(await text(page), /Seria 2 din 2/);

  let guard = 0;
  while ((await screen(page)) !== 'summary' && guard++ < 60) {
    const s = await screen(page);
    if (s === 'exercise') {
      await press(page, 'Enter');
      if ((await screen(page)) === 'plank') {
        await shot(page, 'e2e-6-plank');
        await page.clock.runFor(39400);
        await press(page, 'Enter');
        assert.strictEqual(await screen(page), 'log');
        assert.match(await text(page), /40/);
      }
    } else if (s === 'log' || s === 'rest') {
      await press(page, 'Enter');
    } else throw new Error('unexpected screen ' + s);
  }
  await page.clock.runFor(1000);
  assert.strictEqual(await screen(page), 'summary');
  assert.match(await text(page), /Primul antrenament A/);
  assert.strictEqual(await page.evaluate(() => AT.audio.state().mode), 'off', 'music stops on summary');
  await shot(page, 'e2e-7-summary');

  await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('at.outbox')).length === 0; } catch (e) { return false; } });
  assert.strictEqual(api.sets.length, 12, 'server received 12 sets');
  assert.strictEqual(new Set(api.sets.map(s => s.id)).size, 12);
  assert.deepStrictEqual(errors, []);
  await page.close();
}

async function offlineBanner(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('**/api.php*', route => route.abort());
  await page.addInitScript(() => { window.AT = window.AT || {}; window.AT.config = { secret: 'k' }; });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app[data-screen="home"]', { timeout: 10000 });
  assert.match(await page.locator('body').innerText(), /Fără conexiune, salvez pe televizor/);
  await page.close();
}

async function historyPage(browser, base) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const api = { ops: [], sets: [], remote: {
    workouts: [{ id: 'w1', type: 'A', startedAt: '2026-11-25T18:00:00.000Z', finishedAt: '2026-11-25T18:44:00.000Z' }],
    sets: [
      { id: 's1', workoutId: 'w1', type: 'A', exerciseId: 'pushup', exerciseName: 'Flotări', setIndex: 1, value: 12, unit: 'reps', method: 0, at: '2026-11-25T18:10:00.000Z' },
      { id: 's2', workoutId: 'w1', type: 'A', exerciseId: 'pushup', exerciseName: 'Flotări', setIndex: 2, value: 11, unit: 'reps', method: 0, at: '2026-11-25T18:13:00.000Z' },
      { id: 's3', workoutId: 'w1', type: 'A', exerciseId: 'plank', exerciseName: 'Plank', setIndex: 1, value: 40, unit: 'seconds', method: 0, at: '2026-11-25T18:40:00.000Z' }
    ], state: null } };
  await fakeApi(page, api);
  await page.goto(base + '/istoric.html');
  await page.fill('#key', 'k');
  await page.click('#go');
  await page.waitForSelector('.workout');
  const t = await page.locator('body').innerText();
  assert.match(t, /Flotări/);
  assert.match(t, /12 · 11/);
  assert.match(t, /40 s/);
  assert.match(t, /miercuri, 25 noiembrie/);
  await page.screenshot({ path: path.join(OUT, 'e2e-8-istoric.png') });
  // a wrong key shows an error and asks again
  api.forbidGet = true;
  await page.evaluate(() => { localStorage.setItem('at.secret', 'bad'); });
  await page.reload();
  await page.waitForSelector('#key');
  assert.match(await page.locator('body').innerText(), /Cheie greșită/);
  await page.close();
}

async function outboxOnLoad(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const api = { ops: [], sets: [] };
  await fakeApi(page, api);
  await page.addInitScript(() => {
    window.AT = window.AT || {}; window.AT.config = { secret: 'k' };
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('at.outbox', JSON.stringify([{ kind: 'set', data: { id: 'offline-1', workoutId: 'w', exerciseId: 'pushup', setIndex: 1, value: 9, at: '2026-11-25T18:00:00.000Z' } }]));
    }
  });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app[data-screen="home"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('at.outbox') || '[1]').length === 0, null, { timeout: 5000 });
  assert.deepStrictEqual(api.sets.map(x => x.id), ['offline-1']);
  await page.close();
}

async function heldOk(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const api = { ops: [], sets: [] };
  await fakeApi(page, api);
  await page.clock.install({ time: new Date('2026-11-25T18:00:00') });
  await page.addInitScript(() => { window.AT = window.AT || {}; window.AT.config = { secret: 'k' }; });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app[data-screen="home"]');
  await press(page, 'Enter'); await press(page, 'Enter'); await press(page, 'Enter');
  assert.strictEqual(await screen(page), 'log');
  await page.keyboard.down('Enter');           // first press: saves, goes to rest
  for (let i = 0; i < 30; i++) {               // auto-repeat while held
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, repeat: true, bubbles: true })));
    await page.clock.runFor(50);
  }
  await page.keyboard.up('Enter');
  assert.strictEqual(await screen(page), 'rest');
  await page.clock.runFor(1000);
  const sets = await page.evaluate(() => JSON.parse(localStorage.getItem('at.history')).sets.length);
  assert.strictEqual(sets, 1);
  await page.close();
}

async function midnight(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await fakeApi(page, { ops: [], sets: [] });
  await page.clock.install({ time: new Date('2026-11-25T23:59:50') });
  await page.addInitScript(() => {
    window.AT = window.AT || {}; window.AT.config = { secret: 'k' };
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('at.history', JSON.stringify({
        workouts: [{ id: 'w', type: 'A', startedAt: new Date(2026, 10, 25, 23, 30).toISOString(), finishedAt: null }],
        sets: [{ id: 's', workoutId: 'w', type: 'A', exerciseId: 'goblet-squat', setIndex: 1, value: 12, unit: 'reps', method: 0, at: new Date(2026, 10, 25, 23, 40).toISOString() }],
        state: { firstWorkoutAt: null, progression: {} } }));
    }
  });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app[data-screen="home"]');
  assert.match(await text(page), /Continuă antrenamentul A/);
  await page.clock.runFor(20000);
  await page.waitForFunction(() => /Joi, 26 noiembrie/.test(document.getElementById('app').innerText), null, { timeout: 5000 });
  const t = await text(page);
  assert.doesNotMatch(t, /Continuă/);
  assert.match(t, /Antrenamentul B|Azi: recuperare/);
  await page.close();
}

async function soundScenario(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await fakeApi(page, { ops: [], sets: [] });
  await page.clock.install({ time: new Date('2026-11-25T18:00:00') });
  await page.addInitScript(() => {
    window.AT = window.AT || {}; window.AT.config = { secret: 'k' };
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('at.history', JSON.stringify({ workouts: [], sets: [],
        state: { firstWorkoutAt: '2026-11-05T18:00:00.000Z', progression: { 'goblet-squat': { level: 1, extraSets: 0 } } } }));
    }
  });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app[data-screen="home"]');
  assert.match(await text(page), /Muzică: 60% · schimbi din ▲▼ în timpul seriei/);
  assert.strictEqual(await page.evaluate(() => AT.audio.state().mode), 'off', 'no music on home');

  await press(page, 'Enter');
  assert.strictEqual(await page.evaluate(() => AT.audio.state().mode), 'play', 'music on warm-up');
  await press(page, 'Enter');
  assert.strictEqual(await screen(page), 'exercise');
  assert.match(await text(page), /Ritm: jos 3 s · sus 1 s/);
  // Audio time is real time (the page clock is faked), so let both run together for ~4 s.
  for (let i = 0; i < 40; i++) { await page.clock.runFor(100); await page.waitForTimeout(100); }
  const ticks = await page.evaluate(() => AT.audio.events.filter(e => e.type === 'tick'));
  assert.ok(ticks.length >= 3, 'ticks: ' + ticks.length);
  assert.strictEqual(ticks[0].accent, true);
  await page.screenshot({ path: path.join(OUT, 'e2e-9-ritm.png') });

  // If the TV suspends audio, the next key press brings it back.
  await page.evaluate(() => AT.audio._ctx().suspend());
  await page.waitForFunction(() => AT.audio._ctx().state === 'suspended');
  await press(page, 'ArrowUp');
  await page.waitForFunction(() => AT.audio._ctx().state === 'running', null, { timeout: 3000 });
  assert.strictEqual(await page.locator('#vol').innerText(), '♪ 70%');
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('at.music')), '70');

  await press(page, 'Enter');                       // to the log screen
  assert.strictEqual(await screen(page), 'log');
  assert.strictEqual(await page.evaluate(() => AT.audio.state().tempo), false, 'tempo stops when leaving exercise');
  await press(page, 'Enter');                       // rest
  assert.strictEqual(await page.evaluate(() => AT.audio.state().mode), 'rest');
  await page.clock.runFor(91000);
  const cues = await page.evaluate(() => AT.audio.events.filter(e => e.type === 'cue').map(e => e.kind));
  assert.deepStrictEqual(cues.slice(-4), ['short', 'short', 'short', 'long']);
  assert.deepStrictEqual(errors, []);
  await page.close();
}

// The LG web browser turns the remote's arrows into a moving cursor and OK into a click:
// the page gets no key events at all. Everything must work by clicking.
async function cursorOnly(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await fakeApi(page, { ops: [], sets: [] });
  await page.clock.install({ time: new Date('2026-11-25T18:00:00') });
  await page.addInitScript(() => { window.AT = window.AT || {}; window.AT.config = { secret: 'k' }; });
  await page.goto(base + '/index.html');
  await page.waitForSelector('#app[data-screen="home"]');
  const tap = async (sel) => { await page.click(sel); await page.clock.runFor(600); };

  await tap('.btn.on');
  assert.strictEqual(await screen(page), 'warmup');
  assert.strictEqual(await page.evaluate(() => AT.audio.state().ctx), true, 'a click starts the sound');
  assert.strictEqual(await page.evaluate(() => AT.audio.state().mode), 'play');

  await tap('[data-act="OK"]');
  assert.strictEqual(await screen(page), 'exercise');
  await tap('[data-act="UP"]');
  assert.strictEqual(await page.locator('#vol').innerText(), '♪ 70%');
  await tap('[data-act="RIGHT"]');
  assert.match(await text(page), /Exercițiul 2 din 6/);
  await tap('[data-act="LEFT"]');
  await tap('[data-act="OK"]');
  assert.strictEqual(await screen(page), 'log');
  await tap('[data-act="UP"]');
  assert.match(await page.locator('.stepper .n').innerText(), /^13$/);
  await tap('[data-act="OK"]');
  assert.strictEqual(await screen(page), 'rest');
  await tap('[data-act="UP"]');
  assert.match(await text(page), /1:4[0-5]/);
  await tap('[data-act="OK"]');
  assert.strictEqual(await screen(page), 'exercise');
  await tap('[data-act="BACK"]');
  assert.strictEqual(await screen(page), 'confirmExit');
  await tap('[data-act="BACK"]');
  assert.strictEqual(await screen(page), 'exercise');
  await page.screenshot({ path: path.join(OUT, 'e2e-10-cursor.png') });
  assert.deepStrictEqual(errors, []);
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  let failed = false;
  for (const [name, fn] of [['workout A end to end', workoutA], ['offline banner', offlineBanner], ['phone history page', historyPage], ['outbox flushed on load', outboxOnLoad], ['held OK saves one set', heldOk], ['home rolls over at midnight', midnight], ['sound: music, tempo, volume, cues', soundScenario], ['cursor only (LG browser)', cursorOnly]]) {
    try { await fn(browser, base); console.log('ok -', name); }
    catch (e) { failed = true; console.log('not ok -', name, '\n', e && e.stack || e); }
  }
  await browser.close(); srv.close();
  process.exit(failed ? 1 : 0);
})();
