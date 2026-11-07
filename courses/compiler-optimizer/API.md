# Kernel IR v1 and learner interfaces

This is the executable local profile, version `kernel-ir/1`. It implements the original small IR; it does not parse LLVM. Inputs must already have the normalized SSA shape described here. Unsupported shapes are rejected rather than silently translated.

## Files and functions

The supplied `start` command creates `optimizer.mjs` and `support/runtime.mjs`, `support/editor.mjs`, `support/evidence.mjs`, `support/investigation.mjs`. Your module exports the following functions. They can use the supplied support imports. Synchronous functions are simplest; the transformation/reduction checks also await their return values.

| Function | Return value |
|---|---|
| `compare(sourceResult, targetResult)` | Boolean; true only for equal completed observations |
| `dominators(program)` | Object mapping each block ID to a sorted array of its dominator IDs |
| `scalar(program, contract)` | Editor artifact with useful constant folding, pure reuse and dead-result cleanup |
| `constants(program, contract)` | Editor artifact with convergent conditional constant/phi/edge simplification |
| `aliases(program, leftID, rightID, contract)` | `must`, `may` or `no` based on static pointer facts |
| `memory(program, contract)` | Editor artifact with safe block-local load reuse/forwarding |
| `loops(program, contract)` | Editor artifact with supported scalar/load LICM |
| `decide(report)` | `{accept: boolean, reason: string}` |
| `reduce(program, input, transform)` | `{program, input, explanation}` preserving a smaller legal wrong-result witness |

`decide(report)` receives `validation:{status,complete}`, `proof:{ok}`, `identitiesCurrent` and `cost:{complete,before,after,sameWorkload}`. A positive decision requires exhaustive completed domain success, successful proof, current identities, complete comparable costs and a strict aggregate improvement. Full generated reports also contain `validation.counts`, `cases` and subject/domain digests; these extra diagnostic fields are not required on the public policy-check interface. Do not require them to exist or infer success from missing required fields. Reject explicit incomplete or contradictory evidence. The status describes only the declared finite domain, not universal correctness.

An Editor artifact is `{program, events}`. Start with `new Editor(program, contract)` and finish with `.finish()`. Read `.program` to inspect the current snapshot. Mutating it directly produces an unreported delta and is rejected when the chain is replayed.

Supported `.edit(operation)` requests:

| Operation | Meaning / checked premise |
|---|---|
| `{kind:'fold', id, value}` | Replace a scalar constant computation or equal-constant phi with the exact canonical value |
| `{kind:'reuse', id, other}` | Reuse an identical total pure expression that is available at the replaced definition |
| `{kind:'dead', id}` | Remove an unused total-pure definition; loads and effects are excluded |
| `{kind:'branch', block}` | Select the edge of a literal-bool branch; atomically clean unreachable blocks and obsolete phi inputs |
| `{kind:'memory', id, priorIndex}` | Replace this load with a preceding same-block same-location access's value; intervening may-alias stores block it |
| `{kind:'move', id, header}` | Move eligible invariant work to the supported loop preheader; loads require explicit nontrapping/nonalias proof |

`priorIndex` is the index in the current block's current instruction array, not an index from an earlier snapshot. Recompute facts after edits. The editor throws a localized reason when a premise fails; catching that reason does not establish that your analysis was correct. The checker independently replays the complete edit chain and compares the full resulting program.

The supplied runtime exports `cfg`, `definitions`, `uses`, `literal`, `evaluate`, `valueJSON`, `verify`, `run`, `observation`, `equivalent`, `cost`, `digest`, `clone` and `canonical`. `cfg` gives `{successors, predecessors}`. Definition records include block and index (`block:null` for parameters, `index:-1` for phis). The independent verifier uses graph removal, while the learner dominance task should implement its own analysis.

## Program and input representation

A program has exactly `version:1`, `name`, `params`, `returns`, `entry`, `blocks`. A parameter has `id,type`. A block has `id,phis,instructions,term`. Identifiers use ASCII letters/underscore initially and then letters, digits, underscore, dot or hyphen, up to 64 characters. Block and value namespaces are separate; value definitions are globally unique.

