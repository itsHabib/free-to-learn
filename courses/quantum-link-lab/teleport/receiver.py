"""Bob's deployed firmware. Repair this function, then run learner_checks.py."""


def corrections(phase, flip):
    """Return Bob's gate names in the order the receiver should apply them."""
    commands = []
    if flip:
        commands.append("X")
    return tuple(commands)
