# Trace a local request, one byte boundary at a time

Your goal is to explain how a sequence of bytes becomes messages across two real processes. You will deliver a timeline, your own incremental decoder, an error/repair history and a changed-request prediction. Basic Python functions, classes, loops, lists and bytes are prerequisites; framing and process observations are introduced in [worked-example.md](worked-example.md). No time limit applies.

Complete [setup.md](setup.md) first. All commands below run in the extracted bundle. Keep its source scripts closed until the first decoder attempt is saved: inspecting `client.py`, `service.py`, `transport.py`, `protocol.py` or `check_decoder.py` supplies solution assistance. You can use them later, with disclosure. Opening these Markdown lessons is ordinary instruction.

## 1. Preserve a prediction before each reveal

`response.json` is your worksheet. Edit it with a text editor. A `claim` says what you think; `reason` says why; `alternative` names a competing explanation; `prediction` holds expected results before running; `observations` holds actual results later. `timeline` holds byte intervals and events. Use `revision` for what changed and `limitations` for what you cannot establish. Keep the question version. JSON strings and keys use double quotes; arrays use square brackets. Add fields when useful.

Save a new immutable attempt before revealing each exercise answer, trace or checker result:

```sh
python3 -m json.tool response.json
python3 notebook.py record --workspace work/m05 --stage prediction --response response.json --manifest manifest.json --assistance none
```

The first command checks syntax. The second prints `Saved new attempt: work/m05/...json` with a new ID. Every save captures the original question, teaching, target/source snapshots, manifest, response and declared help. Use `--artifact decoder.py` to snapshot your code and `--evidence runs/first/trace.json` to snapshot a trace when it exists. These are copies, so editing the working files does not change old records. The manifest records delivered files; your code snapshot records your own current revision.

`Not saved/read` means the save failed. Read the reason and repair the input before revealing the result. Do not count an unsuccessful save as preserved work. Files and complete records are limited to 2 MiB; non-finite JSON numbers are refused. Split an oversized narrative into smaller new records; old records remain intact. The tool preserves evidence; it does not certify reasoning, chronology outside the recorder, or truthful assistance reporting.

After help, change the flag and add nonempty `assistance_details` naming the exact help and what it revealed. Use `checker` for checker/decoder-run feedback; `hint-1` through `hint-3` for baseline hints; `transfer-hint-1` through `transfer-hint-3` for transfer hints. Use the highest applicable level, and list all other help in details. Use `solution` for source inspection, a worked author answer, or external help that gives the implementation. The ordinary worked printer example is teaching, not a lab answer. Its optional completion feedback is `hint-1`. Assistance is allowed; keep the first attempt distinct from assisted revisions.

Now complete the printer worked example, its prediction and its new-boundary completion exercise. Save before its reveal and save your comparison after it. Return here when you can explain why a delivery may finish an old frame and start another.

## 2. Predict the real exchange

The lab uses two child processes. The **client** writes requests through one pipe. The **service** reads them, creates replies and writes through a second pipe back to the client. Each process has separate memory and its own PID. The supervisor `run_lab.py` starts them and records their observations; it does not replace them with a table of outputs. Both children exit after EOF. No socket or background service remains.

The supplied wire contract is: two unsigned big-endian length bytes, followed by that many printable ASCII bytes (values 32 through 126). Length is 1..64. A frame has no newline or trailing zero byte. For example, decimal length 258 would encode as `01 02`, but this lab rejects that size because its maximum is 64. All valid lengths here therefore start with `00`. Do not treat the leading zero as padding: it belongs to the header and must be present. Offsets below count bytes from zero; `[0,2)` means offsets 0 and 1, with 2 excluded.

Baseline requests are `north:7`, `east:12`, `west:0`; the service prepends `ACK ` to each reply. It writes the first reply frame, then the other two together. The client groups the response into deliveries of **1, 4, 21, 12 bytes**. These are supplied application grouping choices. They do not guarantee how many OS reads or writes happen.

