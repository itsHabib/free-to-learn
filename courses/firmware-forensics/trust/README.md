# Verify a signature and state its authority

The supplied crypto mechanism verifies Ed25519 over the **exact raw manifest bytes**,
using Node's built-in crypto. RFC 8032 section 7.1 tests 1 and 2 are positive controls;
changed-message and wrong-key controls must fail. No cryptographic arithmetic is
learner-written. Use the already installed Node 22+; no package install is needed.

These original manifests bind EDUFW1 captures to public, non-secret RFC test keys.
Everyone can obtain their published test seeds and produce a valid signature.
Thus `verified_lab_key` means mathematical agreement with this classroom key and
the locally pinned classroom rule. It **cannot authenticate a vendor or a person**.
Do not use these keys for any real trust decision. This does not create an account,
access credential, certificate, private trust root or host firmware setting.

## Four-axis contract

Implement `assessEvidence(facts)` in your attempt's `trust.mjs`.

| Output | Rule |
| --- | --- |
| manifestOrigin | `verified_lab_key` iff signature is `valid` and key is `pinned`; otherwise `unverified` |
| captureBinding | Copy the independently computed `match` or `mismatch` |
| releasePolicy | `pass` iff release is at least minimumRelease; otherwise `fail` |
| admission | `accept` iff origin is verified, binding matches and releasePolicy passes; otherwise `hold` |

Return exactly these four keys. Do not mutate input. A signature on a manifest can
be valid while the capture differs. A valid signature can accompany an old release.
A mathematically valid signature made by an unpinned key does not meet this local rule.
The command records the actual selected source's hash and output. The open checker
tests that output; merely printing `accept` in the CLI is no evidence of correctness.

## Worked decision

Suppose signature=`valid`, key=`pinned`, capture=`mismatch`, release=6 and floor=5.
The origin is `verified_lab_key`, the binding is `mismatch` and release policy passes.
The admission is `hold`: the signed manifest has not bound the bytes you received.
Changing the floor to 7 adds a policy failure without changing the signature result.

Before running the guided case, predict which field changes for an unknown key,
a changed capture, a changed manifest and a raised floor. Keep that prediction.

From the extracted course root, after creating an attempt:

```sh
node trust/check.mjs attempts/002-revision/trust.mjs
node trust/verify.mjs trust/fixtures/guided.efw trust/fixtures/guided.json trust/fixtures/guided.sig trust/fixtures/lab-public.hex 1 attempts/002-revision/trust.mjs
```

Repeat with floor `2` and save a separate output. The signature remains valid while
the release policy fails. `node trust/check.mjs` checks the full 144-case boundary matrix at four release floors and ten original byte-level cases. Its own crypto self-test checks
two RFC vectors and four negative controls. It does not grade your written reasoning.

The fixture `cases.json` is an open practice contract, not a hidden exam. Seek the
first violated rule, then use a new numbered source attempt. The capstone presents
a different graph and configuration decision. Global certificates, revocation,
protected device storage and secure/measured boot remain outside this course.
