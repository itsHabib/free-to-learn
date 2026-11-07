"""Original inert test-data encoder, not a parser or graph implementation."""
from hashlib import sha256
import struct

H = struct.Struct("<8sHHII")
E = struct.Struct("<24s12sIII32s")


def item(name, payload=b"Inert educational data.\n", kind="description", version=1):
    return dict(name=name, payload=payload, kind=kind, version=version)


def encode(items, table_order=None, payload_order=None):
    table_order = list(range(len(items))) if table_order is None else table_order
    payload_order = list(range(len(items))) if payload_order is None else payload_order
    cursor = H.size + len(items)*E.size
    offsets, payloads = {}, []
    for index in payload_order:
        offsets[index] = cursor
        payloads.append(items[index]["payload"])
        cursor += len(items[index]["payload"])
    entries, expected = [], []
    for index in table_order:
        obj = items[index]
        digest = sha256(obj["payload"]).hexdigest()
        entries.append(E.pack(obj["name"].encode(), obj["kind"].encode(), offsets[index], len(obj["payload"]), obj["version"], bytes.fromhex(digest)))
        expected.append(dict(name=obj["name"], kind=obj["kind"], version=obj["version"], offset=offsets[index], payload=obj["payload"], declared_sha256=digest))
    return H.pack(b"EDUFW1\0\0", 1, len(items), H.size, cursor) + b"".join(entries+payloads), expected


def inventory(expected):
    return [dict(name=c["name"], kind=c["kind"], version=c["version"], offset=c["offset"], size=len(c["payload"]),
                 sha256=sha256(c["payload"]).hexdigest(), declared_sha256=c["declared_sha256"],
                 hash_matches=sha256(c["payload"]).hexdigest() == c["declared_sha256"])
            for c in sorted(expected, key=lambda item: item["name"])]


def mutation(data, offset, fmt, value):
    changed = bytearray(data)
    struct.pack_into(fmt, changed, offset, value)
    return bytes(changed)
