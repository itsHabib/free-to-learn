// Draws the lesson figures in lessons/figures/ from the course's own Python, so a figure can't drift from what
// lab.py and teleport/bench.py compute.
//   node tools/figures.mjs           write the figures
//   node tools/figures.mjs --check   exit 1 if any figure differs from what the course gives now
//   node tools/figures.mjs --data    print the numbers each figure is drawn from
// tools/figure_data.py runs lab.py and teleport/bench.py on the lessons' inputs and prints every number drawn
// here. Only the layout is placed by hand. The lesson alt text is written by hand from `--data`; rerun it after
// a change. Needs python3, as the course does.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const course = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(course, 'lessons', 'figures');
const data = JSON.parse(execFileSync('python3', [join(course, 'tools', 'figure_data.py')], { encoding: 'utf8' }));

const W = 480;
const INK = '#1f2b29', MUTED = '#5c6865', RULE = '#c9d2cf', GOOD = '#1f6f68', GOOD_BG = '#d8ece8', WARN = '#a65a17', WARN_BG = '#f6e3cf', BAD = '#b3261e', BAD_BG = '#fbe9e7', PALE = '#f3f5f4';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const t = (x, y, s, a = '') => `<text x="${x}" y="${y}"${a ? ' ' + a : ''}>${esc(s)}</text>`;
const box = (x, y, w, h, fill, stroke = INK) => `<rect x="${+x.toFixed(2)}" y="${+y.toFixed(2)}" width="${+w.toFixed(2)}" height="${+h.toFixed(2)}" fill="${fill}" stroke="${stroke}"/>`;
const pct = (p, digits = 1) => `${(100 * p).toFixed(digits)}%`;
const setting = r => `${r.x}${r.y}`;
function svg(h, title, desc, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-labelledby="t d" font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="14" fill="${INK}">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<rect width="${W}" height="${h}" fill="#ffffff"/>
${body.join('\n')}
</svg>
`;
}

// Lesson 01: match chance for each setting pair at full visibility, and which answer wins there.
function anglesFigure(rows) {
  const body = [t(16, 24, 'The entangled boxes at visibility 1', 'font-weight="600"')];
  const x0 = 150, bw = 200, y0 = 58;
  ['inputs', 'angle apart', 'chance the bits match', 'wins'].forEach((h, i) => body.push(t([16, 74, x0, 372][i], y0, h, `font-size="13" fill="${MUTED}"`)));
  body.push(`<line x1="16" y1="${y0 + 8}" x2="${W - 16}" y2="${y0 + 8}" stroke="${RULE}"/>`);
  rows.forEach((r, i) => {
    const y = y0 + 22 + i * 40;
    body.push(t(16, y + 17, setting(r), `${MONO} font-weight="600"`));
    body.push(t(74, y + 17, `${r.difference}°`, MONO));
    body.push(box(x0, y, bw, 24, PALE, MUTED));
    body.push(box(x0, y, bw * r.equal, 24, r.need_different ? WARN_BG : GOOD_BG, r.need_different ? WARN : GOOD));
    body.push(t(bw * r.equal < 70 ? x0 + bw * r.equal + 6 : x0 + 6, y + 17, pct(r.equal), `font-size="13" ${MONO}`));
    body.push(t(372, y + 11, r.need_different ? 'if different' : 'if equal', 'font-size="12.5"'));
    body.push(t(372, y + 26, pct(r.win), `font-size="13" ${MONO} fill="${GOOD}"`));
  });
  const fy = y0 + 22 + rows.length * 40 + 10;
  if (!rows.every(r => r.win === rows[0].win)) throw Error('input pairs no longer win equally often');
  body.push(t(16, fy, `Each input pair wins ${pct(rows[0].win)} of the time.`, `font-size="12.5" fill="${MUTED}"`));
  body.push(t(16, fy + 18, 'The best classical rulebook wins 75% on average.', `font-size="12.5" fill="${MUTED}"`));
  const h = fy + 30;
  const desc = `For each pair of inputs, the angle between Alice's and Bob's measurements and the chance their bits match at visibility 1, from equal_probability in lab.py. ${rows.map(r => `Inputs ${setting(r)}: ${r.difference} degrees apart, bits match ${pct(r.equal)} of the time, and the round wins ${r.need_different ? 'when they differ' : 'when they match'}, ${pct(r.win)}`).join('. ')}. Every input pair wins ${pct(rows[0].win)}, against 75% for the best classical rulebook.`;
  return svg(h, 'Match chance by input pair', desc, body);
}

// Lesson 02: the skewed capture, one bar per input pair.
function skewedFigure(r) {
  const body = [t(16, 24, `skewed-classical.csv: ${r.wins} of ${r.trials} wins, S = ${r.s}`, 'font-weight="600"')];
  const x0 = 70, bw = 200, max = Math.max(...r.settings.map(s => s.trials)), y0 = 56;
  ['inputs', 'trials (all answers equal)', 'correlation'].forEach((h, i) => body.push(t([16, x0, 384][i], y0, h, `font-size="13" fill="${MUTED}"`)));
  body.push(`<line x1="16" y1="${y0 + 8}" x2="${W - 16}" y2="${y0 + 8}" stroke="${RULE}"/>`);
  r.settings.forEach((s, i) => {
    const y = y0 + 20 + i * 38, need = s.x === 1 && s.y === 1;
    body.push(t(16, y + 17, `${s.x}${s.y}`, `${MONO} font-weight="600"`));
    const w = Math.max(4, (s.trials / max) * bw);
    body.push(box(x0, y, w, 24, need ? BAD_BG : GOOD_BG, need ? BAD : GOOD));
    const wins = need ? s.opposite : s.equal;
    body.push(t(x0 + w + 6, y + 17, `${s.trials} ${wins === s.trials ? '(all win)' : wins === 0 ? '(all lose)' : `(${wins} win)`}`, `font-size="13" ${MONO}`));
    body.push(t(384, y + 17, `${s.correlation >= 0 ? '+' : '−'}${Math.abs(s.correlation).toFixed(1)}`, `${MONO}`));
  });
  const fy = y0 + 20 + r.settings.length * 38 + 12;
  body.push(t(16, fy, `S = ${r.settings.map((s, i) => (i === 3 ? '− ' : i ? '+ ' : '') + s.correlation).join(' ')} = ${r.s}`, `${MONO} font-size="13"`));
  body.push(t(16, fy + 20, `The pooled ${pct(r.win_rate, 0)} comes from three common input pairs; 11 came up ${r.settings[3].trials} times.`, `font-size="12.5" fill="${MUTED}"`));
  const h = fy + 34;
  const desc = `The skewed capture scored by lab.py: ${r.wins} wins in ${r.trials} trials, S = ${r.s}. ${r.settings.map(s => `Inputs ${s.x}${s.y}: ${s.trials} trials, every pair of answers equal, correlation ${s.correlation}`).join('. ')}. Equal answers win on 00, 01 and 10 and lose on 11, so the pooled ${pct(r.win_rate, 0)} comes from the three common pairs. S adds the first three correlations and subtracts the fourth: 1 + 1 + 1 − 1 = ${r.s}.`;
  return svg(h, 'The skewed capture by input pair', desc, body);
}

// Lesson 03: how often a 3/4 baseline reaches each report's win count.
function tailsFigure(tails) {
  const body = [t(16, 24, 'Two 80% reports against a baseline that wins 3/4 of rounds', 'font-weight="600"')];
  const panels = [{ ...tails[0], lo: 0, hi: 10 }, { ...tails[1], lo: 150, hi: 215 }];
  const ph = 90, x0 = 30, pw = W - 46;
  panels.forEach((p, k) => {
    const y0 = 52 + k * 168;
    body.push(t(16, y0, `${p.wins} wins in ${p.trials}: a baseline reaches ${p.wins} or more ${pct(p.tail)} of the time`, 'font-size="13" font-weight="600"'));
    const ks = Array.from({ length: p.hi - p.lo + 1 }, (_, i) => p.lo + i);
    const top = Math.max(...ks.map(i => p.masses[i]));
    const bw = pw / ks.length;
    ks.forEach((i, j) => {
      const h = (p.masses[i] / top) * ph;
      const tail = i >= p.wins;
      body.push(`<rect x="${(x0 + j * bw).toFixed(2)}" y="${(y0 + 14 + ph - h).toFixed(2)}" width="${Math.max(1, bw - 1).toFixed(2)}" height="${h.toFixed(2)}" fill="${tail ? WARN_BG : PALE}" stroke="${tail ? WARN : MUTED}" stroke-width="0.6"/>`);
    });
    body.push(`<line x1="${x0}" y1="${y0 + 14 + ph}" x2="${x0 + pw}" y2="${y0 + 14 + ph}" stroke="${MUTED}"/>`);
    const xs = k === 0 ? [0, 5, 8, 10] : [150, 184, 196, 215];
    for (const v of xs) {
      const x = x0 + (v - p.lo + 0.5) * bw;
      body.push(t(x, y0 + ph + 30, String(v), `text-anchor="middle" font-size="12.5" ${MONO} fill="${v === p.wins ? WARN : MUTED}"`));
    }
    body.push(t(x0 + pw, y0 + ph + 46, k === 0 ? 'wins in 10 rounds' : 'wins in 245 rounds (150 to 215 shown)', `text-anchor="end" font-size="12.5" fill="${MUTED}"`));
  });
  const h = 52 + 2 * 168 - 20;
  const [a, b] = tails;
  const desc = `Two bar charts of how many rounds a strategy that wins each round with probability 3/4 would win. With ${a.trials} rounds, the bars from ${a.wins} to ${a.trials} are shaded: it reaches ${a.wins} or more ${pct(a.tail)} of the time. With ${b.trials} rounds, the bars from ${b.wins} up are shaded, far out in the right tail: ${pct(b.tail)}. Both reports are 80%. The tails come from lab.py's uniform_null.`;
  return svg(h, 'Tail probability for two 80% reports', desc, body);
}

