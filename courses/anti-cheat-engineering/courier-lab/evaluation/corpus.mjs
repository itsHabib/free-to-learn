import { readFile } from 'node:fs/promises';
import { createRecordedEngine, createReplayEngine } from '../telemetry/runtime.mjs';
import { replayWindow } from '../telemetry/policy.mjs';

export const CORPUS_VERSION = 'courier-synthetic-evaluation-v2';
export const DEFAULT_SETTINGS = Object.freeze({ threshold: 3, windowTicks: 20, minDistanceMm: 500 });
const FAMILIES = ['honest-delivery', 'pickup-repress', 'anticipatory-presses', 'delayed-reordered-retries',
  'isolated-distant-errors', 'repeated-distant-invalid', 'valid-automation'];
export const SPLIT_IDS = Object.freeze(Object.fromEntries(['exploration', 'evaluation'].map((split) => [
  split, Object.freeze(FAMILIES.map((family) => `${split}/${family}`)),
])));

const copy = (value) => JSON.parse(JSON.stringify(value));
const input = (seq, move, interact) => ({ v: 1, seq, move, interact });

/** Replay before extracting. Checkpoint history before this retained window is not invented. */
export function extractDenials(record) {
  const engine = createReplayEngine();
  const checked = replayWindow(record, engine);
  if (!checked.ok) throw new Error(`Cannot extract signals from refused replay: ${checked.reason}.`);
  const world = engine.restore(record.checkpoint);
  const denials = [];
  for (const { event } of record.events) {
    engine.apply(world, event);
    if (event.type !== 'tick') continue;
    for (const actor of world.actors) appendDenial(denials, actor, world);
  }
  return denials;
}

function appendDenial(denials, actor, world) {
  const decision = actor.lastDecision;
  if (decision?.status !== 'denied' || decision.tick !== world.tick) return;
  // Denial leaves cargo unchanged; the post-movement state is the state used by interactionDenial.
  const target = actor.cargo ? { x: 1000, y: 1000 } : world.core;
  denials.push({ tick: world.tick, actorId: actor.id, reason: decision.reason,
    distanceSquared: (actor.x - target.x) ** 2 + (actor.y - target.y) ** 2 });
}

export function extractSignals(record, { actorId = 'actor-1' } = {}) {
  const signals = extractDenials(record).filter((event) => event.actorId === actorId)
    .map(({ tick, reason, distanceSquared }) => ({ tick, reason, distanceSquared }));
  if (!record.final.actors.some((entry) => entry.actor.id === actorId)) throw new Error(`Unknown signal actor: ${actorId}.`);
  return signals;
}

function scriptedEngine(seed) {
  const recorder = createRecordedEngine(seed, { capacity: 256 });
  const actor = recorder.join();
  let sequence = 0;
  return {
    recorder,
    step(move = 'idle', interact = false) {
      recorder.admit(actor.id, input(++sequence, move, interact));
      recorder.advance(1);
    },
    reorderedStep(move, interact, staleMove = 'W') {
      sequence += 2;
      recorder.admit(actor.id, input(sequence, move, interact));
      recorder.admit(actor.id, input(sequence - 1, staleMove, true));
      recorder.admit(actor.id, input(sequence, 'idle', true));
      recorder.advance(1);
    },
  };
}

function delivery(script) {
  script.step('E');
  script.step('E');
  script.step('E', true);
  script.step('W');
  script.step('W');
  script.step('W');
  script.step('idle', true);
}

function repress(script) {
  script.step('E');
  script.step('E');
  script.step('E', true);
  for (let index = 0; index < 3; index += 1) script.step('idle', true);
  script.step('W', true);
  script.step('W', true);
  for (let index = 0; index < 3; index += 1) script.step('idle', true);
  script.step('W');
}

function anticipatory(script) {
  for (let index = 0; index < 3; index += 1) script.step('E', true);
  for (let index = 0; index < 3; index += 1) script.step('W', true);
  script.step('idle', true);
}

function reordered(script) {
  script.reorderedStep('E', false);
  script.reorderedStep('E', false);
  script.reorderedStep('E', true);
  script.reorderedStep('W', false);
  script.reorderedStep('W', false);
  script.reorderedStep('W', true);
  script.reorderedStep('idle', true);
}

function isolated(script) {
  script.step('idle', true);
  script.recorder.advance(21);
  script.step('idle', true);
}

function repeated(script) {
  for (let index = 0; index < 5; index += 1) script.step('idle', true);
}

const SCRIPTS = {
  'honest-delivery': delivery,
  'pickup-repress': repress,
  'anticipatory-presses': anticipatory,
  'delayed-reordered-retries': reordered,
  'isolated-distant-errors': isolated,
  'repeated-distant-invalid': repeated,
  'valid-automation': delivery,
};

const DESCRIPTIONS = {
  'honest-delivery': 'Scripted honest-shaped route: legal pickup and delivery.',
  'pickup-repress': 'Scripted honest-shaped re-presses: cooldown denials and one 500 mm range denial.',
  'anticipatory-presses': 'Scripted honest-shaped presses while approaching pickup and depot.',
  'delayed-reordered-retries': 'Scripted honest-shaped ingress order: older and equal sequences retry around legal movement.',
  'isolated-distant-errors': 'Scripted honest-shaped distant mistakes separated by more than the example detector window.',
  'repeated-distant-invalid': 'Scripted repeated remote interaction attempts without approaching the target.',
  'valid-automation': 'Script declared automated; its legal commands are identical to the honest-delivery twin.',
};

