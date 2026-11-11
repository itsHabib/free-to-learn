#!/usr/bin/env python3
"""Capture one learner attempt before building/running its exact source snapshot."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
GROUPS = ["core", "all", "admission", "memory", "authority", "syscall", "budget", "runtime", "wire", "transfer"]


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check", "demo", "status", "native"])
    parser.add_argument("group", nargs="?", choices=GROUPS, default="core")
    parser.add_argument("--attempt", required=True, help="New directory; an existing path is always refused")
    parser.add_argument("--prediction", required=True, help="Commit your expected outcome before seeing the run")
    parser.add_argument("--help-used", default="none", help="Record hints, people or tools used")
    parser.add_argument("--parent-attempt", default=None, help="Earlier attempt ID, without replacing it")
    args = parser.parse_args()
    if os.name != "posix":
        parser.exit(69, "This capture runner is qualified for POSIX hosts only; no execution attempted.\n")
    if shutil.which("cargo") is None:
        parser.exit(69, "cargo is unavailable; no execution or installation attempted\n")
    scaffold_path = ROOT / "scaffold-manifest.json"
    try:
        scaffold = json.loads(scaffold_path.read_text())
        for entry in scaffold["files"]:
            relative = Path(entry["path"])
            legal = relative in (Path("Cargo.toml"), Path("run.py")) or (relative.parent == Path("src") and relative.suffix == ".rs")
            if not legal or (ROOT / relative).is_symlink():
                raise ValueError("Invalid scaffold path")
        changed = [entry["path"] for entry in scaffold["files"]
                   if digest(ROOT / entry["path"]) != entry["sha256"]]
    except (OSError, ValueError, KeyError):
        parser.exit(65, "Scaffold manifest is missing or unreadable. Restore the supplied package; no execution attempted.\n")
    if changed:
        parser.exit(65, "Supplied scaffold changed: " + ", ".join(changed) + ". Restore it; edit src/learner.rs instead.\n")
    destination = Path(args.attempt).resolve()
    try:
        destination.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        parser.exit(64, f"Refusing existing attempt: {destination}\n")
    snapshot = destination / "source"
    snapshot.mkdir()
    files = [ROOT / "Cargo.toml", *sorted((ROOT / "src").glob("*.rs"))]
    if (ROOT / "Cargo.lock").is_file(): files.append(ROOT / "Cargo.lock")
    sources = []
    for source in files:
        if source.is_symlink():
            parser.exit(65, "Source symlinks are not accepted in a recorded attempt; no execution attempted.\n")
        relative = source.relative_to(ROOT)
        target = snapshot / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        sources.append({"path": str(relative), "sha256": digest(target), "bytes": target.stat().st_size})
    prediction = {"committed_at": now(), "action": args.action, "group": args.group,
                  "prediction": args.prediction, "help_used": args.help_used,
                  "parent_attempt": args.parent_attempt, "sources": sources,
                  "scaffold_manifest_sha256": digest(scaffold_path),
                  "mode": "portable-core", "native_linux": "NOT RUN"}
    (destination / "prediction.json").write_text(json.dumps(prediction, indent=2) + "\n")
    argv = ["cargo", "run", "--offline", "--manifest-path", str(snapshot / "Cargo.toml"), "--", args.action]
    if args.action == "check": argv.append(args.group)
    env = os.environ.copy()
    env["CARGO_TARGET_DIR"] = str(destination / "build")
    output = destination / "output.txt"
    started = now()
    start_clock = time.monotonic()
    interruption = None
    with output.open("wb") as stream:
        process = subprocess.Popen(argv, cwd=snapshot, env=env, stdout=stream, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        while process.poll() is None:
            if time.monotonic() - start_clock > 30:
                interruption = "runner_deadline"
            if output.stat().st_size > 1_048_576:
                interruption = "output_limit"
            if interruption:
                os.killpg(process.pid, signal.SIGKILL)
                break
            time.sleep(0.02)
        returncode = process.wait()
    source_unchanged = all(digest(snapshot / s["path"]) == s["sha256"] for s in sources)
    binary = destination / "build" / "debug" / ("boundary-lab.exe" if os.name == "nt" else "boundary-lab")
    result = {"started_at": started, "finished_at": now(), "argv": argv, "cwd": str(snapshot),
              "os": platform.system(), "release": platform.release(), "machine": platform.machine(),
              "python": platform.python_version(), "returncode": returncode,
              "interruption": interruption, "output_sha256": digest(output),
              "binary_sha256": digest(binary) if binary.is_file() else None,
              "source_snapshot_unchanged": source_unchanged,
              "mode": "portable-core", "native_linux": "NOT RUN", "course_complete": False}
    result["tool_versions"] = {}
    for tool in ("cargo", "rustc"):
        try:
            observed = subprocess.run([tool, "--version"], capture_output=True, text=True, timeout=5)
            result["tool_versions"][tool] = observed.stdout.strip() if observed.returncode == 0 else None
        except (OSError, subprocess.TimeoutExpired):
            result["tool_versions"][tool] = None
    (destination / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(output.read_bytes()[:1_048_576].decode("utf-8", errors="replace"), end="")
    print(f"\nAttempt preserved: {destination}\nRaw exit: {returncode}; runner interruption: {interruption}")
    if not source_unchanged: return 70
    if interruption: return 75
    return returncode if returncode >= 0 else 70


if __name__ == "__main__":
    sys.exit(main())
