(function (root) {
  var AT = root.AT = root.AT || {};

  // Rep cycles (spec "sunet și muzică" §6). `to` = figure key the phase moves toward (null = hold).
  var GROUP = {
    'goblet-squat': 'top', 'pushup': 'top', 'rdl': 'top', 'reverse-lunge': 'top', 'floor-press': 'top',
    'db-row': 'bottom', 'biceps-curl': 'bottom', 'lateral-raise': 'bottom', 'overhead-press': 'bottom',
    'dead-bug': 'deadbug'
  };
  var HOLD = { label: 'ține', sec: 2, to: null };
  var CYCLES = {
    top: [[{ label: 'jos', sec: 3, to: 1 }], [{ label: 'sus', sec: 1, to: 0 }]],
    bottom: [[{ label: 'sus', sec: 1, to: 1 }], [{ label: 'jos', sec: 3, to: 0 }]],
    deadbug: [[{ label: 'întinde', sec: 3, to: 1 }], [{ label: 'revino', sec: 1, to: 0 }]]
  };

  function forExercise(exerciseId, level) {
    var g = GROUP[exerciseId];
    if (!g || (level !== 1 && level !== 2)) return null;
    var c = CYCLES[g];
    var phases = c[0].concat(level === 2 ? [HOLD] : [], c[1]);
    var period = phases.reduce(function (t, p) { return t + p.sec; }, 0);
    return { exerciseId: exerciseId, level: level, period: period, phases: phases };
  }

  function text(t) {
    return 'Ritm: ' + t.phases.map(function (p) { return p.label + ' ' + p.sec + ' s'; }).join(' · ');
  }

  function ticks(t, fromSec, toSec) {
    var out = [];
    for (var s = Math.ceil(fromSec); s < toSec; s++) out.push({ at: s, accent: s % t.period === 0 });
    return out;
  }

  function ease(x) { return (1 - Math.cos(Math.PI * x)) / 2; }

  function position(t, sec) {
    var s = ((sec % t.period) + t.period) % t.period, p = 0;
    for (var i = 0; i < t.phases.length; i++) {
      var ph = t.phases[i];
      if (s < ph.sec) {
        if (ph.to === null) return p;
        return p + (ph.to - p) * ease(s / ph.sec);
      }
      s -= ph.sec;
      if (ph.to !== null) p = ph.to;
    }
    return p;
  }

  AT.tempo = { forExercise: forExercise, text: text, ticks: ticks, position: position };
  if (typeof module === 'object' && module.exports) module.exports = AT.tempo;
})(typeof window !== 'undefined' ? window : globalThis);