// Lesson 04: input plus on each message, the broken receiver against the known-good one.
function branchesFigure(d) {
  const body = [t(16, 24, 'Input plus on each of the four messages', 'font-weight="600"')];
  const cols = [16, 92, 190, 340], y0 = 56;
  ['message', 'Bob starts as', 'broken receiver', 'known-good receiver'].forEach((h, i) => body.push(t(cols[i], y0, h, `font-size="13" fill="${MUTED}"`)));
  body.push(`<line x1="16" y1="${y0 + 8}" x2="${W - 16}" y2="${y0 + 8}" stroke="${RULE}"/>`);
  const cell = (x, y, gates, pass) => {
    const ok = pass === 1;
    body.push(box(x, y, 124, 26, ok ? GOOD_BG : BAD_BG, ok ? GOOD : BAD));
    body.push(t(x + 8, y + 18, `${gates.length ? gates.join(', ') : 'no gate'} → ${ok ? 'pass' : 'fail'}`, `font-size="13" ${MONO}`));
  };
  d.rows.forEach((r, i) => {
    const y = y0 + 22 + i * 38;
    body.push(t(cols[0], y + 18, r.bits, `${MONO} font-weight="600"`));
    body.push(t(cols[1], y + 18, r.bob, MONO));
    cell(cols[2], y, r.broken_gates, r.broken_pass);
    cell(cols[3], y, r.ideal_gates, r.ideal_pass);
  });
  const fy = y0 + 22 + d.rows.length * 38 + 10;
  body.push(t(16, fy, `each message has chance ${d.rows.every(r => r.branch === 0.25) ? '1/4' : 'as weighted'}`, `font-size="12.5" fill="${MUTED}"`));
  body.push(t(16, fy + 20, 'passes over all four', `font-size="12.5" fill="${MUTED}"`));
  body.push(t(cols[2] + 8, fy + 20, pct(d.pooled.broken, 0), `font-size="14" font-weight="600" fill="${BAD}" ${MONO}`));
  body.push(t(cols[3] + 8, fy + 20, pct(d.pooled.ideal, 0), `font-size="14" font-weight="600" fill="${GOOD}" ${MONO}`));
  const h = fy + 34;
  const desc = `The tester sends plus. For each two-bit message, phase bit first, the state Bob holds before any correction, and what each receiver does. ${d.rows.map(r => `Message ${r.bits}: Bob starts as ${r.bob}; the broken receiver applies ${r.broken_gates.join(', ') || 'no gate'} and ${r.broken_pass === 1 ? 'passes' : 'fails'}; the known-good receiver applies ${r.ideal_gates.join(', ') || 'no gate'} and ${r.ideal_pass === 1 ? 'passes' : 'fails'}`).join('. ')}. Each message has chance 1/4, so the broken receiver passes ${pct(d.pooled.broken, 0)} of the time and the known-good one ${pct(d.pooled.ideal, 0)}.`;
  return svg(h, 'Input plus through each message', desc, body);
}

