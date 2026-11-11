const row = (value, group = 'available') => ({ label: `item-${value}`, group, active: true, value });
const action = (id, op, details = {}) => ({ id, op, ...details });
const point = (id, after, path, question) => ({ id, after, path, question });
const read = (tx, key) => ({ tx, table: 'items', key });

export function workshopTemplate(topic) {
  let title, question, scenario, checkpoints, trials;
  if (topic === 'retention') {
    title = 'A closed iterator is still an open snapshot';
    question = 'Which versions can cleanup remove while a reader is paused, after its query closes, and after the transaction ends?';
    scenario = {
      initial: [
        { table: 'items', key: 1, csn: 1, row: row(10) },
        { table: 'items', key: 1, csn: 2, row: row(20) },
        { table: 'items', key: 2, csn: 2, row: row(99) }
      ],
      actions: [
        action('old-start', 'begin', { tx: 'old', readOnly: true }),
        action('open', 'open-scan', { tx: 'old', table: 'items', predicate: { op: 'true' }, as: 'held' }),
        action('writer-start', 'begin', { tx: 'writer' }),
        action('change', 'put', { ...read('writer', 1), row: row(30) }),
        action('publish', 'commit', { tx: 'writer' }),
        action('clean-paused', 'vacuum'),
        action('old-pull', 'pull', { query: 'held' }),
        action('close-query', 'close-query', { query: 'held' }),
        action('idle', 'inspect'),
        action('clean-idle', 'vacuum'),
        action('old-get', 'get', read('old', 1)),
        action('release', 'abort', { tx: 'old' }),
        action('clean-free', 'vacuum'),
        action('new-start', 'begin', { tx: 'fresh', readOnly: true }),
        action('new-get', 'get', read('fresh', 1)),
        action('finish', 'abort', { tx: 'fresh' })
      ]
    };
    checkpoints = [
      point('old-snapshot', 'old-start', ['result', 'snapshot'], 'Which committed CSN does old pin?'),
      point('paused-removals', 'clean-paused', ['result', 'removed'], 'How many logical versions can this policy remove?'),
      point('paused-value', 'old-pull', ['result'], 'Predict the whole iterator result, including done and value.'),
      point('idle-pins', 'idle', ['result', 'pins'], 'Which pin survives closing the iterator?'),
      point('idle-removals', 'clean-idle', ['result', 'removed'], 'Does closing only the query allow more cleanup?'),
      point('old-value', 'old-get', ['result'], 'Predict the old row, or null if your candidate loses it.'),
      point('free-removals', 'clean-free', ['result', 'removed'], 'What becomes reclaimable after aborting old?'),
      point('remaining', 'clean-free', ['state', 'versions'], 'How many versions remain, including the unrelated key?'),
      point('new-value', 'new-get', ['result', 'value'], 'Which value can a new reader observe?')
    ];
    trials = [
      { id: 'baseline', source: 'baseline.mjs', mode: 'snapshot' },
      { id: 'candidate', source: 'candidate.mjs', mode: 'snapshot' }
    ];
  } else if (topic === 'predicate') {
    title = 'Two bookings from the same empty view';
    question = 'Will an empty predicate prevent two different keys from reserving the same slot? Does index access change the logical dependency?';
    const predicate = { op: 'eq', field: 'group', value: 'reserved' };
    scenario = {
      initial: [{ table: 'items', key: 9, csn: 1, row: row(90) }],
      actions: [
        action('a-start', 'begin', { tx: 'a' }),
        action('b-start', 'begin', { tx: 'b' }),
        action('a-empty', 'scan', { tx: 'a', table: 'items', predicate }),
        action('b-empty', 'scan', { tx: 'b', table: 'items', predicate }),
        action('a-reserve', 'put', { ...read('a', 1), row: row(10, 'reserved') }),
        action('b-reserve', 'put', { ...read('b', 2), row: row(20, 'reserved') }),
        action('a-commit', 'commit', { tx: 'a' }),
        action('b-commit', 'commit', { tx: 'b' }),
        action('inspect-start', 'begin', { tx: 'fresh', readOnly: true }),
        action('bookings', 'scan', { tx: 'fresh', table: 'items', predicate }),
        action('finish', 'abort', { tx: 'fresh' })
      ]
    };
    checkpoints = [
      point('a-snapshot', 'a-start', ['result', 'snapshot'], 'Which CSN is pinned before either writer commits?'),
      point('b-read', 'b-empty', ['result', '*', 'key'], 'Which keys does b see before a commits?'),
      point('a-status', 'a-commit', ['result', 'status'], 'Does the first writer commit?'),
      point('b-status', 'b-commit', ['result', 'status'], 'Does this mode and policy accept the second writer?'),
      point('booked-keys', 'bookings', ['result', '*', 'key'], 'Which bookings exist in a fresh snapshot?')
    ];
    trials = [
      { id: 'snapshot-scan', source: 'baseline.mjs', mode: 'snapshot', access: 'scan' },
      { id: 'serial-scan', source: 'baseline.mjs', mode: 'serializable', access: 'scan' },
      { id: 'serial-index', source: 'baseline.mjs', mode: 'serializable', access: 'index' },
      { id: 'candidate-index', source: 'candidate.mjs', mode: 'serializable', access: 'index' }
    ];
  } else throw Error('Choose retention or predicate.');
  for (const trial of trials) trial.predictions = Object.fromEntries(checkpoints.map(c => [c.id, { because: '' }]));
  return { format: 'advanced-storage-workshop-v1', title, question, seed: 17, scenario, checkpoints, trials };
}
