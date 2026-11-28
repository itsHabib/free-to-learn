// Draws the lesson figures in lessons/figures/ from the course's own code, so a figure can't drift from
// what the engine does.
//   node tools/figures.mjs           write the figures
//   node tools/figures.mjs --check   exit 1 if any figure differs from what the course gives now
//   node tools/figures.mjs --data    print the numbers each figure is drawn from
// Every row, revision, matcher call and event below comes from running lib/store.mjs and
// reference/runtime.mjs on the inputs the lessons use (copied here from the lessons and examples). Only the
// layout is placed by hand. The lesson alt text is written by hand from `--data`; rerun it after a change.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, quantityOver, selectRows } from '../lib/store.mjs';
import { openView, poll } from '../reference/runtime.mjs';

const course = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(course, 'lessons', 'figures');
const show = q => (q === null ? 'null' : String(q));
const rowText = r => (r === null ? 'absent' : `${r.id} ${show(r.quantity)}`);

// ---------------------------------------------------------------- data, one function per figure

// Lesson 01: examples/handoff.mjs's store (B at 42) with B cancelled while the matcher runs. The reference
// openView takes its cursor from the snapshot; the tempting version reads store.revision after the scan.
function startupData() {
  const run = tempting => {
    const store = createStore([{ id: 'B', quantity: 42 }]);
    let first = true;
    const match = values => {
      if (first) { first = false; store.commit([{ id: 'B', delete: true }]); }
      return quantityOver(30)(values);
    };
    let view;
    if (tempting) {
      const rows = store.snapshot().rows;
      const visible = selectRows(rows, match);
      view = { revision: store.revision, rows: visible, matcher: match };
    } else view = openView(store, match);
    const opening = { revision: view.revision, ids: [...view.rows.keys()] };
    const unread = store.changesAfter(view.revision).map(c => c.revision);
    const batches = poll(store, view);
    return { opening, unread, events: batches.flatMap(b => b.events.map(e => `${e.type} ${e.id}`)), after: [...view.rows.keys()], storeIds: store.snapshot().rows.map(r => r.id) };
  };
  return { right: run(false), wrong: run(true) };
}

// Lesson 02: order A on the packing desk (quantity over 30) across the lesson's writes.
function walkData() {
  const store = createStore([{ id: 'A', quantity: 18 }]);
  const view = openView(store);
  const writes = [45, 41, 41, 30];
  const steps = [{ revision: 0, quantity: 18, visible: view.rows.has('A'), event: null }];
  for (const q of writes) {
    store.commit([{ id: 'A', quantity: q }]);
    const [batch] = poll(store, view);
    steps.push({ revision: batch.revision, quantity: q, visible: view.rows.has('A'), event: batch.events[0]?.type ?? null });
  }
  return { threshold: 30, steps };
}

// Lesson 03: the worked demo's one commit, step by step through poll, with the matcher's input and output
// recorded.
function commitData() {
  const store = createStore([{ id: 'A', quantity: 20 }, { id: 'B', quantity: 42 }, { id: 'C', quantity: null }]);
  const calls = [];
  const inner = quantityOver(30);
  const matcher = values => { const r = inner(values); calls.push({ values: [...values], result: [...r] }); return r; };
  const view = openView(store, matcher);
  const board = [...view.rows.values()];
  const snapshot = store.snapshot().rows;
  store.commit([{ id: 'A', quantity: 45 }, { id: 'B', delete: true }]);
  const [commit] = store.changesAfter(view.revision);
  const before = new Map(view.rows);
  const batches = poll(store, view);
  const scan = calls.at(-1);
  const touched = commit.changes.map(c => ({ id: c.id, final: c.row, before: before.get(c.id) ?? null, after: view.rows.get(c.id) ?? null }));
  return { snapshot, board, revision: commit.revision, scan, touched, events: batches[0].events, finalBoard: [...view.rows.values()] };
}

