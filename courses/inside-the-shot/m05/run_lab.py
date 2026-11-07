#!/usr/bin/env python3
"""Run two original local processes and preserve their byte observations."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys

HERE = Path(__file__).resolve().parent
SOURCE = HERE if (HERE / "client.py").is_file() else HERE.parent / "source"
sys.path.insert(0, str(SOURCE))
from protocol import SCENARIOS


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(scenario, out):
    if os.name != "posix":
        raise ValueError("This route requires POSIX pipes; Windows is unsupported.")
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    # Logs go to regular files, so children cannot fill a stderr pipe while waiting.
    with (out / "service.jsonl").open("wb") as service_log, (out / "client.jsonl").open("wb") as client_log:
        service = subprocess.Popen([sys.executable, str(SOURCE / "service.py"), "--scenario", scenario],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=service_log)
        try:
            client = subprocess.Popen([sys.executable, str(SOURCE / "client.py"), "--scenario", scenario],
                                      stdin=service.stdout, stdout=service.stdin, stderr=client_log)
            service.stdout.close()
            service.stdin.close()
            try:
                client_exit = client.wait(timeout=10)
                service_exit = service.wait(timeout=10)
            except subprocess.TimeoutExpired:
                client.kill()
                service.kill()
                client.wait()
                service.wait()
                raise ValueError("Processes exceeded 10 seconds; partial logs retained. No timing inference is valid.")
        finally:
            if service.poll() is None:
                service.kill()
                service.wait()
    if client_exit or service_exit:
        raise ValueError(f"Child failure: client={client_exit}, service={service_exit}; inspect retained *.jsonl logs.")
    events = []
    for role in ["client", "service"]:
        rows = [json.loads(line) for line in (out / f"{role}.jsonl").read_text().splitlines()]
        if not rows or any(row["role"] != role for row in rows):
            raise ValueError("Missing or mixed-role process observations.")
        if [row["seq"] for row in rows] != list(range(1, len(rows) + 1)):
            raise ValueError("Process observations are not in sequence.")
        if any(a["t_ns"] > b["t_ns"] for a, b in zip(rows, rows[1:])):
            raise ValueError("Monotonic clock moved backwards within a process.")
        events.extend(rows)
    events.sort(key=lambda row: (row["t_ns"], row["role"], row["seq"]))
    client_rows = [row for row in events if row["role"] == "client"]
    service_rows = [row for row in events if row["role"] == "service"]
    for sender, receiver in [(client_rows, service_rows), (service_rows, client_rows)]:
        sent = b"".join(bytes.fromhex(r["hex"]) for r in sender if r["event"] == "write_intent")
        read = b"".join(bytes.fromhex(r["hex"]) for r in receiver if r["event"] == "os_read")
        if sent != read:
            raise ValueError("Pipe observations disagree on transferred bytes.")
    trace = {"schema": "re-lab-m05-trace-v1", "scenario": scenario,
             "notice": "Delivery chunks are scripted application groups, not OS read boundaries. Timestamps are observations, not exact causality or latency.",
             "runtime": {"platform": platform.platform(), "machine": platform.machine(),
                         "python": sys.version, "executable": sys.executable,
                         "executableSha256": digest(Path(sys.executable).resolve())},
             "processes": {"client": {"pid": client.pid, "exit": client_exit},
                           "service": {"pid": service.pid, "exit": service_exit}},
             "sources": {name: digest(SOURCE / name) for name in
                         ["client.py", "service.py", "protocol.py", "transport.py"]},
             "events": events}
    (out / "trace.json").write_text(json.dumps(trace, indent=2) + "\n")
    print(f"Saved {out / 'trace.json'}; client and service exited 0.")
    return trace


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=SCENARIOS, default="baseline")
    parser.add_argument("--out", required=True, help="New run directory; existing directories are refused.")
    args = parser.parse_args()
    try:
        run(args.scenario, args.out)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(2, f"Run refused/failed: {error}\n")
