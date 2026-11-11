const descriptor = (id) => Object.freeze({
  id,
  policy: `${id}/policy.mjs`,
  template: `${id}/template.mjs`,
  fixtures: `${id}/fixtures.mjs`,
  prompt: `${id}/prompt.json`,
  guide: `${id}/LEARNER.md`,
  response: `${id}/response-template.md`,
});

export const MODULES = Object.freeze({
  integrity: descriptor('integrity'),
  telemetry: descriptor('telemetry'),
  evaluation: descriptor('evaluation'),
  retention: descriptor('retention'),
  timing: descriptor('timing'),
  recovery: descriptor('recovery'),
  capstone: Object.freeze({ ...descriptor('capstone'), scenario: 'capstone/scenario.mjs', scenarioTemplate: 'capstone/scenario-template.mjs', client: 'capstone/client.mjs' }),
});

export function moduleFor(id) {
  const module = Object.hasOwn(MODULES, id) && MODULES[id];
  if (!module) throw new Error(`Unknown core module: ${id}. Choose ${Object.keys(MODULES).join(' or ')}.`);
  return module;
}
