/** Already-parsed inputs may update intent, never actor identity or game results. */
export function admitInput(state, input, tick) {
  if (input.seq <= state.lastSeq) return { status: 'stale', next: state };
  return {
    status: 'admitted',
    next: {
      lastSeq: input.seq,
      lastSeen: tick,
      expiresAt: tick + 4,
      move: input.move,
      pendingInteract: state.pendingInteract || input.interact,
    },
  };
}

/** The admission tick precedes movement; ticks T+1 through T+4 may move. */
export function movementActive(state, tick) {
  return tick <= state.expiresAt;
}
