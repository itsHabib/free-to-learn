"""Run after editing receiver.py. Uses the known-good detector."""

import unittest

from bench import trace
from protocol import MESSAGES, PROBES


class LearnerReceiver(unittest.TestCase):
    def test_delivery_on_all_probes_and_messages(self):
        for state in PROBES:
            for bits in MESSAGES:
                with self.subTest(state=state, bits=bits):
                    case = trace(state, bits, "learner", "day")
                    self.assertAlmostEqual(case["pass_probability"], 1.0)


if __name__ == "__main__":
    unittest.main()
