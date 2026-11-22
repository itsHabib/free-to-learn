// Each file names one committed transaction. A fully written temporary file is
// hard-linked into place so concurrent local writers never expose half a record.
import { mkdirSync, readFileSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const filename = (dir, revision) => join(dir, 'commit-' + revision + '.json');

export function sync(dir, store) {
  mkdirSync(dir, {recursive:true});
  let revision = store.revision + 1;
  while (true) {
    let raw;
    try { raw = readFileSync(filename(dir,revision), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return revision; throw error; }
    store.commit(JSON.parse(raw));
    revision++;
  }
}

export function append(dir, store, operations) {
  mkdirSync(dir, {recursive:true});
  const next = sync(dir,store);
  // Validate the transaction against the same store contract as the observer.
  store.commit(operations);
  const temp = join(dir, '.write-' + randomUUID());
  writeFileSync(temp, JSON.stringify(operations), {flag:'wx'});
  try {
    let revision = next;
    while (true) {
      try { linkSync(temp, filename(dir,revision)); return revision; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      revision++;
    }
  } finally { unlinkSync(temp); }
}
