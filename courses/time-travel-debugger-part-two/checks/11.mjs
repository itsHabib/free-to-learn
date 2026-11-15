// Unit 11: question a recording. Generated questions about recordings the lessons
// never use. lastWriter answers are given in full; sources answers are kept as the
// length and a salted hash of each list, so a failure says which list differs
// without giving the list away.
import { createHash } from 'node:crypto';
import { fail, show, countSteps, readJson, program as namedProgram, NOT_WRITTEN } from './harness.mjs';
import { loadProgram } from '../public/program.mjs';
import { trace, uncounted } from './trace.mjs';

export const title = 'Question a recording';

const LOB = ['checks/fixtures/11/lob-mode1.json', 'checks/fixtures/11/lob-mode6.json', 'checks/fixtures/11/lob-mode9.json'];
const LOB2 = ['checks/fixtures/11/lob2-mode1.json'];
const MIXER = ['checks/fixtures/11/mixer.json'];

function open(rel) {
  const f = readJson(rel);
  return { f, program: f.program ? loadProgram(f.program) : namedProgram(f.recording.program) };
}

async function index({ fn, cls }, rel) {
  const buildIndex = await fn('query.mjs', 'buildIndex');
  const Machine = await cls('machine.mjs', 'Machine');
  const counter = countSteps(Machine);
  const { f, program } = open(rel);
  counter.reset();
  const idx = buildIndex(program, f.recording);
  return { idx, f, program, built: counter.count, counter, Machine };
}

const hashOf = (salt, list) => createHash('sha256').update(salt + JSON.stringify(list)).digest('hex');
const LISTS = ['stores', 'answers', 'args', 'initial'];

function checkSources(idx, f, rel, env) {
  let T = null;   // what each tick ran, worked out only when a question fails
  const named = (tick) => { try { T ??= uncounted(env.counter, () => trace(env.Machine, env.program, f.recording)); return `, the store at tick ${tick} is instruction (${T.func[tick]}, ${T.at[tick]})`; } catch { return ''; } };
  for (const q of f.questions.filter((x) => x.kind === 'sources')) {
    const [tick] = q.args;
    const input = `${rel} (open it with node debug.mjs PROJECT ${rel}): sources(${tick})`;
    if (q.answer === 'throws') {
      let threw = false;
      try { idx.sources(tick); } catch (e) { if (String(e.message).includes(NOT_WRITTEN)) throw e; threw = true; }
      if (!threw) fail({ checked: 'sources throws for a tick that is not a store', input, observed: 'it returned a value', expected: 'an error: the instruction at that tick did not store anything' });
      continue;
    }
    let got;
    try { got = idx.sources(tick); } catch (e) { if (String(e.message).includes(NOT_WRITTEN)) throw e; fail({ checked: 'sources answers for a store', input, observed: `it threw: ${e.message}`, expected: 'the four lists' }); }
    for (const name of LISTS) {
      const list = got?.[name];
      const want = q.answer[name];
      if (!Array.isArray(list)) fail({ checked: `sources returns a ${name} list`, input, observed: show(got, 200), expected: '{ stores, answers, args, initial }, each an array' });
      if (list.length !== want.length || hashOf(f.salt, list) !== want.sha256) {
        fail({
          checked: `the ${name} list of the chain`, input: input + named(tick),
          observed: `your ${name}: ${show(list, 160)} (${list.length} entries)`,
          expected: list.length !== want.length ? `${want.length} entries` : `${want.length} entries, but not these ones (or not in increasing order without repeats)`,
          diff: `the other lists: ${LISTS.filter((n) => n !== name).map((n) => `${n} ${Array.isArray(got[n]) && got[n].length === q.answer[n].length && hashOf(f.salt, got[n]) === q.answer[n].sha256 ? 'right' : 'wrong'}`).join(', ')}`,
        });
      }
    }
  }
}

export const cases = [
  {
    id: '11.last-writer', title: 'lastWriter answers every generated question', timeLimitMs: 60000,
    requirement: 'lastWriter(address, beforeTick) returns the write by the instruction with the greatest tick below beforeTick that touched the byte, or null.',
    async run(env) {
      for (const rel of [...LOB, ...LOB2]) {
        const { idx, f } = await index(env, rel);
        for (const q of f.questions.filter((x) => x.kind === 'lastWriter')) {
          const got = idx.lastWriter(...q.args);
          const want = q.answer;
          const same = want === null ? got === null : got && ['tick', 'func', 'at', 'address', 'size'].every((k) => got[k] === want[k]);
          if (!same) fail({ checked: 'lastWriter names the last write of the byte before the tick', input: `${rel}: lastWriter(${q.args.join(', ')})`, observed: show(got), expected: show(want) });
        }
      }
    },
  },
  {
    id: '11.sources-lob', title: 'sources follows values on Lob', timeLimitMs: 60000,
    requirement: 'sources(tick) returns the stores, answers, call arguments and initial bytes on the value chain of the store at that tick, by the rules in API.md.',
    async run(env) { for (const rel of LOB) { const x = await index(env, rel); checkSources(x.idx, x.f, rel, x); } },
  },
  {
    id: '11.sources-lob2', title: 'sources follows values on Lob II', timeLimitMs: 60000,
    requirement: 'The same chains on Lob II, whose state is reached through two pointers and scrambled by adding a key.',
    async run(env) { for (const rel of LOB2) { const x = await index(env, rel); checkSources(x.idx, x.f, rel, x); } },
  },
  {
    id: '11.sources-rules', title: 'sources follows the rules Lob never tests', timeLimitMs: 30000,
    requirement: 'A small program exercises what the games do not: a global carrying a value, arguments into and results out of a defined function, a block that leaves a value, a branch that drops values, and a call argument stored directly.',
    async run(env) { for (const rel of MIXER) { const x = await index(env, rel); checkSources(x.idx, x.f, rel, x); } },
  },
  {
    id: '11.no-replay', title: 'questions are answered from the index, without replaying', timeLimitMs: 60000,
    requirement: 'buildIndex replays the recording at most about twice; answering questions afterwards runs no instruction.',
    async run(env) {
      const rel = LOB[0];
      const { idx, f, built, counter } = await index(env, rel);
      const end = f.about.instructions;
      if (built > 2 * end + 1000) fail({ checked: 'buildIndex replays the recording at most twice', input: `${rel}, a run of ${end} instructions`, observed: `${built} instructions`, expected: `at most ${2 * end + 1000}` });
      counter.reset();
      for (const q of f.questions) {
        try { if (q.kind === 'lastWriter') idx.lastWriter(...q.args); else idx.sources(...q.args); } catch (e) { if (String(e.message).includes(NOT_WRITTEN)) throw e; }
      }
      if (counter.count) fail({ checked: 'answering questions runs no instruction', input: `${f.questions.length} questions about ${rel}`, observed: `${counter.count} instructions run while answering`, expected: '0: everything a question needs was kept by buildIndex' });
      if (idx.end !== end) fail({ checked: 'index.end is the number of instructions in the run', input: rel, observed: show(idx.end), expected: String(end) });
    },
  },
];
