# Opening slice regression

Run from `courses/firmware-forensics` with an installed Python:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s checks -v
```

These three maintainer tests execute the code displayed in unit 01 and the
Markdown parser lesson, compare it to `examples/slice_probe.py`, and ensure the
checker rejects both an always-reject implementation and the wrong exception
contract. The displayed starter deliberately passes only 2/8 range cases.
This suite is separate from `lab/checks`, preserving the five scaffold tests
and the existing parser/full-stage sequencing.

## Validation of this source change (2026-11-16)

On macOS arm64, Python 3.14.6 and Node 26.5.1:

- Opening regression: 3/3 passed.
- Existing `.ci/test_firmware_checker_stages.py`: 4/4 passed, unchanged.
- `work.py` created a fresh temporary first attempt, then copied its three
  unchanged TODO sources to a new revision attempt.
- `check_core.py --stage parser`: exit 1 as expected; scaffold 5/5 passed,
  parser/inventory/dependency checks 0/49 with named `NotImplementedError`s.
- `trust/check.mjs` on the untouched starter: exit 1, 0/154. This is an expected
  unfinished policy, not a successful trust result.
- Executable slice starter: exit 1, 2/8. A repair confined to `read_payload` in
  a temporary copy: exit 0, 8/8. The two fresh boundary cases also accepted the
  final byte and rejected a one-byte range beginning at end of file. That repair
  is validation assistance, not a submitted learner attempt or bundled answer.

Only local trusted code and inert teaching bytes were exercised. No network,
installation, hardware, firmware execution or browser control was used. This
validation does not qualify a completed parser, seven-unit route, capstone,
human learning, reader layout or browser journal/export. Historical browser
qualification and learner evidence are unchanged. Clone/download acquisition
and archive recovery were documented but not executed in this offline pass.

The coordinator must regenerate/reconcile package and public inventories and
archives after reviewing this source change. They were deliberately left alone
here; an older packaged archive will not include the new probe or regression.
