#!/usr/bin/env node
// Frame Perfect: the course's command-line tool. Node 22 or newer, no packages, offline.
// It never overwrites a file of yours: it creates files that do not exist yet, and appends to tas.mjs.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join, dirname, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { VERSIONS } from './game/core.mjs';
import { levelNames, loadLevel, levelText } from './game/levels.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8'));
const sha = (text) => createHash('sha256').update(text).digest('hex');

const TAS_HEADER = `// Your toolkit. Each module adds a region; the checks import its exports.
import { newState, step, hash, ADDR, RAM_SIZE, INPUTS, L, R, J, TILE, W } from '../game/core.mjs';
`;
const PROJECT_FILE = 'PROJECT.json';
const CHECKS_FILE = '.checks.json';
const DEFAULT_PORT = 4390;
// Module 3's movie: frame-optimal on level 1 for build 1 (game 1.0), 109 frames. Bit 1 left, bit 2 right, bit 4 jump.
const LEVEL1_MOVIE = '2222224444440444444044404444444044444404444440444044444440444444444444444444444462404040404040404444444444524';
const GIT_ID = ['-c', 'user.name=Frame Perfect lab', '-c', 'user.email=lab@frame-perfect.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=.git/hooks'];

const HELP = {
  main: `Frame Perfect: course commands

  node lab.mjs start ./work                   create your work folder
  node lab.mjs lesson 01 ./work               lesson 01 in this terminal, its newest open part
  node lab.mjs question ID ./work             the next question of practice item ID
  node lab.mjs answer ID ANSWER ./work        commit an answer to that question and see the verdict
  node lab.mjs route 01 write ./work          add module 01's code to tas.mjs: write, supplied or ai
  node lab.mjs recover 01 ./work [ROUTE]      a fresh copy of module 01's code in work/recovery/
  node lab.mjs check 01 ./work                run module 01's checks on your tas.mjs (01 to 07, or all)
  node lab.mjs status ./work                  routes, check results and practice answers so far
  node lab.mjs levels                         the levels and their par times
  node lab.mjs play LEVEL MOVIE               replay a movie on the untouched game
  node lab.mjs view [MOVIE] ./work            watch a movie frame by frame in your browser
  node lab.mjs serve ./work                   the movie player, to record movies in your browser
  node lab.mjs bisect ./work                  module 3: a git repository of eight game builds
  node lab.mjs capstone ./work                judge your level 3 movie

Add --help after any command for its details.`,
  start: `node lab.mjs start ./work

Creates the folder, which must not exist yet, directly inside the course folder:
  tas.mjs        your toolkit; it starts with only the imports from the game
  movies/        your movie files
  notes/         your written notes
  PROJECT.json   the lab's record: when you started and the route you chose for each module`,
  route: `node lab.mjs route NN write|supplied|ai ./work

Adds module NN's code to the end of work/tas.mjs, between "// region: NAME" and
"// endregion: NAME" lines.
  write      the functions the lesson asks you to write arrive as holes that throw
             "not written yet"; everything else in the region arrives complete
  supplied   the whole region arrives complete, for you to read
  ai         nothing is added; the lab prints the module's contract for an AI tool to work from
A region that is already in tas.mjs is never changed: the lab says so and adds nothing.
The route you choose is recorded in PROJECT.json. The same checks judge every route.`,
  recover: `node lab.mjs recover NN ./work [write|supplied]

Writes a fresh copy of module NN's region to work/recovery/NAME.mjs, for when the region in
tas.mjs is past saving. tas.mjs is not touched: replace the region in it by hand. With no
route it uses the one recorded for the module (write if none was). An existing file in
work/recovery/ is never replaced.`,
  check: `node lab.mjs check NN ./work
node lab.mjs check all ./work

Runs the checks of module NN (01 to 07), or of every module, on your work/tas.mjs and
prints one line per check: ✓ for a pass, ✗ and the reason for a failure. Exits with 1 if
any check failed.`,
  status: `node lab.mjs status ./work [--answers]

For each module: the route you chose, whether its regions are in tas.mjs and the result
of its last check. Then the practice answers committed in this folder.
  --answers     also list every committed answer, right or wrong`,
  levels: `node lab.mjs levels

Lists Kettle's levels with their par times.`,
  play: `node lab.mjs play LEVEL MOVIE [--version 1.1]

Replays the movie file on the untouched game, from frame 0, and prints whether Kettle
reached the flag, on which frame, and the final hash. --version picks the game build
(1.0 unless you say).`,
  view: `node lab.mjs view [MOVIE] [--level NAME] [--version V] [--frame N] [--port P] ./work

Starts the movie player on this computer and prints its address. MOVIE is a file in
work/movies/. Without --level and --version the player uses the movie's own header.
--frame N opens the movie at frame N. Ctrl-C stops the server. Nothing opens by itself:
paste the address into a browser.`,
  serve: `node lab.mjs serve [--port P] ./work

Starts the movie player on this computer and prints its address. Movies you record in
the player are saved as new files in work/movies/. Ctrl-C stops the server.`,
  bisect: `node lab.mjs bisect ./work

Module 3. Creates work/bisect/, a git repository with eight builds of Kettle's core.mjs,
one commit each, oldest first. The first commit also holds level1.txt, level1.movie (a
movie made on build 1) and replay.mjs, which replays the movie and exits 0 if Kettle
reaches the flag and 1 if not. Then "git bisect run node replay.mjs" finds the first
build on which the movie stops working. Needs git; nothing else in the course does.`,
  capstone: `node lab.mjs capstone ./work

Judges your level 3 movie on the untouched game and prints the tier it reaches.`,
  lesson: `node lab.mjs lesson NN ./work [--part K [--whole] | --next | --all | --section "HEADING" [--whole]] [--sections]

Prints lesson NN as Markdown, one part at a time. A part ends at a practice item: the
next part opens once every question of that item has an answer in this work folder.
With no option it prints the newest open part. A part longer than 12,000 characters
prints only its first section; --next prints the next.
  --part K      print part K, if it is open
  --next        print the section after the one printed last for this lesson
  --whole       with no --section, print the whole part however long it is
  --all         print every open part, from the top of the lesson
  --section "HEADING"  print one section of an open part, by its heading
  --sections    print only the first line and the section headings
Each practice item is printed as the command that asks its questions.`,
  question: `node lab.mjs question ID ./work

Prints the next question of practice item ID that has no committed answer in this work
folder, and the kind of answer it wants.`,
  answer: `node lab.mjs answer ID ANSWER ./work

Commits ANSWER to the next unanswered question of practice item ID and prints the
verdict and the reason. A committed answer is saved in work/.practice.json and is never
replaced: commit only once you have settled on it. An answer that can't be read (a word
where a number is wanted) is not saved. Put a list of numbers in quotes:
node lab.mjs answer ID "1, 2, 3" ./work`,
};

// ---------- the work folder ----------

