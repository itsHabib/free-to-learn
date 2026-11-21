// Lab command for unit 17: the scoreboard. lab.mjs lists it with its own commands
// (node lab.mjs help).
//
//   scoreboard PROJECT [--sessions N]
//
// Plays the course's clients against your whole defence and prints one table for Lob (each
// legal player model, each protocol cheat, the searching client live against your view and
// once against the full view, the two recordings through your detector), then the courier
// at your window, then your trade under a crash at every write, then each budget of API.md's
// unit 17 with PASS or MISS. The measuring is checks/scoreboard.mjs's, the same code the
// unit 17 checks use; the checks play other seeds.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLoader } from '../checks/harness.mjs';
import * as sb from '../checks/scoreboard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const say = (s = '') => console.log(s);
const grouped = (n) => Number(n).toLocaleString('en-US');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const pct2 = (x) => `${(100 * x).toFixed(2)}%`;
const plural = (n, word, many = `${word}s`) => `${grouped(n)} ${n === 1 ? word : many}`;

// The scoreboard's seeds. Lob: session n of row r has server seed 17,000,000 + 100,000 * r + n.
// The corpus splits use 1,000,000+ and 2,000,000+, the recordings 3,000,000+, the author's
// calibration 4,000,000+, the unit 13 and 14 checks 13,000,000+ and 14,000,000+, and the
// unit 17 checks 71,000,000+, so none of them meets these. The courier's runCourier seed is
// 17 (the sweep command uses 1, the unit 15 checks 11 and 29, the unit 17 checks 71).
export const SEEDS = Object.freeze({ lob: 17_000_000, courier: 17 });
// Sessions per row when --sessions is not given.
export const DEFAULTS = Object.freeze({ legal: 500, protocol: 50, searcher: 200, contrast: 50, courier: 200 });

// A market at closing time: four players, five items, 165 coins. The script sells the axe
// on, tries to sell it again from its first owner, refuses one sale for funds, sells the ink
// for nothing and sends the first request again.
export const TRADE_WORLD = Object.freeze({ 'inv:dara': ['axe', 'bell'], 'inv:eli': ['cape'], 'inv:fern': ['drum', 'ink'], 'inv:gil': [], 'coins:dara': 15, 'coins:eli': 80, 'coins:fern': 30, 'coins:gil': 40 });
export const TRADE_SCRIPT = Object.freeze([
  { key: 'm1', seller: 'dara', buyer: 'eli', item: 'axe', price: 35 },
  { key: 'm2', seller: 'eli', buyer: 'gil', item: 'axe', price: 40 },
  { key: 'm3', seller: 'dara', buyer: 'fern', item: 'axe', price: 10 },
  { key: 'm4', seller: 'fern', buyer: 'dara', item: 'drum', price: 60 },
  { key: 'm5', seller: 'fern', buyer: 'eli', item: 'ink', price: 0 },
  { key: 'm1', seller: 'dara', buyer: 'eli', item: 'axe', price: 35 },
]);

const FROZEN = [sb.FILES.settings, sb.FILES.features, sb.FILES.detector];

function project(dir) {
  if (!dir) throw Error('Name your project folder: node lab.mjs scoreboard PROJECT');
  const p = resolve(dir);
  if (!existsSync(join(p, 'PROJECT.json'))) throw Error(`${dir} is not a project folder: make it with a starting route from lesson 12 (node examples/start-chapter.mjs ${dir} write, or supplied)`);
  return p;
}

function sessionsOption(o) {
  if (o.sessions === undefined) return null;
  const n = Number(o.sessions);
  if (o.sessions === true || !Number.isSafeInteger(n) || n < 1 || n > sb.MAX_SESSIONS) throw Error(`--sessions takes a whole number of sessions per row, from 1 to ${grouped(sb.MAX_SESSIONS)}`);
  return n;
}

// Loading a file of yours: a missing file, a missing export or a syntax error, in one line.
async function loaded(get) {
  try {
    return await get();
  } catch (e) {
    throw Error(String(e?.fields?.observed ?? e?.message ?? e).split('\n')[0]);
  }
}

