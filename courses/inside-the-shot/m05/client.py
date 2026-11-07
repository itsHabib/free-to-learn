"""Owned requester. Records delivered response chunks without decoding frames."""
import argparse
import os
import sys
from protocol import SCENARIOS, encode, requests
from transport import Observer


def run(scenario):
    trace = Observer("client")
    trace.log("start")
    wire = b"".join(encode(value) for value in requests(scenario))
    # Split an outgoing header across writes. This does not force matching OS reads.
    offset = 0
    for raw in [wire[:1], wire[1:]]:
        trace.write(raw, offset)
        offset += len(raw)
    os.close(1)  # Requests end here. The input pipe remains open for replies.
    trace.log("send_closed", total=offset)
    if scenario == "baseline":
        schedule = [1, 4, 21, 12]
    elif scenario == "transfer":
        schedule = [2, 11, 1, 3, 23]
    elif scenario == "bytewise":
        schedule = [1] * 38
    else:
        schedule = [4096]
    offset = 0
    for requested in schedule:
        raw = trace.read_exact(requested, offset)
        if raw:
            trace.log("delivery", offset=offset, count=len(raw), hex=raw.hex())
            offset += len(raw)
        if len(raw) < requested:
            break
    # Detect extra bytes as well as EOF if the schedule ended exactly at a boundary.
    while True:
        raw = trace.read_exact(4096, offset)
        if not raw:
            break
        trace.log("delivery", offset=offset, count=len(raw), hex=raw.hex())
        offset += len(raw)
    trace.log("eof", total=offset)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", required=True, choices=SCENARIOS)
    try:
        run(parser.parse_args().scenario)
    except (OSError, ValueError) as error:
        print(f"Client failed: {error}", file=sys.stderr)
        sys.exit(2)
