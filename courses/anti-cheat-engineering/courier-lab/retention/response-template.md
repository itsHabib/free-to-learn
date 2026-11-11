# Retention reasoning and evidence

Assistance used:

## First predictions, before a run

Keep these answers when revising.

1. At nowTick 14 with maxAgeTicks 6, which of ticks 7, 8, 9, 14 and 15 belong in the window? Why?
2. Eligible entries are A@11, B@12, C@12, D@12 and E@14. With maxEvents 3, which entries remain and in what order? Why?
3. Why would deleting unwanted fields from the source objects be different from returning new four-field objects?
4. What data remains after deleting one export, if a checkpoint and a second export exist?

After the first captured check, compare these saved predictions with the answer and reason in prediction feedback. Append corrections and answers to its fresh variants here; keep the original predictions.

## Attempt and repair

- Attempt/evidence path:
- First result and evidence:
- First failed criterion with expected and actual values, or a checked boundary if all passed:
- Decision causing the failure:
- Repair and why it addresses the failure:
- New evidence path and remaining limits:

Append later attempts here; do not replace the first account.

## Declared measurement, before inspecting results

- Workload name and event count:
- Node/platform/architecture:
- Setting A (nowTick, maxAgeTicks, maxEvents):
- Setting B (nowTick, maxAgeTicks, maxEvents):
- Warmup count and sample count:
- Exact command to run with those settings and counts:

## Measured evidence

- Report path:
- Actual settings and counts echoed by the report, checked against my declaration:
- Every whole-operation sample for each setting:
- Every policy-plus-encoding sample for each setting:
- Median and maximum, or p95 only when there are at least 20 samples:
- JSON bytes and retained/removed counts for each setting:
- Tick ranges and counts lost under the smaller setting:
- What the measured operation includes and excludes:
- Why these samples cannot establish total process memory or production capacity:

## Actual export deletion

- Export path, receipt and byte length:
- Deletion result:
- What this deletion removes:
- Other records or copies it does not remove:

## Reconcile two windows

At tick 40, a detector examines 20 ticks, an export keeps 8 ticks, and relevant observations occurred at ticks 23, 29 and 37. Which remain? Which earlier threshold decision cannot be independently recomputed? How could maxEvents lose more evidence? Explain the different purposes of live detector state, a replay checkpoint and the minimized export. Explain why its actor IDs still describe pseudonymous behavior.

First explanation:

Later correction and evidence:

## Transfer for review (not automatically graded)

A collaborative drawing tool exports rejected edits to explain a rate-limit decision over 30 seconds. Users can request deletion of old exports. Propose a minimal event shape and two bounds, explain their evidence limits, and define what one deletion removes. State what separate policy governs live rate-limit state or another saved copy.

First answer:

Later repair:
