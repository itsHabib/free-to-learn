import {next, stateKey} from './game.mjs';
import {sha256, copyData} from './identity.mjs';
import {createRng, shuffle, deriveSeed} from './rng.mjs';
import {runMatch, snapshotPolicy, policyDescriptor, verifyReplay} from './runner.mjs';

export function checkFeatures(vector) {
  if (!Array.isArray(vector) || vector.length < 1 || vector.length > 32 || Array.from(vector).some(value => !Number.isFinite(value) || Math.abs(value) > 1)) throw new Error('Features must contain 1–32 finite values in [-1,1].');
  return vector;
}
export function predictLinear(weights, vector) {
  checkFeatures(vector);
  if (!Array.isArray(weights) || weights.length !== vector.length || Array.from(weights).some(weight => !Number.isFinite(weight))) throw new Error('Weights must be finite and match the feature count.');
  const prediction = weights.reduce((sum, weight, index) => sum + weight * vector[index], 0);
  if (!Number.isFinite(prediction)) throw new Error('Linear prediction is nonfinite.');
  return prediction;
}
export function evaluateLinear(state, player, weights, features) {
  if (state.terminal) return state.returns[player];
  return Math.max(-0.99, Math.min(0.99, predictLinear(weights, features(copyData(state), player))));
}

// Learners fit the model; this supplied adapter retains the episode source and
// gives each visited state a terminal outcome from its actual actor's view.
export function examplesFromMatches(matches, features) {
  if (!Array.isArray(matches) || typeof features !== 'function') throw new Error('Matches and a feature function are required.');
  const examples = [];
  for (const entry of matches) {
    const match = entry.record ?? entry;
    verifyReplay(match);
    if (match.status !== 'completed' || !match.result?.returns || match.result.returns.length !== 2) throw new Error('Training requires completed legal episodes; forfeits/partial games are not invented rewards.');
    let state = copyData(match.initialState);
    const episodeId = match.id, scenarioId = match.scenario.id;
    for (const step of match.steps) {
      if (state.terminal || step.actor !== state.currentPlayer) throw new Error('Episode actor or terminal state disagrees with its trace.');
      const player = state.currentPlayer;
      const x = [...checkFeatures(features(copyData(state), player))];
      examples.push({x, target: match.result.returns[player], player, episodeId, scenarioId,
        stateHash: stateKey(state), behaviorSnapshotIds: match.policySnapshots.map(policy => policy.id)});
      state = next(state, step.actionId).state;
      if (stateKey(state) !== step.stateHash) throw new Error('Training trace diverges from the supplied simulator.');
    }
    if (!state.terminal || sha256(state.returns) !== sha256(match.result.returns)) throw new Error('Training labels disagree with the replayed terminal result.');
  }
  return examples;
}

export function partitionEpisodes(examples, {seed = 1, fraction = 0.8} = {}) {
  if (!Array.isArray(examples) || !examples.length || !Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) throw new Error('Use nonempty examples and a split fraction between zero and one.');
  const scenarioIds = [...new Set(examples.map(example => example.scenarioId))];
  if (scenarioIds.length < 2) throw new Error('At least two scenario groups are needed for a training/validation split.');
  const order = shuffle(scenarioIds, createRng(seed));
  const split = Math.max(1, Math.min(order.length - 1, Math.floor(order.length * fraction)));
  const training = new Set(order.slice(0, split));
  return {training: examples.filter(example => training.has(example.scenarioId)), validation: examples.filter(example => !training.has(example.scenarioId)),
    trainingScenarioIds: order.slice(0, split), validationScenarioIds: order.slice(split), seed,
    limitation: 'Groups by supplied scenario ID. The scenario author must keep reflected sibling/duplicate initial states in one group; this is not a claim that all internal positions are unseen.'};
}

export function predictionMetrics(examples, weights) {
  if (!examples.length) throw new Error('No examples to score.');
  let squared = 0;
  for (const example of examples) { const error = predictLinear(weights, example.x) - example.target; squared += error * error; }
  return {examples: examples.length, meanSquaredError: squared / examples.length};
}

export function fitAndEvaluate({training, validation, fit, configuration = {seed: 1, epochs: 400, learningRate: 0.05}}) {
  if (typeof fit !== 'function' || !training?.length || !validation?.length) throw new Error('Training, validation and learner fit function are required.');
  const groups = new Set(training.map(example => example.scenarioId));
  if (validation.some(example => groups.has(example.scenarioId))) throw new Error('A scenario group appears in both training and validation.');
  const model = fit(copyData(training), copyData(configuration));
  if (!model || !Array.isArray(model.weights)) throw new Error('fit must return {weights}.');
  const weights = [...model.weights];
  return {weights, configuration: copyData(configuration), trainingHash: sha256(training), validationHash: sha256(validation),
    trainingMetrics: predictionMetrics(training, weights), validationMetrics: predictionMetrics(validation, weights),
    scope: 'Predicts outcomes under the recorded behavior policies; not a certificate of minimax value or playing strength.'};
}

