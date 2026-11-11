import { predictionNotebook } from './prediction-notebook.js';
const $ = id => document.getElementById(id);
let examples;
let frames = [];
let cursor = 0;
function comparePackage() {
  const example = examples.packages[$('package-case').value];
  const { result } = example;
  $('package-verdict').className = result.ok ? 'pass' : 'refuse';
  $('package-verdict').textContent = result.ok ? 'RECORDED MATCH · these observations met this approved reference.' : `RECORDED REFUSAL · ${result.reason}. The launcher must not start.`;
  const approved = new Map(example.manifest.files.map(file => [file.path, file.sha256.toLowerCase()]));
  const seen = new Map(example.observed.map(file => [file.path, file.sha256.toLowerCase()]));
  const changed = [...new Set([...approved.keys(), ...seen.keys()])].filter(path => approved.get(path) !== seen.get(path));
  $('package-detail').textContent = changed.length ? `Changed or missing in this recorded comparison: ${changed.join(', ')}.` : 'Every observed path and digest matches this reference.';
  $('package-feedback').hidden = false;
}
function loadRecord() {
  const example = examples.traces[$('trace-case').value];
  const { result } = example;
  frames = example.frames ?? [];
  cursor = 0;
  $('trace-verdict').className = result.ok ? 'pass' : 'refuse';
  $('trace-verdict').textContent = result.ok ? 'RECORDED REPLAY · the final state matched. This does not authenticate its author.' : `RECORDED REFUSAL · ${result.reason}. Keep the evidence; do not infer cheating.`;
  $('back-trace').disabled = true;
  $('step-trace').disabled = !result.ok || frames.length < 2;
  $('trace-result').hidden = false;
  $('replay-arena').toggleAttribute('hidden', !result.ok);
  if (!result.ok) $('trace-step').textContent = 'No replay state is shown for this refused record.';
  if (result.ok) $('trace-step').textContent = '';
  if (result.ok && frames.length) renderState();
}
function renderState() {
  const state = frames[cursor];
  $('back-trace').disabled = cursor === 0;
  $('step-trace').disabled = cursor >= frames.length - 1;
  const actor = state.actors[0]?.actor;
  if (actor) { $('replay-actor').setAttribute('cx', actor.x); $('replay-actor').setAttribute('cy', actor.y); }
  $('trace-step').textContent = `Recorded event ${cursor} / ${frames.length - 1} · tick ${state.tick}${actor ? ` · x ${actor.x} · cargo ${actor.cargo ? 'yes' : 'no'} · score ${actor.score}` : ''}`;
}
function stepRecord() {
  if (cursor >= frames.length - 1) return;
  cursor += 1;
  renderState();
  $('step-trace').disabled = cursor >= frames.length - 1;
}
function previousRecord() {
  if (cursor === 0) return;
  cursor -= 1;
  renderState();
}
async function start() {
  const response = await fetch('/samples/evidence-cases.json');
  if (!response.ok) throw new Error('Recorded examples could not be loaded.');
  examples = await response.json();
  const packages = predictionNotebook({ button: $('compare-package'), reveal: comparePackage, hide: () => { $('package-feedback').hidden = true; $('package-verdict').textContent = ''; $('package-detail').textContent = ''; } });
  const traces = predictionNotebook({ button: $('replay-trace'), reveal: loadRecord, hide: () => { $('trace-result').hidden = true; $('replay-arena').setAttribute('hidden', ''); $('trace-verdict').textContent = ''; $('trace-step').textContent = ''; $('step-trace').disabled = true; $('back-trace').disabled = true; } });
  function selectPackage() {
    const id = $('package-case').value;
    const { manifest, observed, supported, clientClaim } = examples.packages[id];
    const inputs = { manifest, observed, supported, clientClaim };
    $('package-observation').textContent = JSON.stringify(inputs, null, 2);
    packages.setCase({ id: `integrity/${id}`, version: 1, question: 'Will this package match the approved reference and supported release list? Name the first refusal reason if any, and explain what a match would establish about the observer.', inputs });
  }
  function selectTrace() {
    const id = $('trace-case').value;
    const { record } = examples.traces[id];
    $('trace-observation').textContent = JSON.stringify(record, null, 2);
    traces.setCase({ id: `replay/${id}`, version: 1, question: 'Will replay accept this record or refuse it? Identify the condition to check first and explain whether a consistent replay authenticates its author.', inputs: record });
  }
  $('package-case').addEventListener('change', selectPackage);
  $('trace-case').addEventListener('change', selectTrace);
  $('step-trace').addEventListener('click', stepRecord);
  $('back-trace').addEventListener('click', previousRecord);
  selectPackage();
  selectTrace();
}
start().catch(error => { for (const id of ['package-verdict', 'trace-verdict']) $(id).textContent = error.message; });
