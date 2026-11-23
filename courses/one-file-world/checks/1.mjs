// Lesson 1 checks: aim and boxHidden in project/world.html, and mapCamera in project/map.js.
// The contract and the new application are required. The comparison with stage 1 is a note, never a failure.
import * as g from './geometry.mjs';

export const title = 'Camera over a plane';
const HALF_PI = Math.PI / 2;
const TURN = 2 * Math.PI;

// ------------------------------------------------------------------ aim

// Eye and target pairs: a fixed set along the axes, then random ones over the whole plane.
export function aimPairs() {
  const e = [10, 40, -30];
  const fixed = [[0, 0, 100], [100, 0, 0], [-100, 0, 0], [0, 0, -100], [70, 20, 70], [-30, -35, 80], [5, 60, -200]];
  const pairs = fixed.map(([dx, dy, dz]) => [e, [e[0] + dx, e[1] + dy, e[2] + dz]]);
  const r = g.stream(11);
  for (let k = 0; k < 300; k++) {
    const eye = [(r() - 0.5) * 4000, 2 + r() * 900, (r() - 0.5) * 4000];
    pairs.push([eye, [(r() - 0.5) * 4000, -50 + r() * 950, (r() - 0.5) * 4000]]);
  }
  return pairs;
}

const pairText = ([eye, target]) => `aim(${g.fmt(eye)}, ${g.fmt(target)})`;
const twoNumbers = (r) => (Array.isArray(r) || ArrayBuffer.isView(r)) && r.length >= 2 && typeof r[0] === 'number' && typeof r[1] === 'number';

// Where the target lands in view space when the camera at eye turns by yaw and pitch: [x, y, z]. On the centre
// line x and y are 0, and z is negative in front of the camera.
function landing(course, eye, target, yaw, pitch) {
  const view = course.call('viewMatrix', new Float64Array(16), eye, yaw, pitch, [0, 0, 0], [0, 0, 0], [0, 0, 0]);
  return g.apply(view, target).slice(0, 3);
}
function onCentreLine(course, eye, target, yaw, pitch) {
  const v = landing(course, eye, target, yaw, pitch);
  const d = Math.hypot(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]);
  return Math.abs(v[0]) <= 1e-6 * d + 1e-9 && Math.abs(v[1]) <= 1e-6 * d + 1e-9 && v[2] < 0;
}

// Why a yaw and pitch miss the target, judged by which simple change of them would have hit it.
function aimFault(course, pair, [yaw, pitch]) {
  const [eye, target] = pair;
  const v = landing(course, eye, target, yaw, pitch);
  const at = `${pairText(pair)} gave yaw ${g.fmt(yaw)}, pitch ${g.fmt(pitch)}, which puts the target at view x ${g.fmt(v[0])}, y ${g.fmt(v[1])}, z ${g.fmt(v[2])}; on the centre line x and y are 0 and z is below 0`;
  if (onCentreLine(course, eye, target, -yaw, pitch))
    return `${at}. The camera turns the mirror way (wrong handedness): yaw is measured from the +z axis toward +x, so a target along +x needs yaw +π/2. Check the order of Math.atan2's arguments and their signs.`;
  if (onCentreLine(course, eye, target, HALF_PI - yaw, pitch))
    return `${at}. Yaw is measured from the wrong axis (wrong handedness): it starts at +z, so a target straight along +z needs yaw 0. Math.atan2(dx, dz) takes the x difference first.`;
  if (onCentreLine(course, eye, target, yaw, -pitch)) return `${at}. Pitch tilts the wrong way: a target above the eye needs a positive pitch.`;
  if (onCentreLine(course, eye, target, yaw + Math.PI, pitch)) return `${at}. The camera looks directly away from the target: yaw is half a turn out.`;
  return `${at}.`;
}

function aimPoints({ mine, course }) {
  for (const pair of aimPairs()) {
    const r = mine.call('aim', ...pair.map((p) => [...p]));
    if (!twoNumbers(r)) return { message: `${pairText(pair)} returned ${g.fmt(r)}: aim must return [yaw, pitch], two numbers in radians.` };
    const [yaw, pitch] = r;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return { message: `${pairText(pair)} returned [${yaw}, ${pitch}]: both must be finite numbers.` };
    if (pitch < -HALF_PI - 1e-12 || pitch > HALF_PI + 1e-12)
      return { message: `${pairText(pair)} gave pitch ${g.fmt(pitch)}: keep pitch between -π/2 and π/2 and turn with yaw, or the camera is upside down.` };
    if (!onCentreLine(course, ...pair, yaw, pitch)) return { message: aimFault(course, pair, r) };
  }
  return null;
}