export function createLearnedPolicy({name, weights, features, search, maxDepth = 2, sourceIdentityText, metadata = {}}) {
  if (typeof features !== 'function' || typeof search !== 'function' || !Array.isArray(weights) || Array.from(weights).some(value => !Number.isFinite(value))) throw new Error('A learned policy needs finite weights, feature extraction and search.');
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 8) throw new Error('Search depth must be in 1..8.');
  const source = sourceIdentityText ?? [features.toString(), search.toString(), createLearnedPolicy.toString(), evaluateLinear.toString(), predictLinear.toString()].join('\n');
  return snapshotPolicy({name, source, parameters: {weights: [...weights], maxDepth}, metadata,
    decide(context) {
      const evaluate = (state, player) => evaluateLinear(state, player, context.parameters.weights, features);
      return search({...context, evaluate});
    }});
}

// Bounded orchestration is supplied. Learners still choose features, fit values,
// implement search and sample the frozen opponent archive.
export function selfPlayTraining({initialPolicy, opponents, scenarios, features, fit, search, sampleOpponent,
  generations = 3, gamesPerGeneration = 12, budget = 64, seed = 1, maxDepth = 2,
  sourceIdentityText, maxTrainingCredits = 5_000_000, fitConfiguration = {epochs: 300, learningRate: 0.05}}) {
  if (!initialPolicy || !Array.isArray(opponents) || !opponents.length || !Array.isArray(scenarios) || new Set(scenarios.map(scenario => scenario.id)).size < 2) throw new Error('Self-play needs an initial snapshot, opponents and at least two scenario groups.');
  if (![features, fit, search, sampleOpponent].every(value => typeof value === 'function')) throw new Error('Self-play requires the learner feature, fit, search and sampler functions.');
  if (!Number.isInteger(generations) || generations < 1 || generations > 8 || !Number.isInteger(gamesPerGeneration) || gamesPerGeneration < scenarios.length || gamesPerGeneration > 100 || generations * gamesPerGeneration > 500) throw new Error('Use 1–8 generations and enough games to cover every scenario; this local driver caps at 500 total games.');
  if (!Number.isInteger(budget) || budget < 1 || budget > 1024 || !Number.isInteger(maxTrainingCredits) || maxTrainingCredits < 1 || maxTrainingCredits > 5_000_000) throw new Error('Invalid training credit limit.');
  if (!Number.isInteger(fitConfiguration.epochs) || fitConfiguration.epochs < 1 || fitConfiguration.epochs > 2000 || !Number.isFinite(fitConfiguration.learningRate) || fitConfiguration.learningRate <= 0 || fitConfiguration.learningRate > 1) throw new Error('Fit recipe needs 1–2000 epochs and learning rate in (0,1].');
  const rng = createRng(seed), archive = [...new Map([...opponents, initialPolicy].map(policy => [policy.id, policy])).values()];
  const records = [], history = [], examples = [];
  let current = initialPolicy, totalCredits = 0;
  for (let generation = 0; generation < generations; generation++) {
    const generationRecords = [], opponentIds = [];
    for (let game = 0; game < gamesPerGeneration; game++) {
      if (totalCredits + 40 * budget > maxTrainingCredits) throw new Error('Training cannot reserve the next game within its declared simulation-credit cap. Preserve earlier returned checkpoints by running one generation per call.');
      const publicArchive = archive.map(policy => ({id: policy.id, name: policy.name, weight: 1 / archive.length}));
      const chosen = sampleOpponent(copyData(publicArchive), rng);
      const opponent = archive.find(policy => policy.id === chosen);
      if (!opponent) throw new Error('Learner sampler selected an unknown opponent snapshot.');
      const scenario = scenarios[game % scenarios.length], seat = game % 2;
      const policies = seat === 0 ? [current, opponent] : [opponent, current];
      const record = runMatch({policies, scenario, policySeeds: [deriveSeed(seed, generation, game, 0), deriveSeed(seed, generation, game, 1)], budget, planId: `training:${seed}:${generation}`});
      if (record.status !== 'completed') throw new Error(`Training policy failed (${record.result.failure?.code}); no fabricated learning label was added.`);
      totalCredits += record.totalCredits.reduce((sum, value) => sum + value, 0);
      generationRecords.push(record); records.push(record); opponentIds.push(opponent.id);
    }
    examples.push(...examplesFromMatches(generationRecords, features));
    const split = partitionEpisodes(examples, {seed: deriveSeed(seed, 'split'), fraction: 0.75});
    const model = fitAndEvaluate({...split, fit, configuration: {...fitConfiguration, seed: deriveSeed(seed, generation, 'fit')}});
    const parents = archive.map(policy => policy.id);
    current = createLearnedPolicy({name: `learned-generation-${generation + 1}`, weights: model.weights, features, search, maxDepth, sourceIdentityText,
      metadata: {generation: generation + 1, trainingSeed: seed, trainingHash: model.trainingHash, validationHash: model.validationHash, parents, completedTrainingCredits: totalCredits}});
    archive.push(current);
    history.push({generation: generation + 1, snapshot: policyDescriptor(current), model, opponentIds, matchIds: generationRecords.map(record => record.id), completedTrainingCredits: totalCredits,
      sampling: 'Learner sampler over complete immutable archive. Admission is append-only in this bounded driver; a learner admission policy is a later extension.'});
  }
  return {schemaVersion: 1, type: 'self-play-training', seed, budget, totalCredits, generations: history, matches: records, archive, finalPolicy: current,
    scope: 'Actual outcome-trained value models against archived policies. This is not proof of stronger play; evaluate frozen snapshots on a separate roster.'};
}
