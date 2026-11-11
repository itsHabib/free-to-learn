const STORAGE = 'ivy-anti-cheat-learning-v1';
const $ = (selector) => document.querySelector(selector);
let units = [];
let record;
let busy = false;
let referenceReturnId;
const drafts = new Map();

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action, secondary = false) {
  const node = element('button', text, secondary ? 'secondary' : '');
  node.type = 'button'; node.addEventListener('click', () => run(action)); return node;
}
function status(message = '', error = false) {
  $('#global-status').textContent = message;
  $('#global-status').className = error ? 'status-error' : '';
  $('#global-status').setAttribute('role', error ? 'alert' : 'status');
}
async function api(route, body) {
  const options = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const response = await fetch(`/learning/${route}`, { ...options, signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? 'The local server could not save this action.');
  return data;
}
function session(body = {}) { return { sessionId: record.sessionId, ...body }; }
async function refresh() { record = await api('state', session()); $('#session-id').value = record.sessionId; }
async function enterSection() {
  const { unit, key } = selected();
  if (key !== 'mastery') await api('visit', session({ unitId: unit.id, key }));
}
async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach((node) => { node.disabled = true; });
  status('Saving…');
  try { await action(); status(); } catch (error) { status(error.message, true); }
  finally { busy = false; document.querySelectorAll('button').forEach((node) => { node.disabled = false; }); }
}
function selected() {
  const [unitId, key] = location.hash.slice(1).split('/');
  const unit = units.find((entry) => entry.id === unitId) ?? units[0];
  return { unit, key: key === 'mastery' || unit.sections.some((section) => section.id === key) ? key : unit.sections[0].id };
}
function paragraph(parent, text, className) { parent.append(element('p', text, className)); }
function list(parent, values, tag = 'ul', className) {
  const node = element(tag, undefined, className);
  values.forEach((value) => node.append(element('li', value)));
  parent.append(node);
}
function link(text, href, current) {
  const node = element('a', text); node.href = href;
  if (current) node.setAttribute('aria-current', 'page');
  return node;
}
function card(parent, eyebrow, title) {
  const node = element('section', undefined, 'card');
  paragraph(node, eyebrow, 'eyebrow'); node.append(element('h3', title)); parent.append(node); return node;
}
function latest(unitId, mode, key) { return record.items.filter((item) => item.unitId === unitId && item.mode === mode && item.key === key).at(-1); }
async function issue(unit, section, mode) {
  await api('item', session({ unitId: unit.id, key: section.id, mode })); await refresh(); render();
}
async function reference(unit, section) {
  referenceReturnId = document.activeElement?.id;
  const result = await api('reference', session({ unitId: unit.id, ...(section ? { key: section.id } : {}) }));
  $('#reference-title').textContent = result.path;
  $('#reference-content').textContent = result.content;
  await refresh(); render(); $('#reference').showModal();
}
function render() {
  const { unit, key } = selected();
  const nav = $('#units'); nav.replaceChildren();
  units.forEach((entry, index) => {
    const item = link('', `#${entry.id}/${entry.sections[0].id}`, entry.id === unit.id);
    item.append(element('span', String(index + 1).padStart(2, '0'), 'unit-number'), element('span', entry.title));
    const progress = record.units.find((value) => value.id === entry.id);
    if (progress?.status === 'mastered') item.append(element('span', 'Mastered', 'unit-state'));
    nav.append(item);
  });
  const root = $('#content'); root.replaceChildren();
  const head = element('header', undefined, 'unit-head');
  paragraph(head, `UNIT ${units.indexOf(unit) + 1} OF ${units.length}`, 'eyebrow'); head.append(element('h2', unit.title));
  if (unit.intro) paragraph(head, unit.intro);
  if (unit.prerequisites.length) paragraph(head, `Builds on: ${unit.prerequisites.map((id) => units.find((entry) => entry.id === id)?.title ?? id).join('; ')}.`, 'small');
  list(head, unit.objectives.map((objective) => objective.text), 'ul', 'objective-list');
  const ref = button('Open implementation reference', () => reference(unit), true); ref.className = 'ref-link'; ref.id = `reference-${unit.id}`; head.append(ref); root.append(head);
  const tabs = element('nav', undefined, 'sections'); tabs.setAttribute('aria-label', 'Unit sections');
  unit.sections.forEach((section, index) => tabs.append(link(`${index + 1}. ${section.title}`, `#${unit.id}/${section.id}`, key === section.id)));
  tabs.append(link('Mastery check', `#${unit.id}/mastery`, key === 'mastery')); root.append(tabs);
  if (key === 'mastery') return renderMastery(root, unit);
  const section = unit.sections.find((entry) => entry.id === key);
  const teaching = element('section', undefined, 'teaching'); teaching.append(element('h3', section.title));
  section.paragraphs.forEach((text, index) => { const p = element('p', text); p.id = `${unit.id}-${section.id}-paragraph-${index + 1}`; teaching.append(p); }); root.append(teaching);
  renderWorked(root, unit, section);
  const completion = latest(unit.id, 'completion', section.id);
  const practice = latest(unit.id, 'practice', section.id);
  const step = card(root, '02 · FINISH A PARTLY SOLVED CASE', 'Complete the missing decision');
  if (!completion) {
    paragraph(step, section.completion.prompt); list(step, section.completion.steps, 'ol', 'step-list');
    paragraph(step, section.completion.missing, 'small');
  }
  if (completion) renderItem(step, completion, unit, section);
  if (!completion) step.append(button('Start completion item', () => issue(unit, section, 'completion')));
  const independent = card(root, '03 · MAKE YOUR OWN DECISION', 'Practice on a fresh case');
  if (practice) renderItem(independent, practice, unit, section);
  if (!practice && completion?.attempts.some((attempt) => attempt.status === 'scored')) independent.append(button('Start independent practice', () => issue(unit, section, 'practice')));
  if (!practice && !completion?.attempts.some((attempt) => attempt.status === 'scored')) paragraph(independent, 'Complete and commit the partly solved case above first. You can visit any other section or the mastery check at any time.', 'muted');
  const next = unit.sections[unit.sections.indexOf(section) + 1];
  root.append(link(next ? `Continue: ${next.title} →` : 'Continue to the mastery check →', `#${unit.id}/${next?.id ?? 'mastery'}`));
}
function renderWorked(root, unit, section) {
  const box = card(root, '01 · WORKED SIBLING CASE', 'Follow a complete example'); box.classList.add('worked');
  paragraph(box, section.worked.prompt);
  const exposure = record.exposures.filter((entry) => entry.unitId === unit.id && entry.key === section.id).at(-1);
  if (exposure) {
    paragraph(box, `Your prediction: ${exposure.prediction || `Skipped: ${exposure.skipReason}`}`, 'small');
    list(box, exposure.worked.steps, 'ol', 'step-list'); paragraph(box, `Worked answer: ${display(exposure.worked.answer)}`); return;
  }
  paragraph(box, 'Predict an answer or the first decision before revealing this sibling example. This is saved, not scored.', 'small');
  const prediction = input(box, 'Your prediction', `prediction-${unit.id}-${section.id}`, 'textarea');
  const skip = input(box, 'Or give a reason to skip the prediction', `skip-${unit.id}-${section.id}`, 'input');
  box.append(button('Save prediction and reveal example', async () => {
    await api('worked', session({ unitId: unit.id, key: section.id, prediction: prediction.value, skipReason: skip.value })); await refresh(); render();
  }));
}
function input(parent, label, id, tag = 'textarea') {
  const caption = element('label', label); caption.htmlFor = id;
  const control = element(tag); control.id = id; control.value = drafts.get(id) ?? '';
  control.addEventListener('input', () => drafts.set(id, control.value)); parent.append(caption, control); return control;
}
function display(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function renderItem(parent, item, unit, section) {
  const group = element('div'); group.dataset.itemId = item.id;
  paragraph(group, item.prompt);
  if (item.inputs && Object.keys(item.inputs).length) group.append(element('pre', JSON.stringify(item.inputs, null, 2)));
  let answer;
  const id = `answer-${item.id}`;
  if (item.format.type === 'choice') {
    const label = element('label', 'Your answer'); label.htmlFor = id;
    answer = element('select'); answer.id = id; answer.append(new Option('Choose an answer', ''));
    item.format.options.forEach((option) => answer.append(new Option(option.label, option.value)));
    answer.value = drafts.get(id) ?? item.attempts.at(-1)?.rawAnswer ?? '';
    answer.addEventListener('change', () => drafts.set(id, answer.value)); group.append(label, answer);
  }
  if (item.format.type !== 'choice') {
    answer = input(group, item.format.type === 'json' ? 'Your answer as JSON' : 'Your numeric answer', id, item.format.type === 'json' ? 'textarea' : 'input');
    answer.value = drafts.get(id) ?? item.attempts.at(-1)?.rawAnswer ?? '';
    if (item.format.type === 'number') answer.inputMode = 'decimal';
    if (item.format.type === 'json') answer.className = 'json';
  }
  const assistance = element('select'); assistance.id = `assistance-${item.id}`;
  assistance.append(new Option('No help beyond this guided teaching', 'none'), new Option('I used other help or saw an answer', 'help'));
  assistance.value = drafts.get(assistance.id) ?? 'none';
  assistance.addEventListener('change', () => drafts.set(assistance.id, assistance.value));
  const caption = element('label', 'Assistance used for this response'); caption.htmlFor = assistance.id;
  group.append(caption, assistance);
  const actions = element('div', undefined, 'actions');
  actions.append(button(item.attempts.length ? 'Save a revision' : 'Commit answer and check', async () => {
    await api('submit', session({ itemId: item.id, answer: answer.value, assistance: assistance.value === 'none' ? [] : ['Learner declared other help or answer exposure'] })); await refresh(); render();
    document.querySelector(`[data-item-id="${item.id}"] .feedback`)?.scrollIntoView({ block: 'nearest' });
  }));
  if (item.mode !== 'mastery') actions.append(button(`Request hint ${Math.min(item.hints.length + 1, 3)}${item.hints.length === 2 ? ' (worked solution)' : ''}`, async () => {
    await api('hint', session({ itemId: item.id })); await refresh(); render();
  }, true));
  group.append(actions);
  item.hints.forEach((hint) => paragraph(group, `Hint ${hint.level}: ${hint.text}`, 'hint'));
  const attempt = item.attempts.at(-1);
  if (attempt) renderFeedback(group, item, attempt, unit, section);
  if (attempt?.status === 'scored' && item.mode !== 'mastery') group.append(button('Try a fresh case on this concept', () => issue(unit, section, item.mode), true));
  parent.append(group);
}
function renderFeedback(group, item, attempt, unit, section) {
  const box = element('div', undefined, `feedback ${attempt.status === 'format-error' ? 'error' : attempt.correct ? '' : 'wrong'}`); box.setAttribute('role', 'status');
  if (attempt.status === 'format-error') {
    box.append(element('strong', 'Saved format error · not scored')); paragraph(box, attempt.message); paragraph(box, `Saved original: ${attempt.rawAnswer}`); group.append(box); return;
  }
  box.append(element('strong', attempt.correct ? 'Correct for this case' : 'This decision needs repair'));
  paragraph(box, `Your committed answer: ${attempt.rawAnswer}`);
  paragraph(box, `Expected: ${display(attempt.feedback.expected)}`);
  paragraph(box, attempt.feedback.explanation);
  paragraph(box, `${attempt.firstScored ? 'First scored response' : 'Revision; the first scored response is preserved'} · ${attempt.assisted ? 'assisted or already exposed' : 'no assistance recorded'}`, 'small');
  if (!attempt.correct) {
    paragraph(box, 'Use the explanation above and the teaching paragraph for this concept, then try a fresh case.', 'small');
    if (section) box.append(link(`Return to “${section.title}”`, `#${unit.id}/${section.id}`));
    const referenceButton = button('Open the linked implementation reference', () => reference(unit, section), true);
    referenceButton.id = `reference-${item.id}`;
    box.append(referenceButton);
  }
  group.append(box);
  const history = element('details', undefined, 'history'); history.append(element('summary', `${item.attempts.length} saved response${item.attempts.length === 1 ? '' : 's'} · original wording and input retained`));
  paragraph(history, item.prompt); history.append(element('pre', JSON.stringify(item.inputs ?? {}, null, 2)));
  item.attempts.forEach((entry) => paragraph(history, `#${entry.revision} ${entry.at} · ${entry.status} · ${entry.rawAnswer}`)); group.append(history);
}
function renderMastery(root, unit) {
  const progress = record.units.find((entry) => entry.id === unit.id);
  const box = element('section', undefined, 'status-box'); box.append(element('h3', 'Three decisions. One high criterion.'));
  paragraph(box, 'All three generated cases must be correct on the first scored response, with no recorded assistance. Format errors are saved but not scored. Revisions help you repair; they cannot replace an initial answer.');
  paragraph(box, 'No hints are available in this check. Returning to teaching or opening a reference while a question is pending marks that response assisted. You can always take a new set.', 'small');
  paragraph(box, `Current status: ${progress.status.replaceAll('-', ' ')}`);
  list(box, progress.objectives.map((objective) => `${objective.status.replaceAll('-', ' ')} — ${objective.text}`)); root.append(box);
  const sets = record.masterySets.filter((set) => set.unitId === unit.id);
  const current = sets.at(-1);
  root.append(button(current ? 'Start a fresh three-item set' : 'Start the three-item check', async () => {
    await api('mastery', session({ unitId: unit.id })); await refresh(); render();
  }));
  if (current) current.itemIds.forEach((id, index) => {
    const item = record.items.find((entry) => entry.id === id);
    const panel = card(root, `GENERATED CASE ${index + 1} OF 3`, item.key);
    renderItem(panel, item, unit);
  });
  if (sets.length > 1) {
    const history = element('details', undefined, 'history'); history.append(element('summary', `${sets.length - 1} earlier sets retained`));
    sets.slice(0, -1).forEach((set) => paragraph(history, `${set.id}: ${set.status} · ${set.generatedAt}`)); root.append(history);
  }
}
async function start() {
  try {
    localStorage.setItem(`${STORAGE}-probe`, '1'); localStorage.removeItem(`${STORAGE}-probe`);
    const catalog = await api('catalog'); units = catalog.units; $('#boundary').textContent = catalog.boundary;
    const saved = localStorage.getItem(STORAGE);
    record = saved ? await api('state', { sessionId: saved }) : await api('session', {});
    localStorage.setItem(STORAGE, record.sessionId); $('#session-id').value = record.sessionId;
    await enterSection(); render(); status();
  } catch (error) { status(`Could not start learning: ${error.message} Your existing session ID and records have not been replaced.`, true); }
}
window.addEventListener('hashchange', () => { if (!record) return; run(async () => { await enterSection(); render(); $('#lesson').focus(); }); });
$('#close-reference').addEventListener('click', () => $('#reference').close());
$('#reference').addEventListener('close', () => {
  const trigger = document.getElementById(referenceReturnId) ?? document.querySelector('.ref-link');
  trigger?.focus();
});
$('#export').addEventListener('click', () => run(async () => {
  if (!record) throw new Error('Restore a saved session before exporting.');
  const data = await api('export', session());
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const anchor = link('', url); anchor.download = `courier-learning-${record.sessionId.slice(0, 8)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
$('#restore').addEventListener('click', () => run(async () => {
  const restored = await api('state', { sessionId: $('#session-id').value.trim() });
  localStorage.setItem(STORAGE, restored.sessionId); record = restored; await enterSection(); render();
}));
$('#new-session').addEventListener('click', () => run(async () => {
  const created = await api('session', {}); localStorage.setItem(STORAGE, created.sessionId); record = created; $('#session-id').value = record.sessionId; await enterSection(); render();
}));
await start();
