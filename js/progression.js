(function (root) {
  var AT = root.AT = root.AT || {};

  function finishedWithExercise(history, exerciseId, excludeId) {
    var ids = {};
    (history.sets || []).forEach(function (s) { if (s.exerciseId === exerciseId) ids[s.workoutId] = true; });
    var best = null;
    (history.workouts || []).forEach(function (w) {
      if (!w.finishedAt || w.id === excludeId || !ids[w.id]) return;
      if (!best || w.startedAt > best.startedAt) best = w;
    });
    return best;
  }

  function lastValues(exerciseId, history, excludeWorkoutId) {
    var w = finishedWithExercise(history, exerciseId, excludeWorkoutId);
    if (!w) return [];
    return (history.sets || [])
      .filter(function (s) { return s.workoutId === w.id && s.exerciseId === exerciseId; })
      .sort(function (a, b) { return a.setIndex - b.setIndex; })
      .map(function (s) { return s.value; });
  }

  function lastSameType(type, history, excludeWorkoutId) {
    var best = null;
    AT.schedule.withSets(history.workouts, history.sets || []).forEach(function (w) {
      if (w.type !== type || !w.finishedAt || w.id === excludeWorkoutId) return;
      if (!best || w.startedAt > best.startedAt) best = w;
    });
    return best;
  }

  function prog(state, id) {
    return ((state && state.progression) || {})[id] || { level: 0, extraSets: 0 };
  }

  function top(exerciseId, state) {
    var p = prog(state, exerciseId);
    if (exerciseId === 'plank' && p.plankTarget) return p.plankTarget;
    return AT.program.exercise(exerciseId).max;
  }

  function suggestion(exerciseId, state) {
    var p = prog(state, exerciseId), T = top(exerciseId, state);
    if (p.level === 1) return 'Ai atins ' + T + ' la toate seriile. Încearcă azi coborârea lentă, în 3 secunde.';
    if (p.level === 2) return 'Ai atins ' + T + ' la toate seriile cu coborâre lentă. Adaugă azi o pauză de 1–2 secunde în poziția grea.';
    if (p.level === 3) {
      if (exerciseId === 'plank' && p.plankTarget) return 'Ținta de azi: ' + T + ' de secunde.';
      return 'Ai atins ' + T + ' la toate seriile. Azi faci o serie în plus.';
    }
    return null;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function advance(state, workoutSets, workoutExerciseIds, today) {
    var next = clone(state || { firstWorkoutAt: null, progression: {} });
    next.progression = next.progression || {};
    workoutExerciseIds.forEach(function (id) {
      var p = prog(state, id);
      var mine = workoutSets.filter(function (s) { return s.exerciseId === id; });
      var need = AT.schedule.setsFor(id, state, today);
      var T = top(id, state);
      var hit = mine.length >= need && mine.every(function (s) {
        return s.value >= T && (s.method || 0) === (p.level || 0);
      });
      if (!hit) return;
      var np = clone(p);
      if ((np.level || 0) < 3) {
        np.level = (np.level || 0) + 1;
        np.extraSets = np.level === 3 ? 1 : (np.extraSets || 0);
      } else if (id === 'plank') {
        np.plankTarget = Math.min(60, (np.plankTarget || 45) + 5);
      }
      next.progression[id] = np;
    });
    if (!next.firstWorkoutAt && workoutSets.length) {
      next.firstWorkoutAt = workoutSets.map(function (s) { return s.at; }).sort()[0];
    }
    return next;
  }

  AT.progression = {
    METHOD_LABEL: ['', 'coborâre lentă', 'pauză în poziția grea', 'serie în plus'],
    lastValues: lastValues,
    lastSameType: lastSameType,
    top: top,
    level: function (exerciseId, state) { return prog(state, exerciseId).level || 0; },
    suggestion: suggestion,
    advance: advance
  };
  if (typeof module === 'object' && module.exports) module.exports = AT.progression;
})(typeof window !== 'undefined' ? window : globalThis);
