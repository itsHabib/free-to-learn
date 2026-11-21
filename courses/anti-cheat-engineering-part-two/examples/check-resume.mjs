// Cases for the new application in lesson 12: resumeState in server/resume.mjs.
// node examples/check-resume.mjs PROJECT --help-used "what helped"
// Every run first copies your three server files (and report.md, when there is one) into a
// new folder under PROJECT/attempts/, then runs the files in PROJECT, and saves its results
// beside the copies. The
// expected states come from the supplied server (public/runtime.mjs) running your own
// admission and recorder, so this checker holds no resumeState of its own.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLobServer } from '../public/runtime.mjs';
import { playSession } from '../public/sim.mjs';
import { link } from '../public/net.mjs';
import { fullView } from '../public/full-view.mjs';
import { makePlayer, PLAYER_KINDS } from '../public/players.mjs';
import { mixSeed } from '../public/stats.mjs';

const [folder, flag, help] = process.argv.slice(2);
if (!folder || flag !== '--help-used' || !help || process.argv.length !== 5)
  throw Error(
    'Usage: node examples/check-resume.mjs PROJECT --help-used "what helped"',
  );
const project = resolve(folder);
const identity = JSON.parse(
  readFileSync(join(project, 'PROJECT.json'), 'utf8'),
);
if (identity.course !== 'anti-cheat-engineering-part-two')
  throw Error(`${folder} is not a project of this course`);

const files = [
  'server/admission.mjs',
  'server/recorder.mjs',
  'server/resume.mjs',
];
const attempt = join(
  project,
  'attempts',
  `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}-resume`,
);
mkdirSync(join(attempt, 'server'), { recursive: true });
for (const file of [...files, 'report.md'])
  if (existsSync(join(project, file)))
    writeFileSync(join(attempt, file), readFileSync(join(project, file)));
function saveReceipt(fields) {
  writeFileSync(
    join(attempt, 'resume-receipt.json'),
    JSON.stringify(
      {
        course: identity.course,
        unit12_start_route: identity.unit12_start_route ?? 'not recorded',
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
for (const file of files) {
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
const admission = loaded['server/admission.mjs'];
const { createRecorder, replay } = loaded['server/recorder.mjs'];
const { resumeState } = loaded['server/resume.mjs'];

// A server with one session, driven message by message.
function scripted(seed) {
  const server = createLobServer({
    seed,
    admission,
    view: fullView,
    recorder: createRecorder,
  });
  const token = server.join();
  let seq = 0;
  return {
    send: (angle, power, fire) =>
      server.receive(
        token,
        JSON.stringify({ v: 1, seq: ++seq, angle, power, fire }),
      ),
    run: (ticks) => {
      for (let i = 0; i < ticks; i++) server.tick();
    },
    cut: () => ({
      record: server.record(token),
      state: { ...server.session(token).state },
    }),
  };
}

const cases = {
  'no message admitted yet': () => {
    const s = scripted(5);
    s.run(10);
    return s.cut();
  },
  'round 1 runs out unshot, round 2 has a shot, round 3 an aim': () => {
    const s = scripted(6);
    s.send(40, 60, false);
    s.run(205);
    s.send(45, 70, true);
    s.run(150);
    s.send(50, 55, false);
    s.run(5);
    return s.cut();
  },
  'cut while the shell is in the air': () => {
    const s = scripted(7);
    s.send(50, 65, true);
    s.run(8);
    return s.cut();
  },
  "a whole session of the expert, the record command's defaults": () => {
    const seed = 1;
    const server = createLobServer({
      seed,
      admission,
      view: fullView,
      recorder: createRecorder,
    });
    const net = PLAYER_KINDS.expert.network;
    const result = playSession({
      server,
      client: makePlayer('expert', mixSeed(seed, 2)),
      up: link({ seed: mixSeed(seed, 3), ...net }),
      down: link({ seed: mixSeed(seed, 4), ...net }),
    });
    return {
      record: server.record(result.token),
      state: { ...server.session(result.token).state },
    };
  },
};

const results = [];
function report(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${name}${detail ? `\n     ${detail}` : ''}`,
  );
}
function attemptCase(name, run) {
  try {
    run();
  } catch (error) {
    report(name, false, `threw: ${error.message}`);
  }
}
const show = (value) => JSON.stringify(value);
// Records are JSON, so a JSON round trip copies one completely.
const copy = (value) => JSON.parse(JSON.stringify(value));

let swapped = null;
for (const [name, make] of Object.entries(cases)) {
  attemptCase(name, () => {
    const { record, state } = make();
    if (name.startsWith('round 1')) swapped = copy(record);
    const checked = replay(copy(record), admission);
    if (!checked.ok)
      return report(
        name,
        false,
        `your replay refuses this genuine record (${show(checked)}); make unit 12 pass first`,
      );
    const yours = resumeState(copy(record), admission);
    const required = { ok: true, state };
    report(
      name,
      isDeepStrictEqual(yours, required),
      isDeepStrictEqual(yours, required)
        ? ''
        : `yours ${show(yours)}, required ${show(required)} (the server's state when the record was finished)`,
    );
  });
}

attemptCase('a record whose seqs do not go up', () => {
  if (!swapped) throw Error('the case it is built from did not run');
  [swapped.inputs[0].seq, swapped.inputs[1].seq] = [
    swapped.inputs[1].seq,
    swapped.inputs[0].seq,
  ];
  const required = replay(copy(swapped), admission);
  const yours = resumeState(copy(swapped), admission);
  report(
    'a record whose seqs do not go up',
    isDeepStrictEqual(yours, required),
    isDeepStrictEqual(yours, required)
      ? ''
      : `yours ${show(yours)}, required what your replay returns, ${show(required)}`,
  );
});

const passed = results.filter((r) => r.pass).length;
saveReceipt({ results });
console.log(`${passed} of ${results.length} cases pass.`);
console.log(saved());
process.exitCode = passed === results.length ? 0 : 1;
