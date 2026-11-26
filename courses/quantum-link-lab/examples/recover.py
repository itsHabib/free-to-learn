"""Worked receiver policy for the teleportation bench."""


# region: receiver
def corrections(phase, flip):
    gates = []
    if flip:
        gates.append("X")
    if phase:
        gates.append("Z")
    return tuple(gates)


# endregion: receiver
