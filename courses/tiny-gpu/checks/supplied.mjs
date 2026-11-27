// The counts some cases judge (warps, cache misses, bytes moved) are
// made by supplied code: three whole files, and a few supplied parts
// of memory.mjs and tiles.mjs. A case that reads those counts runs
// only when that code is the course's own, the copy in starter/gpu/.
// Your functions, and anything you add outside these parts, are not
// compared.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WHOLE = ['pipeline.mjs', 'matrix.mjs', 'png.mjs'];
const PARTS = {
  'memory.mjs': ['SEGMENT', 'CACHE', 'storeTexture'],
  'tiles.mjs': ['TILE'],
};

const read = (p) => (existsSync(p)
  ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null);

function region(text, name) {
  const open = `// region: ${name}\n`;
  const a = text.indexOf(open);
  const b = text.indexOf(`// endregion: ${name}`, a + 1);
  return a < 0 || b < 0 ? null : text.slice(a + open.length, b);
}

// The first supplied file or part that is not the course's copy, as
// a phrase ('gpu/pipeline.mjs', 'CACHE in gpu/memory.mjs'), or null.
export function suppliedChanged(ctx) {
  const mine = (f) => read(join(ctx.project, 'gpu', f));
  const ours = (f) => read(join(ctx.course, 'starter', 'gpu', f));
  for (const f of WHOLE) {
    const o = ours(f);
    if (o !== null && mine(f) !== o) return { file: f, what: `gpu/${f}` };
  }
  for (const [f, names] of Object.entries(PARTS)) {
    const o = ours(f);
    const m = mine(f);
    if (o === null || m === null) continue;
    for (const name of names) {
      const want = region(o, name);
      if (want !== null && region(m, name) !== want) {
        return { file: f, what: `${name} in gpu/${f}` };
      }
    }
  }
  return null;
}

// Wraps a case's run: it fails, saying why, before it reads a count
// that changed supplied code could have made.
export function needsSupplied(run) {
  return async (gpu, ctx) => {
    const changed = suppliedChanged(ctx);
    if (!changed) return run(gpu, ctx);
    const { file, what } = changed;
    return { message: `${what} is not the course's copy ` +
      `(starter/gpu/${file}). It is supplied, and this case judges ` +
      'counts that supplied code makes (warps, cache misses, bytes), so ' +
      'it runs only on the course\'s copy: a changed copy could change ' +
      `the verdict. Put it back from starter/gpu/${file} (keep your ` +
      'version under another name if you want it), then check again.' };
  };
}
