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
    var resumable = AT.schedule.findResumable(h.workouts, now);
    return {
      screen: 'home',
      dayKind: AT.schedule.isTrainingDay(now) ? 'training' : 'rest',
      resumable: resumable,
      nextType: resumable ? resumable.type : AT.schedule.nextWorkoutType(h.workouts),
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
      beeped: false,
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
        screen: 'rest', target: pos, beeped: false,
        restEnd: now.getTime() + s2.restTotal
      }),
      effects: [{ type: 'saveSet', set: set }]
    };
  }

  function next(s, action, ctx) {
    var now = action.now, t = now.getTime(), a = action.type;
    var none = { state: s, effects: [] };
    switch (s.screen) {
      case 'home':
        if ((a === 'UP' || a === 'DOWN') && s.resumable) return { state: assign(s, { focus: s.focus ? 0 : 1 }), effects: [] };
        if (a === 'OK') {
          if (s.resumable && s.focus === 0) return resume(s.resumable, now, ctx);
          return start(s.nextType, now, ctx);
        }
        return none;

      case 'warmup':
        if (a === 'OK' || (a === 'TICK' && t >= s.warmupEnd)) {
          var r = { state: toExercise(s, { exIndex: 0, setIndex: 1 }), effects: [] };
          if (a === 'TICK') r.effects.push({ type: 'beep', long: true });
          return r;
        }
        return none;

      case 'exercise':
        if (a === 'OK') {
          if (s.exIds[s.exIndex] === 'plank') return { state: assign(s, { screen: 'plank', plankStart: t }), effects: [] };
          var s1 = assign(s, { screen: 'log' });
          s1.value = logDefault(s1, ctx);
          return { state: s1, effects: [] };
        }
        if (a === 'LEFT' || a === 'RIGHT') {
          var i = Math.max(0, Math.min(s.exIds.length - 1, s.exIndex + (a === 'LEFT' ? -1 : 1)));
          return { state: toExercise(s, { exIndex: i, setIndex: countFor(s, s.exIds[i]) + 1 }), effects: [] };
        }
        if (a === 'BACK') return { state: assign(s, { screen: 'confirmExit' }), effects: [] };
        return none;

      case 'plank':
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
          return { state: assign(s, { restTotal: total, restEnd: end, beeped: s.beeped && end - t <= 3000 }), effects: [] };
        }
        if (a === 'OK') return { state: toExercise(s, s.target), effects: [] };
        if (a === 'TICK') {
          var left = s.restEnd - t;
          if (left <= 0) return { state: toExercise(s, s.target), effects: [{ type: 'beep', long: true }] };
          if (left <= 3000 && !s.beeped) return { state: assign(s, { beeped: true }), effects: [{ type: 'beep', long: false }] };
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

  AT.session = { home: home, next: next, REST_MS: REST_MS, WARMUP_MS: WARMUP_MS };
  if (typeof module === 'object' && module.exports) module.exports = AT.session;
})(typeof window !== 'undefined' ? window : globalThis);
