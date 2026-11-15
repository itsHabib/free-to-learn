// Unit 17: the scoreboard. Each case plays fresh sessions, on seeds no lab command uses,
// through checks/scoreboard.mjs (the code node lab.mjs scoreboard measures with) and holds
// your whole defence to its budgets from API.md's unit 17. A failure names the budget,
// what was measured, a session that shows it, and the lesson to revisit.
import { fail, show } from './harness.mjs';
import * as sb from './scoreboard.mjs';

export const title = 'The scoreboard';

// Lob session n of row r has server seed 71,000,000 + 100,000 * r + n (the rows in
// checks/scoreboard.mjs's ROWS order); the courier's runCourier seed is 71. The scoreboard
// command uses 17,000,000+ and 17, the corpus 1,000,000+ and 2,000,000+.
const BASE = 71_000_000;
const COURIER_SEED = 71;
// Sessions per row: per protocol cheat, per legal model, of the searcher, per courier model.
export const COUNTS = Object.freeze({ protocol: 40, legal: 250, searcher: 150, courier: 150 });
// The legal sessions in all (1,500), and how many of them may be flagged (12: 1 in 125).
const LEGAL_SESSIONS = COUNTS.legal * sb.LEGAL.length;
const LEGAL_FLAGS = Math.floor(LEGAL_SESSIONS / sb.BUDGET.legalFlagsOneIn);

// A square at dusk: four players, four items, 80 coins. The gem is sold, offered again by
// its first owner, sold on for nothing; one sale is a coin short, the next has exactly the
// price; the first request comes again, and a request reuses a key with another body.
const WORLD = Object.freeze({ 'inv:hal': ['gem', 'hat'], 'inv:ida': ['oar'], 'inv:jo': [], 'inv:kit': ['map'], 'coins:hal': 5, 'coins:ida': 50, 'coins:jo': 25, 'coins:kit': 0 });
const SCRIPT = Object.freeze([
  { key: 'c1', seller: 'hal', buyer: 'jo', item: 'gem', price: 25 },
  { key: 'c2', seller: 'hal', buyer: 'ida', item: 'gem', price: 30 },
  { key: 'c3', seller: 'jo', buyer: 'kit', item: 'gem', price: 0 },
  { key: 'c4', seller: 'ida', buyer: 'hal', item: 'oar', price: 31 },
  { key: 'c5', seller: 'ida', buyer: 'hal', item: 'oar', price: 30 },
  { key: 'c1', seller: 'hal', buyer: 'jo', item: 'gem', price: 25 },
  { key: 'c3', seller: 'jo', buyer: 'kit', item: 'gem', price: 1 },
]);

const grouped = (n) => Number(n).toLocaleString('en-US');
const pct2 = (x) => `${(100 * x).toFixed(2)}%`;
const courierCall = (window) => `runCourier({ seed: ${COURIER_SEED}, sessions: ${COUNTS.courier}, window: ${window}, judge: your judgeInteract, measureRtt: your measureRtt, positionAt: your positionAt }) from public/courier.mjs`;
const tradeStory = `the trade script of checks/17.mjs (${SCRIPT.map((r) => sb.describeRequest(r)).join('; ')}) from ${Object.entries(WORLD).map(([k, v]) => `${k} ${show(v)}`).join(', ')}`;

// Runs part of the scoreboard. Your function's error, or a session that stops, becomes a
// failure that names the session; "not written yet" passes through.
function measured(env, where, f) {
  try {
    return f();
  } catch (e) {
    if (e instanceof sb.LearnerError) {
      if (e.notWritten) throw e.error;
      const at = sb.whereIn(e.error, env.workDir);
      fail({
        checked: `your ${e.fn} runs ${where}`,
        input: `${e.session ? sb.sessionText(e.session.row, e.session.seed) : where}${e.call ? `; the call: ${e.call}` : ''}`,
        observed: `${e.message}${at ? ` (${at})` : ''}`,
        expected: 'an answer by API.md\'s rules, with no error',
      });
    }
    if (e instanceof sb.SessionError) {
      const at = sb.whereIn(e.error, env.workDir) ?? sb.whereInCourse(e.error);
      fail({
        checked: 'every session plays to its end',
        input: sb.sessionText(e.session.row, e.session.seed),
        observed: `the session stopped: ${e.error?.name ?? 'Error'}: ${e.message}${at ? ` (${at})` : ''}`,
        expected: 'the session runs to its end: the official client and the players read every message your view sends, and your detector reads your recorder\'s record',
      });
    }
    throw e;
  }
}

