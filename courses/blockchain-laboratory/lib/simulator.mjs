import { fixture, clone, blockId, txId, proofFor, exactKeys } from './support.mjs';
import { createPublicKey } from 'node:crypto';

// A bounded in-process delivery model. It opens no sockets and models no clock drift.
export class LocalNode {
  constructor(name, protocol, ctx, genesis) {
    this.name=name;this.p=protocol;this.ctx=ctx;this.records=new Map([[genesis.id,clone(genesis)]]);
    this.head=genesis.id;this.buffer=[];this.pending=[];this.events=[];
  }
  path(id=this.head) {
    const out=[];let r=this.records.get(id);
    while(r){out.unshift(r);r=r.block?this.records.get(r.block.parent):null;}
    return out;
  }
  receive(block,label='block') {
    if(!exactKeys(block,['parent','height','transactions','stateRoot'])){this.events.push({label,decision:'rejected',code:'SHAPE'});return;}
    if(!Array.isArray(block.transactions)||block.transactions.length>16){this.events.push({label,decision:'rejected',code:'TRANSACTIONS'});return;}
    let id;try{id=blockId(block);}catch{this.events.push({label,decision:'rejected',code:'SHAPE'});return;}
    if(this.records.has(id)){this.events.push({label,decision:'duplicate'});return;}
    const parent=this.records.get(block.parent);
    if(!parent){this.buffer.push({block,label});this.events.push({label,decision:'buffered: parent missing'});return;}
    const result=this.p.validateBlock(block,parent,this.ctx);
    if(!result.ok){this.events.push({label,decision:'rejected',code:result.code});return;}
    this.records.set(result.id,result);
    const oldPath=this.path(),next=this.p.chooseHead([...this.records.values()]);
    if(!this.records.has(next)) throw new Error('chooseHead returned an unknown record');
    if(next!==this.head){const rebuilt=this.p.reconcile(oldPath,this.path(next),this.pending,this.ctx);this.head=rebuilt.head;this.pending=rebuilt.mempool;}
    this.events.push({label,decision:'accepted',selected:this.head===id,height:result.height});
    const ready=this.buffer.filter(x=>this.records.has(x.block.parent));
    this.buffer=this.buffer.filter(x=>!this.records.has(x.block.parent));
    for(const item of ready)this.receive(item.block,item.label);
  }
}

function build(protocol,f,parent,transactions) {
  let state=clone(parent.state);
  for(const tx of transactions){const r=protocol.applyTx(state,tx,f.ctx);if(!r.ok)throw new Error(`Scenario construction failed: ${r.code}`);state=r.state;}
  const block={parent:parent.id,height:parent.height+1,transactions,stateRoot:protocol.stateRoot(state)};
  const record={id:blockId(block),height:block.height,state,block};return record;
}

export function simulate(protocol,mode='partition') {
  if(!['partition','transfer'].includes(mode))throw new Error('Use partition or transfer');
  const f=fixture(),g={id:'0'.repeat(64),height:0,state:f.state};
  const t={
    leftSpend:f.transaction('a','b',30,0),leftFund:f.transaction('b','c',8,0),leftChild:f.transaction('c','d',5,0),
    rightSpend:f.transaction('a','c',50,0),rightReturn:f.transaction('c','a',12,0),rightNext:f.transaction('a','d',2,1),
    waitingB:f.transaction('b','a',4,1),waitingC:f.transaction('c','d',6,1),
  };
  const L1=build(protocol,f,g,[t.leftSpend]);
  const L2=build(protocol,f,L1,[t.leftFund,t.leftChild]);
  const R1=build(protocol,f,g,[t.rightSpend]);
  const R2=build(protocol,f,R1,[t.rightReturn]);
  const R3=build(protocol,f,R2,[t.rightNext]);
  const scenario={version:1,mode,genesis:g,transactions:t,
    publicKeys:[...f.ctx.publicKeys].map(([name,key])=>[name,key.export({type:'spki',format:'pem'})]),
    blocks:Object.fromEntries(Object.entries({L1,L2,R1,R2,R3}).map(([name,r])=>[name,r.block])),
    votes:[f.vote('a',2,L2.id),f.vote('a',2,L2.id),f.vote('b',2,L2.id)]};
  return replayScenario(protocol,scenario);
}

