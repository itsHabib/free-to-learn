// Unit 8: tiled rendering. Triangles are first sorted into the
// screen tiles they may touch (binning); then each tile is drawn on
// its own, with its colour and depth held on chip, and its colour is
// written to memory once.
import { SUB, rasterize } from './raster.mjs';
import { depthTest, interpolate } from './interp.mjs';
import { ATTRS } from './shader.mjs';

// region: TILE
export const TILE = 16; // pixels on a side of a tile
// endregion: TILE

// region: bin
// tris[k] is three [x, y] points in subpixels. Returns one list per
// tile, tile (tx, ty) at index ty * tilesX + tx, each holding the
// indices k of the triangles whose pixel bounding box touches it.
export function bin(tris, W, H, size = TILE) {
  throw new Error('bin: not written yet');
}
// endregion: bin

// region: renderTile
// ctx: { W, H, size, tris: [{ id, pts, win }], chip, background,
//        shade(t, frags), store(tx, ty, parts) }
// chip is the tile's on-chip memory, reused for every tile:
// { depth, rgba, ids }, pixel (x, y) at (y - y0) * size + (x - x0).
export function renderTile(tx, ty, list, ctx) {
  throw new Error('renderTile: not written yet');
}
// endregion: renderTile