A phi is `{id,type,incoming:{predecessorBlock:valueID,...}}`. Its incoming keys exactly match predecessor blocks. Ordinary instructions are either `{id,op,type,args:[valueID,...]}`, scalar `{id,op:'const',type,value}`, or an effect `{op,args}`. Terminators are `{op:'br',target}`, `{op:'cbr',cond,yes,no}`, `{op:'ret',value}` or `{op:'trap',code}`.

Types are `i8`, `i32`, `bool`, `ptr<i8>`, `ptr<i32>`. Returns are scalar. The entry has no predecessor or phi. All blocks must be structurally reachable; conditional successors must differ. Ordinary definitions dominate their uses; phi uses are checked at predecessor terminators. All selected phi inputs read the old predecessor state simultaneously.

Instructions: `const`; word `add/sub/mul/and/or/xor`; comparisons `eq/ne/ult/ule/slt/sle`; `ptradd`; `load/store`; `emit`. Comparisons take two same-width words and return bool. There are no implicit casts, division, shifts, floats, calls or hidden intrinsics.

A job JSON file contains `{program, inputs:[input,...], contract}` or `{program, domain, contract}`. An input is exactly `{args,heap}`. `args` names every parameter. A heap object is `{type:'i8' or 'i32',cells:[canonicalWord,...]}` keyed by object ID. A pointer is `{object:objectID,offset:canonicalSignedDecimal}`. The object must exist with the matching element type. Pointer offsets may be out of bounds until dereferenced.

Word literals in JSON are **unsigned decimal strings**, with no leading zeros except `"0"`, within the type's range. Bools are JSON true/false. Runtime word values are BigInts; `valueJSON` converts them back to strings. Arithmetic wraps modulo 2^width. Signed comparisons interpret the high bit as negative. `ptradd` adds the signed view of an i32 word to the mathematical offset, without truncating the resulting pointer offset.

The frozen contract optionally has `offsets:{pointerID:decimalString}`, `minLengths:{pointerID:nonnegativeSafeInteger}` and `distinct:[[pointerID,pointerID],...]`. These are validated on each invocation. They cannot be strengthened by an optimization. All pointer arguments may alias unless the contract or a same-base constant-offset calculation proves otherwise.

## Execution and observation

Load/store checks element bounds. A failed access produces a defined `bounds` trap; a failed store performs no partial write. Pointer construction does not trap. Emit appends a typed scalar event; duplicate events remain duplicated. Explicit trap codes are identifiers other than reserved `bounds`.

Normal results contain `kind:'return'`, `type`, `value`, `heap`, `events`, `steps`, `counts`. Traps contain `kind:'trap'`, `code` and the same state/counters. Compare all initial heap objects, return type/value or trap code, and ordered typed events. Exclude counters. Unknown and invalid results are not completed observations.

The default run limit is 100,000 steps. A phi group is one atomic fuel step, while each assigned phi contributes one unit of modeled work. Every ordinary instruction and terminator consumes one step. Return/trap on the final allowed step completes normally. Event count is capped at 4,096. Programs are capped at 64 blocks and 512 definitions; inputs at 64 objects and 4,096 cells. CLI JSON input is capped at 1 MiB. An eight-second worker limit separately bounds learner execution.

These are resource/profile limits, not proof that a program diverges. The current verifier reports size/profile rejection as `invalid`; fuel/event exhaustion is `unknown`. The finer planning distinction between legal-but-oversized programs and malformed programs remains a known qualification gap.

## Evidence and cost

`validate` checks a nonempty explicit input list. Duplicate inputs are invalid. Its five statuses are `COUNTEREXAMPLE`, `EXHAUSTIVE_WITHIN_DOMAIN`, `SAMPLED_NO_DIFFERENCE`, `UNKNOWN`, `INVALID`. Default coverage is capped at 4,096 cases and two million combined executed steps; the API can raise the case cap to 65,536. A required case not executed remains in the denominator.

