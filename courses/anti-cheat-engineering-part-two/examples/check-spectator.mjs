// Cases for the new application in lesson 13: spectatorView in server/spectator.mjs.
// node examples/check-spectator.mjs PROJECT --help-used "what helped"
// Every run first copies your view, leaks and spectator files (and report.md, when there
// is one) into a new folder under PROJECT/attempts/, then runs the files in PROJECT, and
// saves its results beside the copies; node lab.mjs status PROJECT lists each run. The
// cases change the game on a copy and watch your message, so this checker holds no
// spectatorView of its own.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLobSession } from '../public/session.mjs';
import { KEYS } from '../public/rules.mjs';

const [folder, flag, help] = process.argv.slice(2);
if (!folder || flag !== '--help-used' || !help || process.argv.length !== 5) {
  console.error(
    'Usage: node examples/check-spectator.mjs PROJECT --help-used "what helped"',
  );
  process.exit(2);
}
const project = resolve(folder);
let identity = null;
try {
  identity = JSON.parse(readFileSync(join(project, 'PROJECT.json'), 'utf8'));
} catch {
  // reported just below
}
if (identity?.course !== 'anti-cheat-engineering-part-two') {
  console.error(`${folder} is not a project of this course.`);
  process.exit(2);
}

const files = [
  'server/view.mjs',
  'server/leaks.mjs',
  'server/spectator.mjs',
  'report.md',
];
const attempt = join(
  project,
  'attempts',
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-spectator`,
);
mkdirSync(join(attempt, 'server'), { recursive: true });
for (const file of files)
  if (existsSync(join(project, file)))
    writeFileSync(join(attempt, file), readFileSync(join(project, file)));
function saveReceipt(fields) {
  writeFileSync(
    join(attempt, 'spectator-receipt.json'),
    JSON.stringify(
      {
        course: identity.course,
        unit13_start_route: identity.unit13_start_route ?? 'not recorded',
        help_used: help,
        ...fields,
        at: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
}
const saved = () =>
  `Saved this attempt in ${relative(process.cwd(), attempt) || '.'}.`;

// A file that cannot be loaded (it throws as it loads, or imports something that is not
// there) is a failed attempt like any other: it is saved with a receipt that status lists.
const loaded = {};
for (const file of ['server/view.mjs', 'server/spectator.mjs']) {
  try {
    loaded[file] = await import(pathToFileURL(join(project, file)).href);
  } catch (error) {
    const reason = String(error?.message ?? error).split('\n')[0];
    saveReceipt({ results: [], load_error: { file, reason } });
    console.log(`${file} could not be loaded, so no case ran: ${reason}`);
    console.log('0 cases pass.');
    console.log(saved());
    process.exitCode = 1;
    await new Promise((done) => process.stdout.write('', done));
    process.exit();
  }
}
const { drawnView } = loaded['server/view.mjs'];
const { spectatorView } = loaded['server/spectator.mjs'];

// Every 3rd tick of a scripted session of two rounds: aiming, a shot, its flight, the
// result, the next round's aiming and shot. Each moment is a copy of the game.
function moments(seed) {
  const session = createLobSession({ seed });
  const out = [];
  let seq = 0;
  const send = (angle, power, fire) =>
    session.apply({ v: 1, seq: ++seq, angle, power, fire });
  for (let tick = 0; tick < 260; tick++) {
    if (tick === 6) send(50, 40, false);
    if (tick === 12) send(52, 45, true);
    if (
      session.round === 2 &&
      session.facts().fired === false &&
      tick % 20 === 0
    )
      send(40 + (tick % 7), 60, tick % 40 === 0);
    if (tick % 3 === 0)
      out.push({
        game: session.game.clone(),
        info: { tick: session.tick, ack: seq },
      });
    session.step();
  }
  return out;
}

const results = [];
function report(name, problem) {
  results.push({ name, pass: !problem, detail: problem ?? '' });
  console.log(
    `${problem ? 'FAIL' : 'PASS'} ${name}${problem ? `\n     ${problem}` : ''}`,
  );
}
function attemptCase(name, run) {
  try {
    report(name, run());
  } catch (error) {
    report(name, `threw: ${error.message}`);
  }
}

const all = [...moments(31), ...moments(32)];
const at = ({ game, info }) =>
  `tick ${info.tick}, round ${game.round()}, ${game.flying() ? 'shell in the air' : 'no shell in the air'}`;
const AIM = ['RIGHT', 'LEFT', 'UP', 'DOWN'];

attemptCase('the same moment always gives the same bytes', () => {
  for (const m of all)
    if (
      JSON.stringify(spectatorView(m.game, m.info)) !==
      JSON.stringify(spectatorView(m.game.clone(), m.info))
    )
      return `two calls at ${at(m)} gave different bytes`;
});

attemptCase('every field but angle and power equals your drawnView', () => {
  for (const m of all) {
    const yours = spectatorView(m.game, m.info);
    const drawn = drawnView(m.game, m.info);
    const want = Object.keys(drawn);
    if (JSON.stringify(Object.keys(yours)) !== JSON.stringify(want))
      return `at ${at(m)} your fields are ${Object.keys(yours).join(', ')}; your drawnView's are ${want.join(', ')}`;
    for (const key of want) {
      if (key === 'angle' || key === 'power') continue;
      if (JSON.stringify(yours[key]) !== JSON.stringify(drawn[key]))
        return `at ${at(m)} ${key} is ${JSON.stringify(yours[key])}; your drawnView has ${JSON.stringify(drawn[key])}`;
    }
  }
});

