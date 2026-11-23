// Lesson 7 checks: steerBird in project/world-07.html, and schoolStep in project/fish.js.
// The contract and the new application are required. The comparison with stage 7 is a note, never a failure.
import { landPath, ruleFault } from './rule.mjs';
import { layout } from './grow.mjs';
import { stream } from './geometry.mjs';

export const title = 'Things that move';
const N = 512;
const show = (v) => String(+v.toPrecision(4));
const nums = (a) => `[${Array.from(a, (v) => show(v)).join(', ')}]`;

// A flat land well below the bird, a bird record and what it sees, for one call of steerBird.
const FLAT = new Float32Array(N * N).fill(-40);
const bird = (o = {}) => { const B = new Float32Array(16); B.set(o.at ?? [0, 60, 0], 0); B.set(o.vel ?? [10, 0, 0], 3); return B; };
const alone = () => ({ count: 0, centre: [0, 0, 0], heading: [0, 0, 0], push: [0, 0, 0] });
const ask = (mine, B, near, goal, H = FLAT) => mine.call('steerBird', B, 0, near, goal, H);

function shape({ mine }) {
  const r = stream(3);
  for (let k = 0; k < 300; k++) {
    const B = bird({ at: [r() * 300 - 150, 5 + r() * 100, r() * 300 - 150], vel: [r() * 20 - 10, r() * 4 - 2, r() * 20 - 10] });
    const near = { count: k % 5, centre: [r() * 9, r() * 9, r() * 9], heading: [r() * 9, r() * 9, r() * 9], push: [r(), r(), r()] };
    const before = B.slice(), keep = JSON.stringify(near);
    const acc = ask(mine, B, near, [r() * 200, 50, r() * 200]);
    if (!acc || acc.length !== 3 || !Array.from(acc).every((v) => typeof v === 'number' && Number.isFinite(v))) return { message: `steerBird returned ${acc ? nums(acc) : acc}: it must return three finite numbers, the acceleration along x, y and z.` };
    if (B.some((v, i) => v !== before[i]) || JSON.stringify(near) !== keep) return { message: 'steerBird changed the bird or what it sees: read them, and let stepFlock move the bird.' };
  }
  return null;
}
function goal({ mine }) {
  const g = [100, 80, -40];
  const acc = ask(mine, bird({ at: [0, 30, 0], vel: [0, 0, 0] }), alone(), g);
  const want = [1, 1, -1];
  for (let c = 0; c < 3; c++) if (Math.sign(acc[c]) !== want[c]) return { message: `a bird alone at [0, 30, 0] with its goal at [100, 80, -40] accelerates ${nums(acc)}: along every axis it should turn toward the goal, so ${['x', 'y', 'z'][c]} must be ${want[c] > 0 ? 'above' : 'below'} 0.` };
  const a = ask(mine, bird({ at: [0, 60, 0], vel: [0, 0, 0] }), alone(), [0, 110, 0])[1], b = ask(mine, bird({ at: [0, 60, 0], vel: [0, 0, 0] }), alone(), [50, 60, 0])[0];
  if (!(a / 50 > b / 50 * 1.2)) return { message: `the goal pulls ${show(a / 50)} per metre in height and ${show(b / 50)} across: it must pull more firmly in height, or the flock sinks below the goal.` };
  return null;
}
// Each rule on its own: what changes when one part of what the bird sees changes.
function cohesion({ mine }) {
  const B = bird({ vel: [0, 0, 0] });
  const g = [0, 60, 0];
  const none = ask(mine, B, alone(), g);
  const one = ask(mine, B, { count: 1, centre: [20, 0, 0], heading: [0, 0, 0], push: [0, 0, 0] }, g);
  if (!(one[0] - none[0] > 0.01)) return { message: `with one neighbour 20 m away along x, the bird accelerates ${show(one[0] - none[0])} more along x: it should be drawn toward the middle of its neighbours.` };
  const five = ask(mine, B, { count: 5, centre: [100, 0, 0], heading: [0, 0, 0], push: [0, 0, 0] }, g);
  if (Math.abs(five[0] - one[0]) > 1e-6) return { message: `with five neighbours all 20 m away the bird is drawn ${show(five[0] - none[0])} instead of ${show(one[0] - none[0])}. near.centre is the sum over all neighbours: divide it by near.count, so that one or five neighbours pull the same.` };
  return null;
}
function alignment({ mine }) {
  const v = [6, 0, 3];
  const same = { count: 3, centre: [0, 0, 0], heading: [18, 0, 9], push: [0, 0, 0] };
  const base = ask(mine, bird({ vel: v }), alone(), [0, 60, 0]), acc = ask(mine, bird({ vel: v }), same, [0, 60, 0]);
  for (let c = 0; c < 3; c++) if (Math.abs(acc[c] - base[c]) > 1e-6) return { message: `flying exactly as its three neighbours do, the bird still accelerates ${nums(acc.map((x, i) => x - base[i]))} more: alignment is the difference between their average velocity and its own, which is 0 here. near.heading is a sum, so divide by near.count, then take off the bird's own velocity.` };
  const faster = ask(mine, bird({ vel: [6, 0, 3] }), { ...same, heading: [36, 0, 9] }, [0, 60, 0]);
  if (!(faster[0] - acc[0] > 0.05)) return { message: `with neighbours flying faster along x, the bird accelerates ${show(faster[0] - acc[0])} more: it should match its neighbours' velocity.` };
  return null;
}
function separation({ mine }) {
  const B = bird({ vel: [0, 0, 0] });
  const g = [0, 60, 0];
  const push = ask(mine, B, { count: 1, centre: [0, 0, 0], heading: [0, 0, 0], push: [0.4, 0, 0] }, g);
  const none = ask(mine, B, { count: 1, centre: [0, 0, 0], heading: [0, 0, 0], push: [0, 0, 0] }, g);
  if (!(push[0] - none[0] > 0.5)) return { message: `with a neighbour close on its left pushing it 0.4 to the right, the bird accelerates ${show(push[0] - none[0])} along x: separation must turn the bird the way near.push points, and strongly enough to keep it clear.` };
  const twice = ask(mine, B, { count: 1, centre: [0, 0, 0], heading: [0, 0, 0], push: [0.8, 0, 0] }, g);
  if (Math.abs((twice[0] - none[0]) - 2 * (push[0] - none[0])) > 1e-6) return { message: 'twice the push must turn the bird twice as hard: near.push is already the sum of what each close neighbour does.' };
  return null;
}
function ground({ mine }) {
  const low = new Float32Array(N * N).fill(60);
  const under = ask(mine, bird({ at: [0, 65, 0], vel: [10, 0, 0] }), alone(), [0, 65, 0], low);
  const clear = ask(mine, bird({ at: [0, 120, 0], vel: [10, 0, 0] }), alone(), [0, 120, 0], low);
  const flat = ask(mine, bird({ at: [0, 120, 0], vel: [10, 0, 0] }), alone(), [0, 120, 0]);
  if (!(under[1] > 1)) return { message: `a bird at 65 m over ground at 60 m accelerates ${show(under[1])} along y: it must climb clear, by 14 m, of the ground three seconds ahead.` };
  if (Math.abs(clear[1] - flat[1]) > 1e-9) return { message: `a bird 60 m above the ground still accelerates ${show(clear[1])} along y: the ground rule is for birds lower than 14 m above what is ahead, and nothing else.` };
  // It looks where the bird is heading, not where it is: a wall ahead matters, a wall behind does not.
  const wall = new Float32Array(N * N).fill(-40);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if ((x - 256) * 4 > 25 && (x - 256) * 4 < 45) wall[z * N + x] = 100;
  const toward = ask(mine, bird({ at: [0, 60, 0], vel: [10, 0, 0] }), alone(), [0, 60, 0], wall), away = ask(mine, bird({ at: [0, 60, 0], vel: [-10, 0, 0] }), alone(), [0, 60, 0], wall);
  if (!(toward[1] > 1)) return { message: 'a bird flying toward a ridge 35 m ahead must climb before it gets there: look three seconds ahead, at where its velocity carries it.' };
  if (Math.abs(away[1]) > 0.5) return { message: 'a bird flying away from a ridge climbs as if it were in front of it: look ahead, along the velocity.' };
  return null;
}