The supplied `domains.mjs` expands a finite Cartesian manifest into that list. A domain has `{version:1,axes:[axis,...],heaps:[heap,...]}` with exactly one axis per parameter. An axis is `{parameter:'x',values:['0','1']}` or, for words, `{parameter:'x',range:{from:'0',to:'255',step:'1'}}`. Ranges are inclusive with positive steps. Duplicate axis values or heaps, illegal inputs and products above 65,536 are rejected before execution. Enumeration follows axis/value order, then heap order. The receipt records the manifest, cardinality and generated-input hash. A generated domain above the execution cap remains incomplete; generation never silently authorizes a smaller domain.

`reportFor` adds independent rewrite-chain evidence, unit-cost totals and exact input/program/contract identities. A finite input list does not establish correctness elsewhere. A valid rule chain is evidence under the supplied checker and interpreter, not a machine-checked theorem about them.

The cost model counts executed operations, excludes the phi-group fuel bookkeeping and includes each phi assignment. Lower total work on the same listed inputs is the default benefit criterion; individual inputs may get more expensive and remain visible in per-case results. Actual hardware speed is not measured.

`pipeline WORK JOB.json scalar,constants,memory,loops --learner-policy` evaluates up to eight ordered passes. Every stage has its own before/selected-after identities, candidate evidence and decision. Unsupported, failing or unhelpful candidates retain the previous program. A rejected stage cannot disappear behind a later success. The aggregate chain is checked again from the original source, and the full pipeline must still reduce the declared cost before its output is selected.

## Investigation support

`support/investigation.mjs` supplies `inspectWitness(program,input,transform,{contract,fuel})`. It returns `INTERESTING` only for valid normal returns differing in value/type or heap, `NOT_INTERESTING` for completed non-witnesses or invalid candidates, and `UNRESOLVED` for transform failure or execution exhaustion. This course's investigation target excludes event-only discrepancies. Transform functions must be synchronous; the owned CLI worker bounds accidental nontermination.

`structuralMeasure(program)` returns blocks, definitions/instructions including parameters/effects, and operand occurrences. `measure(program,input)` extends that lexicographic vector with heap-object count, heap-cell count and numeric-value complexity. Value complexity sums the binary magnitude bit lengths of program constants, scalar arguments, pointer offsets and heap cells (zero costs zero; a negative offset adds one sign bit; bool false/true cost zero/one). `smaller(a,b)` compares these vectors. The legacy `evidence.size` export is an alias for this vector, not a serialized-byte score. Program/display names, SSA/block/object identifiers, property ordering, whitespace and serialization length carry no weight. Values with the same bit length can tie; this is a declared reduction order, not a ranking of every conceivable simplification. `assessNeighborhood(program,input,transform,candidates,options)` evaluates a supplied finite list of `{program,input}` candidates, records unresolved/unstarted counts and reports `NO_SMALLER_IN_LIST` only when all listed neighbors complete without a smaller witness. The learner must justify that the list covers their declared reduction family before claiming relative 1-minimality. It never proves a global minimum. Choose and implement the reduction/search decisions yourself.

## Final project

Create `project.mjs` exporting `investigate(program, foreignPass)`. It returns `{input, reduced, repair, explanation}`. `input` demonstrates a valid normal-return wrong result; `reduced` is a smaller valid source that regenerates the discrepancy through the same pass; `repair(program)` returns a checked Editor artifact. Keep the signature. The final project must strictly decrease `structuralMeasure`; changing only names, input values or unused literal values is insufficient on this deliberately reducible program. U08 may instead demonstrate a strict full-measure decrease through genuine witness-input simplification. Explain the violated premise, reduction method, retained wins and evidence limits.

No final-project implementation is supplied. Its concrete checks accept alternative valid witnesses, reduced programs and repairs. They require real retained scalar optimization and do not automatically judge the causal quality of your explanation.