// Lesson 03: the delayed reader. A enters at r1 and drops to 20 at r2 before the next poll. The matcher records
// what the caller's view holds each time poll calls it, so the figure shows the view mid-poll. A second run whose
// matcher throws on its second call shows what a failed poll leaves behind.
function delayedData() {
  const run = failSecond => {
    const store = createStore([]);
    const inner = quantityOver(30);
    let view, calls = 0;
    const seen = [];
    const matcher = values => {
      calls++;
      if (calls > 1) seen.push({ revision: view.revision, ids: [...view.rows.keys()] });
      if (failSecond && calls === 3) throw Error('matcher failed');
      return inner(values);
    };
    view = openView(store, matcher);
    const opening = { revision: view.revision, ids: [...view.rows.keys()] };
    store.commit([{ id: 'A', quantity: 45 }]);
    store.commit([{ id: 'A', quantity: 20 }]);
    let batches = null, threw = false;
    try { batches = poll(store, view); } catch { threw = true; }
    return { opening, seen, batches, threw, after: { revision: view.revision, ids: [...view.rows.keys()] } };
  };
  const ok = run(false), failed = run(true);
  // After each revision, the row A has for the next comparison: the after-row the batch reports.
  const aAfter = ok.batches.map(b => { const e = b.events.find(x => x.id === 'A'); return { revision: b.revision, a: e ? e.row : null, events: b.events }; });
  return { opening: ok.opening, revisions: aAfter, seen: ok.seen, final: ok.after, failed: { threw: failed.threw, after: failed.after } };
}