// The whole flock, stepped with the learner's steerBird.
export const FLOCK = { steps: 3600, reach: 450, spaceLeast: 1.5, steady: 1800 };
export function runFlock(world, steps, seed = 7) {
  const P = world.call('islandParams', seed);
  const H = world.call('fillLand', new Float32Array(N * N), P);
  const B = world.call('newFlock', 60, seed, P.bay);
  for (let k = 0; k < steps; k++) world.call('stepFlock', B, 60, 1 / 30, k / 30, P.bay, H);
  return { B, P, H };
}
export function nearest(B, n = 60) {
  let sum = 0;
  for (let i = 0; i < n; i++) { let m = Infinity; for (let j = 0; j < n; j++) if (j !== i) m = Math.min(m, Math.hypot(B[i * 8] - B[j * 8], B[i * 8 + 1] - B[j * 8 + 1], B[i * 8 + 2] - B[j * 8 + 2])); sum += m; }
  return sum / n;
}
function flock({ mine }) {
  const { B, P, H } = runFlock(mine, FLOCK.steps);
  if (B.some((v) => !Number.isFinite(v))) return { message: 'after 3,600 steps a bird has a number that is not finite.' };
  for (let i = 0; i < 60; i++) {
    const [x, y, z] = [B[i * 8], B[i * 8 + 1], B[i * 8 + 2]];
    if (Math.hypot(x - P.bay[0], z - P.bay[1]) > FLOCK.reach) return { message: `after 3,600 steps a bird is ${show(Math.hypot(x - P.bay[0], z - P.bay[1]))} m from the bay: the flock must stay within ${FLOCK.reach} m, following its goal.` };
    if (y < Math.max(mine.call('heightAt', H, x, z), 0)) return { message: `after 3,600 steps a bird is at ${show(y)} m, in the ground: it must climb clear of what is ahead.` };
  }
  const space = nearest(B);
  if (space < FLOCK.spaceLeast) return { message: `after 3,600 steps the birds are ${show(space)} m from their nearest neighbour, on average: the flock has collapsed onto itself. Separation must turn a bird away from any that crowd it.` };
  const again = runFlock(mine, 900), twice = runFlock(mine, 900), other = runFlock(mine, 900, 8);
  if (again.B.some((v, i) => v !== twice.B[i])) return { message: 'the same seed gave two different flocks after 900 steps.' };
  if (again.B.every((v, i) => v === other.B[i])) return { message: 'seeds 7 and 8 gave the same flock.' };
  return null;
}
function rule({ mine, course }) {
  ask(mine, bird(), alone(), [0, 60, 0]); // stops here with "not written yet"
  const message = ruleFault(landPath(mine.source, 7, course.names));
  return message ? { message } : null;
}

