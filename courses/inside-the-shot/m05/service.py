"""Owned synchronous request service. Leave closed until your first attempt is saved."""
import argparse
import os
import sys
from protocol import SCENARIOS, encode
from transport import Observer


def run(scenario):
    trace = Observer("service")
    trace.log("start")
    replies = []
    offset = 0
    while True:
        header = trace.read_exact(2, offset)
        offset += len(header)
        if not header:
            break
        if len(header) != 2:
            raise ValueError("Request ended inside its header.")
        length = int.from_bytes(header, "big")
        if not 1 <= length <= 64:
            raise ValueError("Request length must be 1..64.")
        body = trace.read_exact(length, offset)
        offset += len(body)
        if len(body) != length or any(b < 32 or b > 126 for b in body):
            raise ValueError("Invalid or incomplete request payload.")
        text = body.decode("ascii")
        trace.log("request", end_offset=offset, payload=text)
        replies.append(encode("ACK " + text))
    if scenario == "truncated":
        replies[-1] = replies[-1][:-1]
    if scenario == "malformed":
        replies = [b"\x00\x02\xffA"]
    if scenario == "zero":
        replies = [b"\x00\x00"]
    if scenario == "oversize":
        replies = [b"\x00\x41"]
    writes = replies[:1] + ([b"".join(replies[1:])] if len(replies) > 1 else [])
    if scenario in ("combined", "bytewise", "transfer"):
        writes = [b"".join(replies)]
    offset = 0
    for raw in writes:
        trace.write(raw, offset)
        offset += len(raw)
    os.close(1)
    trace.log("send_closed", total=offset)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", required=True, choices=SCENARIOS)
    try:
        run(parser.parse_args().scenario)
    except (OSError, ValueError) as error:
        print(f"Service failed: {error}", file=sys.stderr)
        sys.exit(2)
