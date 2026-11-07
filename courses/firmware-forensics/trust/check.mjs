import { readFileSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { evidence, verifySignature,LAB_KEY,OTHER_LAB_KEY } from './crypto.mjs';
import { loadPolicy } from './verify.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const expected = f => ({
  manifestOrigin: f.signature==='valid'&&f.key==='pinned'?'verified_lab_key':'unverified',
  captureBinding:f.capture, releasePolicy:f.release>=f.minimumRelease?'pass':'fail',
  admission:f.signature==='valid'&&f.key==='pinned'&&f.capture==='match'&&f.release>=f.minimumRelease?'accept':'hold',
});
export async function check(source) {
  const policy=await loadPolicy(source), results=[];
  function sample(name,facts) {
    try {
      const copy=structuredClone(facts), got=policy.assess(copy), want=expected(facts);
      if (!isDeepStrictEqual(got,want) || !isDeepStrictEqual(copy,facts)) throw new Error(`Expected ${JSON.stringify(want)}; got ${JSON.stringify(got)}; inputs must remain unchanged`);
      results.push({name,status:'pass'});
    } catch(error) {results.push({name,status:'fail',detail:error.message,repair:'Read trust/README.md: the four-axis contract. Change a new source attempt, not the evidence.'});}
  }
  // Full small decision space, including both sides of the release boundary.
  for(const floor of [2,5,22,4294967295]) {
    for(const signature of ['valid','invalid','absent']) for(const key of ['pinned','unknown']) for(const capture of ['match','mismatch']) for(const release of [floor-1,floor,floor+1]) {
      sample(`${signature}/${key}/${capture}/floor-${floor}/release-${release}`,{signature,key,capture,release,minimumRelease:floor});
    }
  }
  const read=n=>readFileSync(join(root,'fixtures',n));
  const envelope=JSON.parse(read('cases.json'));
  for(const c of envelope.cases) {
    const f=evidence(read(c.capture),read(c.manifest),c.signature?read(c.signature).toString().trim():null,read(c.key).toString().trim(),c.floor);
    sample(`signed-bytes/${c.id}`,f);
  }
  const passed=results.filter(r=>r.status==='pass').length;
  return {status:passed===results.length?'pass':'fail',passed,total:results.length,source:policy.source,results,
    limits:'Open policy tests and original signed fixtures. Not human learning evidence; no production authority.'};
}
export function cryptoSelfTest() {
  const vectors=JSON.parse(readFileSync(join(root,'fixtures/rfc8032.json')));
  for(const v of vectors) {
    const data=Buffer.from(v.message,'hex');
    if(!verifySignature(data,v.signature,v.publicKey)) throw new Error('RFC 8032 vector failed: '+v.id);
    if(verifySignature(Buffer.concat([data,Buffer.from([0])]),v.signature,v.publicKey)) throw new Error('Changed-message negative control accepted');
    const other=v.publicKey===LAB_KEY?OTHER_LAB_KEY:LAB_KEY;
    if(verifySignature(data,v.signature,other)) throw new Error('Wrong-key negative control accepted');
  }
  return {status:'pass',vectors:vectors.length,negativeControls:vectors.length*2};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==3) throw new Error('Usage: node trust/check.mjs LEARNER_SOURCE');
    const crypto=cryptoSelfTest(), report=await check(process.argv[2]);
    console.log(JSON.stringify({...report,crypto},null,2));process.exitCode=report.status==='pass'?0:1;
  }catch(error){console.error(JSON.stringify({status:'error',error:error.message}));process.exitCode=2;}
}
