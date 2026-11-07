# Revisit the stream after the capstone

Complete this short review after M7, using the M5 decoder you wrote earlier. It returns to framing and timing after other work. It is additional practice, not evidence of long-term retention or an unassisted examination.

`cumulative-process-trace.json` records a different pair of real local processes and new payloads. The wire format is M5's two-byte big-endian length followed by printable ASCII. The processes ran once to create this fixed trace. Its application delivery chunks are prescribed by the sender/receiver exercise; the `os_read` entries are actual observations. Do not invent a live run from this saved file.

From the complete course package's top-level folder, inspect it with the earlier tool:

```sh
python3 m05/view_trace.py cumulative-process-trace.json --detail
```

Before running your decoder or opening the feedback page, write `stream-review.md` with:

1. Both frame start/end offsets and payload lengths, derived from the bytes.
2. What your decoder should return after each of the three application deliveries, and what remains buffered at each step.
3. Two actual OS-read boundaries and why neither the requested read size nor a sender write defines a frame.
4. One within-process event-order claim supported by sequence numbers, and one cross-process timing claim these timestamps cannot establish.

Save this as a new M7 handoff record. Copy your M7 response template to `review-response.json`, retain its question version, put your predictions in `predictions`, commands in `reproduction_commands`, and uncertainties in `limitations`. Keep the full explanation in `stream-review.md` and use your actual assistance category. The two `--evidence` arguments preserve the exact prompt and saved trace as part of this new record:

```sh
python3 m07/notebook.py record --workspace work/stream-review --stage handoff --response review-response.json --manifest m07/manifest.json --assistance none --artifact stream-review.md --evidence cumulative-review.md --evidence cumulative-process-trace.json
```

Now run your own saved decoder and compare its results with your prediction:

```sh
python3 m05/decode_trace.py m05/decoder.py cumulative-process-trace.json
```

Open [cumulative-feedback.md](cumulative-feedback.md) afterward. Save a new response with the observed results, any repair and the help used. A working decoder alone does not establish that your timing explanation is sound. Keep the first record unchanged and include both records in your final export.

If the top-level `m05/decoder.py` is still the untouched starter, restore your own M5 solution from your preserved project first. Do not substitute the author's solution and label it your earlier work.
