import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createStore, quantityOver} from './store.mjs';
import {difference} from './replay.mjs';
import {jitMatcher} from './jit-scan.mjs';

const rowsOf = map => [...map.values()].sort((a,b)=>a.id.localeCompare(b.id));
export function compare(runtime, run, fixedRule, learned) {
  const rows = Array.from({length:4096},(_,i)=>({
    id:'row-'+i, quantity:i % 251 === 0 ? null : (i*7)%91
  }));
  const transactions = [
    rows.slice(0,600).map(({id},i)=>({id,quantity: i%13===0 ? null : 44})),
    rows.slice(500,900).map(({id})=>({id,delete:true})),
    [{id:'row-880',quantity:80},{id:'new-order',quantity:30}]
  ];
  const reference = quantityOver(30);
  const reports = [runView('supplied scan',reference)];
  for (const [name,choose] of [['fixed rule',fixedRule],['learned policy',learned]]) {
    const actions = {compile:0,interpret:0};
    const result = runView(name,jitMatcher(run,{choose,batchSize:256,onTrace:trace=>{
      for (const e of trace) if (e.kind==='decision') actions[e.action]++;
    }}));
    reports.push({...result, actions});
  }
  return reports;

  function runView(name,matcher) {
    const store = createStore(rows);
    const start = performance.now();
    const view = runtime.openView(store,matcher);
    let elapsed = performance.now() - start;
    let previous = verify();
    for (const writes of transactions) {
      store.commit(writes);
      const before = performance.now();
      const notifications = runtime.poll(store,view);
      elapsed += performance.now() - before;
      const current = verify();
      const expectedEvents = difference(previous,current,writes);
      assert.deepEqual(notifications,[{revision:store.revision,events:expectedEvents}],
        'Commit notifications differ from the independent snapshot difference at revision '+store.revision);
      previous = current;
    }
    return {name,queryMs: +elapsed.toFixed(3), finalMatches:view.rows.size, revisions:view.revision};

    function verify() {
      const snapshot = store.snapshot();
      const expected = snapshot.rows.filter(row=>row.quantity!==null && row.quantity>30);
      assert.equal(view.revision,snapshot.revision);
      assert.deepEqual(rowsOf(view.rows),expected.sort((a,b)=>a.id.localeCompare(b.id)));
      return new Map(expected.map(row=>[row.id,row]));
    }
  }
}
