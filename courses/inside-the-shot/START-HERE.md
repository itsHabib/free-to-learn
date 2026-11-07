# Inside the Shot: investigate native programs

A program produces a result, but the result does not explain how it was produced. Learn to build and test that explanation: trace values through instructions, recover data layouts, repair a parser, reconstruct a byte stream and defend a model of a new native program.

This course has seven hands-on projects. You write the Python models and tools; the packet supplies small original native programs and their assembly listings. The final project is a reservation-replay investigation with two publication policies and a differently optimized build. You finish with saved raw inputs, executable models and an explanation another person can reproduce.

Start with [setup](SETUP.md), then [how to work](HOW-TO-WORK.md). Open this folder's `index.html` for the offline reader, guided practice and navigation. Markdown files remain readable without a browser. Reading and the small guided checks work at phone widths; writing and running the projects needs a supported computer.

## Seven projects, one investigation method

Follow the guided lesson, answer its short practice, then open the original project procedure. The guided examples use different programs or data; they teach the method without supplying your target's answer. Each original procedure retains its own first prediction, native experiment, implementation, feedback and export steps.

| Project | Learn and practise | Build and preserve |
| --- | --- | --- |
| [1. Explain a native update](learning/m01.md) | State, register width and the order in which values change | Three models, value traces and changed-rule counterexamples; [project procedure](m01/START-HERE.md) |
| [2. Recover records across calls](learning/m02.md) | Field width, byte order, signedness, pointers and call evidence | Two byte decoders and a caller/callee field map; [project procedure](m02/START-HERE.md) |
| [3. Inspect a bounded file](learning/m03.md) | Counts, offsets, bounds and what remains unknown | A robust file inspector with unknown bytes preserved; [project procedure](m03/START-HERE.md) |
| [4. Repair a parser](learning/m04.md) | Valid reduction, the first contradictory value and regression tests | A minimal reproducer, trace and justified repair; [project procedure](m04/START-HERE.md) |
| [5. Reconstruct a stream](learning/m05.md) | Frames, partial headers, reads, delivery and EOF | An incremental decoder and measured byte-to-event timeline; [project procedure](m05/START-HERE.md) |
| [6. Compare compiled forms](learning/m06.md) | Value dependencies, flags and conditional selection | One behavior model with O0/O2 correspondence; [project procedure](m06/START-HERE.md) |
| [7. Defend a new investigation](learning/m07.md) | Competing hypotheses, three layouts, invariants and published state | A decoder/replay model and reproducible handoff; [project procedure](m07/START-HERE.md) |

The first three projects establish a reliable way to explain values and bytes. Projects4–6 make that method survive a failure, a process boundary and a different compiled representation. Project 7 combines those skills with less guidance. Keep navigation open: return to a lesson when the later project exposes a gap.

Read [the final handoff guide](CAPSTONE.md) now to see what your evidence will become. After Project 7, revisit [your earlier stream decoder](cumulative-review.md) on a fixed recorded trace. That revisit uses your own saved work, not an author solution.

## Which material belongs to this course

The seven local projects are the main route. They need no Ivy game source, browser server, account, model API or network service. Use [the supplied-listing route](SETUP.md) first; [Ghidra inspection](GHIDRA.md) is optional.

The separate [recorded shot investigation](https://bytecade.games/games/native-re/index.html) connects captured CPU/register evidence to a flight. It is a recorded case study, not a live debugger or the seven-project download. The [browser mechanics toy](https://bytecade.games/games/shot-mechanics/index.html) is a different JavaScript model. Neither is a substitute for your native projects. New Ivy-native experiments need separately available source and tools; this packet does not supply or promise that source.

## Keep a usable record

Keep the original versioned ZIP and SHA256 file. Save predictions before the command or feedback that resolves them, and retain both first and revised work. Each project supplies its own recorder, checklist and public checks. Guided browser practice has its own export; it does not replace the Terminal notebooks. [Recovery](RECOVERY.md) covers ordinary command, save, checker and resume failures.

Public code checks establish their named finite cases. They do not assess every explanation, authenticate unaided work or promise production readiness. In Project 7 the public checker does not independently certify all decoded field labels; the instructor-only assessment is separate. Use the public handoff rubric to distinguish what ran, what you inferred and what remains uncertain.
