import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BaseEngine, matches, identity, copy } from './runtime/base.mjs';
import { executeScenario } from './runtime/scenario.mjs';
import { executionIdentity, sha256 } from './runtime/identity.mjs';
import { runChecks } from './checks.mjs';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

// Deliberately uses complete copied maps, not learner version selection/indexes.
export function snapshotOracle(scenario, execution) {
  const latest = new Map();
  for (const version of [...(scenario.initial ?? [])].sort((a,b) => a.csn-b.csn)) latest.set(identity(version.table, version.key), copy(version.row));
  const transactions = new Map(), queries = new Map(), mismatches = [];
  const facts = { starts: [], reads: [], deletions: [], changes: [], vacuums: [] };
  const features = { overlappingCommit: false, readAfterConcurrentCommit: false, indexedRead: false, vacuumWhilePinned: false, vacuumWithoutPins: false, planComparison: false };
  let commits = 0;
  const activeCount = () => [...transactions.values()].filter(t => t.active).length;
  const view = tx => new Map([...tx.snapshot, ...tx.writes]);
  const scan = (tx, table, p) => [...view(tx)].filter(([id,row]) => JSON.parse(id)[0] === table && matches(row,p)).map(([id,row]) => ({ key: JSON.parse(id)[1], row })).sort((a,b) => a.key-b.key);
  function expect(index, kind, expected, actual) { if (stable(expected) !== stable(actual)) mismatches.push({ index, kind, expected, actual }); }
  for (let i=0;i<execution.results.length;i++) {
    const { action:a, result:r } = execution.results[i]; const tx = transactions.get(a.tx);
    if (a.op === 'begin') { transactions.set(a.tx, { snapshot: copy(latest), writes: new Map(), active: true, start: commits }); facts.starts.push({index:i,tx:a.tx,snapshot:copy(latest)}); }
    else if (a.op === 'put' || a.op === 'delete') {
      if(a.op==='delete')facts.deletions.push({index:i,tx:a.tx,table:a.table,key:a.key,before:copy(view(tx).get(identity(a.table,a.key))??null)});
      tx.writes.set(identity(a.table,a.key), a.op==='delete'?null:copy(a.row));
    }
    else if (a.op === 'get') { expect(i,'point',view(tx).get(identity(a.table,a.key))??null,r); features.readAfterConcurrentCommit ||= commits>tx.start; }
    else if (a.op === 'scan') { const expected=scan(tx,a.table,a.predicate??{op:'true'}); expect(i,'scan',expected,r); facts.reads.push({index:i,tx:a.tx,table:a.table,predicate:a.predicate??{op:'true'},access:a.access??'scan',rows:expected,complete:true}); features.indexedRead ||= a.access==='index'; features.readAfterConcurrentCommit ||= commits>tx.start; }
    else if (a.op === 'open-scan') { const fact={index:i,tx:a.tx,table:a.table,predicate:a.predicate??{op:'true'},access:a.access??'scan',rows:[],complete:false}; facts.reads.push(fact); queries.set(a.as,{ rows:scan(tx,a.table,a.predicate??{op:'true'}), next:0, closed:false, tx:a.tx, fact }); features.indexedRead ||= a.access==='index'; }
    else if (a.op === 'pull') { const q=queries.get(a.query), expected=q.closed||q.next>=q.rows.length?{done:true}:{done:false,value:q.rows[q.next++]}; expect(i,'pull',expected,r); if(!expected.done)q.fact.rows.push(expected.value); else if(!q.closed)q.fact.complete=true; }
    else if (a.op === 'close-query') queries.get(a.query).closed=true;
    else if (a.op === 'commit') {
      features.overlappingCommit ||= activeCount()>1;
      if (r.status==='committed') { for (const [id,row] of tx.writes) { const [table,key]=JSON.parse(id); facts.changes.push({index:i,tx:a.tx,table,key,before:copy(latest.get(id)??null),row:copy(row)}); latest.set(id,copy(row)); } if(tx.writes.size)commits++; }
      tx.active=false;
    } else if (a.op === 'abort') { tx.active=false; for(const q of queries.values())if(q.tx===a.tx)q.closed=true; }
    else if (a.op === 'vacuum') { const active=[...transactions].filter(([,t])=>t.active).map(([name])=>name); facts.vacuums.push({index:i,active,removed:r.removed}); features.vacuumWhilePinned ||= activeCount()>0; features.vacuumWithoutPins ||= activeCount()===0; }
    else if (a.op === 'compare-plans') {
      features.planComparison=true; const q=a.query, left=scan(tx,q.left,{op:'eq',field:q.field,value:q.value}), right=scan(tx,q.right,{op:'true'}), expected=[];
      for(const l of left)for(const rr of right)if(l.row[q.field]!==null&&l.row[q.field]===rr.row[q.field])expected.push({leftKey:l.key,rightKey:rr.key,left:l.row,right:rr.row});
      for(const run of r.runs)expect(i,`plan:${run.id}`,expected,run.rows);
    }
  }
  return { mismatches, features, facts };
}