function needThreshold(lob) {
  if (lob.settingsProblem) fail({ checked: `${sb.FILES.settings} holds your frozen threshold`, input: sb.FILES.settings, observed: lob.settingsProblem, expected: `a finite threshold: revisit ${sb.LESSON.detector}` });
}

const sessionAt = (x) => `${sb.sessionText(x.row, x.seed)}: the message ${show(x.text, 220)}, decided at tick ${x.tick}`;

export const cases = [
  {
    id: '17.protocol', title: 'every cheating input refused', timeLimitMs: 30000,
    requirement: `The four protocol cheats (hitClaim, fireTwice, outOfRange, replay), ${COUNTS.protocol} fresh sessions each through your admission: every input API.md's rules refuse (a message that is not exactly the five fields in range, a seq not above the newest admitted, anything while the shell flies, a second fire in a round) is refused, in every session.`,
    async run(env) {
      const lob = await sb.loadLob(env, { detector: false });
      const rows = sb.CHEATS.map((id) => measured(env, `in the ${id} sessions`, () => sb.playLobRow({ row: id, base: BASE, sessions: COUNTS.protocol, lob, detect: false })));
      const v = sb.protocolVerdict(rows);
      for (const c of v.cheats) {
        if (!c.cheating) fail({ checked: `the ${c.row} sessions send cheating inputs`, input: `${grouped(c.sessions)} ${c.row} sessions from server seed ${sb.lobSeed(BASE, c.row, 0)}`, observed: 'no message the rules refuse was sent', expected: `${c.row}'s cheat, as public/adversaries.mjs describes it (report this: the course's client did not cheat)` });
      }
      if (!v.pass) {
        const f = v.first;
        const c = v.cheats.find((x) => x.row === f.row);
        fail({
          checked: 'each protocol cheat: every cheating input refused, in every session (API.md, unit 17)',
          input: sessionAt(f),
          observed: `${f.answer}. ${c.row}: ${grouped(c.cheating - c.refused)} of its ${grouped(c.cheating)} cheating inputs admitted, in ${grouped(c.broken)} of ${grouped(c.sessions)} sessions`,
          expected: `refused, because ${f.why}. Revisit ${sb.LESSON.admission}.`,
        });
      }
    },
  },
  {
    id: '17.legal', title: 'legal players: nothing refused, few flagged, experts hit', timeLimitMs: 60000,
    requirement: `The six legal player models, ${COUNTS.legal} fresh sessions each (${grouped(LEGAL_SESSIONS)} in all) through your admission, view, recorder and frozen detector: no input refused except as stale (seq not above the newest admitted); at most ${LEGAL_FLAGS} of the ${grouped(LEGAL_SESSIONS)} sessions flagged; experts hit at least ${Math.round(100 * sb.BUDGET.expertHitRate)}% of their shots.`,
    async run(env) {
      const lob = await sb.loadLob(env);
      needThreshold(lob);
      const rows = sb.LEGAL.map((id) => measured(env, `in the ${id} sessions`, () => sb.playLobRow({ row: id, base: BASE, sessions: COUNTS.legal, lob })));
      const v = sb.legalVerdict(rows);
      if (!v.refusals.pass) {
        const f = v.refusals.first;
        fail({
          checked: 'legal players, all six models: no input refused except as stale (API.md, unit 17)',
          input: sessionAt(f),
          observed: `${f.answer}. In ${grouped(v.refusals.sessions)} of the ${grouped(v.sessions)} legal sessions an input was refused other than as stale`,
          expected: f.rule === 'admit'
            ? `admitted, because ${f.why}: a legal player's input may be refused only as stale. Revisit ${sb.LESSON.admission}.`
            : `a legal player's input refused only as stale; the rules refuse this one because ${f.why} (report this: the course's player sent it)`,
        });
      }
      if (!v.expert.pass) {
        fail({
          checked: `expert players: hit rate at least ${Math.round(100 * sb.BUDGET.expertHitRate)}% (API.md, unit 17)`,
          input: `${grouped(v.expert.sessions)} expert sessions, server seeds ${sb.lobSeed(BASE, 'expert', 0)} to ${sb.lobSeed(BASE, 'expert', v.expert.sessions - 1)} (${sb.sessionText('expert', sb.lobSeed(BASE, 'expert', 0))}, and so on)`,
          observed: `hit rate ${sb.percent(v.expert.rate)} (${grouped(v.expert.hits)} hits of ${grouped(v.expert.shots)} shots)`,
          expected: `at least ${Math.round(100 * sb.BUDGET.expertHitRate)}%. Your admission refused none of their inputs, so look at what your view sends: experts aim from the screen it draws. Revisit ${sb.LESSON.view}.`,
        });
      }
      if (!v.flags.pass) {
        const top = [...v.flags.which].sort((a, b) => b.score - a.score).slice(0, 5);
        fail({
          checked: `legal sessions flagged by your frozen detector (at most ${grouped(v.flags.allowed)} of ${grouped(v.flags.sessions)} allowed; API.md, unit 17)`,
          input: `${grouped(v.flags.sessions)} legal sessions (${COUNTS.legal} of each model), your score of each session's { record: { inputs }, rounds } against ${sb.FILES.settings}'s threshold ${lob.settings.threshold}`,
          observed: `${grouped(v.flags.flagged)} flagged, among them ${top.map((x) => `${x.row} with server seed ${x.seed} (score ${Number(x.score).toFixed(3)})`).join(', ')}`,
          expected: `at most ${grouped(v.flags.allowed)}. Your threshold must come from the dev split alone: the one chooseThreshold gives on the dev legal scores at budget 0.002 (${sb.LESSON.detector}). Fitted that way, it flags more than ${grouped(v.flags.allowed)} of these ${grouped(v.flags.sessions)} sessions only about once in 100, by chance. Do not move it to fit these sessions: any change to your detector now is a re-tune, which means freezing again, and your receipt shows the later freeze.`,
        });
      }
    },
  },
  {
    id: '17.searcher', title: 'the searching client: bounded and caught', timeLimitMs: 30000,
    requirement: `The searching client (public/adversaries.mjs searcher), ${COUNTS.searcher} fresh sessions live against your view, admission and recorder: its hit rate at most ${Math.round(100 * sb.BUDGET.searcherHitRate)}%, and at least ${Math.round(100 * sb.BUDGET.searcherFlagged)}% of its sessions flagged by your frozen detector.`,
    async run(env) {
      const lob = await sb.loadLob(env);
      needThreshold(lob);
      const t = measured(env, 'in the searcher sessions', () => sb.playLobRow({ row: 'searcher', base: BASE, sessions: COUNTS.searcher, lob }));
      const v = sb.searcherVerdict(t);
      const seeds = `${grouped(t.sessions)} searcher sessions, server seeds ${sb.lobSeed(BASE, 'searcher', 0)} to ${sb.lobSeed(BASE, 'searcher', t.sessions - 1)} (${sb.sessionText('searcher', sb.lobSeed(BASE, 'searcher', 0))}, and so on)`;
      if (!v.hit.pass) {
        fail({
          checked: `the searching client, live against your view: hit rate at most ${Math.round(100 * sb.BUDGET.searcherHitRate)}% (API.md, unit 17)`,
          input: seeds,
          observed: `hit rate ${sb.percent(v.hit.rate)} (${grouped(v.hit.hits)} hits of ${grouped(v.hit.shots)} shots)`,
          expected: `at most ${Math.round(100 * sb.BUDGET.searcherHitRate)}%: it aims from what your view sends, so it hits more when the view tells it more than the screen draws. Revisit ${sb.LESSON.view}.`,
        });
      }
      if (!v.flags.pass) {
        const missed = [];
        // The first few sessions your detector let through, to look at.
        for (let n = 0; n < t.sessions && missed.length < 3; n += 1) {
          const seed = sb.lobSeed(BASE, 'searcher', n);
          if (!t.flaggedSessions.some((x) => x.seed === seed)) missed.push(seed);
        }
        fail({
          checked: `the searching client: at least ${Math.round(100 * sb.BUDGET.searcherFlagged)}% of its sessions flagged (API.md, unit 17)`,
          input: `${seeds}, your score against ${sb.FILES.settings}'s threshold ${lob.settings.threshold}`,
          observed: `${grouped(v.flags.flagged)} of ${grouped(v.flags.sessions)} flagged (${sb.percent(v.flags.sessions ? v.flags.flagged / v.flags.sessions : null)}); not flagged: server seeds ${missed.join(', ')}${t.unscored ? `; your score gave no finite number in ${grouped(t.unscored)} sessions` : ''}`,
          expected: `at least ${grouped(Math.ceil(sb.BUDGET.searcherFlagged * v.flags.sessions))}. Its hit rate here was ${sb.percent(v.hit.rate)}. Revisit ${sb.LESSON.detector}.`,
        });
      }
    },
  },
  {
    id: '17.courier', title: 'the courier at your window', timeLimitMs: 20000,
    requirement: `capstone/defence.json's rewindWindow, with your judgeInteract, measureRtt and positionAt, on ${COUNTS.courier} fresh courier sessions per client model: honest presses refused although in range at seen at most ${Math.round(100 * sb.BUDGET.honestRefused)}% of honest presses, and the naive faker's presses accepted while not in range now at most ${Math.round(100 * sb.BUDGET.naiveAccepted)}% of its presses.`,
    async run(env) {
      const { window, problem } = sb.windowOf(env.json(sb.FILES.defence));
      if (problem) fail({ checked: `${sb.FILES.defence} holds your window`, input: sb.FILES.defence, observed: problem, expected: '{ "rewindWindow": <the window you chose in lesson 15, a whole number of ticks> } (lesson 17, "Your window")' });
      const rewind = await sb.loadRewind(env);
      const c = measured(env, `in the courier sessions of ${courierCall(window)}`, () => sb.courierAt({ seed: COURIER_SEED, sessions: COUNTS.courier, window, rewind }));
      const v = sb.courierVerdict(c);
      if (!v.honest.pass) {
        const o = v.honest.first;
        fail({
          checked: `courier at your window ${window}: honest presses refused at most ${Math.round(100 * sb.BUDGET.honestRefused)}% (API.md, unit 17)`,
          input: courierCall(window),
          observed: `${pct2(v.honest.rate)}: ${grouped(v.honest.refused)} of ${grouped(v.honest.of)} honest presses refused although the courier was in range at the tick the player saw; the first in session ${o.session}, seen ${o.seen}, decided at tick ${o.now}, judged at ${o.at} (${o.reason})`,
          expected: `at most ${Math.round(100 * sb.BUDGET.honestRefused)}%. Revisit ${sb.LESSON.window}: lesson 15's table prices each window, and the budget is judged on sessions you have not seen.`,
        });
      }
      if (!v.naive.pass) {
        const o = v.naive.first;
        fail({
          checked: `courier at your window ${window}: the naive faker's lies accepted at most ${Math.round(100 * sb.BUDGET.naiveAccepted)}% (API.md, unit 17)`,
          input: courierCall(window),
          observed: `${pct2(v.naive.rate)}: ${grouped(v.naive.accepted)} of its ${grouped(v.naive.of)} presses accepted while the courier was not in range at the deciding tick; the first in session ${o.session}, claiming seen ${o.seen}, decided at tick ${o.now}, judged at ${o.at}`,
          expected: `at most ${Math.round(100 * sb.BUDGET.naiveAccepted)}%: it answers pings at once, so its own round trip allows a rewind of about 2 ticks. Revisit ${sb.LESSON.window}: the rewind is min(window, ceil(rtt) + 1).`,
        });
      }
    },
  },
  {
    id: '17.trade', title: 'trades survive a crash at any write', timeLimitMs: 20000,
    requirement: 'A script of trades with your trade and recover, crashed after each of its writes; recovery itself crashed after each of its writes and run again; then the client\'s retry and the rest of the script: every item in exactly one inventory and the coins adding up to what they did, after recovery and at the end.',
    async run(env) {
      const f = await sb.loadTrade(env);
      const t = measured(env, `in the crash test of ${tradeStory}`, () => sb.crashTrades({ world: WORLD, script: SCRIPT, ...f }));
      const v = sb.tradeVerdict(t);
      if (t.unreached.length) {
        fail({
          checked: 'trades: a crash at any write (API.md, unit 17)',
          input: tradeStory,
          observed: `with a crash armed for write ${t.unreached[0]}, your trades made fewer writes and the crash never came`,
          expected: `the same ${grouped(t.writes)} writes as without a crash, so each can be crashed. Revisit ${sb.LESSON.trade}.`,
        });
      }
      if (!v.pass) {
        const first = [...t.first.afterRecovery.map((x) => `after recovery ${x}`), ...t.first.atEnd.map((x) => `at the end ${x}`)];
        fail({
          checked: 'trades: no item in two places and no coin made or lost, after a crash at any write (API.md, unit 17)',
          input: `${tradeStory}; ${t.first.story}`,
          observed: `${first.join('; ')}. Over all ${grouped(t.crashPoints + t.recoveryPoints)} crash points: ${grouped(t.heldTwice)} items held twice, ${grouped(t.missing)} held by nobody, ${grouped(t.coinsMoved)} coins made or lost`,
          expected: `every item in exactly one inventory and ${Object.entries(WORLD).filter(([k]) => k.startsWith('coins:')).reduce((s, [, v]) => s + v, 0)} coins in all, at every crash point. Revisit ${sb.LESSON.trade}.`,
        });
      }
    },
  },
];
