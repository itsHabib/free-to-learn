// The transaction log retains every revision for the lifetime of this store.
function isInt32(value) {
  return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
}

function checkId(id) {
  if (typeof id !== 'string' || id.length === 0) throw new TypeError('Order id must be a nonempty string');
}

function order({ id, quantity }) {
  checkId(id);
  if (quantity !== null && !isInt32(quantity)) throw new TypeError('Order quantity must be null or a signed i32');
  return Object.freeze({ id, quantity });
}

export function quantityOver(threshold = 30) {
  if (!isInt32(threshold)) throw new TypeError('Threshold must be a signed i32');
  return values => {
    const matches = [];
    for (const [index, quantity] of values.entries()) {
      if (quantity !== null && quantity > threshold) matches.push(index);
    }
    return matches;
  };
}

// Stock adapter shared by snapshot and incremental scans.
export function selectRows(rows, matcher) {
  const indices = matcher(rows.map(row => row.quantity));
  if (!Array.isArray(indices)) throw new TypeError('Matcher must return an array of row indices');
  const selected = new Map();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw new RangeError('Invalid matcher index');
    const row = rows[index];
    if (selected.has(row.id)) throw new Error('Duplicate matcher index');
    selected.set(row.id, row);
  }
  return selected;
}

export function createStore(initialRows = []) {
  const orders = new Map();
  const history = [];
  for (const initial of initialRows) {
    const row = order(initial);
    if (orders.has(row.id)) throw new Error('Duplicate initial order id: ' + row.id);
    orders.set(row.id, row);
  }

  function commit(writes) {
    if (!Array.isArray(writes) || writes.length === 0) throw new Error('A commit needs at least one write');
    const final = new Map();
    for (const write of writes) {
      checkId(write.id);
      if (write.delete === true && Object.hasOwn(write, 'quantity')) throw new TypeError('Delete takes only an id');
      final.set(write.id, write.delete === true ? null : order(write));
    }
    const changes = [];
    for (const [id, row] of final) {
      if (row === null) orders.delete(id);
      else orders.set(id, row);
      changes.push(Object.freeze({ id, row }));
    }
    const revision = history.length + 1;
    history.push(Object.freeze({ revision, changes: Object.freeze(changes) }));
    return revision;
  }

  function snapshot() {
    return { revision: history.length, rows: Array.from(orders.values()) };
  }

  function changesAfter(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > history.length) {
      throw new RangeError('Cursor must name a retained revision of this store');
    }
    return history.slice(revision);
  }

  return { snapshot, commit, changesAfter, get revision() { return history.length; } };
}
