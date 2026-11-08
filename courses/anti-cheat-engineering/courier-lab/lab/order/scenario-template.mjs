import assert from 'node:assert/strict';
import { join, input, state } from './clients/http-client.mjs';

export async function scenario({ base, advance }) {
  // TODO: use fresh actors (at most four), HTTP requests, bounded advance(n),
  // and assertions on snapshots. All seven named wrong variants must fail.
  // A passing empty scenario is insufficient: every wrong variant survives it.
  throw new Error('Write your independent scenario before submitting.');
}
