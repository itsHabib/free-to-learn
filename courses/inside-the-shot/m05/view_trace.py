#!/usr/bin/env python3
"""Show process observations and application delivery chunks without decoding them."""
import argparse
import json
from pathlib import Path


def load(path):
    path = Path(path)
    if path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Trace exceeds 2 MiB.")
    trace = json.loads(path.read_text())
    if trace.get("schema") != "re-lab-m05-trace-v1":
        raise ValueError("Not an M5 trace.")
    return trace


def deliveries(trace):
    return [e for e in trace["events"] if e["role"] == "client" and e["event"] == "delivery"]


def show(trace, detail=False):
    print(f"Scenario: {trace['scenario']}")
    for role, process in trace["processes"].items():
        print(f"{role}: pid {process['pid']}, exit {process['exit']}")
    if detail:
        origin = min(e["t_ns"] for e in trace["events"])
        for event in trace["events"]:
            extra = {k: v for k, v in event.items() if k not in ["t_ns", "role", "pid", "seq", "event"]}
            print(f"+{event['t_ns'] - origin:9d} ns {event['role']:7} #{event['seq']:02} {event['event']:12} {json.dumps(extra)}")
    for index, event in enumerate(deliveries(trace), 1):
        print(f"delivery {index}: bytes [{event['offset']},{event['offset'] + event['count']}) {event['hex']}")
    print(trace["notice"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trace")
    parser.add_argument("--detail", action="store_true")
    args = parser.parse_args()
    try:
        show(load(args.trace), args.detail)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, f"Trace refused: {error}\n")
