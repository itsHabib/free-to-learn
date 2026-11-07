# Original recoverable single-writer store: behavioral contract v1.1

Learner contract v1.1, adopted 2026-10-27. This successor clarifies malformed fixed-field prefixes; the wire format and process-interruption model are unchanged. Implement the storage behavior defined here. The byte format and fault model are original to this course, with no dependency on another course.

## Scope, acknowledgement and crash model

One writer owns a local directory. Keys and values are UTF-8 strings. Reads return a string or null for a missing key. Multi-process locking, concurrent writers, replication and native database compatibility are out of scope. The intended usable artifact is a local persistent string store, callable by CLI or imported by a learner application.

The implemented deterministic fault adapter models **process interruption**: completed file mutations remain visible; an interrupted append can leave any prefix of that append; a rename replaces a whole file atomically. It does not simulate lost operating-system caches, reordered writes, filesystem metadata loss, power removal or faulty storage hardware. A complete checksum-corrupt frame is corruption and fails closed, rather than being treated as a torn suffix. Do not silently broaden this model to power-loss durability.

The real file adapter exposes fsync on the file and directory. Append acknowledgement occurs only after all intended bytes were written and file sync returned successfully. A crash before the caller receives acknowledgement can leave an operation either absent or committed. A failed writer object is poisoned and must be reopened. The course makes no universal power-loss claim and will report actual process/fault tests separately from platform assumptions.

## Operation and record interface

Public logical operations: `put(key,value)`, `delete(key)`, `get(key)`, `entries()` (key-sorted pairs), `batch(operations)`, `compact()`, `close()`. Batch operations are `{type:"put",key,value}` or `{type:"del",key}`. Last operation for a repeated key wins. Entries are detached values. Single put/delete are one-operation batches.

Physical records are `{type:"put"|"del"|"commit",tx,key,value}`. tx is integer 1 through 4294967295. A put has nonempty key and string value; del has key and value=null; commit has key=null and value=null. Key length is at most 1024 UTF-8 bytes; value length at most 65536 UTF-8 bytes. Batch records are contiguous, share tx and end with exactly one commit. Transaction ids strictly increase between committed batches. Empty batches may consist of just a commit. Interleaved/repeated transaction ids are corruption.

Only committed batches affect recovered state. A complete uncommitted operation suffix and an incomplete final frame are discarded. The recovery boundary is immediately after the last complete commit, not merely the last complete record. Recovery propagates a detectable malformed-prefix error, and opening such a log must leave its bytes untouched. Before a reopened store appends anything, it truncates the log to that committed boundary and synchronizes the repair.

## Binary frame

All integers are unsigned big-endian. Header: ASCII magic IVY1 (4 bytes), body length (u32, 4 bytes), checksum (u32, 4 bytes). Body: opcode (u8: put=1, del=2, commit=3), tx (u32), key byte length (u16), value byte length (u32), key UTF-8 bytes, value UTF-8 bytes. Fixed body fields occupy 11 bytes. Body length must equal those fixed fields plus both byte strings and must be 11–70000. Commit has zero key/value lengths; del has zero value length.

Checksum is FNV-1a over body bytes: initialize uint32 2166136261; for each byte xor then multiply by 16777619 modulo 2^32. It covers no header bytes and detects selected accidental corruption; it is not authentication. It cannot detect every header change or distinguish every damaged suffix from a genuine torn write. Invalid UTF-8 is corruption.

`encodeRecord(record)` returns Buffer. `decodeRecord(buffer,offset=0)` returns `{record,bytes}` for a complete valid frame, null for a structurally consistent incomplete header/body at an otherwise valid offset, and throws for complete malformed/corrupt data or invalid invocation. Once all 11 fixed body bytes are present, compare their implied length (11 plus key and value byte lengths) with the outer body length before waiting for the claimed end. A disagreement is malformed and must throw even if that claimed end is past EOF. With fewer fixed bytes, do not read absent fields or infer that disagreement. This narrow prefix rule does not require earlier opcode/transaction/unused-field validation of an incomplete frame. It must not scan past garbage seeking a later magic. `encodeBatch(tx,operations)` returns concatenated operation frames and a final commit frame.

`indexRecords(records)` is an early raw-index exercise: last put/del wins and commits do nothing. It intentionally has no atomicity claim. `recover(buffer)` is the later committed-index operation and returns `{entries,validBytes,discardedBytes,maxTx}`; maxTx is the last committed transaction id (0 if none).

## Supplied disk boundary and compaction

`openStore(disk)` uses a supplied adapter. Adapter primitives: `read(name)->Buffer`, `append(name,bytes)->writtenCount`, `sync(name)`, `truncate(name,length)`, `rename(from,to)`, `syncDir()`. Only names store.log and compact.tmp are permitted. Append may make a positive short write; caller must loop until all bytes are written and reject zero/invalid progress.

Compaction writes the current committed snapshot as a new transaction into compact.tmp, synchronizes that file, atomically renames it onto store.log, then synchronizes the directory. It never truncates/deletes store.log before the replacement is ready. Orphan compact.tmp is ignored on reopen. Any model-level crash during compaction must retain the same logical committed entries in either old or new log. No reader is concurrent during replacement.

A fault trace may stop before/after each primitive or interrupt append after a specified byte prefix. Distinguish a complete checksum corruption from truncation. Identify which writes were acknowledged before the stop, allow an unacknowledged batch to be wholly absent or present, and reject partial batch visibility. Useful independent fixtures include repeated-key/delete batches, torn repair followed by append, empty-store compaction, short writes, failed-writer reuse and special string keys such as __proto__.

This contract freezes behavior, not correctness, independent acceptance or learning claims. Full platform/power-loss testing remains unperformed.
