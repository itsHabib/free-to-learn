# 6. Bound work and make failure precise

**Goal:** charge for work before it happens, preserve atomic effects, and distinguish an expected refusal from broken infrastructure.

Prerequisites: modules 2–4; module 5's practical run is not needed for this portable exercise. Repair `Learner::charge`.

## 6.1 Fuel, byte budgets and termination

Every executed instruction consumes one fuel unit, including HALT and INVOKE. At zero fuel, no instruction executes. The language may admit loops, but the runtime must stop after the allowed number of steps. This separates the structural promise in module 2 from the resource promise here.

A host call additionally consumes one call and the number of bytes it transfers. Read and write budgets are separate. The maximum payload of one call is 4,096 bytes. Many small calls still count toward the cumulative budget. A zero-byte call consumes a call, because the crossing itself is work.

Worked sibling: a budget permits two calls and six read bytes. Reading four bytes leaves one call and two read bytes. A second request for three bytes must fail before any copy, even though it is below the per-call maximum. A second request for two bytes is legal. This is not a bandwidth benchmark; it is a deterministic state-transition contract.

Predict the current `budget` results, save the attempt, then repair the transition function. The function receives the prior state by value. On success it returns the new state; on failure it returns an error. Do not wrap a depleted unsigned counter into a huge remaining allowance.

The supplied VM also has an emergency maximum step guard. A broken learner policy cannot run forever in these fixtures, but an emergency `PhysicalGuard` result is evidence of a broken policy, not successful fuel accounting. Likewise, a thirty-second capture-runner deadline is an infrastructure backstop and cannot masquerade as guest budget exhaustion.

## 6.2 Atomic broker effects and failed jobs

Each broker operation either copies the complete authorized range or copies nothing. The runtime computes and validates the relevant ranges before the copy. That is per-operation atomicity.

The application has a second boundary: the whole job's output is staged. Several writes may succeed, then a later instruction may trap. The failed job must not publish a partly transformed image as a successful result. The supplied portable runtime clones the synthetic world for staging and replaces the original only after successful HALT.

Inspect R07. It performs an otherwise useful write and then requests an invalid memory read. The expected result combines the fault with unchanged published objects. Checking only the error message misses the publication property. Conversely, deleting every staged result would break successful jobs.

**Practice:** explain which state must remain unchanged after a denied call, and which additional state must remain unpublished after a failed job. Then run the integrated `runtime` group using your repaired policies.

## 6.3 Denial is not every kind of failure

Admission rejection, memory denial, authority denial and budget exhaustion are model outcomes. `PhysicalGuard` means a supplied lab backstop intervened after policy failure or an unexpected state. A compiler error means no model execution occurred. `native` returning NOT RUN means a required environment is absent. A runner deadline says the recording tool stopped waiting; it does not identify the intended security mechanism.

The capture stores raw exit status alongside output and hashes. Your report supplies the interpretation. Do not replace raw evidence with a green badge. A test passes only when the observed result matches that particular contract, including its useful positive control.

**Checkpoint:** budget and runtime groups pass with exact threshold behavior. You can explain why charging before a copy matters and why a failed job's staged changes remain invisible.

**Fresh application:** a new host operation expands compressed bytes into guest memory. Its input fits the per-call byte limit, but the expansion can be much larger. State which quantity the current accounting fails to bound and what new public contract would be needed before adding the operation. You are not asked to build a decompressor.
