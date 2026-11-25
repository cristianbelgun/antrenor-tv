(function (root) {
  var AT = root.AT = root.AT || {};
  var KEY = 'at.music', LOOKAHEAD = 0.25, PUMP_MS = 100, BEAT = 60 / 120;
  var MUSIC_MAX = 0.6, SFX_LEVEL = 0.55, DUCK = 0.3;

  function sceneMode(screen) {
    if (screen === 'warmup' || screen === 'exercise' || screen === 'plank') return 'play';
    if (screen === 'rest' || screen === 'log' || screen === 'confirmExit') return 'rest';
    return 'off';
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }

  function create(opts) {
    opts = opts || {};
    var storage = opts.storage !== undefined ? opts.storage : safe(function () { return root.localStorage; });
    var setI = opts.setInterval || function (f, ms) { return root.setInterval(f, ms); };
    var clearI = opts.clearInterval || function (id) { root.clearInterval(id); };
    var setT = opts.setTimeout || function (f, ms) { return root.setTimeout(f, ms); };
    var perfNow = opts.now || function () { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); };

    var ctx = null, musicBus = null, sfxBus = null, noise = null, pumpId = null;
    var vol = readVolume();
    var wanted = 'off', mode = 'off';
    var playlist = [], plIndex = 0, mp3 = null, mp3Direct = false;
    var gen = null; // { comp, bar, nextBarAt, startAt }
    var tempo = null; // { t, startAt, next }
    var events = [];
    var busLevel = 0, mp3Failures = 0;

    function readVolume() {
      var v = safe(function () { return storage && storage.getItem(KEY); });
      var n = v === null || v === undefined ? 60 : Number(v);
      return isNaN(n) ? 60 : Math.max(0, Math.min(100, Math.round(n / 10) * 10));
    }
    function log(e) {
      e.at = e.at !== undefined ? e.at : (ctx ? ctx.currentTime : 0);
      events.push(e);
      if (events.length > 50) events.shift();
    }
    function level() { return MUSIC_MAX * vol / 100; }

    function init(o) {
      if (ctx) { safe(function () { if (ctx.state === 'suspended') ctx.resume(); }); return; }
      var Ctx = (o && o.Ctx) || root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return;
      safe(function () {
        ctx = new Ctx();
        musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_LEVEL; sfxBus.connect(ctx.destination);
        var len = Math.floor((ctx.sampleRate || 44100) * 0.3);
        noise = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
        var d = noise.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        pumpId = setI(pump, PUMP_MS);
      });
      if (!ctx) return;
      apply();
      if (tempo && tempo.pending) startTempo(tempo.t);
    }

    // ---------- music ----------
    function apply() {
      var target = vol === 0 ? 'off' : wanted;
      if (!ctx) { mode = target; return; }
      if (target === 'off') { if (mode !== 'off') stopMusic(); mode = 'off'; busLevel = 0; return; }
      var wasOff = mode === 'off';
      mode = target;
      if (wasOff) startMusic();
      // Touch the bus only when the level really changes: a play↔rest switch must not cancel a running duck.
      if (wasOff || busLevel !== level()) { busLevel = level(); setBus(busLevel); }
    }
    function setBus(v) {
      safe(function () {
        var t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(musicBus.gain.value, t);
        musicBus.gain.linearRampToValueAtTime(v, t + 0.05);
      });
      if (mp3 && mp3Direct) safe(function () { mp3.volume = Math.min(1, v / MUSIC_MAX); });
    }
    function startMusic() {
      if (playlist.length) { gen = null; playMp3(); return; }
      var t = ctx.currentTime + 0.1;
      gen = { comp: AT.music.compose(Math.floor(Math.random() * 1e9)), bar: 0, nextBarAt: t, startAt: t };
    }
    function stopMusic() {
      safe(function () {
        var t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(musicBus.gain.value, t);
        musicBus.gain.linearRampToValueAtTime(0, t + 1);
      });
      gen = null;
      var el = mp3;
      mp3 = null;
      if (el) setT(function () { safe(function () { el.pause(); }); }, 1000);
    }
    function playMp3() {
      if (typeof root.Audio === 'undefined' || !playlist.length) return;
      safe(function () {
        var el = new root.Audio('muzica/' + encodeURIComponent(playlist[plIndex % playlist.length]));
        plIndex++;
        mp3Direct = false;
        try { ctx.createMediaElementSource(el).connect(musicBus); } catch (e) { mp3Direct = true; el.volume = vol / 100; }
        el.addEventListener('ended', function () { if (mp3 === el && mode !== 'off') playMp3(); });
        el.addEventListener('playing', function () { if (mp3 === el) mp3Failures = 0; });
        el.addEventListener('error', function () {
          if (mp3 !== el || mode === 'off') return;
          mp3Failures++;
          if (mp3Failures >= playlist.length) { // every file failed: use generated music instead
            playlist = []; mp3 = null; mp3Failures = 0;
            startMusic();
          } else playMp3();
        });
        mp3 = el;
        var p = el.play();
        if (p && p.catch) p.catch(function () {});
      });
    }
    function shuffle(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; }
      return a;
    }
    function usePlaylist(files) {
      playlist = shuffle((files || []).filter(function (f) { return typeof f === 'string' && f; }));
      plIndex = 0;
      if (ctx && mode !== 'off') { stopMusic(); mode = 'off'; apply(); }
    }
    function loadPlaylist(fetchFn, secret) {
      if (!fetchFn || !secret) return Promise.resolve();
      return Promise.resolve().then(function () {
        return fetchFn('api.php?action=music&secret=' + encodeURIComponent(secret), { cache: 'no-store' });
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.ok && Array.isArray(j.files) && j.files.length) usePlaylist(j.files);
      }).catch(function () { /* keep generated music */ });
    }

    // ---------- synthesis ----------
    function env(g, t, peak, decay) {
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    }
    function osc(type, freq, t, dur, peak, dest, filter) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (filter) { o.connect(filter); filter.connect(g); } else o.connect(g);
      g.connect(dest);
      env(g, t, peak, dur);
      o.start(t); o.stop(t + dur + 0.05);
      return o;
    }
    function noiseHit(t, ftype, freq, peak, decay) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; f.type = ftype; f.frequency.value = freq;
      s.connect(f); f.connect(g); g.connect(musicBus);
      env(g, t, peak, decay);
      s.start(t); s.stop(t + decay + 0.05);
    }
    function playNote(n, t) {
      var dur = n.dur * BEAT;
      if (n.inst === 'kick') {
        var o = osc('sine', 150, t, 0.28, 0.9, musicBus);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      } else if (n.inst === 'hat') noiseHit(t, 'highpass', 7000, 0.12, 0.05);
      else if (n.inst === 'clap') noiseHit(t, 'bandpass', 1500, 0.35, 0.12);
      else if (n.inst === 'bass') {
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
        osc('square', mtof(n.midi), t, dur, 0.22, musicBus, lp);
      } else if (n.inst === 'lead') osc('triangle', mtof(n.midi), t, dur, 0.12, musicBus);
    }
    // After a stall (busy TV, hidden page) skip what is already late instead of playing it all at once.
    function catchUp(now) {
      if (gen) while (gen.nextBarAt + 4 * BEAT < now) { gen.bar++; gen.nextBarAt += 4 * BEAT; }
      if (tempo && !tempo.pending) while (tempo.startAt + tempo.next < now) tempo.next++;
    }
    function scheduleMusic(until) {
      while (gen && gen.nextBarAt < until) {
        var notes = AT.music.bar(gen.comp, gen.bar, mode === 'rest' ? 'rest' : 'play');
        for (var i = 0; i < notes.length; i++) playNote(notes[i], gen.nextBarAt + notes[i].beat * BEAT);
        gen.bar++;
        gen.nextBarAt += 4 * BEAT;
      }
    }
    function scheduleTicks(until) {
      if (!tempo) return;
      while (tempo.startAt + tempo.next < until) {
        var at = tempo.startAt + tempo.next, accent = tempo.next % tempo.t.period === 0;
        safe(function () { osc('sine', accent ? 1568 : 1175, at, accent ? 0.05 : 0.035, accent ? 0.9 : 0.6, sfxBus); });
        log({ type: 'tick', accent: accent, at: at });
        tempo.next++;
      }
    }
    function pump() {
      if (!ctx) return;
      var until = ctx.currentTime + LOOKAHEAD;
      catchUp(ctx.currentTime);
      safe(function () { scheduleMusic(until); });
      scheduleTicks(until);
    }

    // ---------- cues ----------
    var CUES = {
      short: [[880, 0, 0.12]],
      long: [[660, 0, 0.6]],
      double: [[880, 0, 0.12], [880, 0.24, 0.12]],
      high2: [[1046, 0, 0.12], [1046, 0.24, 0.12]]
    };
    function signal(kind) {
      log({ type: 'cue', kind: kind });
      if (!ctx) return;
      safe(function () {
        var t = ctx.currentTime + 0.02, parts = CUES[kind] || CUES.short, end = 0;
        parts.forEach(function (p) { osc('sine', p[0], t + p[1], p[2], 0.9, sfxBus); end = Math.max(end, p[1] + p[2]); });
        if (mode !== 'off') {
          var lv = level();
          musicBus.gain.cancelScheduledValues(t);
          musicBus.gain.setValueAtTime(lv * DUCK, t);
          musicBus.gain.setValueAtTime(lv * DUCK, t + end);
          musicBus.gain.linearRampToValueAtTime(lv, t + end + 0.4);
        }
      });
    }

    // ---------- tempo ----------
    function startTempo(t) {
      if (!t) return perfNow();
      if (!ctx) { tempo = { t: t, startAt: 0, next: 0, pending: true }; return perfNow(); }
      var now = ctx.currentTime, start = now + 0.1;
      if (gen && mode !== 'off') {
        var beats = Math.ceil((now + 0.05 - gen.startAt) / BEAT);
        if (beats % 2) beats++;
        start = gen.startAt + beats * BEAT;
      }
      tempo = { t: t, startAt: start, next: 0 };
      return perfNow() + (start - now) * 1000;
    }
    function stopTempo() { tempo = null; }

    function setVolume(p) {
      var n = Math.max(0, Math.min(100, Math.round(Number(p) / 10) * 10));
      if (isNaN(n)) return;
      vol = n;
      safe(function () { if (storage) storage.setItem(KEY, String(vol)); });
      apply();
    }

    return {
      init: init,
      setScene: function (screen) { wanted = sceneMode(screen); apply(); },
      signal: signal,
      startTempo: startTempo,
      stopTempo: stopTempo,
      setVolume: setVolume,
      changeVolume: function (d) { setVolume(vol + d); },
      volume: function () { return vol; },
      usePlaylist: usePlaylist,
      loadPlaylist: loadPlaylist,
      state: function () {
        return { ctx: !!ctx, mode: mode, source: mode === 'off' ? 'none' : (playlist.length ? 'mp3' : 'generated'), tempo: !!tempo, volume: vol };
      },
      events: events,
      _ctx: function () { return ctx; },
      _buses: function () { return { music: musicBus, sfx: sfxBus }; },
      _pump: pump
    };
  }

  var api = create();
  api.create = create;
  api.sceneMode = sceneMode;
  AT.audio = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
