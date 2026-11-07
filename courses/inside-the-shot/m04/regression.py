"""Add assertions from your saved predictions, then run python3 regression.py."""
import unittest
import parser
class ParserRegression(unittest.TestCase):
    def test_minimal_preserves_fields(self):
        raise NotImplementedError('Assert the full expected dictionary for your minimal.trail')
    def test_malformed_is_rejected(self):
        raise NotImplementedError('Assert ValueError for truncation and an inconsistent declaration')
if __name__=='__main__': unittest.main()
