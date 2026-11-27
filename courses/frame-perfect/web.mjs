// Lessons and practice, shared by the terminal commands in lab.mjs (lesson, question, answer, status).
// A lesson is split at each {{practice:ID}} line: the part before it ends with that item's questions, and
// the part after it opens once every question of item ID has a committed answer.
// Practice answers are graded here, so an item's answer and its feedback are printed only in the reply
// to a commit. The grading rules are the same as Sightline's and the example course kit's.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'course.json'), 'utf8'));

// A heading's id, the same rule the repository's lesson pages use.
export const slug = (s) => String(s).toLowerCase().replace(/[`'’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const PRACTICE_LINE = /^\{\{practice:([a-z0-9-]+)\}\}\s*$/;

// Split lesson markdown into parts. A {{practice:ID}} line stays at the end of the part it closes, and
// the next part carries gate ID. A lesson that ends on a practice line has no empty part after it.
export function splitLesson(md) {
  const segments = [{ gate: null, lines: [] }];
  for (const line of md.split('\n')) {
    segments.at(-1).lines.push(line);
    const m = line.match(PRACTICE_LINE);
    if (m) segments.push({ gate: m[1], lines: [] });
  }
  if (segments.length > 1 && !segments.at(-1).lines.join('').trim()) segments.pop();
  return segments.map((s) => ({ gate: s.gate, text: s.lines.join('\n') }));
}

// The comment lines that mark a listing extracted from a source file; they are not shown.
export const exampleMarker = (line) => /^<!-- (code-example \{.*\}|\/code-example) -->$/.test(line);

// figureDesc(name): the figure's <desc>, what it shows in words, or null when the file is missing.
export function figureDesc(name) {
  const file = join(root, 'lessons', 'figures', `${name}.svg`);
  if (!existsSync(file)) return null;
  return ((readFileSync(file, 'utf8').match(/<desc[^>]*>([\s\S]*?)<\/desc>/) ?? [])[1] ?? '').trim();
}

// Ids starting with p and a digit are predictions; the rest are practice.
export const practiceKind = (id) => (/^p\d/.test(id) ? 'Predict, then commit' : 'Practice');

// ----- answers (same rules as the example course kit) -----
export function answerFormat(expected) {
  if (typeof expected === 'boolean') return 'Answer yes or no.';
  if (typeof expected === 'number') return 'Answer with a number.';
  if (Array.isArray(expected)) return 'Answer with a list of numbers, such as 1, 2, 3.';
  return 'Answer with one word.';
}
export const answerLabel = (e) => (typeof e === 'boolean' ? 'yes or no' : typeof e === 'number' ? 'a number' : Array.isArray(e) ? 'numbers separated by commas' : 'one word');

export function parseAnswer(text, expected) {
  // A minus sign may be typed as the typographic one (U+2212) or as an en dash. Before a digit either is
  // a minus sign, so "–5" is never read as 5.
  const raw = String(text ?? '').trim().replace(/[−–]\s*(?=[\d.])/g, '-');
  const problem = () => ({ ok: false, hint: `That answer could not be read. ${answerFormat(expected)} Nothing was recorded; correct it and commit again.` });
  if (!raw) return problem();
  // A word may come wrapped in punctuation, brackets, quotes or backticks: "A.", "(a)", "`play`".
  const word = raw.replace(/^[^\p{L}\p{N}_]*?(?=[-+]?\.?\d|[\p{L}_])/u, '').replace(/[^\p{L}\p{N}_]+$/u, '').toLowerCase();
  if (typeof expected === 'boolean') {
    if (word === 'yes' || word === 'true') return { ok: true, value: true };
    if (word === 'no' || word === 'false') return { ok: true, value: false };
    return problem();
  }
  const numbers = /[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?/gi;
  if (typeof expected === 'number') {
    // Words around the number are fine as long as there is exactly one number: "frame 45", "109 frames".
    // Commas that group thousands are dropped first, so 2,015,539 is one number.
    const found = raw.replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(numbers) ?? [];
    return found.length === 1 ? { ok: true, value: Number(found[0]) } : problem();
  }
  if (Array.isArray(expected)) {
    const parts = raw.match(numbers) ?? [];
    return parts.length ? { ok: true, value: parts.map(Number) } : problem();
  }
  return word && !/\s/.test(word) ? { ok: true, value: word } : problem();
}

const sameAnswer = (a, b) => JSON.stringify(typeof b === 'string' ? String(a).toLowerCase() : a) === JSON.stringify(typeof b === 'string' ? b.toLowerCase() : b);
// A more precise answer counts when it rounds to the key at the key's own precision, so 0.8333 answers
// 0.83. A whole-number key needs the whole number itself, unless the item is marked round: true.
// Rounding is tried only after the exact key and the listed wrong answers.
const places = (n) => { const [m, e] = String(n).toLowerCase().split('e'); return Math.max(0, (m.split('.')[1] ?? '').length - Number(e ?? 0)); };
const closeTo = (a, key, round) => {
  if (typeof a !== 'number' || typeof key !== 'number') return false;
  if (Number.isInteger(key) && !round) return a === key;
  const tol = 0.5 * 10 ** -places(key);
  return Math.abs(a - key) <= tol * (1 + 1e-6);
};
const roundsTo = (a, b, round) => (typeof b === 'number' ? closeTo(a, b, round) : Array.isArray(b) && Array.isArray(a) && a.length === b.length && b.every((x, i) => closeTo(a[i], x, round)));

// Whether the section a miss points to goes on in text that opens only after item id: the item's own
// practice line falls inside that section, or before it. The pointer then says when the text opens.
const sectionCache = new Map();
export function explainedAfterGate(id, objective, section) {
  const key = `${id}|${objective}|${section}`;
  if (sectionCache.has(key)) return sectionCache.get(key);
  let after = false;
  const file = lessonFile(objective);
  if (file && existsSync(file)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let fence = false, start = -1, end = lines.length, gate = -1;
    lines.forEach((line, n) => {
      if (line.startsWith('```')) fence = !fence;
      if (!fence && line.startsWith('## ')) {
        if (line.slice(3).trim() === section) start = n;
        else if (start >= 0 && n > start && end === lines.length) end = n;
      }
      if (line.trim() === `{{practice:${id}}}`) gate = n;
    });
    after = gate >= 0 && start >= 0 && gate < end;
  }
  sectionCache.set(key, after);
  return after;
}

