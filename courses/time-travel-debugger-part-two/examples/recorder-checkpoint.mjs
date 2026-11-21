// Unit 09 recorder: record a run, replay it exactly from the recording, and
// find the first tick where a tampered replay's memory parts from the original.
// API.md, "recorder.mjs", is the contract. This file uses the Machine in the
// same project folder, so every instruction it runs goes through your step().
//
// The lab and the checks pass a program already loaded by readProgram. A raw
// listing works too, because the Machine loads whatever it is given.
import { createHash } from 'node:crypto';
import { Machine } from './machine.mjs';

// The course's memory hash, the same one public/hash.mjs and the checks use.
export const hashMemory = (memory) =>
  createHash('sha256').update(memory).digest('hex');

// The error replay throws when the run leaves its recording.
export class ReplayDivergence extends Error {
  constructor(divergence) {
    super(
      `replay diverged at tick ${divergence.tick} (call ${divergence.call}): ${divergence.reason}`,
    );
    this.divergence = divergence;
  }
}

// region: record
export function record(program, imports, calls) {
  const answers = [];
  const noting = {};
  for (const { name } of program.imports) {
    noting[name] = (...args) => {
      const result = imports[name](...args);
      answers.push({ name, args, result });
      return result;
    };
  }
  const machine = new Machine(program, noting);
  const results = [];
  const hashes = [];
  for (const call of calls) {
    const result = machine.invoke(call.name, call.args);
    results.push(result === undefined ? null : result);
    hashes.push(hashMemory(machine.state.memory));
  }
  return {
    format: 'ttd2-recording-1',
    program: program.name,
    sha256: program.sha256,
    calls: calls.map((call) => ({ name: call.name, args: [...call.args] })),
    results,
    answers,
    hashes,
  };
}
// endregion: record

// region: recorded-imports
export function recordedImports(program, recording, machineOf, start = 0) {
  let next = start;
  const imports = {};
  for (const { name } of program.imports) {
    imports[name] = (...args) => {
      const answer = recording.answers[next];
      const state = machineOf().state;
      const where = { tick: state.tick, call: state.calls - 1 };
      const asked = `${name}(${args.join(', ')})`;
      if (!answer)
        throw new ReplayDivergence({
          ...where,
          reason: `the program asked ${asked} after the recording's last answer`,
        });
      if (
        answer.name !== name ||
        answer.args.length !== args.length ||
        answer.args.some((value, i) => !Object.is(value, args[i]))
      )
        throw new ReplayDivergence({
          ...where,
          reason: `the program asked ${asked}, the recording holds ${answer.name}(${answer.args.join(', ')})`,
        });
      next++;
      return answer.result;
    };
  }
  return { imports, position: () => next };
}
// endregion: recorded-imports

// region: replay
export function replay(program, recording, { check = true } = {}) {
  let machine;
  const answered = recordedImports(program, recording, () => machine);
  machine = new Machine(program, answered.imports);
  const results = [];
  const hashes = [];
  recording.calls.forEach((call, k) => {
    const value = machine.invoke(call.name, call.args);
    const result = value === undefined ? null : value;
    const hash = hashMemory(machine.state.memory);
    results.push(result);
    hashes.push(hash);
    const where = { tick: machine.state.tick, call: k };
    if (check && !Object.is(result, recording.results[k]))
      throw new ReplayDivergence({
        ...where,
        reason: `call ${k} returned ${result}, the recording says ${recording.results[k]}`,
      });
    if (check && hash !== recording.hashes[k])
      throw new ReplayDivergence({
        ...where,
        reason: `memory after call ${k} differs from the recording`,
      });
  });
  return { machine, results, hashes };
}
// endregion: replay

// region: find-call
export function firstDivergence(program, original, tampered) {
  let machine;
  const answered = recordedImports(program, tampered, () => machine);
  machine = new Machine(program, answered.imports);
  for (let k = 0; k < tampered.calls.length; k++) {
    const start = globalThis.structuredClone(machine.state);
    const answerAt = answered.position();
    let left = false;
    try {
      machine.invoke(tampered.calls[k].name, tampered.calls[k].args);
    } catch (error) {
      if (!(error instanceof ReplayDivergence)) throw error;
      left = true;
    }
    const same =
      !left && hashMemory(machine.state.memory) === original.hashes[k];
    if (same) continue;
    return bisectCall(program, original, tampered, k, start, answerAt);
  }
  return null;
}
// endregion: find-call

// region: run-from
function runFrom(program, recording, k, start, answerAt, limit) {
  let machine;
  const answered = recordedImports(program, recording, () => machine, answerAt);
  machine = new Machine(program, answered.imports);
  machine.state = globalThis.structuredClone(start);
  machine.begin(recording.calls[k].name, recording.calls[k].args);
  let ran = 0;
  try {
    while (machine.running && ran < limit) {
      machine.step();
      ran++;
    }
  } catch (error) {
    if (!(error instanceof ReplayDivergence)) throw error;
    return { machine, ran, left: true };
  }
  return { machine, ran, left: false };
}
// endregion: run-from

// region: bisect
function bisectCall(program, original, tampered, k, start, answerAt) {
  const run = (recording, limit) =>
    runFrom(program, recording, k, start, answerAt, limit);
  const a = run(original, Infinity);
  const b = run(tampered, Infinity);
  const differs = (t) => {
    const x = run(original, t);
    const y = run(tampered, t);
    if (y.left && y.ran < t) return true;
    return (
      hashMemory(x.machine.state.memory) !== hashMemory(y.machine.state.memory)
    );
  };
  let lo = 0; // memory is equal after lo instructions of call k
  let hi = Math.max(a.ran, b.left ? b.ran + 1 : b.ran); // and differs after hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (differs(mid)) hi = mid;
    else lo = mid;
  }
  return start.tick + hi;
}
// endregion: bisect