// Lesson 05: the six-state sweep at both stations with the known-good receiver.
function stationsFigure(d) {
  const body = [t(16, 24, 'Known-good receiver: two sweeps and the night bypass', 'font-weight="600"')];
  const states = d.day.map(r => r.state), cw = 58, x0 = 116, y0 = 50;
  states.forEach((s, i) => body.push(t(x0 + i * cw + cw / 2, y0, s, `text-anchor="middle" font-size="12.5" ${MONO}`)));
  states.forEach((s, i) => body.push(t(x0 + i * cw + cw / 2, y0 + 16, `basis ${d.day[i].basis}`, `text-anchor="middle" font-size="12.5" fill="${MUTED}"`)));
  const rowsOf = [['day', 'day, end to end'], ['night', 'night, end to end'], ['calibrate', 'night, bypass']];
  rowsOf.forEach(([st, label], k) => {
    const y = y0 + 30 + k * 44;
    label.split(', ').forEach((part, j) => body.push(t(16, y + 14 + j * 16, part, `font-size="13"${j ? ` fill="${MUTED}"` : ' font-weight="600"'}`)));
    d[st].forEach((r, i) => {
      const ok = r.pass_probability === 1;
      body.push(box(x0 + i * cw + 2, y, cw - 4, 34, ok ? GOOD_BG : BAD_BG, ok ? GOOD : BAD));
      body.push(t(x0 + i * cw + cw / 2, y + 22, pct(r.pass_probability, 0), `text-anchor="middle" font-size="13" ${MONO}`));
    });
  });
  const h = y0 + 30 + 3 * 44 + 10;
  const fail = d.night.filter(r => r.pass_probability !== 1).map(r => r.state);
  const bases = [...new Set(d.night.filter(r => r.pass_probability !== 1).map(r => r.basis))].join(', ');
  const calFail = d.calibrate.filter(r => r.pass_probability !== 1).map(r => r.state);
  const desc = `Pass probability for each of the six preparations with the known-good receiver, from teleport/bench.py. End to end at the day station: ${d.day.every(r => r.pass_probability === 1) ? 'all six pass 100%' : d.day.map(r => `${r.state} ${pct(r.pass_probability, 0)}`).join(', ')}. End to end at the night station: ${d.night.filter(r => r.pass_probability === 1).map(r => r.state).join(', ')} pass 100% and ${fail.join(' and ')}, basis ${bases}, pass ${pct(d.night.find(r => r.state === fail[0]).pass_probability, 0)}. Prepared directly at the night verifier, bypassing Alice, the pair, the message and Bob: ${calFail.join(' and ')} fail.`;
  return svg(h, 'Six-state sweep at two stations', desc, body);
}

