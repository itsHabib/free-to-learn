"""Print, as JSON, the numbers tools/figures.mjs draws: every one comes from lab.py or teleport/bench.py."""

import json
import math
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
COURSE = os.path.dirname(HERE)
sys.path.insert(0, COURSE)
sys.path.insert(0, os.path.join(COURSE, "teleport"))

import lab  # noqa: E402
import bench  # noqa: E402
from protocol import (  # noqa: E402
    MESSAGES, PROBES, apply_gates, day_readout, deployed_night_readout, ideal_corrections, measured_branch,
    readout_probabilities,
)


def angles():
    # Lesson 01: the measurement angles equal_probability uses and the match chance at full visibility.
    rows = []
    for x in (0, 1):
        for y in (0, 1):
            p = lab.equal_probability(x, y, 1.0)
            need_different = x == 1 and y == 1
            # equal_probability is (1 + cos(difference)) / 2 at visibility 1, so the angle comes back from it.
            difference = round(math.degrees(math.acos(2 * p - 1)), 6)
            rows.append({"x": x, "y": y, "difference": difference, "need_different": need_different,
                         "equal": round(p, 6), "win": round(1 - p if need_different else p, 6)})
    return rows


def replay(name):
    totals = lab.load_counts(Path(COURSE, "fixtures", name))
    return lab.summarize(totals)


def tails():
    # Lesson 03: the two reports under a best-classical win chance of 3/4, with the tail lab.py prints.
    out = []
    delft = replay("delft-2015.csv")
    # The short report is lesson 03's own 8 of 10; the long one is the Delft replay.
    for wins, trials in ((8, 10), (delft["wins"], delft["trials"])):
        masses = [math.comb(trials, k) * 0.75 ** k * 0.25 ** (trials - k) for k in range(trials + 1)]
        tail = math.exp(lab.uniform_null(wins, trials))
        if abs(tail - sum(masses[wins:])) > 1e-9:
            raise SystemExit("tail from lab.uniform_null does not match the binomial masses")
        out.append({"wins": wins, "trials": trials, "tail": tail, "masses": masses})
    return out


def name_of(vector):
    # The probe state a branch vector equals up to a global phase, or None.
    for name, (payload, _, _) in PROBES.items():
        overlap = abs(sum(a.conjugate() * b for a, b in zip(payload, vector)))
        if abs(overlap - 1) < 1e-9:
            return name
    return None


def branches():
    # Lesson 04: input plus on each of the four messages, broken and ideal receivers.
    rows = []
    payload = PROBES["plus"][0]
    for bits in MESSAGES:
        _, bob = measured_branch(payload, bits)
        broken = bench.trace("plus", bits, "broken")
        ideal = bench.trace("plus", bits, "ideal")
        if broken["branch_probability"] != ideal["branch_probability"]:
            raise SystemExit("the two receivers see different branch probabilities")
        rows.append({"bits": bits, "bob": name_of(bob), "branch": broken["branch_probability"],
                     "broken_gates": broken["gates"], "broken_pass": broken["pass_probability"],
                     "ideal_gates": ideal["gates"], "ideal_pass": ideal["pass_probability"]})
    pooled = {name: sum(r["branch"] * r[name + "_pass"] for r in rows) for name in ("broken", "ideal")}
    return {"rows": rows, "pooled": pooled}


def sweep_with(readout):
    # bench.sweep with the known-good receiver, but against a fixed readout: the learner repairs
    # teleport/night_shift.py in lesson 05, so the figure reads the frozen deployed night readout instead.
    rows = []
    for state, (payload, basis, expected) in PROBES.items():
        score = 0.0
        for bits in MESSAGES:
            weight, bob = measured_branch(payload, bits)
            received = apply_gates(bob, list(ideal_corrections(*map(int, bits))))
            score += weight * readout_probabilities(received, basis, readout)[expected]
        rows.append({"state": state, "basis": basis, "pass_probability": round(score, 12)})
    return rows


def stations():
    # Lesson 05: the six-state sweep at the day station and the deployed night station, and the night bypass.
    return {"day": sweep_with(day_readout), "night": sweep_with(deployed_night_readout),
            "calibrate": bench.calibrate(list(PROBES), deployed_night_readout)}


print(json.dumps({"angles": angles(), "skewed": replay("skewed-classical.csv"), "tails": tails(),
                  "branches": branches(), "stations": stations()}, allow_nan=False))