async function verifiedRun(directory) {
  const manifest=json(join(directory,'manifest.json')), source=readFileSync(join(directory,'engine.mjs')), scenarioBytes=readFileSync(join(directory,'scenario.json')), resultBytes=readFileSync(join(directory,'results.json'));
  for (const [key, bytes] of [['sourceSha256',source],['scenarioSha256',scenarioBytes],['resultSha256',resultBytes]]) if(manifest[key]!==sha256(bytes))throw Error(`${directory}: ${key} does not match actual bytes.`);
  if(manifest.executionIdentity!==executionIdentity())throw Error('Run used different or unrecorded runtime/checker bytes. Re-run explicitly; historical results stay historical.');
  if(typeof manifest.prediction!=='string'||!manifest.prediction.trim())throw Error('Run lacks a prediction committed before execution.');
  const module=await import(pathToFileURL(join(directory,'engine.mjs')).href+`?sha=${manifest.sourceSha256}`), Engine=module.buildEngine(BaseEngine), scenario=JSON.parse(scenarioBytes), recorded=JSON.parse(resultBytes), replay=executeScenario(Engine,scenario);
  if(stable(recorded)!==stable(replay))throw Error('Fresh replay differs from the recorded run.');
  return {manifest,scenario,replay,Engine,oracle:snapshotOracle(scenario,replay)};
}

export async function verifyInvestigation(path, expectedSourceSha256, runRoot) {
  const spec=json(path), root=runRoot??dirname(resolve(path)), checks=[];
  const check=(id,passed,details)=>checks.push({id,passed,details});
  if(spec.format!=='advanced-storage-investigation-v1')throw Error('Unknown investigation format.');
  const runs={};
  for(const name of ['broken','repaired','variant'])runs[name]=await verifiedRun(resolve(root,spec.runs[name]));
  const {broken,repaired,variant}=runs;
  check('I01-same-experiment',broken.manifest.scenarioSha256===repaired.manifest.scenarioSha256,'Broken and repaired runs must use identical scenario bytes.');
  check('I02-actual-repair',broken.manifest.sourceSha256!==repaired.manifest.sourceSha256&&repaired.manifest.sourceSha256===variant.manifest.sourceSha256&&(!expectedSourceSha256||expectedSourceSha256===repaired.manifest.sourceSha256),'Different broken source; one exact repaired source for both repaired cases and current project.');
  check('I03-observed-failure',broken.oracle.mismatches.length>0,broken.oracle.mismatches);
  check('I04-repaired-views',repaired.oracle.mismatches.length===0,repaired.oracle.mismatches);
  const structure=s=>s.actions.filter(a=>!['inspect','analyze','compare-plans'].includes(a.op)).map(a=>a.op);
  check('I05-transfer-variation',variant.oracle.mismatches.length===0&&stable(structure(variant.scenario))!==stable(structure(repaired.scenario)),'Variant must change transaction/read/write/cleanup structure, not just labels, numbers or bookkeeping.');
  check('I06-composed-mechanisms',Object.values(repaired.oracle.features).every(Boolean),repaired.oracle.features);
  const regression=runChecks(repaired.Engine,7); check('I07-regression',regression.passed,{total:regression.total,failures:regression.results.filter(r=>!r.passed)});
  let claimsValid=Array.isArray(spec.claims)&&spec.claims.length>=2, observed=false, estimated=false;
  for(const claim of spec.claims??[]) {
    const run=runs[claim.run], result=run?.replay.results[claim.action]?.result; let actual;
    if(claim.measure==='observedCost'){actual=result?.runs?.find(r=>r.id===claim.plan)?.cost;observed=true;}
    if(claim.measure==='estimatedCost'){actual=result?.explanation?.candidates?.find(r=>r.id===claim.plan)?.cost;estimated=true;}
    if(typeof actual!=='number'||typeof claim.value!=='number'||Math.abs(actual-claim.value)>1e-9)claimsValid=false;
  }
  check('I08-measured-claims',claimsValid&&observed&&estimated,'At least one actual and one estimated plan cost must equal their replayed observations; absolute tolerance 1e-9.');
  check('I09-diagnosis-present',typeof spec.diagnosis==='string'&&spec.diagnosis.trim().length>0,'Presence only. Judge the causal explanation with the published rubric; this is not an automatic writing-quality verdict.');
  return {format:'advanced-storage-investigation-report-v1',engineeringPassed:checks.every(c=>c.passed),checks,explanationQuality:'not automatically assessed',independentAcceptance:false,runSources:Object.fromEntries(Object.entries(runs).map(([k,v])=>[k,v.manifest.sourceSha256]))};
}

