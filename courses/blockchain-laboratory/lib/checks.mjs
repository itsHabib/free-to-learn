import assert from 'node:assert/strict';
import { fixture, clone, sha256, txBytes, txId, proofFor, blockId, verifyVote, accountBytes, leafHash, branchHash, rootHash } from './support.mjs';

export function cases(p) {
  const out=[];
  const add=(module,id,requirement,run)=>out.push({module,id,requirement,run});
  const makeBlock=(f,parent,transactions)=>{
    let state=clone(parent.state);
    for(const tx of transactions) {const r=p.applyTx(state,tx,f.ctx); assert.equal(r.ok,true,'fixture transaction must be valid'); state=r.state;}
    return {parent:parent.id,height:parent.height+1,transactions,stateRoot:p.stateRoot(state)};
  };
  const genesis=f=>({id:'0'.repeat(64),height:0,state:clone(f.state)});
  const record=(f,block,parent)=>{const r=p.validateBlock(block,parent,f.ctx);assert.equal(r.ok,true);return r;};

  add('01','authentic','Accept a valid signature over the exact canonical fields',()=>{
    const f=fixture();assert.deepEqual(p.validateEnvelope(f.transaction('a','b',7,0),f.ctx),{ok:true});
  });
  add('01','canonical-order','Object property order must not change signed meaning',()=>{
    const f=fixture(),t=f.transaction('a','c',8,0);const reversed=Object.fromEntries(Object.entries(t).reverse());
    assert.deepEqual(p.validateEnvelope(reversed,f.ctx),{ok:true});assert.deepEqual(txBytes(t),txBytes(reversed));
  });
  add('01','tamper','Changing an amount after signing must fail authentication',()=>{
    const f=fixture(),t=f.transaction('a','b',7,0);t.amount=8;assert.equal(p.validateEnvelope(t,f.ctx).code,'SIGNATURE');
  });
  add('01','domain','A valid signature from another network must be rejected',()=>{
    const f=fixture();assert.equal(p.validateEnvelope(f.transaction('a','b',7,0,{network:'other-lab'}),f.ctx).code,'NETWORK');
  });
  add('01','strict-shape','Unknown fields and missing fields are not silently reinterpreted',()=>{
    const f=fixture(),t=f.transaction('a','b',7,0);assert.equal(p.validateEnvelope({...t,memo:'extra'},f.ctx).code,'SHAPE');
    const missing={...t};delete missing.nonce;assert.equal(p.validateEnvelope(missing,f.ctx).code,'SHAPE');
    assert.equal(p.validateEnvelope(null,f.ctx).code,'SHAPE');
  });
  add('01','numbers','Amounts and nonces are bounded integers, never coerced',()=>{
    const f=fixture();for(const amount of [0,-1,1.5,'7',Number.MAX_SAFE_INTEGER+1]) assert.equal(p.validateEnvelope(f.transaction('a','b',amount,0),f.ctx).code,'AMOUNT');
    for(const nonce of [-1,0.5,'0',Number.MAX_SAFE_INTEGER+1]) assert.equal(p.validateEnvelope(f.transaction('a','b',7,nonce),f.ctx).code,'NONCE');
  });
  add('01','identity','Unknown accounts and malformed signatures have explicit failures',()=>{
    const f=fixture(),t=f.transaction('a','b',7,0);assert.equal(p.validateEnvelope({...t,to:'outsider'},f.ctx).code,'ACCOUNT');
    for(const signature of ['','zz'.repeat(64),t.signature.toUpperCase()]) assert.equal(p.validateEnvelope({...t,signature},f.ctx).code,'SIGNATURE');
  });
  add('02','transition','Debit, credit and increment exactly once without input mutation',()=>{
    const f=fixture(),before=clone(f.state),r=p.applyTx(f.state,f.transaction('a','c',13,0),f.ctx);
    assert.equal(r.ok,true);assert.deepEqual(r.state,{a:{balance:87,nonce:1},b:{balance:40,nonce:0},c:{balance:13,nonce:0},d:{balance:0,nonce:0}});assert.deepEqual(f.state,before);
  });
  add('02','replay','A signature does not make a consumed nonce valid again',()=>{
    const f=fixture(),t=f.transaction('a','b',5,0),r=p.applyTx(f.state,t,f.ctx);assert.equal(r.ok,true);assert.equal(p.applyTx(r.state,t,f.ctx).code,'NONCE');
  });
  add('02','future','Future nonce is ineligible against this state',()=>{
    const f=fixture();assert.equal(p.applyTx(f.state,f.transaction('a','b',5,1),f.ctx).code,'NONCE');
  });
  add('02','atomic-reject','An overspend changes nothing',()=>{
    const f=fixture(),before=clone(f.state);assert.equal(p.applyTx(f.state,f.transaction('a','b',101,0),f.ctx).code,'FUNDS');assert.deepEqual(f.state,before);
  });
  add('02','self-transfer','Self-transfer preserves balance and still consumes nonce',()=>{
    const f=fixture(),r=p.applyTx(f.state,f.transaction('a','a',99,0),f.ctx);assert.equal(r.ok,true);assert.deepEqual(r.state.a,{balance:100,nonce:1});
    assert.equal(p.applyTx(f.state,f.transaction('a','a',101,0),f.ctx).code,'FUNDS');
  });
  add('02','overflow','Unsafe recipient balance or next nonce is rejected atomically',()=>{
    const f=fixture();f.state.b.balance=Number.MAX_SAFE_INTEGER;assert.equal(p.applyTx(f.state,f.transaction('a','b',1,0),f.ctx).code,'OVERFLOW');
    f.state.a.nonce=Number.MAX_SAFE_INTEGER;assert.equal(p.applyTx(f.state,f.transaction('a','a',1,Number.MAX_SAFE_INTEGER),f.ctx).code,'OVERFLOW');
  });
  add('02','signature-before-state','State transition must enforce authentication too',()=>{
    const f=fixture(),t=f.transaction('a','b',5,0);t.signature='0'.repeat(128);assert.equal(p.applyTx(f.state,t,f.ctx).code,'SIGNATURE');
  });
  add('03','root-vector','Root commits sorted account records and count with domain separation',()=>{
    const f=fixture();assert.equal(p.stateRoot(f.state),'3a23dc27a771affdcacde3741fe5a9542be108d6f20bac556af2266366205d8e');
    assert.equal(p.stateRoot(Object.fromEntries(Object.entries(f.state).reverse())),p.stateRoot(f.state));
  });
  add('03','membership','Every existing account verifies against its exact state root',()=>{
    const f=fixture(),root=p.stateRoot(f.state);for(const name of Object.keys(f.state)) assert.equal(p.verifyProof(root,name,f.state[name],proofFor(f.state,name)),true);
  });
  add('03','claim-tamper','Changing the claimed value or account invalidates membership',()=>{
    const f=fixture(),root=p.stateRoot(f.state),proof=proofFor(f.state,'a');assert.equal(p.verifyProof(root,'a',{balance:999,nonce:0},proof),false);assert.equal(p.verifyProof(root,'b',f.state.a,proof),false);
  });
  add('03','path-tamper','Wrong position, extra/missing sibling and changed count are rejected',()=>{
    const f=fixture(),root=p.stateRoot(f.state),q=proofFor(f.state,'b');
    const bad=[{...q,index:0},{...q,index:-1},{...q,index:4},{...q,count:5},{...q,siblings:q.siblings.slice(1)},{...q,siblings:[...q.siblings,'0'.repeat(64)]},{...q,siblings:['0'.repeat(64),q.siblings[1]]}];
    for(const proof of bad) assert.equal(p.verifyProof(root,'b',f.state.b,proof),false);
  });
  add('03','odd-tree','An odd leaf count duplicates the final node and binds the count',()=>{
    const f=fixture();delete f.state.d;const q=proofFor(f.state,'c'),root=p.stateRoot(f.state);assert.equal(p.verifyProof(root,'c',f.state.c,q),true);assert.equal(p.verifyProof(root,'c',f.state.c,{...q,count:4}),false);
  });
  add('03','index-upper-bound','A proof index must be smaller than the committed leaf count, even when parity aliases a valid path',()=>{
    const f=fixture(),root=p.stateRoot(f.state),q=proofFor(f.state,'b');
    for(const index of [q.index+q.count,q.index+2*q.count]) {
      assert.equal(p.verifyProof(root,'b',f.state.b,{...q,index}),false,'out-of-range index aliases the valid path but is not a leaf');
    }
  });
  add('03','odd-duplicate-shape','An odd-level duplicated sibling must equal the running node, independently of root matching',()=>{
    const f=fixture();delete f.state.d;
    const q=proofFor(f.state,'c'),h=leafHash(accountBytes('c',f.state.c));
    const wrongSibling='1'.repeat(64);
    assert.notEqual(wrongSibling,h,'fixture must not be the duplicated leaf');
    const bad={...q,siblings:[wrongSibling,...q.siblings.slice(1)]};
    // Commit the malformed path deliberately: a mere root mismatch must not hide a missing structural check.
    const malformedRoot=rootHash(q.count,branchHash(q.siblings[1],branchHash(h,wrongSibling)));
    assert.equal(p.verifyProof(malformedRoot,'c',f.state.c,bad),false,'odd final leaf requires its own hash as sibling');
  });
  add('03','exact-path-depth','The sibling count must equal the depth implied by count, even for a matching malformed commitment',()=>{
    const record={balance:0,nonce:0},h=leafHash(accountBytes('a',record)),sibling='2'.repeat(64);
    // A singleton requires zero siblings; a two-leaf tree requires exactly one.
    assert.equal(p.verifyProof(rootHash(1,branchHash(h,sibling)),'a',record,{index:0,count:1,siblings:[sibling]}),false,'extra singleton sibling');
    assert.equal(p.verifyProof(rootHash(2,h),'a',record,{index:0,count:2,siblings:[]}),false,'missing two-leaf sibling');
  });
  add('03','stale-root','A valid old proof is not a proof against a changed root',()=>{
    const f=fixture(),proof=proofFor(f.state,'a'),next=p.applyTx(f.state,f.transaction('a','b',1,0),f.ctx).state;assert.equal(p.verifyProof(p.stateRoot(next),'a',f.state.a,proof),false);
  });
  add('03','empty-and-single','Empty and singleton trees have defined commitments',()=>{
    assert.equal(p.stateRoot({}),'ef6e05891dd1decbeb1567d5ca08228c66db73e06f0e1e614da4445f8f855501');const s={a:{balance:0,nonce:0}};assert.equal(p.verifyProof(p.stateRoot(s),'a',s.a,{index:0,count:1,siblings:[]}),true);
  });
  add('04','dependency','Revisit an earlier future nonce after its predecessor executes',()=>{
    const f=fixture(),first=f.transaction('a','b',10,0),second=f.transaction('a','c',20,1);
    assert.deepEqual(p.selectMempool(f.state,[second,first],f.ctx,16).map(txId),[first,second].map(txId));
  });
  add('04','funding','A later arrival can fund an earlier pending transaction',()=>{
    const f=fixture(),spend=f.transaction('c','d',6,0),fund=f.transaction('a','c',9,0);assert.deepEqual(p.selectMempool(f.state,[spend,fund],f.ctx,16).map(txId),[fund,spend].map(txId));
  });
  add('04','conflict','First eligible arrival wins a same-nonce conflict',()=>{
    const f=fixture(),a=f.transaction('a','b',60,0),b=f.transaction('a','c',70,0);assert.deepEqual(p.selectMempool(f.state,[a,b,a],f.ctx,16).map(txId),[txId(a)]);
  });
  add('04','bounded','Selection stops at limit and does not mutate base state',()=>{
    const f=fixture(),before=clone(f.state),a=f.transaction('a','b',1,0),b=f.transaction('b','c',1,0);
    assert.equal(p.selectMempool(f.state,[a,b],f.ctx,1).length,1);assert.deepEqual(p.selectMempool(f.state,[a],f.ctx,0),[]);assert.deepEqual(f.state,before);
  });
  add('04','no-progress','Invalid or unfunded pools terminate without selecting anything',()=>{
    const f=fixture();assert.deepEqual(p.selectMempool(f.state,[f.transaction('a','b',101,0),f.transaction('c','d',1,0),null],f.ctx,16),[]);
  });
  add('04','input-unchanged','The caller\'s transaction list is left unchanged',()=>{
    const f=fixture(),list=[f.transaction('a','b',1,1),f.transaction('a','b',1,0),f.transaction('b','c',1,0)],copy=clone(list);p.selectMempool(f.state,list,f.ctx,16);
    assert.deepEqual(list,copy,'Lesson 04: "Never mutate the caller\'s state or input list." CONTRACT: selectMempool must not mutate input.');
  });
  // CONTRACT selectMempool: "Use repeated passes over input arrival order" and "Conflicting ready spends use first eligible arrival order."
  add('04','arrival-order','Repeated passes keep input arrival order; the first eligible arrival wins a conflict',()=>{
    const f=fixture(),fromB=f.transaction('b','c',1,0),fromA=f.transaction('a','c',1,0);
    assert.deepEqual(p.selectMempool(f.state,[fromB,fromA],f.ctx,16).map(txId),[fromB,fromA].map(txId),'independent ready senders keep arrival order');
    const first=f.transaction('a','b',60,0),later=f.transaction('a','c',70,0);
    assert.deepEqual(p.selectMempool(f.state,[first,later],f.ctx,16).map(txId),[txId(first)],'the earlier arrival wins a same-nonce conflict');
  });
  add('05','valid-block','Recompute the state from its validated parent',()=>{
    const f=fixture(),g=genesis(f),b=makeBlock(f,g,[f.transaction('a','b',12,0)]),r=record(f,b,g);assert.equal(r.id,blockId(b));assert.equal(r.state.a.balance,88);assert.equal(r.height,1);
  });
  add('05','forged-root','A well-shaped but fabricated commitment is not accepted',()=>{
    const f=fixture(),g=genesis(f),b=makeBlock(f,g,[]);b.stateRoot='f'.repeat(64);assert.equal(p.validateBlock(b,g,f.ctx).code,'ROOT');
  });
  // CONTRACT validateBlock: "Require exact parent ID, height parent.height+1, valid sequential transactions and an exact recomputed root."
  add('05','root-after-transactions','The root must be recomputed after applying the block, not matched against the parent',()=>{
    const f=fixture(),g=genesis(f),b={parent:g.id,height:1,transactions:[f.transaction('a','b',12,0)],stateRoot:p.stateRoot(g.state)};
    assert.equal(p.validateBlock(b,g,f.ctx).code,'ROOT');
  });
  add('05','parent-height','Parent hash and height are checked rather than trusted',()=>{
    const f=fixture(),g=genesis(f),b=makeBlock(f,g,[]);assert.equal(p.validateBlock({...b,parent:'1'.repeat(64)},g,f.ctx).code,'PARENT');assert.equal(p.validateBlock({...b,height:99},g,f.ctx).code,'HEIGHT');
  });
  add('05','ordered-transactions','Two individually signed conflicting transactions do not make a valid block',()=>{
    const f=fixture(),g=genesis(f),b={parent:g.id,height:1,transactions:[f.transaction('a','b',1,0),f.transaction('a','c',1,0)],stateRoot:'0'.repeat(64)};const code=p.validateBlock(b,g,f.ctx).code;assert.ok(['NONCE','TRANSACTIONS'].includes(code),`expected the transaction's own code (NONCE) or TRANSACTIONS, got ${code}`);
  });
  add('05','policy-not-validity','A valid block may choose another mempool conflict winner',()=>{
    const f=fixture(),g=genesis(f),other=f.transaction('a','c',11,0),b=makeBlock(f,g,[other]);assert.equal(p.validateBlock(b,g,f.ctx).ok,true);
  });
  add('05','block-bounds','Malformed or excessive transaction lists fail explicitly',()=>{
    const f=fixture(),g=genesis(f),b=makeBlock(f,g,[]);const many=makeBlock(f,g,Array.from({length:17},(_,n)=>f.transaction('a','b',1,n)));const oversized=p.validateBlock(many,g,f.ctx).code;assert.ok(['TRANSACTIONS','SHAPE'].includes(oversized),`expected TRANSACTIONS or SHAPE for more than 16 transactions, got ${oversized}`);assert.equal(p.validateBlock({...b,extra:1},g,f.ctx).code,'SHAPE');
  });
  add('05','parent-unchanged','Validation leaves the supplied parent record unchanged',()=>{
    const f=fixture(),g=genesis(f),before=clone(g),b=makeBlock(f,g,[f.transaction('a','b',12,0)]);record(f,b,g);
    assert.deepEqual(g,before,'CONTRACT: "No function may mutate its arguments." Execute on a copy of the parent state.');
  });
  add('06','height','Choose greatest validated height; input order is irrelevant',()=>{
    const r=[{id:'c',height:2},{id:'b',height:4},{id:'a',height:1}];assert.equal(p.chooseHead(r),'b');assert.equal(p.chooseHead([...r].reverse()),'b');
  });
  add('06','tie','Break equal-height ties by smallest ID without mutating inputs',()=>{
    const r=[{id:'f',height:2},{id:'a',height:2}],before=clone(r);assert.equal(p.chooseHead(r),'a');assert.deepEqual(r,before);
  });
  add('06','empty','Empty candidate collection has no selected head',()=>assert.equal(p.chooseHead([]),null));
  add('07','quorum','Three distinct authenticated matching votes form a certificate',()=>{
    const f=fixture(),id='a'.repeat(64);assert.equal(p.verifyCertificate(['a','b','c'].map(k=>f.vote(k,2,id)),2,id,f.ctx),true);
  });
  add('07','duplicates','Repeated copies of one vote do not create a quorum',()=>{
    const f=fixture(),id='a'.repeat(64),a=f.vote('a',2,id),b=f.vote('b',2,id);assert.equal(p.verifyCertificate([a,a,a,b],2,id,f.ctx),false);
  });
  add('07','wrong-target','Votes for another height or block cannot be pooled',()=>{
    const f=fixture(),id='a'.repeat(64),v=[f.vote('a',2,id),f.vote('b',3,id),f.vote('c',2,'b'.repeat(64))];assert.equal(p.verifyCertificate(v,2,id,f.ctx),false);
  });
  add('07','forgery','Forged, unknown and malformed votes do not count',()=>{
    const f=fixture(),id='a'.repeat(64),v=[f.vote('a',2,id),f.vote('b',2,id),{...f.vote('c',2,id),signature:'0'.repeat(128)},null,{...f.vote('d',2,id),voter:'outsider'}];assert.equal(p.verifyCertificate(v,2,id,f.ctx),false);
  });
  add('07','invalid-plus-valid','Invalid traffic does not suppress an otherwise valid certificate',()=>{
    const f=fixture(),id='a'.repeat(64);assert.equal(p.verifyCertificate([null,...['a','b','d'].map(k=>f.vote(k,2,id))],2,id,f.ctx),true);
  });
  add('07','eligibility-before-dedup','Only a valid matching vote may consume a voter identity; invalid earlier claims cannot suppress a later valid quorum',()=>{
    const f=fixture(),id='a'.repeat(64),valid=['a','b','c'].map(k=>f.vote(k,2,id));
    for(const vote of valid){
      const forged={...vote,signature:'0'.repeat(128)};
      const wrongHeight=f.vote(vote.voter,3,id),wrongBlock=f.vote(vote.voter,2,'b'.repeat(64));
      const malformed={...vote,extra:'not part of the vote schema'};
      assert.equal(verifyVote(forged,f.ctx),false,'fixture must be an invalid signature');
      assert.equal(verifyVote(wrongHeight,f.ctx),true,'wrong-height control is genuinely signed');
      assert.equal(verifyVote(wrongBlock,f.ctx),true,'wrong-block control is genuinely signed');
      for(const [label,bad] of [['forged',forged],['wrong-height',wrongHeight],['wrong-block',wrongBlock],['malformed',malformed]]){
        for(const ordered of [valid,[...valid].reverse()]){
          for(const position of [0,1,ordered.length]){
            const input=[...ordered];input.splice(position,0,bad);
            assert.equal(p.verifyCertificate(input,2,id,f.ctx),true,`${label} claim for ${vote.voter} at position ${position} must not consume that identity before a valid matching vote`);
          }
        }
      }
    }
    assert.equal(p.verifyCertificate([valid[0],valid[0],valid[1],valid[1]],2,id,f.ctx),false,'Valid duplicates still count once per identity');
  });
  add('07','certificate-target','Malformed certificate targets and non-array vote collections fail closed',()=>{
    const f=fixture(),id='a'.repeat(64);assert.equal(p.verifyCertificate(null,2,id,f.ctx),false);
    assert.equal(p.verifyCertificate(['a','b','c'].map(k=>f.vote(k,-1,id)),-1,id,f.ctx),false);
    assert.equal(p.verifyCertificate(['a','b','c'].map(k=>f.vote(k,2,'not-a-block')),2,'not-a-block',f.ctx),false);
  });
  // CONTRACT verifyCertificate: "Each vote has exactly voter,height,blockId,signature; require a valid supplied verifyVote for the exact requested height and block ID."
  add('07','exact-target-and-shape','Only votes for the exact height and block ID, with exactly the four vote fields, count',()=>{
    const f=fixture(),id='a'.repeat(64);
    assert.equal(p.verifyCertificate([f.vote('a',2,id),f.vote('b',3,id),f.vote('c',3,id)],2,id,f.ctx),false,'votes for another height cannot be pooled');
    assert.equal(p.verifyCertificate(['a','b','c'].map(k=>({...f.vote(k,2,id),note:'extra'})),2,id,f.ctx),false,'a vote with an extra field is malformed');
  });
  add('08','orphan-revalidation','A losing-branch nonce conflict must not be resurrected',()=>{
    const f=fixture(),g=genesis(f),oldTx=f.transaction('a','b',20,0),newTx=f.transaction('a','c',30,0);
    const old=record(f,makeBlock(f,g,[oldTx]),g),next=record(f,makeBlock(f,g,[newTx]),g),r=p.reconcile([g,old],[g,next],[],f.ctx);
    assert.equal(r.head,next.id);assert.deepEqual(r.state,next.state);assert.deepEqual(r.mempool,[]);
  });
  add('08','orphan-dependency','A still-valid orphan can unlock a waiting transaction after reorg',()=>{
    const f=fixture(),g=genesis(f),fund=f.transaction('b','c',10,0),spend=f.transaction('c','d',7,0);
    const old=record(f,makeBlock(f,g,[fund]),g),next=record(f,makeBlock(f,g,[f.transaction('a','d',1,0)]),g);
    const r=p.reconcile([g,old],[g,next],[spend],f.ctx);assert.deepEqual(r.mempool.map(txId),[fund,spend].map(txId));
  });
  add('08','included-removal','Already included transactions are excluded from rebuilt pool',()=>{
    const f=fixture(),g=genesis(f),t=f.transaction('b','c',5,0),next=record(f,makeBlock(f,g,[t]),g);
    assert.deepEqual(p.reconcile([g,next],[g,next],[t],f.ctx).mempool,[]);
  });
  add('08','copy-state','Returned state is independent of the supplied path state',()=>{
    const f=fixture(),g=genesis(f),r=p.reconcile([g],[g],[],f.ctx);r.state.a.balance=0;assert.equal(g.state.a.balance,100);
  });
  // CONTRACT reconcile: "Gather transactions from old path blocks in order, then pending; ... pass remaining candidates through selectMempool at the new head's state with limit 16."
  add('08','old-path-first-and-limit','Old-path transactions precede pending ones, and the rebuilt pool holds at most 16',()=>{
    const f=fixture(),g=genesis(f),oldTx=f.transaction('b','c',5,0),pendingTx=f.transaction('b','d',6,0);
    const old=record(f,makeBlock(f,g,[oldTx]),g),next=record(f,makeBlock(f,g,[f.transaction('a','d',1,0)]),g);
    assert.deepEqual(p.reconcile([g,old],[g,next],[pendingTx],f.ctx).mempool.map(txId),[txId(oldTx)],'an old-path transaction wins its nonce over a pending one');
    const many=Array.from({length:17},(_,n)=>f.transaction('a','b',1,n));
    assert.equal(p.reconcile([g],[g],many,f.ctx).mempool.length,16,'reconcile uses limit 16');
  });
  return out;
}

export async function runChecks(protocol,scope='all') {
  const selected=cases(protocol).filter(c=>scope==='all'||c.module===scope),results=[];
  if(!selected.length) throw new Error(`Unknown check scope ${scope}`);
  for(const c of selected) {
    try {await c.run();results.push({module:c.module,id:c.id,requirement:c.requirement,ok:true});}
    catch(error) {results.push({module:c.module,id:c.id,requirement:c.requirement,ok:false,diagnostic:error.message,actual:error.actual,expected:error.expected});}
  }
  return {scope,total:results.length,passed:results.filter(r=>r.ok).length,results};
}
