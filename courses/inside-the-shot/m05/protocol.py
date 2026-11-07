"""Supplied wire envelope; this is transport scaffolding, not an incremental decoder."""
MAX_PAYLOAD = 64
MAX_CHUNK = 4096


def encode(text):
    if not isinstance(text, str):
        raise ValueError("Payload must be text.")
    try:
        raw = text.encode("ascii")
    except UnicodeEncodeError as error:
        raise ValueError("Payload must be printable ASCII.") from error
    if not 1 <= len(raw) <= MAX_PAYLOAD or any(b < 32 or b > 126 for b in raw):
        raise ValueError("Payload must contain 1..64 printable ASCII bytes.")
    return len(raw).to_bytes(2, "big") + raw


def requests(scenario):
    if scenario == "single":
        return ["north:7"]
    return ["north:7", "east:12", "west:257" if scenario == "transfer" else "west:0"]


SCENARIOS = ("baseline", "transfer", "single", "combined", "bytewise",
             "truncated", "malformed", "zero", "oversize")