function requireWork(dir, typed = dir) {
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) throw new Error(`${typed} is not a folder. Create it with: node lab.mjs start ${typed}`);
  if (!existsSync(join(dir, PROJECT_FILE))) throw new Error(`${typed} was not created by "node lab.mjs start" (it has no ${PROJECT_FILE}). Point at your work folder, or create one with: node lab.mjs start ./work`);
}

function readProject(dir) {
  const file = join(dir, PROJECT_FILE);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} could not be read (${e.message}). Fix it or move it, then try again.`); }
}

function recordRoute(dir, nn, route) {
  const project = readProject(dir);
  project.routes = { ...(project.routes ?? {}), [nn]: route };
  project.history = [...(project.history ?? []), { module: nn, route, at: new Date().toISOString() }];
  writeFileSync(join(dir, PROJECT_FILE), JSON.stringify(project, null, 1) + '\n');
}

function start(dir, typed) {
  if (existsSync(dir)) throw new Error(`${typed} already exists, and the lab never writes over your files. Use it as it is, or choose a new folder name.`);
  if (dirname(dir) !== root) throw new Error(`the work folder must sit directly inside the course folder, because tas.mjs imports ../game/core.mjs. From the course folder, run: node lab.mjs start ./work`);
  mkdirSync(join(dir, 'movies'), { recursive: true });
  mkdirSync(join(dir, 'notes'));
  writeFileSync(join(dir, 'tas.mjs'), TAS_HEADER);
  const project = { course: config.id, version: config.version, format: 'frame-perfect-work-1', started: new Date().toISOString(), routes: {}, history: [] };
  writeFileSync(join(dir, PROJECT_FILE), JSON.stringify(project, null, 1) + '\n');
  console.log(`Created ${typed} with tas.mjs (only the imports so far), movies/, notes/ and ${PROJECT_FILE}.`);
  console.log(`Next: read lesson 01 with: node lab.mjs lesson 01 ${typed}`);
}

// ---------- routes ----------

const moduleId = (text) => {
  if (!/^\d{1,2}$/.test(String(text))) throw new Error(`"${text}" is not a module number. Use 01 to ${config.lessons.at(-1).id}`);
  return String(text).padStart(2, '0');
};

function lessonOf(nn) {
  const lesson = config.lessons.find((l) => l.id === nn);
  if (!lesson) throw new Error(`there is no module ${nn}. The modules are ${config.lessons.map((l) => l.id).join(', ')}`);
  return lesson;
}

const regionNames = (lesson) => (lesson.region ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const hasRegion = (text, name) => new RegExp(`^// region: ${name}\\s*$`, 'm').test(text);

function capstoneNote(lesson, typed) {
  return `Module ${lesson.id} is the capstone: it adds no code to tas.mjs. Read it with: node lab.mjs lesson ${lesson.id} ${typed}, and judge your movie with: node lab.mjs capstone ${typed}`;
}

// One region of a toolkit file, from the line "// region: NAME" to its matching "// endregion: NAME",
// both kept. Only that exact name opens and closes it; regions with other names inside it (one per
// function, say) are copied along as plain text. A region of the same name nested inside is counted,
// so the outer region ends at its own endregion line.
export function extractRegion(text, name) {
  const lines = text.split('\n');
  const opens = (l) => l.trimEnd() === `// region: ${name}`;
  const closes = (l) => l.trimEnd() === `// endregion: ${name}`;
  const start = lines.findIndex(opens);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    if (opens(lines[i])) depth++;
    if (closes(lines[i])) depth--;
    if (depth === 0) return lines.slice(start, i + 1).join('\n') + '\n';
  }
  throw new Error(`region ${name} has no closing line "// endregion: ${name}"`);
}

