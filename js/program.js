(function (root) {
  var AT = root.AT = root.AT || {};

  function ex(id, name, sets, min, max, unit, per, tip) {
    return { id: id, name: name, sets: sets, min: min, max: max, unit: unit, per: per, tip: tip };
  }

  var list = [
    ex('goblet-squat', 'Genuflexiuni cu gantera', 3, 12, 15, 'reps', null,
      'Ține gantera la piept, coboară controlat, genunchii în direcția vârfurilor.'),
    ex('pushup', 'Flotări', 3, 8, 15, 'reps', null,
      'Corpul drept de la cap la călcâie. Dacă e greu, cu genunchii pe sol.'),
    ex('db-row', 'Ramat cu două gantere', 3, 10, 15, 'reps', null,
      'Trage coatele spre spate, strânge omoplații, spatele neutru.'),
    ex('overhead-press', 'Împins cu ganterele deasupra capului', 3, 8, 12, 'reps', null,
      'Amplitudine confortabilă, nu forța articulațiile.'),
    ex('biceps-curl', 'Flexii biceps', 3, 10, 15, 'reps', null,
      'Mișcare controlată, fără balansarea corpului.'),
    ex('plank', 'Plank', 3, 30, 45, 'seconds', null,
      'Corpul drept, abdomenul strâns, nu lăsa șoldurile să cadă.'),
    ex('rdl', 'Îndreptări românești', 3, 10, 15, 'reps', null,
      'Împinge șoldurile înapoi, spatele neutru, ganterele aproape de picioare.'),
    ex('reverse-lunge', 'Fandări înapoi', 3, 10, 10, 'reps', 'picior',
      'Pas mare înapoi, genunchiul din față deasupra gleznei. Se pot face și fără gantere.'),
    ex('floor-press', 'Împins cu ganterele din culcat', 3, 10, 15, 'reps', null,
      'Coatele coboară până ating ușor podeaua, apoi împinge.'),
    ex('lateral-raise', 'Ridicări laterale', 3, 12, 15, 'reps', null,
      'Ridică până la nivelul umerilor, coatele ușor îndoite. Dacă 10 kg e prea greu, câte o ganteră pe rând.'),
    ex('dead-bug', 'Dead Bug', 3, 10, 12, 'reps', 'parte',
      'Spatele lipit de podea, mișcare lentă braț–picior opus.')
  ];

  var EXERCISES = {};
  list.forEach(function (e) { EXERCISES[e.id] = e; });

  AT.program = {
    EXERCISES: EXERCISES,
    WORKOUTS: {
      A: ['goblet-squat', 'pushup', 'db-row', 'overhead-press', 'biceps-curl', 'plank'],
      B: ['rdl', 'reverse-lunge', 'floor-press', 'lateral-raise', 'biceps-curl', 'dead-bug']
    },
    WARMUP: [
      'Mers pe loc – 1 min',
      'Rotiri de brațe – 1 min',
      'Balansări de șold – 2 min',
      'Genuflexiuni fără greutate – 2 min'
    ],
    exercise: function (id) {
      var e = EXERCISES[id];
      if (!e) throw new Error('Exercițiu necunoscut: ' + id);
      return e;
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = AT.program;
})(typeof window !== 'undefined' ? window : globalThis);
