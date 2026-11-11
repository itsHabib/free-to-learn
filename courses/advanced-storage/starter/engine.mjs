const unfinished = name => { throw new Error(`Unfinished: ${name}. Read the matching lesson and contract.`); };
// The supplied runner passes BaseEngine. You own these eight database policies.
export function buildEngine(BaseEngine) {
  return class Engine extends BaseEngine {
    visibleVersion(history, snapshot, examine = () => {}) { return unfinished('01 visibleVersion'); }
    commitTransaction(tx) { return unfinished('02 commitTransaction'); }
    writeConflicts(tx) { return unfinished('03 writeConflicts'); }
    readConflicts(tx) { return unfinished('04 readConflicts'); }
    indexMemberships(history, field) { return unfinished('05 indexMemberships'); }
    retainedVersions(history, watermark) { return unfinished('06 retainedVersions'); }
    summarizeSnapshot(rows, field, metadata) { return unfinished('07 summarizeSnapshot'); }
    planEqualityJoin(left, right, value, weights) { return unfinished('07 planEqualityJoin'); }
  };
}
