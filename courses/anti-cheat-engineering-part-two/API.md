# API

What the course supplies, what you write, and the exact contract of each function you
write. The checks test these contracts and nothing else.

Your project folder holds your files, laid out like `starter/`:

```
server/admission.mjs   unit 12   parseInput, admit
server/recorder.mjs    unit 12   createRecorder, replay
server/view.mjs        unit 13   drawnView
server/leaks.mjs       unit 13   findLeaks
detect/features.mjs    unit 14   features
detect/detector.mjs    unit 14   score, chooseThreshold, count, evaluate, precisionAt
detect/settings.json   unit 14   your frozen settings
courier/rewind.mjs     unit 15   positionAt, measureRtt, judgeInteract, tally, pickWindow
trade/trade.mjs        unit 16   trade, recover
capstone/defence.json  unit 17   your rewind window
```

Every function in `starter/` throws `not written yet` until you write it. The starter's two
JSON files hold a `"note"` that says `not written yet`. Delete it when you fill the file in,
because the checks and the lab treat a JSON file that still holds those words as not written.

Each unit's checks, in the order `node lab.mjs check` runs them:

| Unit | Checks |
| --- | --- |
| 12 | `12.parse-accepts`, `12.parse-refuses`, `12.admit-order`, `12.admit-rounds`, `12.clients`, `12.recorder`, `12.replay-genuine`, `12.replay-tampered`, `12.replay-own` |
| 13 | `13.view-fields`, `13.view-noninterference`, `13.view-encodings`, `13.leaks-finds` |
| 14 | `14.features`, `14.threshold`, `14.counting`, `14.frozen`, `14.heldout`, `14.recordings` |
| 15 | `15.position-at`, `15.measure-rtt`, `15.judge`, `15.tally`, `15.pick`, `15.sweep` |
| 16 | `16.trade`, `16.crash-trade`, `16.crash-recover`, `16.double-sell` |
| 17 | `17.protocol`, `17.legal`, `17.searcher`, `17.courier`, `17.trade` |

Run one with `--case`, for example `node lab.mjs check project 14 --case 14.features`.
`--case list` prints a unit's checks with their titles.

Where this file says what the worked solution does, it means the course's own solution,
which passes every check.

## Time

The server runs in ticks of 50 ms. Lob runs at 60 frames a second, so one tick is three
frames. Every run in this course is a simulation with a seeded network, so the same
command always prints the same numbers.

## Lob, as the server runs it

The server runs Lob in mode 9: the wind is the server's, and the flag moves. Each player
has their own game on the server. A round:

1. The server starts the round. Round 1 starts at tick 0.
2. The player may change the angle (5 to 85) and the power (10 to 100) and fire, at most
   once per round. While the shell is in the air nothing changes.
3. The shell lands. A landing within 12 paces of the flag is a hit. The result shows for
   20 ticks (1 s), then the server starts the next round.
4. A round with no shot 200 ticks (10 s) after it started ends without one, and the next
   round starts at once.

A session is 12 rounds. Positions and distances in Lob are in paces, the game's own unit.

What the game holds, and what the official client draws from it:

| Thing | Held by the game | Drawn |
| --- | --- | --- |
| angle, power | angle as a float, power as an integer | both as whole numbers in the status line |
| wind | the exact wind, a float from -5 to 5, kept by the server; the arrow level -3 to 3 | the arrows only: `<<<` to `>>>`, `~` for 0 |
| flag | its x as a float, 420 to 900; its speed (-140 to 140 paces a second); a timer of frames until it picks a new speed | its x, to the nearest pace |
| shell | x, y and its velocity while flying | its x and y, to the nearest pace |
| trail | up to 64 recent shell positions | each point, to the nearest pace |
| impact | where the last shell landed, and frames since | the mark, to the nearest pace, and its age in frames, until the next round |
| messages | `ROUND 3`, `HIT!`, `SHORT BY 37`, `LONG BY 5` | exactly |
| score, shots | integers | in the status line |
| cloud | its x as a float | to the nearest pace |
| random state | the game's random number generator (it picks every flag and speed) | never |

## Supplied modules

All in `public/`. Each starts with a comment saying what it is for; read them.

