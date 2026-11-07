# Finish with an investigation someone else can reproduce

The capstone is Project 7's reservation-replay investigation. Deliver a working Python decoder and replay model, plus evidence that distinguishes your explanation from plausible alternatives. A folder of outputs without the reasoning and exact inputs is not a defensible handoff.

## Carry forward the earlier tools

| Earlier work | How it earns its place in Project 7 |
| --- | --- |
| M1 value/update traces | Show which values an instruction reads and writes, in order. |
| M2 byte decoding and calls | Distinguish on-disk fields, the decoded value passed between functions and memory reached through pointers. |
| M3 bounds and unknown bytes | Validate the complete file and name what your evidence has not identified. |
| M4 minimal reproducer and repair | Preserve the first contradiction and justify a narrow change with a regression. |
| M5 incremental state | Separate intermediate observations from the state exposed at a boundary. Revisit your decoder afterward on the supplied fixed trace. |
| M6 compiled correspondence | Match roles and values across optimized listings instead of expecting identical registers or source-shaped branches. |

Return to [the M7 guided lesson](learning/m07.md), then follow [the original investigation procedure](m07/START-HERE.md). Its exact input limits, probe requirements and save stages remain the contract. This page makes the final package readable; it does not add a new hidden pass rule.

## Build the argument as you build the model

Start with two explanations you can distinguish. Keep raw probes, complete predictions and observed outputs, including a parser refusal and an operation rejected within a valid file. Those outcomes answer different questions. Connect selected outputs to real listing addresses and values. Identify facts supplied in the procedure separately from facts you inferred.

Draw three layouts: the file's bytes, the decoded record passed across calls and the state in memory. An offset in one layout is not automatically an offset in another. Explain the individual versus atomic publication policy using the event history and final state; a printed intermediate state is not necessarily committed state. State an invariant as an equation with units or named quantities, and explain any quantity that enters or leaves it.

Your public checks exercise individual, atomic and differently optimized targets on finite cases. Keep their output and target identity. For the fresh handoff probe, create and save the complete both-mode prediction before its first execution. If it disagrees, preserve the source, bytes and expectation that failed. If it agrees, state which competing account it excludes and what remains untested.

## Make the handoff usable without your memory

Use your existing workspace and choose a new export name. Include these artifacts already required by the project:

| Artifact | What a reader should be able to do |
| --- | --- |
| `investigation.py` | Run your decoder/model through the documented public checks. |
| `response.json` and original notebook records | Read the question, original and later reasoning, assistance, source snapshots and actual chronology. |
| `probes/` | Recover the exact bytes behind each cited result, rather than retype a screenshot. |
| `manifest.json` and the original course ZIP | Identify the target and starter version. A model run against changed bytes is a different experiment. |
| A short handoff explanation | Find a claim, its discriminating input, expected/observed output, relevant instruction evidence, and limit without guessing which file you meant. |

The [original checkpoint](m07/checkpoint.md) is the public self-review rubric. Use it to find an unsupported claim, not to award yourself a completion grade. Public checks do not independently certify every decoded field label or arbitrary explanation. Instructor assessment has a separate execution path; this download does not contain its keys, fixtures or report.

## Reopen an earlier skill

Complete [the cumulative stream review](cumulative-review.md) using your own saved M5 decoder. The trace is a recorded process exchange, not a new live run. Save the frame/delivery predictions before running your decoder or opening the feedback, then keep the observed result and correction in a later record. Export both.

A finished local handoff contains code another person can run and claims another person can challenge. It establishes the cases actually checked, not universal correctness, unaided authorship, a human learning outcome or permission to investigate software you do not own.
