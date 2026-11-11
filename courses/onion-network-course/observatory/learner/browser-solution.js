// Browser project. The eight function names and arguments match the CLI contract.
// Helpers supplied by the worker: seal, open, context, requireThat, LabError.
// seal/open return Promises here: await them inside async functions.
// No imports, exports, DOM, network access, or persistent key storage are needed.

function selectPath(relays, failedIds = [], length = 3) {
  throw new LabError('TODO_M1', 'Return distinct usable IDs or throw NO_PATH.');
}

async function wrapRequest(hops, request, seq) {
  throw new LabError('TODO_M2', 'Build layers exit-to-entry; await seal for each layer.');
}

async function peelForward(state, packet) {
  throw new LabError('TODO_M3', 'Await open, validate next, then acceptSequence after validation.');
}

async function addReturnLayer(hop, body, seq) {
  throw new LabError('TODO_M3', 'Return a backward seal operation for this hop.');
}

async function unwrapReply(hops, packet, expectedSeq) {
  throw new LabError('TODO_M3', 'Await open for EVERY layer with the caller\'s expectedSeq.');
}

function acceptSequence(seen, seq) {
  throw new LabError('TODO_M4', 'Reject invalid/repeated sequences, then add a fresh sequence.');
}

function recoveryPlan(relays, failedIds, oldPath) {
  throw new LabError('TODO_M5', 'Rebuild with a valid full-length path, or stop with NO_PATH.');
}

function correlate(entryTimes, candidates, tolerance) {
  throw new LabError('TODO_M6', 'Retain every compatible timing candidate, including ties.');
}
