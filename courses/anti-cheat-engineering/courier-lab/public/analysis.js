import { predictionNotebook } from './prediction-notebook.js';
const $ = id => document.getElementById(id);
let data;
const rate = value => value === null ? 'undefined (no denominator)' : `${(value * 100).toFixed(1)}%`;
function showEvaluation() {
  const entry = data.evaluations[Number($('evaluation-setting').value)];
  const { metrics } = entry.result;
  for (const field of ['tp', 'fp', 'tn', 'fn']) $(field).textContent = metrics[field];
  $('evaluation-rates').textContent = `Precision ${rate(metrics.precision)} · recall ${rate(metrics.recall)} · false-positive rate ${rate(metrics.falsePositiveRate)}`;
  $('evaluation-note').textContent = `${metrics.total} synthetic cases. Positive means repeated invalid actions; declared legal automation remains negative. Compare the counts with your saved prediction and explain any difference. This is not a live user population.`;
  $('evaluation-results').hidden = false;
  $('evaluation-decisions').textContent = JSON.stringify(entry.result.decisions, null, 2);
  $('evaluation-feedback').textContent = 'Count eligible range denials whose squared distance exceeds the minimum squared distance. A window excludes its left endpoint and includes its right endpoint. Flag a case once any such window reaches the threshold. Then use its label to update exactly one count.';
}
function showRetention() {
  const entry = data.retention[Number($('retention-setting').value)];
  $('input-bytes').textContent = entry.inputBytes.toLocaleString();
  $('output-bytes').textContent = entry.outputBytes.toLocaleString();
  $('input-bar').style.width = '100%';
  $('output-bar').style.width = `${Math.min(100, 100 * entry.outputBytes / entry.inputBytes)}%`;
  $('retention-note').textContent = `${entry.outputCount} of ${entry.inputCount} events retained. Compare this with your saved count. This is a denial-event export, not a complete replay.`;
  const whole = entry.timingSummary.wholeOperation, policy = entry.timingSummary.policyAndEncode;
  $('retention-time').textContent = `Whole operation: median ${whole.medianMs.toFixed(3)} ms, ${whole.tailStatistic} ${whole.tailMs.toFixed(3)} ms. Policy + encode: median ${policy.medianMs.toFixed(3)} ms, ${policy.tailStatistic} ${policy.tailMs.toFixed(3)} ms. ${entry.samples} samples after ${entry.warmup} warmups.`;
  $('retention-fields').textContent = JSON.stringify({ settings: entry.settings, keptFields: ['tick', 'actorId', 'reason', 'distanceSquared'], runtime: data.runtime, workload: entry.workload, wholeOperationMs: entry.elapsedMs, policyAndEncodeMs: entry.policyAndEncodeMs }, null, 2);
  $('retention-results').hidden = false;
}
async function start() {
  const response = await fetch('/samples/analysis-cases.json');
  if (!response.ok) throw new Error('Recorded analysis examples could not be loaded.');
  data = await response.json();
  for (const [index, entry] of data.evaluations.entries()) $('evaluation-setting').add(new Option(entry.split === 'diagnostic' ? 'Empty-signal diagnostic' : entry.name, String(index)));
  for (const [index, entry] of data.retention.entries()) $('retention-setting').add(new Option(entry.name, String(index)));
  const evaluationBook = predictionNotebook({ button: $('show-evaluation'), reveal: showEvaluation, hide: () => { $('evaluation-results').hidden = true; $('evaluation-note').textContent = ''; } });
  const retentionBook = predictionNotebook({ button: $('show-retention'), reveal: showRetention, hide: () => { $('retention-results').hidden = true; $('retention-note').textContent = ''; } });
  function selectEvaluation() {
    const index = Number($('evaluation-setting').value), entry = data.evaluations[index];
    const cases = entry.split === 'diagnostic' ? [{ id: 'diagnostic/empty', label: false, signals: [] }] : evaluationInputs.filter(item => item.split === entry.split);
    const inputs = { split: entry.split, settings: entry.settings, settingsHash: entry.settingsHash, corpusVersion: data.corpusVersion, cases };
    $('evaluation-settings').textContent = JSON.stringify(inputs, null, 2);
    evaluationBook.setCase({ id: `evaluation/${index}`, version: 1, question: 'Using the inputs below, predict which cases are flagged and the TP, FP, FN and TN counts. What happens to precision or recall if its denominator is zero? Explain how the window and threshold affect your prediction.', inputs });
  }
  function selectRetention() {
    const index = Number($('retention-setting').value), entry = data.retention[index];
    const inputs = { settings: entry.settings, eventTicks: `One event at each integer tick from 0 through ${entry.inputCount - 1}`, inputCount: entry.inputCount, fieldsKept: ['tick', 'actorId', 'reason', 'distanceSquared'], ageRule: 'Keep nowTick - maxAgeTicks < tick <= nowTick, then the newest maxEvents.' };
    $('retention-inputs').textContent = JSON.stringify(inputs, null, 2);
    retentionBook.setCase({ id: `retention/${index}`, version: 1, question: 'How many events will remain under both limits, and what can this reduced export no longer reconstruct? Predict the direction of the byte-size change; exact runtime and serialized sizes will be measured, not inferred.', inputs });
  }
  $('evaluation-setting').addEventListener('change', selectEvaluation);
  $('retention-setting').addEventListener('change', selectRetention);
  selectEvaluation(); selectRetention();
}
start().catch(error => { $('evaluation-note').textContent = error.message; $('retention-note').textContent = error.message; });
// Input-only snapshot of courier-synthetic-evaluation-v2; no computed decisions or metrics.
const evaluationInputs = [
  {
    "id": "exploration/honest-delivery",
    "split": "exploration",
    "label": false,
    "signals": []
  },
  {
    "id": "exploration/pickup-repress",
    "split": "exploration",
    "label": false,
    "signals": [
      {
        "tick": 4,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 5,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 6,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 7,
        "reason": "range",
        "distanceSquared": 250000
      },
      {
        "tick": 9,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 10,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 11,
        "reason": "cooldown",
        "distanceSquared": 562500
      }
    ]
  },
  {
    "id": "exploration/anticipatory-presses",
    "split": "exploration",
    "label": false,
    "signals": [
      {
        "tick": 1,
        "reason": "range",
        "distanceSquared": 562500
      },
      {
        "tick": 2,
        "reason": "range",
        "distanceSquared": 250000
      },
      {
        "tick": 4,
        "reason": "cooldown",
        "distanceSquared": 250000
      },
      {
        "tick": 5,
        "reason": "cooldown",
        "distanceSquared": 62500
      },
      {
        "tick": 6,
        "reason": "cooldown",
        "distanceSquared": 0
      }
    ]
  },
  {
    "id": "exploration/delayed-reordered-retries",
    "split": "exploration",
    "label": false,
    "signals": [
      {
        "tick": 6,
        "reason": "cooldown",
        "distanceSquared": 0
      }
    ]
  },
  {
    "id": "exploration/isolated-distant-errors",
    "split": "exploration",
    "label": false,
    "signals": [
      {
        "tick": 1,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 23,
        "reason": "range",
        "distanceSquared": 1000000
      }
    ]
  },
  {
    "id": "exploration/repeated-distant-invalid",
    "split": "exploration",
    "label": true,
    "signals": [
      {
        "tick": 1,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 2,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 3,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 4,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 5,
        "reason": "range",
        "distanceSquared": 1000000
      }
    ]
  },
  {
    "id": "exploration/valid-automation",
    "split": "exploration",
    "label": false,
    "signals": []
  },
  {
    "id": "evaluation/honest-delivery",
    "split": "evaluation",
    "label": false,
    "signals": []
  },
  {
    "id": "evaluation/pickup-repress",
    "split": "evaluation",
    "label": false,
    "signals": [
      {
        "tick": 7,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 8,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 9,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 10,
        "reason": "range",
        "distanceSquared": 250000
      },
      {
        "tick": 12,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 13,
        "reason": "cooldown",
        "distanceSquared": 562500
      },
      {
        "tick": 14,
        "reason": "cooldown",
        "distanceSquared": 562500
      }
    ]
  },
  {
    "id": "evaluation/anticipatory-presses",
    "split": "evaluation",
    "label": false,
    "signals": [
      {
        "tick": 4,
        "reason": "range",
        "distanceSquared": 562500
      },
      {
        "tick": 5,
        "reason": "range",
        "distanceSquared": 250000
      },
      {
        "tick": 7,
        "reason": "cooldown",
        "distanceSquared": 250000
      },
      {
        "tick": 8,
        "reason": "cooldown",
        "distanceSquared": 62500
      },
      {
        "tick": 9,
        "reason": "cooldown",
        "distanceSquared": 0
      }
    ]
  },
  {
    "id": "evaluation/delayed-reordered-retries",
    "split": "evaluation",
    "label": false,
    "signals": [
      {
        "tick": 9,
        "reason": "cooldown",
        "distanceSquared": 0
      }
    ]
  },
  {
    "id": "evaluation/isolated-distant-errors",
    "split": "evaluation",
    "label": false,
    "signals": [
      {
        "tick": 4,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 30,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 56,
        "reason": "range",
        "distanceSquared": 1000000
      }
    ]
  },
  {
    "id": "evaluation/repeated-distant-invalid",
    "split": "evaluation",
    "label": true,
    "signals": [
      {
        "tick": 4,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 10,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 16,
        "reason": "range",
        "distanceSquared": 1000000
      },
      {
        "tick": 22,
        "reason": "range",
        "distanceSquared": 1000000
      }
    ]
  },
  {
    "id": "evaluation/valid-automation",
    "split": "evaluation",
    "label": false,
    "signals": []
  }
];