// One line for an error that stopped the scoreboard.
function stopLine(e, p, during) {
  if (e instanceof sb.LearnerError) {
    if (e.notWritten) {
      const named = sb.firstLine(e.error).match(/^(\w+): not written yet/)?.[1] ?? e.fn;
      return `${named} in ${e.file} is not written yet: write it (API.md says what it must do), then run this again.`;
    }
    const where = sb.whereIn(e.error, p);
    const session = e.session ? `, in ${sessionLine(e.session)}` : during ? `, ${during}` : '';
    return `${e.message}${where ? ` (${where})` : ''}${e.call ? `, called as ${e.call}` : ''}${session}.`;
  }
  if (e instanceof sb.SessionError) {
    const where = sb.whereIn(e.error, p) ?? sb.whereInCourse(e.error);
    return `${sessionLine(e.session)} stopped: ${e.error?.name ?? 'Error'}: ${e.message}${where ? ` (${where})` : ''}. Look at what your files hand the server there: the view's message, the recorder's record, the admission's answers.`;
  }
  return `${during ? `${during}: ` : ''}${e?.name ?? 'Error'}: ${sb.firstLine(e)}`;
}
const sessionLine = ({ row, seed }) => `the ${sb.rowOf(row).prose} session with server seed ${seed} (checks/scoreboard.mjs playLobSession({ row: '${row}', seed: ${seed} }))`;

function run(p, during, f) {
  try {
    return f();
  } catch (e) {
    throw Error(stopLine(e, p, during));
  }
}

// Whether your detector's three files are the ones you froze in lesson 14.
function freezeNote(p, dir) {
  const folder = join(p, 'attempts');
  let latest = null;
  for (const name of existsSync(folder) ? readdirSync(folder).sort() : []) {
    const file = join(folder, name, 'freeze.json');
    if (!existsSync(file)) continue;
    try {
      const r = JSON.parse(readFileSync(file, 'utf8'));
      if (r.kind === 'freeze' && (!latest || r.at > latest.at)) latest = r;
    } catch { /* an unreadable record is left to labcmds/14.mjs to report */ }
  }
  if (!latest) return `You have not frozen your detector (node lab.mjs freeze ${dir}); the scoreboard uses your detector files as they are.`;
  const changed = FROZEN.filter((f) => {
    const path = join(p, f);
    const now = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
    return now !== latest.files?.[f];
  });
  return changed.length
    ? `${changed.join(' and ')} changed since your freeze of ${latest.at}; the scoreboard uses the files as they are now.`
    : `Your detector files are the ones you froze at ${latest.at}.`;
}

function verdictLine(pass, budget, measured, advice) {
  say(`  ${pass ? 'PASS' : 'MISS'}  ${budget}: ${measured}${pass || !advice ? '' : ` ${advice}`}`);
}

