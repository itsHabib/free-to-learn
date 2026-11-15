// Supplied by the course: the one memory hash every part of the course uses,
// so a hash in a recording means the same thing to your code, the lab and the checks.
import { createHash } from 'node:crypto';
export function hashMemory(memory) {
  return createHash('sha256').update(memory).digest('hex');
}
