// Unit 14, end-of-unit checkpoint: detect/features.mjs, as lesson 14 walks through it.
// One session's features, from its play alone: record.inputs and rounds (API.md, "features").
import { median, quantile, mean, sd, correlation } from '../public/stats.mjs';

// region: features
export function features({ record, rounds }) {
  const shotRounds = rounds.filter((r) => r.shot !== null);
  const shots = shotRounds.length;
  const hits = shotRounds.filter((r) => r.result === 'hit').length;
  const fireTimes = shotRounds.map((r) => r.shot.tick - r.start);
  return {
    shots,
    hitRate: shots ? hits / shots : null,
    missMedian: median(shotRounds.map((r) => Math.abs(r.miss))),
    fireMedian: median(fireTimes),
    fireSpread: shots
      ? quantile(fireTimes, 0.75) - quantile(fireTimes, 0.25)
      : null,
    inputsMedian: median(shotRounds.map((r) => r.inputs)),
    cadenceCV: cadenceCV(record.inputs, rounds),
    missLag1: missLag1(rounds),
  };
}
// endregion: features

// region: cadence-cv
function cadenceCV(inputs, rounds) {
  const gaps = [];
  let previous = null;
  for (const input of inputs) {
    const round = roundAt(rounds, input.tick);
    if (previous && previous.round === round)
      gaps.push(input.tick - previous.tick);
    previous = { round, tick: input.tick };
  }
  if (gaps.length < 5) return null;
  const m = mean(gaps);
  return m > 0 ? sd(gaps) / m : null;
}

function roundAt(rounds, tick) {
  let found = null;
  for (const r of rounds) if (r.start <= tick) found = r.round;
  return found;
}
// endregion: cadence-cv

// region: miss-lag1
function missLag1(rounds) {
  const xs = [];
  const ys = [];
  for (let i = 0; i + 1 < rounds.length; i++) {
    const a = rounds[i];
    const b = rounds[i + 1];
    if (a.shot && b.shot && b.round === a.round + 1) {
      xs.push(a.miss);
      ys.push(b.miss);
    }
  }
  return xs.length < 4 ? null : correlation(xs, ys);
}
// endregion: miss-lag1
