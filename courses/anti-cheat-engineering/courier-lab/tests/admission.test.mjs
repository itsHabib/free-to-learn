import test from 'node:test';
import assert from 'node:assert/strict';
import { admitInput, movementActive } from '../admission.mjs';

const initial = () => ({ lastSeq: 0, lastSeen: 0, expiresAt: 0, move: 'idle', pendingInteract: false });
const input = (seq, move = 'idle', interact = false) => ({ v: 1, seq, move, interact });

test('fresh admission changes exactly the five intent fields without mutating its arguments', () => {
  const state = Object.freeze(initial());
  const request = Object.freeze(input(17, 'E', true));
  const result = admitInput(state, request, 9);
  assert.deepEqual(result, {
    status: 'admitted',
    next: { lastSeq: 17, lastSeen: 9, expiresAt: 13, move: 'E', pendingInteract: true },
  });
  assert.deepEqual(state, initial());
  assert.deepEqual(request, input(17, 'E', true));
  assert.notEqual(result.next, state);
});

test('duplicate and older inputs leave every intent field unchanged, including after expiry', () => {
  const state = Object.freeze({ lastSeq: 31, lastSeen: 5, expiresAt: 9, move: 'N', pendingInteract: false });
  for (const seq of [31, 30, 1]) {
    for (const tick of [5, 9, 12]) {
      const result = admitInput(state, Object.freeze(input(seq, 'E', true)), tick);
      assert.equal(result.status, 'stale');
      assert.deepEqual(result.next, state);
    }
  }
});

test('new sequence gaps are legal and pending interaction survives later false inputs', () => {
  const staged = admitInput(initial(), input(17, 'W', true), 3).next;
  const replacement = admitInput(Object.freeze(staged), input(99, 'E', false), 3);
  assert.deepEqual(replacement, {
    status: 'admitted',
    next: { lastSeq: 99, lastSeen: 3, expiresAt: 7, move: 'E', pendingInteract: true },
  });
  assert.deepEqual(admitInput(initial(), input(99, 'N'), 4).next, {
    lastSeq: 99, lastSeen: 4, expiresAt: 8, move: 'N', pendingInteract: false,
  });
});

test('movement is active through inclusive expiry and renewal starts the next four ticks', () => {
  assert.equal(movementActive(initial(), 1), false);
  const state = Object.freeze(admitInput(initial(), input(1, 'E'), 7).next);
  assert.deepEqual([8, 9, 10, 11, 12, 13].map((tick) => movementActive(state, tick)), [true, true, true, true, false, false]);
  const renewed = admitInput(state, input(2, 'E'), 11).next;
  assert.equal(renewed.expiresAt, 15);
  assert.equal(movementActive(renewed, 12), true);
  assert.equal(movementActive(renewed, 15), true);
  assert.equal(movementActive(renewed, 16), false);
});
