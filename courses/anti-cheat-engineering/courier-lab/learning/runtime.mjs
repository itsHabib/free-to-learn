import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grade, validateItem } from './grade.mjs';

export const UNIT_IDS = Object.freeze(['spatial', 'order', 'testing', 'timing', 'integrity', 'telemetry', 'evaluation', 'retention', 'recovery', 'capstone']);
export const SCHEMA = 'anti-cheat-learning/v1';

export async function loadUnits() {
  // Conservative owner-source pin: helpers may be imported directly, indirectly,
  // or dynamically. Runtime artifacts and learner files do not change this pin.
  const sourceVersion = await sourceTreeVersion(fileURLToPath(new URL('../', import.meta.url)));
  return Promise.all(UNIT_IDS.map(async (id) => {
    const module = await import(`./units/${id}.mjs`);
    if (module.unit?.id !== id || typeof module.makeItem !== 'function') throw new Error(`Invalid learning unit: ${id}`);
    return { ...module, sourceVersion };
  }));
}

async function sourceTreeVersion(root) {
  const excluded = new Set(['artifacts', 'node_modules', '.tmp', 'tests', '.git']);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      if (entry.isFile() && /\.(?:mjs|js|json)$/.test(entry.name)) files.push(path);
    }
  }
  await visit(root);
  const hash = createHash('sha256');
  for (const path of files.sort()) hash.update(relative(root, path)).update('\0').update(await readFile(path)).update('\0');
  return hash.digest('hex');
}

export function catalog(modules) {
  return modules.map(({ unit }) => ({
    ...unit,
    sections: unit.sections.map(({ worked, ...section }) => ({ ...section, worked: { prompt: worked.prompt } })),
    support: { milestones: unit.support?.milestones ?? [], reference: unit.support?.reference },
  }));
}

export function newSession(sessionId, modules, now) {
  return { schema: SCHEMA, sessionId, createdAt: now, catalogVersion: catalogVersion(modules), unitSnapshots: structuredClone(modules.map(({ unit }) => unit)), events: [], items: [], masterySets: [] };
}

function catalogVersion(modules) { return createHash('sha256').update(JSON.stringify(modules.map(({ unit, makeItem, sourceVersion }) => [unit, sourceVersion ?? String(makeItem)]))).digest('hex'); }

function findUnit(modules, id) {
  const module = modules.find(({ unit }) => unit.id === id);
  if (!module) throw problem(400, 'unknown-unit', 'Choose a listed unit.');
  return module;
}

export function findItem(state, id) {
  const item = state.items.find((record) => record.id === id);
  if (!item) throw problem(404, 'unknown-item', 'This item is not in the saved session.');
  return item;
}

export function publicItem(record) {
  const { id, unitId, mode, key, seed, generatedAt, definition, attempts, hints } = record;
  const { prompt, inputs, format, objectiveIds, source, tolerance } = definition;
  return { id, unitId, mode, key, seed, generatedAt, prompt, inputs, format, objectiveIds, source, tolerance, attempts, hints };
}

export function issueItem(state, modules, request, seed, now) {
  if (state.catalogVersion !== catalogVersion(modules)) throw problem(409, 'course-version-changed', 'This record belongs to an earlier course version. Export it, then start a separate session for new items.');
  const { unit, makeItem } = findUnit(modules, request.unitId);
  const { mode, key } = request;
  if (!['practice', 'completion', 'mastery'].includes(mode)) throw problem(400, 'invalid-mode', 'Choose completion, practice, or mastery.');
  const keys = mode === 'mastery' ? unit.masterySlots : unit.sections.map((section) => section.id);
  if (!keys.includes(key)) throw problem(400, 'unknown-key', 'Choose a listed section or mastery slot.');
  const definition = structuredClone(makeItem({ mode, key, seed }));
  validateItem(definition);
  if (definition.objectiveIds.some((id) => !unit.objectives.some((objective) => objective.id === id))) throw new Error('Generated item refers to an unknown objective.');
  const sameCase = state.items.some((record) => {
    if (record.unitId !== unit.id) return false;
    if ((mode === 'mastery' || record.mode === 'mastery') && caseIdentity(record.definition) === caseIdentity(definition)) return true;
    return record.mode === mode && record.key === key && JSON.stringify([record.definition.prompt, record.definition.inputs]) === JSON.stringify([definition.prompt, definition.inputs]);
  });
  if (sameCase) throw problem(409, 'repeated-case', 'The generator repeated a case. Request another fresh item.');
  const record = { id: `${unit.id}-${state.items.length + 1}-${seed}`, unitId: unit.id, mode, key, seed, generatedAt: now, definition, attempts: [], hints: [] };
  state.items.push(record);
  state.events.push({ type: 'item-issued', itemId: record.id, at: now });
  return publicItem(record);
}

