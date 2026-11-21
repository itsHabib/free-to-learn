// Print what a recording made by `node lab.mjs record` holds.
// Usage: node examples/show-recording.mjs FILE [OTHER_FILE]
// With two files it also names the first call whose memory hashes differ.
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length < 1 || files.length > 2)
  throw Error('Usage: node examples/show-recording.mjs FILE [OTHER_FILE]');

const text = (x) => `${x.name}(${x.args.join(', ')})`;
const recordings = files.map((file) => {
  const json = readFileSync(file, 'utf8');
  const r = JSON.parse(json);
  console.log(`${file}: ${r.format}, program ${r.program}`);
  console.log(
    `  ${r.calls.length} calls, ${r.answers.length} answers, ${r.hashes.length} hashes`,
  );
  console.log(
    `  call 0: ${text(r.calls[0])} returned ${r.results[0]}; memory hash after it ${r.hashes[0].slice(0, 16)}...`,
  );
  console.log(
    `  answer 0: ${text(r.answers[0])} returned ${r.answers[0].result}`,
  );
  return r;
});

if (recordings.length === 2) {
  const [a, b] = recordings;
  const k = a.hashes.findIndex((hash, i) => hash !== b.hashes[i]);
  console.log(
    k < 0
      ? 'The two recordings have the same memory hash after every call.'
      : `First call whose memory hashes differ: call ${k}, ${text(a.calls[k])}`,
  );
}