Before running anything, count each reply's payload and frame length. Predict which replies each delivery can complete and the pending byte count after it. State an alternative model (“each read is a message” is one), and name an observation that would reject it. Save a `prediction` with purpose `baseline-before-run` using section 1. Then run:

```sh
python3 run_lab.py --scenario baseline --out runs/first
python3 view_trace.py runs/first/trace.json
python3 view_trace.py runs/first/trace.json --detail
```

The supervisor prints a saved trace path and says both children exited 0. The view prints two distinct PIDs and four delivery intervals: `[0,1)`, `[1,5)`, `[5,26)`, `[26,38)`. Their bytes must be in order. Actual PIDs and times vary. If the command refuses an existing folder, choose a new run path and retain the old one. If a child fails, inspect `runs/first/client.jsonl` and `service.jsonl` in a text editor and save the error; do not interpret partial logs as a complete run. A timeout is a failure, not evidence of network latency.

Save a new prediction-stage observation with your predicted and observed boundaries separated. Retain the raw trace with your next timeline save.

## 3. Build the byte-to-event timeline

The detailed view shows nanoseconds relative to the first logged event. Each row contains a role, a per-process sequence number and an event:

- **`write_intent`** records the bytes a child is about to send and their stream offset. It does not mean the peer has read them.
- **`write_return`** means the child's write loop completed. It is not an exact peer receive time, or proof of a single OS call.
- **`os_read`** records one actual read's requested size, returned bytes and count. Count 0 means EOF; another count does not mark a message boundary.
- **`request`** means the service parsed a request under its own rules. It does not check your response decoder.
- **`delivery`** records a prescribed application group assembled by the client. It need not match one OS read, one write or one frame.
- **`send_closed`** and **`eof`** mark the end of one child's send or received stream. They do not mark the other direction ending at the same instant.

`hex` is byte content rendered as hex pairs, not ASCII text yet. `count` counts bytes, not hex characters. A reply's offset zero is distinct from a request's offset zero: the pipes are different streams. Start your timeline with the **service-to-client** direction only. Label any later request rows with their direction.

For each delivery, record its interval, header bytes completed, declared payload length, completed reply strings and pending suffix. Use an interval for every complete frame and cite the delivery/sequence that provides its last byte. Then compare the matching service `write_intent` intervals and client `os_read` intervals. Find one instance of a split frame and one of two frames completed in a single delivery. Explain whether the actual OS read boundaries in your run match the scripted chunks; either result is valid evidence.

Do not rank causality by adjacent timestamps alone. A peer can log a read between another process's write intent and return. Report within-process sequence order and per-pipe byte order first. A timestamp gap includes Python, scheduling, pipe buffering and logging. This exercise does not isolate or benchmark those components.

Save your timeline and its trace:

```sh
python3 notebook.py record --workspace work/m05 --stage timeline --response response.json --manifest manifest.json --assistance none --evidence runs/first/trace.json
```

If you needed help, use its actual assistance flag/details instead. A good explanation names the concrete offsets and sequence numbers in your own trace, not just “pipes are streams.”

## 4. Implement and repair your decoder

Edit only your `decoder.py` initially. A Python class keeps the pending buffer and lifecycle state between method calls. Each new stream gets a new `Decoder()` object. Implement this interface:

- **`feed(chunk)`** accepts `bytes` of length 0..4096. Return a list of every newly complete payload string in order; preserve unfinished bytes.
- **Valid frame:** two-byte unsigned big-endian length 1..64, then that many printable ASCII bytes.
- **Bad type/size, length or payload:** raise `ValueError`. The decoder is failed and cannot be reused.
- **`finish()`** signals EOF. Return `None` if no pending bytes; otherwise raise `ValueError` and fail. Repeated successful calls return `None` again.
- **Calls after closure:** `feed` after successful finish, or any call after failure, raises `ValueError`. Make a new instance for a new stream.

Empty `b""` in `feed` is not EOF. A header announcing 65 bytes must be refused before waiting for 65 bytes. Never silently drop an incomplete suffix. Earlier returned events stay valid; a call that raises returns no events from that call. Your code must not read files, invoke targets, or depend on these particular words or chunk sizes.

