# 2. Admit only programs you understand

**Goal:** implement structural admission without confusing it with execution or termination, and explain why the admitted program cannot change underneath the VM.

Prerequisite: module 1 and reading a Rust `match`. Your code goes in `Learner::validate`. The supplied decoder and execution loop are infrastructure; do not replace them.

## 2.1 Bytes, instructions and canonical decoding

The capsule header identifies the format, instruction count, initial-data length and logical memory length. The supplied decoder checks the envelope and splits fixed 16-byte records. These are wire-format duties. Recognizing whether an operation and its operands belong to the language is admission policy.

In the supplied type, an unrecognized operation remains `Instruction::Unknown`. A known operation can still contain an invalid register or target. An enum name is not a promise that every value stored inside it is valid.

Run the `wire` group and inspect `codec.rs`. The decoder rejects a truncated capsule, trailing bytes and noncanonical reserved fields. These checks are supplied and should already pass. They do not mean your validator is correct.

**Practice:** commit a prediction about the `admission` group, then run it. For one failed case, identify whether the missing decision concerns the envelope, an instruction operand or a control-flow edge. Do not call all three “parsing.”

## 2.2 Validate operations and control flow

The public language contract is small. A program has 1–4,096 instructions. Registers are numbered 0 through 7. Only the nine named operations are supported. JUMP and JZ target an existing instruction index. A fallthrough edge must also lead to an existing instruction. HALT and unconditional JUMP have no fallthrough edge.

Consider a sibling program with three records: set register 0; conditionally jump to record 0; halt. Both possible edges from the conditional are inside the program. Now imagine removing the halt. If the condition is false, execution would fall off the end. The branch target is still legal, but the program is not structurally complete. Admission must consider both paths.

An unconditional jump back to itself is structurally valid. It does not promise to stop. Rejecting all loops would prevent useful image processing; allowing loops means a separate execution budget is necessary. Module 6 owns that obligation.

Repair `validate` using the public contract. You may use `Instruction::registers()` to inspect operands; writing instruction-decoding plumbing is not the task. Keep the positive cases. A validator that only allows HALT prevents many bad programs but fails the product.

```sh
python3 run.py check admission --attempt attempts/02-repair \
  --parent-attempt 02-first --prediction "Name the cases your change should now discriminate."
```

If a test fails, inspect the specific edge or operand named by its constructed input in `checks.rs`. A runtime `PhysicalGuard` means the supplied VM protected the lab after admission failed to do its job; it is not an admission success.

## 2.3 Bind validation to execution

Validation is about particular values. If another component changes those values afterwards, a correct validator has answered the wrong question for the eventual execution.

The supplied `admit` function clones the accepted program into an `Admitted` value with a private field. `run_admitted` uses that owned snapshot. Look at public case R06: the caller changes its original program after admission, while the admitted copy remains stable. This is a design boundary you must explain, not extra code to duplicate in the learner policy.

A printed hash helps identify a saved file. It does not itself prevent mutation or make the VM fetch from the hashed bytes. Connect the saved identity to the actual ownership/data path when writing your argument.

**Checkpoint:** admission cases pass, the useful demo still works, and your explanation distinguishes structural validity, immutable identity and runtime termination.

**Fresh application:** a proposed optimization caches “valid” under a file path and reloads the file just before execution. Describe a sequence of ordinary file edits that invalidates the argument, then specify the property a corrected cache must preserve. Do not assume the filename is content identity.
