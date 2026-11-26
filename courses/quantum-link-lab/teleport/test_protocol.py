"""Reference tests for the simulator; learner edits have their own check scripts."""

import json
import math
from pathlib import Path
import subprocess
import sys
import unittest

from bench import calibrate, sweep, trace
from protocol import (
    MESSAGES, PROBES, apply_gates, day_readout, deployed_night_readout,
    ideal_corrections, measured_branch,
)


class ProtocolTests(unittest.TestCase):
    def test_bell_measurement_preserves_arbitrary_input(self):
        # Neither of these complex amplitudes is a Pauli eigenstate.
        payload = (math.sqrt(.3), math.sqrt(.7) * complex(.6, .8))
        weights = []
        for bits in MESSAGES:
            with self.subTest(bits=bits):
                weight, bob = measured_branch(payload, bits)
                weights.append(weight)
                restored = apply_gates(bob, ideal_corrections(*map(int, bits)))
                overlap = sum(complex(a).conjugate() * b for a, b in zip(payload, restored))
                self.assertAlmostEqual(abs(overlap) ** 2, 1)
                self.assertAlmostEqual(weight, .25)
        self.assertAlmostEqual(sum(weights), 1)

    def test_receiver_without_bits_sees_unbiased_state(self):
        for name, (payload, _, _) in PROBES.items():
            with self.subTest(name=name):
                p0 = coherence = 0
                for bits in MESSAGES:
                    weight, (a, b) = measured_branch(payload, bits)
                    p0 += weight * abs(a) ** 2
                    coherence += weight * a * complex(b).conjugate()
                self.assertAlmostEqual(p0, .5)
                self.assertAlmostEqual(abs(coherence), 0)

    def test_each_fresh_probe_each_message_after_correction(self):
        for state in PROBES:
            for bits in MESSAGES:
                with self.subTest(state=state, bits=bits):
                    case = trace(state, bits, "ideal", "day")
                    self.assertEqual(case["bits"], bits)
                    self.assertEqual(case["pass_probability"], 1)
                    self.assertEqual(sum(case["readout_probabilities"]), 1)

    def test_separate_payload_and_pair_bits(self):
        self.assertEqual(trace("plus", "10", "ideal")["gates"], ["Z"])
        self.assertEqual(trace("plus", "01", "ideal")["gates"], ["X"])

    def test_missing_phase_correction_is_invisible_to_computational_basis(self):
        results = {r["state"]: r["pass_probability"] for r in sweep(PROBES, "broken", "day")}
        self.assertEqual(results, {"zero": 1, "one": 1, "plus": .5, "minus": .5,
                                   "plus-i": .5, "minus-i": .5})
        for bits in MESSAGES:
            with self.subTest(bits=bits):
                self.assertEqual(trace("plus", bits)["pass_probability"], float(bits[0] == "0"))

    def test_calibration_separates_station_fault_from_teleportation(self):
        day = calibrate(PROBES, day_readout)
        self.assertTrue(all(row["pass_probability"] == 1 for row in day))
        frozen = calibrate(PROBES, deployed_night_readout)
        for row in frozen:
            with self.subTest(row=row):
                self.assertEqual(row["pass_probability"], float(row["basis"] != "Y"))

    def test_local_cli_machine_output(self):
        path = Path(__file__).with_name("bench.py")
        result = subprocess.run([sys.executable, str(path), "trace", "--receiver", "broken",
                                 "--state", "plus", "--bits", "10", "--json"],
                                capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        self.assertEqual(data["model"], "exact local simulation")
        self.assertEqual(data["branch_probability"], .25)
        self.assertEqual(data["readout_probabilities"], [0, 1])


if __name__ == "__main__":
    unittest.main()
