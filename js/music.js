(function (root) {
  var AT = root.AT = root.AT || {};

  // Pure composition: which notes play in which bar. Sound synthesis lives in audio.js.
  var BPM = 120;
  // Chord roots as semitone offsets inside a natural minor key.
  var PROGRESSIONS = [
    [0, 8, 3, 10],  // i – VI – III – VII
    [0, 5, 8, 7],   // i – iv – VI – v
    [0, 8, 10, 7],  // i – VI – VII – v
    [0, 3, 10, 8],  // i – III – VII – VI
    [0, 10, 8, 10]  // i – VII – VI – VII
  ];
  var MINOR_DEGREES = { 0: true, 5: true, 7: true };
  var BASS_PATTERNS = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 12, 0, 0, 0, 12, 0],
    [0, 7, 0, 7, 0, 7, 12, 7]
  ];
  var LEAD_BEATS = [0, 0.75, 1.5, 2, 2.75, 3.5];
  var LEAD_SHAPES = [[0, 1, 2, 1, 2, 3], [2, 1, 0, 1, 2, 1], [0, 2, 1, 3, 2, 1]];

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, list) { return list[Math.floor(r() * list.length)]; }

  function compose(seed) {
    var r = rng(seed);
    var sections = [];
    for (var i = 0; i < 8; i++) {
      sections.push({
        lead: i === 0 ? false : i === 1 ? true : r() < 0.6,
        bass: Math.floor(r() * BASS_PATTERNS.length),
        brk: r() < 0.5,
        shape: Math.floor(r() * LEAD_SHAPES.length)
      });
    }
    return { seed: seed, root: 45 + Math.floor(r() * 8), progression: pick(r, PROGRESSIONS).slice(), sections: sections };
  }

  function chordAt(c, index) { return c.progression[index % 4]; }

  function chordTones(offset) {
    var third = MINOR_DEGREES[offset] ? 3 : 4;
    return [0, third, 7, 12];
  }

  function bar(c, index, mode) {
    var sec = c.sections[Math.floor(index / 8) % c.sections.length];
    var off = chordAt(c, index), notes = [], b;
    var isBreak = sec.brk && index % 8 === 7;
    if (!isBreak) for (b = 0; b < 4; b++) notes.push({ inst: 'kick', beat: b, dur: 0.5 });
    notes.push({ inst: 'clap', beat: 1, dur: 0.25 }, { inst: 'clap', beat: 3, dur: 0.25 });
    for (b = 0; b < 4; b++) notes.push({ inst: 'hat', beat: b + 0.5, dur: 0.125 });
    var bp = BASS_PATTERNS[sec.bass];
    for (b = 0; b < 8; b++) notes.push({ inst: 'bass', beat: b / 2, midi: c.root + off + bp[b], dur: 0.45 });
    if (mode === 'play' && sec.lead) {
      var tones = chordTones(off), shape = LEAD_SHAPES[sec.shape];
      for (b = 0; b < LEAD_BEATS.length; b++) {
        notes.push({ inst: 'lead', beat: LEAD_BEATS[b], midi: c.root + 24 + off + tones[shape[b]], dur: 0.3 });
      }
    }
    return notes;
  }

  AT.music = { BPM: BPM, compose: compose, bar: bar, chordAt: chordAt, rng: rng };
  if (typeof module === 'object' && module.exports) module.exports = AT.music;
})(typeof window !== 'undefined' ? window : globalThis);
