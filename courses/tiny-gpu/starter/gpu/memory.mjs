// Unit 7: memory transactions, coalescing and the texture cache.
// Memory moves in 32-byte segments. A warp's request costs one
// transaction per distinct segment its active lanes touch, and a
// texture read goes through a small cache of 32-byte lines.

// region: SEGMENT
export const SEGMENT = 32; // bytes in one memory transaction
// endregion: SEGMENT

// region: CACHE
// The texture cache the pipeline uses: 8 sets of 8 lines, 2 KB.
export const CACHE = { sets: 8, ways: 8 };
// endregion: CACHE

// region: transactions
// addresses[k] is lane k's byte address; bit k of mask is lane k.
export function transactions(addresses, mask) {
  throw new Error('transactions: not written yet');
}
// endregion: transactions

// region: TextureCache
// Set-associative, least recently used replacement. Line n of memory
// (bytes 32n to 32n + 31) can only live in set n % sets.
export class TextureCache {
  constructor({ sets, ways }) {
    throw new Error('TextureCache: not written yet');
  }

  access(addr) {
    throw new Error('TextureCache.access: not written yet');
  }
}
// endregion: TextureCache

// region: texelAddress
// Byte address of texel (x, y). 'linear': row after row. 'tiled':
// blocks of 4 x 2 texels, 32 bytes each, the blocks row after row.
export function texelAddress(tex, x, y, layout) {
  throw new Error('texelAddress: not written yet');
}
// endregion: texelAddress

// region: storeTexture
// The texture's bytes in memory order for a layout. 'tiled' copies
// block by block: in each 4 x 2 block, the bottom row of four texels,
// then the row above.
export function storeTexture(tex, layout) {
  if (layout === 'linear') return tex.data;
  if (layout !== 'tiled') throw new Error(`unknown layout ${layout}`);
  if (tex.w % 4 || tex.h % 2) {
    throw new Error('a tiled texture needs w % 4 = 0 and h % 2 = 0');
  }
  const out = new Uint8Array(tex.data.length);
  let at = 0;
  for (let by = 0; by < tex.h; by += 2) {
    for (let bx = 0; bx < tex.w; bx += 4) {
      for (let y = by; y < by + 2; y++) {
        const row = (y * tex.w + bx) * 4;
        out.set(tex.data.subarray(row, row + 16), at);
        at += 16;
      }
    }
  }
  return out;
}
// endregion: storeTexture
