import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { buildExport, validateEvents, validateSettings, MAX_SOURCE_EVENTS } from './store.mjs';
import { retain } from './policy.mjs';

export const WORKLOAD_NAME = 'courier-denials-v1';

/** A small run has an observed maximum, not a useful tail percentile estimate. */
export function summarizeTimings(values) {
  if (!Array.isArray(values) || values.length < 1 || values.some((value) => !Number.isFinite(value) || value < 0)) throw new TypeError('Timings must be a nonempty array of finite nonnegative milliseconds.');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  const maxMs = sorted.at(-1);
  const p95Ms = sorted.length >= 20 ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
  return { sampleCount: sorted.length, medianMs, maxMs, p95Ms, tailStatistic: p95Ms === null ? 'max' : 'p95', tailMs: p95Ms ?? maxMs };
}

/** Synthetic source fields are examples, never credentials or captured traffic. */
export function createSyntheticWorkload(eventCount = 4096) {
  if (!Number.isSafeInteger(eventCount) || eventCount < 1 || eventCount > MAX_SOURCE_EVENTS) throw new RangeError(`eventCount must be 1–${MAX_SOURCE_EVENTS}.`);
  const events = Array.from({ length: eventCount }, (_, tick) => ({
    tick, actorId: `synthetic-actor-${tick % 8}`, reason: tick % 4 === 0 ? 'cooldown' : 'range',
    distanceSquared: 562_500 + (tick % 31) * 10_000,
    capability: `synthetic-example-${tick % 8}`, address: `synthetic-address-${tick % 8}`, device: `synthetic-device-${tick % 3}`,
  }));
  return { name: WORKLOAD_NAME, version: 1, events };
}

/** Measure this local sequential operation; no wall-time threshold is implied. */
export function measureRetention({ workload = createSyntheticWorkload(), settings, warmup = 2, samples = 5, policy = retain } = {}) {
  if (workload?.name !== WORKLOAD_NAME || workload.version !== 1) throw new TypeError(`Use the named ${WORKLOAD_NAME} workload.`);
  validateEvents(workload.events);
  if (!Number.isSafeInteger(warmup) || warmup < 0 || warmup > 100) throw new RangeError('warmup must be 0–100.');
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 100) throw new RangeError('samples must be 1–100.');
  const nowTick = workload.events.at(-1)?.tick ?? 0;
  const settingsList = settings ?? [
    { nowTick, maxAgeTicks: 2048, maxEvents: 1024 },
    { nowTick, maxAgeTicks: 256, maxEvents: 128 },
  ];
  if (!Array.isArray(settingsList) || settingsList.length < 2 || settingsList.length > 16) throw new RangeError('Compare 2–16 settings.');
  const selectedSettings = settingsList.map(validateSettings);
  const runs = selectedSettings.map((setting) => {
    for (let index = 0; index < warmup; index += 1) buildExport(workload.events, setting, { policy, measure: true });
    const elapsedMs = [];
    const policyMs = [];
    const encodeMs = [];
    const policyAndEncodeMs = [];
    const jsonByteSamples = [];
    let summary;
    for (let index = 0; index < samples; index += 1) {
      const start = performance.now();
      const result = buildExport(workload.events, setting, { policy, measure: true });
      elapsedMs.push(performance.now() - start);
      policyMs.push(result.timings.policyMs);
      encodeMs.push(result.timings.encodeMs);
      policyAndEncodeMs.push(result.timings.policyAndEncodeMs);
      jsonByteSamples.push(result.summary.jsonBytes);
      summary = result.summary;
    }
    return { ...summary, elapsedMs, policyMs, encodeMs, policyAndEncodeMs, jsonByteSamples,
      timingSummary: { wholeOperation: summarizeTimings(elapsedMs), policyAndEncode: summarizeTimings(policyAndEncodeMs) } };
  });
  const sourceJson = JSON.stringify(workload.events);
  return {
    schema: 2, kind: 'retention-measurement',
    workload: { name: workload.name, version: workload.version, eventCount: workload.events.length, inputJsonBytes: Buffer.byteLength(sourceJson, 'utf8'), sha256: createHash('sha256').update(sourceJson).digest('hex') },
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    operation: 'Whole operation: validate, clone, retain, validate output and encode JSON; no disk I/O',
    policyAndEncodeOperation: 'Policy call plus JSON encoding and byte counting; excludes source validation, cloning, mutation checks and output validation',
    settings: selectedSettings, warmup, samples, runs,
    limits: 'Local sequential synthetic workload. JSON bytes are the direct cost changed by the limits; whole-operation time can be dominated by fixed validation and cloning. Timings include allocation and garbage-collection noise. Fewer than 20 samples report an observed maximum, not p95; even a reported p95 is only this sample percentile, not a capacity estimate. No production capacity or anonymization claim.',
  };
}
