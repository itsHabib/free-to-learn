// Tries bench/ in headless Chrome the way a visitor would, and saves screenshots.
//   node films/check-bench.mjs OUT_DIR
// Checks: no inline script or handler in the page; no console errors; no sideways scroll at 320 and 358 px;
// the wall asks first, then steps to the clip and shows the result; level 1 plays to the flag with the pads.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch } from './browser.mjs';
import { readMovie } from '../reference/tas.mjs';

const course = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? '.');
mkdirSync(out, { recursive: true });
const problems = [];
const html = readFileSync(join(course, 'bench', 'index.html'), 'utf8');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('index.html has an inline script');
if (/\son[a-z]+\s*=/i.test(html)) problems.push('index.html has an inline event handler');
for (const f of ['bench.mjs', 'data.mjs']) if (/\beval\(|new Function|fetch\(|XMLHttpRequest|WebSocket/.test(readFileSync(join(course, 'bench', f), 'utf8'))) problems.push(`${f} uses eval or the network`);

const server = await serve(course);
const page = await launch(out);
try {
  for (const width of [320, 358]) {
    await page.size(width, 760, 2, true);
    await page.goto(`${server.url}/bench/index.html`);
    await page.eval('new Promise((r) => setTimeout(r, 300))');
    const wide = await page.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    if (wide > 0) problems.push(`${width} px: the page scrolls sideways by ${wide} px`);
    writeFileSync(join(out, `bench-${width}-top.png`), await page.shot());
  }
  // The wall: stepping is hidden until an answer is locked in.
  if (!(await page.eval("document.getElementById('wall-step').hidden"))) problems.push('the stepper shows before a prediction');
  await page.eval("document.getElementById('commit').click()");
  if (!/Pick one/.test(await page.eval("document.getElementById('predict-hint').textContent"))) problems.push('submitting with no answer did not ask for one');
  await page.eval("document.querySelector('input[value=back]').click(); document.getElementById('commit').click()");
  for (let i = 0; i < 5; i++) await page.eval("document.getElementById('wall-next').focus(); document.getElementById('wall-next').click()");
  if (await page.eval("document.activeElement === document.body")) problems.push('focus fell to the page after the last wall frame');
  const rows = await page.eval("[...document.querySelectorAll('#wall-rows tr')].map((tr) => [...tr.children].map((td) => td.textContent).join(' '))");
  const result = await page.eval("document.getElementById('wall-result').textContent");
  if (!rows.some((r) => / 280 /.test(r))) problems.push(`the wall table never shows x 280: ${rows.join(' / ')}`);
  if (!/through the wall/.test(result) || !/how did Kettle reach 5/.test(result)) problems.push(`the wall result is missing: ${result}`);
  if (!/Not what you picked/.test(result)) problems.push('a wrong prediction was not told so');
  await page.eval("document.getElementById('wall').scrollIntoView()");
  const wallBox = await page.eval("(() => { const r = document.getElementById('wall').getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: r.height }; })()");
  writeFileSync(join(out, 'bench-358-wall.png'), await page.shot(wallBox));
  // Beat par: play the reference level 1 run through the pads, one step a frame.
  const inputs = readMovie(readFileSync(join(course, 'reference', 'movies', 'level1.movie'), 'utf8')).inputs;
  await page.eval(`(() => { const want = ${JSON.stringify(inputs)}; const pad = { 1: 'pad-l', 2: 'pad-r', 4: 'pad-j' };
    for (const input of want) {
      for (const bit of [1, 2, 4]) { const b = document.getElementById(pad[bit]); if ((b.getAttribute('aria-pressed') === 'true') !== ((input & bit) !== 0)) b.click(); }
      document.getElementById('par-step').click();
    } })()`);
  const status = await page.eval("document.getElementById('par-status').textContent");
  if (!new RegExp(`Flag on frame ${inputs.length}\\.`).test(status)) problems.push(`level 1 did not finish on frame ${inputs.length}: ${status}`);
  await page.eval("document.getElementById('par-undo').click()");
  if (!/Frame 108\./.test(await page.eval("document.getElementById('par-status').textContent"))) problems.push('back a frame did not go back');
  await page.eval("document.getElementById('par-step').click()");
  const parBox = await page.eval("(() => { const r = document.getElementById('par').getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: r.height }; })()");
  writeFileSync(join(out, 'bench-358-par.png'), await page.shot(parBox));
  // The movie player draws with the same game/draw.mjs: open it on level 1 and check it drew.
  await page.size(390, 800, 2, true);
  await page.goto(`${server.url}/game/view.html?level=level1`);
  await page.eval('new Promise((r) => setTimeout(r, 500))');
  const drawn = await page.eval("(() => { const c = document.getElementById('game'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] || d[i + 1] || d[i + 2]) n++; return n; })()");
  if (!drawn) problems.push('the movie player drew nothing');
  writeFileSync(join(out, 'player-390.png'), await page.shot());
  for (const e of page.errors) problems.push(`console: ${e}`);
  console.log(JSON.stringify({ rows, result, status }, null, 1));
} finally {
  await page.close();
  await server.close();
}
for (const p of problems) console.log('PROBLEM ' + p);
console.log(problems.length ? `${problems.length} problems` : 'bench page: every check passed');
process.exitCode = problems.length ? 1 : 0;