// The region with each named function's body replaced by one line that throws "not written yet". A
// function is a top-level "export function NAME(" line ending in "{", up to the next line that is
// exactly "}". The signature, the comments and every other line are kept.
export function withHoles(regionText, names) {
  const out = [];
  let inside = null;
  for (const line of regionText.split('\n')) {
    if (inside) {
      if (line === '}') { out.push(`  throw new Error('${inside}: not written yet');`, line); inside = null; }
      continue;
    }
    out.push(line);
    const m = line.match(/^export function (\w+)\(/);
    if (!m || !names.includes(m[1])) continue;
    if (!line.trimEnd().endsWith('{')) throw new Error(`the signature of ${m[1]} must fit on its "export function" line`);
    inside = m[1];
  }
  if (inside) throw new Error(`function ${inside} has no closing line "}"`);
  return out.join('\n');
}

// Region NAME as a route gives it: from examples/toolkit.mjs, whole for supplied, with holes for write.
export function routeText(route, name, writes = []) {
  const file = join(root, 'examples', 'toolkit.mjs');
  if (!existsSync(file)) throw new Error(`examples/toolkit.mjs is missing from this copy of the course, so the ${route} route cannot add region ${name}. Download the course again.`);
  const region = extractRegion(readFileSync(file, 'utf8'), name);
  if (region === null) throw new Error(`examples/toolkit.mjs has no region ${name}. Download the course again.`);
  return route === 'write' ? withHoles(region, writes) : region;
}

// The contract for module NN: its section of API.md, from "## Module N:" to the next "## ".
function contractOf(nn) {
  const lines = readFileSync(join(root, 'API.md'), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## Module ${Number(nn)}:`));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n').trim();
}

function routeAi(lesson, names, dir, typed) {
  const contract = contractOf(lesson.id);
  if (!contract) throw new Error(`API.md has no section "## Module ${Number(lesson.id)}:", so there is no contract to print`);
  recordRoute(dir, lesson.id, 'ai');
  console.log(`Route ai for module ${lesson.id}: nothing was added to tas.mjs, and the route is recorded in ${PROJECT_FILE}.`);
  console.log(`Give your AI tool the contract below, the top of work/tas.mjs and game/core.mjs. Its code goes at the end of tas.mjs, between ${names.map((n) => `"// region: ${n}" and "// endregion: ${n}"`).join(', then ')}, using only the imports already at the top.`);
  console.log('');
  console.log(contract);
  console.log('');
  console.log(`Then run: node lab.mjs check ${lesson.id} ${typed}`);
  console.log('The same checks judge this route as the write and supplied routes: a function passes or fails on what it does, not on who wrote it.');
}

function route(nn, which, dir, typed) {
  requireWork(dir, typed);
  const lesson = lessonOf(moduleId(nn));
  const names = regionNames(lesson);
  if (!names.length) { console.log(capstoneNote(lesson, typed)); return; }
  if (!['write', 'supplied', 'ai'].includes(which)) throw new Error(`the route is write, supplied or ai, not "${which}"`);
  if (which === 'ai') { routeAi(lesson, names, dir, typed); return; }
  const tasFile = join(dir, 'tas.mjs');
  if (!existsSync(tasFile)) throw new Error(`${join(typed, 'tas.mjs')} is missing. Put your toolkit file back (its first lines are the imports from ../game/core.mjs), then run this again.`);
  const tas = readFileSync(tasFile, 'utf8');
  const present = names.filter((n) => hasRegion(tas, n));
  if (present.length) {
    console.error(`${join(typed, 'tas.mjs')} already has region ${present.join(' and ')}. The lab never changes a region that is there, so nothing was added.`);
    console.error(`For a fresh copy of the module's code to compare or paste in by hand: node lab.mjs recover ${lesson.id} ${typed} ${which}`);
    process.exitCode = 1;
    return;
  }
  const text = names.map((n) => routeText(which, n, lesson.writes)).join('\n');
  appendFileSync(tasFile, (tas.endsWith('\n') ? '\n' : '\n\n') + text);
  recordRoute(dir, lesson.id, which);
  const regions = `region${names.length > 1 ? 's' : ''} ${names.join(', ')}`;
  if (which === 'write') {
    const holes = lesson.writes ?? [];
    console.log(`Added ${regions} to the end of ${join(typed, 'tas.mjs')} (write route). ${holes.join(' and ')} ${holes.length === 1 ? 'throws' : 'throw'} "not written yet" until you write ${holes.length === 1 ? 'it' : 'them'}; the rest is complete.`);
  } else {
    console.log(`Added ${regions} to the end of ${join(typed, 'tas.mjs')}, complete (supplied route). Read it there.`);
  }
  console.log(`Next: node lab.mjs check ${lesson.id} ${typed}`);
}

function recover(nn, dir, typed, which) {
  requireWork(dir, typed);
  const lesson = lessonOf(moduleId(nn));
  const names = regionNames(lesson);
  if (!names.length) { console.log(capstoneNote(lesson, typed)); return; }
  const recorded = readProject(dir).routes?.[lesson.id];
  const use = which ?? (['write', 'supplied'].includes(recorded) ? recorded : 'write');
  if (!['write', 'supplied'].includes(use)) throw new Error(`recover takes the route write or supplied, not "${use}"`);
  const targets = names.map((n) => ({ name: n, file: join(dir, 'recovery', `${n}.mjs`) }));
  const taken = targets.filter((t) => existsSync(t.file));
  if (taken.length) throw new Error(`${taken.map((t) => join(typed, 'recovery', `${t.name}.mjs`)).join(' and ')} already exist${taken.length > 1 ? '' : 's'}, and the lab never writes over your files. Move or rename ${taken.length > 1 ? 'them' : 'it'}, then run this again.`);
  mkdirSync(join(dir, 'recovery'), { recursive: true });
  for (const t of targets) writeFileSync(t.file, routeText(use, t.name, lesson.writes));
  for (const t of targets) console.log(`Wrote ${join(typed, 'recovery', `${t.name}.mjs`)}: region ${t.name} as the ${use} route gives it.`);
  const spans = names.map((n) => `"// region: ${n}" to "// endregion: ${n}"`).join(', and from ');
  console.log(`${join(typed, 'tas.mjs')} is unchanged. To use the fresh copy, replace the lines from ${spans} in tas.mjs with the file's text, by hand.`);
}

// ---------- checks, play, capstone ----------

// The checks and the judge live in checks/; they are loaded only by the commands that need them.
async function loadChecks(file) {
  const path = join(root, 'checks', file);
  if (!existsSync(path)) throw new Error(`this copy of the course has no checks/${file} yet, so this command cannot run. Download the course again.`);
  return import(pathToFileURL(path).href);
}

function saveCheck(dir, report) {
  const file = join(dir, CHECKS_FILE);
  let data = {};
  try { if (existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8')); } catch { data = {}; }
  const tas = existsSync(join(dir, 'tas.mjs')) ? sha(readFileSync(join(dir, 'tas.mjs'))) : null;
  const passed = report.results.filter((r) => r.pass).length;
  data[report.module] = { passed, total: report.results.length, at: new Date().toISOString(), tas };
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}

function printReport(report) {
  const lesson = config.lessons.find((l) => l.id === report.module);
  console.log(`Module ${report.module}${lesson ? `: ${lesson.title}` : ''}`);
  for (const r of report.results) console.log(r.pass ? `  ✓ ${r.title}` : `  ✗ ${r.title}: ${r.message}`);
  const passed = report.results.filter((r) => r.pass).length;
  console.log(`  ${passed} of ${report.results.length} checks pass.`);
  return passed === report.results.length;
}

// A note before the checks run when the module's code is not in tas.mjs and no route was chosen.
function missingRegionNote(dir, typed, nn) {
  const lesson = config.lessons.find((l) => l.id === nn);
  if (!lesson || !existsSync(join(dir, 'tas.mjs'))) return;
  const tas = readFileSync(join(dir, 'tas.mjs'), 'utf8');
  const missing = regionNames(lesson).filter((n) => !hasRegion(tas, n));
  if (!missing.length || readProject(dir).routes?.[nn]) return;
  console.log(`(tas.mjs has no region ${missing.join(', ')} yet. Add module ${nn}'s code first: node lab.mjs route ${nn} write ${typed})`);
}

async function check(target, dir, typed) {
  requireWork(dir, typed);
  const { MODULES, runModule } = await loadChecks('run.mjs');
  const modules = target === 'all' ? MODULES : [moduleId(target)];
  const unknown = modules.filter((m) => !MODULES.includes(m));
  if (unknown.length) throw new Error(`module ${unknown[0]} has no checks. Check one of ${MODULES.join(', ')}, or all`);
  let passing = 0;
  for (const m of modules) {
    if (modules.length === 1) missingRegionNote(dir, typed, m);
    const report = await runModule(dir, m);
    saveCheck(dir, report);
    if (printReport(report)) passing++;
    if (modules.length > 1) console.log('');
  }
  process.exitCode = passing === modules.length ? 0 : 1;
  if (modules.length > 1) {
    console.log(passing === modules.length ? `All ${modules.length} modules pass.` : `${passing} of ${modules.length} modules pass. Fix the first ✗ above, then check that module again.`);
    return;
  }
  const at = config.lessons.findIndex((l) => l.id === modules[0]);
  const following = config.lessons[at + 1];
  if (passing) console.log(following ? `Module ${modules[0]} passes. Next: node lab.mjs lesson ${following.id} ${typed}` : `Module ${modules[0]} passes.`);
  else console.log(`Fix the first ✗ above (in your toolkit, a movie or a notes file, as its message says), then run: node lab.mjs check ${modules[0]} ${typed}`);
}

function requireLevel(name) {
  if (!levelNames().includes(name)) throw new Error(`there is no level "${name}". The levels are ${levelNames().join(', ')}; "node lab.mjs levels" lists them with their par times`);
}

function requireVersion(version) {
  if (!VERSIONS.includes(version)) throw new Error(`there is no game version "${version}". The versions are ${VERSIONS.join(' and ')}`);
}

// The header of a movie file, read leniently: key: value lines before "inputs:".
function movieHeader(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const end = lines.indexOf('inputs:');
  const header = {};
  for (const line of lines.slice(0, end < 0 ? lines.length : end)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) header[m[1]] = m[2].trim();
  }
  return header;
}

const hex = (h) => (typeof h === 'number' ? h.toString(16).padStart(8, '0') : String(h));

async function play(level, moviePath, typedMovie, versionFlag) {
  requireLevel(level);
  const version = versionFlag ?? '1.0';
  requireVersion(version);
  if (!existsSync(moviePath)) throw new Error(`there is no movie file ${typedMovie}. Movies usually live in work/movies/`);
  const { readMovieFile, replay } = await loadChecks('judge.mjs');
  const movie = await readMovieFile(moviePath);
  const r = await replay(level, movie.inputs, version);
  const { par } = loadLevel(level);
  console.log(`${typedMovie} on ${level}, game ${version}: ${movie.inputs.length} frames of input.`);
  if (r.finished) {
    const against = par === null ? '' : r.frame < par ? `, ${par - r.frame} under par (${par})` : r.frame === par ? ', exactly par' : `, ${r.frame - par} over par (${par})`;
    // The flag writes 1 into the level-complete byte (0x12); anything else got there another way.
    const doneByte = r.state.ram[0x12];
    const how = doneByte === 1 ? 'Kettle reached the flag' : `The level was completed without the flag (the level-complete byte at 0x12 holds ${doneByte}, not the 1 the flag writes)`;
    console.log(`${how} on frame ${r.frame}${against}.`);
  } else if (r.dead) {
    console.log(`Kettle died after ${r.frames} frames, without reaching the flag.`);
  } else {
    console.log(`Kettle did not reach the flag in the ${r.frames} frames played.`);
  }
  console.log(`Final hash: ${hex(r.hash)}`);
  const recorded = movie.header?.game ?? movieHeader(readFileSync(moviePath, 'utf8')).game;
  if (recorded && recorded !== version && !versionFlag) console.log(`The movie's header says game ${recorded}. To replay it on that build: node lab.mjs play ${level} ${typedMovie} --version ${recorded}`);
}

async function capstone(dir, typed) {
  requireWork(dir, typed);
  if (!existsSync(join(dir, 'movies', 'level3.movie'))) throw new Error(`there is no ${join(typed, 'movies', 'level3.movie')} yet. The capstone judges that file: save your level 3 movie there, then run this again`);
  const judge = await loadChecks('judge.mjs');
  const r = await judge.capstone(dir);
  console.log(r.message);
  console.log(`Tier: ${r.tier ?? 'none yet'}${r.frame ? `, finishing on frame ${r.frame}` : ''}.`);
}

function levels() {
  for (const name of levelNames()) {
    const level = loadLevel(name);
    console.log(`${name.padEnd(8)} ${level.name.padEnd(16)} ${level.par === null ? 'no par' : `par ${level.par}`}`);
  }
}

// ---------- the movie player ----------

// The movie as the player names it, work/movies/NAME.movie. The file must be in work/movies/.
function movieForView(arg, dir) {
  const candidates = [resolve(arg), join(dir, 'movies', arg), join(dir, 'movies', `${arg}.movie`)];
  const file = candidates.find((p) => existsSync(p) && lstatSync(p).isFile());
  if (!file) throw new Error(`there is no movie "${arg}". The player shows movies saved in work/movies/`);
  const name = basename(file);
  if (dirname(file) !== join(dir, 'movies') || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\.movie$/.test(name)) {
    throw new Error(`the player shows only files in work/movies/ named with letters, digits, dashes and underscores and ending in .movie. Copy the movie there under such a name, then run this again`);
  }
  return { file, served: `work/movies/${name}` };
}

async function runServer(dir, params, port) {
  const { startServer, viewUrl } = await import(pathToFileURL(join(root, 'serve.mjs')).href);
  let server;
  try {
    server = await startServer({ course: root, work: dir, port });
  } catch (e) {
    if (e.code === 'EADDRINUSE') throw new Error(`port ${port} is in use by another program. Stop it, or pick another port with --port, for example --port ${port + 1}`);
    throw e;
  }
  console.log(`The player: ${viewUrl(server.url, params)}`);
  console.log('Paste that address into a browser on this computer. Only this computer can connect. Ctrl-C stops the server.');
  process.once('SIGINT', async () => {
    await server.close();
    console.log('\nThe server has stopped.');
    process.exit(0);
  });
}

async function view(movieArg, dir, typed, flags) {
  requireWork(dir, typed);
  const params = { level: flags.level, version: flags.version, frame: flags.frame };
  if (movieArg !== undefined) {
    const movie = movieForView(movieArg, dir);
    const header = movieHeader(readFileSync(movie.file, 'utf8'));
    params.movie = movie.served;
    params.level ??= header.level;
    params.version ??= header.game;
  }
  if (params.level !== undefined) requireLevel(params.level);
  if (params.version !== undefined) requireVersion(params.version);
  await runServer(dir, params, flags.port ?? DEFAULT_PORT);
}

async function serve(dir, typed, flags) {
  requireWork(dir, typed);
  await runServer(dir, {}, flags.port ?? DEFAULT_PORT);
}

// ---------- module 3: the bisect repository ----------

// The eight builds' core.mjs texts, from game/builds.json applied in order to game/core.mjs.
function buildTexts() {
  const builds = JSON.parse(readFileSync(join(root, 'game', 'builds.json'), 'utf8'));
  if (!Array.isArray(builds) || builds.length !== 8) throw new Error('game/builds.json must list eight builds. Download the course again');
  let text = readFileSync(join(root, 'game', 'core.mjs'), 'utf8');
  return builds.map((b) => {
    b.edits.forEach((edit, k) => {
      const count = text.split(edit.find).length - 1;
      if (count !== 1) throw new Error(`game/builds.json, ${b.name}, edit ${k + 1}: the text to find occurs ${count} times in the build before it, and it must occur exactly once`);
      text = text.replace(edit.find, () => edit.replace);
    });
    return { name: b.name, message: b.message, text };
  });
}

function movieText(digits, level, game) {
  const line = (d) => `|${d & 1 ? 'L' : '.'}${d & 2 ? 'R' : '.'}${d & 4 ? 'J' : '.'}|`;
  return ['# Frame Perfect movie', `game: ${game}`, `level: ${level}`, 'rerecords: 0', 'inputs:', ...[...digits].map((c) => line(Number(c))), ''].join('\n');
}

const REPLAY_SCRIPT = `// Replays level1.movie with this commit's core.mjs and exits with 0 if Kettle reaches the flag, 1 if not.
// git bisect run reads that exit code: 0 marks the commit good, 1 marks it bad.
import { readFileSync } from 'node:fs';
import { newState, step, parseLevel, ADDR } from './core.mjs';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const level = parseLevel(read('./level1.txt'));
const lines = read('./level1.movie').replace(/\\r/g, '').split('\\n');
const inputs = lines.slice(lines.indexOf('inputs:') + 1).filter((l) => l.trim())
  .map((l) => (l[1] === 'L' ? 1 : 0) | (l[2] === 'R' ? 2 : 0) | (l[3] === 'J' ? 4 : 0));

const state = newState(level);
for (let frame = 1; frame <= inputs.length; frame++) {
  step(state, inputs[frame - 1]);
  if (state.ram[ADDR.DONE]) {
    console.log(\`reached the flag on frame \${frame}\`);
    process.exit(0);
  }
  if (state.ram[ADDR.DEAD]) break;
}
console.log(state.ram[ADDR.DEAD] ? 'Kettle died before the flag' : 'the movie ended before the flag');
process.exit(1);
`;

// Replays the movie on one build's text, imported as a module of its own.
async function replayOnBuild(text, level, inputs) {
  const core = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
  const state = core.newState(core.parseLevel(level));
  let frame = null;
  for (let i = 0; i < inputs.length && frame === null; i++) {
    core.step(state, inputs[i]);
    if (state.ram[core.ADDR.DONE]) frame = i + 1;
  }
  return { frame, hash: core.hash(state) };
}

// The builds must behave as module 3 says: builds 1 to 4 finish level 1 with the same final hash,
// builds 5 to 8 do not finish and agree with each other. Returns the problems, as sentences.
export async function verifyBuilds(builds) {
  const level = levelText('level1');
  const inputs = [...LEVEL1_MOVIE].map(Number);
  const runs = [];
  for (const b of builds) runs.push(await replayOnBuild(b.text, level, inputs));
  const problems = [];
  if (runs[0].frame !== 109) problems.push(`build 1 should finish level 1 on frame 109, and it ${runs[0].frame ? `finished on frame ${runs[0].frame}` : 'did not finish'}`);
  if (runs[4].frame !== null) problems.push(`build 5 should not finish level 1, and it finished on frame ${runs[4].frame}`);
  runs.forEach((r, i) => {
    const same = i < 4 ? runs[0] : runs[4];
    if (i !== 0 && i !== 4 && (r.frame !== same.frame || r.hash !== same.hash)) problems.push(`build ${i + 1} should replay exactly as build ${i < 4 ? 1 : 5} does, and it does not`);
  });
  return problems;
}

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error) throw new Error(`git could not run (${r.error.message})`);
  if (r.status !== 0) throw new Error(`git ${args.filter((a) => !a.includes('=')).join(' ')} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

async function bisect(dir, typed) {
  requireWork(dir, typed);
  const out = join(dir, 'bisect');
  const shown = join(typed, 'bisect');
  if (existsSync(out)) throw new Error(`${shown} already exists, and the lab never writes over your files. Use it as it is, or move it aside and run this again.`);
  const builds = buildTexts();
  const problems = await verifyBuilds(builds);
  if (problems.length) throw new Error(`the game builds in game/builds.json do not behave as module 3 needs: ${problems.join('; ')}. Download the course again`);
  const found = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (found.error || found.status !== 0) throw new Error('git is not installed, or could not run, on this computer. Module 3\'s bisect step needs it; nothing else in the course does. Install git (https://git-scm.com), then run this again.');
  mkdirSync(out);
  git(out, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  writeFileSync(join(out, 'level1.txt'), levelText('level1'));
  writeFileSync(join(out, 'level1.movie'), movieText(LEVEL1_MOVIE, 'level1', '1.0'));
  writeFileSync(join(out, 'replay.mjs'), REPLAY_SCRIPT);
  for (const b of builds) {
    writeFileSync(join(out, 'core.mjs'), b.text);
    git(out, ['add', '-A']);
    git(out, [...GIT_ID, 'commit', '-q', '-m', b.message]);
  }
  console.log(`Made ${shown}: a git repository with ${builds.length} commits, one per build of Kettle's core.mjs, oldest first.`);
  console.log('level1.movie reaches the flag on the first build. replay.mjs replays it with the core.mjs of whichever commit is checked out, and exits with 0 if Kettle reaches the flag and 1 if not.');
  console.log('Let git find the first build on which the movie stops working:');
  console.log(`  git -C ${shown} bisect start`);
  console.log(`  git -C ${shown} bisect bad              # the newest build: the movie fails`);
  console.log(`  git -C ${shown} bisect good HEAD~7      # the first build: the movie works`);
  console.log(`  git -C ${shown} bisect run node replay.mjs`);
  console.log(`  git -C ${shown} bisect reset            # back to the newest build when you are done`);
  console.log(`(Or cd ${shown} and run the same commands without -C ${shown}.)`);
}

// ---------- practice in the terminal ----------
// Commits are kept in work/.practice.json. An item's answer and feedback are printed only in the
// reply to a commit of that question. A committed answer is never replaced.

const PRACTICE_FILE = '.practice.json';
const practiceKey = (id, v) => `${id}:${v}`;
// A question's version: a hash of its prompt and of what counts as right, so an edited question is a new
// question, and the answer to the old wording stays on record as it was.
const questionVersion = (it) => sha(JSON.stringify({ prompt: it.prompt, answer: it.answer, anyOrder: it.anyOrder ?? false, round: it.round ?? false, wrong: (it.wrong ?? []).map((w) => w.answer) })).slice(0, 16);

function commitFor(commits, id, v, it) {
  const version = questionVersion(it);
  const first = commits[practiceKey(id, v)];
  if (first && (first.version === undefined || first.version === version)) return first;
  return commits[`${practiceKey(id, v)}@${version}`] ?? null;
}
function olderCommit(commits, id, v, it) {
  const first = commits[practiceKey(id, v)];
  return first && first.version !== undefined && first.version !== questionVersion(it) ? first : null;
}

function readCommits(dir) {
  const file = join(dir, PRACTICE_FILE);
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')).answers ?? {}; } catch (e) { throw new Error(`${file} could not be read (${e.message}). Your committed answers are in it; fix or move it, then try again.`); }
}

function saveCommit(dir, key, record) {
  const file = join(dir, PRACTICE_FILE);
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { course: config.id, format: 'frame-perfect-answers-1' };
  const answers = data.answers ?? {};
  // An answer to an older wording keeps its key; the answer to the current one goes beside it.
  const at = answers[key] ? `${key}@${record.version}` : key;
  if (answers[at]) throw new Error(`${key} already has a committed answer, and it is kept`);
  answers[at] = record;
  writeFileSync(file, JSON.stringify({ ...data, answers }, null, 1) + '\n');
}

async function practiceData() {
  const web = await import('./web.mjs');
  return { web, practice: await web.loadPractice() };
}

function itemOf(practice, id) {
  const items = practice[id];
  if (!items) throw new Error(`there is no practice item ${id}. The lessons name each one; "node lab.mjs lesson NN ./work" prints them as commands`);
  return items;
}

const nextOpen = (items, commits, id) => items.findIndex((it, v) => !commitFor(commits, id, v, it));
const fullyAnswered = (practice, commits, id) => nextOpen(practice[id] ?? [], commits, id) < 0;

// The practice ids of each lesson, in order: those course.json lists, then those its file names.
function lessonItems(web) {
  return config.lessons.map((l) => {
    const file = web.lessonFile(l.id);
    const named = file && existsSync(file) ? web.splitLesson(readFileSync(file, 'utf8')).filter((s) => s.gate).map((s) => s.gate) : [];
    return { lesson: l, ids: [...new Set([...(l.practice ?? []), ...named])] };
  });
}
const lessonOfItem = (web, id) => lessonItems(web).find((x) => x.ids.includes(id))?.lesson;

const olderNote = (id, v, typed) => `Your earlier answer to question ${v + 1} of ${id} was to an older wording of it. It is kept as it was in ${join(typed, PRACTICE_FILE)}, and the question as it is now has no answer yet.`;

function printQuestion(web, items, id, v, typed, commits = {}) {
  const it = items[v];
  const home = lessonOfItem(web, id);
  console.log(`${web.practiceKind(id)}: item ${id}${home ? ` (lesson ${home.id})` : ''}, question ${v + 1} of ${items.length}`);
  if (olderCommit(commits, id, v, it)) console.log(olderNote(id, v, typed));
  console.log('');
  console.log(it.prompt);
  console.log('');
  console.log(`Your answer: ${web.answerLabel(it.answer)}.`);
  console.log(`Commit it with: node lab.mjs answer ${id} ANSWER ${typed}`);
}

const doneLine = (id) => `Every question of ${id} is answered.`;

async function question(id, dir, typed) {
  requireWork(dir, typed);
  const { web, practice } = await practiceData();
  const items = itemOf(practice, id);
  const commits = readCommits(dir);
  const v = nextOpen(items, commits, id);
  if (v < 0) { console.log(doneLine(id)); return; }
  printQuestion(web, items, id, v, typed, commits);
}

async function answer(id, text, dir, typed) {
  requireWork(dir, typed);
  const { web, practice } = await practiceData();
  const items = itemOf(practice, id);
  const before = readCommits(dir);
  const v = nextOpen(items, before, id);
  if (v < 0) {
    console.error(`${doneLine(id)} Nothing was recorded: a committed answer is kept and not replaced. "node lab.mjs status ${typed} --answers" lists your answers.`);
    process.exitCode = 1;
    return;
  }
  const r = web.grade(practice, id, v, text);
  if (!r.ok) { console.error(r.hint); process.exitCode = 2; return; }
  const it = items[v];
  if (olderCommit(before, id, v, it)) console.log(olderNote(id, v, typed));
  saveCommit(dir, practiceKey(id, v), { answer: text, correct: r.correct, verdict: r.verdict, text: r.text, pointer: r.pointer, at: new Date().toISOString(), prompt: it.prompt, kind: web.answerLabel(it.answer), version: questionVersion(it) });
  console.log(`${r.correct ? '✓' : '✗'} ${r.text}`);
  if (r.pointer) {
    const read = `node lab.mjs lesson ${r.pointer.objective} ${typed} --section "${r.pointer.section}"`;
    console.log(r.pointer.opensAfter && !r.pointer.opensNow ? `Once every question of ${id} has an answer, read it with: ${read}` : `Read it with: ${read}`);
  }
  console.log(`Saved in ${join(typed, PRACTICE_FILE)}.`);
  const after = nextOpen(items, readCommits(dir), id);
  console.log('');
  if (after >= 0) { printQuestion(web, items, id, after, typed, readCommits(dir)); return; }
  console.log(doneLine(id));
  const home = lessonOfItem(web, id);
  if (home && splitLessonOf(web, home.id).some((s) => s.gate === id)) console.log(`The text after it is open: node lab.mjs lesson ${home.id} ${typed}`);
}

function splitLessonOf(web, nn) {
  const file = web.lessonFile(nn);
  if (!file) throw new Error(`there is no lesson ${nn}; the lessons are ${config.lessons.map((l) => l.id).join(', ')}`);
  if (!existsSync(file)) throw new Error(`lesson ${nn} is not in this copy of the course yet (${relative(root, file)} is missing)`);
  return web.splitLesson(readFileSync(file, 'utf8'));
}

const unentity = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// The headings of a lesson text, outside code blocks: [{ level, title, line }].
function headingsOf(lines) {
  const out = [];
  let fence = false;
  lines.forEach((line, n) => {
    if (line.startsWith('```')) fence = !fence;
    const h = !fence && line.match(/^(#{2,3}) (.*)$/);
    if (h) out.push({ level: h[1].length, title: h[2].trim(), line: n });
  });
  return out;
}
const sameHeading = (a, b) => a.replace(/[`*]/g, '').trim().toLowerCase() === b.replace(/[`*]/g, '').trim().toLowerCase();

// A part longer than this prints one section at a time, unless --whole asks for all of it.
const PART_LIMIT = 12000;
const READING_FILE = '.reading.json';
function readReading(dir) {
  const file = join(dir, READING_FILE);
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveReading(dir, nn, at) {
  if (!existsSync(dir)) return;
  writeFileSync(join(dir, READING_FILE), JSON.stringify({ ...readReading(dir), [nn]: at }) + '\n');
}

// The lesson text as printed: markers dropped, practice lines turned into the command that asks them.
function shownText(web, practice, commits, typed) {
  return (text) => text.split('\n').filter((line) => !web.exampleMarker(line)).map((line) => {
    const p = line.match(web.PRACTICE_LINE);
    if (p) {
      const n = practice[p[1]]?.length ?? 0;
      const older = (practice[p[1]] ?? []).some((it, v) => olderCommit(commits, p[1], v, it) && !commitFor(commits, p[1], v, it));
      const state = !practice[p[1]] ? 'missing from lessons/practice.mjs' : fullyAnswered(practice, commits, p[1]) ? 'answered' : `${n} question${n === 1 ? '' : 's'}${older ? ', an earlier answer was to an older wording' : ''}`;
      return `> ${web.practiceKind(p[1])} (${p[1]}, ${state}): node lab.mjs question ${p[1]} ${typed}`;
    }
    const f = line.match(/^\{\{figure:([a-z0-9-]+)\}\}$/);
    if (f) { const d = web.figureDesc(f[1]); return `> Figure (lessons/figures/${f[1]}.svg): ${d === null ? 'missing' : unentity(d)}`; }
    // A Markdown image of a figure, which GitHub draws: the terminal prints its alt text instead.
    const img = line.match(/^!\[([^\]]*)\]\(figures\/([a-z0-9-]+)\.svg\)$/);
    if (img) return `> Figure (lessons/figures/${img[2]}.svg): ${img[1]}`;
    return line;
  }).join('\n').replace(/^\s+|\s+$/g, '');
}

function printSection(ctx, section, whole) {
  const { nn, segments, open, total, cmd, noFolder, shown, closedNote } = ctx;
  const lines = [];
  segments.forEach((sg, k) => sg.text.split('\n').forEach((line) => lines.push({ k, line })));
  const heads = headingsOf(lines.map((x) => x.line));
  const h = heads.find((x) => sameHeading(x.title, section));
  if (!h) throw new Error(`lesson ${nn} has no section "${section}". Its open sections: ${heads.filter((x) => lines[x.line].k < open).map((x) => `"${x.title}"`).join(', ')}`);
  const k = lines[h.line].k;
  if (k >= open) throw new Error(`section "${h.title}" is in part ${k + 1} of lesson ${nn}, which is not open yet. ${closedNote()}`);
  const next = heads.find((x) => x.line > h.line && x.level <= h.level);
  let end = next ? next.line : lines.length;
  const firstClosed = lines.findIndex((x) => x.k >= open);
  let cut = firstClosed >= 0 && firstClosed < end;
  if (cut) end = firstClosed;
  // A section with subsections prints up to the first of them and lists them, unless --whole.
  const subs = heads.filter((x) => x.line > h.line && x.line < end && x.level > h.level);
  const brief = subs.length > 0 && !whole;
  if (brief) { end = subs[0].line; cut = false; }
  console.log(`${noFolder}Lesson ${nn}, section "${h.title}"${subs.length && whole ? ', with its subsections' : ''} (in part ${k + 1} of ${total}). The whole part: ${cmd} --part ${k + 1}`);
  console.log('');
  console.log(shown(lines.slice(h.line, end).map((x) => x.line).join('\n')));
  console.log('');
  if (brief) {
    console.log(`Its subsections, each printed with --section "HEADING":\n${subs.map((x) => `  - ${x.title}`).join('\n')}`);
    console.log(`The section and all its subsections: ${cmd} --section "${h.title}" --whole`);
    return;
  }
  console.log(cut ? closedNote() : `End of section "${h.title}".`);
}

async function lessonText(nn, dir, typed, { part, all, section, sections, whole, next } = {}) {
  // Reading needs no work folder yet: lesson 01 says how to make one. Answers need one.
  if (existsSync(dir)) requireWork(dir, typed);
  nn = moduleId(nn);
  const { web, practice } = await practiceData();
  const segments = splitLessonOf(web, nn);
  const commits = readCommits(dir);
  const shown = shownText(web, practice, commits, typed);
  const total = segments.length;
  let open = 1;
  while (open < total && fullyAnswered(practice, commits, segments[open].gate)) open++;
  const closedNote = () => {
    if (open >= total) return '';
    const gate = segments[open].gate;
    return `The lesson goes on once every question of ${gate} has a committed answer. Ask the next one with: node lab.mjs question ${gate} ${typed}`;
  };
  const endNote = () => {
    if (open < total) return closedNote();
    const last = [...segments.at(-1).text.matchAll(/^\{\{practice:([a-z0-9-]+)\}\}\s*$/gm)].map((m) => m[1]).filter((id) => !fullyAnswered(practice, commits, id));
    const at = config.lessons.findIndex((l) => l.id === nn), following = config.lessons[at + 1];
    const waiting = last.length ? ` Answer ${last.join(' and ')} before you go on: node lab.mjs question ${last[0]} ${typed}.` : '';
    return `That is the end of lesson ${nn}.${waiting}${following ? ` Next: node lab.mjs lesson ${following.id} ${typed}` : ''}`;
  };
  const cmd = `node lab.mjs lesson ${nn} ${typed}`;
  const noFolder = existsSync(dir) ? '' : `(${typed} does not exist yet. Lesson 01 says how to create it; answers need it.)\n`;
  if (section !== undefined) { printSection({ nn, segments, open, total, cmd, noFolder, shown, closedNote }, section, whole); return; }

  let chunk = 0;
  if (next) {
    if (all || part !== undefined || whole) throw new Error('--next takes no --part, --all, --section or --whole');
    const at = readReading(dir)[nn];
    if (at && Number.isInteger(at.part) && at.part >= 1 && at.part <= open) { part = at.part; chunk = at.next ?? 0; } else part = open;
  }
  let from = open - 1, to = open;
  if (all) from = 0;
  else if (part !== undefined) {
    if (!Number.isInteger(part) || part < 1 || part > total) throw new Error(`lesson ${nn} has parts 1 to ${total}`);
    if (part > open) throw new Error(`part ${part} of lesson ${nn} is not open yet. ${closedNote()}`);
    from = part - 1; to = part;
  }

  const text = segments.slice(from, to).map((sg) => sg.text).join('\n');
  // The part's sections. A part that begins inside a section names that section first.
  const before = segments.slice(0, from).map((sg) => sg.text).join('\n').split('\n');
  const carried = from > 0 ? headingsOf(before).filter((x) => x.level === 2).at(-1) : null;
  const heads = headingsOf(text.split('\n'));
  const startsInside = carried && !(heads[0] && text.split('\n').slice(0, heads[0].line).every((l) => !l.trim()));
  const list = [...(startsInside ? [`  - ${carried.title} (continued from the part before)`] : []), ...heads.map((x) => `${x.level === 3 ? '      - ' : '  - '}${x.title}`)];
  const which = all ? `parts 1 to ${open} of ${total}, every part open so far` : `part ${from + 1} of ${total}`;
  const others = [];
  if (!all && open > 1) others.push(`another open part with --part K (1 to ${open})`, 'every open part with --all');
  others.push('one section with --section "HEADING"');
  console.log(`${noFolder}Lesson ${nn}, ${which}. Print ${others.join(', ')}.`);
  if (list.length) console.log(`Its sections:\n${list.join('\n')}`);
  if (sections) {
    console.log('');
    console.log(`The text itself: ${cmd}${all ? ' --all' : part !== undefined ? ` --part ${part}` : ''}`);
    return;
  }
  const full = shown(text);
  const partNote = () => (to < open ? `Part ${to + 1} is open too: ${cmd} --part ${to + 1}` : endNote());
  if (all || whole || (!next && full.length <= PART_LIMIT)) {
    console.log('');
    console.log(full);
    console.log('');
    console.log(partNote());
    return;
  }
  // A long part prints one section at a time: the text before its first heading, then each section.
  const lines = text.split('\n');
  const starts = [0, ...heads.map((x) => x.line)].filter((n, i, a) => a.indexOf(n) === i);
  const pieces = starts.map((n, i) => lines.slice(n, starts[i + 1] ?? lines.length).join('\n')).filter((t) => shown(t));
  if (chunk >= pieces.length) {
    if (to < open) { saveReading(dir, nn, { part: to + 1, next: 0 }); console.log(`Part ${to} is read to its end. Part ${to + 1}: ${cmd} --next`); return; }
    console.log(endNote());
    return;
  }
  console.log(`This part is long, so it prints one section at a time: section ${chunk + 1} of ${pieces.length}.`);
  console.log('');
  console.log(shown(pieces[chunk]));
  console.log('');
  saveReading(dir, nn, { part: from + 1, next: chunk + 1 });
  if (chunk + 1 < pieces.length) console.log(`The next section: ${cmd} --next (or the whole part: ${cmd} --part ${from + 1} --whole)`);
  else console.log(`That is the last section of part ${from + 1}. ${partNote()}`);
}

async function practiceStatus(dir) {
  const commits = readCommits(dir);
  const { web, practice } = await practiceData();
  const ids = lessonItems(web).flatMap((x) => x.ids);
  const committed = [], waiting = [], older = [];
  for (const id of ids) {
    (practice[id] ?? []).forEach((it, v) => {
      const c = commitFor(commits, id, v, it);
      if (c) committed.push({ id, question: v + 1, correct: c.correct, answer: c.answer });
      const old = olderCommit(commits, id, v, it);
      if (old) older.push({ id, question: v + 1 });
    });
    if (!fullyAnswered(practice, commits, id)) waiting.push(id);
  }
  return { committed, waiting, older, items: ids.length, questions: ids.reduce((n, id) => n + (practice[id]?.length ?? 0), 0) };
}

function lastChecks(dir) {
  try { return existsSync(join(dir, CHECKS_FILE)) ? JSON.parse(readFileSync(join(dir, CHECKS_FILE), 'utf8')) : {}; } catch { return {}; }
}

async function status(dir, typed, { answers }) {
  requireWork(dir, typed);
  const project = readProject(dir);
  const tas = existsSync(join(dir, 'tas.mjs')) ? readFileSync(join(dir, 'tas.mjs'), 'utf8') : '';
  const tasHash = sha(tas);
  const checks = lastChecks(dir);
  for (const lesson of config.lessons) {
    const names = regionNames(lesson);
    if (!names.length) { console.log(`Module ${lesson.id} (${lesson.title}): the capstone. Judge it with: node lab.mjs capstone ${typed}`); continue; }
    const chosen = project.routes?.[lesson.id];
    const present = names.filter((n) => hasRegion(tas, n));
    const routeText = chosen ? `route ${chosen}` : 'no route chosen yet';
    const regionText = present.length === names.length ? 'its code is in tas.mjs' : present.length ? `tas.mjs has ${present.join(', ')} but not ${names.filter((n) => !present.includes(n)).join(', ')}` : 'its code is not in tas.mjs yet';
    const c = checks[lesson.id];
    const checkText = !c ? 'not checked yet' : `last check: ${c.passed} of ${c.total} pass${c.tas === tasHash ? '' : ' (tas.mjs has changed since)'}`;
    console.log(`Module ${lesson.id} (${lesson.title}): ${routeText}; ${regionText}; ${checkText}.`);
  }
  const prac = await practiceStatus(dir);
  console.log('');
  if (!prac.items) { console.log('Practice: the lessons in this copy ask no practice questions yet.'); return; }
  if (!prac.committed.length) console.log('Practice: no answers committed in this folder yet.');
  else {
    const right = prac.committed.filter((c) => c.correct).length;
    console.log(`Practice: ${prac.committed.length} of ${prac.questions} questions answered, ${right} of them right; ${prac.items - prac.waiting.length} of ${prac.items} items complete.${answers ? '' : ` Every answer: node lab.mjs status ${typed} --answers`}`);
    if (answers) for (const c of prac.committed) console.log(`  ${c.id} question ${c.question}: ${c.correct ? 'right' : 'wrong'}, answer ${JSON.stringify(c.answer)}`);
  }
  if (prac.older.length) console.log(`${prac.older.length} earlier answer${prac.older.length === 1 ? ' was' : 's were'} to an older wording of the question: ${prac.older.map((o) => `${o.id} question ${o.question}`).join(', ')}. They are kept as they were.`);
  console.log(prac.waiting.length ? `Still waiting for an answer: ${prac.waiting.join(', ')}. Ask the next question of one with: node lab.mjs question ID ${typed}` : 'Every practice question has a committed answer.');
}

// ---------- the command line ----------

const VALUED = ['--part', '--section', '--version', '--level', '--frame', '--port'];
const BOOLEAN = ['--all', '--sections', '--whole', '--next', '--answers', '--help', '-h'];

function parseArgs(argv) {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOLEAN.includes(a)) { flags[a.replace(/^-+/, '')] = true; continue; }
    if (!VALUED.includes(a)) {
      if (a.startsWith('--')) throw new Error(`${a} is not an option of this lab. "node lab.mjs help" lists the commands`);
      args.push(a);
      continue;
    }
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value after it`);
    flags[a.slice(2)] = ['--part', '--frame', '--port'].includes(a) ? wholeNumber(a, v) : v;
  }
  return { flags, args };
}

function wholeNumber(flag, v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${flag} needs a whole number, not "${v}"`);
  return n;
}

async function main(argv) {
  const { flags, args } = parseArgs(argv);
  const [command, ...rest] = args;
  const at = (i) => resolve(rest[i]);
  if (!command || command === 'help') { console.log(HELP.main); return; }
  if (flags.help || flags.h) { console.log(HELP[command] ?? HELP.main); return; }
  if (command === 'start' && rest.length === 1) return start(at(0), rest[0]);
  if (command === 'route' && rest.length === 3) return route(rest[0], rest[1], at(2), rest[2]);
  if (command === 'recover' && (rest.length === 2 || rest.length === 3)) return recover(rest[0], at(1), rest[1], rest[2]);
  if (command === 'check' && rest.length === 2) return check(rest[0], at(1), rest[1]);
  if (command === 'status' && rest.length === 1) return status(at(0), rest[0], flags);
  if (command === 'levels' && rest.length === 0) return levels();
  if (command === 'play' && rest.length === 2) return play(rest[0], at(1), rest[1], flags.version);
  if (command === 'capstone' && rest.length === 1) return capstone(at(0), rest[0]);
  if (command === 'view' && (rest.length === 1 || rest.length === 2)) return view(rest.length === 2 ? rest[0] : undefined, resolve(rest.at(-1)), rest.at(-1), flags);
  if (command === 'serve' && rest.length === 1) return serve(at(0), rest[0], flags);
  if (command === 'bisect' && rest.length === 1) return bisect(at(0), rest[0]);
  if (command === 'lesson' && rest.length === 2) return lessonText(rest[0], at(1), rest[1], flags);
  if (command === 'question' && rest.length === 2) return question(rest[0], at(1), rest[1]);
  // An answer may hold spaces ("1, 2, 3" typed without quotes): everything between ID and the folder.
  if (command === 'answer' && rest.length >= 3) return answer(rest[0], rest.slice(1, -1).join(' '), resolve(rest.at(-1)), rest.at(-1));
  console.error(`That command was not understood.\n\n${HELP[command] ?? HELP.main}`);
  process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error('Stopped: ' + error.message);
    process.exitCode = 2;
  }
}
