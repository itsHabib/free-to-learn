# Setup: Diagnose, reduce and repair a parser failure

Tested candidate platform: macOS arm64, Python 3.14.6, Apple clang 21.0.0. The delivered native executable is specific to macOS arm64. The author rebuild uses clang; learners need only the delivered binary, Python and a text editor. Linux, Windows, other Python versions and x86 macOS have not been rehearsed for this package. No Ghidra, container, external service or new installation is needed.

Extract the student ZIP into a **new** private folder. In Terminal use `cd` followed by that folder's path (quote paths containing spaces). All lesson commands assume that working directory. Do not run them from the repository root. Verify:

```sh
pwd
uname -sm
file trail
python3 --version
python3 -m json.tool response.json
```

The machine should report Darwin arm64, `file` should identify a Mach-O arm64 executable, and Python should report 3.14.6 for this rehearsed route. JSON validation prints the response template. It is not yet an answer. You will edit its blank claim/reason fields before saving.

If the ZIP lost executable permissions, run `chmod u+x trail`. If the OS blocks execution, inspect the archive provenance and your local security policy; do not bypass an unfamiliar security warning. Use the author rebuild on this tested host or ask your course provider for a supported artifact. “Bad CPU type” means the binary does not match your machine. A missing-file error usually means the working directory differs; use pwd and ls before changing code. A writer “New output file required” error means choose a fresh filename. A checker target-integrity error means re-extract the original package; do not update its manifest to conceal a changed fixture.

`python3 parser.py INPUT` is the parser command; it is intentionally faulty at first. A success prints JSON; a known invalid input prints a diagnostic to stderr and returns 2. The checker's exit 0 means its finite cases agree, 1 means a behavioral mismatch, and 2 means it could not complete (including unfinished code or timeout). Read the whole message; do not treat every nonzero exit as the same failure.

Keep work/m04, exports and output text files outside version control and public folders. notebook.py preserves supplied artifacts as text or base64, so binary reproducer bytes survive export. `--artifact` copies a snapshot; a later file edit cannot change it. The recorder refuses wrong question versions, missing assistance details, links and overlarge records. If saving is refused, correct the new scratch response; earlier records are unchanged. It is a local evidence log, not a tamper-proof or encrypted store.