Use this ordered plan: validate input/state; append new bytes; wait if the header is incomplete; read and bound the length; wait if the body is incomplete; validate and emit the body; remove only the consumed prefix; repeat for remaining frames. EOF is a separate operation. This is guidance; write the code yourself. If you need help, open one level in `hints.md`, record it, and try again.

Before checking, save your first code attempt and reasoning. Then run the public checks and the live trace through your decoder:

```sh
python3 notebook.py record --workspace work/m05 --stage timeline --response response.json --manifest manifest.json --assistance none --artifact decoder.py --evidence runs/first/trace.json
python3 check_decoder.py decoder.py > checker-feedback.txt 2>&1
cat checker-feedback.txt
python3 decode_trace.py decoder.py runs/first/trace.json > trace-feedback.txt 2>&1
cat trace-feedback.txt
```

The unfinished starter prints `Unfinished decoder` and exits 2. A behavioral mismatch exits 1, naming a failing chunk/input and expected versus observed result. A load/interface error exits 2. A correct implementation prints a public-check agreement count; it establishes agreement with finite cases, not a proof or a grade for your explanation. `decode_trace` prints events by delivery and either accepts EOF or names its refusal. After checking a working decoder on baseline, the first two deliveries should emit no messages, the third should complete two, and the fourth the remaining one. Compare with your earlier table, rather than replacing it.

Record checker feedback before repair: put the observed failure and diagnosis in the response and run:

```sh
python3 notebook.py record --workspace work/m05 --stage timeline --response response.json --manifest manifest.json --assistance checker --artifact decoder.py --evidence checker-feedback.txt
```

Then repair one cause, save the changed code as another new record, and rerun. If your first implementation already passed, keep that result. You may test a **diagnostic negative control**: copy your working code to `decoder_mistake.py`, deliberately change its byte order to `little` (or remove its full-frame loop), predict the consequence, save that file as an artifact, and check it. Label the record `diagnostic negative control` and state the intentional mutation. Its failure tests the checker and your diagnosis; it is not evidence that you repaired your own misconception. Retain the control, explain it, and continue with your unchanged working `decoder.py`. Never fabricate a learner failure or change an earlier record. The checker contains generated probes from the public protocol and can reveal substantial implementation guidance. Inspecting it requires `solution` disclosure.

## 5. Predict a changed request and delivery schedule

The transfer run changes only the third request to **`west:257`**, and groups replies into **2, 11, 1, 3, 23 bytes**. The same wire format and maximum length apply. Before the run, compute new frame intervals, events per delivery and pending bytes. Predict whether your unchanged decoder should pass, and explain which assumption a one-read/one-message decoder would violate. Save a `transfer` record with your current decoder before running.

```sh
python3 notebook.py record --workspace work/m05 --stage transfer --response response.json --manifest manifest.json --assistance checker --artifact decoder.py
python3 run_lab.py --scenario transfer --out runs/transfer
python3 view_trace.py runs/transfer/trace.json --detail
python3 decode_trace.py decoder.py runs/transfer/trace.json
```

Use your actual prior assistance category/details. You should see five deliveries and a 40-byte reply stream, with the new third payload in decoded output. Record observed events and your explanation in a new transfer record with its trace. If it fails, preserve that version before repair; use `transfer-hints.md` only as needed and label it separately.

## 6. Test failure boundaries and repeatability

Predict each outcome first, then save a `handoff` record. The first two runs below are valid regroupings. The last four have deliberately invalid response streams; the process transport succeeds, but the decoder must refuse. `truncated` drops one byte from the last payload; `malformed` includes a byte outside printable ASCII; `zero` declares length 0; `oversize` declares 65 with no body. These do not use a network attack or third-party target.

