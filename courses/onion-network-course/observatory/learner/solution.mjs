// Your cumulative project. Keep these export names; use any correct algorithm.
// Supplied crypto must be used. Implement routing policy, not AES.
import { seal, open, context, requireThat, LabError } from '../runtime/crypto.mjs';

export function selectPath(relays, failedIds = [], length = 3) {
  throw new LabError('TODO_M1', 'M1: return distinct online relay IDs, excluding failedIds, or throw NO_PATH.');
}

export function wrapRequest(hops, request, seq) {
  throw new LabError('TODO_M2', 'M2: nest {next, body} from exit to entry using each forwardKey.');
}

export function peelForward(state, packet) {
  throw new LabError('TODO_M3', 'M3: authenticate one layer, validate its next hop, then commit freshness in M4.');
}

export function addReturnLayer(hop, body, seq) {
  throw new LabError('TODO_M3', 'M3: seal a backward layer around the reply or the next inner packet.');
}

export function unwrapReply(hops, packet, expectedSeq) {
  throw new LabError('TODO_M3', 'M3: open every backward layer with the caller\'s expectedSeq; reject any mismatched layer.');
}

export function acceptSequence(seen, seq) {
  throw new LabError('TODO_M4', 'M4: reject invalid or repeated sequence numbers, then record a fresh one.');
}

export function recoveryPlan(relays, failedIds, oldPath) {
  throw new LabError('TODO_M5', 'M5: return {action: "rebuild", path}, or {action: "stop", reason: "NO_PATH"}.');
}

export function correlate(entryTimes, candidates, tolerance) {
  throw new LabError('TODO_M6', 'M6: return every candidate ID whose inter-event gaps match within tolerance.');
}
