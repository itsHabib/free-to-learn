import { clone, exactKeys, hex64, hex128, verifyTx, txId, accountBytes, leafHash, branchHash, rootHash, sha256, blockId, verifyVote } from '../lib/support.mjs';

const unfinished = name => { throw new Error(`NOT_IMPLEMENTED: ${name}; read CONTRACT.md and the matching lesson`); };

export function validateEnvelope(tx, ctx) { return unfinished('01 validateEnvelope'); }
export function applyTx(state, tx, ctx) { return unfinished('02 applyTx'); }
export function stateRoot(state) { return unfinished('03 stateRoot'); }
export function verifyProof(root, name, record, proof) { return unfinished('03 verifyProof'); }
export function selectMempool(state, txs, ctx, limit) { return unfinished('04 selectMempool'); }
export function validateBlock(block, parent, ctx) { return unfinished('05 validateBlock'); }
export function chooseHead(records) { return unfinished('06 chooseHead'); }
export function verifyCertificate(votes, height, id, ctx) { return unfinished('07 verifyCertificate'); }
export function reconcile(oldPath, newPath, pending, ctx) { return unfinished('08 reconcile'); }