/** Fourteen cases, with split IDs fixed before any settings are selected. No human data. */
export function generateCorpus() {
  const cases = [];
  for (const split of Object.keys(SPLIT_IDS)) {
    for (const family of FAMILIES) cases.push(generateCase(split, family));
  }
  return {
    schema: 'courier-evaluation-corpus-v2', version: CORPUS_VERSION,
    labelDefinition: 'true means the scripted repeated-distant-invalid control; false means a control without that repeated-invalid behavior. Declared automation is separate metadata: a legal automated script is not a rule violation. These are author-assigned synthetic labels, not a judgment about a person.',
    limitations: 'Fourteen synthetic cases from the owned local game; no human participants, production prevalence estimate, authentication claim or automatic enforcement.',
    splits: copy(SPLIT_IDS), cases,
  };
}

function generateCase(split, family) {
  // Distinct seeds are deterministic; both intentionally select the same course geometry.
  const script = scriptedEngine(split === 'exploration' ? 0 : 3);
  if (split === 'evaluation') script.recorder.advance(3);
  if (split === 'evaluation' && family === 'repeated-distant-invalid') {
    for (let index = 0; index < 4; index += 1) {
      script.step('idle', true);
      script.recorder.advance(5);
    }
  } else if (split === 'evaluation' && family === 'isolated-distant-errors') {
    for (let index = 0; index < 3; index += 1) {
      script.step('idle', true);
      script.recorder.advance(25);
    }
  } else SCRIPTS[family](script);
  const record = script.recorder.window();
  if (record.startIndex !== 0) throw new Error('Synthetic corpus unexpectedly exceeded its complete recording capacity.');
  return {
    id: `${split}/${family}`, split, family, description: DESCRIPTIONS[family],
    label: family === 'repeated-distant-invalid', declaredAutomation: family === 'valid-automation',
    actorId: 'actor-1', record, signals: extractSignals(record),
  };
}

function validateCorpus(corpus) {
  if (corpus?.schema !== 'courier-evaluation-corpus-v2' || corpus.version !== CORPUS_VERSION) throw new Error('Unsupported evaluation corpus.');
  if (!Array.isArray(corpus.cases) || corpus.cases.length !== 14) throw new Error('The versioned corpus must contain fourteen cases.');
  if (typeof corpus.labelDefinition !== 'string' || typeof corpus.limitations !== 'string') throw new Error('Corpus labels and limitations must be explicit.');
  const ids = corpus.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('Corpus case IDs must be unique.');
  for (const split of Object.keys(SPLIT_IDS)) validateSplit(corpus, split);
  for (const item of corpus.cases) validateCase(item);
  return copy(corpus);
}

function validateSplit(corpus, split) {
  if (JSON.stringify(corpus.splits?.[split]) !== JSON.stringify(SPLIT_IDS[split])) throw new Error(`Changed stable ${split} IDs.`);
  const ids = corpus.cases.filter((item) => item.split === split).map((item) => item.id);
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...SPLIT_IDS[split]].sort())) throw new Error(`Invalid ${split} membership.`);
}

function validateCase(item) {
  const expectedId = `${item.split}/${item.family}`;
  if (!FAMILIES.includes(item.family) || item.id !== expectedId || item.actorId !== 'actor-1') throw new Error(`Invalid corpus case identity: ${item.id}.`);
  const label = item.family === 'repeated-distant-invalid';
  if (item.label !== label) throw new Error(`Changed synthetic label: ${item.id}.`);
  if (item.declaredAutomation !== (item.family === 'valid-automation')) throw new Error(`Changed declared automation metadata: ${item.id}.`);
  if (item.record?.startIndex !== 0) throw new Error(`Corpus case must preserve its full recording: ${item.id}.`);
  const actual = extractSignals(item.record, { actorId: item.actorId });
  if (!createReplayEngine().equal(item.signals, actual)) throw new Error(`Signals do not match replay: ${item.id}.`);
}

/** Load a JSON path/URL, parse JSON text, or validate an object. Omit to generate v2. */
export async function loadCorpus(source) {
  if (source === undefined) return validateCorpus(generateCorpus());
  if (source instanceof URL) return validateCorpus(JSON.parse(await readFile(source, 'utf8')));
  if (typeof source === 'string') {
    const text = source.trimStart().startsWith('{') ? source : await readFile(source, 'utf8');
    return validateCorpus(JSON.parse(text));
  }
  return validateCorpus(source);
}

/** Project precisely the public policy input; record, family and split are never features. */
export function casesForSplit(corpus, split) {
  if (!Object.hasOwn(SPLIT_IDS, split)) throw new Error(`Unknown corpus split: ${split}.`);
  const byId = new Map(corpus.cases.map((item) => [item.id, item]));
  return SPLIT_IDS[split].map((id) => {
    const item = byId.get(id);
    if (!item || item.split !== split || typeof item.label !== 'boolean') throw new Error(`Missing corpus case: ${id}.`);
    return { id, label: item.label, signals: copy(item.signals) };
  });
}
