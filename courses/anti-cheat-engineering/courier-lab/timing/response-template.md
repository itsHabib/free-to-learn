# My timing investigation

Help used (also declare this in --assistance):

## Predictions before the first check

1. At x=1000, an east input arrives when the owner is at tick 3, although sentAtMs says 0. Name its four eligible movement ticks and x after them:
2. An east input was admitted at tick 0 at x=1000. At tick 3, a west retry repeats that sequence. What changes immediately, at tick 4, and at tick 5?
3. A sample arrives at 826.5 ms after a start of 0. Name processed ticks, dropped ticks and retained remainder. What happens at a later sample of 850 ms?
4. An east input was admitted at tick 0 at x=1000, and the connection disappears after tick 1. Predict the old actor's position through expiry. Distinguish a resume from a fresh join:

## Investigation evidence

Record a checkpoint label, your predicted state, the observed state and the responsible rule. Keep the original answers above.

## Repair after feedback

Append what changed, why it changed, assistance used and the next result:

## Transfer: reservation deadline

A server holds a seat until owner-monotonic time 1000 ms, rather than for a count of processed ticks. Its callbacks pause from 900 to 1200 ms and process at most two queued jobs when they resume. At 1200 ms a client retries a request it claims to have sent at 950 ms; a second client requests the same seat. Explain why the game's four-processed-tick rule cannot decide this reservation. Which owner receipt and prior-result evidence distinguish a retry of an already accepted reservation from a new late request? What must recovery establish if the process restarted and the old monotonic clock no longer has the same origin?

## Limits

Which part of this investigation used real engine/clock code? Which connection behavior was modelled? Why does a long wall-time pause not establish ten game ticks or prove a malicious client?
