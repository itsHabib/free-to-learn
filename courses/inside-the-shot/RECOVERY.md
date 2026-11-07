# Recover without losing the investigation

Use the symptom to choose the next small check. Preserve the working folder and the complete error before changing anything. Most failures below concern location, format or an unfinished starter rather than the native rule you are trying to infer.

| Symptom | What to inspect | Safe next action |
| --- | --- | --- |
| `No such file`, `can't open file` | Run `pwd`, then `ls` for the exact named file. | Change to the intended `mNN` folder; quote a path containing spaces or drag it after `cd `. |
| Python prints a JSON line/column error | Open the named response at that location. | Use double-quoted keys/strings, commas between entries and no trailing comma; rerun `python3 -m json.tool response.json`. This is syntax feedback, not a factual grade. |
| Python reports `SyntaxError` | Run `python3 -m py_compile` on your model. | Fix the named syntax while preserving the earlier source/record; no native experiment is needed to diagnose punctuation. |
| Untouched code raises `NotImplementedError` | Check which starter was run. | Implement the requested function; an intentionally incomplete starter is not a broken installation. |
| Native executable says `Permission denied` | Confirm the path, then inspect `ls -l` and the module setup. | If the execute bit was lost, restore it only for the named supplied target using the module's `chmod u+x` command. |
| Wrong architecture or an OS security warning | Keep `uname -sm`, the exact message and target fingerprint. | Use the supported native profile. Do not remove quarantine or disable OS security. Listing-only work can continue but cannot be reported as native execution. |
| Target hash mismatch | From the course root use `python3 check_packet.py --targets-only`. | Keep the changed copy and extract the original version into a new folder. Do not edit the manifest to hide a changed target. |
| A corpus lacks accepted/rejected coverage | Read the complete checker diagnostic and your selected raw inputs. | Add a predicted discriminating input of the missing kind; keep earlier cases and do not tune expected answers to silence the check. |
| A native file is `refused:` | Compare its size, count and byte bounds with your inferred format. | Preserve it as a malformed control; make a separate well-formed file to test an operation's state effect. |
| A run/output directory already exists | Inspect the previous output before doing anything else. | Choose a new name such as `first-2`; never delete earlier evidence to make a run appear fresh. |
| A notebook save fails | Keep the response and read the complete validation error. | Repair that input and retry; confirm a new record path before considering it saved. Existing records remain evidence. |
| A prediction was saved too late | Retain the actual order and which answer or run you saw. | Label the observation honestly. Make a different fresh prediction for later work; changing the timestamp cannot restore unseen history. |
| A stream decoder fails at EOF | Separate an empty `feed` call from `finish()`, and inspect pending bytes. | Preserve the exact partial header/payload; compare the intended EOF rule before changing the framing loop. |
| Browser progress did not persist | Read the save-status message; file-URL storage can vary. | Export this lesson's practice before closing. Terminal project notebooks remain separate and are not lost by a browser storage failure. |

## Restore only what you mean to restore

A fresh archive contains the original starter, not your completed work. Copy your own preserved model, response, probes and records into the new same-version working folder before resuming. Keep the older folder. For the cumulative revisit, restore your own M5 decoder first; substituting a supplied author solution would change what the revisit establishes.

If you need help, a useful report names the project/version, platform, Python version, exact command, complete error, and relevant target hash. Supply the smallest synthetic input that reproduces the problem. Do not post your entire private notebook, unrelated files or credentials. A small reproduction makes diagnosis possible without reproducing your whole computer setup.
