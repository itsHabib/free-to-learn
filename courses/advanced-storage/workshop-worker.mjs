// Instrument the supplied runner without changing its actions or policy dispatch.
// Trusted local learner code, with a process timeout supplied by the caller.
import { readFileSync } from 'node:fs';
import { BaseEngine } from './runtime/base.mjs';
import { executeScenario } from './runtime/scenario.mjs';
import { snapshotOracle } from './investigation.mjs';

let seed = Number(process.argv[3]) >>> 0;
// Same seeded Math.random as witness-worker, for exact witness replay.
Math.random = () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
console.log = console.info = console.warn = console.error = () => {};
let output, db;
const frames = [], aliases = new Map();
try {
  const scenario = JSON.parse(readFileSync(0, 'utf8'));
  const source = readFileSync(process.argv[2]);
  const { buildEngine } = await import('data:text/javascript;base64,' + source.toString('base64'));
  class ObservedBase extends BaseEngine {
    constructor(options) { super(options); db = this; }
  }
  // The array still passes Array.isArray and serializes to the original bytes.
  // Its iterator surrounds each *existing* runner action with a state capture.
  Object.defineProperty(scenario.actions, Symbol.iterator, { value: function* () {
    for (let index = 0; index < this.length; index++) {
      const action = this[index], start = db.events.length, before = { ...db.metrics };
      try { yield action; }
      finally {
        const events = db.events.slice(start);
        const began = action.op === 'begin' && events.find(e => e.type === 'begin');
        if (began) aliases.set(began.tx, action.tx);
        frames.push({
          index, id: action.id, events,
          work: Object.fromEntries(Object.entries(db.metrics).map(([k, v]) => [k, v - before[k]])),
          state: {
            csn: db.csn, versions: db.versionCount(), pins: db.pins(),
            transactions: [...db.transactions.values()].map(t => ({
              alias: aliases.get(t.id), id: t.id, snapshot: t.snapshot, state: t.state,
              readOnly: t.readOnly, reads: t.reads, writes: [...t.writes.values()], openQueries: t.handles.size
            }))
          }
        });
        // Detach dependencies and private writes before later actions mutate them.
        frames[frames.length - 1] = structuredClone(frames.at(-1));
      }
    }
  } });
  const execution = executeScenario(buildEngine(ObservedBase), scenario);
  output = { status: 'complete', execution, frames, mismatches: snapshotOracle(scenario, execution).mismatches };
} catch (error) {
  const status = error.code === 'RESOURCE' ? 'resource-limit' : ['INPUT', 'STATE'].includes(error.code) ? 'invalid-execution' : 'execution-error';
  output = { status, code: error.code ?? error.name, message: String(error.message).slice(0, 500), partial: error.partial, frames };
}
process.stdout.write(JSON.stringify(output));