```sh
python3 run_lab.py --scenario combined --out runs/combined
python3 decode_trace.py decoder.py runs/combined/trace.json
python3 run_lab.py --scenario bytewise --out runs/bytewise
python3 decode_trace.py decoder.py runs/bytewise/trace.json
python3 run_lab.py --scenario truncated --out runs/truncated
python3 decode_trace.py decoder.py runs/truncated/trace.json
python3 run_lab.py --scenario malformed --out runs/malformed
python3 decode_trace.py decoder.py runs/malformed/trace.json
python3 run_lab.py --scenario zero --out runs/zero
python3 decode_trace.py decoder.py runs/zero/trace.json
python3 run_lab.py --scenario oversize --out runs/oversize
python3 decode_trace.py decoder.py runs/oversize/trace.json
```

Valid regroupings should produce the same three reply strings in order. Truncated EOF must exit 1 after reporting its incomplete suffix; earlier completed frames can already have been emitted. The other invalid streams must exit 1 with `ValueError` rather than a traceback or success. Preserve feedback and identify whether refusal happened while feeding or at EOF. A script that rejects everything is wrong: it must still accept the valid controls.

Repeat the baseline twice with new run paths:

```sh
python3 run_lab.py --scenario baseline --out runs/repeat-a
python3 run_lab.py --scenario baseline --out runs/repeat-b
python3 - <<'PY'
import json
from pathlib import Path

def chunks(name):
    trace = json.loads(Path("runs", name, "trace.json").read_text())
    return [row["hex"] for row in trace["events"]
            if row["role"] == "client" and row["event"] == "delivery"]

print("Repeated delivery bytes equal:", chunks("first") == chunks("repeat-a") == chunks("repeat-b"))
PY
```

Expected `True` for the supplied baseline schedule. Also inspect repeated detailed traces and compare OS read counts and observed time gaps. They may or may not differ in this small sample. State only what your runs show; do not claim OS scheduling, PIDs, raw reads or timings repeat deterministically. Record at least one measured gap with its endpoints and this limitation. Three runs cannot establish a latency distribution.

For a final fresh prediction, choose `single`, which sends only the first request. Predict its complete frame and EOF behavior, save first, then run:

```sh
python3 run_lab.py --scenario single --out runs/single
python3 decode_trace.py decoder.py runs/single/trace.json
```

Save the result and its trace. Your handoff explains why the same decoder handled bytewise, combined and changed-request streams, and cites the invalid controls as well as passes.

## 7. Export and resume without rewriting history

Write a final response describing your supported behavior, a concrete timeline claim, a repair, assistance and limits. Save a handoff record with your decoder and selected trace, then list the records:

```sh
python3 notebook.py record --workspace work/m05 --stage handoff --response response.json --manifest manifest.json --assistance checker --artifact decoder.py --evidence runs/single/trace.json
python3 notebook.py list --workspace work/m05
```

Use `solution` if you inspected implementation sources or author answers. Keep the entire extracted folder private; saved records include the original source/question/teaching and your code. Export to a new sibling directory, retaining every earlier file:

```sh
python3 - <<'PY'
import hashlib, json, shutil
from pathlib import Path
root = Path.cwd()
hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (root / "work/m05").glob("*.json")}
(root / "record-hashes.json").write_text(json.dumps(hashes, indent=2) + "\n")
shutil.copytree(root, root.parent / "m05-export")
print("Copied to", root.parent / "m05-export")
PY
cd ../m05-export
python3 notebook.py list --workspace work/m05
```

If `m05-export` already exists, `copytree` refuses; choose a new sibling name and use that same name in `cd`. Nothing is overwritten. In the copied folder, verify earlier record bytes:

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
hashes = json.loads(Path("record-hashes.json").read_text())
assert hashes, "No saved records to verify"
for name, expected in hashes.items():
    assert hashlib.sha256((Path("work/m05") / name).read_bytes()).hexdigest() == expected, name
print("Earlier records unchanged:", len(hashes))
PY
```

Edit the copied `response.json` to explain the resume, then run the handoff save again with the same selected trace and current help category. It must create one additional record, leaving old records untouched. Share only the evidence you intend to share; the packet and local records do not publish themselves. A passing checker plus author rehearsal cannot establish independent human learning, accessibility or readiness to analyze arbitrary software.
