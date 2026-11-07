// This is your optimizer. The support/ directory is supplied infrastructure.
// Implement only the named target functions. See API.md and lessons/.
import { Editor } from './support/editor.mjs';
import { cfg, definitions, uses, literal, evaluate, valueJSON, run, verify } from './support/runtime.mjs';

export function compare(sourceResult, targetResult) {
  throw new Error('TODO U01: compare completed observable behavior; unknown is not equal');
}
export function dominators(program) {
  throw new Error('TODO U02: return {blockID: sortedArrayOfDominatorIDs}');
}
export function scalar(program, contract = {}) {
  throw new Error('TODO U03: return an Editor artifact with useful scalar rewrites');
}
export function constants(program, contract = {}) {
  throw new Error('TODO U04: propagate constants and simplify justified branches/phis');
}
export function aliases(program, leftPointer, rightPointer, contract = {}) {
  throw new Error('TODO U05: return must, may, or no from static facts');
}
export function memory(program, contract = {}) {
  throw new Error('TODO U05: reuse a memory value only when justified');
}
export function loops(program, contract = {}) {
  throw new Error('TODO U06: move supported loop-invariant work or explain refusal');
}
export function decide(report) {
  throw new Error('TODO U07: return {accept: boolean, reason: string}');
}
export function reduce(program, input, transform) {
  throw new Error('TODO U08: return {program, input, explanation} retaining the same wrong result');
}
