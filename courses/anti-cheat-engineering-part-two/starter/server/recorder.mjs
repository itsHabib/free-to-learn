// Unit 12: record a session, and replay a record to check it. API.md, "The record" and
// "replay", has the format and the reasons.
import { createLobSession } from '../../public/session.mjs';

// createRecorder({ seed, mode }): returns { admitted(tick, input), finish(end, final) }.
// The server calls admitted(tick, input) for every input it admits, in order, and
// finish(end, final) once, when the session ends; finish returns the record in the
// format API.md gives: { v: 1, game: 'lob', mode, seed, inputs, end, final }.
export function createRecorder({ seed, mode }) {
  throw new Error('createRecorder: not written yet');
}

// replay(record, admission): re-run the session from the record's seed with
// createLobSession, applying each recorded input at its tick through admission
// ({ parseInput, admit }), for record.end ticks. Returns { ok: true, final } or
// { ok: false, reason } with the first failing reason of shape, order, refused, final,
// checked in that order. Trust nothing in the record but the seed.
export function replay(record, admission) {
  throw new Error('replay: not written yet');
}
