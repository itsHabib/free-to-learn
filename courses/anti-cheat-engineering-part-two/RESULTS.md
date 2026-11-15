# Results on the worked solution

Read this after lesson 17: it gives away answers the lessons ask you to predict.

Every number here is printed by a lab command on the course's worked solution and
re-derived by an author tool. Your own numbers depend on your code. The players are
models and the network is simulated, so none of this is a measurement of people.

## What the server sends

The full view averages 1,054 bytes a message and the drawn view 296, as `node lab.mjs leaks project --view full` and `node lab.mjs leaks project` count them.

## What hiding buys

The searching client hits 100.0% of its shots with the full view at every latency, and
65.2% with the drawn view at 50 ms each way (54.0% at 400 ms). An expert hits 22.5% with
the full view and 23.1% with the drawn view at 50 ms, a difference within noise; at 400 ms,
17.8% and 14.6% (`node lab.mjs cost`).

## What detection can do

The worked detector, its threshold set on 1,000 legal dev sessions for one false flag in
500, flags all 200 held-out searcher sessions and 1 of 2,000 held-out legal sessions: 95.3%
of its flags would be cheats if one session in 100 were a cheat (`node lab.mjs heldout`).
It flags 22 of 60 sessions of the searcher that times its shots like an expert, and none of
the one that also misses on purpose, which hits 31.1% against the dev experts' 27.5%
(`node lab.mjs recordings`, `features`).

## What rewind costs

Judging every courier press at "now" refuses 20.77% of honest presses. A window of 7 ticks
refuses 0.24% and lets the client that delays its pongs through on 20,123 of its 22,211
presses; a window of 8 refuses none and lets it through on 22,283 of 22,311. The client
that only claims to be late gets nothing through at any window (`node lab.mjs sweep`).

## What a crash does to a naive trade

A crash after each of its four writes gives 11 violations: an item held twice, 40 coins
lost, a sale half made. The journal and recovery give none at the six crash points of the
worked trade (`node lab.mjs crash`).

## The scoreboard

On the worked solution, with window 7, all 9 budgets are met. The six legal models play
3,000 sessions: none has an input refused except one jitter session's stale message, 3 are
flagged, and experts hit 25.9%. The searching client hits 64.8% against the drawn view, with
all 200 of its sessions flagged (`node lab.mjs scoreboard`).
