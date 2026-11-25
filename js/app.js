(function (root) {
  var AT = root.AT, doc = root.document;
  var app = doc.getElementById('app'), stage = doc.querySelector('.tv');
  var s = null, store = null, lastKey = '', lastKeyAt = 0, loadedDay = '', audioReady = false;

  function fit() {
    var w = Math.min(root.innerWidth, root.innerHeight * 16 / 9);
    stage.style.width = w + 'px';
    stage.style.height = (w * 9 / 16) + 'px';
    doc.documentElement.style.fontSize = (w / 100) + 'px';
  }
  fit();
  root.addEventListener('resize', fit);

  var storage = null;
  try { storage = root.localStorage; } catch (e) { storage = null; }
  store = AT.store.create({
    storage: storage,
    fetchFn: root.fetch ? root.fetch.bind(root) : function () { return Promise.reject(new Error('no fetch')); },
    url: 'api.php',
    secret: (AT.config && AT.config.secret) || ''
  });

  function ctx() { return { history: store.history, newId: AT.store.newId }; }

  // Re-render only when something visible changed (screen, state object, or the shown second).
  function draw(force) {
    var now = new Date();
    var k = s.screen + '|' + Math.floor(now.getTime() / 1000) + '|' + store.online;
    if (!force && k === lastKey) return;
    lastKey = k;
    AT.ui.render(app, s, store.history, store.online, now, fig);
  }

  // Sound follows the screen; the tempo (ticks + figure) restarts each time an exercise screen is entered.
  var fig = null, figKey = '';
  function syncSound(prev) {
    AT.audio.setScene(s.screen);
    var key = s.screen === 'exercise' ? s.exIds[s.exIndex] : '';
    var entered = key && (!prev || prev.screen !== 'exercise' || figKey !== key);
    if (!key && figKey) { AT.audio.stopTempo(); fig = null; }
    if (entered) {
      var t = AT.tempo.forExercise(key, AT.progression.level(key, store.history.state));
      AT.audio.stopTempo();
      fig = t ? { tempo: t, startAt: AT.audio.startTempo(t) } : null;
    }
    figKey = key;
  }

  function dispatch(type) {
    if (!s) return;
    var r = AT.session.next(s, { type: type, now: new Date() }, ctx());
    AT.ui.runEffects(r.effects, store);
    var changed = r.state !== s, prev = s;
    s = r.state;
    if (changed) syncSound(prev);
    if (changed || type !== 'TICK') draw(true); else draw(false);
  }

  var wakeLock = null;
  function keepAwake() {
    try {
      if (root.navigator.wakeLock && !wakeLock) {
        root.navigator.wakeLock.request('screen').then(function (l) {
          wakeLock = l;
          l.addEventListener('release', function () { wakeLock = null; });
        }, function () {});
      }
    } catch (e) { /* optional */ }
  }
  doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible') keepAwake(); });

  doc.addEventListener('keydown', function (e) {
    lastKeyAt = Date.now();
    var a = AT.ui.keyToAction(e);
    if (!a) return;
    AT.audio.init(); // also resumes audio the TV may have suspended
    if (!audioReady) {
      audioReady = true;
      AT.audio.loadPlaylist(root.fetch ? root.fetch.bind(root) : null, (AT.config && AT.config.secret) || '');
    }
    keepAwake();
    dispatch(a.type);
  });
  // Magic Remote pointer: clicking a home button focuses and confirms it.
  app.addEventListener('click', function (e) {
    if (Date.now() - lastKeyAt < 300) return; // the remote's OK can also fire a click
    var b = e.target.closest ? e.target.closest('[data-focus]') : null;
    if (b && s && s.screen === 'home') {
      s.focus = Number(b.getAttribute('data-focus'));
      dispatch('OK');
    } else if (s && s.screen !== 'home') {
      dispatch('OK');
    }
  });

  // (Re)loads history, closes workouts left open on earlier days and shows the home screen.
  function boot() {
    return store.load().then(function () {
      loadedDay = new Date().toDateString();
      s = AT.session.home(store.history, new Date());
      syncSound(null);
      draw(true);
      store.flush(); // send anything saved while offline
    });
  }

  boot().then(function () {
    setInterval(function () {
      if (new Date().toDateString() !== loadedDay && (s.screen === 'home' || s.screen === 'summary')) {
        loadedDay = new Date().toDateString();
        boot();
        return;
      }
      dispatch('TICK');
    }, 250);
    setInterval(function () { store.flush(); }, 60000);
  });
})(window);
