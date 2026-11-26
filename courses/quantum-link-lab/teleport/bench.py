"""Inspect a teleportation receiver and its readout on a local exact simulator."""

import argparse
import json

from protocol import (
    MESSAGES, PROBES, apply_gates, day_readout, deployed_corrections,
    ideal_corrections, measured_branch, readout_probabilities,
)


def receiver_policy(name):
    if name == "learner":
        from receiver import corrections
        return corrections
    return {"ideal": ideal_corrections, "broken": deployed_corrections}[name]


def station_readout(name):
    if name == "night":
        from night_shift import readout_gates
        return readout_gates
    if name == "day":
        return day_readout
    raise ValueError(f"Unknown station {name!r}")


def trace(state, bits, receiver="broken", station="day"):
    payload, basis, expected = PROBES[state]
    weight, bob = measured_branch(payload, bits)
    phase, flip = map(int, bits)
    commands = list(receiver_policy(receiver)(phase, flip))
    received = apply_gates(bob, commands)
    probs = readout_probabilities(received, basis, station_readout(station))
    return {
        "state": state, "bits": bits, "phase": phase, "flip": flip,
        "branch_probability": round(weight, 12), "gates": commands,
        "basis": basis, "expected_bit": expected,
        "readout_probabilities": [round(p, 12) for p in probs],
        "pass_probability": round(probs[expected], 12),
    }


def sweep(states, receiver, station):
    rows = []
    for state in states:
        branches = [trace(state, bits, receiver, station) for bits in MESSAGES]
        score = sum(b["branch_probability"] * b["pass_probability"] for b in branches)
        rows.append({"state": state, "basis": PROBES[state][1], "pass_probability": score})
    return rows


def calibrate(states, readout):
    rows = []
    for state in states:
        payload, basis, expected = PROBES[state]
        probs = readout_probabilities(payload, basis, readout)
        rows.append({"state": state, "basis": basis, "pass_probability": round(probs[expected], 12)})
    return rows


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    scans = commands.add_parser("sweep", help="weight all four possible messages")
    branch = commands.add_parser("trace", help="inspect one chosen measurement outcome")
    direct = commands.add_parser("calibrate", help="prepare probes directly at the detector")
    for sub in (scans, branch, direct):
        sub.add_argument("--station", choices=("day", "night"), default="day")
        sub.add_argument("--json", action="store_true")
    for sub in (scans, branch):
        sub.add_argument("--receiver", choices=("ideal", "broken", "learner"), default="broken")
    for sub in (scans, direct):
        sub.add_argument("--states", choices=PROBES.keys(), nargs="+", default=list(PROBES))
    branch.add_argument("--bits", choices=MESSAGES, required=True, help="phase bit then flip bit")
    branch.add_argument("--state", choices=PROBES.keys(), required=True)
    return parser, parser.parse_args()


def run(args):
    header = {"model": "exact local simulation", "command": args.command, "station": args.station}
    if args.command == "calibrate":
        return {**header, "rows": calibrate(args.states, station_readout(args.station))}
    header["receiver"] = args.receiver
    if args.command == "sweep":
        return {**header, "rows": sweep(args.states, args.receiver, args.station)}
    return {**header, **trace(args.state, args.bits, args.receiver, args.station)}


def print_report(report):
    print(f"Exact local simulation | {report['command']} | station {report['station']}")
    if report["command"] == "calibrate":
        print("Direct preparation at detector; receiver bypassed.")
    else:
        print(f"Receiver: {report['receiver']}")
    if "rows" in report:
        if report["command"] == "sweep":
            print("Pass probability averaged over all four messages.")
        print("state     basis    pass")
        for row in report["rows"]:
            print(f"{row['state']:<9} {row['basis']:<5} {row['pass_probability']:>6.0%}")
        return
    print(f"Input: {report['state']}")
    print(f"Alice sends {report['bits']} (phase={report['phase']}, flip={report['flip']})")
    print(f"Probability of this message: {report['branch_probability']:.0%}")
    print("Bob applies " + (" then ".join(report["gates"]) or "no gates"))
    zero, one = report["readout_probabilities"]
    print(f"Detector basis {report['basis']}, expected bit {report['expected_bit']}")
    print(f"P(0) = {zero:.0%}   P(1) = {one:.0%}")
    print(f"Pass probability on this message: {report['pass_probability']:.0%}")


def main():
    parser, args = parse_args()
    try:
        report = run(args)
    except (KeyError, TypeError, ValueError) as error:
        parser.exit(2, f"Bench: {error}\n")
    if args.json:
        print(json.dumps(report, allow_nan=False))
    else:
        print_report(report)


if __name__ == "__main__":
    main()
