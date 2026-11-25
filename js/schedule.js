(function (root) {
  var AT = root.AT = root.AT || {};
  var DAY = 86400000;

  function dayIndex(date) {
    var x = new Date(date);
    return Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / DAY);
  }
  function sameDay(a, b) { return dayIndex(a) === dayIndex(b); }
  function daysSince(fromIso, today) { return dayIndex(today) - dayIndex(fromIso); }

  function latest(workouts) {
    var best = null;
    workouts.forEach(function (w) { if (!best || w.startedAt > best.startedAt) best = w; });
    return best;
  }
  // With `sets` given, keep only workouts that have at least one saved set (an empty start does not count).
  function withSets(workouts, sets) {
    if (!sets) return workouts || [];
    var has = {};
    sets.forEach(function (s) { has[s.workoutId] = true; });
    return (workouts || []).filter(function (w) { return has[w.id]; });
  }

  AT.schedule = {
    sameDay: sameDay,

    withSets: withSets,

    nextWorkoutType: function (workouts, sets) {
      var last = latest(withSets(workouts, sets));
      if (!last) return 'A';
      return last.type === 'A' ? 'B' : 'A';
    },

    isTrainingDay: function (date) {
      var d = date.getDay();
      return d === 1 || d === 3 || d === 5;
    },

    setsFor: function (exerciseId, state, today) {
      if (!state || !state.firstWorkoutAt || daysSince(state.firstWorkoutAt, today) < 14) return 2;
      var p = (state.progression || {})[exerciseId] || {};
      return AT.program.exercise(exerciseId).sets + (p.extraSets || 0);
    },

    weekNumber: function (state, today) {
      if (!state || !state.firstWorkoutAt) return 1;
      return Math.floor(Math.max(0, daysSince(state.firstWorkoutAt, today)) / 7) + 1;
    },

    findResumable: function (workouts, today, sets) {
      var found = null;
      withSets(workouts, sets).forEach(function (w) {
        if (!w.finishedAt && sameDay(w.startedAt, today) && (!found || w.startedAt > found.startedAt)) found = w;
      });
      return found;
    },

    closeStale: function (workouts, sets, today) {
      var out = [];
      (workouts || []).forEach(function (w) {
        if (w.finishedAt || dayIndex(w.startedAt) >= dayIndex(today)) return;
        var end = w.startedAt;
        (sets || []).forEach(function (s) { if (s.workoutId === w.id && s.at > end) end = s.at; });
        var copy = {};
        for (var k in w) copy[k] = w[k];
        copy.finishedAt = end;
        out.push(copy);
      });
      return out;
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = AT.schedule;
})(typeof window !== 'undefined' ? window : globalThis);
