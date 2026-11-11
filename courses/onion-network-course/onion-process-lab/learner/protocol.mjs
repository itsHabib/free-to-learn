// Your implementation is loaded by the client AND by each separate relay process.
import {randomUUID} from 'node:crypto';
import {LabError, requireThat, freshSecret, importSecret, destroyKey, seal, open, context} from '../runtime/crypto.mjs';

export function selectPath(directory, failedIds = [], length = 3) {
  throw new LabError('TODO_P1', 'Choose distinct online IDs, excluding failedIds, or NO_PATH.');
}

export async function createCircuit(path, control) {
  throw new LabError('TODO_P2', 'Generate fresh circuit/key material; install only each relay\'s own state.');
}

export function installCircuit(config, states) {
  throw new LabError('TODO_P2', 'Import local keys and install local neighbor and replay state.');
}

export function wrapRequest(hops, body, seq) {
  throw new LabError('TODO_P3', 'Seal {next, body} from exit to entry.');
}

export async function handleCell(state, packet, io) {
  throw new LabError('TODO_P4', 'Authenticate, validate route, record sequence, forward/serve, wrap reply.');
}

export function unwrapReply(hops, packet, expectedSeq) {
  throw new LabError('TODO_P4', 'Open every backward layer in path order using expectedSeq.');
}

export function recoveryPlan(directory, failedIds, oldPath) {
  throw new LabError('TODO_P5', 'Choose equal-length replacement or stop with NO_PATH.');
}