// ------------------------------------------------------------------ a school of fish (new application)

export const SCHOOL = { fish: 12, steps: 900, out: 90, near: 60, top: -0.3, bed: 0.5, slow: 0.2, fast: 3, space: 0.4 };
const quayOf = (world, l) => [l.S.beach[0] + l.S.sea[0] * SCHOOL.out, l.S.beach[1] + l.S.sea[1] * SCHOOL.out];
export function startSchool(quay, seed) {
  const r = stream(seed), B = new Float32Array(SCHOOL.fish * 8);
  for (let i = 0; i < SCHOOL.fish; i++) B.set([quay[0] + (r() - 0.5) * 12, -1.5 - r(), quay[1] + (r() - 0.5) * 12, r() - 0.5, 0, r() - 0.5, 0, r()], i * 8);
  return B;
}
function school(world, map, seed) {
  const l = layout(world, seed);
  const quay = quayOf(world, l);
  const B = startSchool(quay, seed + 3);
  for (let k = 0; k < SCHOOL.steps; k++) map.call('schoolStep', B, SCHOOL.fish, 1 / 30, k / 30, quay, l.H);
  return { B, quay, l };
}
function schoolPlace({ map, mine }) {
  for (const seed of [7, 8]) {
    const { B, quay, l } = school(mine, map, seed);
    for (let i = 0; i < SCHOOL.fish; i++) {
      const [x, y, z] = [B[i * 8], B[i * 8 + 1], B[i * 8 + 2]];
      if (![x, y, z].every(Number.isFinite)) return { message: `seed ${seed}: a fish has a position that is not finite after ${SCHOOL.steps} steps.` };
      const bed = mine.call('heightAt', l.H, x, z);
      if (y > SCHOOL.top) return { message: `seed ${seed}: a fish is at ${show(y)} m, above the water: the school stays below ${SCHOOL.top} m. steerBird's ground rule lifts a bird 14 m, so its height must be replaced, not used as it is.` };
      if (y < bed + SCHOOL.bed) return { message: `seed ${seed}: a fish is at ${show(y)} m and the bed there is ${show(bed)} m: it must stay at least ${SCHOOL.bed} m above the bed.` };
      const off = Math.hypot(x - quay[0], z - quay[1]);
      if (off > SCHOOL.near) return { message: `seed ${seed}: a fish is ${show(off)} m from the quay: the school stays within ${SCHOOL.near} m.` };
    }
  }
  return null;
}
function schoolLife({ map, mine }) {
  const { B } = school(mine, map, 7);
  for (let i = 0; i < SCHOOL.fish; i++) {
    const v = Math.hypot(B[i * 8 + 3], B[i * 8 + 4], B[i * 8 + 5]);
    if (v < SCHOOL.slow || v > SCHOOL.fast) return { message: `a fish swims at ${show(v)} m/s: between ${SCHOOL.slow} and ${SCHOOL.fast} m/s, never still and never as fast as a gull.` };
  }
  const space = nearest(B, SCHOOL.fish);
  if (space < SCHOOL.space) return { message: `the fish are ${show(space)} m from their nearest neighbour, on average, after ${SCHOOL.steps} steps: a school that keeps its room is at least ${SCHOOL.space} m apart.` };
  return null;
}
function schoolRules({ map, mine, scriptSource }) {
  map.call('schoolStep', startSchool([0, 0], 1), SCHOOL.fish, 1 / 30, 0, [0, 0], new Float32Array(N * N).fill(-6)); // stops here with "not written yet"
  if (!/\bsteerBird\s*\(/.test(scriptSource)) return { message: 'schoolStep does not call steerBird. The school is steered by the same rules as the flock: use it, and replace its height.' };
  const one = school(mine, map, 7), two = school(mine, map, 7);
  if (one.B.some((v, i) => v !== two.B[i])) return { message: 'the same school from the same seed gave a different end.' };
  return null;
}

// ------------------------------------------------------------------ the cases

export const cases = [
  { id: '7.steer-shape', part: 'contract', uses: ['steerBird'], title: 'three finite numbers, and nothing changed', run: shape },
  { id: '7.steer-goal', part: 'contract', uses: ['steerBird'], title: 'it follows the goal, more firmly in height', run: goal },
  { id: '7.steer-cohesion', part: 'contract', uses: ['steerBird'], title: 'it is drawn to the middle of its neighbours, however many', run: cohesion },
  { id: '7.steer-alignment', part: 'contract', uses: ['steerBird'], title: 'it matches their average velocity', run: alignment },
  { id: '7.steer-separation', part: 'contract', uses: ['steerBird'], title: 'it turns away from any that crowd it', run: separation },
  { id: '7.steer-ground', part: 'contract', uses: ['steerBird'], title: 'it climbs clear of the ground ahead', run: ground },
  { id: '7.flock', part: 'contract', uses: ['steerBird'], title: 'the flock stays in the bay, in the air and apart, and is the same every time', run: flock },
  { id: '7.rule', part: 'contract', uses: ['steerBird'], title: 'everything that shapes the land still keeps the determinism rule', run: rule },
  { id: '7.school-place', part: 'application', uses: ['schoolStep', 'steerBird'], title: 'the school stays in the water, off the bed, near the quay', run: schoolPlace },
  { id: '7.school-life', part: 'application', uses: ['schoolStep', 'steerBird'], title: 'the fish swim at a fish\'s pace and keep their room', run: schoolLife },
  { id: '7.school-rules', part: 'application', uses: ['schoolStep', 'steerBird'], title: 'the school is steered by steerBird, and is the same every time', run: schoolRules },
];

export function note({ mine, course }) {
  const r = stream(9);
  let differ = 0;
  for (let k = 0; k < 300; k++) {
    const B = bird({ at: [r() * 200 - 100, 10 + r() * 90, r() * 200 - 100], vel: [r() * 20 - 10, r() * 4 - 2, r() * 20 - 10] });
    const near = { count: 1 + (k % 6), centre: [r() * 60, r() * 20, r() * 60], heading: [r() * 60, 0, r() * 60], push: [r() * 2, r(), r() * 2] };
    const H = new Float32Array(N * N).fill(r() * 60);
    const a = mine.call('steerBird', B, 0, near, [80, 50, 20], H), b = course.call('steerBird', B, 0, near, [80, 50, 20], H);
    if (Array.from(a).some((v, i) => Math.abs(v - b[i]) > 1e-6)) differ++;
  }
  return [differ ? `steerBird differs from stage 7's on ${differ} of 300 birds (another correct rule would too)` : 'steerBird matches stage 7\'s on all 300 birds'];
}
