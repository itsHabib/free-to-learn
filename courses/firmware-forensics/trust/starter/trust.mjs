/** Learner policy; crypto verification and byte hashing are supplied separately.
 * facts = {signature:'valid'|'invalid'|'absent', key:'pinned'|'unknown',
 *          capture:'match'|'mismatch', release:positiveInteger, minimumRelease:positiveInteger}
 * Return exactly {manifestOrigin,captureBinding,releasePolicy,admission}.
 * manifestOrigin: 'verified_lab_key' only if signature valid AND key pinned; else 'unverified'.
 * captureBinding: copy match/mismatch independently of other axes.
 * releasePolicy: 'pass' if release >= minimumRelease; else 'fail'.
 * admission: 'accept' only if origin verified, binding match, and releasePolicy pass; else 'hold'.
 * This classroom decision never authorizes flashing or establishes a vendor identity.
 */
export function assessEvidence(facts) {
  throw new Error('TODO: implement separate evidence axes and the admission rule');
}
