import { createHash } from 'node:crypto';
import { CORPUS_VERSION, SPLIT_IDS, casesForSplit, loadCorpus } from './corpus.mjs';

export const REPORT_LIMIT = 'Counts and rates describe these fourteen scripted controls only. They do not estimate human false-positive rates, production prevalence or detection of all automation. Flags are advisory.';
const copy = (value) => JSON.parse(JSON.stringify(value));

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function hashValue(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function settingsCopy(settings) {
  if (!settings || Object.keys(settings).sort().join(',') !== 'minDistanceMm,threshold,windowTicks') throw new Error('Settings must contain exactly threshold, windowTicks and minDistanceMm.');
  if (!Number.isSafeInteger(settings.threshold) || settings.threshold <= 0) throw new Error('threshold must be a positive integer.');
  if (!Number.isSafeInteger(settings.windowTicks) || settings.windowTicks <= 0) throw new Error('windowTicks must be a positive integer.');
  if (!Number.isFinite(settings.minDistanceMm) || settings.minDistanceMm < 0) throw new Error('minDistanceMm must be finite and nonnegative.');
  return copy(settings);
}

function indistinguishablePair(corpus, sections) {
  const splits = Object.keys(SPLIT_IDS).map((split) => {
    const pair = ['honest-delivery', 'valid-automation'].map((family) => corpus.cases.find((item) => item.id === `${split}/${family}`));
    const decisions = pair.map(({ id }) => sections[split].result.decisions?.find((decision) => decision.id === id) ?? null);
    return {
      split, caseIds: pair.map(({ id }) => id),
      declaredAutomation: pair.map((item) => item.declaredAutomation),
      identicalSignals: stableJson(pair[0].signals) === stableJson(pair[1].signals),
      decisions: copy(decisions), sameDecision: decisions.every((item) => typeof item?.flagged === 'boolean') && decisions[0].flagged === decisions[1].flagged,
    };
  });
  return {
    claim: 'The legal twins have identical signals but different declared automation metadata. A deterministic signal-only policy cannot distinguish their automation status. Both have a negative rule-violation label, so treating both as legal is not a missed violation.',
    splits,
  };
}

/** Make this commitment before viewing the evaluation split. The caller preserves it with the attempt. */
export async function prepareEvaluation({ settings, source, corpus } = {}) {
  if (typeof source !== 'string' || source.trim().length === 0) throw new Error('Provide the exact candidate source before evaluation.');
  const validated = await loadCorpus(corpus);
  const chosen = settingsCopy(settings);
  return Object.freeze({
    schema: 'courier-evaluation-plan-v1', corpusVersion: CORPUS_VERSION,
    settings: Object.freeze(chosen), settingsSha256: hashValue(chosen),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    corpusSha256: hashValue(validated), splitIds: copy(SPLIT_IDS),
  });
}

/** Run both splits separately using the previously committed settings and source identity. */
export async function runEvaluation(candidate, { plan, source, corpus } = {}) {
  if (typeof candidate?.evaluate !== 'function') throw new Error('Candidate must export evaluate(cases, settings).');
  const validated = await loadCorpus(corpus);
  const expected = await prepareEvaluation({ settings: plan?.settings, source, corpus: validated });
  if (stableJson(plan) !== stableJson(expected)) throw new Error('Evaluation plan changed: commit settings, source and corpus again before running.');
  const sections = {};
  for (const split of Object.keys(SPLIT_IDS)) {
    const cases = casesForSplit(validated, split);
    const positiveLabels = cases.filter((item) => item.label).length;
    const negativeLabels = cases.length - positiveLabels;
    const result = await candidate.evaluate(cases, copy(plan.settings));
    sections[split] = { caseIds: [...SPLIT_IDS[split]], positiveLabels, negativeLabels, result: copy(result) };
  }
  return {
    schema: 'courier-evaluation-report-v1', plan: copy(plan), ...sections,
    noPositiveNoPrediction: copy(await candidate.evaluate([{ id: 'diagnostic/negative-quiet', label: false, signals: [] }], copy(plan.settings))),
    indistinguishablePair: indistinguishablePair(validated, sections),
    labelDefinition: validated.labelDefinition, limitations: REPORT_LIMIT,
  };
}
