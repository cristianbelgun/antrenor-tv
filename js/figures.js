(function (root) {
  var AT = root.AT = root.AT || {};
  var SHIN = 44, THIGH = 44, TORSO = 52, UPPER = 26, FORE = 24, NECK = 16, FOOT = 18;
  var GROUND = 182, CYCLE = 3200;
  var INK = '#f1f4ef', ACCENT = '#c6f05a', FLOOR = '#2f3833';

  // Angles in degrees: 0 = up, 90 = right (facing direction), 180 = down, -90 = left.
  function dir(deg) { var r = deg * Math.PI / 180; return [Math.sin(r), -Math.cos(r)]; }
  function add(p, len, deg) { var d = dir(deg); return [p[0] + len * d[0], p[1] + len * d[1]]; }
  function onFloor(p) { return [p[0], Math.min(p[1], GROUND - 2.5)]; }
  function plus(p, q) { return [p[0] + q[0], p[1] + q[1]]; }

  // Two-bone IK from root a to end b. Returns [joint, end] (end pulled in when out of reach).
  function ik(a, b, L1, L2, bend) {
    var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.001;
    var dc = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.01, d));
    var u = [dx / d, dy / d];
    var end = [a[0] + u[0] * dc, a[1] + u[1] * dc];
    var x = (dc * dc + L1 * L1 - L2 * L2) / (2 * dc);
    var h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    var perp = [-u[1], u[0]];
    return [[a[0] + u[0] * x + bend * h * perp[0], a[1] + u[1] * x + bend * h * perp[1]], end];
  }

  // ---- Poses (side view, facing right; lateral raise is a front view) ----
  var STAND = { ankle: [95, 176], hip: [93, 90], torso: 2, kneeBend: 1 };
  function k(o) { var r = {}, key; for (key in STAND) r[key] = STAND[key]; for (key in o) r[key] = o[key]; return r; }

  var POSES = {
    'goblet-squat': { dumbbell: 'chest', keys: [
      k({ hip: [91, 91], torso: 4, handRel: [16, 14], elbowBend: 1 }),
      k({ hip: [70, 140], torso: 35, handRel: [16, 14], elbowBend: 1 })
    ] },
    'pushup': { dumbbell: 'none', keys: [
      { ankle: [28, 163], footAngle: 165, line: 74.7, kneeBend: 1, hand: [163, 176], elbowBend: 1 },
      { ankle: [28, 163], footAngle: 165, line: 88.6, kneeBend: 1, hand: [163, 176], elbowBend: 1 }
    ] },
    'db-row': { dumbbell: 'hand', keys: [
      k({ hip: [72, 100], torso: 52, handRel: [4, 48], elbowBend: 1 }),
      k({ hip: [72, 100], torso: 52, handRel: [-12, 30], elbowBend: 1 })
    ] },
    'overhead-press': { dumbbell: 'hand', keys: [
      k({ handRel: [10, -4], elbowBend: 1 }),
      k({ handRel: [4, -46], elbowBend: 1 })
    ] },
    'biceps-curl': { dumbbell: 'hand', keys: [
      k({ upperArm: 180, foreArm: 170 }),
      k({ upperArm: 180, foreArm: 18 })
    ] },
    'plank': { dumbbell: 'none', keys: [
      { ankle: [28, 163], footAngle: 165, line: 84.7, kneeBend: 1, upperArm: 180, foreArm: 90 },
      { ankle: [28, 163], footAngle: 165, line: 84.3, kneeBend: 1, upperArm: 180, foreArm: 90 }
    ] },
    'rdl': { dumbbell: 'hand', keys: [
      k({ hip: [92, 91], torso: 3, handRel: [2, 48], elbowBend: -1 }),
      k({ hip: [66, 95], torso: 47, handRel: [0, 49], elbowBend: -1 })
    ] },
    'reverse-lunge': { dumbbell: 'hand', keys: [
      { ankle: [118, 176], hip: [112, 90], torso: 1, kneeBend: 1, handRel: [2, 48], elbowBend: -1,
        ankle2: [108, 176], footAngle2: 90, kneeBend2: 1 },
      { ankle: [118, 176], hip: [80, 130], torso: 3, kneeBend: 1, handRel: [2, 48], elbowBend: -1,
        ankle2: [40, 166], footAngle2: 165, kneeBend2: 1 }
    ] },
    'floor-press': { dumbbell: 'hand', lying: true, keys: [
      { ankle: [160, 176], hip: [122, 170], torso: -90, kneeBend: 1, handRel: [4, -48], elbowBend: 1 },
      { ankle: [160, 176], hip: [122, 170], torso: -90, kneeBend: 1, handRel: [6, -18], elbowBend: 1 }
    ] },
    'lateral-raise': { dumbbell: 'hand', front: true, keys: [
      { ankle: [88, 176], hip: [94, 90], torso: 0, kneeBend: -1, footAngle: -90,
        ankle2: [112, 176], footAngle2: 90, kneeBend2: 1, hip2off: 12,
        upperArm: 192, foreArm: 200, upperArm2: 168, foreArm2: 160 },
      { ankle: [88, 176], hip: [94, 90], torso: 0, kneeBend: -1, footAngle: -90,
        ankle2: [112, 176], footAngle2: 90, kneeBend2: 1, hip2off: 12,
        upperArm: 268, foreArm: 280, upperArm2: 92, foreArm2: 80 }
    ] },
    'dead-bug': { dumbbell: 'none', lying: true, keys: [
      { ankle: [142, 126], footAngle: 0, hip: [98, 170], torso: -90, kneeBend: 1, handRel: [0, -48], elbowBend: 1,
        ankle2: [140, 128], footAngle2: 0, kneeBend2: 1, handRel2: [4, -48], elbowBend2: 1 },
      { ankle: [182, 160], footAngle: 45, hip: [98, 170], torso: -90, kneeBend: 1, handRel: [-40, -16], elbowBend: 1,
        ankle2: [140, 128], footAngle2: 0, kneeBend2: 1, handRel2: [4, -48], elbowBend2: 1 }
    ] }
  };

  function lerp(a, b, t) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    if (Array.isArray(a) && Array.isArray(b)) return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    return a;
  }

  function pose(exerciseId, p) {
    var keys = POSES[exerciseId].keys, out = {}, key;
    var a = keys[0], b = keys[1];
    for (key in a) out[key] = /Bend2?$/.test(key) ? a[key] : lerp(a[key], b[key], p);
    return out;
  }

  function skeleton(ps) {
    var s = {};
    s.ankle = ps.ankle;
    var hip = ps.line !== undefined ? add(ps.ankle, SHIN + THIGH - 0.02, ps.line) : ps.hip;
    var torsoAngle = ps.line !== undefined ? ps.line : ps.torso;
    var leg = ik(ps.ankle, hip, SHIN, THIGH, ps.kneeBend || 1);
    s.knee = leg[0]; s.hip = leg[1];
    s.toe = onFloor(add(s.ankle, FOOT, ps.footAngle === undefined ? 90 : ps.footAngle));
    s.shoulder = add(s.hip, TORSO, torsoAngle);
    s.head = add(s.shoulder, NECK, torsoAngle + (ps.neck || 0));
    var half = ps.hip2off ? ps.hip2off / 2 : 0;
    s.shoulderA = ps.hip2off ? plus(s.shoulder, [-14, 4]) : s.shoulder;
    s.shoulderB = ps.hip2off ? plus(s.shoulder, [14, 4]) : s.shoulder;

    function arm(origin, handRel, hand, upper, fore, bend) {
      if (upper !== undefined) {
        var e = add(origin, UPPER, upper);
        return [e, add(e, FORE, fore)];
      }
      var target = hand || plus(s.shoulder, handRel);
      return ik(origin, target, UPPER, FORE, bend || 1);
    }
    var a1 = arm(s.shoulderA, ps.handRel, ps.hand, ps.upperArm, ps.foreArm, ps.elbowBend);
    s.elbow = a1[0]; s.hand = a1[1];
    if (ps.handRel2 || ps.upperArm2 !== undefined) {
      var a2 = arm(s.shoulderB, ps.handRel2, null, ps.upperArm2, ps.foreArm2, ps.elbowBend2);
      s.elbow2 = a2[0]; s.hand2 = a2[1];
    }
    if (ps.ankle2) {
      s.ankle2 = ps.ankle2;
      var hip2 = half ? plus(s.hip, [half * 2, 0]) : s.hip;
      var l2 = ik(ps.ankle2, hip2, SHIN, THIGH, ps.kneeBend2 || 1);
      s.knee2 = l2[0];
      if (half) s.hipB = l2[1];
      s.toe2 = onFloor(add(s.ankle2, FOOT, ps.footAngle2 === undefined ? 90 : ps.footAngle2));
    }
    if (half) {
      // Front view: the first leg hangs from the left hip point.
      s.hipA = s.hip;
    }
    return s;
  }

  // ---- SVG rendering ----
  var NS = 'http://www.w3.org/2000/svg';
  function el(svg, name, attrs) {
    var e = svg.ownerDocument.createElementNS(NS, name);
    for (var a in attrs) e.setAttribute(a, attrs[a]);
    svg.appendChild(e);
    return e;
  }
  function line(e, a, b) {
    e.setAttribute('x1', a[0].toFixed(1)); e.setAttribute('y1', a[1].toFixed(1));
    e.setAttribute('x2', b[0].toFixed(1)); e.setAttribute('y2', b[1].toFixed(1));
  }

  function build(svg, exerciseId) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 -30 200 222');
    var def = POSES[exerciseId];
    el(svg, 'line', { x1: 10, y1: GROUND, x2: 190, y2: GROUND, stroke: FLOOR, 'stroke-width': 2 });
    var back = { stroke: INK, 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none', opacity: 0.45 };
    var front = { stroke: INK, 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none' };
    var parts = {};
    var sk = skeleton(pose(exerciseId, 0));
    if (sk.ankle2) { parts.foot2 = el(svg, 'line', back); parts.shin2 = el(svg, 'line', back); parts.thigh2 = el(svg, 'line', back); }
    if (sk.elbow2) { parts.upper2 = el(svg, 'line', back); parts.fore2 = el(svg, 'line', back); }
    if (def.front) {
      for (var key in back) if (key !== 'opacity') front[key] = back[key];
      parts.foot2.setAttribute('opacity', 1); parts.shin2.setAttribute('opacity', 1); parts.thigh2.setAttribute('opacity', 1);
      parts.upper2.setAttribute('opacity', 1); parts.fore2.setAttribute('opacity', 1);
      parts.girdle = el(svg, 'line', front);
      parts.pelvis = el(svg, 'line', front);
    }
    parts.foot = el(svg, 'line', front); parts.shin = el(svg, 'line', front); parts.thigh = el(svg, 'line', front);
    parts.torso = el(svg, 'line', front);
    parts.head = el(svg, 'circle', { r: 10, fill: INK });
    if (def.dumbbell !== 'none') {
      parts.db = el(svg, 'rect', { width: 10, height: 22, rx: 3, fill: ACCENT });
      if (sk.hand2 && def.dumbbell === 'hand') parts.db2 = el(svg, 'rect', { width: 10, height: 22, rx: 3, fill: ACCENT, opacity: def.front ? 1 : 0.6 });
    }
    parts.upper = el(svg, 'line', front); parts.fore = el(svg, 'line', front);
    if (parts.db && def.dumbbell !== 'chest') svg.appendChild(parts.db);
    return parts;
  }

  function placeDb(rect, at, vertical) {
    if (!rect) return;
    var w = vertical ? 10 : 22, h = vertical ? 22 : 10;
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('x', (at[0] - w / 2).toFixed(1)); rect.setAttribute('y', (at[1] - h / 2).toFixed(1));
  }

  function paint(parts, exerciseId, p) {
    var def = POSES[exerciseId], s = skeleton(pose(exerciseId, p));
    line(parts.foot, s.ankle, s.toe); line(parts.shin, s.ankle, s.knee); line(parts.thigh, s.knee, s.hip);
    line(parts.torso, s.hip, s.shoulder);
    parts.head.setAttribute('cx', s.head[0].toFixed(1)); parts.head.setAttribute('cy', s.head[1].toFixed(1));
    line(parts.upper, s.shoulderA, s.elbow); line(parts.fore, s.elbow, s.hand);
    if (parts.shin2) { line(parts.foot2, s.ankle2, s.toe2); line(parts.shin2, s.ankle2, s.knee2); line(parts.thigh2, s.knee2, s.hipB || s.hip); }
    if (parts.upper2) { line(parts.upper2, s.shoulderB, s.elbow2); line(parts.fore2, s.elbow2, s.hand2); }
    if (parts.girdle) { line(parts.girdle, s.shoulderA, s.shoulderB); line(parts.pelvis, s.hip, s.hipB || s.hip); }
    var vertical = def.dumbbell === 'chest' || def.dumbbell === 'hand' && !def.lying && !def.front && exerciseId !== 'overhead-press';
    placeDb(parts.db, s.hand, def.dumbbell === 'chest' ? true : vertical && exerciseId !== 'biceps-curl' ? false : !def.lying);
    if (parts.db2) placeDb(parts.db2, s.hand2, !def.front);
  }

  function ease(t) { return (1 - Math.cos(t * 2 * Math.PI)) / 2; }

  function reducedMotion() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  function draw(svg, exerciseId, p) {
    paint(build(svg, exerciseId), exerciseId, p);
  }

  // Pose parameter (0..1) at time nowMs. With a tempo it follows the rep cycle that the ticks play;
  // otherwise the default 3.2 s loop.
  function paramAt(opts, nowMs) {
    if (opts && opts.tempo) {
      var sec = (nowMs - (opts.startAt || 0)) / 1000;
      return sec < 0 ? 0 : AT.tempo.position(opts.tempo, sec);
    }
    var t = nowMs - ((opts && opts.startAt) || 0);
    return ease(((t % CYCLE) + CYCLE) % CYCLE / CYCLE);
  }

  function mount(svg, exerciseId, opts) {
    opts = opts || {};
    var parts = build(svg, exerciseId), running = true;
    var o = { tempo: opts.tempo || null, startAt: opts.startAt };
    if (reducedMotion()) { paint(parts, exerciseId, 0.5); return { stop: function () {} }; }
    function frame(ts) {
      if (!running) return;
      if (o.startAt === undefined || o.startAt === null) o.startAt = ts;
      paint(parts, exerciseId, paramAt(o, ts));
      root.requestAnimationFrame(frame);
    }
    paint(parts, exerciseId, 0);
    root.requestAnimationFrame(frame);
    return { stop: function () { running = false; } };
  }

  AT.figures = { POSES: POSES, pose: pose, skeleton: skeleton, draw: draw, mount: mount, ease: ease, paramAt: paramAt };
  if (typeof module === 'object' && module.exports) module.exports = AT.figures;
})(typeof window !== 'undefined' ? window : globalThis);
