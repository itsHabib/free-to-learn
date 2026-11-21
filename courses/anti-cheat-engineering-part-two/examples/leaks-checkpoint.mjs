// Unit 13 end checkpoint: server/leaks.mjs with its walked-through region filled.
// examples/start-unit13.mjs copies it into a project as server/leaks.mjs.

// region: find-leaks
export function findLeaks(viewFn, game, info) {
  const before = JSON.stringify(viewFn(game, info));
  const leaking = [];
  for (const name of game.hidden) {
    for (let k = 1; k <= 3; k++) {
      const copy = game.clone();
      const changed = copy.setHidden(name, k);
      if (changed && JSON.stringify(viewFn(copy, info)) !== before) {
        leaking.push(name);
        break;
      }
    }
  }
  return leaking.sort();
}
// endregion: find-leaks
