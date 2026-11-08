import { predictionNotebook } from './prediction-notebook.js';
const $ = id => document.getElementById(id);
let data;
function timing() {
  const row = data.timing[Number($('timing-case').value)];
  $('timing-summary').textContent = `${row.observed.checkpoints.length} labelled checkpoints from the real engine. Compare your saved prediction with tick, position, expiry and receipt below; append a revision explaining any difference.`;
  $('timing-checkpoints').textContent = JSON.stringify(row.observed.checkpoints, null, 2);
}
function recovery() {
  const phase = $('recovery-phase').value, row = data.recovery[phase];
  $('recovery-result').textContent = `${phase}: ${row.status} / ${row.reason ?? 'legal action'}`;
  $('recovery-state').textContent = JSON.stringify(row, null, 2);
  const loss = data.recovery.dataLoss;
  $('recovery-loss').textContent = `Recovery discards ${loss.discardedTicks} ticks and ${loss.discardedRecordedOperations} operations; score ${loss.scoreBeforeRecovery} → ${loss.scoreAtRestoredSnapshot}. Acknowledged sequence ${loss.acknowledgedSequences.highestBeforeRestore} returns to ${loss.acknowledgedSequences.restoredLastSeq}; reopened ${loss.acknowledgedSequences.reopened}. Compare this with your prediction and append any repair.`;
}
function repair() {
  const row = data.capstone.steps[Number($('repair-step').value)];
  $('repair-result').textContent = `HTTP ${row.status}: ${row.data.reason}. Compare balances, receipt and unchanged-state expectations with your saved answer.`;
  $('repair-state').textContent = JSON.stringify(row.data, null, 2);
}
const recoveryInputs = phase => {
  const row = data.recovery[phase];
  return { phase, identity: row.identity, inputSeq: row.inputSeq, action: row.action, before: row.before, configurations: data.recovery.identities.configurations, target: data.recovery.identities.targetReleaseId, releases: data.recovery.identities.releases.map(({ id, stateSchema, configId }) => ({ id, stateSchema, configId })) };
};
const repairInputs = index => {
  const requests = data.capstone.trace.slice(0, index + 1).map((entry, i) => ({ request: entry.request, position: { x: entry.state.actors[0].x, y: entry.state.actors[0].y } }));
  return { initial: { credits: 6, energy: 4, receipts: [] }, rules: { cost: 2, energyAdded: 3, energyCap: 10, rangeMm: 400, receiptLimit: 2 }, stations: [{ id: 'alpha', x: 0, y: 0 }, { id: 'beta', x: 2000, y: 0 }], requests };
};
async function start() {
  const response = await fetch('/samples/completion-cases.json');
  if (!response.ok) throw new Error('Saved completion examples unavailable.');
  data = await response.json();
  data.timing.forEach((row, i) => $('timing-case').add(new Option(`Schedule ${i + 1} · ${row.name}`, String(i))));
  data.capstone.steps.forEach((row, i) => $('repair-step').add(new Option(`Request ${i + 1}`, String(i))));
  const timingBook = predictionNotebook({ button: $('show-timing'), reveal: timing, hide: () => { $('timing-summary').textContent = ''; $('timing-checkpoints').textContent = ''; } });
  const recoveryBook = predictionNotebook({ button: $('show-recovery'), reveal: recovery, hide: () => { for (const id of ['recovery-result', 'recovery-state', 'recovery-loss']) $(id).textContent = ''; } });
  const repairBook = predictionNotebook({ button: $('show-repair'), reveal: repair, hide: () => { $('repair-result').textContent = ''; $('repair-state').textContent = ''; } });
  function selectTiming() {
    const index = Number($('timing-case').value), row = data.timing[index];
    // Action labels are result mnemonics in some fixtures. Show neutral step labels before prediction.
    const inputs = { ...row.record, rules: { tickMs: 50, maxCatchUpTicksPerSample: 5, movementPerTickMm: 250, initialX: 1000, inputActiveThrough: 'admission tick + 4 inclusive', leftoverFraction: 'Carry fractional milliseconds; discard whole ticks beyond the catch-up limit.' }, actions: row.record.actions.map((action, i) => ({ ...action, label: `step-${i + 1}` })) };
    $('timing-input').textContent = JSON.stringify(inputs, null, 2);
    timingBook.setCase({ id: `timing/${row.name}`, version: 1, question: 'Predict the processed tick, actor x position, active input expiry and input receipt at each step. Explain whether client timestamps, duplicate sequences or reconnection change them.', inputs });
  }
  function selectRecovery() {
    const phase = $('recovery-phase').value, inputs = recoveryInputs(phase);
    $('recovery-input').textContent = JSON.stringify(inputs, null, 2);
    recoveryBook.setCase({ id: `recovery/${phase}`, version: 1, question: 'Predict whether this package, configuration and state can run together and whether the action applies. Explain the compatibility check and what later acknowledged work a restore can discard.', inputs });
  }
  function selectRepair() {
    const index = Number($('repair-step').value), inputs = repairInputs(index);
    $('repair-input').textContent = JSON.stringify(inputs, null, 2);
    repairBook.setCase({ id: `capstone/request-${index + 1}`, version: 1, question: 'Predict the last request’s reason, energy, credits and receipt. Identify the authority boundary, give a double-charge counterexample, explain the capacity tradeoff and propose an independent regression test.', inputs });
  }
  $('timing-case').addEventListener('change', selectTiming);
  $('recovery-phase').addEventListener('change', selectRecovery);
  $('repair-step').addEventListener('change', selectRepair);
  selectTiming(); selectRecovery(); selectRepair();
}
start().catch(error => { $('timing-summary').textContent = error.message; });
