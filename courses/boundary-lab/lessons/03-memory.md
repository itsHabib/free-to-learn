# 3. Keep guest memory inside its world

**Goal:** enforce the complete logical memory range and distinguish a logical escape from a native memory-corruption event.

Prerequisites: unsigned integers, arrays and module 2. Repair `Learner::range`. The physical slice checks in `runtime.rs` remain supplied and unchanged.

## 3.1 Linear memory and host memory

The guest sees offsets into one declared region. An offset is not a native pointer. The supplied runtime stores that region in a safe Rust vector followed by sixteen synthetic guard bytes, each 167. Those guard bytes are physically present but outside the guest's declared region.

This deliberate arrangement separates two questions: did Rust access allocated storage, and did the guest have permission to access that storage? A broken logical check can answer the first correctly and the second incorrectly. No out-of-bounds native access or real secret is necessary.

Before running `check runtime`, predict whether the one-byte guest in R05 can observe the guard. Save the prediction. Inspect the outcome and guest bytes afterwards. If 167 appears, call it a synthetic logical-isolation violation. It does not demonstrate arbitrary host-memory access, a kernel exploit or a production sandbox escape.

The WebAssembly specification makes a related boundary distinction: its memory model does not imply an unsafe program cannot corrupt its own layout inside linear memory. Our custom VM is not WebAssembly and inherits none of its implementation guarantees. [WebAssembly introduction](https://webassembly.github.io/spec/core/intro/introduction.html).

## 3.2 Check the complete range

For logical length L, offset o and count n, the entire half-open interval [o, o+n) must fit inside [0,L). A zero-byte operation may name the endpoint L; it may not name an offset beyond it. A one-byte access at L is outside the region.

Worked sibling: an eight-byte region has valid byte positions 0 through 7. A request starting at 6 for two bytes covers 6 and 7, so it fits. Starting at 6 for three bytes also reaches 8, so the whole request must fail. Copying the first two bytes and then failing would violate the all-or-nothing contract.

Integer arithmetic is part of this decision. The machine's ADD operation deliberately wraps at 32 bits. That is useful language semantics, but a wrapped range endpoint is not the mathematical endpoint used by the security contract. Your range implementation must distinguish them. Do not rely on debug-mode overflow panics as the policy.

Repair the function, preserving all valid boundaries. Use the public `memory` group, then rerun `runtime` because the same decision protects loads, stores and broker copies. Write a short argument for the entire domain, not only the examples. Explain zero length, a last-byte access, a span crossing the endpoint and a sum larger than u32 can represent.

## 3.3 Reset state between jobs

Isolation also has a time dimension. A new job must begin with zero registers and zero logical memory, then its own initial segment. Reusing a buffer without resetting it would let the next job observe data the previous one left behind.

The supplied runner creates a new register array and arena per run. Inspect the initialization before declaring that this property holds. The host's broker objects are different: their lifecycle is governed by grants and publication, which module 4 and module 6 address. “Everything is zeroed” would be an inaccurate description of the whole application.

**Practice:** propose a two-job observation that distinguishes fresh guest state from accidental reuse. Name what the first job writes, what the second is allowed to read, and the expected difference. Implement the small additional public regression if you choose; keep it separate from changing the required checks.

**Checkpoint:** range checks and R05 pass for the intended reason; the normal filter still works; your report identifies the logical boundary, physical backstop and next-job initialization separately.

**Fresh application:** a host call wants two disjoint guest spans for a header and payload. Their combined byte count is less than memory capacity. Is that sufficient to authorize both copies? State the required property of each span and of the operation as a whole, including what happens if only the second span is invalid.
