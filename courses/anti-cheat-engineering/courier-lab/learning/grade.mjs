import { isDeepStrictEqual } from 'node:util';

// Format failures are recorded, but are not scored attempts and reveal no key.
export function grade(item, rawAnswer) {
  const type = item.format.type;
  let value;
  if (typeof rawAnswer !== 'string' || rawAnswer.length > 65_536) return invalid('Enter an answer of at most 65,536 characters.');
  if (type === 'number') {
    if (!rawAnswer.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(rawAnswer.trim())) return invalid('Enter a finite number.');
    value = Number(rawAnswer);
    if (!Number.isFinite(value)) return invalid('Enter a finite number.');
    return scored(value, Math.abs(value - item.expected) <= (item.tolerance ?? 0));
  }
  if (type === 'choice') {
    if (!item.format.options.some((option) => option.value === rawAnswer)) return invalid('Choose one of the listed options.');
    return scored(rawAnswer, rawAnswer === item.expected);
  }
  if (type === 'json') {
    try { value = JSON.parse(rawAnswer); } catch { return invalid('Enter valid JSON. Your original text has been saved; it has not been scored.'); }
    return scored(value, isDeepStrictEqual(value, item.expected));
  }
  throw new Error('Unsupported item format.');
}

function invalid(message) { return { status: 'format-error', message }; }
function scored(value, correct) { return { status: 'scored', value, correct }; }

export function validateItem(item) {
  if (!item || typeof item.id !== 'string' || typeof item.prompt !== 'string' || !item.prompt.trim()) throw new Error('Invalid generated item.');
  if (!Array.isArray(item.objectiveIds) || item.objectiveIds.length === 0) throw new Error('Item needs objectives.');
  if (!['number', 'choice', 'json'].includes(item.format?.type)) throw new Error('Invalid item format.');
  if (item.format.type === 'number' && !Number.isFinite(item.expected)) throw new Error('Expected number must be finite.');
  if (item.tolerance !== undefined && (item.format.type !== 'number' || !Number.isFinite(item.tolerance) || item.tolerance < 0)) throw new Error('Invalid explicit numeric tolerance.');
  if (item.format.type !== 'choice') return;
  const options = item.format.options;
  if (!Array.isArray(options) || options.length < 2 || options.some((option) => typeof option.value !== 'string' || typeof option.label !== 'string')) throw new Error('Invalid choice options.');
  if (new Set(options.map((option) => option.value)).size !== options.length || !options.some((option) => option.value === item.expected)) throw new Error('Invalid choice key.');
}
