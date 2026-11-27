// Unit 9: the capstone. render(scene, { stage: 9, mode: 'visible' })
// bins the scene with your bin and then calls renderVisible(ctx).
//
// ctx: { W, H, size, tris, lists, chip, background,
//        shadeWarp(k, x0, y0, mask), store(tx, ty, parts) }
//   tris[k]   { id, pts, win }: window triangle k, in draw order
//   lists[n]  the triangles binned to tile n (n = ty * tilesX + tx)
//   chip      on-chip { depth, rgba, ids } for one size x size tile
//   shadeWarp runs the scene's shader as one warp: triangle k on the
//             4 x 2 block at (x0, y0), lanes in mask. Returns eight
//             colours as RGBA levels (null for lanes not in mask).
//             It is the only way to get a colour, and it counts
//             every warp it launches.
//   store     writes the chip's colour (and ids) for tile (tx, ty)
//             to the framebuffer: parts ['colour'].
import { rasterize } from './raster.mjs';
import { depthTest, interpolate } from './interp.mjs';

// region: renderVisible
export function renderVisible(ctx) {
  throw new Error('renderVisible: not written yet');
}
// endregion: renderVisible
