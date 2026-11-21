// Unit 15, new application: a rewound press that costs something. Lesson 15, "Use the idea
// on a new case", gives the task; examples/check-moved.mjs checks it. No finished
// judgeUnmoved is supplied.
//
// judgeUnmoved(args) takes the same args as judgeInteract and returns { accept, at, reason }.
// It decides exactly as judgeInteract does, with one more rule: when judgeInteract would
// accept at a tick `at` earlier than `now`, refuse with reason 'moved' if the courier's
// position at `now` is more than `range` away from its position at `at` (distance squared
// more than range * range). Every other verdict, and every press judged at now, is
// judgeInteract's. Read positions with args.positionAt. You may import judgeInteract from
// './rewind.mjs'.
export function judgeUnmoved(args) {
  throw new Error('judgeUnmoved: not written yet');
}
