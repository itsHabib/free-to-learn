// Terminal projects keep learner code in work/ and author examples in reference/.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function init(root) {
  const staging = mkdtempSync(join(root, '.check-'));
  try {
    for (const name of readdirSync(join(root, 'starter'))) cpSync(join(root, 'starter', name), join(staging, name));
    // Claim the name exclusively before atomically replacing our empty directory.
    mkdirSync(join(root, 'work'));
    renameSync(staging, join(root, 'work'));
  } catch (error) {
    if (error.code === 'EEXIST') throw Error('work/ already exists. Your files are preserved. Edit them to continue.');
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  console.log('Created work/ from the starter. Open lessons/01.md.');
}

export async function loadModule(root, folder, name) {
  try {
    return await import(pathToFileURL(join(root, folder, name)).href);
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && folder === 'work') {
      throw Error('Could not load work/' + name + '. Run node lab.mjs init first. ' + error.message);
    }
    throw error;
  }
}

const save = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });

export async function check({root, unit, checks, worked, predict, helpUsed}) {
  if (!Object.hasOwn(checks, unit)) throw Error('Choose a lesson number from ' + Object.keys(checks).join(', '));
  if (worked) {
    await checks[unit]('reference');
    console.log('PASS ' + unit + ' (worked example)');
    return;
  }
  const work = join(root, 'work');
  let names;
  try { names = readdirSync(work).filter(name => name.endsWith('.mjs')); }
  catch (error) { if (error.code === 'ENOENT') throw Error('Run node lab.mjs init first.'); throw error; }
  const sources = Object.fromEntries(names.map(name => [name, readFileSync(join(work, name), 'utf8')]));
  const lessons = readFileSync(join(root, 'lessons', unit + '.md'), 'utf8');
  const attempts = join(work, 'attempts');
  mkdirSync(attempts, { recursive: true });
  const id = new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID();
  const attempt = join(attempts, id);
  mkdirSync(attempt);
  save(join(attempt, 'submission.json'), {unit, lesson: lessons, prediction: predict ?? null, helpUsed: helpUsed ?? 'unspecified', sources});
  // Run the exact submitted files, including when a learner saves another edit mid-check.
  const staging = mkdtempSync(join(root, '.check-'));
  let result;
  try {
    for (const [name, source] of Object.entries(sources)) writeFileSync(join(staging, name), source);
    await checks[unit](staging.slice(root.length + 1));
    result = {pass:true};
  } catch (error) {
    result = {pass:false, message:error.message};
  } finally {
    rmSync(staging, { recursive: true });
  }
  save(join(attempt, 'result.json'), result);
  console.log('Attempt saved in work/attempts/' + id);
  if (!result.pass) throw Error('Lesson ' + unit + ' — ' + result.message);
  console.log('PASS ' + unit + ' (your work)');
}

export async function reader(root, title, numbers) {
  const { markdown, escapeHTML } = await import('./markdown.mjs');
  const style = readFileSync(new URL('../course-code/style.css',import.meta.url),'utf8');
  const sections = numbers.map(unit => {
    const file = join(root, 'lessons', unit + '.md');
    const source = readFileSync(file, 'utf8');
    const heading = source.match(/^#\s+(.+)$/m)?.[1] ?? unit;
    return {unit,heading,body:markdown(source,pathToFileURL(file).href)};
  });
  const links = sections.map(({unit,heading}) => '<li><a href="#u' + unit + '">' + escapeHTML(heading) + '</a></li>').join('');
  const articles = sections.map(({unit,body}) => '<article id="u'+unit+'">'+body+'<p><a href="#contents">Back to lessons</a></p></article>').join('');
  const css = 'body{font:1.07rem/1.65 system-ui,sans-serif;color:#182b29;background:#fff;margin:auto;max-width:46rem;padding:1rem clamp(.9rem,4vw,3rem) 4rem;overflow-wrap:anywhere}a{color:#095663}h1,h2,h3{line-height:1.18}article{margin-top:4rem;border-top:2px solid #29685f;padding-top:1rem}code{font-size:.92em}nav li{margin-bottom:.4rem}.table-scroll{overflow:auto}th,td{text-align:left;padding:.3rem}';
  const page = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHTML(title)+'</title><style>'+css+style+'</style><main><h1>'+escapeHTML(title)+'</h1><nav id="contents" aria-label="Lessons"><ol>'+links+'</ol></nav>'+articles+'</main></html>';
  const dest = join(root, 'work', 'reader.html');
  writeFileSync(dest,page);
  console.log(pathToFileURL(dest).href);
}

export function report(error) {
  console.error(error.message);
  process.exitCode = 1;
}
