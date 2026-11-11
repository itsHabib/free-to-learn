import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';

export const NETWORK = 'classroom-v1';
export const clone = x => structuredClone(x);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const hex64 = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
export const hex128 = x => typeof x === 'string' && /^[0-9a-f]{128}$/.test(x);
export const exactKeys = (x, keys) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join('|') === [...keys].sort().join('|');
export const txBytes = tx => Buffer.from(JSON.stringify(['LAB:TX:1', tx.network, tx.from, tx.to, tx.amount, tx.nonce]));
export const txId = tx => sha256(Buffer.concat([txBytes(tx), Buffer.from(String(tx.signature))]));
export const accountBytes = (name, record) => Buffer.from(JSON.stringify([name, record.balance, record.nonce]));
export const leafHash = bytes => sha256(Buffer.concat([Buffer.from([0]), bytes]));
export const branchHash = (left, right) => sha256(Buffer.concat([Buffer.from([1]), Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]));
export function rootHash(count, top) {
  const n = Buffer.alloc(4); n.writeUInt32BE(count);
  return sha256(Buffer.concat([Buffer.from([2]), n, Buffer.from(top, 'hex')]));
}
export const blockId = block => sha256(Buffer.from(JSON.stringify(['LAB:BLOCK:1', block.parent, block.height, block.transactions.map(txId), block.stateRoot])));
export const voteBytes = vote => Buffer.from(JSON.stringify(['LAB:VOTE:1', NETWORK, vote.voter, vote.height, vote.blockId]));
export function verifyTx(tx, ctx) {
  try { return verify(null, txBytes(tx), ctx.publicKeys.get(tx.from), Buffer.from(tx.signature, 'hex')); }
  catch { return false; }
}
export function verifyVote(vote, ctx) {
  try { return verify(null, voteBytes(vote), ctx.publicKeys.get(vote.voter), Buffer.from(vote.signature, 'hex')); }
  catch { return false; }
}
export function fixture() {
  const keys = new Map(['a','b','c','d'].map(name => [name, generateKeyPairSync('ed25519')]));
  const ctx = {network: NETWORK, publicKeys: new Map([...keys].map(([k,v]) => [k,v.publicKey]))};
  const state = {a:{balance:100,nonce:0}, b:{balance:40,nonce:0}, c:{balance:0,nonce:0}, d:{balance:0,nonce:0}};
  function transaction(from, to, amount, nonce, extra={}) {
    const tx = {network:NETWORK,from,to,amount,nonce,...extra};
    return {...tx,signature:sign(null,txBytes(tx),keys.get(from).privateKey).toString('hex')};
  }
  function vote(voter,height,id) {
    const v = {voter,height,blockId:id};
    return {...v,signature:sign(null,voteBytes(v),keys.get(voter).privateKey).toString('hex')};
  }
  return {ctx,state,transaction,vote};
}

// Proof production is supplied scaffolding. Learners implement the independent verifier.
export function proofFor(state, name) {
  const names = Object.keys(state).sort(); let index = names.indexOf(name);
  if (index < 0) throw new Error('No membership proof for an absent account');
  const proof = {index,count:names.length,siblings:[]};
  let level = names.map(k=>leafHash(accountBytes(k,state[k])));
  while (level.length > 1) {
    proof.siblings.push(level[index ^ 1] ?? level[index]);
    const next = [];
    for (let i=0; i<level.length; i+=2) next.push(branchHash(level[i],level[i+1] ?? level[i]));
    level = next; index = Math.floor(index/2);
  }
  return proof;
}