function aimSamePoint({ mine, course }) {
  const eye = [120, 35, -60];
  const cases = [
    [eye, [...eye], 'the target equals the eye'],
    [eye, [120, 90, -60], 'the target is straight above the eye'],
    [eye, [120, 0, -60], 'the target is straight below the eye'],
  ];
  for (const [e, target, what] of cases) {
    const r = mine.call('aim', [...e], target);
    const ok = twoNumbers(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]);
    if (!ok) return { message: `${pairText([e, target])} returned ${g.fmt(r)} when ${what}. A NaN or Infinity in yaw or pitch fills the view matrix with NaN and the picture goes blank. Return finite numbers: when the target equals the eye there is no direction, so any finite yaw and pitch will do.` };
    if (what !== 'the target equals the eye' && !onCentreLine(course, e, target, r[0], r[1])) return { message: aimFault(course, [e, target], r) };
  }
  return null;
}

function aimSteady({ mine }) {
  const eye = [3, 50, -400];
  const target = [-80, 0, 20];
  const first = mine.call('aim', eye, target);
  const second = mine.call('aim', [3, 50, -400], [-80, 0, 20]);
  if (g.fmt(eye) !== '[3, 50, -400]' || g.fmt(target) !== '[-80, 0, 20]') return { message: `aim changed its arguments: eye is now ${g.fmt(eye)} and target ${g.fmt(target)}. Read them; do not write to them.` };
  if (!twoNumbers(first) || first[0] !== second[0] || first[1] !== second[1]) return { message: `aim gave ${g.fmt(first)}, then ${g.fmt(second)} for the same eye and target.` };
  return null;
}

// ------------------------------------------------------------------ boxHidden

// Cameras the box checks look from: the start pose on a phone, then turned, raised, tilted and shortened views.
export const BOX_CAMERAS = [
  { ...g.START, aspect: g.PHONE, name: 'the start pose on a phone' },
  { eye: [100, 20, 50], yaw: HALF_PI, pitch: 0, aspect: g.DESKTOP, name: 'facing +x on a desktop' },
  { eye: [-300, 200, 300], yaw: -2.4, pitch: -0.6, aspect: g.DESKTOP, name: 'high, looking down to the south-west' },
  { eye: [0, 5, 0], yaw: 0.5, pitch: 0.9, aspect: g.PHONE, name: 'looking up' },
  { eye: [40, 300, -40], yaw: 0.2, pitch: -1.4, aspect: 1, name: 'nearly straight down' },
  { eye: [0, 30, -100], yaw: -0.7, pitch: -0.2, aspect: g.DESKTOP, far: 300, name: 'with the far plane 300 m away' },
];

export function boxesFor(cam, seed) {
  const r = g.stream(seed);
  const out = [];
  for (let k = 0; k < 1500; k++) {
    const c = [cam.eye[0] + (r() - 0.5) * 2400, -80 + r() * 480, cam.eye[2] + (r() - 0.5) * 2400];
    const h = [0, 1, 2].map(() => 10 ** (r() * 3.2 - 0.5) / 2);
    if (k % 5 === 0) { c[1] = 1; h[1] = 0; } // a flat square of ground
    out.push([c[0] - h[0], c[1] - h[1], c[2] - h[2], c[0] + h[0], c[1] + h[1], c[2] + h[2]]);
  }
  return out;
}

// Every camera with its planes and boxes, built once per run.
function scenes(course) {
  return BOX_CAMERAS.map((cam, i) => ({ cam, ...g.camera(course, cam), boxes: boxesFor(cam, 100 + i), rand: g.stream(500 + i) }));
}

const hidden = (mine, planes, b) => mine.call('boxHidden', planes, ...b);

