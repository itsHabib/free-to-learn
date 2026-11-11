import { createHash } from 'node:crypto';
import { open, lstat, readFile, unlink } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { regularFile } from '../lab/core/trust.mjs';
import { isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import { retain } from './policy.mjs';

export const MAX_SOURCE_EVENTS = 100_000;
export const DEFAULT_MAX_EXPORT_BYTES = 1_048_576;
const FIELDS = ['tick', 'actorId', 'reason', 'distanceSquared'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function validateSettings(settings) {
  if (!settings || !Number.isSafeInteger(settings.nowTick) || settings.nowTick < 0) throw new TypeError('nowTick must be a nonnegative safe integer.');
  for (const key of ['maxAgeTicks', 'maxEvents']) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] <= 0) throw new TypeError(`${key} must be a positive safe integer.`);
  }
  return { nowTick: settings.nowTick, maxAgeTicks: settings.maxAgeTicks, maxEvents: settings.maxEvents };
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('Each source event must be an object.');
  if (!Number.isSafeInteger(event.tick) || event.tick < 0) throw new TypeError('Event ticks must be nonnegative safe integers.');
  for (const key of ['actorId', 'reason']) {
    if (typeof event[key] !== 'string' || event[key].length === 0 || event[key].length > 128) throw new TypeError(`${key} must contain 1–128 characters.`);
  }
  if (!Number.isFinite(event.distanceSquared) || event.distanceSquared < 0) throw new TypeError('distanceSquared must be finite and nonnegative.');
}

export function validateEvents(events) {
  if (!Array.isArray(events) || events.length > MAX_SOURCE_EVENTS) throw new TypeError(`Source events must be an array of at most ${MAX_SOURCE_EVENTS} entries.`);
  let previousTick = -1;
  for (const event of events) {
    validateEvent(event);
    if (event.tick < previousTick) throw new TypeError('Source events must already be in nondecreasing tick order.');
    previousTick = event.tick;
  }
}

function validateOutput(output, source, settings) {
  if (!Array.isArray(output) || output.length > settings.maxEvents) throw new TypeError('Policy output must be an array within maxEvents.');
  let sourceIndex = 0;
  const detached = [];
  for (const original of output) {
    if (!original || typeof original !== 'object' || Reflect.ownKeys(original).length !== FIELDS.length || FIELDS.some((key) => !Object.hasOwn(original, key))) throw new TypeError('Policy output may contain only tick, actorId, reason and distanceSquared.');
    const event = { tick: original.tick, actorId: original.actorId, reason: original.reason, distanceSquared: original.distanceSquared };
    validateEvent(event);
    if (event.tick <= settings.nowTick - settings.maxAgeTicks || event.tick > settings.nowTick) throw new TypeError('Policy output must lie inside the retention window.');
    while (sourceIndex < source.length && !FIELDS.every((key) => source[sourceIndex][key] === event[key])) sourceIndex += 1;
    if (sourceIndex === source.length) throw new TypeError('Policy output must preserve source values and order.');
    sourceIndex += 1;
    detached.push(event);
  }
  return detached;
}

/** Build a minimized artifact in memory. Extra source fields never enter it. */
export function buildExport(events, settings, { policy = retain, maxBytes = DEFAULT_MAX_EXPORT_BYTES, measure = false } = {}) {
  validateEvents(events);
  const selectedSettings = validateSettings(settings);
  if (typeof policy !== 'function') throw new TypeError('policy must be a function.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer.');
  const source = structuredClone(events);
  const input = structuredClone(events);
  const policySettings = { ...selectedSettings };
  const policyStart = measure ? performance.now() : 0;
  const retained = policy(input, policySettings);
  const policyMs = measure ? performance.now() - policyStart : 0;
  if (!isDeepStrictEqual(input, source) || !isDeepStrictEqual(policySettings, selectedSettings)) throw new TypeError('Policy must not mutate source events or settings.');
  const output = validateOutput(retained, source, selectedSettings);
  const payload = { schema: 1, kind: 'minimized-denial-events', settings: selectedSettings, events: output };
  const encodeStart = measure ? performance.now() : 0;
  const json = `${JSON.stringify(payload)}\n`;
  const jsonBytes = Buffer.byteLength(json, 'utf8');
  const encodeMs = measure ? performance.now() - encodeStart : 0;
  if (jsonBytes > maxBytes) throw new RangeError(`Export exceeds maxBytes (${jsonBytes} > ${maxBytes}). No export was written.`);
  const result = { payload, json, summary: { settings: selectedSettings, inputCount: events.length, retainedCount: retained.length, removedCount: events.length - retained.length, jsonBytes, maxBytes } };
  if (measure) result.timings = { policyMs, encodeMs, policyAndEncodeMs: policyMs + encodeMs };
  return result;
}

/** Write one new export, without replacing an existing file or making a backup. */
export async function writeExport(path, events, settings, options = {}) {
  const { json, summary } = buildExport(events, settings, options);
  const absolutePath = resolve(path);
  const file = await open(absolutePath, 'wx', 0o600);
  try {
    await file.writeFile(json, 'utf8');
  } catch (error) {
    await file.close();
    await unlink(absolutePath);
    throw error;
  }
  await file.close();
  return { path: absolutePath, kind: 'minimized-denial-events', sha256: digest(json), ...summary };
}

/** Delete only the unchanged export named by a writeExport receipt. */
export async function deleteExport(receipt) {
  if (!receipt || receipt.kind !== 'minimized-denial-events' || typeof receipt.path !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.sha256)) throw new TypeError('Use the receipt returned by writeExport.');
  const info = await lstat(receipt.path);
  if (!info.isFile() || info.isSymbolicLink()) throw new TypeError('The export path must still name a regular file.');
  if (info.size > DEFAULT_MAX_EXPORT_BYTES) throw new RangeError('Export exceeds the deletion read bound.');
  const bytes = await regularFile(dirname(receipt.path), basename(receipt.path));
  if (digest(bytes) !== receipt.sha256) throw new Error('Export bytes changed; refusing to delete a different artifact.');
  await unlink(receipt.path);
  return { path: receipt.path, deleted: true, jsonBytes: bytes.length, scope: 'This export only. Other copies and original records are unaffected.' };
}
