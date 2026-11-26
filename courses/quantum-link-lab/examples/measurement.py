"""Print one of the four two-qubit measurement circuits as OpenQASM 2."""

import argparse


# region: basis
def circuit(x, y):
    """x, y are the two stations' measurement settings, each 0 or 1."""
    rotate_alice = ("0", "-pi/2")[x]
    rotate_bob = ("-pi/4", "pi/4")[y]
    return f"""OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
ry({rotate_alice}) q[0];
ry({rotate_bob}) q[1];
measure q -> c;"""


# endregion: basis

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("x", type=int, choices=(0, 1))
    parser.add_argument("y", type=int, choices=(0, 1))
    args = parser.parse_args()
    print(circuit(args.x, args.y))
