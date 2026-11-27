// Supplied: unit 7's floor, seen from straight above. One textured
// quad fills the picture with one texel per pixel. floorScene() lays
// the texture along the picture; floorScene({ turn: 90 }) turns it a
// quarter turn, so moving right on screen moves up the texture.
import { withShader } from './programs.mjs';

// Square stones, five to a side, with darker joints, a little worn.
// 100 texels wide, not a power of two: with blocks stored row after
// row, a width of 128 would put a whole column of blocks in one set
// of the cache, and the tiled layout would miss for that reason.
export function stoneTexture(size = 100) {
  const cell = size / 5;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const odd = (Math.floor(x / cell) + Math.floor(y / cell)) & 1;
      const joint = x % cell === 0 || y % cell === 0;
      const wear = ((x * 7 + y * 13) % 11) * 2;
      let c = odd ? [214, 190, 158] : [236, 226, 206];
      c = c.map((v) => v - wear);
      if (joint) c = [150, 132, 112];
      data.set([...c, 255], (y * size + x) * 4);
    }
  }
  return { w: size, h: size, data };
}

export function floorScene(opts = {}) {
  const { turn = 0, width = 160, height = 120, size = 100 } = opts;
  if (turn !== 0 && turn !== 90) throw new Error('floor: turn 0 or 90');
  // texture coordinates of the picture's corners, one texel a pixel
  const su = width / size;
  const sv = height / size;
  const uv = turn === 0
    ? [[0, 0], [su, 0], [su, sv], [0, sv]]
    : [[sv, 0], [sv, su], [0, su], [0, 0]];
  const corner = [[0, 0], [width, 0], [width, height], [0, height]];
  const vert = (k) => ({ p: corner[k], c: [1, 1, 1], uv: uv[k],
    n: [0, 0, 1] });
  const scene = {
    name: turn ? 'floor-turned' : 'floor',
    width, height, clear: [0.97, 0.96, 0.93],
    textures: { floor: stoneTexture(size) },
    tris: [
      { id: 0, tex: 'floor', v: [vert(0), vert(1), vert(2)] },
      { id: 1, tex: 'floor', v: [vert(0), vert(2), vert(3)] },
    ],
  };
  return withShader(scene, 'textured');
}
