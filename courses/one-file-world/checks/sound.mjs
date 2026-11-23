// The lab's own plain renderer of a gull's call, in Node, following the page's recipe: one sawtooth whose pitch
// slides through each note, a narrow band-pass filter (its centre at 1.6 times each note's first pitch), then the
// envelope's level, held between notes, and a stop 0.1 seconds after the last. It is not the page's Web Audio: the
// samples are close, not identical. It measures; only a person can hear.
export const RATE = 48000;
const STOP = 0.1; // seconds the page lets the oscillator run after the last note

export function renderCall(notes, envelope, { rate = RATE, before = 0.02 } = {}) {
  const end = notes.reduce((m, n) => Math.max(m, n[0] + n[1]), 0);
  const seconds = end + STOP + 0.05;
  const out = new Float64Array(Math.ceil((before + seconds) * rate));
  // Every note's points, in order, as the page schedules them: a jump to the first, then straight lines.
  const levels = notes.flatMap(([at, len]) => envelope(len).map(([u, v], k) => [at + u, v, k === 0]));
  let level = 0, from = null, ni = 0, k = 0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, phase = 0, b = null;
  const coefficients = (f) => {
    const w = (2 * Math.PI * Math.min(f, rate * 0.45)) / rate, alpha = Math.sin(w) / (2 * 5), a0 = 1 + alpha;
    return [alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  };
  const first = Math.round(before * rate);
  for (let i = 0; first + i < out.length; i++) {
    const t = i / rate;
    while (ni + 1 < notes.length && t >= notes[ni + 1][0]) ni++;
    const [at, len, f0, f1] = notes[ni];
    b = coefficients(f0 * 1.6);
    while (k < levels.length && t >= levels[k][0]) { from = levels[k]; level = levels[k][1]; k++; }
    let v = level;
    if (k < levels.length && !levels[k][2] && from) v = from[1] + ((levels[k][1] - from[1]) * (t - from[0])) / (levels[k][0] - from[0]);
    const on = t <= end + STOP && t >= notes[0][0];
    if (on) phase += (f0 * (f1 / f0) ** Math.min(Math.max((t - at) / len, 0), 1)) / rate;
    const saw = on ? 2 * (phase + 0.5 - Math.floor(phase + 0.5)) - 1 : 0;
    const y = b[0] * (saw - x2) - b[1] * y1 - b[2] * y2;
    x2 = x1; x1 = saw; y2 = y1; y1 = y;
    out[first + i] = y * v;
  }
  const edges = [...notes.flatMap(([at, len]) => [at, at + len]), end + STOP].map((t) => first + Math.round(t * rate));
  return { samples: out, edges, seconds: end, rate };
}

export const peak = (samples) => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

// How suddenly the sound starts and stops: at each note's start and end and where the sound stops, the loudest
// sample in the 2 ms after against the 2 ms before, as a share of the loudest in the call. A note that rises over
// 30 ms changes little in 2 ms; one that starts at full level changes nearly the whole of it, which is the click.
export function clickSize({ samples, edges, rate }, window = 0.002) {
  const w = Math.round(window * rate), top = peak(samples);
  if (!(top > 0)) return 0;
  const loud = (a, b) => { let m = 0; for (let i = Math.max(a, 0); i < Math.min(b, samples.length); i++) m = Math.max(m, Math.abs(samples[i])); return m; };
  return edges.reduce((worst, e) => Math.max(worst, Math.abs(loud(e, e + w) - loud(e - w, e)) / top), 0);
}

// A sound as a 16-bit WAV file, for a person to listen to.
export function wav(samples, rate = RATE) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return b;
}
