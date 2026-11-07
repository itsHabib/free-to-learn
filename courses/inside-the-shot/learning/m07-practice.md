# Text practice for Project7

Read [m07.md](m07.md) alongside these questions. Keep a first choice and reason before opening the separate feedback.

## m07-distinct-layouts

Complete a new lift entry. File bytes are 45 01 44 02 at file-buffer base 0x7000. The two-byte entry starts at file offset 2. Toy packing is direction + 256*amount; state is separately allocated at 0x9000. Which call values are justified?

- **a.** x0=0x7002 and w1=0x9000, because the entry pointer is the mutable state.

- **b.** x0=0x9000 and w1=0x0244 (580); 0x7002 is the entry's address, not its packed value.

- **c.** x0=2 and w1=0x4402, because file offsets are pointers and the first byte is the most significant byte.

[Feedback after choosing](m07-practice-feedback.md#m07-distinct-layouts).

## m07-competing-hypotheses

Fresh toy sequence: start at floor 2, travel 0; moves U3, D6, U1; floors must remain 0..6. Rejected moves leave working state unchanged. How do continue-after-rejection and stop-at-rejection differ?

- **a.** Continue produces 3 events and ends (6,4); stop produces 2 events and ends (5,3).

- **b.** Both produce 3 events and end (0,10), because every amount changes travel even when the move is rejected.

- **c.** Both produce 2 events and end (5,3), so including a later U1 cannot distinguish them.

[Feedback after choosing](m07-practice-feedback.md#m07-competing-hypotheses).

## m07-invariant-diagnosis

For a lift starting at floor 1 with travel 0, which reported (floor, travel) is impossible under the supplied accepted-move rules? Amounts are nonnegative, and rejected moves change neither value.

- **a.** (4,3), because arriving above the start requires at least one downward move.

- **b.** (4,5), because travel must equal displacement even when both directions occur.

- **c.** (4,1), because displacement 3 exceeds total accepted travel 1.

[Feedback after choosing](m07-practice-feedback.md#m07-invariant-diagnosis).

## m07-published-state

A hypothetical run starts at (floor 2, travel 0), evaluates U3, D6, U1, and reports event snapshots (5,3), (5,3), (6,4), then final (2,0) with publication=false. Which interpretation is supported?

- **a.** No internal state changes occurred, because final equals the initial state.

- **b.** The event history records speculative travel 4, while the published state retains travel 0; applying the speculative movement ledger to final would mix histories.

- **c.** Final must be wrong because the last event snapshot is always the published state.

[Feedback after choosing](m07-practice-feedback.md#m07-published-state).

## m07-evidence-boundary

A model returns dictionaries with the required keys and bounded integers, and its final outputs match native results on six saved files. You want to claim that each decoded field has the correct meaning. What is still needed?

- **a.** Separate byte/extraction and call evidence for field meanings; two compensating decoder/replay mistakes could still match those six final outputs.

- **b.** Nothing: correct dictionary shape proves every label refers to the correct input bytes on every file.

- **c.** Only more repetitions of the same six outputs; repetition necessarily identifies each hidden field independently.

[Feedback after choosing](m07-practice-feedback.md#m07-evidence-boundary).
