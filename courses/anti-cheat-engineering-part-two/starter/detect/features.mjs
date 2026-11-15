// Unit 14: one session's features. API.md, "Unit 14", defines each one exactly.
import { median, quantile, mean, sd, correlation } from '../../public/stats.mjs';

// features(session): session is a corpus case, { record, rounds } (public/corpus.mjs).
// Returns { shots, hitRate, missMedian, fireMedian, fireSpread, inputsMedian, cadenceCV,
// missLag1 } as API.md defines them, with null where a feature is undefined for the
// session.
export function features(session) {
  throw new Error('features: not written yet');
}
