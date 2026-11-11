import { fixture } from '../checks.mjs';
import { analyze, comparePlans } from './plans.mjs';

export function executeScenario(Engine, scenario) {
  if (!Array.isArray(scenario.actions) || scenario.actions.length > 500) throw Error('Scenario needs at most 500 actions.');
  const db = fixture(Engine, scenario.initial ?? [], { mode: scenario.mode ?? 'snapshot', ...(scenario.schema ? { schema: scenario.schema } : {}) });
  const transactions = new Map(), queries = new Map(), statistics = new Map(), results = [];
  try {
    for (const action of scenario.actions) results.push({ action, result: perform(action) });
    return { mode: db.mode, results, events: db.events, pins: db.pins(), versions: db.versionCount() };
  } catch (error) { error.partial = { completed: results, events: db.events }; throw error; }
  function perform(a) {
    const tx = transactions.get(a.tx);
    if (a.op === 'begin') {
      if (tx?.state === 'active') throw Error('Cannot replace an active transaction alias.');
      const next = db.begin({ readOnly: a.readOnly ?? false }); transactions.set(a.tx, next); return { snapshot: next.snapshot };
    }
    if (a.op === 'get') return db.get(tx, a.table, a.key);
    if (a.op === 'put') { db.put(tx, a.table, a.key, a.row); return 'staged'; }
    if (a.op === 'delete') { db.delete(tx, a.table, a.key); return 'staged'; }
    if (a.op === 'scan') return [...db.scan(tx, a.table, a.predicate, { access: a.access ?? 'scan' })];
    if (a.op === 'open-scan') {
      if (queries.has(a.as)) throw Error('Query alias already exists.');
      queries.set(a.as, db.scan(tx, a.table, a.predicate, { access: a.access ?? 'scan' })); return 'opened';
    }
    if (a.op === 'pull') { if (!queries.has(a.query)) throw Error('Unknown query alias.'); return queries.get(a.query).next(); }
    if (a.op === 'close-query') { if (!queries.has(a.query)) throw Error('Unknown query alias.'); queries.get(a.query).close(); return 'closed'; }
    if (a.op === 'analyze') { const result = analyze(db, tx, a.table, a.field); statistics.set(a.as, result); return result; }
    if (a.op === 'compare-plans') return comparePlans(db, tx, a.query, { left: statistics.get(a.leftStats), right: statistics.get(a.rightStats) });
    if (a.op === 'inspect') return { pins: db.pins(), versions: db.versionCount(), csn: db.csn };
    if (a.op === 'commit') return db.commit(tx);
    if (a.op === 'abort') return db.abort(tx);
    if (a.op === 'vacuum') return db.vacuum();
    throw Error(`Unknown action ${a.op}`);
  }
}
