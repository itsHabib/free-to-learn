// Walk an admit through two rounds and print the state after every decision.
// node examples/try-admit.mjs            the unit 12 checkpoint, examples/admission-checkpoint.mjs
// node examples/try-admit.mjs project    your project's server/admission.mjs
import { join, resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';

const [folder] = process.argv.slice(2);
const url = folder
  ? pathToFileURL(join(resolve(folder), 'server', 'admission.mjs')).href
  : new URL('./admission-checkpoint.mjs', import.meta.url).href;
const { admit } = await import(url);

// Each step: the input's seq, whether it fires, and the game's facts at that moment.
const steps = [
  { seq: 1, fire: false, round: 1, flying: false },
  { seq: 2, fire: true, round: 1, flying: false },
  { seq: 3, fire: false, round: 1, flying: true },
  { seq: 4, fire: true, round: 1, flying: false },
  { seq: 5, fire: true, round: 2, flying: false },
  { seq: 5, fire: false, round: 2, flying: false },
];

let state = { lastSeq: 0, firedRound: 0 };
console.log(`start                         state ${JSON.stringify(state)}`);
for (const [tick, { seq, fire, round, flying }] of steps.entries()) {
  const input = { v: 1, seq, angle: 45, power: 60, fire };
  const decision = admit(state, input, { tick, round, flying });
  const what = `seq ${seq}${fire ? ' fire' : '     '} round ${round}${flying ? ' flying' : '       '}`;
  const said =
    decision.status === 'admitted' ? 'admitted' : `refused ${decision.reason}`;
  const same = decision.next === state ? ' (the same object)' : '';
  console.log(
    `${what} ${said.padEnd(15)} state ${JSON.stringify(decision.next)}${same}`,
  );
  state = decision.next;
}
