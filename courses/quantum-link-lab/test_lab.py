import itertools
import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import lab


HERE = Path(__file__).resolve().parent


def run(*args):
    return subprocess.run(
        [sys.executable, str(HERE / "lab.py"), *args], capture_output=True, text=True,
        check=False, cwd=HERE,
    )


class LabTests(unittest.TestCase):
    def test_exhaustive_local_strategies(self):
        # Both stations decide their two possible answers in advance.
        scores = []
        for a0, a1, b0, b1 in itertools.product((0, 1), repeat=4):
            scores.append(sum(lab.wins(x, y, (a0, a1)[x], (b0, b1)[y])
                              for x, y in lab.SETTINGS))
        self.assertEqual(set(scores), {1, 3})
        self.assertEqual(max(scores) / 4, .75)

    def test_published_results(self):
        totals = lab.load_counts(lab.DELFT)
        self.assertEqual(list(totals.values()), [[46, 7], [63, 16], [46, 16], [10, 41]])
        result = lab.summarize(totals)
        self.assertEqual((result["wins"], result["trials"]), (196, 245))
        self.assertAlmostEqual(result["s"], 2.422, places=3)
        self.assertNotAlmostEqual(8 * result["win_rate"] - 4, result["s"])

    def test_skewed_settings_beat_naive_raw_win_rate(self):
        totals = lab.load_counts(HERE / "fixtures/skewed-classical.csv")
        result = lab.summarize(totals)
        self.assertEqual(result["win_rate"], .97)
        self.assertEqual(result["s"], 2)

    def test_missing_setting_is_explained(self):
        process = run("replay", "fixtures/missing-setting.csv")
        self.assertEqual(process.returncode, 2)
        self.assertFalse(process.stdout)
        self.assertIn("Missing trials for setting 11", process.stderr)

    def test_malformed_capture_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.csv"
            for text in ("x,y,equal,opposite\n0,2,3,4\n",
                         "x,y,equal,opposite\n0,0,-1,1\n",
                         "x,y,a,b,count\n0,0,0,1\n"):
                path.write_text(text)
                with self.assertRaisesRegex(ValueError, "line 2"):
                    lab.load_counts(path)

    def test_ideal_angles_and_white_noise(self):
        for x, y in lab.SETTINGS:
            sign = -1 if x == y == 1 else 1
            for visibility in (0, .5, 1):
                p_same = lab.equal_probability(x, y, visibility)
                self.assertAlmostEqual(2 * p_same - 1, visibility * sign / math.sqrt(2))

    def test_seeded_source_and_negative_control(self):
        for model, visibility, expected_s in (
            ("classical", 1, 2), ("entangled", 1, 2 * math.sqrt(2)), ("entangled", 0, 0),
        ):
            first = lab.simulate(model, 12000, 912, visibility)
            self.assertEqual(first, lab.simulate(model, 12000, 912, visibility))
            self.assertAlmostEqual(lab.summarize(first)["s"], expected_s, delta=.13)

    def test_bad_simulation_arguments_fail_clearly(self):
        for args in (("--model", "entangled", "--trials", "0"),
                     ("--model", "classical", "--visibility", ".5"),
                     ("--model", "entangled", "--visibility", "nan")):
            result = run("simulate", *args)
            self.assertEqual(result.returncode, 2)
            self.assertIn("Lab:", result.stderr)

    def test_demo_and_machine_readable_replay(self):
        result = run("demo")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Recorded experiment | Delft 2015", result.stdout)
        self.assertIn("196/245", result.stdout)
        payload = run("replay", "fixtures/skewed-classical.csv", "--json")
        self.assertEqual(json.loads(payload.stdout)["s"], 2)

    def test_uniform_local_bound_and_underflow(self):
        # Independent small-n enumerations and an all-win tail with known log.
        self.assertEqual(lab.uniform_null(0, 10), 0)
        self.assertAlmostEqual(math.exp(lab.uniform_null(8, 10)), .5255928039550781)
        self.assertAlmostEqual(math.exp(lab.uniform_null(196, 245)), .03907767138965)
        report = lab.null_report(10000, 10000)
        self.assertIsNone(report["p_value"])
        self.assertAlmostEqual(report["log_p_value"], 10000 * math.log(.75))
        with self.assertRaisesRegex(ValueError, "100000"):
            lab.uniform_null(8, 100001)

    def test_p_value_is_opt_in_and_modified_reference_is_generic(self):
        fixture = "fixtures/delft-2015.csv"
        plain = json.loads(run("replay", fixture, "--json").stdout)
        checked = json.loads(run("replay", fixture, "--uniform-null", "--json").stdout)
        self.assertNotIn("uniform_null", plain)
        self.assertAlmostEqual(checked["uniform_null"]["p_value"], .03907767138965)
        self.assertIn("independent", checked["uniform_null"]["assumptions"])
        changed = lab.load_counts(lab.DELFT)
        changed[0, 0][0] += 1
        self.assertTrue(lab.replay_label(lab.DELFT, changed).startswith("CSV input"))

    def test_report_uses_all_three_learner_functions(self):
        one_setting_each = {key: [1, 0] for key in lab.SETTINGS}
        def count_even_when_opposite(x, y, a, b):
            return True
        def constant_correlation(equal, total):
            return .5
        def sum_correlations(by_setting):
            return sum(by_setting.values())
        result = lab.summarize(one_setting_each, count_even_when_opposite,
                               constant_correlation, sum_correlations)
        self.assertEqual(result["wins"], 4)
        self.assertEqual(result["s"], 2)
        self.assertTrue(all(row["correlation"] == .5 for row in result["settings"]))


class Figures(unittest.TestCase):
    # The figures are drawn by Node; a Python-only learner skips this check.
    @unittest.skipUnless(__import__("shutil").which("node"), "node is not installed")
    def test_lesson_figures_match_what_the_course_code_draws(self):
        here = Path(__file__).resolve().parent
        result = subprocess.run(["node", "tools/figures.mjs", "--check"], cwd=here,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
