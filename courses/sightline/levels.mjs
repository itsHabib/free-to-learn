// The ladder: ten levels, each a build of the game that breaks something the
// level before it let an engine rely on, and the referee that scores a level.
import { makeGame } from './host.mjs';

// radius: how close a shot must land to the flag, in paces, to count.
// pass: how many of the last `rounds` shots must count.
// budget: the rounds and shots the whole level may use, the scored ones included.
export const LEVELS = Object.freeze([
  { n: 1, name: 'Open range', game: 'lob', mode: 0, seed: 101, rounds: 10, radius: 12, pass: 7, budget: { rounds: 28, shots: 30 }, about: 'The plain build. Find the controls and the values, and get an aim.' },
  { n: 2, name: 'Bullseye', game: 'lob', mode: 0, seed: 102, rounds: 10, radius: 3, pass: 9, budget: { rounds: 24, shots: 16 }, about: 'The same build with a target a quarter of the size.' },
  { n: 3, name: 'Moving memory', game: 'lob', mode: 2, seed: 103, rounds: 10, radius: 12, pass: 9, budget: { rounds: 18, shots: 12 }, about: 'The game moves its state to a new address every round.' },
  { n: 4, name: 'Scrambled', game: 'lob', mode: 6, seed: 104, rounds: 10, radius: 12, pass: 9, budget: { rounds: 16, shots: 12 }, about: 'The state moves and its values are stored scrambled with a key that changes every round.' },
  { n: 5, name: 'Wind off the client', game: 'lob', mode: 7, seed: 105, rounds: 10, radius: 12, pass: 8, budget: { rounds: 16, shots: 12 }, about: 'The exact wind stays on a server. The client holds only the arrows it draws.' },
  { n: 6, name: 'Moving flag', game: 'lob', mode: 14, seed: 106, rounds: 10, radius: 12, pass: 9, budget: { rounds: 16, shots: 12 }, about: 'The flag slides while the shell is in the air, and every decision costs frames.' },
  { n: 7, name: 'Everything at once', game: 'lob', mode: 15, seed: 107, rounds: 10, radius: 12, pass: 8, budget: { rounds: 16, shots: 12 }, about: 'Every defence together.' },
  { n: 8, name: 'A new game', game: 'lob2', mode: 0, seed: 108, rounds: 10, radius: 12, pass: 8, budget: { rounds: 24, shots: 16 }, about: 'Lob II: a game you have never seen. Nothing in the kit is known to be right for it.' },
  { n: 9, name: 'A new game, hidden', game: 'lob2', mode: 6, seed: 109, rounds: 10, radius: 12, pass: 8, budget: { rounds: 18, shots: 12 }, about: 'Lob II with its state moving and scrambled.' },
  { n: 10, name: 'A new game, everything', game: 'lob2', mode: 7, seed: 110, rounds: 10, radius: 12, pass: 7, budget: { rounds: 16, shots: 12 }, about: 'Lob II with every defence it has.' },
]);

// A host that scores what happens on it. The engine gets `host`; the count is
// taken from the game itself, one entry per shot that lands: how far from the
// flag it fell, with the flag where it was at that moment, and whether the
// engine wrote to the game's memory after the round began (such a shot does
// not count: a search may write-test before a round, never during one).
// seen counts what the level spent: rounds started and shots fired.
export function referee({ game, mode, seed }) {
  const { host, truth } = makeGame({ game, mode, seed });
  const shots = [];
  const seen = { presses: {}, frames: 0, writes: 0, rounds: 0, shots: 0 };
  let flying = false, written = false;
  const look = () => {
    const now = truth.flying();
    if (!flying && now) seen.shots++;
    if (flying && !now) shots.push({ miss: Math.abs(truth.impactX() - truth.targetX()), impact: truth.impactX(), target: truth.targetX(), message: truth.message(), frame: seen.frames, written });
    flying = now;
  };
  return {
    truth, shots, seen,
    host: Object.freeze({
      binary: () => host.binary(),
      memory: () => host.memory(),
      screen: () => host.screen(),
      write: (addr, type, value) => { seen.writes++; written = true; host.write(addr, type, value); },
      press: (key) => { seen.presses[key] = (seen.presses[key] ?? 0) + 1; if (key === 'KeyN' && !flying) { written = false; seen.rounds++; } host.press(key); look(); },
      tick: (frames = 1) => { for (let i = 0; i < frames; i++) { host.tick(1); seen.frames++; look(); } },
    }),
  };
}

// Score a level: the last `rounds` shots that landed, counted against its radius.
// A level that used more rounds or shots than its budget is not passed.
export function score(level, shots, seen = null) {
  const last = shots.slice(-level.rounds);
  // A shot does not count if the game's memory was written after its round began.
  const hits = last.filter((s) => s.miss <= level.radius && !s.written).length;
  const over = seen && level.budget ? seen.rounds > level.budget.rounds || seen.shots > level.budget.shots : false;
  return { hits, rounds: level.rounds, fired: shots.length, over, used: seen ? { rounds: seen.rounds, shots: seen.shots } : null, pass: last.length === level.rounds && hits >= level.pass && !over, misses: last.map((s) => s.miss) };
}

// Play one level with an engine (your engine.mjs, loaded) and return the score.
export async function runLevel(engine, level, kit, env) {
  const ref = referee(level);
  let error = null;
  try { await engine.playLevel(ref.host, level, kit, env); } catch (e) { error = e; }
  return { ...score(level, ref.shots, ref.seen), level, seen: ref.seen, error };
}
