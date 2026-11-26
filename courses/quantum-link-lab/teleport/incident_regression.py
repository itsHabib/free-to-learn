"""Author a calibration regression, then run this file against both controls."""

from bench import calibrate
from night_shift import readout_gates
from protocol import deployed_night_readout


def check(probe):
    """Each probe returns the probability of reading back the prepared state."""
    assert probe("zero") > 0.999, "Direct zero preparation should read back correctly"
    # Add your regression for the incident here.


def probe_at(readout):
    def probe(state):
        return calibrate([state], readout)[0]["pass_probability"]
    return probe


def main():
    if not __debug__:
        raise SystemExit("Run with ordinary python3 so that assertions are enabled.")
    try:
        check(probe_at(readout_gates))
    except AssertionError as error:
        raise SystemExit(f"Current station fails your regression: {error}") from None
    print("Current station passes your regression.")
    try:
        check(probe_at(deployed_night_readout))
    except AssertionError as error:
        print(f"Original incident fails your regression: {error}")
        return
    raise SystemExit("Original incident also passes. Choose a probe that exposes the fault.")


if __name__ == "__main__":
    main()
