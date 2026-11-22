import { pathToFileURL } from 'node:url';
import { signedI32, instantiatePredicate } from '../lib/wasm.mjs';

// region: threshold
function over(threshold) {
  const bytes = [
    0x20, 0x00,                     // local.get 0
    0x41, ...signedI32(threshold),   // i32.const threshold
    0x4a,                           // i32.gt_s
  ];
  return instantiatePredicate(bytes);
}
// endregion: threshold

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const predicate = over(-70);
  console.log([-71, -70, -69, 0].map(predicate));
}
