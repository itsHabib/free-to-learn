# Sources, provenance and limits

- Core: original generated EDUFW1 0.3.1 teaching container and fixtures. Its frozen
  learner archive is identified by SHA-256
  `cbb205f9592b0ee223d8cc134942fb4aa007ad10dad06591aafa56c5e395c852`.
  Nested core documentation describes that prior hash-only scope.
- New course prose, admission policy, signed manifests and logger capstone:
  original work for this course. No book text or real firmware used.
- [RFC 8032 §7.1](https://www.rfc-editor.org/rfc/rfc8032.txt), January 2017:
  Ed25519 tests 1 and 2 supply public test material for known-answer checks. The
  test seeds are intentionally public, so the generated fixture signatures cannot
  identify a vendor. Only vector data is retained, not RFC explanatory prose.
- [Node 26.5.1 crypto documentation](https://nodejs.org/download/release/v26.5.1/docs/api/crypto.html#cryptoverifyalgorithm-data-key-signature),
  checked 2026-10-27: built-in Ed25519 verification, `verify(null, bytes, key, signature)`.
  The implementation uses Node's primitive rather than implementing Ed25519.
- Ivy course craft: planning-01/03/05/10, sequencing-01/07, practice-03/10,
  feedback-01/02/07, assessment-02/09/13, accessibility-01/03 and evaluation-01/03.
  Original questions, failures, revisions and help must remain distinct.

Original code is MIT and original lesson prose/illustrations are CC BY 4.0,
with Free to Learn attribution; see ../../LICENSE.md for the split and retained
third-party exceptions. New signature results do not retroactively change earlier
HOLD/ACCEPT receipts. Public-source delivery and learner qualification remain
separate. No hosted inference or external requests occur inside the learner tools.
