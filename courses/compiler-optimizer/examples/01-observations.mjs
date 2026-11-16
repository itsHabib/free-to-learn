// Local U01 diagnostics, not learner receipts. Run from the course directory.
import { run } from '../runtime.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function observationProbes() {
  const program = {
    version: 1, name: 'store_emit_return',
    params: [{ id: 'p', type: 'ptr<i8>' }], returns: 'i8', entry: 'entry',
    blocks: [{ id: 'entry', phis: [], instructions: [
      { id: 'six', op: 'const', type: 'i8', value: '6' },
      { op: 'store', args: ['p', 'six'] },
      { op: 'emit', args: ['six'] },
    ], term: { op: 'ret', value: 'six' } }],
  };
  const input = {
    args: { p: { object: 'A', offset: '0' } },
    heap: { A: { type: 'i8', cells: ['0', '1'] }, B: { type: 'i8', cells: ['2'] } },
  };
  const returned = run(program, input);
  const trapProgram = structuredClone(program);
  trapProgram.blocks[0].term = { op: 'trap', code: 'halt' };
  const trapped = run(trapProgram, input);
  const copy = () => structuredClone(returned);
  const cell = copy(); cell.heap.A.cells[0] = '7';
  const cells = copy(); cells.heap.A.cells.reverse();
  const reordered = copy(); reordered.heap = { B: reordered.heap.B, A: reordered.heap.A };
  const eventType = copy(); eventType.events[0].type = 'i32';
  const returnType = copy(); returnType.type = 'i32';
  const returnValue = copy(); returnValue.value = '7';
  const missingObject = copy(); delete missingObject.heap.B;
  const objectType = copy(); objectType.heap.B.type = 'i32';
  const shorter = copy(); shorter.heap.A.cells.pop();
  const events = copy(); events.events.push({ type: 'i8', value: '1' });
  const reversedEvents = structuredClone(events); reversedEvents.events.reverse();
  const trapHeap = structuredClone(trapped); trapHeap.heap.A.cells[0] = '7';
  return [
    ['same completed result, different counters', returned, { ...copy(), steps: 999, counts: {} }, true],
    ['heap keys reordered', returned, reordered, true],
    ['return value changed', returned, returnValue, false],
    ['return type changed', returned, returnType, false],
    ['stored cell changed', returned, cell, false],
    ['cell order changed', returned, cells, false],
    ['heap object missing', returned, missingObject, false],
    ['heap element type changed', returned, objectType, false],
    ['heap cell count changed', returned, shorter, false],
    ['event type changed', returned, eventType, false],
    ['event order changed', events, reversedEvents, false],
    ['duplicate event added', returned, { ...copy(), events: [...returned.events, ...returned.events] }, false],
    ['same trap after a store', trapped, structuredClone(trapped), true],
    ['trap code changed', trapped, { ...structuredClone(trapped), code: 'other' }, false],
    ['heap before trap changed', trapped, trapHeap, false],
    ['return versus trap', returned, trapped, false],
    ['equal unfinished prefixes', { ...copy(), kind: 'unknown' }, { ...copy(), kind: 'unknown' }, false],
    ['invalid is not completed', { kind: 'invalid' }, { kind: 'invalid' }, false],
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const learner = await import(pathToFileURL(resolve(process.argv[2] ?? 'work/optimizer.mjs')).href);
  let failures = 0;
  for (const [label, left, right, expected] of observationProbes()) {
    try {
      const actual = learner.compare(left, right);
      console.log(`${label}: expected ${expected}, got ${actual}`);
      if (actual !== expected) failures += 1;
    } catch (error) {
      console.log(`${label}: expected ${expected}, threw ${error.message}`);
      failures += 1;
    }
  }
  console.log(`${failures} probe(s) disagree; no course receipt was written.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