async function scoreboard({ plain, o }) {
  const dir = plain[0];
  const p = project(dir);
  const n = sessionsOption(o);
  const counts = n ? { legal: n, protocol: n, searcher: n, contrast: n, courier: n } : DEFAULTS;
  const started = performance.now();

  const loader = makeLoader(p);
  const lob = await loaded(() => sb.loadLob(loader));
  if (lob.settingsProblem) throw Error(lob.settingsProblem.replace('PROJECT', dir));
  const rewind = await loaded(() => sb.loadRewind(loader));
  const defence = await loaded(() => loader.json(sb.FILES.defence));
  const { window, problem } = sb.windowOf(defence);
  if (problem) throw Error(problem);
  const trades = await loaded(() => sb.loadTrade(loader));

  const perRow = (row) => counts[row.group];
  const rows = sb.ROWS.map((row) => run(p, `in the ${row.label} sessions`, () => sb.playLobRow({ row: row.id, base: SEEDS.lob, sessions: perRow(row), lob })));
  const recordings = ['delay', 'delay-misses'].map((name) => ({
    name,
    ...run(p, `scoring recordings/${name}.json`, () => sb.scoreRecordings(JSON.parse(readFileSync(join(root, 'recordings', `${name}.json`), 'utf8')), lob)),
  }));
  const courier = run(p, `in the courier sessions (runCourier seed ${SEEDS.courier}, window ${window})`, () => sb.courierAt({ seed: SEEDS.courier, sessions: counts.courier, window, rewind }));
  const trade = run(p, 'in the crash test of your trade', () => sb.crashTrades({ world: TRADE_WORLD, script: TRADE_SCRIPT, ...trades }));

  // ---------------------------------------------------------------- Lob
  say('The scoreboard: the course\'s clients against your whole defence.');
  say();
  say('Lob. Every session is a new createLobServer (public/runtime.mjs) with your admission, your view and your');
  say('recorder, and one client on its own network (public/sim.mjs, public/net.mjs). Your features and score judge');
  say(`each session's record and rounds against ${sb.FILES.settings}'s threshold ${lob.settings.threshold} (flagged at or above it).`);
  say(`Seeds: session n (from 0) of row r (from 0, in the order below) has server seed ${grouped(SEEDS.lob)} + 100,000 × r + n;`);
  say('the client and its two links are seeded from it as public/corpus.mjs seeds them. No corpus split, recording,');
  say('calibration run or check uses these seeds.');
  say(freezeNote(p, dir));
  say();
  say(`  ${pad('row', 22)}${lpad('sessions', 8)}  ${pad('hit rate', 21)}${lpad('refused', 7)}${lpad('stale', 7)}${lpad('flagged', 9)}`);
  for (const t of rows) {
    const note = t.group === 'contrast' ? '   contrast: no budget' : '';
    say(`  ${pad(t.label, 22)}${lpad(grouped(t.sessions), 8)}  ${pad(sb.hitText(t), 21)}${lpad(grouped(t.refusedNotStaleSessions), 7)}${lpad(grouped(t.staleSessions.length), 7)}${lpad(grouped(t.flagged), 9)}${note}`);
  }
  for (const r of recordings) say(`  ${pad(`recording ${r.name}`, 22)}${lpad(grouped(r.sessions), 8)}  ${pad(sb.hitText(r), 21)}${lpad('-', 7)}${lpad('-', 7)}${lpad(grouped(r.flagged), 9)}`);
  say('sessions: played; hit rate: hits over shots in all the row\'s sessions; refused: sessions in which your admission');
  say('refused an input other than as stale; stale: sessions in which it refused an input whose seq was not above the');
  say('newest admitted (replayed, or overtaken on the network by a newer one), which API.md\'s rule refuses; flagged:');
  say('sessions whose score reaches your threshold. The recordings (unit 14) are recorded sessions: scored, not played.');
  const legalStale = rows.filter((t) => t.group === 'legal').flatMap((t) => t.staleSessions.map((s) => ({ ...s, label: t.label })));
  if (legalStale.length) {
    say(`Legal players' stale refusals: ${legalStale.slice(0, 6).map((s) => `${s.label} (server seed ${s.seed}, tick ${s.first.tick}${s.count > 1 ? `, ${s.count} inputs` : ''})`).join('; ')}${legalStale.length > 6 ? `; and ${legalStale.length - 6} more` : ''}.`);
  } else {
    say('Legal players\' stale refusals: none in these sessions.');
  }
  const unscored = rows.filter((t) => t.unscored);
  if (unscored.length) say(`Note: your score gave something other than a finite number in ${unscored.map((t) => `${grouped(t.unscored)} ${t.label} sessions (first: server seed ${t.firstUnscored.seed}, ${JSON.stringify(t.firstUnscored.score) ?? 'undefined'})`).join(', ')}; those are counted as not flagged.`);

  // ---------------------------------------------------------------- courier
  const cv = sb.courierVerdict(courier);
  say();
  say(`Courier. runCourier seed ${SEEDS.courier}, ${grouped(courier.sessions)} sessions per model of 1,200 ticks, at your rewindWindow ${window} (${sb.FILES.defence}),`);
  say('judged by your judgeInteract, measureRtt and positionAt; counted by unit 15\'s rules.');
  say(`  honest       ${plural(courier.honest, 'press', 'presses')} decided; refused although in range at seen: ${grouped(courier.honestRefused)} (${pct2(cv.honest.rate)}); ${courier.deliveries.honest.toFixed(1)} deliveries a session`);
  say(`  naive faker  ${plural(courier.naive, 'press', 'presses')}; accepted while not in range now: ${grouped(courier.naiveAccepted)} (${pct2(cv.naive.rate)}); ${courier.deliveries.naive.toFixed(1)} deliveries a session`);
  say(`  slow-pong    ${plural(courier.slow, 'press', 'presses')}; accepted while not in range now: ${grouped(courier.slowAccepted)} (${pct2(courier.slow ? courier.slowAccepted / courier.slow : 0)}); ${courier.deliveries.slow.toFixed(1)} deliveries a session (no budget: lesson 17, "What the scoreboard doesn't show")`);

  // ---------------------------------------------------------------- trades
  const tv = sb.tradeVerdict(trade);
  say();
  say(`Trades. Your trade and recover on a script of ${trade.requests} requests among 4 players (${trade.writes} writes without a crash): a crash after each`);
  say('write; the server restarts and runs your recover (also crashed after each of its own writes, then run again); the client sends');
  say(`its request again, then the rest of the script. ${grouped(trade.crashPoints)} crash points in trades, ${grouped(trade.recoveryPoints)} in recovery:`);
  say(`  items held twice ${grouped(trade.heldTwice)}, items held by nobody ${grouped(trade.missing)}, coins made or lost ${grouped(trade.coinsMoved)}${trade.coinsWrong ? ` (at ${plural(trade.coinsWrong, 'crash point')})` : ''}${trade.unreached.length ? `; the crash never came at write ${trade.unreached.join(', ')} (your trades made fewer writes than without it)` : ''}`);

  // ---------------------------------------------------------------- budgets
  const pv = sb.protocolVerdict(rows);
  const lv = sb.legalVerdict(rows);
  const sv = sb.searcherVerdict(rows.find((t) => t.row === 'searcher'));
  say();
  say('Budgets (API.md, unit 17). The checks play fresh sessions with other seeds.');
  verdictLine(pv.pass, 'each protocol cheat: every cheating input refused, in every session',
    pv.cheats.map((c) => `${c.row} ${grouped(c.refused)} of ${grouped(c.cheating)}`).join(', ') + '.',
    pv.first && `First admitted: ${sb.rowOf(pv.first.row).label}, server seed ${pv.first.seed}, tick ${pv.first.tick}: ${pv.first.text} (${pv.first.why}); ${pv.first.answer}. Revisit ${sb.LESSON.admission}.`);
  verdictLine(lv.refusals.pass, 'legal players, all six models: no input refused except as stale',
    `${grouped(lv.refusals.sessions)} of ${grouped(lv.sessions)} sessions had one${lv.refusals.stale ? `; ${plural(lv.refusals.stale, 'stale refusal')} (allowed, listed above)` : ''}.`,
    lv.refusals.first && `First: ${sb.rowOf(lv.refusals.first.row).label}, server seed ${lv.refusals.first.seed}, tick ${lv.refusals.first.tick}: ${lv.refusals.first.text}; ${lv.refusals.first.answer}, but the rules admit it: ${lv.refusals.first.why}. Revisit ${sb.LESSON.admission}.`);
  verdictLine(lv.flags.pass, `legal players: at most 1 session in ${sb.BUDGET.legalFlagsOneIn} flagged`,
    `${grouped(lv.flags.flagged)} of ${grouped(lv.flags.sessions)} (at most ${grouped(lv.flags.allowed)}).`,
    `The flagged sessions include ${lv.flags.which.slice(0, 4).map((x) => `${x.row} ${x.seed} (score ${Number(x.score).toFixed(2)})`).join(', ')}. Your threshold must come from the dev split alone (${sb.LESSON.detector}); do not move it to fit these sessions. A change to your detector now means freezing again, and your receipt shows the later freeze.`);
  verdictLine(lv.expert.pass, `expert players: hit rate at least ${percent0(sb.BUDGET.expertHitRate)}`,
    `${sb.percent(lv.expert.rate)} (${grouped(lv.expert.hits)}/${grouped(lv.expert.shots)}).`,
    `Revisit ${lv.refusals.pass ? sb.LESSON.view : sb.LESSON.admission}: experts aim from what your view sends${lv.refusals.pass ? '' : ', and your admission refuses some of their inputs'}.`);
  verdictLine(sv.hit.pass, `the searching client, live against your view: hit rate at most ${percent0(sb.BUDGET.searcherHitRate)}`,
    `${sb.percent(sv.hit.rate)} (${grouped(sv.hit.hits)}/${grouped(sv.hit.shots)}).`,
    `It aims from what your view sends; against the full view it hits ${sb.percent(sb.hitRate(rows.find((t) => t.row === 'searcherFull')))}. Revisit ${sb.LESSON.view}.`);
  verdictLine(sv.flags.pass, `the searching client: at least ${percent0(sb.BUDGET.searcherFlagged)} of its sessions flagged`,
    `${grouped(sv.flags.flagged)} of ${grouped(sv.flags.sessions)} (${sb.percent(sv.flags.sessions ? sv.flags.flagged / sv.flags.sessions : null)}).`,
    `Revisit ${sb.LESSON.detector}.`);
  verdictLine(cv.honest.pass, `courier at your window ${window}: honest presses refused at most ${percent0(sb.BUDGET.honestRefused)}`,
    `${pct2(cv.honest.rate)} (${grouped(cv.honest.refused)} of ${grouped(cv.honest.of)} refused although in range at seen).`,
    `Revisit ${sb.LESSON.window}: lesson 15's table prices every window.`);
  verdictLine(cv.naive.pass, `courier: the naive faker's lies accepted at most ${percent0(sb.BUDGET.naiveAccepted)}`,
    `${pct2(cv.naive.rate)} (${grouped(cv.naive.accepted)} of ${grouped(cv.naive.of)} presses accepted while not in range now).`,
    `Revisit ${sb.LESSON.window}: the rewind must be bounded by the client's own round trip as well as the window.`);
  verdictLine(tv.pass, 'trades: no item in two places and no coin made or lost, after a crash at any write',
    `${grouped(trade.heldTwice)} held twice, ${grouped(trade.missing)} held by nobody, ${grouped(trade.coinsMoved)} coins made or lost, at ${grouped(trade.crashPoints + trade.recoveryPoints)} crash points.`,
    `${trade.first ? `First: ${trade.first.story}: ${[...trade.first.afterRecovery.map((x) => `after recovery ${x}`), ...trade.first.atEnd.map((x) => `at the end ${x}`)].slice(0, 3).join('; ')}. ` : ''}Revisit ${sb.LESSON.trade}.`);
  const verdicts = [pv.pass, lv.refusals.pass, lv.flags.pass, lv.expert.pass, sv.hit.pass, sv.flags.pass, cv.honest.pass, cv.naive.pass, tv.pass];
  const met = verdicts.filter(Boolean).length;
  say(met === verdicts.length
    ? `All ${verdicts.length} budgets met on these sessions. node lab.mjs check ${dir} 17 judges them on sessions you have not seen.`
    : `${met} of ${verdicts.length} budgets met. Each MISS names the lesson to revisit.`);
  say(`Played in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  if (met !== verdicts.length) process.exitCode = 1;
}

function percent0(x) {
  return `${Math.round(100 * x)}%`;
}

export const commands = [
  { name: 'scoreboard', args: 'PROJECT [--sessions N]', about: 'your whole defence against the course\'s clients, and each unit 17 budget; --sessions plays N in every row', run: scoreboard },
];
