// Supplied transport: one bounded, length-prefixed JSON exchange per TCP connection.
import net from 'node:net';
import {LabError, requireThat} from './crypto.mjs';
export const MAX_FRAME = 1024 * 1024;
export function encode(value) {
  const body = Buffer.from(JSON.stringify(value));
  requireThat(body.length > 0 && body.length <= MAX_FRAME, 'FRAME_SIZE');
  const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}
export function decoder(accept, reject) {
  let buffer = Buffer.alloc(0), done = false;
  return chunk => {
    if (done) return;
    try {
      requireThat(buffer.length + chunk.length <= MAX_FRAME + 4, 'FRAME_SIZE');
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32BE();
      requireThat(length > 0 && length <= MAX_FRAME, 'FRAME_SIZE');
      if (buffer.length < length + 4) return;
      requireThat(buffer.length === length + 4, 'FRAME_TRAILING');
      const value = JSON.parse(buffer.subarray(4).toString('utf8'));
      done = true; accept(value);
    } catch (error) { done = true; reject(error); }
  };
}
export function request(endpoint, cell, deadline = 1800) {
  requireThat(endpoint?.host === '127.0.0.1' && Number.isInteger(endpoint.port)
    && endpoint.port > 0 && endpoint.port <= 65535, 'LOCAL_ONLY');
  const bytes = encode(cell);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      if (error) { reject(error); return; }
      resolve(value);
    };
    const timer = setTimeout(() => finish(new LabError('DELIVERY_FAILED')), deadline);
    socket.on('connect', () => socket.write(bytes));
    socket.on('data', decoder(reply => {
      if (reply?.ok !== true) { finish(new LabError(reply?.code || 'BAD_REPLY')); return; }
      finish(null, reply.body);
    }, error => finish(error)));
    socket.on('error', () => finish(new LabError('DELIVERY_FAILED')));
    socket.on('close', () => finish(new LabError('DELIVERY_FAILED')));
  });
}