export function grade(practice, id, variant, text) {
  const item = practice[id]?.[variant];
  if (!item) return { ok: false, hint: 'Unknown practice item.' };
  const parsed = parseAnswer(text, item.answer);
  if (!parsed.ok) return parsed;
  // anyOrder: a list answer where the order carries no meaning.
  const inOrder = (v) => (item.anyOrder && Array.isArray(v) ? [...v].sort((a, b) => a - b) : v);
  const exact = sameAnswer(inOrder(parsed.value), inOrder(item.answer));
  const wrong = exact ? null : (item.wrong ?? []).find((w) => sameAnswer(inOrder(parsed.value), inOrder(w.answer)));
  const correct = exact || (!wrong && roundsTo(inOrder(parsed.value), inOrder(item.answer), item.round === true));
  const shown = Array.isArray(item.answer) ? item.answer.join(', ') : typeof item.answer === 'boolean' ? (item.answer ? 'yes' : 'no') : String(item.answer);
  // Feedback that opens by stating the answer would say it twice.
  const why = (wrong ? wrong.feedback : item.feedback).replace(new RegExp(`^${shown.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\s+`), '');
  const verdict = correct ? 'Right.' : `Not quite: the answer is ${shown}.`;
  // Questions are asked in order, so another one comes next only before the last. A committed answer is
  // never replaced, so there is no second try.
  const another = variant < (practice[id]?.length ?? 1) - 1;
  const opensAfter = Boolean(item.section) && explainedAfterGate(id, item.objective, item.section);
  const pointer = !correct && item.section ? { text: `lesson ${item.objective}, under "${item.section}"`, section: item.section, objective: item.objective, opensAfter, opensNow: opensAfter && !another } : null;
  const when = !pointer?.opensAfter ? '' : another ? ', in the text that opens once every question of this item has an answer' : ', in the text this answer opens';
  return {
    ok: true, correct, verdict, pointer,
    text: correct ? `${verdict} ${item.feedback}` : `${verdict} ${why}${pointer ? ` This is taught in ${pointer.text}${when}.` : ''}${another ? ' The next question of this item is on the same idea.' : ''}`,
  };
}

// The practice items, or none while lessons/practice.mjs does not exist.
export async function loadPractice() {
  const file = join(root, 'lessons', 'practice.mjs');
  if (!existsSync(file)) return {};
  const mod = await import(pathToFileURL(file).href);
  return mod.practice ?? {};
}

export function lessonFile(id) {
  const l = config.lessons.find((x) => x.id === id);
  return l ? join(root, l.file) : null;
}