export async function verifyTransfer(path, expectedSourceSha256, runRoot) {
  const spec=json(path), root=runRoot??dirname(resolve(path));
  if(spec.format!=='advanced-storage-transfer-v1')throw Error('Unknown transfer format.');
  const si=await verifiedRun(resolve(root,spec.runs.snapshot)), serial=await verifiedRun(resolve(root,spec.runs.serializable)), checks=[];
  const check=(id,passed,details)=>checks.push({id,passed,details});
  const withoutMode=s=>({...s,mode:undefined});
  check('T01-controlled-isolation-comparison',si.scenario.mode==='snapshot'&&serial.scenario.mode==='serializable'&&stable(withoutMode(si.scenario))===stable(withoutMode(serial.scenario)),'Only the database-wide isolation mode changes.');
  check('T02-same-source',si.manifest.sourceSha256===serial.manifest.sourceSha256&&(!expectedSourceSha256||expectedSourceSha256===serial.manifest.sourceSha256),'Both modes use the current repaired source.');
  const roles=spec.roles??{}, collect=(run,op,who)=>run.replay.results.map((x,index)=>({...x,index})).filter(x=>x.action.op===op&&x.action.tx===who);
  const roleNames=['exporter','purger','holder'].map(k=>roles[k]);
  const validRoles=roleNames.every(x=>typeof x==='string'&&x.length>0)&&new Set(roleNames).size===3&&roleNames.every(x=>collect(serial,'begin',x).length===1);
  const initial=new Map(); for(const v of [...(serial.scenario.initial??[])].sort((a,b)=>a.csn-b.csn))initial.set(identity(v.table,v.key),v.row);
  const countTable=table=>[...initial].filter(([id,row])=>JSON.parse(id)[0]===table&&row!==null).length;
  check('T00-transfer-domain',validRoles&&countTable('items')>=2&&countTable('collections')>=2,'Use distinct role aliases, one transaction per role, at least two initial items and two collections.');
  const siPurge=collect(si,'commit',roles.purger).at(-1), serPurge=collect(serial,'commit',roles.purger).at(-1);
  // The contract leaves the description format of a conflict to the learner, so this check reads behaviour it can
  // verify itself: the purge commits under SI, aborts with at least one conflict under Serializable, and no other
  // transaction committed a write to a key the purge wrote (that would be a write conflict masking the read one).
  // T04 separately requires the matching holds change that the purge's empty read depended on.
  const purgeStart=collect(serial,'begin',roles.purger)[0]?.index, purgeKeys=new Set(serial.replay.results.filter(x=>x.action.tx===roles.purger&&['put','delete'].includes(x.action.op)).map(x=>identity(x.action.table,x.action.key)));
  const maskingWrite=serial.oracle.facts.changes.some(c=>c.tx!==roles.purger&&c.index>purgeStart&&c.index<serPurge?.index&&purgeKeys.has(identity(c.table,c.key)));
  check('T03-predicate-race',siPurge?.result.status==='committed'&&serPurge?.result.status==='aborted'&&Array.isArray(serPurge?.result.conflicts)&&serPurge.result.conflicts.length>0&&purgeKeys.size>0&&!maskingWrite,'The purge succeeds under SI but is rejected under Serializable with at least one reported conflict, and no other transaction committed a write to a key the purge wrote. Any clear conflict description format is accepted.');
  const facts=serial.oracle.facts;
  const causalHold=facts.changes.some(c=>c.tx===roles.holder&&c.table==='holds'&&c.row!==null&&c.index<serPurge?.index&&
    facts.reads.some(r=>r.tx===roles.purger&&r.table==='holds'&&r.complete&&r.rows.length===0&&r.index<c.index&&matches(c.row,r.predicate)&&
      facts.deletions.some(d=>d.tx===roles.purger&&d.table==='items'&&d.before!==null&&d.before.collection===c.row.collection&&d.index>r.index&&d.index<serPurge.index)));
  check('T04-negative-predicate-and-disjoint-write',causalHold,'An empty holds read governs a real item deletion for the same collection; the holder commits a matching hold before purge validation.');
  const reader=collect(serial,'begin',roles.exporter)[0], exportCommit=collect(serial,'commit',roles.exporter).at(-1);
  check('T05-protected-export',reader?.action.readOnly===true&&exportCommit?.result.status==='committed'&&serial.oracle.mismatches.length===0&&si.oracle.mismatches.length===0,'Explicit read-only export commits from its old snapshot; all independently checked views remain correct in both modes.');
  const comparisons=serial.replay.results.filter(x=>x.action.op==='compare-plans');
  const oldComparisons=comparisons.filter(x=>x.action.tx===roles.exporter);
  check('T06-separate-view-comparisons',oldComparisons.length>0&&comparisons.some(x=>x.action.tx!==roles.exporter&&x.result.explanation.snapshot>oldComparisons[0].result.explanation.snapshot),'Compare plans within the export view and a separately identified later snapshot.');
  const moved=facts.changes.filter(c=>c.table==='items'&&c.tx!==roles.exporter&&c.before!==null&&c.row!==null&&c.index>reader?.index&&c.index<exportCommit?.index&&['collection','location'].some(f=>c.before[f]!==c.row[f]));
  const exportView=facts.starts.find(s=>s.tx===roles.exporter)?.snapshot;
  const indexedMove=moved.some(c=>{const old=exportView?.get(identity('items',c.key));return old&&facts.reads.some(r=>r.tx===roles.exporter&&r.table==='items'&&r.access==='index'&&r.index>c.index&&matches(old,r.predicate)&&!matches(c.row,r.predicate)&&r.rows.some(x=>x.key===c.key&&stable(x.row)===stable(old)));});
  const pinnedVacuum=moved.some(c=>facts.vacuums.some(v=>v.index>c.index&&v.active.includes(roles.exporter)));
  const releasedVacuum=facts.vacuums.some(v=>v.index>exportCommit?.index&&v.active.length===0&&v.removed>0);
  check('T07-lifetime-and-index',indexedMove&&pinnedVacuum&&releasedVacuum,'The export retrieves a moved item through its old index membership, cleanup runs while it is pinned, and later cleanup removes versions after all pins close.');
  const regression=runChecks(serial.Engine,7);check('T08-regressions',regression.passed,{total:regression.total,failures:regression.failures});
  check('T09-explanation-present',typeof spec.explanation==='string'&&spec.explanation.trim().length>0,'Presence only; use the transfer rubric to assess the argument.');
  return {format:'advanced-storage-transfer-report-v1',engineeringPassed:checks.every(c=>c.passed),checks,explanationQuality:'not automatically assessed',independentAcceptance:false};
}
