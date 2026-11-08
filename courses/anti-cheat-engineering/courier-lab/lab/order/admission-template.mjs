/** state: { lastSeq, lastSeen, expiresAt, move, pendingInteract }; input is already parsed. */
export function admitInput(state, input, tick) {
  // TODO: implement strict ordering, four-tick renewal, and interaction coalescing.
  throw new Error('Implement admitInput before submitting.');
}

export function movementActive(state, tick) {
  // TODO: decide whether this tick is within the admitted intent lifetime.
  throw new Error('Implement movementActive before submitting.');
}
