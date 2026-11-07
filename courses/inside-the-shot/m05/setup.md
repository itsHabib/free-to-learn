# Set up one private workspace

The verified host is macOS ARM64, Python 3.14.6. Nothing is installed by this packet. A Python 3.11+ interpreter on another POSIX system may run it, but that route is unverified. Windows cannot use this procedure. No browser, network, port, administrator access or compiler is used. Do not substitute a downloaded service or a proprietary program.

1. If you extracted the complete course ZIP, use its existing `m05` folder; there is no separate module ZIP to find or extract. If you received a standalone M5 ZIP, extract it once into a new private folder. Open Terminal in the folder containing this `setup.md` and `decoder.py`. The files listed below should be directly inside that folder. Keep the whole folder as your working copy.
2. Check the location and tools:

```sh
pwd
ls README.md START-HERE.md decoder.py run_lab.py manifest.json
uname -sm
python3 --version
```

`pwd` prints your current folder. `ls` must find all five named files. `uname -sm` should say `Darwin arm64` for the verified route. The Python command should print `Python 3.14.6`. If a file is missing, change to the extracted folder with Terminal's `cd` command (type `cd `, drag the folder in, then press Return). If Python is absent or the platform differs, stop this route and ask the course operator; this lesson does not require you to install or change system software.

3. Check that your decoder starter and JSON worksheet are readable:

```sh
python3 -m py_compile decoder.py
python3 -m json.tool response.json
```

Compilation creates a disposable `__pycache__` folder and prints nothing on success; it does not complete the decoder. The second command displays the blank worksheet. For a JSON error, use a text editor to repair the named line: double-quoted keys/strings, no comments, no trailing comma. Preserve the original `question_version`.

4. Verify the packet before editing. This script reads every file listed in the supplied manifest and compares its SHA256 fingerprint (a content identifier) with the packaged value:

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
manifest = json.loads(Path("manifest.json").read_text())
for name, expected in manifest["files"].items():
    actual = hashlib.sha256(Path(name).read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit("Packet differs: " + name)
print("Packet files match the manifest.")
PY
```

Expected: `Packet files match the manifest.` Run this before editing `response.json` or `decoder.py`; later edits should differ. A mismatch before editing means use a fresh extraction, retain the bad packet and report the named file. The manifest documents the baseline; it does not authenticate an unknown sender. Saved records later retain both this original manifest and your changed decoder.

You are ready for START-HERE. The first live run comes after a worked example and a saved prediction. Run commands in the extracted folder throughout. Every run needs a new output folder; a refusal to reuse an old folder protects its evidence. Choose a new suffix such as `runs/first-2` and record that path in your notes. Do not delete an earlier attempt to make a command succeed.
