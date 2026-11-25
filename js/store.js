(function (root) {
  var AT = root.AT = root.AT || {};
  var KEY_H = 'at.history', KEY_O = 'at.outbox';

  function newId() {
    var r = '';
    for (var i = 0; i < 8; i++) r += Math.floor(Math.random() * 36).toString(36);
    return Date.now().toString(36) + '-' + r;
  }

  function emptyHistory() { return { workouts: [], sets: [], state: { firstWorkoutAt: null, progression: {} } }; }

  function readJson(storage, key, fallback) {
    try {
      var v = storage && storage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJson(storage, key, value) {
    try { if (storage) storage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  function upsert(list, item, prefer) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id) {
        list[i] = prefer ? prefer(list[i], item) : item;
        return;
      }
    }
    list.push(item);
  }
  function finishedWins(a, b) { return (a.finishedAt && !b.finishedAt) ? a : b; }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function create(opts) {
    var storage = opts.storage, fetchFn = opts.fetchFn, url = opts.url, secret = opts.secret || '';
    var timeoutMs = opts.timeoutMs || 5000;
    var now = opts.now || function () { return new Date(); };
    var flushing = null, again = false;

    var store = {
      online: false,
      history: emptyHistory(),

      load: function () {
        var local = readJson(storage, KEY_H, null) || emptyHistory();
        local.workouts = local.workouts || []; local.sets = local.sets || [];
        local.state = local.state || { firstWorkoutAt: null, progression: {} };
        var outbox = readJson(storage, KEY_O, []);
        var localStateDirty = outbox.some(function (o) { return o.kind === 'state'; });

        function finish(remote) {
          var h = local;
          if (remote) {
            (remote.workouts || []).forEach(function (w) { upsert(h.workouts, w, function (mine, theirs) { return finishedWins(mine, theirs); }); });
            (remote.sets || []).forEach(function (s) { upsert(h.sets, s, function (mine) { return mine; }); });
            if (remote.state && !localStateDirty) h.state = remote.state;
          }
          var closed = AT.schedule.closeStale(h.workouts, h.sets, now());
          store.history = h;
          closed.forEach(function (w) { store.saveWorkout(w, true); });
          writeJson(storage, KEY_H, h);
          return { history: h, online: store.online };
        }

        if (!secret) { store.online = false; return Promise.resolve(finish(null)); }
        var req = fetchFn(url + '?action=all&secret=' + encodeURIComponent(secret), { cache: 'no-store' })
          .then(function (r) { return r.json(); });
        return withTimeout(req, timeoutMs).then(function (data) {
          if (!data || !data.ok) throw new Error('bad response');
          store.online = true;
          return finish(data);
        }, function () {
          store.online = false;
          return finish(null);
        });
      },

      saveWorkout: function (w, noFlush) {
        upsert(store.history.workouts, w);
        queue({ kind: 'workout', data: w }, noFlush);
      },
      saveSet: function (s) {
        upsert(store.history.sets, s);
        queue({ kind: 'set', data: s });
      },
      saveState: function (st) {
        store.history.state = st;
        queue({ kind: 'state', data: st });
      },

      flush: function () {
        if (flushing) { again = true; return flushing; }
        var ops = readJson(storage, KEY_O, null);
        if (ops === null) ops = memoryOutbox;
        if (!secret || !ops.length) return Promise.resolve(true);
        var sent = ops.length;
        flushing = fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ secret: secret, ops: ops })
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (!res || !res.ok) throw new Error('rejected');
          var current = readJson(storage, KEY_O, null);
          if (current === null) current = memoryOutbox;
          var rest = current.slice(sent);
          memoryOutbox = rest;
          writeJson(storage, KEY_O, rest);
          store.online = true;
          return true;
        }).catch(function () {
          store.online = false;
          return false;
        }).then(function (okFlag) {
          flushing = null;
          if (again) { again = false; return store.flush(); }
          return okFlag;
        });
        return flushing;
      }
    };

    var memoryOutbox = [];
    function queue(op, noFlush) {
      var ops = readJson(storage, KEY_O, null);
      if (ops === null) ops = memoryOutbox;
      ops.push(op);
      memoryOutbox = ops;
      writeJson(storage, KEY_O, ops);
      writeJson(storage, KEY_H, store.history);
      if (!noFlush) store.flush();
    }

    return store;
  }

  AT.store = { newId: newId, create: create };
  if (typeof module === 'object' && module.exports) module.exports = AT.store;
})(typeof window !== 'undefined' ? window : globalThis);
