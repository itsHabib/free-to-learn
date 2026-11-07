# Build a bounded parser and a component map

**Outcome:** convert untrusted EDUFW1 bytes into explicitly checked components,
then turn manifest dependencies into a graph whose limits you can explain.
Use the exact field layout in `FORMAT.md` and the contracts in `starter/parser.py`.
This lesson gives a construction strategy, not a completed implementation.

## Stage A — header and table boundaries

The supplied `HEADER` and `ENTRY` are Python `struct.Struct` descriptors. They
encode the 20-byte header and 80-byte entries, not parsing policy. `unpack_from`
can decode from an offset, but first establish that the relevant bytes exist.

Write down the invariants before writing the loop:

1. Input is immutable `bytes`; length is between the header size and 1 MiB.
2. Magic, format version, count, table location and total length match the format.
3. `table_end = 20 + count * 80` is inside the actual byte buffer.
4. For every entry: valid unique name, valid kind, positive version and payload
   size; offset is at/after table end; `size <= file_length - offset`.

Python does not wrap large integers, but slices silently shorten themselves at
end of input. A slice is not a bounds check. Raise `FormatError` for structural
violations so a caller can distinguish bad data from a bug in its own code.
A non-`bytes` API argument instead raises `TypeError`.

Check name padding carefully: `ok\0hidden` is not a valid zero-padded name. Labels
are identifiers, never paths. Reject traversal, absolute paths, non-ASCII bytes,
empty labels and nonzero bytes after the first NUL. Do not normalize malicious
labels into something that looks valid.

## Stage B — ownership of every byte

Two individually in-bounds ranges can still overlap. Reject overlap, gaps and
unclaimed trailing data. There are different valid approaches:

- Sort ranges by start, then advance a cursor through adjacent intervals.
- Track byte coverage and verify that each data byte is covered exactly once.

You need not match an author's implementation. Table order and payload order are
independent; **do not require ascending offsets in the table**. Preserve table
order when constructing `Container.components`, but sort the later inventory by
name for predictable reporting.

Construct `Component(name, kind, version, offset, payload, declared_sha256)` for
each validated table entry. `declared_sha256` is lowercase hex of the 32 raw digest
bytes. Return `Container(data, tuple(components))`. Do not repair damaged files.

## Stage C — make observed inventory, not a second declaration

For every component compute the SHA-256 of its payload bytes. Record it separately
from the declared digest, along with `hash_matches`, name, kind, version, absolute
offset and byte size. The inventory is sorted by name and includes damaged
components. A mismatched hash is not a structural rejection: it is exactly the
kind of evidence the investigator needs to retain.

The checker also supplies a direct `Container` whose raw `data` is not a valid
file. This deliberately asks whether your inventory function uses the component
objects rather than secretly reparsing a memorized fixture.

Do not mutate the container or replace the observed hash with the declared hash.
The provided immutable data classes make accidental mutation harder; they do not
perform the layout validation for you.

## Stage D — dependencies without imaginary execution

The manifest validator supplies unique names and duplicate-free dependency lists.
Your function still has to establish graph completeness and acyclicity:

1. Include every declared component, including isolated nodes.
2. Record every edge, with each node's dependency list sorted.
3. Report missing targets in sorted source/target order.
4. Detect a cycle in **every connected part**, including a self-loop. Report
   `dependency_cycle` once, even if there are multiple cycles.
5. If any error exists, return `dependency_first_order: None`.
6. Otherwise return all nodes once with every dependency before its consumer.

A DFS with active/done sets or a Kahn-style traversal can both work. Avoid mistaking
an already completed shared dependency for a cycle (the diamond test). If using
indegree, distinguish missing targets from cycles; a missing edge is not by itself
a cycle. A graph can contain **both** and both findings must survive.

For independent nodes, several orders are valid. Our checker validates the
precedence constraints rather than requiring a single ordering. Never claim this
ordering proves that hardware followed it: it is a check on declarations only.

## Diagnose and revise

The parser checker runs your selected source on unfamiliar data generated from a
separate encoder, as well as deliberately damaged layouts. Tests include the
largest permitted file, maximum component count and independent order changes.
A failure is a specific observation, not a reason to weaken a bound.

Preserve the first run, make a new copy, revise one invariant, and rerun. Then
inspect actual fixture files through `fwlab.py --parser ...`. That final connection
matters: a passing isolated function is not enough if the CLI still uses a supplied
parser. In this milestone there is no supplied fallback.
