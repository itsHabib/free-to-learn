import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { evidence, sha256 } from './crypto.mjs';

export async function loadPolicy(source) {
  const path = resolve(source); const bytes = readFileSync(path);
  const module = await import(pathToFileURL(path).href + '?sha256=' + sha256(bytes));
  if (typeof module.assessEvidence !== 'function') throw new Error('Source must export assessEvidence');
  return {assess:module.assessEvidence, source:{path,sha256:sha256(bytes)}};
}
export async function inspect({capture, manifest, signature, key, minimumRelease, source}) {
  const captureBytes = readFileSync(capture), manifestBytes = readFileSync(manifest);
  const signatureBytes = signature === '-' ? null : readFileSync(signature);
  const signatureText = signatureBytes === null ? null : signatureBytes.toString('utf8').trim();
  const keyBytes=readFileSync(key);
  const publicKey = keyBytes.toString('utf8').trim();
  const facts = evidence(captureBytes,manifestBytes,signatureText,publicKey,minimumRelease);
  const policy = await loadPolicy(source);
  const result = policy.assess(structuredClone(facts));
  // The selected result is reported verbatim, never silently repaired by an answer key.
  return {schema:1,runId:randomUUID(),createdAt:new Date().toISOString(),source:policy.source,
    captureSha256:sha256(captureBytes),manifestSha256:sha256(manifestBytes),signatureSha256:signatureBytes===null?null:sha256(signatureBytes),keyFileSha256:sha256(keyBytes),publicKey,facts,result,
    limits:'Classroom key only. Public test seed; no vendor authentication, certificate chain, hardware state or safety claim.'};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [capture,manifest,signature,key,floor,source,...extra] = process.argv.slice(2);
    if (!source || extra.length) throw new Error('Usage: node trust/verify.mjs CAPTURE MANIFEST SIGNATURE_OR_- PUBLIC_KEY MINIMUM_RELEASE LEARNER_SOURCE');
    const report = await inspect({capture,manifest,signature,key,minimumRelease:Number(floor),source});
    console.log(JSON.stringify(report,null,2));
    process.exitCode = report.result?.admission === 'accept' ? 0 : 3;
  } catch (error) { console.error(JSON.stringify({status:'error',error:error.message})); process.exitCode=2; }
}
