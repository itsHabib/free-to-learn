"""Exact three-qubit teleportation with wire order payload, Alice's half, Bob's half."""

from math import sqrt

R = 1 / sqrt(2)
# State amplitudes, verifier basis, expected detector output.
PROBES = {
    "zero": ((1, 0), "Z", 0),
    "one": ((0, 1), "Z", 1),
    "plus": ((R, R), "X", 0),
    "minus": ((R, -R), "X", 1),
    "plus-i": ((R, 1j * R), "Y", 0),
    "minus-i": ((R, -1j * R), "Y", 1),
}
MESSAGES = ("00", "01", "10", "11")


def measured_branch(payload, bits):
    """Project Alice's two measured wires; return probability and Bob's qubit."""
    if bits not in MESSAGES:
        raise ValueError("Alice's message must be 00, 01, 10, or 11.")
    a, b = payload
    # Tensor the payload with (|00> + |11>) / sqrt(2).
    joint = [R * a, 0, 0, R * a, R * b, 0, 0, R * b]
    # CNOT flips the middle wire only in the payload=1 half.
    joint[4:8] = joint[6:8] + joint[4:6]
    # The Hadamard on the payload mixes corresponding amplitudes across halves.
    low, high = joint[:4], joint[4:]
    after_h = [R * (u + v) for u, v in zip(low, high)]
    after_h.extend(R * (u - v) for u, v in zip(low, high))
    # Alice reads the first two wires. The last wire is still a qubit.
    offset = 2 * int(bits, 2)
    amplitudes = after_h[offset:offset + 2]
    weight = sum(abs(c) ** 2 for c in amplitudes)
    return weight, tuple(c / sqrt(weight) for c in amplitudes)


def apply_gates(qubit, gates):
    """Apply the named single-qubit gates in time order."""
    a, b = qubit
    for gate in gates:
        if gate == "X":
            a, b = b, a
        elif gate == "Z":
            b = -b
        elif gate == "H":
            a, b = R * (a + b), R * (a - b)
        elif gate == "S":
            b *= 1j
        elif gate == "Sdg":
            b *= -1j
        else:
            raise ValueError(f"Unknown gate {gate!r}.")
    return a, b


def ideal_corrections(phase, flip):
    commands = []
    if flip:
        commands.append("X")
    if phase:
        commands.append("Z")
    return tuple(commands)


def deployed_corrections(phase, flip):
    return ("X",) if flip else ()


def day_readout(basis):
    return {"Z": (), "X": ("H",), "Y": ("Sdg", "H")}[basis]


def deployed_night_readout(basis):
    """Frozen incident control, independent of learner edits."""
    return {"Z": (), "X": ("H",), "Y": ("S", "H")}[basis]


def readout_probabilities(qubit, basis, readout):
    measured = apply_gates(qubit, readout(basis))
    return [abs(c) ** 2 for c in measured]