// Why a box with a point in view was hidden, from where the box lies.
function hideFault(planes, b, p) {
  const inAll = g.corners(b).every((q) => g.inside(planes, q));
  const out = g.PLANE_NAMES.filter((_, i) => g.planeValue(planes, i, g.centre(b)) < 0);
  const crossed = g.straddles(planes, b);
  const seen = `its point ${g.fmt(p)} is inside all six planes`;
  if (inAll) return { kind: 'flipped', text: `the box lies wholly inside the view: every corner is on the inner side of all six planes. A plane test has its sign flipped: a point is inside a plane when a·x + b·y + c·z + d is 0 or more, and a box is hidden only when that is below 0 for its best corner` };
  if (out.length) return { kind: 'centre', text: `its centre is outside the ${out[0]} plane, but ${seen}. Testing only the centre loses boxes that cross an edge of the view: for each plane, test the corner furthest along the plane's normal (x1 where the plane's x factor is positive, x0 where it is negative; the same for y and z)` };
  return { kind: 'corner', text: `it crosses the ${crossed.join(' and ')} plane${crossed.length > 1 ? 's' : ''} with its centre in view, and ${seen}. For each plane, test the corner furthest along its normal: x1 where the plane's x factor is positive, x0 where it is negative, and the same for y and z. A test of the nearest corner hides boxes that cross a plane` };
}

function boxKeepsVisible({ mine, course }) {
  const faults = [];
  let visible = 0;
  for (const s of scenes(course)) {
    for (const b of s.boxes) {
      const p = g.seenPoint(s.planes, b, s.rand);
      if (!p) continue;
      visible++;
      if (hidden(mine, s.planes, b)) faults.push({ s, b, p, ...hideFault(s.planes, b, p) });
    }
  }
  if (!faults.length) return null;
  // A box hidden with its centre in view rules out a centre-only test, so 'corner' outranks 'centre'.
  const order = ['flipped', 'corner', 'centre'];
  const f = faults.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind))[0];
  return { message: `boxHidden hid ${faults.length} of ${visible} boxes that are partly in view. First, from the camera ${f.s.cam.name}: the box ${g.boxText(f.b)}; ${f.text}.` };
}

function boxHidesOutside({ mine, course }) {
  let outside = 0;
  const kept = [];
  for (const s of scenes(course)) {
    for (const b of s.boxes) {
      const planes = g.outsideOf(s.planes, b);
      if (!planes.length) continue;
      outside++;
      if (!hidden(mine, s.planes, b)) kept.push({ s, b, planes });
    }
  }
  if (!kept.length) return null;
  const f = kept[0];
  return { message: `boxHidden kept ${kept.length} of ${outside} boxes that lie wholly outside one plane. First, from the camera ${f.s.cam.name}: the box ${g.boxText(f.b)} is outside the ${f.planes[0]} plane (all eight corners give a value below 0 there), so nothing in it can be seen; boxHidden must return true for it.` };
}

function boxSteady({ mine, course }) {
  const { planes } = g.camera(course, BOX_CAMERAS[0]);
  const copy = Float32Array.from(planes);
  const b = [-10, 1, -10, 10, 1, 10];
  const first = hidden(mine, planes, b);
  const second = hidden(mine, planes, b);
  if (!planes.every((v, i) => v === copy[i])) return { message: 'boxHidden changed the planes it was given. Read them; do not write to them.' };
  if (typeof first !== 'boolean') return { message: `boxHidden(planes, ${b.join(', ')}) returned ${g.fmt(first)}: return true or false.` };
  if (first !== second) return { message: `boxHidden gave ${first}, then ${second}, for the same box.` };
  return null;
}

// ------------------------------------------------------------------ the map camera (new application)

export const MAP_HEIGHTS = [-100, 900]; // metres: below sea level, and up to the camera's ceiling (flyStep keeps the eye at or under 900 m)
export const MAPS = [
  { cx: 0, cz: 0, half: 1024, aspect: g.PHONE },
  { cx: 300, cz: -200, half: 250, aspect: g.DESKTOP },
  { cx: -500, cz: 700, half: 100, aspect: 1 },
];
const mapText = (q) => `mapCamera(m, ${q.cx}, ${q.cz}, ${q.half}, ${g.fmt(q.aspect)})`;
const ndc = (m, p) => { const c = g.apply(m, p); return [c[0] / c[3], c[1] / c[3], c[2] / c[3]]; };
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;