// ---------------------------------------------------------------- drawing
const W = 480;
const INK = '#1f2b29', MUTED = '#5c6865', RULE = '#c9d2cf', GOOD = '#1f6f68', GOOD_BG = '#d8ece8', WARN = '#a65a17', WARN_BG = '#f6e3cf', BAD = '#b3261e', BAD_BG = '#fbe9e7', PALE = '#f3f5f4';
const MONO = 'font-family="ui-monospace, Menlo, Consolas, monospace"';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const t = (x, y, s, a = '') => `<text x="${x}" y="${y}"${a ? ' ' + a : ''}>${esc(s)}</text>`;
const box = (x, y, w, h, fill, stroke = INK) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"/>`;
const arrow = (x1, y1, x2, y2, color = MUTED) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" marker-end="url(#a)"/>`;
function svg(h, title, desc, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-labelledby="t d" font-family="-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="14" fill="${INK}">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<rect width="${W}" height="${h}" fill="#ffffff"/>
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${MUTED}"/></marker></defs>
${body.join('\n')}
</svg>
`;
}
const chip = (body, x, y, label, fill = PALE, stroke = INK) => { const w = Math.max(36, label.length * 8.6 + 14); body.push(box(x, y, w, 22, fill, stroke), t(x + w / 2, y + 15, label, `text-anchor="middle" font-size="13" ${MONO}`)); return w; };

function startupFigure(d) {
  const body = [t(16, 24, 'B is cancelled while the first screen is scanned', 'font-weight="600"')];
  // A shared timeline: snapshot, scan (commit r1 happens inside), cursor read.
  const y = 66, x0 = 40, x1 = W - 30;
  body.push(arrow(x0, y, x1, y));
  const marks = [[84, 'snapshot()', 'rows: B 42, revision 0'], [220, 'matcher runs', 'r1 commits: delete B'], [370, 'scan ends', `store.revision is ${d.wrong.opening.revision}`]];
  for (const [x, a, b] of marks) {
    body.push(`<circle cx="${x}" cy="${y}" r="4" fill="${INK}"/>`);
    body.push(t(x, y - 12, a, `text-anchor="middle" font-size="13" ${MONO}`));
    body.push(t(x, y + 20, b, `text-anchor="middle" font-size="12.5" fill="${MUTED}"`));
  }
  const lane = (yy, title, r, good) => {
    body.push(t(16, yy, title, 'font-weight="600" font-size="13"'));
    const rows = [
      ['opening screen', r.opening.ids.join(', ') || 'empty'],
      ['saved cursor', String(r.opening.revision)],
      ['changesAfter(cursor)', r.unread.length ? `r${r.unread.join(', r')}` : 'nothing'],
      ['next poll', r.events.join(', ') || 'no events'],
      ['board after it', r.after.join(', ') || 'empty'],
    ];
    rows.forEach(([k, v], i) => {
      const ry = yy + 14 + i * 24;
      body.push(t(30, ry + 15, k, `font-size="13" fill="${MUTED}"`));
      const last = i === rows.length - 1;
      const leave = v.startsWith('leave');
      chip(body, 200, ry, v, last ? (good ? GOOD_BG : BAD_BG) : leave ? WARN_BG : PALE, last ? (good ? GOOD : BAD) : leave ? WARN : INK);
    });
  };
  lane(130, 'Cursor from the same snapshot (openView)', d.right, true);
  lane(282, 'Cursor read after the scan', d.wrong, false);
  body.push(t(250, 282 + 14 + 4 * 24 + 15, `stuck: the store has ${d.wrong.storeIds.length ? d.wrong.storeIds.join(', ') : 'no orders'}`, `font-size="13" fill="${BAD}"`));
  const h = 282 + 14 + 5 * 24 + 12;
  const desc = `A store holds B at 42. openView calls snapshot() and gets B at revision 0; while the matcher scans, revision 1 commits and deletes B; when the scan ends store.revision is ${d.wrong.opening.revision}. With the cursor taken from the snapshot, the opening screen shows ${d.right.opening.ids.join(', ')}, the cursor is ${d.right.opening.revision}, changesAfter returns r${d.right.unread.join(', r')}, and the next poll emits ${d.right.events.join(', ')}: the board ends empty. With the cursor read after the scan, the screen shows ${d.wrong.opening.ids.join(', ')}, the cursor is ${d.wrong.opening.revision}, changesAfter returns nothing, the next poll emits nothing, and B stays on the board although the store has no orders.`;
  return svg(h, 'Where the opening cursor comes from', desc, body);
}

function walkFigure(d) {
  const body = [t(16, 24, `Order A on the packing desk (quantity > ${d.threshold})`, 'font-weight="600"')];
  const cols = [30, 120, 230, 340], y0 = 56;
  ['revision', 'A in the store', 'on the board?', 'event'].forEach((h, i) => body.push(t(cols[i], y0, h, `font-size="13" fill="${MUTED}"`)));
  body.push(`<line x1="16" y1="${y0 + 8}" x2="${W - 16}" y2="${y0 + 8}" stroke="${RULE}"/>`);
  d.steps.forEach((s, i) => {
    const y = y0 + 22 + i * 34;
    body.push(t(cols[0], y + 15, s.revision === 0 ? 'r0 (open)' : `r${s.revision}`, `${MONO} font-size="13"`));
    body.push(t(cols[1], y + 15, `A ${s.quantity}`, `${MONO} font-size="13"`));
    body.push(box(cols[2], y, 76, 22, s.visible ? GOOD_BG : PALE, s.visible ? GOOD : MUTED), t(cols[2] + 38, y + 15, s.visible ? 'visible' : 'absent', 'text-anchor="middle" font-size="13"'));
    if (s.event) {
      const color = s.event === 'leave' ? WARN : GOOD;
      body.push(box(cols[3], y, 70, 22, s.event === 'leave' ? WARN_BG : GOOD_BG, color), t(cols[3] + 35, y + 15, s.event, `text-anchor="middle" font-size="13" ${MONO}`));
    } else body.push(t(cols[3], y + 15, i === 0 ? '' : 'nothing', `font-size="13" fill="${MUTED}"`));
  });
  const h = y0 + 22 + d.steps.length * 34 + 8;
  const desc = `Order A starts at ${d.steps[0].quantity} and is absent from the board. ${d.steps.slice(1).map(s => `r${s.revision} writes ${s.quantity}: A is ${s.visible ? 'visible' : 'absent'} and the desk gets ${s.event ? `${s.event === 'update' ? 'an' : 'a'} ${s.event}` : 'nothing'}`).join('; ')}.`;
  return svg(h, 'Order A across four commits', desc, body);
}

function commitFigure(d) {
  const body = [t(16, 24, `One poll, one commit: revision ${d.revision}`, 'font-weight="600"')];
  // Column 1: the commit's changes. Column 2: present rows -> matcher. Column 3: before and after -> event.
  const y0 = 50;
  body.push(t(16, y0, `the board at r${d.revision - 1}`, `font-size="13" fill="${MUTED}"`));
  let x = 130; for (const r of d.board) x += chip(body, x, y0 - 15, rowText(r), GOOD_BG, GOOD) + 6;
  body.push(t(16, y0 + 34, `r${d.revision} changes`, `font-size="13" fill="${MUTED}"`));
  x = 130; for (const c of d.touched) x += chip(body, x, y0 + 19, c.final === null ? `${c.id} deleted` : rowText(c.final)) + 6;
  body.push(t(16, y0 + 68, 'matcher', `font-size="13" fill="${MUTED}"`));
  x = 130; x += chip(body, x, y0 + 53, JSON.stringify(d.scan.values)) + 4;
  body.push(arrow(x + 2, y0 + 64, x + 30, y0 + 64)); x += 36;
  x += chip(body, x, y0 + 53, JSON.stringify(d.scan.result)) + 8;
  body.push(t(x, y0 + 68, `index 0 is ${d.touched.filter(c => c.final !== null)[0].id}`, `font-size="13" fill="${MUTED}"`));
  // Per touched ID.
  const ty = y0 + 104, cols = [30, 110, 220, 330];
  ['touched ID', 'before (board)', 'after (matcher)', 'event'].forEach((h, i) => body.push(t(cols[i], ty, h, `font-size="13" fill="${MUTED}"`)));
  body.push(`<line x1="16" y1="${ty + 8}" x2="${W - 16}" y2="${ty + 8}" stroke="${RULE}"/>`);
  d.touched.forEach((c, i) => {
    const y = ty + 20 + i * 34;
    const ev = d.events.find(e => e.id === c.id);
    body.push(t(cols[0] + 20, y + 15, c.id, `${MONO} font-weight="600"`));
    chip(body, cols[1], y, rowText(c.before), c.before ? GOOD_BG : PALE, c.before ? GOOD : MUTED);
    chip(body, cols[2], y, rowText(c.after), c.after ? GOOD_BG : PALE, c.after ? GOOD : MUTED);
    if (ev) chip(body, cols[3], y, ev.type, ev.type === 'leave' ? WARN_BG : GOOD_BG, ev.type === 'leave' ? WARN : GOOD);
  });
  const fy = ty + 20 + d.touched.length * 34 + 14;
  body.push(t(16, fy, `board after the poll`, `font-size="13" fill="${MUTED}"`));
  x = 150; for (const r of d.finalBoard) x += chip(body, x, fy - 15, rowText(r), GOOD_BG, GOOD) + 6;
  if (!d.finalBoard.length) chip(body, 150, fy - 15, 'empty');
  const h = fy + 18;
  const desc = `The board at revision ${d.revision - 1} holds ${d.board.map(rowText).join(', ')}. Revision ${d.revision} changes ${d.touched.map(c => (c.final === null ? `${c.id} (deleted)` : rowText(c.final))).join(' and ')}. Only the rows that still exist go to the matcher: it receives ${JSON.stringify(d.scan.values)} and returns ${JSON.stringify(d.scan.result)}, which selects ${d.touched.filter(c => c.final !== null)[0].id}. Then each touched ID is looked up before and after: ${d.touched.map(c => `${c.id} goes from ${rowText(c.before)} to ${rowText(c.after)}, giving ${d.events.find(e => e.id === c.id)?.type ?? 'no event'}`).join('; ')}. The board after the poll holds ${d.finalBoard.map(rowText).join(', ') || 'nothing'}.`;
  return svg(h, 'One poll of one commit', desc, body);
}

function delayedFigure(d) {
  const body = [t(16, 24, 'A delayed reader: two commits, one poll', 'font-weight="600"')];
  const cols = [16, 96, 210, 340], y0 = 56;
  ['revision', 'A afterwards', 'events', 'view during poll'].forEach((h, i) => body.push(t(cols[i], y0, h, `font-size="13" fill="${MUTED}"`)));
  body.push(`<line x1="16" y1="${y0 + 8}" x2="${W - 16}" y2="${y0 + 8}" stroke="${RULE}"/>`);
  const view = v => `r${v.revision}, ${v.ids.join(', ') || 'empty'}`;
  let y = y0 + 20;
  body.push(t(cols[0], y + 15, `r${d.opening.revision} (open)`, `${MONO} font-size="13"`));
  chip(body, cols[3], y, view(d.opening));
  d.revisions.forEach((r, i) => {
    y += 34;
    body.push(t(cols[0], y + 15, `r${r.revision}`, `${MONO} font-size="13"`));
    chip(body, cols[1], y, r.a ? rowText(r.a) : 'absent', r.a ? GOOD_BG : WARN_BG, r.a ? GOOD : WARN);
    let x = cols[2]; for (const e of r.events) x += chip(body, x, y, `${e.type} ${e.id}`, e.type === 'leave' ? WARN_BG : GOOD_BG, e.type === 'leave' ? WARN : GOOD) + 4;
    chip(body, cols[3], y, view(d.seen[i]));
  });
  y += 44;
  body.push(t(16, y + 15, 'the poll returns', 'font-size="13"'));
  chip(body, cols[3], y, view(d.final), GOOD_BG, GOOD);
  y += 34;
  body.push(t(16, y + 15, d.failed.threw ? 'if the matcher throws on r2' : 'matcher failure not reproduced', `font-size="13" fill="${BAD}"`));
  chip(body, cols[3], y, view(d.failed.after), BAD_BG, BAD);
  const h = y + 36;
  const desc = `The view opens at revision ${d.opening.revision} with ${d.opening.ids.join(', ') || 'no rows'}. Before the next poll, r1 writes A at 45 and r2 writes A at 20. ${d.revisions.map((r, i) => `After r${r.revision}, A is ${r.a ? rowText(r.a) : 'absent'} and the poll emits ${r.events.map(e => `${e.type} ${e.id}`).join(', ')}; while the poll scans it, the caller's view still reads ${view(d.seen[i])}`).join('. ')}. r2 is compared with A as r1 left it, not with the opening view. The poll returns with the view at ${view(d.final)}. If the matcher throws on r2, the view is left at ${view(d.failed.after)}, so a retry delivers both batches.`;
  return svg(h, 'A delayed reader with a staged map', desc, body);
}

// ---------------------------------------------------------------- main
const FIGURES = {
  'startup-race': [startupData, startupFigure],
  'event-walk': [walkData, walkFigure],
  'one-commit': [commitData, commitFigure],
  'delayed-reader': [delayedData, delayedFigure],
};

const mode = process.argv[2];
if (mode !== undefined && !['--check', '--data'].includes(mode)) { console.error('usage: node tools/figures.mjs [--check | --data]'); process.exit(2); }
if (mode === '--data') {
  for (const [name, [data]] of Object.entries(FIGURES)) console.log(name, JSON.stringify(data(), null, 1));
} else {
  if (mode !== '--check') mkdirSync(out, { recursive: true });
  let stale = 0;
  for (const [name, [data, draw]] of Object.entries(FIGURES)) {
    const file = join(out, `${name}.svg`), text = draw(data());
    if (mode === '--check') {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text) { console.error(`stale: lessons/figures/${name}.svg (run node tools/figures.mjs)`); stale++; }
    } else writeFileSync(file, text);
  }
  if (mode === '--check') { if (stale) process.exitCode = 1; else console.log(`${Object.keys(FIGURES).length} figures match`); }
  else console.log(`wrote ${Object.keys(FIGURES).length} figures to lessons/figures/`);
}
