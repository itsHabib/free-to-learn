import {sha256, copyData, deepFreeze} from './identity.mjs';
import {deriveSeed} from './rng.mjs';
import {runMatch, verifyReplay} from './runner.mjs';

function unique(values, name) {
  if (!Array.isArray(values) || !values.length || Array.from(values).some(value => value === undefined || value === null) || new Set(values).size !== values.length) throw new Error(`${name} must be nonempty and unique.`);
}

export function createPlan({policies, scenarios, seeds = [1, 2], budget = 256, partition = 'development'}) {
  if (!Array.isArray(policies) || policies.length < 2 || policies.length > 8) throw new Error('A season supports 2–8 policy snapshots. The complete-course capstone requires its six named roles.');
  unique(policies.map(policy => policy.id), 'Policy IDs');
  unique(scenarios.map(scenario => scenario.id), 'Scenario IDs');
  if (policies.some(policy => typeof policy.id !== 'string' || !policy.id) || scenarios.some(scenario => typeof scenario.id !== 'string' || !scenario.id || typeof scenario.stateHash !== 'string' || !scenario.stateHash)) throw new Error('Policy and scenario identities must be explicit strings.');
  unique(seeds, 'Replicate seeds');
  if (seeds.some(seed => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) throw new Error('Replicate seeds must be uint32 integers.');
  if (!Number.isInteger(budget) || budget < 0 || budget > 1024) throw new Error('Budget must be an integer from 0 through 1024.');
  if (!['development', 'training', 'selection', 'final'].includes(partition)) throw new Error('Unknown experiment partition.');
  const definition = {
    schemaVersion: 1, type: 'league-plan', policyIds: policies.map(policy => policy.id),
    scenarioIds: scenarios.map(scenario => scenario.id), scenarioHashes: scenarios.map(scenario => scenario.stateHash),
    replicateSeeds: [...seeds], budget, partition, scoring: 'seat-paired-zero-sum-utility',
    samplingUnit: 'scenario-block', intervalMethod: 'paired-scenario-block-percentile', confidence: 0.95,
  };
  const id = sha256(definition), roster = [];
  for (let left = 0; left < policies.length; left++) {
    for (let right = left + 1; right < policies.length; right++) {
      for (const scenario of scenarios) for (const replicate of seeds) for (const seat of [0, 1]) {
        const pair = [policies[left].id, policies[right].id];
        const assignments = seat === 0 ? pair : [...pair].reverse();
        const slot = {scenarioId: scenario.id, pair, policies: assignments, seat, replicate,
          policySeeds: assignments.map(policy => deriveSeed(id, scenario.id, replicate, policy))};
        roster.push({id: sha256({plan: id, ...slot}), ...slot});
      }
    }
  }
  return deepFreeze({...definition, id, roster});
}

export function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.policyIds) || !Array.isArray(plan.scenarioIds) || !Array.isArray(plan.scenarioHashes) || plan.scenarioIds.length !== plan.scenarioHashes.length) throw new Error('Incomplete plan identity.');
  const rebuilt = createPlan({policies: plan.policyIds.map(id => ({id})), scenarios: plan.scenarioIds.map((id, index) => ({id, stateHash: plan.scenarioHashes[index]})), seeds: plan.replicateSeeds, budget: plan.budget, partition: plan.partition});
  if (sha256(rebuilt) !== sha256(plan)) throw new Error('Plan definition, ID or schedule has been altered.');
  return true;
}

export function runLeague({policies, scenarios, plan}) {
  const expected = createPlan({policies, scenarios, seeds: plan.replicateSeeds, budget: plan.budget, partition: plan.partition});
  if (sha256(expected) !== sha256(plan)) throw new Error('Plan does not match the supplied frozen snapshots/scenarios.');
  const byPolicy = new Map(policies.map(policy => [policy.id, policy]));
  const byScenario = new Map(scenarios.map(scenario => [scenario.id, scenario]));
  const matches = plan.roster.map(slot => ({slotId: slot.id, record: runMatch({
    policies: slot.policies.map(id => byPolicy.get(id)), scenario: byScenario.get(slot.scenarioId),
    policySeeds: slot.policySeeds, budget: plan.budget, planId: plan.id,
  })}));
  return {schemaVersion: 1, type: 'league-season', plan: copyData(plan), matches,
    scope: plan.partition === 'final' ? 'Frozen-checkpoint final roster; not a general training-algorithm comparison.' : 'Development/training/selection season; no confirmatory claim.'};
}

export function validateSeason(season) {
  if (!season || season.type !== 'league-season' || !season.plan?.roster || !Array.isArray(season.matches)) throw new Error('Malformed season.');
  validatePlan(season.plan);
  const roster = new Map(season.plan.roster.map(slot => [slot.id, slot]));
  const seen = new Set();
  for (const entry of season.matches) {
    const slot = roster.get(entry.slotId);
    if (!slot || seen.has(entry.slotId)) throw new Error('Unknown or duplicate scheduled match.');
    const record = entry.record;
    const expectedScenarioHash = season.plan.scenarioHashes[season.plan.scenarioIds.indexOf(slot.scenarioId)];
    if (record.planId !== season.plan.id || record.scenario.id !== slot.scenarioId || record.scenario.stateHash !== expectedScenarioHash || record.budget !== season.plan.budget || sha256(record.policySeeds) !== sha256(slot.policySeeds) || sha256(record.policySnapshots.map(policy => policy.id)) !== sha256(slot.policies)) throw new Error('Match identity disagrees with its planned slot.');
    verifyReplay(record);
    seen.add(entry.slotId);
  }
  if (seen.size !== roster.size) throw new Error(`Incomplete season: ${roster.size - seen.size} scheduled matches are missing.`);
  return {ok: true, matches: seen.size, replay: 'trajectory verified; rerun policies separately for policy reproducibility'};
}
