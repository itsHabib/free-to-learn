// Local teaching evidence, not an authenticated assessment record.
const PREFIX = 'courier-predictions-v1:';
const clone = value => JSON.parse(JSON.stringify(value));

export function createPredictionStore(storage, makeId = () => crypto.randomUUID(), now = () => new Date().toISOString()) {
  function read() {
    const events = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      const event = JSON.parse(storage.getItem(key));
      if (event?.schema !== 1 || typeof event.id !== 'string' || !Number.isSafeInteger(event.sequence) || !['answer', 'reveal'].includes(event.kind) || !event.case?.id || !event.case?.version || typeof event.case.question !== 'string') {
        throw new Error('An existing notebook entry cannot be read. It has been left unchanged.');
      }
      events.push(event);
    }
    return events.sort((a, b) => a.sequence - b.sequence || a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  function forCase(subject) {
    return read().filter(event => event.case.id === subject.id && event.case.version === subject.version);
  }
  function append(subject, detail) {
    const prior = read();
    const related = prior.filter(event => event.case.id === subject.id && event.case.version === subject.version);
    const id = makeId();
    const event = { schema: 1, id, sequence: Math.max(0, ...prior.map(item => item.sequence)) + 1, at: now(), case: clone(subject), ...detail };
    if (detail.kind === 'answer') event.priorExposure = related.some(item => item.kind === 'reveal');
    const key = PREFIX + id;
    if (storage.getItem(key) !== null) throw new Error('Notebook entry ID already exists. Please try again.');
    const serialized = JSON.stringify(event);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('The notebook save could not be verified.');
    return clone(event);
  }
  return { read, forCase, append };
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function predictionNotebook({ button, reveal, hide }) {
  const root = node('div', 'prediction-notebook');
  const label = node('label', '', 'Your prediction and reason');
  const question = node('p', 'prediction-question');
  const input = node('textarea');
  input.id = button.id + '-answer';
  input.rows = 4;
  label.htmlFor = input.id;
  const status = node('p', 'prediction-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const history = node('details', 'prediction-history');
  const historyTitle = node('summary', '', 'Saved answers and assistance');
  const entries = node('ol');
  history.append(historyTitle, entries);
  const worked = node('button', 'secondary', 'View as worked example');
  worked.type = 'button';
  worked.id = button.id + '-worked';
  const exportButton = node('button', 'secondary', 'Export notebook');
  exportButton.type = 'button';
  const note = node('p', 'prediction-note', 'Saved in this browser only. Keep an export with your source worksheet and declare any worked examples you viewed. This notebook does not grade understanding or authenticate attempts. Navigation stays open.');
  button.before(root);
  root.append(question, label, input, button, status, history, worked, exportButton, note);
  let subject;
  let store;
  const getStore = () => store ??= createPredictionStore(window.localStorage);
  const fail = error => {
    hide();
    status.textContent = `Not saved — results remain hidden. ${error.message} Keep a copy of your answer and try again when browser storage is available.`;
    status.classList.add('save-error');
  };
  function refresh() {
    const saved = getStore().forCase(subject);
    entries.replaceChildren();
    let answers = 0;
    for (const event of saved) {
      const item = node('li');
      if (event.kind === 'answer') {
        answers += 1;
        item.textContent = `${answers === 1 ? 'First answer' : `Revision ${answers - 1}`} · ${event.priorExposure ? 'after result exposure' : 'before result exposure'} · ${event.at}\n${event.answer}`;
      }
      if (event.kind === 'reveal') item.textContent = `Result viewed · ${event.mode === 'worked-example' ? 'worked-example assistance' : 'after saved answer'} · ${event.at}`;
      entries.append(item);
    }
    const exposed = saved.some(event => event.kind === 'reveal');
    status.classList.remove('save-error');
    status.textContent = `${answers ? `${answers} saved answer${answers === 1 ? '' : 's'}. The first is kept.` : 'No answer saved for this case.'} ${exposed ? 'This result has already been viewed; later answers are marked after exposure.' : 'Result has not been viewed in this notebook.'}`;
    button.textContent = answers ? 'Save revision and reveal' : 'Record and reveal';
    return saved;
  }
  function commit(mode) {
    hide();
    try {
      if (mode === 'prediction' && !input.value.trim()) {
        status.textContent = 'Write a prediction and reason before recording, or choose View as worked example.';
        input.focus();
        return;
      }
      if (mode === 'prediction') getStore().append(subject, { kind: 'answer', answer: input.value.trim() });
      getStore().append(subject, { kind: 'reveal', mode });
      refresh();
      reveal();
    } catch (error) { fail(error); }
  }
  button.addEventListener('click', () => commit('prediction'));
  worked.addEventListener('click', () => commit('worked-example'));
  exportButton.addEventListener('click', () => {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 1, note: 'Local browser teaching evidence; not authenticated or graded.', events: getStore().read() }, null, 2)], { type: 'application/json' }));
      const link = node('a');
      link.href = url;
      link.download = 'courier-prediction-notebook.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { fail(error); }
  });
  return {
    setCase(next) {
      subject = clone(next);
      hide();
      question.textContent = subject.question;
      input.value = '';
      try {
        const saved = refresh().filter(event => event.kind === 'answer');
        input.value = saved.at(-1)?.answer ?? '';
      } catch (error) { fail(error); }
    },
  };
}
