(function (root) {
  var AT = root.AT = root.AT || {};
  var DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  var MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var SVGNS = 'http://www.w3.org/2000/svg';

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mmss(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
  }
  // A hint is also a button: in the LG web browser the remote moves a cursor and OK clicks,
  // so every action must be reachable by clicking (data-act = the remote key it stands for).
  function key(k, label, act) {
    return act
      ? '<button type="button" class="hint-btn" data-act="' + act + '"><span class="key">' + k + '</span>' + label + '</button>'
      : '<span><span class="key">' + k + '</span>' + label + '</span>';
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function dateLabel(d) { return cap(DAYS[d.getDay()]) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function targetText(e, state) {
    var max = e.id === 'plank' ? AT.progression.top('plank', state) : e.max;
    var min = Math.min(e.min, max);
    return min === max ? String(max) : min + '–' + max;
  }
  function unitText(e) {
    return (e.unit === 'seconds' ? 'secunde' : 'repetări') + (e.per ? ' pe ' + e.per : '');
  }
  function valuesText(vals) { return vals.length ? vals.join(' · ') : '—'; }
  function nextTrainingDay(from) {
    for (var i = 1; i <= 7; i++) {
      var d = new Date(from.getTime() + i * 86400000);
      if (AT.schedule.isTrainingDay(d)) return DAYS[d.getDay()];
    }
    return '';
  }

  function musicLine() {
    var v = AT.audio.volume();
    return 'Muzică: ' + (v === 0 ? 'oprită' : v + '%') + ' · schimbi din ▲▼ în timpul seriei';
  }

  function homeHtml(s, h, now) {
    var type = s.nextType, ids = AT.program.WORKOUTS[type], st = h.state;
    var rows = ids.map(function (id) {
      var e = AT.program.exercise(id);
      return '<span>' + esc(e.name) + '</span><span>' + AT.schedule.setsFor(id, st, now) + ' × ' + targetText(e, st) +
        (e.per ? ' / ' + e.per : '') + (e.unit === 'seconds' ? ' s' : '') + '</span><span class="last">' +
        valuesText(AT.progression.lastValues(id, h)) + '</span>';
    }).join('');
    var btns;
    if (s.resumable) {
      var pos = AT.session.resumePosition(s.resumable, h, now) || { exIndex: ids.length - 1, setIndex: 1 };
      btns = ['Continuă antrenamentul ' + type + ' (exercițiul ' + (pos.exIndex + 1) + ', seria ' + pos.setIndex + ')', 'Începe din nou'];
    } else if (s.dayKind === 'rest') {
      btns = ['Fă totuși antrenamentul ' + type];
    } else {
      btns = ['Începe încălzirea · 6 min'];
    }
    var heading = s.dayKind === 'rest' && !s.resumable
      ? '<div class="big title">Azi: recuperare</div><div class="sub">Mers 25–35 min și stretching ușor</div><div class="sub">Următorul: Antrenamentul ' + type + '</div>'
      : '<div class="big title">Antrenamentul ' + type + '</div>';
    return '<div class="top"><span>' + dateLabel(now) + ' · Săptămâna ' + AT.schedule.weekNumber(st, now) + '</span><span>~45 min</span></div>' +
      heading +
      '<div class="list num"><span class="h">Exercițiu</span><span class="h">Țintă</span><span class="h">Ultima dată</span>' + rows + '</div>' +
      '<div class="sub music">' + musicLine() + '</div>' +
      '<div class="btns">' + btns.map(function (b, i) {
        return '<button class="btn' + (s.focus === i ? ' on' : '') + '" data-focus="' + i + '">' + esc(b) + '</button>';
      }).join('') + '</div>';
  }

  function warmupHtml(s, now) {
    return '<div class="top"><span>Încălzire</span><span>Antrenamentul ' + s.workout.type + '</span></div>' +
      '<div class="warm"><div class="big clock num">' + mmss(s.warmupEnd - now.getTime()) + '</div><ul>' +
      AT.program.WARMUP.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="hint">' + key('OK', 'sari peste', 'OK') + key('▲', 'muzica mai tare', 'UP') + key('▼', 'mai încet', 'DOWN') + key('Înapoi', 'acasă', 'BACK') + '</div>';
  }

  function exerciseHtml(s, h) {
    var id = s.exIds[s.exIndex], e = AT.program.exercise(id), planned = s.setsPlanned[s.exIndex];
    var dots = '';
    for (var i = 1; i <= Math.max(planned, s.setIndex); i++) dots += '<i' + (i <= s.setIndex ? ' class="on"' : '') + '></i>';
    var sugg = AT.progression.suggestion(id, h.state);
    var tempo = AT.tempo.forExercise(id, AT.progression.level(id, h.state));
    return '<div class="ex"><div class="anim" id="anim"><span class="tag">' + (id === 'lateral-raise' ? 'Vedere din față' : 'Vedere din lateral') + '</span></div>' +
      '<div class="info"><div class="top" style="justify-content:flex-start">Exercițiul ' + (s.exIndex + 1) + ' din ' + s.exIds.length + '</div>' +
      '<div class="big name">' + esc(e.name) + '</div>' +
      '<div class="set">Seria ' + s.setIndex + ' din ' + planned + '</div><div class="dots">' + dots + '</div>' +
      '<div class="big target num">' + targetText(e, h.state) + '<small>' + unitText(e) + '</small></div>' +
      '<div class="prev num">Ultima dată: <b>' + valuesText(AT.progression.lastValues(id, h, s.workout.id)) + '</b></div>' +
      '<div class="tip">' + esc(e.tip) + '</div>' +
      (sugg ? '<div class="sugg">' + esc(sugg) + '</div>' : '') +
      (tempo ? '<div class="ritm">' + esc(AT.tempo.text(tempo)) + '</div>' : '') +
      '</div></div>' +
      '<div class="hint">' + key('OK', 'am terminat seria', 'OK') + key('◀', 'anterior', 'LEFT') + key('▶', 'următor', 'RIGHT') +
      key('▲', 'muzica mai tare', 'UP') + key('▼', 'mai încet', 'DOWN') + key('Înapoi', 'ieși', 'BACK') + '</div>';
  }

  function plankHtml(s, h, now) {
    var sec = Math.max(0, Math.floor((now.getTime() - s.plankStart) / 1000));
    var top = AT.progression.top('plank', h.state), span = Math.max(60, top + 10);
    var pct = function (v) { return Math.min(100, v / span * 100).toFixed(1) + '%'; };
    return '<div class="q">Plank · seria ' + s.setIndex + '</div>' +
      '<div class="big plank-n num">' + sec + ' s</div>' +
      '<div class="bar"><div class="fill" style="width:' + pct(sec) + '"></div>' +
      '<div class="mark" style="left:' + pct(30) + '"></div><div class="lab" style="left:' + pct(30) + '">30</div>' +
      '<div class="mark" style="left:' + pct(top) + '"></div><div class="lab" style="left:' + pct(top) + '">' + top + '</div></div>' +
      '<div class="hint c">' + key('OK', 'gata', 'OK') + key('Înapoi', 'renunță', 'BACK') + '</div>';
  }

  function logHtml(s, h) {
    var id = s.exIds[s.exIndex], e = AT.program.exercise(id);
    var last = AT.progression.lastValues(id, h, s.workout.id);
    var prev = last.length ? (last[s.setIndex - 1] !== undefined ? last[s.setIndex - 1] : last[last.length - 1]) : null;
    var q = e.unit === 'seconds' ? 'Câte secunde ai ținut?' : 'Câte repetări ai făcut' + (e.per ? ' pe ' + e.per : '') + '?';
    return '<div class="q">' + q + '</div>' +
      '<div class="stepper"><button type="button" class="arr" data-act="UP">▲</button><span class="big n num">' + s.value + '</span><button type="button" class="arr" data-act="DOWN">▼</button></div>' +
      '<div class="sub">' + esc(e.name) + ' · seria ' + s.setIndex + (prev !== null ? ' · data trecută: ' + prev : '') + '</div>' +
      '<div class="hint c">' + key('▲', 'plus unu', 'UP') + key('▼', 'minus unu', 'DOWN') + key('OK', 'salvează și pornește pauza', 'OK') + key('Înapoi', 'nu salva', 'BACK') + '</div>';
  }

  function restHtml(s, now) {
    var left = s.restEnd - now.getTime(), frac = Math.max(0, Math.min(1, left / s.restTotal));
    var t = s.target, e = AT.program.exercise(s.exIds[t.exIndex]);
    return '<div class="lbl">Pauză</div>' +
      '<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="#26302b" stroke-width="5"/>' +
      '<circle cx="50" cy="50" r="45" fill="none" stroke="#5ec8e6" stroke-width="5" stroke-linecap="round" stroke-dasharray="282.7" stroke-dashoffset="' + (282.7 * (1 - frac)).toFixed(1) + '"/></svg>' +
      '<div class="t big num">' + mmss(left) + '</div></div>' +
      '<div class="next">Urmează: <b>' + esc(e.name) + ' · seria ' + t.setIndex + ' din ' + s.setsPlanned[t.exIndex] + '</b></div>' +
      '<div class="hint c">' + key('OK', 'sari peste pauză', 'OK') + key('▲', '+15 s', 'UP') + key('▼', '−15 s', 'DOWN') + '</div>';
  }

  function confirmHtml() {
    return '<div class="big title">Ieși din antrenament?</div><div class="sub">Seriile notate rămân salvate. Poți continua azi.</div>' +
      '<div class="hint c">' + key('OK', 'da', 'OK') + key('Înapoi', 'nu', 'BACK') + '</div>';
  }

  function summaryHtml(s, h, now) {
    var w = s.workout, prevW = AT.progression.lastSameType(w.type, h, w.id);
    var mins = Math.max(1, Math.round((new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()) / 60000));
    var mine = function (wid, id) {
      return h.sets.filter(function (x) { return x.workoutId === wid && x.exerciseId === id; })
        .sort(function (a, b) { return a.setIndex - b.setIndex; });
    };
    var total = 0, totalPrev = 0;
    var rows = s.exIds.map(function (id) {
      var e = AT.program.exercise(id), a = mine(w.id, id), b = prevW ? mine(prevW.id, id) : [];
      var sa = a.reduce(function (t, x) { return t + x.value; }, 0), sb = b.reduce(function (t, x) { return t + x.value; }, 0);
      if (e.unit === 'reps') { total += sa; totalPrev += sb; }
      var d = sa - sb, unit = e.unit === 'seconds' ? ' s' : '';
      var diff = !prevW ? '' : d > 0 ? '<span class="up">+' + d + unit + '</span>' : d < 0 ? '<span class="down">−' + (-d) + unit + '</span>' : '<span class="same">=</span>';
      return '<tr><td>' + esc(e.name) + '</td><td>' + valuesText(a.map(function (x) { return x.value; })) + '</td><td class="same">' +
        valuesText(b.map(function (x) { return x.value; })) + '</td><td>' + diff + '</td></tr>';
    }).join('');
    var head;
    if (!prevW) head = 'Primul antrenament ' + w.type + '. Bravo!';
    else if (total > totalPrev) head = '+' + (total - totalPrev) + ' repetări față de data trecută';
    else if (total < totalPrev) head = '−' + (totalPrev - total) + ' repetări față de data trecută';
    else head = 'La fel ca data trecută';
    return '<div class="top"><span>Antrenamentul ' + w.type + ' · gata în ' + mins + ' min</span><span>Următorul: ' + nextTrainingDay(now) + ', ' + (w.type === 'A' ? 'B' : 'A') + '</span></div>' +
      '<div class="big head">' + head + '</div>' +
      '<table class="num"><tr><th>Exercițiu</th><th>Azi</th><th>Data trecută</th><th></th></tr>' + rows + '</table>' +
      '<div class="hint">' + key('OK', 'gata', 'OK') + '</div>';
  }

  var mounted = { id: null, handle: null };

  // fig: { tempo, startAt } for the exercise figure, set by app.js when the exercise screen is entered.
  function render(rootEl, s, history, online, now, fig) {
    now = now || new Date();
    var h = history, html = '', cls = 'scr';
    switch (s.screen) {
      case 'home': html = homeHtml(s, h, now); break;
      case 'warmup': html = warmupHtml(s, now); break;
      case 'exercise': html = exerciseHtml(s, h); break;
      case 'plank': html = plankHtml(s, h, now); cls += ' mid'; break;
      case 'log': html = logHtml(s, h); cls += ' mid'; break;
      case 'rest': html = restHtml(s, now); cls += ' mid'; break;
      case 'confirmExit': html = confirmHtml(); cls += ' mid'; break;
      case 'summary': html = summaryHtml(s, h, now); cls += ' sum'; break;
    }
    var exId = s.screen === 'exercise' ? s.exIds[s.exIndex] : null;
    var keepAnim = exId && mounted.id === exId && rootEl.getAttribute('data-screen') === 'exercise';
    var svg = keepAnim ? rootEl.querySelector('#anim svg') : null;
    rootEl.className = cls;
    rootEl.setAttribute('data-screen', s.screen);
    rootEl.innerHTML = html;
    if (exId) {
      var holder = rootEl.querySelector('#anim');
      if (svg) {
        holder.appendChild(svg);
      } else {
        if (mounted.handle) mounted.handle.stop();
        svg = rootEl.ownerDocument.createElementNS(SVGNS, 'svg');
        svg.setAttribute('aria-label', AT.program.exercise(exId).name);
        holder.appendChild(svg);
        mounted = { id: exId, handle: AT.figures.mount(svg, exId, fig || {}) };
      }
    } else if (mounted.handle) {
      mounted.handle.stop();
      mounted = { id: null, handle: null };
    }
    var banner = rootEl.ownerDocument.getElementById('banner');
    if (banner) banner.hidden = !!online;
  }

  function keyToAction(e) {
    var code = e.keyCode || e.which, map = { 37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN', 13: 'OK', 461: 'BACK', 27: 'BACK', 8: 'BACK' };
    var type = map[code];
    if (!type) return null;
    if (e.preventDefault) e.preventDefault();
    if (e.repeat) return null; // a held key acts once
    return { type: type };
  }

  function runEffects(effects, store) {
    effects.forEach(function (e) {
      if (e.type === 'saveWorkout') store.saveWorkout(e.workout);
      else if (e.type === 'saveSet') store.saveSet(e.set);
      else if (e.type === 'saveState') store.saveState(e.state);
      else if (e.type === 'beep') AT.audio.signal(e.kind);
      else if (e.type === 'volume') { AT.audio.changeVolume(e.delta); showVolume(AT.audio.volume()); }
      else if (e.type === 'fullscreen') {
        try {
          var el = root.document.documentElement;
          var p = el.requestFullscreen ? el.requestFullscreen() : null;
          if (p && p.catch) p.catch(function () {});
        } catch (err) { /* optional */ }
      }
    });
  }

  var volTimer = null;
  function showVolume(pct) {
    var el = root.document && root.document.getElementById('vol');
    if (!el) return;
    el.textContent = pct === 0 ? 'Muzică oprită' : '♪ ' + pct + '%';
    el.hidden = false;
    if (volTimer) clearTimeout(volTimer);
    volTimer = setTimeout(function () { el.hidden = true; }, 2000);
  }

  AT.ui = { render: render, keyToAction: keyToAction, runEffects: runEffects, showVolume: showVolume, mmss: mmss };
  if (typeof module === 'object' && module.exports) module.exports = AT.ui;
})(typeof window !== 'undefined' ? window : globalThis);
