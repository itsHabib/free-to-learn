// Grows one island's layout in the sandbox, as the page does, up to placing its things. Used by lesson 6's checks.
const N = 512;
export function layout(world, seed = 7) {
  const P = world.call('islandParams', seed);
  const H = world.call('fillLand', new Float32Array(N * N), P);
  const E = new Float32Array(N * N * 3);
  world.call('erode', H, E, 70000, world.call('hash2', seed, 5, 9));
  const L = world.call('bakeLand', H);
  const M = world.call('coverMasks', H, L, E);
  const S = world.call('scout', H, L, M, P);
  const village = world.call('layVillage', H, L, M, P, S, world.call('hash2', seed, 6, 2));
  world.call('bakeLand', H, L, village.dirty);
  return { P, H, E, L, M, S, village };
}
export const place = (world, l, seed = 7) => world.call('placeThings', l.H, l.L, l.M, l.P, l.S, { ...l.village, lists: l.village.lists.map((a) => a.slice()) }, world.call('hash2', seed, 6, 1));
