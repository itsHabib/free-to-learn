// Unit 01 only: simulate committed history prefixes, not writer execution.
function observe(policy, label, history, snapshot) {
  const examined = [];
  const version = policy.visibleVersion(history, snapshot, v => examined.push(v.csn));
  return {
    label, snapshot,
    version: version === null ? null : { csn: version.csn, value: version.row?.value ?? null },
    examined
  };
}

export function probeSnapshots(buildEngine) {
  // No BaseEngine methods are needed: the experiment calls only your policy.
  const Policy = buildEngine(class {}), policy = new Policy();
  const versions = Object.freeze([
    Object.freeze({ table: 'items', key: 17, csn: 3, row: Object.freeze({ label: 'tripod', group: 'A', active: true, value: 14 }) }),
    Object.freeze({ table: 'items', key: 17, csn: 8, row: null }),
    Object.freeze({ table: 'items', key: 17, csn: 9, row: Object.freeze({ label: 'tripod', group: 'A', active: true, value: 22 }) })
  ]);
  const inserted = Object.freeze(versions.slice(0, 1));
  const deleted = Object.freeze(versions.slice(0, 2));
  const oldSnapshot = 3;
  return [
    observe(policy, 'before-insert', inserted, 2),
    observe(policy, 'old-before-delete', inserted, oldSnapshot),
    observe(policy, 'old-after-delete', deleted, oldSnapshot),
    observe(policy, 'fresh-after-delete', deleted, 8),
    observe(policy, 'old-after-reinsert', versions, oldSnapshot),
    observe(policy, 'fresh-after-reinsert', versions, 9)
  ];
}