function mapMatrix(map, q) {
  const m = new Float32Array(16);
  map.call('mapCamera', m, q.cx, q.cz, q.half, q.aspect);
  return m;
}

function mapFrame({ map }) {
  for (const q of MAPS) {
    const m = mapMatrix(map, q);
    if (!m.every(Number.isFinite)) return { message: `${mapText(q)} left ${g.fmt(m)} in m: all 16 numbers must be finite.` };
    const c = ndc(m, [q.cx, 1, q.cz]);
    if (!near(c[0], 0) || !near(c[1], 0)) return { message: `${mapText(q)}: the ground at the map's centre lands at screen (${g.fmt(c[0])}, ${g.fmt(c[1])}), not (0, 0).` };
    const north = ndc(m, [q.cx, 1, q.cz + q.half / 2]);
    const west = ndc(m, [q.cx - q.half / 2, 1, q.cz]);
    if (!(north[1] > 0) || !near(north[0], 0)) return { message: `${mapText(q)}: a point north of the centre (toward +z) lands at screen (${g.fmt(north[0])}, ${g.fmt(north[1])}). +z must point straight up the screen.` };
    if (!(west[0] > 0)) return { message: `${mapText(q)}: a point toward -x lands at screen x ${g.fmt(west[0])}. The map is mirrored: -x must be to the right, as it is when you face +z in the start view.` };
    const edge = q.aspect <= 1 ? ndc(m, [q.cx - q.half, 1, q.cz])[0] : ndc(m, [q.cx, 1, q.cz + q.half])[1];
    if (!near(edge, 1)) return { message: `${mapText(q)}: the point ${q.half} m from the centre across the narrower side of the screen lands at ${g.fmt(edge)}, not at the edge (1). half is the distance from the centre to the nearer edge of the screen.` };
  }
  return null;
}

function mapFlat({ map }) {
  for (const q of MAPS) {
    const m = mapMatrix(map, q);
    for (const [x, z] of [[q.cx + q.half * 0.4, q.cz - q.half * 0.3], [q.cx - q.half * 0.7, q.cz + q.half * 0.6]]) {
      const low = ndc(m, [x, 0, z]);
      const high = ndc(m, [x, 300, z]);
      if (!near(low[0], high[0]) || !near(low[1], high[1]))
        return { message: `${mapText(q)}: the ground at (${g.fmt(x)}, ${g.fmt(z)}) lands at screen (${g.fmt(low[0])}, ${g.fmt(low[1])}), and the point 300 m above it at (${g.fmt(high[0])}, ${g.fmt(high[1])}). A map has no perspective: a point's height must not move it on the screen, so the fourth row of the projection is 0 0 0 1 and w stays 1.` };
      for (const y of MAP_HEIGHTS) {
        const depth = ndc(m, [x, y, z])[2];
        if (!(depth >= -1 && depth <= 1)) return { message: `${mapText(q)}: a point at height ${y} m has clip z/w ${depth}, outside -1..1, so the near or far plane cuts it away. Everything from ${MAP_HEIGHTS[0]} m to ${MAP_HEIGHTS[1]} m must lie between them.` };
      }
      if (!(high[2] < low[2])) return { message: `${mapText(q)}: the point 300 m up has depth (clip z/w) ${g.fmt(high[2])} and the ground below it ${g.fmt(low[2])}. The camera looks down, so a higher point is nearer and needs the smaller depth, or the ground is drawn over the things that stand on it.` };
    }
  }
  return null;
}

// Ground squares of 20 m around the map's centre, as boxes.
export function mapSquares(q) {
  const out = [];
  for (let x = q.cx - 1.5 * q.half; x < q.cx + 1.5 * q.half; x += q.half / 10) for (let z = q.cz - 1.5 * q.half; z < q.cz + 1.5 * q.half; z += q.half / 10) out.push([x, 1, z, x + q.half / 10, 1, z + q.half / 10]);
  return out;
}

