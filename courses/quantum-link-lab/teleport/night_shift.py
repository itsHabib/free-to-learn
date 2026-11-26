"""Calibration settings installed for the night shift. Repair after diagnosis."""


def readout_gates(basis):
    """Rotate the requested basis onto the detector's Z axis, in gate order."""
    if basis == "Z":
        return ()
    if basis == "X":
        return ("H",)
    if basis == "Y":
        return ("S", "H")
    raise ValueError(f"Unknown measurement basis {basis!r}")
