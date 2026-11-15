// Unit 13: the ladder. Each case runs your investigations/N.txt through debug.mjs
// with your own files, counts every instruction your machine runs, and compares the
// answer it names with the first bad write of build N. The answers are kept only as
// slow salted hashes (scrypt, about a fifth of a second each), so this file cannot
// tell you what they are, and trying every store of a run would take hours.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
import { fail, readJson, NOT_WRITTEN, courseRoot } from './harness.mjs';
import { runInvestigation } from '../debug.mjs';

export const title = 'The ladder';

const rungs = () => readJson('ladder.json');
const answers = () => readJson('checks/fixtures/13/answers.json');
export const answerKey = (salt, n, a) => scryptSync(`${a.func}:${a.at}:${a.address}:${a.tick}`, `${salt}:${n}`, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString('hex');

function commands(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

export const cases = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `13.build-${n}`,
  title: `investigations/${n}.txt names the first bad write of build ${n}`,
  timeLimitMs: 60000,
  requirement: `Run through debug.mjs, investigations/${n}.txt ends with an answer that names build ${n}'s first bad write (function, instruction, address and tick) and replays no more instructions than the build's budget.`,
  async run({ workDir }) {
    const rung = rungs().find((r) => r.n === n);
    const file = join(workDir, 'investigations', `${n}.txt`);
    if (!existsSync(file) || !commands(readFileSync(file, 'utf8')).length) throw Error(`investigations/${n}.txt: ${NOT_WRITTEN} (lesson 13)`);
    let r;
    try {
      r = await runInvestigation(workDir, rung, readFileSync(file, 'utf8'));
    } catch (e) {
      if (String(e.message).includes(NOT_WRITTEN)) throw e;
      fail({ checked: `investigations/${n}.txt runs to its end`, input: `node lab.mjs investigate PROJECT ${n}`, observed: `a command failed: ${e.message}`, expected: 'every command runs; end with answer' });
    }
    if (!r.answer) fail({ checked: `investigations/${n}.txt gives an answer`, input: `node lab.mjs investigate PROJECT ${n}`, observed: 'no answer command ran', expected: 'the script ends with answer, standing right after the first bad write' });
    // Standing right after a store at tick T means your machine ran at least T
    // instructions through step(); fewer means instructions ran uncounted.
    if (r.replayed < r.answer.tick) fail({ checked: `your machine ran the instructions the investigation of build ${n} stood on`, input: `node lab.mjs investigate PROJECT ${n}`, observed: `${r.replayed} instructions counted through Machine.step(), but your answer stands at tick ${r.answer.tick}`, expected: 'every instruction your machine runs goes through step() (API.md, machine.mjs)' });
    const key = answers();
    if (answerKey(key.salt, n, r.answer) !== key.builds[String(n)]) {
      fail({ checked: `the answer names build ${n}'s first bad write`, input: `node lab.mjs investigate PROJECT ${n}`, observed: `your answer: function ${r.answer.func}, instruction ${r.answer.at}, address ${r.answer.address}, tick ${r.answer.tick}`, expected: 'a different write: the earliest store whose value a correct build would not have written there. Check the function and instruction, then whether an earlier write on the same chain was already wrong.' });
    }
    if (rung.budget !== null && r.replayed > rung.budget) fail({ checked: `the investigation of build ${n} stays within its replay budget`, input: `node lab.mjs investigate PROJECT ${n}`, observed: `${r.replayed} instructions replayed`, expected: `at most ${rung.budget}` });
  },
}));

export { courseRoot };
