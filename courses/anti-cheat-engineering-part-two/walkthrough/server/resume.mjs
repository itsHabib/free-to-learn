// Unit 12, new application: carry on a session after a restart. Lesson 12, "Use the idea
// on a new case", gives the task; examples/check-resume.mjs checks it. No finished
// resumeState is supplied.
//
// resumeState(record, admission): the server restarted, and all it has of a session that
// is still playing is the record it had written so far. Return the admission state,
// { lastSeq, firedRound }, that the server held when that record was finished, so it can
// go on admitting the session's messages: { ok: true, state }. If your replay refuses the
// record, return what your replay returned instead, { ok: false, reason }.
// admission is { parseInput, admit } (yours).
export function resumeState(record, admission) {
  throw new Error('resumeState: not written yet');
}
