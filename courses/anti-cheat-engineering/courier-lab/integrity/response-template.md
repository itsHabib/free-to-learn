# Owned runtime integrity reasoning

Assistance used:

## First predictions, before the first check

Keep these answers when revising. Give a result and a reason for each.

1. The release is supported, every required path is observed once, and every complete hash matches:
2. The release string is unchanged, but `engine.mjs` now has different bytes:
3. A supported new release has changed bytes and a separately approved manifest for those bytes:
4. Every approved file matches, but there is one extra observed runtime file:
5. Two entries repeat the same path while one required path is absent:
6. A client copies approved hashes into its claimed observations without reading any files. What can a matching comparison establish?

## Attempt and repair

- Attempt/evidence path:
- First result (pass or fail) and the evidence supporting it:
- If it failed, first failed criterion with expected and actual values; if it passed, one boundary case you checked:
- Decision that caused the failure and why:
- Repair and why it addresses the failure, or why no repair was needed:
- New evidence path and remaining limitations:

Append later attempts below; do not replace the first account.

## What approval establishes

Explain the difference between an observed hash and an approved hash. Explain why a supported release label alone is insufficient, why an approved update may pass with new hashes, and why changing both the runtime and its approval record defeats this comparison. State what must hold between observing and importing files.

## Transfer for review (not automatically graded)

A level editor loads required core files and optional community plug-ins. Yesterday's approved project had no plug-ins; today's project adds one. Design the two approval sources and inventories. Explain what requires review, when a missing plug-in blocks loading, and what happens if the project can rewrite its own approval record. Give one legal update and one refused update with concrete path/hash examples.

First answer:

Later repair and evidence:
