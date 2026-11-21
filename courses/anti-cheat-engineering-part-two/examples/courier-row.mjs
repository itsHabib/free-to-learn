// Read one row of the scoreboard, the courier, from capstone/defence.json to the budget lines
// it prints, with the scoreboard's own functions (checks/scoreboard.mjs) and seeds
// (labcmds/17.mjs). Nothing here is new machinery: it calls what node lab.mjs scoreboard calls.
// node examples/courier-row.mjs PROJECT           your window, from capstone/defence.json
// node examples/courier-row.mjs PROJECT WINDOW    another window, for comparison
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeLoader } from '../checks/harness.mjs';
import * as sb from '../checks/scoreboard.mjs';
import { SEEDS, DEFAULTS } from '../labcmds/17.mjs';

const [folder, given] = process.argv.slice(2);
if (!folder || process.argv.length > 4) {
  console.log('Usage: node examples/courier-row.mjs PROJECT [WINDOW]');
  process.exit(2);
}
const project = resolve(folder);
if (!existsSync(join(project, 'PROJECT.json'))) {
  console.log(`${folder} is not a project folder.`);
  process.exit(2);
}
const percent = (x) => `${(100 * x).toFixed(2)}%`;
// A file that is not written yet, or a function that throws, stops the tour with one line.
function stop(error) {
  console.log(String(error?.fields?.observed ?? error?.message).split('\n')[0]);
  process.exit(1);
}

// region: read-window
const loader = makeLoader(project);
let window;
if (given === undefined) {
  let defence;
  try {
    defence = loader.json(sb.FILES.defence);
  } catch (error) {
    stop(error);
  }
  const read = sb.windowOf(defence);
  if (read.problem) {
    console.log(read.problem);
    process.exit(1);
  }
  window = read.window;
  console.log(`${sb.FILES.defence}: rewindWindow ${window}`);
} else {
  window = Number(given);
  if (!Number.isSafeInteger(window) || window < 0)
    stop(
      new Error(`WINDOW is a whole number of ticks, 0 or more, not ${given}`),
    );
  console.log(
    `window ${window}, given on the command line (${sb.FILES.defence} is not read)`,
  );
}
// endregion: read-window

// region: play-courier
const rewind = await sb.loadRewind(loader).catch(stop);
const courier = sb.courierAt({
  seed: SEEDS.courier,
  sessions: DEFAULTS.courier,
  window,
  rewind,
});
console.log(
  `runCourier seed ${SEEDS.courier}, ${DEFAULTS.courier} sessions per model, window ${window}, your rewind functions:`,
);
console.log(
  `  honest       ${courier.honest} presses, ${courier.honestRefused} refused although in range at seen`,
);
console.log(
  `  naive faker  ${courier.naive} presses, ${courier.naiveAccepted} accepted while not in range now`,
);
console.log(
  `  slow-pong    ${courier.slow} presses, ${courier.slowAccepted} accepted while not in range now`,
);
// endregion: play-courier

// region: verdict
const verdict = sb.courierVerdict(courier);
for (const [what, part, budget] of [
  ['honest presses refused', verdict.honest, sb.BUDGET.honestRefused],
  ["the naive faker's lies accepted", verdict.naive, sb.BUDGET.naiveAccepted],
])
  console.log(
    `  ${part.pass ? 'PASS' : 'MISS'}  ${what}: ${percent(part.rate)}, at most ${percent(budget)} allowed`,
  );
// endregion: verdict
