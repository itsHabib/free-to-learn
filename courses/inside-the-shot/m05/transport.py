"""Bounded pipe operations and observation logs shared by the owned targets."""
import json
import os
import sys
import time


class Observer:
    def __init__(self, role):
        self.role = role
        self.sequence = 0

    def log(self, event, **details):
        self.sequence += 1
        row = {"role": self.role, "pid": os.getpid(), "seq": self.sequence,
               "t_ns": time.monotonic_ns(), "event": event, **details}
        print(json.dumps(row, sort_keys=True), file=sys.stderr, flush=True)

    def read_exact(self, size, offset):
        result = bytearray()
        while len(result) < size:
            raw = os.read(0, size - len(result))
            self.log("os_read", offset=offset + len(result), requested=size - len(result),
                     count=len(raw), hex=raw.hex())
            if not raw:
                break
            result.extend(raw)
        return bytes(result)

    def write(self, raw, offset):
        self.log("write_intent", offset=offset, count=len(raw), hex=raw.hex())
        cursor = 0
        while cursor < len(raw):
            written = os.write(1, raw[cursor:])
            if written <= 0:
                raise ValueError("Pipe write did not make progress.")
            cursor += written
        self.log("write_return", offset=offset, count=cursor)