attemptCase('while the shell is in the air, the aim is the shot', () => {
  const flying = all.filter((m) => m.game.flying());
  if (!flying.length) return 'the script had no moment with a shell in the air';
  for (const m of flying) {
    const yours = spectatorView(m.game, m.info);
    const want = [Math.round(m.game.angle()), m.game.power()];
    if (yours.angle !== want[0] || yours.power !== want[1])
      return `at ${at(m)} angle ${yours.angle} and power ${yours.power}; the shot was angle ${want[0]}, power ${want[1]}`;
  }
});

attemptCase('at every other moment, angle and power are both null', () => {
  const still = all.filter((m) => !m.game.flying());
  if (!still.length)
    return 'the script had no moment without a shell in the air';
  const show = (value) => JSON.stringify(value) ?? String(value);
  for (const m of still) {
    const yours = spectatorView(m.game, m.info);
    if (yours.angle !== null || yours.power !== null)
      return `at ${at(m)}, angle is ${show(yours.angle)} and power is ${show(yours.power)}; with no shell in the air both must be null`;
  }
});

attemptCase(
  'at every other moment, a change of aim never reaches the message',
  () => {
    const still = all.filter((m) => !m.game.flying());
    for (const m of still) {
      const before = JSON.stringify(spectatorView(m.game, m.info));
      for (const key of AIM)
        for (let presses = 1; presses <= 3; presses++) {
          const copy = m.game.clone();
          for (let i = 0; i < presses; i++) copy.key(KEYS[key]);
          if (JSON.stringify(spectatorView(copy, m.info)) !== before)
            return `at ${at(m)}, ${presses} press${presses > 1 ? 'es' : ''} of ${key} changed your message`;
        }
    }
  },
);

attemptCase('no hidden thing reaches the message', () => {
  for (const m of all) {
    const before = JSON.stringify(spectatorView(m.game, m.info));
    for (const name of m.game.hidden)
      for (let k = 1; k <= 3; k++) {
        const copy = m.game.clone();
        if (
          copy.setHidden(name, k) &&
          JSON.stringify(spectatorView(copy, m.info)) !== before
        )
          return `at ${at(m)}, setHidden('${name}', ${k}) changed your message`;
      }
  }
});

const passed = results.filter((r) => r.pass).length;
saveReceipt({ results });
console.log(`${passed} of ${results.length} cases pass.`);
console.log(saved());
process.exitCode = passed === results.length ? 0 : 1;