export function issueMastery(state, modules, unitId, nextSeed, now) {
  const { unit } = findUnit(modules, unitId);
  if (unit.masterySlots.length !== 3) throw new Error('Mastery requires three authored slots.');
  const items = unit.masterySlots.map((key) => issueFresh(state, modules, { unitId, mode: 'mastery', key }, nextSeed, now));
  const set = { id: `${unitId}-set-${state.masterySets.length + 1}`, unitId, generatedAt: now, itemIds: items.map((item) => item.id) };
  state.masterySets.push(set);
  state.events.push({ type: 'mastery-issued', setId: set.id, at: now });
  return { ...set, items };
}

export function issueFresh(state, modules, input, nextSeed, now) {
  for (let count = 0; count < 32; count += 1) {
    try { return issueItem(state, modules, input, nextSeed(), now); } catch (error) { if (error.code !== 'repeated-case') throw error; }
  }
  throw problem(409, 'case-bank-exhausted', 'A distinct case could not be generated. Your earlier record is unchanged.');
}

function caseIdentity(item) {
  if (item.caseFingerprint !== undefined) return canonicalJson(item.caseFingerprint);
  if (item.inputs && Object.keys(item.inputs).length > 0) {
    // Completed working is teaching scaffolding, not a different problem.
    const { completedSteps, ...inputs } = item.inputs;
    return canonicalJson(inputs);
  }
  return canonicalJson([item.prompt, item.expected]);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function assistanceValues(value) {
  if (!Array.isArray(value) || value.length > 20 || value.some((entry) => typeof entry !== 'string' || entry.length > 2000)) throw problem(400, 'assistance-required', 'Declare assistance as a list, using an empty list for none.');
  return value;
}

export function submit(state, itemId, rawAnswer, assistance, now) {
  if (typeof rawAnswer !== 'string' || rawAnswer.length > 65_536) throw problem(400, 'invalid-answer', 'Submit the original answer as text, up to 65,536 characters.');
  const record = findItem(state, itemId);
  const declared = assistanceValues(assistance);
  const result = grade(record.definition, rawAnswer);
  const scoredBefore = record.attempts.some((attempt) => attempt.status === 'scored');
  const attempt = {
    revision: record.attempts.length + 1, at: now, rawAnswer, status: result.status,
    assistance: declared, assisted: declared.length > 0 || record.hints.length > 0 || scoredBefore || record.attempts.some((attempt) => attempt.assisted) || state.events.some((event) => event.assistedItemIds?.includes(itemId)),
    firstScored: result.status === 'scored' && !scoredBefore,
  };
  if (result.status === 'format-error') attempt.message = result.message;
  if (result.status === 'scored') {
    attempt.answer = result.value;
    attempt.correct = result.correct;
    attempt.feedback = { expected: record.definition.expected, explanation: record.definition.explanation, source: record.definition.source };
  }
  record.attempts.push(attempt);
  state.events.push({ type: 'submission', itemId, revision: attempt.revision, at: now });
  return { item: publicItem(record), attempt };
}

export function hint(state, itemId, now) {
  const record = findItem(state, itemId);
  if (record.mode === 'mastery') throw problem(400, 'mastery-no-hints', 'Mastery items have no hints. Return to the teaching and start a fresh set when ready.');
  const level = record.hints.length;
  if (level >= 3 || !record.definition.hints?.[level]) throw problem(400, 'no-more-hints', 'There are no further hints for this item.');
  if (level === 2 && !record.attempts.some((attempt) => attempt.status === 'scored')) throw problem(409, 'commit-before-solution', 'Commit a valid answer before viewing the worked solution.');
  const reveal = { level: level + 1, text: record.definition.hints[level], at: now };
  record.hints.push(reveal);
  state.events.push({ type: 'hint', itemId, level: reveal.level, at: now });
  return reveal;
}

export function revealWorked(state, modules, { unitId, key, prediction, skipReason }, now) {
  const { unit } = findUnit(state.unitSnapshots.map((unit) => ({ unit })), unitId);
  const section = unit.sections.find((candidate) => candidate.id === key);
  if (!section) throw problem(400, 'unknown-key', 'Choose a listed section.');
  if (typeof prediction !== 'string' || typeof skipReason !== 'string' || prediction.length > 8000 || skipReason.length > 2000 || (!prediction.trim() && !skipReason.trim())) throw problem(400, 'prediction-required', 'Write a prediction or an explicit reason for skipping it before revealing the example.');
  const exposure = { type: 'worked-exposure', unitId, key, prompt: section.worked.prompt, prediction, skipReason, worked: structuredClone(section.worked), assistedItemIds: pendingMastery(state, unitId), at: now };
  state.events.push(exposure);
  return exposure;
}

export function referenceExposure(state, unitId, path, now) {
  const event = { type: 'reference-exposure', unitId, path, assistedItemIds: pendingMastery(state, unitId), at: now };
  state.events.push(event);
  return event;
}

export function visitSection(state, unitId, key, now) {
  const unit = state.unitSnapshots.find((unit) => unit.id === unitId);
  if (!unit?.sections.some((section) => section.id === key)) throw problem(400, 'unknown-section', 'Choose a listed teaching section.');
  const event = { type: 'section-visit', unitId, key, assistedItemIds: pendingMastery(state, unitId), at: now };
  state.events.push(event);
  return event;
}

function pendingMastery(state, unitId) {
  return state.items.filter((record) => record.unitId === unitId && record.mode === 'mastery' && !record.attempts.some((attempt) => attempt.status === 'scored')).map((record) => record.id);
}

function setResult(state, set, unit) {
  const answers = set.itemIds.map((id) => {
    const record = findItem(state, id);
    const first = record.attempts.find((attempt) => attempt.firstScored);
    return { itemId: id, objectiveIds: record.definition.objectiveIds, status: !first ? 'pending' : first.correct && !first.assisted ? 'passed' : 'needs-practice' };
  });
  const objectives = unit.objectives.map(({ id, text }) => {
    const relevant = answers.filter((answer) => answer.objectiveIds.includes(id));
    const status = relevant.length === 0 ? 'unassessed' : relevant.some((answer) => answer.status === 'needs-practice') ? 'needs-practice' : relevant.some((answer) => answer.status === 'pending') ? 'pending' : 'passed';
    return { id, text, status };
  });
  const complete = answers.every((answer) => answer.status !== 'pending');
  const passed = complete && answers.every((answer) => answer.status === 'passed') && objectives.every((objective) => objective.status === 'passed');
  return { ...set, answers, objectives, complete, passed, status: passed ? 'mastered' : complete ? 'needs-practice' : 'in-progress' };
}

export function sessionView(state, modules) {
  const snapshots = state.unitSnapshots.map((unit) => ({ unit }));
  const masterySets = state.masterySets.map((set) => setResult(state, set, findUnit(snapshots, set.unitId).unit));
  const units = snapshots.map(({ unit }) => {
    const sets = masterySets.filter((set) => set.unitId === unit.id);
    const latest = sets.at(-1);
    return { id: unit.id, status: latest?.status ?? 'not-started', objectives: latest?.objectives ?? unit.objectives.map(({ id, text }) => ({ id, text, status: 'unassessed' })), previouslyMastered: sets.some((set) => set.passed) };
  });
  return { schema: state.schema, sessionId: state.sessionId, createdAt: state.createdAt, catalogVersion: state.catalogVersion, items: state.items.map(publicItem), masterySets, units, exposures: state.events.filter((event) => event.type === 'worked-exposure') };
}

export function evidenceExport(state, modules) {
  return { ...sessionView(state, modules), events: state.events, boundary: 'Local practice record. The machine owner can edit files. Generated mastery is not proctored evidence of learning or a credential.' };
}

export function problem(status, code, message) { return Object.assign(new Error(message), { status, code }); }
