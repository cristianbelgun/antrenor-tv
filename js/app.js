(function (root) {
  var AT = root.AT, doc = root.document;
  var app = doc.getElementById('app'), stage = doc.querySelector('.tv');
  var s = null, store = null, lastKey = '';

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
    AT.ui.render(app, s, store.history, store.online, now);
  }

  function dispatch(type) {
    if (!s) return;
    var r = AT.session.next(s, { type: type, now: new Date() }, ctx());
    AT.ui.runEffects(r.effects, store);
    var changed = r.state !== s;
    s = r.state;
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
    var a = AT.ui.keyToAction(e);
    if (!a) return;
    AT.ui.ensureAudio();
    keepAwake();
    dispatch(a.type);
  });
  // Magic Remote pointer: clicking a home button focuses and confirms it.
  app.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-focus]') : null;
    if (b && s && s.screen === 'home') {
      s.focus = Number(b.getAttribute('data-focus'));
      dispatch('OK');
    } else if (s && s.screen !== 'home') {
      dispatch('OK');
    }
  });

  store.load().then(function () {
    s = AT.session.home(store.history, new Date());
    draw(true);
    setInterval(function () { dispatch('TICK'); }, 250);
  });
})(window);
