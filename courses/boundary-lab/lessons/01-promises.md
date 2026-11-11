# 1. State the promises

**Goal:** distinguish a useful program from a confined program, then state a boundary claim that an observation could disprove.

You need ordinary tests, arrays and the idea of a process. You do not need exploitation experience. This lab executes an original miniature instruction set inside a Rust program. It does not execute native plugins and it currently has no OS sandbox.

## 1.1 Assets, adversaries and exclusions

The supplied studio wants to turn a grayscale image into its negative. A pixel containing 12 should become 243. Run the demo after committing a prediction:

```sh
python3 run.py demo --attempt attempts/01-demo \
  --prediction "I expect the filter to work; that will not yet prove isolation."
```

Inspect the output and saved source identity. The original pixel values and transformed values are useful-behavior evidence. They say nothing about whether another program could read beyond its allowed memory, use another job's object or consume unlimited work.

The attacker in this model controls the bytecode, initial guest bytes and request fields it can express. The attacker does not control the Rust compiler, the native VM implementation, the broker, or the kernel. The protected objects are synthetic input/output tiles and synthetic data granted to a different job. No real secret is needed to test whether the boundary discriminates correctly.

An exclusion is part of a claim, not fine print. “This prevents a malicious native executable from reading my files” is outside the model. “The VM prevents this bytecode from reading a guest offset outside its declared region” is inside it. An incorrect native implementation could invalidate the latter claim; that is why the implementation and its assumptions must both be reviewed.

**Practice:** write two sentences in `attempts/01-demo/claims.md`: one about the image result you actually observed, and one proposed isolation claim that the run did not establish. Name the additional observation the second claim needs.

## 1.2 Follow authority across the boundary

Trace an intended read. A guest instruction selects a handle and range. The VM supplies the actual job identity to the broker. The broker selects a grant and object. Only then do bytes become available to the guest. The guest's claim about its job is data; it cannot create authority.

A worked sibling case: imagine two documents opened in an editor. Each tab labels its first local handle “1.” That label need not name the same document in both tabs. The trusted tab context decides which table is being consulted. A global lookup that ignores the tab would change the meaning of the handle. Our job tables have the same issue, even though the host application is different.

Draw four boxes: guest, VM, broker, host process. Mark which inputs each actor controls. In today's portable build, the first three live inside the same host process; drawing separate boxes does not create operating-system isolation. Module 5 explains what the additional process/kernel boundary would need.

**Practice:** the guest changes `claimed_job` from 1 to 2. Before opening `learner.rs`, write which component should be allowed to decide whether job 2's object is reachable and what trusted information that decision needs.

## 1.3 Write a falsifiable contract

A useful claim has an actor, condition, action and observable result. For example: “When a bytecode read asks for a range outside this job's grant, the broker denies it and leaves every object unchanged.” This is narrower and more testable than “the broker is secure.” It also names a positive obligation: requests inside a live read grant must still work.

Run `check core` in a new preserved attempt. Choose one failing line. Record its expected result, actual result and source snapshot hash. Do not patch yet. Explain how that observation contradicts one proposed promise. If the process merely failed to compile, you have no observation of guest behavior; record the setup failure instead.

**Checkpoint:** your report distinguishes output correctness, logical confinement and OS confinement; identifies guest-controlled versus trusted identity; and gives one falsifiable negative claim with a useful positive control. A later green check will not erase this first explanation.

**Fresh application:** a plugin emits an all-black tile while obeying every range and authority rule. Is that enough to declare the sandbox broken? State which product requirement may have failed and which isolation evidence would still be needed. No keyword or single yes/no answer substitutes for the distinction.
