// Lesson 9 checks: nextScale in project/world-09.html.
// The contract is required. The comparison with stage 9 is a note, never a failure. The frame times here are numbers
// given to the function, or a simple model of a device; nothing is measured on a phone.
export const title = 'Ship it';
const show = (v) => String(+v.toPrecision(4));
export const FLOOR = 0.45, WARM = 0.7, SLOW = 36, MISS = 21, FAST = 17.6, CALM = 4;

// What the page does with nextScale: it checks every 0.7 s, counts the checks in a row with room to spare in calm,
// and starts counting again whenever the scale changes. Returns the scales after each check.
export function run(next, msOf, checks, start = 1) {
  let scale = start, calm = 0;
  const out = [];
  for (let k = 0; k < checks; k++) {
    const ms = msOf(scale, k);
    calm = ms < FAST ? calm + 1 : 0;
    const to = next(scale, ms, calm);
    if (to !== scale) { scale = to; calm = 0; }
    out.push(scale);
  }
  return out;
}
// A device whose frame time is its pixels: 1 pixel in `scale` squared, and never faster than its 60 Hz screen.
export const device = (full) => (scale) => Math.max(16.7, full * scale * scale);
export const DEVICES = [17, 18, 20, 22, 24, 26, 28, 30, 33, 36, 40, 45, 52, 60, 75, 90];

const SCALES = [0.45, 0.5, 0.6, 0.7, 0.75, 0.85, 1];
const call = (mine, scale, ms, calm) => mine.call('nextScale', scale, ms, calm);
function range({ mine }) {
  for (const s of SCALES) for (const ms of [5, 15, 17.5, 19, 21, 22, 30, 36.5, 60, 400]) for (const calm of [0, 3, 4, 9]) {
    const v = call(mine, s, ms, calm);
    if (typeof v !== 'number' || !Number.isFinite(v)) return { message: `nextScale(${s}, ${ms}, ${calm}) returned ${v}: it must return the next scale, a number.` };
    if (v < FLOOR - 1e-9 || v > 1 + 1e-9) return { message: `nextScale(${s}, ${ms}, ${calm}) is ${show(v)}: the scale stays between ${FLOOR} and 1.` };
  }
  return null;
}
function slow({ mine }) {
  for (const s of SCALES) for (const ms of [37, 50, 200]) {
    const v = call(mine, s, ms, 0);
    const want = Math.max(FLOOR, s * 0.9);
    if (v > want + 1e-9) return { message: `at scale ${s} with frames of ${ms} ms, under 30 a second, nextScale gives ${show(v)}: it must fall at once by a tenth or more (to ${show(want)} or less), down to ${FLOOR}.` };
  }
  const deep = call(mine, 0.5, 50, 9);
  if (Math.abs(deep - Math.max(FLOOR, call(mine, 0.5, 50, 0))) > 1e-9) return { message: `with frames of 50 ms, the calm count changes the answer from ${show(call(mine, 0.5, 50, 0))} to ${show(deep)}: a slow check acts at once, whatever calm says.` };
  return null;
}
function missing({ mine }) {
  for (const s of [0.72, 0.8, 1]) for (const ms of [22, 28, 35]) {
    const v = call(mine, s, ms, 0);
    if (!(v < s - 0.01 && v >= s * 0.85)) return { message: `at scale ${s} with frames of ${ms} ms, between 30 and 60 a second, nextScale gives ${show(v)}: give up a little sharpness, 1 to 15 hundredths of the scale, and less than when frames are under 30 a second.` };
  }
  for (const s of [0.5, 0.65]) {
    const v = call(mine, s, 28, 0);
    if (Math.abs(v - s) > 1e-9) return { message: `at scale ${s} with frames of 28 ms, nextScale gives ${show(v)}: at 0.7 or less the picture is already soft, and 30 frames a second is enough, so it stays.` };
  }
  return null;
}
function deadBand({ mine }) {
  for (const s of SCALES) for (const ms of [17.7, 18, 19, 20, 20.9]) for (const calm of [0, 4, 30]) {
    const v = call(mine, s, ms, calm);
    if (Math.abs(v - s) > 1e-9) return { message: `at scale ${s} with frames of ${ms} ms, nextScale gives ${show(v)} (calm ${calm}): between 17.6 and 21 ms it must leave the scale alone, whatever calm is. This is the dead band: without it the picture pulses.` };
  }
  return null;
}
function fast({ mine }) {
  for (const s of [0.45, 0.6, 0.8]) {
    for (const calm of [0, 1, 3]) {
      const v = call(mine, s, 12, calm);
      if (Math.abs(v - s) > 1e-9) return { message: `at scale ${s} with frames of 12 ms and calm ${calm}, nextScale gives ${show(v)}: a frame that is fast once says little, so wait until calm is 4.` };
    }
    const v = call(mine, s, 12, 4);
    if (!(v > s + 0.005)) return { message: `at scale ${s} with frames of 12 ms and calm 4, nextScale gives ${show(v)}: after four calm checks there is room to rise.` };
  }
  return null;
}
function settles({ mine }) {
  for (const full of DEVICES) {
    const scales = run((...a) => mine.call('nextScale', ...a), device(full), 150);
    const tail = scales.slice(-90);
    const changes = tail.filter((v, i) => i && v !== tail[i - 1]).length;
    if (changes) return { message: `on a device whose frames take ${full} ms at full size, the scale still changes after 60 checks (42 seconds): ${tail.slice(0, 6).map(show).join(', ')}. The picture pulses between sizes. Leave a band of frame times where nothing changes, wide enough that one step up or down cannot jump over it.` };
  }
  return null;
}
function recovers({ mine }) {
  const scales = run((...a) => mine.call('nextScale', ...a), (s, k) => (k < 10 ? 60 : 12), 150);
  if (scales[9] > FLOOR + 1e-9) return { message: `after ten slow checks the scale is ${show(scales[9])}: ten checks of 60 ms must bring it to the floor, ${FLOOR}.` };
  if (!(scales.at(-1) > 0.99)) return { message: `after ten slow checks and 140 fast ones the scale is ${show(scales.at(-1))}: with room to spare it must climb back to 1.` };
  return null;
}

export const cases = [
  { id: '9.range', part: 'contract', uses: ['nextScale'], title: 'the scale stays between the floor and 1', run: range },
  { id: '9.slow', part: 'contract', uses: ['nextScale'], title: 'under 30 frames a second it falls at once', run: slow },
  { id: '9.missing', part: 'contract', uses: ['nextScale'], title: 'missing 60 it gives up a little, but not below 0.7', run: missing },
  { id: '9.dead-band', part: 'contract', uses: ['nextScale'], title: 'between 17.6 and 21 ms nothing changes', run: deadBand },
  { id: '9.fast', part: 'contract', uses: ['nextScale'], title: 'with room to spare it waits, then rises', run: fast },
  { id: '9.settles', part: 'contract', uses: ['nextScale'], title: 'on sixteen model devices the picture stops changing size', run: settles },
  { id: '9.recovers', part: 'contract', uses: ['nextScale'], title: 'ten slow checks reach the floor, and fast ones climb back', run: recovers },
];

export function note({ mine, course }) {
  let differ = 0, n = 0;
  for (const s of SCALES) for (let ms = 10; ms <= 60; ms += 2) for (const c of [0, 3, 4, 8]) { n++; if (Math.abs(call(mine, s, ms, c) - call(course, s, ms, c)) > 1e-9) differ++; }
  return [differ ? `nextScale differs from stage 9's at ${differ} of ${n} cases` : `nextScale matches stage 9's at all ${n} cases`];
}
