// One layer only. Helpers are supplied by the workbench.
async function oneLayerExample(key) {
  const ctx = context('sibling-circuit', 'oak', 'forward', 0);
  const packet = await seal(key, ctx, {next:'archive', body:{operation:'lookup', item:'tide'}});
  const opened = await open(key, ctx, packet);
  return {packetFields:Object.keys(packet), opened};
}
