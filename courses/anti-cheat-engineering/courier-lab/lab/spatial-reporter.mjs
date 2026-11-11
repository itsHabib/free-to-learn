// Node 22+ custom reporter: serialize typed test events, never parse TAP text.
function errorRecord(error, depth = 0) {
  if (!error || typeof error !== 'object') return { message: String(error) };
  const record = {};
  for (const key of ['name', 'message', 'code', 'failureType', 'operator', 'actual', 'expected', 'observed', 'stack']) {
    if (key in error) record[key] = error[key];
  }
  if ('cause' in error && depth < 3) record.cause = errorRecord(error.cause, depth + 1);
  return record;
}

export default async function* spatialReporter(source) {
  let bytes = 0;
  for await (const event of source) {
    if (!['test:pass', 'test:fail', 'test:summary'].includes(event.type)) continue;
    const data = event.data;
    const record = event.type === 'test:summary'
      ? { type: event.type, counts: data.counts, success: data.success, file: data.file ?? null }
      : {
        type: event.type, name: data.name, nesting: data.nesting, testNumber: data.testNumber,
        file: data.file ?? null, skip: data.skip ?? false, todo: data.todo ?? false,
        details: { type: data.details?.type, ...(data.details?.error ? { error: errorRecord(data.details.error) } : {}) },
      };
    const line = JSON.stringify(record, (_key, value) => typeof value === 'bigint' ? String(value) : value) + '\n';
    bytes += Buffer.byteLength(line);
    if (bytes > 1024 * 1024) throw new Error('Spatial structured evidence exceeded its byte budget.');
    yield line;
  }
}
