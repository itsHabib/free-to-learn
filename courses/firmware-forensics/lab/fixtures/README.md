# Original inert fixture set

All bytes were authored specifically for this task as plain descriptions/JSON.
No production image, book excerpt, vendor source, key, certificate, exploit or
executable payload is included. The binary wrapper is EDUFW1, not authentic UEFI.

- `release-1`: baseline.
- `release-2`: a legitimate teaching update under the local supplied policy.
- `release-2-observed`: a self-consistent benign config substitution that must be
  investigated against that policy, not called authenticated by its hashes.
- `release-2-reordered`: same logical release-2 components in another layout.
- `hash-mismatch.efw`: one changed data byte; use release-1's manifest.
- `truncated.efw`, `overlap.efw`, `unsafe-name.efw`: structural rejection controls.
- `incomplete-manifest.json`, `cycle-manifest.json`, `missing-dependency.json`:
  pair with release-1 to test manifest/graph inconsistencies.
- `policy.json`: a local exercise policy, not authenticated vendor policy.
- `fixture-index.json`: byte counts and SHA-256 values for the fixture inputs,
  excluding itself. This is an inventory, not proof of origin.

The generator is author-only and not needed to run the learner package. Do not
repair the supplied negative controls. Copy policy to your attempt for experiments.

`case-study/` adds an unfamiliar original release pair, local policy, partial
capture and an investigation brief. Its JSON/binary inputs are included in the
recursive fixture index. No external source or acquisition is involved.
