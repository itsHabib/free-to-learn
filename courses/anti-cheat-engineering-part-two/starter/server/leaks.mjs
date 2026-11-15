// Unit 13: find what a view leaks.

// findLeaks(viewFn, game, info): the sorted list of the names in game.hidden that reach
// the client through viewFn. A name leaks when changing that hidden thing alone, on a
// copy of the game (game.clone(), then setHidden(name, k) for k = 1, 2, 3; a false return
// means nothing changed), changes JSON.stringify(viewFn(copy, info)). Each name appears
// once. game itself must not change.
export function findLeaks(viewFn, game, info) {
  throw new Error('findLeaks: not written yet');
}
