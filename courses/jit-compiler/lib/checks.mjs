import assert from 'node:assert/strict';

const over30 = [['load'], ['const', 30], ['gt']];
const belowMinus70 = [['const', -70], ['load'], ['gt']];
const below2 = [['const', 2], ['load'], ['gt']];
const overMinus5 = [['load'], ['const', -5], ['gt']];
const equalsSelf = [['load'], ['load'], ['eq']];
const always = [['const', 0], ['const', 0], ['eq']];
const band = [
  ['load'], ['const', -4], ['gt'],
  ['const', 2], ['load'], ['gt'], ['and'],
];
const invalidPrograms = [
  [], [['gt']], [['const', 2147483648]], [['const', 1.1]], [['load', 1]],
  [['const', 0], ['and']], [['load']], [['wat']],
  [...over30, ['load']], [...over30, ['const', 0], ['eq']],
];

function checkInterpreter({ interpret }) {
  for (const [program, value, answer, reason] of [
    [over30, 31, true, 'The row is the left operand of gt'],
    [over30, 30, false, 'gt excludes the boundary'],
    [over30, null, false, 'A comparison that consumes null returns false'],
    [belowMinus70, -80, true, 'The top stack item is the right operand'],
    [below2, null, false, 'For 2 > null, guard the right operand before comparing'],
    [overMinus5, null, false, 'For null > -5, guard the left operand before comparing'],
    [equalsSelf, -1, true, 'Both load instructions read the same row'],
    [equalsSelf, null, false, 'Even two null operands make eq return false'],
    [always, null, true, 'Null only affects comparisons that actually consume it'],
    [band, 0, true, 'and consumes two booleans'],
    [band, 2, false, 'Both halves of the conjunction must hold'],
    [band, -4, false, 'Check each open boundary'],
    [band, null, false, 'Both gt comparisons in the band must reject a missing quantity before and'],
  ]) {
    assert.equal(interpret(program, value), answer, reason);
  }
  for (const program of invalidPrograms) {
    assert.throws(() => interpret(program, 0), TypeError, 'Reject malformed or ill-typed tuples');
  }
  for (const value of [undefined, NaN, 2.5, -2147483649, 2147483648, '30']) {
    assert.throws(() => interpret(over30, value), TypeError, 'Reject values outside nullable i32');
  }
}

function checkCompiler({ compile }) {
  const table = new WebAssembly.Table({ element: 'anyfunc', initial: 1 });
  for (const literal of [-2147483648, -8193, -65, -64, -1, 0, 63, 64, 8192, 2147483647]) {
    const predicate = compile([['load'], ['const', literal], ['eq']]);
    table.set(0, predicate); // A plain JavaScript closure cannot inhabit this table.
    assert.equal(predicate(literal), 1, 'Encode the full signed literal ' + literal);
    assert.equal(predicate(literal === 0 ? 1 : 0), 0, 'eq must reject another integer');
  }
  const within = compile(band);
  for (const value of [-2147483648, -5, -4, -1, 0, 1, 2, 3, 2147483647]) {
    assert.equal(within(value), Number(-4 < value && value < 2), 'Check signed gt and operand order at ' + value);
  }
  for (const program of invalidPrograms) {
    assert.throws(() => compile(program), TypeError, 'Reject bad programs before emitting a module');
  }
}

function checkHandoff({ run }) {
  const seen = [];
  const choose = observation => {
    seen.push(observation);
    return observation.start === 3 ? 'interpret' : 'compile';
  };
  const calls = [];
  const { matches, trace } = run(over30, [45, null, 46, 30, 31, null, null, 40], {
    choose, batchSize: 3, auditCompiledRows: count => calls.push(count),
  });
  assert.deepEqual(matches, [0, 2, 4, 7], 'Keep absolute row indices. Resume on the failing row exactly once');
  assert.deepEqual(trace.filter(event => event.kind === 'guard-failure'), [
    { kind: 'guard-failure', at: 1, resumeAt: 1 },
    { kind: 'guard-failure', at: 6, resumeAt: 6 },
  ], 'The interpreter owns the complete suffix after the first failed guard in each compiled batch');
  assert.deepEqual(trace.filter(event => event.kind === 'compile'), [{ kind: 'compile', at: 0 }],
    'Later compiled batches should reuse the query-local predicate');
  const summaries = trace.filter(event => event.kind === 'batch');
  assert.deepEqual(summaries.map(b => [b.start, b.end, b.interpreted, b.compiledRows, b.nulls, b.guardFailures]),
    [[0, 3, 2, 1, 1, 1], [3, 6, 3, 0, 1, 0], [6, 8, 2, 0, 1, 1]],
    'Record actual work, including the short tail batch');
  assert.deepEqual(calls, summaries.map(batch => batch.compiledRows),
    'Call the supplied Wasm predicate once for each reported compiled row');
  assert.deepEqual(seen, [
    { start: 0, end: 3, remainingRows: 8, compiled: false, previous: { rows: 0, nulls: 0, guardFailures: 0 } },
    { start: 3, end: 6, remainingRows: 5, compiled: true, previous: { rows: 3, nulls: 1, guardFailures: 1 } },
    { start: 6, end: 8, remainingRows: 2, compiled: true, previous: { rows: 3, nulls: 1, guardFailures: 0 } },
  ], 'A decision can see only the previous completed batch and the scan bounds');
  const force = { choose: () => 'compile', batchSize: 4 };
  for (const [program, reason] of [[overMinus5, 'null > -5'], [below2, '2 > null']]) {
    assert.deepEqual(run(program, [null, 1], force).matches, [1],
      'Guarded fallback must preserve the missing operand in ' + reason);
  }
  assert.deepEqual(run(always, [5, null, null, -1, 0], force).matches, [0, 1, 2, 3, 4],
    'A null row can still pass a constant-only predicate. Interpret the failing row');
  const signed = run(band, [-3, -3, -4, 1, 2, -1], force);
  assert.deepEqual(signed.matches, [0, 1, 3, 5], 'Rows with equal values keep separate positions');
  assert.deepEqual(run(over30, [], force), { matches: [], trace: [] }, 'Empty input has no batches');
  const defaultRun = run(over30, [45, null]);
  assert.deepEqual(defaultRun.matches, [0]);
  assert.equal(defaultRun.trace[0].action, 'interpret', 'Default to the interpreter');
  assert.throws(() => run(over30, [0], { batchSize: 0 }), RangeError);
  assert.throws(() => run(over30, [0], { choose: () => 'native' }), TypeError);
  assert.throws(() => run(over30, [1.5], force), TypeError);
  assert.throws(() => run([['load']], [], force), TypeError);
}

export const checks = { '01': checkInterpreter, '02': checkCompiler, '03': checkHandoff };
