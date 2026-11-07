# EDUFW1 v1 format — original teaching format

All integer fields are unsigned little-endian. Offsets are absolute from byte 0.
Strings are ASCII, with zero padding; there may be no nonzero bytes after the
first NUL. No path, compression, code execution or embedded archive semantics.
Limits: file ≤ 1 MiB, 1–32 components, manifest/policy JSON ≤ 128 KiB.

## Header: 20 bytes (`<8sHHII`)

| Offset | Length | Field | Rule |
|---|---:|---|---|
| 0 | 8 | magic | `45 44 55 46 57 31 00 00` (`EDUFW1\0\0`) |
| 8 | 2 | format version | exactly 1 |
| 10 | 2 | component count | 1..32 |
| 12 | 4 | table offset | exactly 20 |
| 16 | 4 | total size | exactly the actual file length |

## Each table entry: 80 bytes (`<24s12sIII32s`)

| Relative offset | Length | Field | Rule |
|---|---:|---|---|
| 0 | 24 | name | unique `[a-z][a-z0-9_-]{0,23}` |
| 24 | 12 | kind | `[a-z][a-z0-9_-]{0,11}` |
| 36 | 4 | payload offset | at or after end of complete table |
| 40 | 4 | payload size | positive; range wholly inside file |
| 44 | 4 | component version | positive uint32 |
| 48 | 32 | declared SHA-256 | raw digest of payload bytes |

Payload ranges must cover every byte after the table exactly once: no overlap,
gaps or trailing unclaimed bytes. Table order and physical payload order need
not be alphabetical. A declared hash mismatch is recorded separately from format
validity, because a forensic inventory should still identify damaged components.

A parser must bound the **table** before iterating entries and bound each payload
before slicing it. Integer arithmetic in Python does not wrap, but a size check
still matters: Python slices silently truncate out-of-range requests. We compare
`size <= len(data) - offset` after proving the offset is in range.

## JSON manifest and policy

See `fixtures/release-1.json` and `fixtures/policy.json` for complete examples.
Unknown/missing fields, duplicate JSON keys, non-finite numbers, booleans where
integers are required, invalid hashes, duplicate component names/dependencies,
and oversized input are rejected. A missing dependency or cycle is a manifest
consistency finding rather than an accidental recursion error.

The manifest declares format, release number, whole-container digest, and an
exact component inventory (name, kind, version, payload digest, `requires`). All
referenced dependencies must exist and the declaration must be acyclic. The
reported dependency-first order is **not evidence of actual execution**.

Policy has schema 1, a positive `minimum_release`, a list of required component
names and scalar `required_config` values. The `config` component must have kind
`config`; its bytes must parse as a JSON object. Required values are compared
with both their types and values (`true` is not numeric `1`). Extra configuration
fields are allowed: this policy is a required-value policy, not a closed schema.
A release below the floor is a local policy finding, not proof of cryptographic
anti-rollback enforcement.

The provided manifest, fixture index and policy are local teaching inputs. An
attacker who can replace a payload **and** its hashes can make them consistent.
None is signed; no trusted key, certificate, digest acquisition channel or vendor
identity is established by this slice.