function mapSquaresKept({ map, mine, course }) {
  for (const q of MAPS) {
    const m = mapMatrix(map, q);
    const planes = course.call('frustumPlanes', new Float32Array(24), m);
    for (const b of mapSquares(q)) {
      const inView = g.corners(b).every((p) => ndc(m, p).every((v) => Math.abs(v) < 0.999));
      const outView = g.outsideOf(planes, b).length > 0;
      const yours = !!mine.call('boxHidden', planes, ...b);
      if (inView && yours) {
        const courseToo = !!course.call('boxHidden', planes, ...b);
        return { message: `${mapText(q)}: boxHidden hides the ground square ${g.boxText(b)}, which is wholly on the map.${courseToo ? ' Stage 1\'s boxHidden hides it too, so look at the planes your matrix makes: is the ground between the near and far planes?' : ' Stage 1\'s boxHidden keeps it, so the fault is in your boxHidden: fix the box checks first.'}` };
      }
      if (outView && !yours) return { message: `${mapText(q)}: boxHidden keeps the ground square ${g.boxText(b)}, which lies wholly off the map. Fix the box checks first.` };
    }
  }
  return null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '1.aim-points', part: 'contract', uses: ['aim'], title: 'aim turns the camera so the target is on the centre line, in front', run: aimPoints },
  { id: '1.aim-same-point', part: 'contract', uses: ['aim'], title: 'aim stays finite when the target is the eye, or straight above or below it', run: aimSamePoint },
  { id: '1.aim-steady', part: 'contract', uses: ['aim'], title: 'aim gives the same answer twice and leaves its arguments alone', run: aimSteady },
  { id: '1.box-keeps-visible', part: 'contract', uses: ['boxHidden'], title: 'boxHidden never hides a box with a point in view', run: boxKeepsVisible },
  { id: '1.box-hides-outside', part: 'contract', uses: ['boxHidden'], title: 'boxHidden hides every box wholly outside one plane', run: boxHidesOutside },
  { id: '1.box-steady', part: 'contract', uses: ['boxHidden'], title: 'boxHidden returns true or false, the same twice, and leaves the planes alone', run: boxSteady },
  { id: '1.map-frame', part: 'application', uses: ['mapCamera'], title: 'the map is centred, +z points up, -x right, and half reaches the narrower edge', run: mapFrame },
  { id: '1.map-flat', part: 'application', uses: ['mapCamera'], title: 'the map has no perspective and keeps -100 m to 900 m between its near and far planes', run: mapFlat },
  { id: '1.map-squares', part: 'application', uses: ['mapCamera', 'boxHidden'], title: 'boxHidden keeps the ground squares on the map and hides the ones off it', run: mapSquaresKept },
];

// ------------------------------------------------------------------ the note: does it match stage 1?

const sameAngle = (a, b) => { const d = (((a - b) % TURN) + TURN) % TURN; return d < 1e-9 || TURN - d < 1e-9; };

export function note({ mine, course }) {
  const lines = [];
  try {
    const pairs = aimPairs();
    const differ = pairs.filter((p) => { const a = mine.call('aim', ...p); const b = course.call('aim', ...p); return !(sameAngle(a[0], b[0]) && Math.abs(a[1] - b[1]) < 1e-9); });
    lines.push(differ.length ? `aim differs from stage 1's on ${differ.length} of ${pairs.length} inputs, first ${pairText(differ[0])}` : `aim matches stage 1's on all ${pairs.length} inputs`);
  } catch { lines.push('aim could not be compared with stage 1 (it throws)'); }
  try {
    let n = 0, differ = 0;
    for (const s of scenes(course)) for (const b of s.boxes) { n++; if (!!hidden(mine, s.planes, b) !== course.call('boxHidden', s.planes, ...b)) differ++; }
    lines.push(differ ? `boxHidden differs from stage 1's on ${differ} of ${n} boxes (a different correct test may keep a few boxes near a corner of the view that stage 1 hides)` : `boxHidden matches stage 1's on all ${n} boxes`);
  } catch { lines.push('boxHidden could not be compared with stage 1 (it throws)'); }
  const changed = ['perspective', 'viewMatrix', 'mul4', 'frustumPlanes', 'flyStep'].filter((name) => {
    try { return mine.text(name) !== course.text(name); } catch { return true; }
  });
  lines.push(changed.length ? `${changed.join(', ')} ${changed.length > 1 ? 'differ' : 'differs'} from stage 1: the lesson does not ask you to change ${changed.length > 1 ? 'them' : 'it'}` : 'the rest of the camera region matches stage 1');
  return lines;
}