| Module | What it gives you |
| --- | --- |
| `rules.mjs` | The constants: 50 ms ticks, 3 frames a tick, mode 9, 12 rounds, the input limits, the hit radius. |
| `lob.mjs` | `makeLob({ seed, mode })`: one game. Getters for everything drawn (`angle()`, `power()`, `windLevel()`, `round()`, `score()`, `shots()`, `flying()`, `targetX()`, `shell()`, `trail()`, `impact()`, `cloud()`, `line()`, `message()`) and for what is not drawn (`serverWind()`, `flagSpeed()`, `flagTimer()`, `rng()`, `velocity()`). `clone()` makes an independent copy in the same state. `hidden` lists the hidden things the course tests, and `setHidden(name, k)` changes one of them without changing anything drawn now (unit 13). `createFlightLab()` is a private firing range: `fly(angle, power, wind)` says where a shell lands. |
| `session.mjs` | `createLobSession({ seed })`: one player's game as the server runs it. `facts()`, `apply(input)` (presses the keys that bring the game to the input's angle and power, then fires if asked), `step()` (one tick: three frames, then the round schedule), `outcomes()`, `final()`, `over()`. |
| `runtime.mjs` | `createLobServer({ seed, admission, view, recorder })`: the server. `join()` gives a token; `receive(token, text)` queues a message; `tick()` decides what arrived, runs every game one tick and returns the messages to send. |
| `net.mjs` | `link({ seed, oneWayMs, jitterMs, loss, outages })`: when a message sent at a given moment arrives, or that it is lost. |
| `sim.mjs` | `playSession({ server, client, up, down, keepMessages })`: plays one client model against a server over two links. |
| `full-view.mjs` | `fullView(game, info)`: everything the game holds, in one message, the way part one's `/state` sent everything. |
| `client.mjs` | The official client: `createScreen({ mode })` draws the screen from the messages received so far. `perceive(view)` is what it takes from one message. |
| `players.mjs` | `makePlayer(kind, seed)`: legal players. Kinds `novice`, `skilled`, `expert`, `highLatency`, `jitter`, `reconnects`. |
| `adversaries.mjs` | The protocol cheats `hitClaim`, `fireTwice`, `outOfRange`, `replay`, and the searching client `searcher`. |
| `corpus.mjs` | `makeCorpus({ split })`: labelled sessions for unit 14, `split` `'dev'` or `'heldout'`. |
| `courier.mjs` | Part one's courier arena over a network (unit 15). |
| `store.mjs` | The crashable store and the naive trade (unit 16). |
| `stats.mjs` | A seeded random generator and `median`, `quantile`, `mean`, `sd`, `correlation`. |

## Unit 12: Lob behind a server

### The input

A client may send exactly one kind of message, a JSON object with exactly five fields:

```json
{ "v": 1, "seq": 17, "angle": 52, "power": 71, "fire": true }
```

### `parseInput(text)`

Returns `{ ok: true, input }`, where `input` is a new object with exactly the five fields,
or `{ ok: false, reason }`. The checks, in this order; the first that fails gives the reason:

| Reason | Refused when |
| --- | --- |
| `text` | `text` is not a string |
| `too-long` | it is longer than 200 bytes in UTF-8 |
| `json` | it is not valid JSON |
| `object` | it is not a plain object (null, an array, a number, a string) |
| `keys` | its keys are not exactly `v`, `seq`, `angle`, `power`, `fire` |
| `version` | `v` is not the number 1 |
| `seq` | `seq` is not an integer from 1 to 1,000,000 |
| `angle` | `angle` is not an integer from 5 to 85 |
| `power` | `power` is not an integer from 10 to 100 |
| `fire` | `fire` is not `true` or `false` |

Numbers must be JSON numbers: `"45"` is not an angle.

A key repeated in the text counts once, with its last value, the way `JSON.parse` reads
it, so the worked solution accepts `{"v":1,"seq":4,"angle":52,"power":71,"fire":true,"fire":false}`
with `fire` false. No check sends a repeated key.

### `admit(state, input, facts)`

`state` is `{ lastSeq, firedRound }`, starting `{ lastSeq: 0, firedRound: 0 }`. `facts`
is `{ tick, round, flying }` from the server's game. Returns `{ status: 'admitted', next }`
or `{ status: 'refused', reason, next }`, checked in this order:

| Reason | Refused when |
| --- | --- |
| `stale` | `input.seq <= state.lastSeq`: a replayed message, or one overtaken by a later one |
| `flying` | the shell is in the air |
| `fired` | `input.fire` is true and this round already has a shot (`state.firedRound === facts.round`) |

An admitted input gives `next = { lastSeq: input.seq, firedRound: input.fire ? facts.round : state.firedRound }`.
A refused input gives `next` equal to `state`. The worked solution returns `state` itself, and
a copy with the same values passes too, because the checks compare values. Never change the
`state` object you were given.

### The record

```js
{ v: 1, game: 'lob', mode: 9, seed,
  inputs: [ { n: 1, tick, seq, angle, power, fire }, ... ],
  end,
  final: { round, score, shots, angle, power } }
```

`seed` is the session's game seed. `inputs` are the admitted inputs only, numbered
`n = 1, 2, 3, ...` in the order the server applied them. Ticks count the ticks run so
far: an input's `tick` is the number of ticks the session had run when the server
applied it, before that tick's frames, so an input applied before the first tick has
`tick` 0. `end` is the number of ticks run when the record was finished, so every
input's tick is below it. `final` is the game's state after `end` ticks.

### `createRecorder({ seed, mode })`

Returns `{ admitted(tick, input), finish(end, final) }`. The server calls `admitted` for
each admitted input; `finish` returns the record.

### `replay(record, admission)`

Re-runs the session from its seed with `public/session.mjs` and returns `{ ok: true, final }`,
where `final` is the replayed final (the same five fields), or `{ ok: false, reason }`. `admission` is `{ parseInput, admit }` (yours). In this order:

| Reason | Refused when |
| --- | --- |
| `shape` | not `v` 1, `game` `'lob'`, `mode` 9; a field missing, extra or of the wrong type, at the top level, in an input or in `final` (`seed`, `end`, `n`, `tick` and every field of `final` are whole numbers; `seq`, `angle` and `power` are numbers; `fire` is a boolean); a seed outside 0 to 4,294,967,295; a negative `end` or tick. An angle of 52.5 is a number, so it passes `shape` and is refused by your `parseInput`. |
| `order` | `n` is not exactly 1, 2, ..., k; a tick goes down, or is not below `end`; `seq` does not go up |
| `refused` | an input your `parseInput` refuses when given `{ v: 1, seq, angle, power, fire }` from it as JSON, or your `admit` refuses at that moment of the replay |
| `final` | the replayed final differs from the record's in any field |

Where the table is silent, the worked solution does this, and no check tests it:

- A negative `n` or `final` field is still a whole number, so it passes `shape`. A negative
  `n` then fails `order`, and a negative `final` field fails `final`.
- JSON has no NaN or Infinity, but a record built in code can hold them. The worked
  solution lets a non-finite `seq`, `angle` or `power` through `shape`. A `seq` that doesn't
  compare above the one before fails `order`, and anything else reaches your `parseInput`
  as null (`JSON.stringify` writes a non-finite number as null), so the record is `refused`.
- A record whose `end` runs past the tick where the session is over replays to its final,
  because the extra ticks change nothing. An input at a tick after that point goes through
  your admission like any other and, if admitted, changes nothing.

## Unit 13: hide what the client doesn't draw

### `drawnView(game, info)`

`game` is the session's game (`public/lob.mjs`); `info` is `{ tick, ack }`, where `tick`
is the number of ticks run and `ack` the last admitted seq. Returns exactly these
fields, every float rounded with `Math.round`:

```js
{ v: 1, tick, ack, round, score, shots,
  angle,       // Math.round(game.angle()), as the status line shows it
  power,
  wind,        // the arrows: '~' for level 0, '>' repeated n times for +n, '<' for -n
  flag,        // Math.round(game.targetX())
  shell,       // null, or [x, y] rounded while the shell flies
  trail,       // [[x, y], ...] rounded, oldest first, as game.trail() gives them
  impact,      // null, or { x: rounded, age } while game.impact() is not null
  message,     // game.message(), exactly
  cloud }      // Math.round(game.cloud())
```

The server sends `JSON.stringify` of it. Key order is part of the bytes: keep it as
above.

### Hidden things

`game.hidden` lists the things the game holds that the screen never draws:

| Name | What it is |
| --- | --- |
| `wind` | the exact wind, kept by the server (the arrows show only its band) |
| `flagSpeed` | the flag's speed |
| `flagTimer` | frames until the flag picks a new speed |
| `rng` | the game's random state, which picks every flag and speed |
| `flagFraction`, `shellFraction`, `trailFraction`, `impactFraction`, `cloudFraction` | the part of each position below a whole pace |
| `shellVelocity` | the shell's velocity |

`game.setHidden(name, k)` changes one of them on that game without changing anything
drawn now, for `k` = 1, 2 or 3 (three different changes). It returns `false`, changing
nothing, when the thing is absent at this moment: no shell in the air, no impact mark,
no trail.

### `findLeaks(viewFn, game, info)`

Returns the sorted list of hidden names that reach the message: a name leaks when, on a
clone of `game`, `setHidden(name, k)` returns true for some `k` in 1..3 and
`JSON.stringify(viewFn(clone, info))` differs from `JSON.stringify(viewFn(game, info))`.
Each name at most once. `game` itself must be left unchanged. The worked solution takes the
base message from `game` itself, once, and makes each change on a fresh `game.clone()`.

## Unit 14: meet the limit, then detect

### A case

`makeCorpus({ split })` returns cases `{ id, label, kind, record, rounds }`: `label` is
`'cheat'` or `'legal'`, `record` the session's record (unit 12), and `rounds` its rounds,
in order:

```js
{ round, start, shot: null | { tick, angle, power }, impact, flag, miss, result, inputs }
```

`start` is the tick the round started; `shot.tick` the tick its fire was applied; `miss`
the landing minus the flag's x at landing, in paces (negative is short); `result`
`'hit'`, `'short'` or `'long'` (null without a shot); `inputs` the number of admitted
inputs applied in that round.

### `features(c)`

Returns these fields for one case (fields of your own may be added). The checks and the
scoreboard call it with `{ record: { inputs }, rounds }` only: no id, label, kind or seed.
A shot round is a round whose `shot` is not null.

| Feature | Definition |
| --- | --- |
| `shots` | the number of shot rounds |
| `hitRate` | hits over shots; null with no shots |
| `missMedian` | the median of `abs(miss)` over shot rounds |
| `fireMedian` | the median of `shot.tick - start` over shot rounds, in ticks |
| `fireSpread` | the upper quartile minus the lower quartile of those fire times (`quantile` in `public/stats.mjs`, linear interpolation); null with no shots |
| `inputsMedian` | the median of `inputs` over shot rounds |
| `cadenceCV` | the gaps in ticks between consecutive admitted inputs (`record.inputs`) that fall in the same round, pooled over the session: their population sd divided by their mean; null with fewer than 5 gaps or a mean of 0. An input falls in the latest round whose `start` is at or before its tick. |
| `missLag1` | the correlation (`correlation` in `public/stats.mjs`) of the miss in round r with the miss in round r + 1, over consecutive rounds that both had a shot; null with fewer than 4 such pairs |

`median` of an empty list is null (as in `public/stats.mjs`).

### `score(features, settings)`

A number for one session: higher is more suspicious. The rule is yours. It may use only
the features and your settings, and must give the same number for the same inputs.

### `chooseThreshold(legalScores, budget)`

The smallest `t` among the scores such that `count(score >= t) / n <= budget` over the
`n` scores, or `Infinity` when no score qualifies.

### `count(decisions)`

`decisions` is one `{ label, flagged }` per session. Returns
`{ total, tp, fp, tn, fn, recall, falsePositiveRate, precision }`: a flagged cheat is a
true positive, a flagged legal session a false positive. A rate whose denominator is 0
is null.

### `evaluate(cases, settings)`

One decision per case, flagged when `score(features(c), settings) >= settings.threshold`,
counted with `count`.

### `precisionAt(baseRate, recall, fpr)`

The precision when a fraction `baseRate` of sessions are cheats:
`b × r / (b × r + (1 − b) × f)`, or null when that denominator is 0. The checks and the lab
never pass it a null rate. The worked solution does the arithmetic as written, in which
JavaScript counts a null as 0.

### `detect/settings.json`

Your settings: whatever your `score` needs, plus `"budget": 0.002` (one false flag in
500 legal sessions) and `"threshold"`, the number `chooseThreshold` gave on the dev
split's legal sessions. Freeze them with `node lab.mjs freeze project` before you look at
the held-out split. The legal medians and robust scales that `node lab.mjs features project`
prints are rounded to three decimals, which is precise enough to copy into this file.