export function replayScenario(protocol,scenario){
  if(scenario?.version!==1 || !['partition','transfer'].includes(scenario.mode))throw new Error('Unsupported replay scenario');
  const mode=scenario.mode,g=clone(scenario.genesis),t=clone(scenario.transactions);
  const f={ctx:{network:'classroom-v1',publicKeys:new Map(scenario.publicKeys.map(([name,key])=>[name,createPublicKey(key)]))}};
  const records={};
  for(const [name,parent] of [['L1',g],['L2','L1'],['R1',g],['R2','R1'],['R3','R2']]){
    const p=typeof parent==='string'?records[parent]:parent;
    const r=protocol.validateBlock(scenario.blocks[name],p,f.ctx);
    if(!r.ok)throw new Error(`Replay valid branch ${name} failed: ${r.code}`);
    records[name]=r;
  }
  const {L1,L2,R1,R2,R3}=records;
  const labels=new Map([[g.id,'genesis'],[L1.id,'L1'],[L2.id,'L2'],[R1.id,'R1'],[R2.id,'R2'],[R3.id,'R3']]);
  const txLabels=new Map(Object.entries(t).map(([k,v])=>[txId(v),k]));
  const left=new LocalNode('left',protocol,f.ctx,g),right=new LocalNode('right',protocol,f.ctx,g);
  left.receive(L1.block,'L1');left.receive(L2.block,'L2');right.receive(R1.block,'R1');right.receive(R2.block,'R2');right.receive(R3.block,'R3');
  const before={left:labels.get(left.head),right:labels.get(right.head)};
  const staleProof=proofFor(L2.state,'c');
  const votes=scenario.votes;
  const duplicateCertificate=protocol.verifyCertificate(votes,2,L2.id,f.ctx);
  if(mode==='transfer') {
    left.pending=[t.waitingB,t.waitingC];
    const forged={...R3.block,height:999,stateRoot:'f'.repeat(64)};
    left.receive(forged,'forged-height');
    left.receive({...R3.block,stateRoot:'f'.repeat(64)},'forged-root');
    left.receive(R3.block,'R3');left.receive(R2.block,'R2');left.receive(R1.block,'R1');left.receive(R1.block,'R1-duplicate');
  } else {
    left.receive(R1.block,'R1');left.receive(R2.block,'R2');left.receive(R3.block,'R3');
  }
  right.receive(L2.block,'L2');right.receive(L1.block,'L1');
  // Rebuild once against the final branch from the original abandoned path,
  // preserving candidates that the strict ready-only pool would drop during intermediate heads.
  // The incident report makes this difference visible instead of hiding it.
  const recovery=protocol.reconcile([g,L1,L2],[g,R1,R2,R3],mode==='transfer'?[t.waitingB,t.waitingC]:[],f.ctx);
  const after={left:labels.get(left.head),right:labels.get(right.head)};
  const state=left.records.get(left.head).state;
  return {
    model:'In-process, finite delivery schedule; ephemeral keys; no network service',mode,before,after,
    converged:left.head===right.head,state,total:Object.values(state).reduce((n,a)=>n+a.balance,0),
    staleProofAccepted:protocol.verifyProof(protocol.stateRoot(state),'c',L2.state.c,staleProof),
    duplicateCertificateAccepted:duplicateCertificate,
    livePool:left.pending.map(x=>txLabels.get(txId(x))??txId(x)),
    recoveryFromRetainedCandidates:recovery.mempool.map(x=>txLabels.get(txId(x))??txId(x)),
    leftEvents:left.events,rightEvents:right.events,
    note:'The ready-only live pool may discard candidates during intermediate reorgs. The retained-candidate recovery is a separate explicit call, not hidden durable pool storage.',
    scenario:clone(scenario),
  };
}
