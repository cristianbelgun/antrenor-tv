(function (root) {
  var AT = root.AT = root.AT || {};
  var WARMUP_MS = 360000, REST_MS = 90000, REST_MIN = 60000, REST_MAX = 120000, REST_STEP = 15000;

  function assign(base, patch) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    for (k in patch) o[k] = patch[k];
    return o;
  }
  function iso(d) { return new Date(d).toISOString(); }
  function emptyHistory(h) { return h || { workouts: [], sets: [], state: { firstWorkoutAt: null, progression: {} } }; }

  function home(history, now) {
    var h = emptyHistory(history);
    var resumable = AT.schedule.findResumable(h.workouts, now, h.sets);
    return {
      screen: 'home',
      dayKind: AT.schedule.isTrainingDay(now) ? 'training' : 'rest',
      resumable: resumable,
      nextType: resumable ? resumable.type : AT.schedule.nextWorkoutType(h.workouts, h.sets),
      focus: 0
    };
  }

  function countFor(s, exId) {
    var n = 0;
    s.done.forEach(function (x) { if (x.exerciseId === exId) n++; });
    return n;
  }

  // First exercise with sets still to do, scanning from `from` and wrapping around.
  function nextIncomplete(s, from) {
    for (var k = 0; k < s.exIds.length; k++) {
      var i = (from + k) % s.exIds.length;
      var c = countFor(s, s.exIds[i]);
      if (c < s.setsPlanned[i]) return { exIndex: i, setIndex: c + 1 };
    }
    return null;
  }

  function workoutState(workout, history, now, done) {
    var h = emptyHistory(history);
    var exIds = AT.program.WORKOUTS[workout.type];
    return {
      workout: workout,
      exIds: exIds,
      setsPlanned: exIds.map(function (id) { return AT.schedule.setsFor(id, h.state, now); }),
      done: done || [],
      exIndex: 0,
      setIndex: 1,
      value: 0,
      restTotal: REST_MS,
      restEnd: 0,
      warmupEnd: 0,
      plankStart: 0,
      cueSec: null,
      warmCue: 0,
      plankCue: 0,
      target: null
    };
  }

  function toExercise(s, pos) {
    return assign(s, { screen: 'exercise', exIndex: pos.exIndex, setIndex: pos.setIndex, target: null });
  }

  function finish(s, now, ctx) {
    var done = assign(s.workout, { finishedAt: iso(now) });
    var state = AT.progression.advance(emptyHistory(ctx.history).state, s.done, s.exIds, now);
    return {
      state: assign(s, { screen: 'summary', workout: done }),
      effects: [{ type: 'saveWorkout', workout: done }, { type: 'saveState', state: state }]
    };
  }

  function start(type, now, ctx) {
    var w = { id: ctx.newId(), type: type, startedAt: iso(now), finishedAt: null };
    var s = assign(workoutState(w, ctx.history, now), { screen: 'warmup', warmupEnd: now.getTime() + WARMUP_MS });
    return { state: s, effects: [{ type: 'saveWorkout', workout: w }, { type: 'fullscreen' }] };
  }

  function resume(w, now, ctx) {
    var h = emptyHistory(ctx.history);
    var done = h.sets.filter(function (x) { return x.workoutId === w.id; });
    var s = workoutState(w, h, now, done);
    var pos = nextIncomplete(s, 0);
    var effects = [{ type: 'fullscreen' }];
    if (!pos) {
      var f = finish(s, now, ctx);
      f.effects.unshift(effects[0]);
      return f;
    }
    return { state: toExercise(s, pos), effects: effects };
  }

  function resumePosition(w, history, now) {
    var h = emptyHistory(history);
    var s = workoutState(w, h, now, h.sets.filter(function (x) { return x.workoutId === w.id; }));
    return nextIncomplete(s, 0);
  }

  function logDefault(s, ctx) {
    var exId = s.exIds[s.exIndex];
    var last = AT.progression.lastValues(exId, emptyHistory(ctx.history), s.workout.id);
    if (last.length >= s.setIndex) return last[s.setIndex - 1];
    if (last.length) return last[last.length - 1];
    return AT.program.exercise(exId).min;
  }

  function saveSet(s, now, ctx) {
    var exId = s.exIds[s.exIndex], e = AT.program.exercise(exId);
    var set = {
      id: ctx.newId(), workoutId: s.workout.id, type: s.workout.type,
      exerciseId: exId, exerciseName: e.name, setIndex: s.setIndex,
      value: s.value, unit: e.unit,
      method: AT.progression.level(exId, emptyHistory(ctx.history).state),
      at: iso(now)
    };
    var s2 = assign(s, { done: s.done.concat([set]) });
    var pos = nextIncomplete(s2, s2.exIndex);
    if (!pos) {
      var f = finish(s2, now, ctx);
      f.effects.unshift({ type: 'saveSet', set: set });
      return f;
    }
    return {
      state: assign(s2, {
        screen: 'rest', target: pos, cueSec: null,
        restEnd: now.getTime() + s2.restTotal
      }),
      effects: [{ type: 'saveSet', set: set }]
    };
  }

  var OK_GUARD_MS = 500;
  var WARM_MARKS = [60000, 120000, 240000]; // warm-up exercise changes (WARMUP: 1 + 1 + 2 + 2 min)

  function volume(a) { return { type: 'volume', delta: a === 'UP' ? 10 : -10 }; }

  // Ignores OK pressed within OK_GUARD_MS of a screen change (key repeat, double press,
  // a pointer click arriving together with the key) and stamps the time of each change.
  function next(s, action, ctx) {
    var t = action.now.getTime();
    if (action.type === 'OK' && s.since && t - s.since < OK_GUARD_MS) return { state: s, effects: [] };
    var r = step(s, action, ctx);
    if (r.state.screen !== s.screen) r.state = assign(r.state, { since: t });
    return r;
  }

  function closeAbandoned(w, ctx) {
    var end = w.startedAt;
    emptyHistory(ctx.history).sets.forEach(function (x) { if (x.workoutId === w.id && x.at > end) end = x.at; });
    return assign(w, { finishedAt: end });
  }

  function step(s, action, ctx) {
    var now = action.now, t = now.getTime(), a = action.type;
    var none = { state: s, effects: [] };
    switch (s.screen) {
      case 'home':
        if ((a === 'UP' || a === 'DOWN') && s.resumable) return { state: assign(s, { focus: s.focus ? 0 : 1 }), effects: [] };
        if (a === 'OK') {
          if (s.resumable && s.focus === 0) return resume(s.resumable, now, ctx);
          var st = start(s.nextType, now, ctx);
          if (s.resumable) st.effects.unshift({ type: 'saveWorkout', workout: closeAbandoned(s.resumable, ctx) });
          return st;
        }
        return none;

      case 'warmup':
        if (a === 'BACK') return { state: home(ctx.history, now), effects: [] };
        if (a === 'UP' || a === 'DOWN') return { state: s, effects: [volume(a)] };
        if (a === 'OK' || (a === 'TICK' && t >= s.warmupEnd)) {
          var r = { state: toExercise(s, { exIndex: 0, setIndex: 1 }), effects: [] };
          if (a === 'TICK') r.effects.push({ type: 'beep', kind: 'long' });
          return r;
        }
        if (a === 'TICK') {
          var done = s.warmCue || 0, elapsed = t - (s.warmupEnd - WARMUP_MS);
          if (done < WARM_MARKS.length && elapsed >= WARM_MARKS[done]) {
            return { state: assign(s, { warmCue: done + 1 }), effects: [{ type: 'beep', kind: 'double' }] };
          }
        }
        return none;

      case 'exercise':
        if (a === 'OK') {
          if (s.exIds[s.exIndex] === 'plank') return { state: assign(s, { screen: 'plank', plankStart: t, plankCue: 0 }), effects: [] };
          var s1 = assign(s, { screen: 'log' });
          s1.value = logDefault(s1, ctx);
          return { state: s1, effects: [] };
        }
        if (a === 'LEFT' || a === 'RIGHT') {
          var i = Math.max(0, Math.min(s.exIds.length - 1, s.exIndex + (a === 'LEFT' ? -1 : 1)));
          return { state: toExercise(s, { exIndex: i, setIndex: countFor(s, s.exIds[i]) + 1 }), effects: [] };
        }
        if (a === 'BACK') return { state: assign(s, { screen: 'confirmExit' }), effects: [] };
        if (a === 'UP' || a === 'DOWN') return { state: s, effects: [volume(a)] };
        return none;

      case 'plank':
        if (a === 'TICK') {
          var held = t - s.plankStart, pc = s.plankCue || 0;
          var target = AT.progression.top('plank', emptyHistory(ctx.history).state) * 1000;
          if (pc < 1 && held >= 30000 && held < target) return { state: assign(s, { plankCue: 1 }), effects: [{ type: 'beep', kind: 'short' }] };
          if (pc < 2 && held >= target) return { state: assign(s, { plankCue: 2 }), effects: [{ type: 'beep', kind: 'high2' }] };
          return none;
        }
        if (a === 'OK') return { state: assign(s, { screen: 'log', value: Math.round((t - s.plankStart) / 1000) }), effects: [] };
        if (a === 'BACK') return { state: assign(s, { screen: 'exercise' }), effects: [] };
        return none;

      case 'log':
        if (a === 'UP') return { state: assign(s, { value: s.value + 1 }), effects: [] };
        if (a === 'DOWN') return { state: assign(s, { value: Math.max(0, s.value - 1) }), effects: [] };
        if (a === 'OK') return saveSet(s, now, ctx);
        if (a === 'BACK') return { state: assign(s, { screen: 'exercise' }), effects: [] };
        return none;

      case 'rest':
        if (a === 'UP' || a === 'DOWN') {
          var total = Math.max(REST_MIN, Math.min(REST_MAX, s.restTotal + (a === 'UP' ? REST_STEP : -REST_STEP)));
          var end = s.restEnd + (total - s.restTotal);
          return { state: assign(s, { restTotal: total, restEnd: end, cueSec: end - t > 3000 ? null : s.cueSec }), effects: [] };
        }
        if (a === 'OK') return { state: toExercise(s, s.target), effects: [] };
        if (a === 'TICK') {
          var left = s.restEnd - t;
          if (left <= 0) return { state: toExercise(s, s.target), effects: [{ type: 'beep', kind: 'long' }] };
          var n = Math.ceil(left / 1000);
          if (n <= 3 && (s.cueSec === null || s.cueSec === undefined || n < s.cueSec)) {
            return { state: assign(s, { cueSec: n }), effects: [{ type: 'beep', kind: 'short' }] };
          }
        }
        return none;

      case 'confirmExit':
        if (a === 'OK') return { state: home(ctx.history, now), effects: [] };
        if (a === 'BACK') return { state: assign(s, { screen: 'exercise' }), effects: [] };
        return none;

      case 'summary':
        if (a === 'OK') return { state: home(ctx.history, now), effects: [] };
        return none;
    }
    return none;
  }

  AT.session = { home: home, next: next, resumePosition: resumePosition, REST_MS: REST_MS, WARMUP_MS: WARMUP_MS };
  if (typeof module === 'object' && module.exports) module.exports = AT.session;
})(typeof window !== 'undefined' ? window : globalThis);
