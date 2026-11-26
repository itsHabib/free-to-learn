"""Practice checks. Run them individually while building starter.py."""
import unittest

import starter


class Game(unittest.TestCase):
    def test_rule_over_all_settings_and_both_station_outputs(self):
        self.assertTrue(starter.wins(0, 0, 0, 0))
        for x, y in ((0, 0), (0, 1), (1, 0), (1, 1)):
            for a, b in ((0, 0), (1, 1), (1, 0), (0, 1)):
                with self.subTest(settings=(x, y), outputs=(a, b)):
                    want = (a != b) if (x, y) == (1, 1) else (a == b)
                    self.assertEqual(starter.wins(x, y, a, b), want)


class Correlation(unittest.TestCase):
    def test_equal_and_opposite_count_with_opposite_signs(self):
        for equal, total, expected in ((0, 4, -1), (3, 4, .5), (4, 4, 1)):
            self.assertEqual(starter.correlation(equal, total), expected)

    def test_empty_group(self):
        with self.assertRaises(ValueError):
            starter.correlation(0, 0)


class Bell(unittest.TestCase):
    def test_all_four_settings_get_one_vote(self):
        self.assertAlmostEqual(starter.chsh({(0, 0): 0.25, (0, 1): -0.3,
                                            (1, 0): 0.7, (1, 1): -0.5}), 1.15)