### What the checks require

- `14.frozen`: `budget` is 0.002, `threshold` is a finite number, and at that threshold
  your score flags at most `0.002 × n` of the dev split's legal sessions.
- `14.heldout`: on 2,200 sessions of the check's own, with the held-out split's mix of
  kinds, at most 15 of the 2,000 legal sessions flagged and at least 90% of the searcher
  sessions flagged, counted one decision per session. The allowance is wider than the
  budget because a threshold set at one in 500 on 1,000 dev sessions varies by chance on
  fresh ones; your own held-out result in your receipt is the number to report. The bars
  count the check's own decisions, made from play alone; your `evaluate` is given the
  whole cases and must make exactly the same decisions, including for one session sent
  twice, once disguised as a searcher.
- `14.recordings`: one decision per recorded session, and at least 20% of the `delay`
  sessions flagged.

`node lab.mjs check project 14` runs all six on your detector as it stands, frozen or not,
so 14.heldout plays its 2,200 sessions and 14.recordings scores the recordings. Freeze
before you run 14.heldout, or run the other checks one at a time with `--case`.

## Unit 15: latency on the courier game

`public/courier.mjs` is part one's courier arena with part one's rules, exactly: 250 mm
steps, an admitted input moves the courier on each of the next 4 ticks, an interaction
needs the courier within 250 mm of its target (the core without a parcel, the depot
with one), and after an interaction counts the next one waits 4 ticks. An author tool
compares it tick by tick with part one's engine.

Three things are new:

- **`seen`.** Every input is `{ v: 1, seq, move, interact, seen }`, where `seen` is the
  newest server tick the client had drawn when it sent the input.
- **The position ring.** The server remembers where the courier stood at the end of each
  of the last 40 ticks. `history` is `{ size, slots }`: slot `tick % size` holds
  `{ tick, x, y }` for the newest tick written there. Writing tick 40 overwrites tick 0.
- **Round trips.** The server pings every 10 ticks and keeps each session's last 20 round
  trips, in milliseconds.

The server does not decide an interaction itself. It calls your `judgeInteract`.

### `positionAt(history, tick)`

Returns `{ x, y }`, where the courier stood at the end of `tick`, or `null` when the ring
does not hold that tick: the slot holds another tick, or nothing, or `tick` is not a
whole number of 0 or more.

### `measureRtt(samples)`

`samples` is the list of round trips in milliseconds, oldest first. Returns the largest
of the last 20, in ticks (milliseconds divided by 50; it may be fractional), or 0 when
there are none.

### `judgeInteract(args)`

`args` is `{ seen, now, window, rtt, history, target, range, readyAt, positionAt }`: `now`
is the tick being decided, the tick that starts at the boundary where the press was admitted;
`rtt` is your `measureRtt` of this session's samples, `target` is `{ x, y }`, `range` is
250, `readyAt` is the first tick the cooldown allows, and `positionAt` is the reader the
server was given (yours). Returns `{ accept, at, reason }`, in this order:

1. `seen > now`: refuse, `at: now`, reason `future`.
2. `now < readyAt`: refuse, `at: now`, reason `cooldown`. The cooldown is the server's
   own clock, so it is judged at now, never rewound.
3. The rewind allowed is `min(window, ceil(rtt) + 1)` ticks: no more than the window, and
   no more than this client's own round trip plus one tick. Judge at
   `at = max(seen, now - allowed)`. If the ring doesn't hold `at`, judge at `now`. If it
   holds neither, the worked solution refuses, `at: now`, reason `range`. The server writes
   tick `now` into the ring before it calls your judge, so that happens only in a call you
   make yourself.
4. Accept, reason `ok`, when the courier's position at `at` is within `range` of the
   target (distance squared at most `range * range`); otherwise refuse, reason `range`.

### `tally(outcomes)`

`outcomes` are what `runCourier` reports, one per interaction:
`{ who, accepted, inRangeNow, inRangeAtSeen, ... }`, where `who` is `honest`,
`naiveFaker` or `slowPongFaker`. Returns one row of the window table:

| Field | Counts |
| --- | --- |
| `honest` | honest interactions |
| `legit` | honest interactions refused although the courier was in range at `seen` |
| `legitRate` | `legit / honest`, or 0 when `honest` is 0 |
| `naive`, `slow` | interactions by each faker |
| `naiveCheats`, `slowCheats` | of those, accepted while the courier was not in range now |

### `pickWindow(rows, budget)`

`rows` are tally rows, each with its `window`. Among the rows whose `legitRate` is at
most `budget`, returns the window with the fewest `slowCheats`; a tie goes to the
smaller window. Returns `null` when no row is within the budget.

## Unit 16: the duplicated item

`public/store.mjs` holds the players' belongings: `inv:<player>` is a list of item ids,
`coins:<player>` a whole number. A missing inventory counts as an empty list and missing
coins as 0. An item id names one item, and no store the checks build holds an id twice
(the worked solution drops the sold id from the seller's list with a filter, which would
remove every copy). The store:

- `get(key)` returns a copy of the value, or `undefined`.
- `put(key, value)` stores a copy, durable the moment it returns. Nothing is bigger than
  one put: there is no transaction across two keys.
- `keys(prefix)` lists the keys starting with `prefix`, sorted.
- `crashAfter(n)` makes the n-th put from now apply and then throw a `Crash`, as if the
  server died the moment that write reached the disk; every later put throws too until
  `restart()`. Reads keep working.
- `restart()` starts the server again after a crash, so puts work again and any crash
  still armed is disarmed.

Keys other than `inv:` and `coins:` are yours (for example `trade:<key>` for a journal).

### `trade(store, request)`

`request` is `{ key, seller, buyer, item, price }`: `key` names the request, and a client
that gets no answer sends the same request again with the same key. Returns
`{ ok: true, receipt }` with `receipt = { key, seller, buyer, item, price }`, or
`{ ok: false, reason }`, in this order:

| Reason | Refused when |
| --- | --- |
| `shape` | the keys are not exactly those five; `key`, `seller`, `buyer` or `item` is not 1 to 40 of `A-Z a-z 0-9 _ -`; `price` is not a whole number of 0 or more |
| `self` | `seller === buyer` |
| `conflict` | a trade under the same key was carried out with a different body |
| `missing` | the seller does not hold the item |
| `funds` | the buyer has fewer coins than the price |

A request whose key was already carried out with the same body returns the same receipt
and writes nothing. A refusal writes nothing.

### `recover(store)`

After a crash the server restarts and calls `recover(store)` before anything else. It
finishes or undoes whatever a crash interrupted and returns the request keys of the trades
it finished (the request's own `key`, not a store key such as `trade:k1`), sorted. A crash
can also happen during `recover`, and the server then restarts and calls it again.

### What the checks require

For a crash after every possible write of a trade, and after every write of a recovery,
followed by recovery and the client's retry:

- every item is in exactly one inventory;
- the total of all coins is unchanged;
- the trade happened wholly or not at all;
- a retry returns the receipt of the trade that happened, and nothing happens twice;
- two trades of one item to two buyers never both succeed.

## Unit 17: the scoreboard

### `capstone/defence.json`

```json
{ "rewindWindow": null, "why": null }
```

Replace the first `null` with the courier window you chose in unit 15, a whole number of
ticks, and the second with a sentence on why. The checks read only `rewindWindow`.

### `node lab.mjs scoreboard project`

Plays the course's clients against your whole defence: your admission and view on the
Lob server, your frozen detector over every session, your judge at your window on the
courier arena, your trade under a crash at every write. For each legal player model and
each cheating client it prints the sessions played, the hit rate, the sessions with an
input refused and the sessions flagged.

### The budgets

The checks play fresh sessions, with seeds no lab command uses, and require:

| Row | Budget |
| --- | --- |
| each protocol cheat | every cheating input refused, in every session |
| legal players, all six models | no input refused except as `stale` (a message the network delivered after a newer one); at most 1 session in 125 flagged (12 of the 1,500 sessions the check plays) |
| expert players | hit rate at least 18% |
| the searching client, live against your view | at least 90% of its sessions flagged, and a ceiling on its hit rate that lesson 17 states. Passing this row doesn't show that your view leaks nothing, and unit 13's checks test that |
| courier, at your window | honest presses refused at most 1%; the naive faker's lies accepted at most 1% |
| trades | every item held by exactly one player and no coin made or lost, after a crash at any write |
