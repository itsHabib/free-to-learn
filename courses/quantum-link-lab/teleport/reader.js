(() => {
  const data = window.LINK_BENCH;
  if (!data) return;
  const byId = id => document.getElementById(id);
  const names = {zero: '0', one: '1', plus: '+', minus: '−', 'plus-i': '+i', 'minus-i': '−i'};
  const formatPercent = p => Math.round(100 * p) + '%';
  const average = rows => rows.reduce((sum, row) => sum + row.branch_probability * row.pass_probability, 0);
  let state = 'zero';
  let mode = 'broken';
  let selectedBits = '10';
  let foundFailure = false;

  function rows() {
    return data.traces[state][mode];
  }

  function showDetail() {
    const row = rows().find(item => item.bits === selectedBits);
    for (const button of byId('branches').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.value === selectedBits));
    }
    const labels = {X: ['+', '−'], Y: ['+i', '−i'], Z: ['0', '1']};
    const observed = row.readout_probabilities.indexOf(Math.max(...row.readout_probabilities));
    byId('view-bits').textContent = 'Message ' + row.bits;
    byId('sent').textContent = names[state];
    byId('arrived').textContent = labels[row.basis][observed];
    byId('arrived').className = observed === row.expected_bit ? 'same' : 'different';
    byId('view-explanation').textContent = 'The ' + row.basis + ' detector distinguishes ' +
      labels[row.basis].join(' and ') + '. On message ' + row.bits + ', Bob recovers ' + labels[row.basis][observed] + '.';
    const gates = row.gates.length ? row.gates.join(' then ') : 'no gate';
    byId('detail-title').textContent = 'Message ' + row.bits + ' · ' + formatPercent(row.branch_probability) + ' of deliveries';
    byId('detail-body').textContent = 'Phase bit ' + row.bits[0] + ', flip bit ' + row.bits[1] + '. Bob applies ' + gates +
      '. The verifier measures in the ' + row.basis + ' basis. It expects ' + row.expected_bit +
      ' and reads it with probability ' + formatPercent(row.readout_probabilities[row.expected_bit]) + '.';
  }

  function render() {
    const traces = rows();
    const p = average(traces);
    if (p < 1 - 1e-10) foundFailure = true;
    const current = data.traces[state];
    const patched = mode === 'ideal';
    for (const button of byId('states').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.value === state));
    }
    byId('mode').textContent = patched ? 'Repaired receiver' : 'Original receiver';
    byId('success').textContent = formatPercent(p);
    byId('picked').textContent = names[state];
    document.querySelector('.trace').dataset.fail = String(p < 1 - 1e-10);
    const observation = p < 1 - 1e-10 ? 'Two messages fail. Inspect a losing message below.' :
      patched ? 'Every message passes with both corrections available.' :
      'Every message passes. An ordinary bit test would clear this receiver.';
    byId('feedback').textContent = observation;
    const body = byId('branches');
    body.replaceChildren();
    for (const row of traces) {
      const tr = body.insertRow();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'row-button';
      button.value = row.bits;
      button.textContent = row.bits;
      button.setAttribute('aria-label', 'Inspect Alice’s message ' + row.bits);
      button.setAttribute('aria-controls', 'detail-body');
      button.addEventListener('click', () => { selectedBits = row.bits; showDetail(); });
      tr.insertCell().append(button);
      tr.insertCell().textContent = row.gates.length ? row.gates.join(' → ') : 'No gate';
      const verdict = tr.insertCell();
      const passed = row.pass_probability > 1 - 1e-10;
      verdict.textContent = passed ? '✓ Pass' : '× Fail';
      verdict.className = passed ? 'pass' : 'miss';
    }
    byId('repair-panel').hidden = !foundFailure;
    byId('repair').textContent = patched ? 'Undo phase correction' : 'Restore phase correction';
    byId('comparison').textContent = patched ? 'Original ' + formatPercent(average(current.broken)) +
      ' → repaired ' + formatPercent(average(current.ideal)) + ' for state ' + names[state] + '.' :
      'Predict which messages will change, then rerun the same state.';
    showDetail();
  }

  byId('states').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    state = button.value;
    render();
  });
  byId('repair').addEventListener('click', () => {
    mode = mode === 'broken' ? 'ideal' : 'broken';
    render();
  });
  byId('score').textContent = data.bellScore.toFixed(2);
  render();
  byId('fallback').hidden = true;
  byId('bench').hidden = false;
})();
