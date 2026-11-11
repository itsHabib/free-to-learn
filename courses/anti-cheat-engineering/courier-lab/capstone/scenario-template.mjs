import assert from 'node:assert/strict';
import { request, session, submit, state } from './client.mjs';

export async function scenario({ base, moveActor }) {
  // Write your independent HTTP assertions here. The owner moveActor control
  // takes (session.id, {x, y}); it is not a client gameplay endpoint.
  // Assert balances, receipt history, original retry receipts and refusal state.
  throw new Error('Write your HTTP scenario before submitting.');
}
