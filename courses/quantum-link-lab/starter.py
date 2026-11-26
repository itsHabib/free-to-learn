"""Your Bell link report. Implement one function and run its check at a time."""
from lab import main


def wins(x, y, a, b):
    """Return True when this pair of outputs meets the two settings' rule."""
    raise NotImplementedError("Implement wins in starter.py, then run python3 -m unittest learner_checks.Game")


def correlation(equal, total):
    """Return the mean signed score within one setting. Reject an empty group."""
    raise NotImplementedError("Implement correlation in starter.py, then run python3 -m unittest learner_checks.Correlation")


def chsh(by_setting):
    """Combine the four setting correlations into the signed Bell score S."""
    raise NotImplementedError("Implement chsh in starter.py, then run python3 -m unittest learner_checks.Bell")


if __name__ == "__main__":
    main(wins, correlation, chsh)
