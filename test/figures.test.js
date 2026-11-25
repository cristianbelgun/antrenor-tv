const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/program.js');
const F = require('../js/figures.js');

const ids = Array.from(new Set(P.WORKOUTS.A.concat(P.WORKOUTS.B)));
const PS = [0, 0.25, 0.5, 0.75, 1];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angle = (a, b, c) => { // angle at b between a-b-c, 180 = straight
  const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
  const cs = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
  return Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI;
};

test('every A/B exercise has a pose with 2+ keys', () => {
  for (const id of ids) assert.ok(F.POSES[id] && F.POSES[id].keys.length >= 2, id);
});

test('joints stay above the ground and inside the viewBox (0,-30)-(200,192)', () => {
  for (const id of ids) for (const p of PS) {
    const sk = F.skeleton(F.pose(id, p));
    for (const [j, pt] of Object.entries(sk)) {
      assert.ok(pt[1] <= 182.5, `${id} p=${p} ${j} y=${pt[1]}`);
      assert.ok(pt[0] >= 4 && pt[0] <= 196 && pt[1] >= -26, `${id} p=${p} ${j} out of box ${pt}`);
    }
  }
});

test('segment lengths are constant', () => {
  for (const id of ids) for (const p of PS) {
    const s = F.skeleton(F.pose(id, p));
    const near = (v, L, what) => assert.ok(Math.abs(v - L) <= 0.5, `${id} p=${p} ${what}=${v.toFixed(2)}`);
    near(dist(s.ankle, s.knee), 44, 'shin'); near(dist(s.knee, s.hip), 44, 'thigh');
    near(dist(s.hip, s.shoulder), 52, 'torso');
    near(dist(s.shoulderA, s.elbow), 26, 'upperArm'); near(dist(s.elbow, s.hand), 24, 'foreArm');
    if (s.knee2) { near(dist(s.ankle2, s.knee2), 44, 'shin2'); near(dist(s.knee2, s.hipB || s.hip), 44, 'thigh2'); }
    if (s.elbow2) { near(dist(s.shoulderB, s.elbow2), 26, 'upperArm2'); near(dist(s.elbow2, s.hand2), 24, 'foreArm2'); }
  }
});

test('pushup keeps a straight body line', () => {
  for (const p of PS) {
    const s = F.skeleton(F.pose('pushup', p));
    assert.ok(Math.abs(180 - angle(s.ankle, s.hip, s.shoulder)) <= 6, `p=${p}`);
  }
});

test('goblet squat knee stays near the toe at the bottom', () => {
  const s = F.skeleton(F.pose('goblet-squat', 1));
  assert.ok(Math.abs(s.knee[0] - s.toe[0]) <= 15, `knee ${s.knee[0]} toe ${s.toe[0]}`);
  assert.ok(Math.abs(s.knee[1] - s.hip[1]) <= 12, 'thigh roughly parallel');
});

test('reverse lunge front knee over the ankle', () => {
  const s = F.skeleton(F.pose('reverse-lunge', 1));
  assert.ok(Math.abs(s.knee[0] - s.ankle[0]) <= 15);
});

test('pose interpolates between keys', () => {
  const a = F.pose('goblet-squat', 0), b = F.pose('goblet-squat', 1), m = F.pose('goblet-squat', 0.5);
  assert.ok(Math.abs(m.hip[1] - (a.hip[1] + b.hip[1]) / 2) < 0.01);
});

test('rdl keeps the knees soft (knee angle > 150°)', () => {
  const s = F.skeleton(F.pose('rdl', 1));
  assert.ok(angle(s.ankle, s.knee, s.hip) > 150);
});

test('lateral raise legs do not cross', () => {
  for (const p of PS) {
    const s = F.skeleton(F.pose('lateral-raise', p));
    assert.ok(s.knee[0] < s.knee2[0], `p=${p}`);
  }
});

test('tempo-driven pose follows AT.tempo.position', () => {
  const T = require('../js/tempo.js');
  const t = T.forExercise('goblet-squat', 1);
  for (const sec of [0, 1.5, 3]) {
    assert.ok(Math.abs(F.paramAt({ tempo: t, startAt: 1000 }, 1000 + sec * 1000) - T.position(t, sec)) < 1e-9, 'sec ' + sec);
  }
  assert.ok(Math.abs(F.paramAt({}, 800) - F.ease(800 / 3200)) < 1e-9);
});
