// The first dev session of each kind (dev-novice-0, dev-skilled-0, and so on), for the
// unit 14 probes. Each is a corpus case; play(c) is what a detector is given.
import { KINDS, makeCorpus } from '../public/corpus.mjs';

export function firstSessions() {
  return makeCorpus({
    split: 'dev',
    counts: Object.fromEntries(KINDS.map((kind) => [kind, 1])),
  });
}

export const play = (c) => ({
  record: { inputs: c.record.inputs },
  rounds: c.rounds,
});
