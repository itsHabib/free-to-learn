import { valueKey, copy, validatePredicate } from './base.mjs';
export const COST_WEIGHTS = { candidateVisits: 1, versionExaminations: 2, predicateEvaluations: 1, hashBuild: 2, hashProbe: 1, outputRows: 1 };
export const PLAN_IDS = ['scan-loop', 'scan-hash', 'index-loop'];
export function weightedCost(work, weights = COST_WEIGHTS) {
  return Object.keys(COST_WEIGHTS).reduce((n, key) => n + (work[key] ?? 0) * weights[key], 0);
}
const eq = (field, value) => ({ op: 'eq', field, value });
const read = (db, tx, table, p, access = 'scan') => [...db.scan(tx, table, p, { access })];
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function analyze(db, tx, table, field) {
  db.active(tx); db.key(table,0); validatePredicate(db.schema, table, { op: 'isNull', field });
  if (tx.writes.size) throw Error('The planning slice requires a read-only transaction.');
  const index = db.createIndex(table, field), before = db.metrics.versionExaminations;
  const rows = read(db, tx, table, { op: 'true' });
  const metadata = { table, field, snapshot: tx.snapshot, physicalCSN: db.csn, physicalRevision: db.physicalRevision,
    physicalKeys: [...db.histories.values()].filter(h => h[0].table === table).length,
    versionProbes: db.metrics.versionExaminations - before,
    indexCandidates: [...index.values()].map(x => ({ value: x.value, count: x.keys.size })) };
  return db.summarizeSnapshot(rows, field, metadata);
}

export function explain(db, tx, query, leftStats, rightStats, weights = COST_WEIGHTS) {
  db.active(tx); validateQuery(db, query);
  if (tx.writes.size) throw Error('The planning slice requires a read-only transaction.');
  for (const key of Object.keys(COST_WEIGHTS)) if (!finite(weights[key])) throw Error(`Invalid weight ${key}`);
  if (leftStats.table !== query.left || rightStats.table !== query.right || leftStats.field !== query.field || rightStats.field !== query.field) throw Error('Statistics do not match query tables/field.');
  const result = db.planEqualityJoin(copy(leftStats), copy(rightStats), query.value, copy(weights));
  if (!result || !Array.isArray(result.candidates) || result.candidates.length !== 3) throw Error('Return all three candidate estimates.');
  const ids = new Set(result.candidates.map(c => c.id));
  if (ids.size !== 3 || PLAN_IDS.some(id => !ids.has(id))) throw Error('Candidate IDs must match the supplied physical plans.');
  for (const c of result.candidates) {
    if (!finite(c.estimatedRows) || !finite(c.cost) || Object.keys(COST_WEIGHTS).some(k => !finite(c.work[k]))) throw Error('Cost/row/work estimates must be finite and nonnegative.');
    if (Math.abs(c.cost - weightedCost(c.work, weights)) > 1e-9) throw Error('Estimated cost does not match its work vector.');
  }
  const selected = result.candidates.find(c => c.id === result.selected);
  if (!selected || selected.cost > Math.min(...result.candidates.map(c => c.cost)) + 1e-9) throw Error('Choose a minimum estimated-cost plan; ties are allowed.');
  return { ...result, snapshot: tx.snapshot, statisticsSnapshots: [leftStats.snapshot, rightStats.snapshot], physicalCSN: db.csn, physicalRevision: db.physicalRevision,
    stale: leftStats.snapshot !== tx.snapshot || rightStats.snapshot !== tx.snapshot || leftStats.physicalCSN !== db.csn || rightStats.physicalCSN !== db.csn || leftStats.physicalRevision !== db.physicalRevision || rightStats.physicalRevision !== db.physicalRevision };
}

function validateQuery(db, q) {
  if (!q || q.left === q.right) throw Error('Use two distinct table names for this slice.');
  for (const table of [q.left, q.right]) { db.key(table, 0); validatePredicate(db.schema, table, eq(q.field, q.value)); }
  if (db.schema[q.left][q.field] !== db.schema[q.right][q.field]) throw Error('Join fields must have the same type.');
}

export function executePlan(db, tx, query, id) {
  db.active(tx); validateQuery(db, query); if (!PLAN_IDS.includes(id)) throw Error('Unknown plan.');
  // Logical dependencies are fixed before physical selection. Extra per-access
  // footprints are harmless; none replaces these whole logical domains.
  tx.reads.push({ kind: 'predicate', table: query.left, predicate: eq(query.field, query.value) });
  tx.reads.push({ kind: 'predicate', table: query.right, predicate: { op: 'true' } });
  const initial = { ...db.metrics }, extra = { hashBuild: 0, hashProbe: 0, outputRows: 0 }, output = [];
  const emit = (l, r) => {
    if (output.length >= 50000) { const e = Error('Query output limit exceeded.'); e.code = 'RESOURCE'; throw e; }
    output.push({ leftKey: l.key, rightKey: r.key, left: l.row, right: r.row }); extra.outputRows++;
  };
  const left = read(db, tx, query.left, eq(query.field, query.value), id === 'index-loop' ? 'index' : 'scan');
  if (id === 'scan-hash') {
    const buckets = new Map();
    for (const r of read(db, tx, query.right, { op: 'true' })) {
      extra.hashBuild++; const key = valueKey(r.row[query.field]);
      if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(r);
    }
    for (const l of left) { extra.hashProbe++; for (const r of buckets.get(valueKey(l.row[query.field])) ?? []) emit(l, r); }
  } else {
    for (const l of left) for (const r of read(db, tx, query.right, eq(query.field, l.row[query.field]), id === 'index-loop' ? 'index' : 'scan')) emit(l, r);
  }
  const work = { ...extra };
  for (const key of Object.keys(initial)) work[key] = db.metrics[key] - initial[key];
  output.sort((a, b) => a.leftKey - b.leftKey || a.rightKey - b.rightKey);
  return { id, snapshot: tx.snapshot, rows: output, work, cost: weightedCost(work) };
}

export function comparePlans(db, tx, query, stats, weights = COST_WEIGHTS) {
  const explanation = explain(db, tx, query, stats.left, stats.right, weights), physicalCSN = db.csn, physicalRevision = db.physicalRevision;
  db.createIndex(query.left, query.field); db.createIndex(query.right, query.field);
  const runs = PLAN_IDS.map(id => executePlan(db, tx, query, id));
  if (db.csn !== physicalCSN || db.physicalRevision !== physicalRevision || runs.some(r => r.snapshot !== tx.snapshot)) throw Error('Comparison changed image or snapshot.');
  const expected = JSON.stringify(runs[0].rows);
  if (runs.some(r => JSON.stringify(r.rows) !== expected)) throw Error('Physical plans disagree on the query result.');
  for (const run of runs) run.cost = weightedCost(run.work, weights);
  return { explanation, runs, setup: 'Indexes built before measured runs; maintenance cost is separate in index-build events.' };
}
