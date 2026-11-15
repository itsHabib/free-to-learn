// Supplied by the course: reads a program listing (programs/NAME.json) into
// plain objects. It decodes nothing; the listing was decoded from the .wasm file
// when the course was built (decoding is taught in Sightline).
//
// loadProgram(json or object) returns the listing with three conveniences:
//   program.func(index)    the defined function with that index (imports come first,
//                          so the first defined function has index imports.length)
//   program.typeOf(index)  { params, results } of any function, import or defined
//   program.exportIndex(name)  the function index of an exported function
// Constants are converted: an "i64.const" value "42n" becomes the BigInt 42n,
// and each data segment's hex text becomes a Uint8Array named `bytes`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function readProgram(name) {
  return loadProgram(JSON.parse(readFileSync(join(here, '..', 'programs', `${name}.json`), 'utf8')));
}

export function loadProgram(source) {
  if (source && source.loaded === true) return source;
  const p = typeof source === 'string' ? JSON.parse(source) : structuredClone(source);
  if (p?.format !== 'ttd2-program-1') throw Error('loadProgram: not a program listing (format ttd2-program-1)');
  for (const f of p.functions) {
    f.code = f.code.map(ins => ins[0] === 'i64.const' ? [ins[0], BigInt(String(ins[1]).replace(/n$/, ''))] : ins);
  }
  p.data = p.data.map(d => ({ offset: d.offset, bytes: Uint8Array.from(Buffer.from(d.bytes, 'hex')) }));
  const byIndex = new Map(p.functions.map(f => [f.index, f]));
  Object.defineProperties(p, {
    loaded: { value: true },
    func: { value: index => { const f = byIndex.get(index); if (!f) throw Error(`no defined function with index ${index}`); return f; } },
    typeOf: { value: index => index < p.imports.length ? p.types[p.imports[index].type] : p.types[byIndex.get(index)?.type] },
    exportIndex: { value: name => { const e = p.exports.find(x => x.kind === 'func' && x.name === name); if (!e) throw Error(`no exported function named ${name}`); return e.index; } },
  });
  return p;
}