const FIGURES = {
  'match-chance': () => anglesFigure(data.angles),
  'skewed-settings': () => skewedFigure(data.skewed),
  'two-tails': () => tailsFigure(data.tails),
  'plus-branches': () => branchesFigure(data.branches),
  'station-sweep': () => stationsFigure(data.stations),
};

const mode = process.argv[2];
if (mode !== undefined && !['--check', '--data'].includes(mode)) { console.error('usage: node tools/figures.mjs [--check | --data]'); process.exit(2); }
if (mode === '--data') console.log(JSON.stringify({ ...data, tails: data.tails.map(({ masses, ...rest }) => rest) }, null, 1));
else {
  if (mode !== '--check') mkdirSync(out, { recursive: true });
  let stale = 0;
  for (const [name, draw] of Object.entries(FIGURES)) {
    const file = join(out, `${name}.svg`), text = draw();
    if (mode === '--check') {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text) { console.error(`stale: lessons/figures/${name}.svg (run node tools/figures.mjs)`); stale++; }
    } else writeFileSync(file, text);
  }
  if (mode === '--check') { if (stale) process.exitCode = 1; else console.log(`${Object.keys(FIGURES).length} figures match`); }
  else console.log(`wrote ${Object.keys(FIGURES).length} figures to lessons/figures/`);
}
