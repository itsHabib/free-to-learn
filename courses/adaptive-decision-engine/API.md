# Function and evidence contracts

All work files are ordinary ES modules. Use named exports and relative imports to other work modules. `../shared.mjs` supplies immutable constants, targetAt, distance and hash. The independent-episode bound is supplied by ../uncertainty.mjs. `../game.mjs` supplies the authoritative engine. You may also import supplied `../control.mjs` (createController), `../fixtures.mjs` (fixtureTransport), `../resample.mjs` (pairedInterval), and `../data.mjs` (async loadData for dev/calibration/evaluation). These helpers use the same offline files in Node and the browser. Browser and terminal evaluate the same files. contracts.d.ts describes editor types without requiring a compiler.

## 01 · observe.mjs

`observe(state)` returns exactly public fields: episodeId, revision, round, health, supplies, charge, budget, lastKind (null initially), recentDamage (last three), recentMoves (last three), pressure, target and flags `{historyComplete, available}`. Pressure is null with fewer than three events or observationMissing. Otherwise use 0.6*(12-health)/12 + 0.4*min(1,sum(recentDamage)/6). Target comes from targetAt(profile, round). Do not leak seed, future hazards or bot plans. Do not mutate the state.

## 02 · constraints.mjs

`allowedActions(observation)` returns unique strings. At round 12 or health zero, return []. Otherwise include rest. Scout needs health >=4 and budget >=1; swarm health >=6 and budget >=2; brute health >=8 and budget >=3. Neither swarm nor brute may follow either high card. Return the complete set in any order.

## 03 · rules.mjs

`chooseRules(observation, memory={})` returns `{action:{kind}, memory:{recovering}, reason, origin:'rules'}`. The action must be legal, deterministic and meaningful for the beacon objective. Use target limits from the observation and explicit handling for unknown pressure. Public minimum: complete at least one of twelve seeded development episodes and expose encounters on at least 30% of the possible rounds. Other lawful heuristics are accepted.

## 04 · adapter.mjs

`buildRequest(observation, allowed, config={model:'fixture-v1',host:'offline'})` returns `{body,binding}`. Body includes model, canonical observation string as state, and questions.encounter with type choice, instructions and criteria keyed by allowed actions. Binding includes stateHash, questionHash, episodeId, revision, allowed, model, host, adapterVersion and requestId covering body plus the other binding fields.

`parseResponse(raw,request,current,origin='synthetic-fixture')` returns `{ok:true,action,distribution,score,binding,origin}` or `{ok:false,error}`. Read raw.answers.encounter; require type choice, selected legal label, exact probability keys, finite values in [0,1] summing to one within 1e-9, and finite confidence in [0,1]. Reject changed request body, question or current context. Distinguish stale, invalid-binding and invalid-response. Do not normalize malformed data.

## 05 · confidence.mjs

`fitCalibration(rows)` accepts only calibration rows with a nonempty episodeId/domain, unique `(episodeId, revision)`, integer revision, score in [0,1] and label 0/1. An episode must belong to one domain. Return version 2, the event/estimand description, a sorted domain list and `domains[domain] = {episodes, rows, bins}`. The three bins have edges 0,.5,.8,1.0000001. Each bin returns lo,hi,n,yes,episodes,p,rowRate,interval. Here n/yes count rows/events; p averages each participating episode's event fraction equally, while rowRate is yes/n. Empty bins have p:null.

Use supplied `episodeInterval(rates)` from `../uncertainty.mjs`. It applies a two-sided Hoeffding bound to independent episode summaries in [0,1], with alpha=.05: radius = sqrt(log(2/alpha)/(2*m)). This conditional claim requires independent, comparable episodes within the declared domain. The fixed synthetic corpus does not establish population coverage, and rows within one episode are not independent samples.

`brier(rows,predict)` returns mean squared forecast error. `select(proposal,table,domain,threshold=.65)` uses only the requested domain's bin. Require a valid score, at least ten distinct episodes, and lower interval endpoint >= threshold. Return use/reason plus domain, probability, interval and episode count when supported. Unknown domains, duplicate rows and scarce episode evidence cannot borrow strength from other domains. No universal threshold or model performance is implied.

## 06 · evaluate.mjs

Call supplied `auditEpisode(ep)` from `../audit.mjs` before measuring. A complete episode contains id,seed,profile,bot,events,decisions,final and termination='completed' or 'defeated'. Optional targetSchedule/requestLimit must match its initial environment. The auditor reconstructs every transition from the seed, checks before/after values, hazards, target, decision revision/action, independently derived violation arrays and final state/history. A healthy prefix, missing tail, altered final state or extra post-terminal transition is rejected. Recorded authority violations may be audited as deliberately faulty complete traces; they remain nonzero safety metrics and block adoption.

`metrics(ep)` computes survival,completion,distance,playedDistance,challenge,proposalViolations,executedViolations,fallbacks,calls,latencyMs,duplicateEffects,staleEffects. The fixed denominator is 12; unplayed rounds after an actual defeat contribute distance 1. Count rounds with nonempty violation arrays, sum reservations/latency/effects, and preserve zero versus missing evidence. The honest engine emits no executed violations; the fault controls prove that the metric does not erase them.

`compare(pairs)` validates unique matched IDs,seeds,bots,profiles,target schedules and request limits, and returns n, per-pair rows, mean differences and each bot/profile slice. Differences are candidate minus baseline. `recommend(report,gates)` returns rules,selective or collect-more-evidence using frozen maxCalls,completionLoss,survivalLoss,minDistanceGain. Any executed violation, duplicate effect, stale effect or exceeded request allowance blocks adoption. The supplied runner independently recomputes the report and rejects false counts or inconsistent recommendations. The fixture controller uses the frozen allowance, including zero.

### Comparison report shape

`compare(pairs)` takes a nonempty array of `{base, candidate}` episode pairs. Use these field names so the runner can consume your report:

- `n` is the number of pairs.
- `rows` contains one record per pair, in input order. Each record has `id` equal to `base.id`, `slice` equal to the bot name, a slash, and the profile name (for example, `cautious/pulse`), and the fields `base`, `candidate` and `difference`.
- `base` and `candidate` contain the corresponding complete `metrics(ep)` objects, with all twelve metric names listed above. Use `base` as the field name, even when your explanation calls it the baseline.
- `difference` contains candidate-minus-base values for every listed metric except `playedDistance`. Keep `playedDistance` in both episode metric objects; it is not included in the paired difference or aggregate means.
- `mean` averages each difference field across all pairs. `slices` maps each distinct `slice` string to `{n, mean}`, where `n` counts that slice's pairs and `mean` averages only their differences. The report retains both overall and per-slice evidence.

For example, the same `cautious/pulse` identity appears in a row's `slice` and in the matching `slices` entry; a row called only `profile: 'pulse'` cannot identify the bot/profile group. Report rows remain paired records, not individual rounds. The supplied runner adds `distanceInterval` afterward; your `compare` return does not need to compute it.

### Fallback counting

For this course, count one fallback for each recorded decision whose `reason` is **not** exactly one of `rules`, `challenge`, `recovery` or `supported`. Those four reasons contribute zero; every other reason contributes one. The comparison is case-sensitive. For example, `supported` contributes zero while `unavailable` or `invalid-response` contributes one, even when the executed action is legal. Read the recorded `reason`; neither `origin: 'rules'` nor an executed rest action alone determines this count. These are the existing course accounting labels, not a universal classification of fallback behavior.

## 07 · schedule.mjs

`reserve(state,context,now)` returns `{state,ticket}` or `{state,error}`. State fields: used,maxRequests,timeoutMs,serial,pending,armed. Refuse a second in-flight request and exhausted allowance. Increment used before dispatch. Ticket includes token, episodeId, revision and deadline. `settle(state,ticket,current,now,result)` clears matching pending and returns accepted plus proposal, or an error. Reject mismatched token/context and results at or after deadline. `expire(state,now)` clears an expired pending request without refunding used.

## 08 · scenarios.json and REPORT.md

Create `{version:1,cases:[...]}` with at least two distinct constructed interventions. Each case has id,hypothesis,health,budget,damageA,damageB. Damage arrays contain exactly three integers from 0 through 4. Health is 4..12 and budget 0..18. IDs and tested conditions must be unique; reversing the same history pair does not create a new case. The check builds equal-current-state snapshots and changes only past damage, then executes your observer and rules. Both cases must change the chosen encounter. Display-only changes must not. These are explicitly constructed counterfactuals, not claims of naturally observed episodes.

REPORT.md contains original failure, alternatives, intervention, negative control, source identities, results and remaining limits. Prose reasoning is reviewed by the rubric, not a keyword checker.

## 09 · director.mjs

`policy(state,memory={})` composes observation and your rules. `checkpoint(state,memory,scheduler,identities)` returns version 'beacon-keep/1', copies of state/memory, identities and scheduler with pending:null, armed:false; record invalidatedPending. `restore(record,identities)` rejects version/source/calibration mismatches and invalid game or budget state, returns fresh copies, and remains disarmed. Browser Save/Resume captures the already-selected encounter, its advanced policy memory and its episode/revision/source/mode binding. Resume restores that selected result without calling the policy again; resolving it then selects the next round once. This stored selection is completed data, not a pending network operation. Saving is disabled while a decision computation or game transition is in progress. CLI resume returns the selected result when present and never reevaluates it implicitly. A legacy checkpoint without a saved selection restores state/memory only; the browser offers an explicit Choose a new encounter action. The original unsaved encounter cannot be reconstructed reliably. Mode inference from session.game requires matching state and memory; an explicit mode choice takes precedence. Terminal writes update both checkpoint.json and the session ledger, and checkpoint.json is authoritative when both exist.

### Terminal checkpoint writer and identities

```sh
node lab.mjs checkpoint ./work --mode project --seed saved-expedition
node lab.mjs resume ./work
```

The writer runs one complete episode and saves its terminal state and final policy memory. `--mode rules` selects chooseRules; `--mode project` selects the learner-created policy. The default is rules. It records playMode as learner or project and writes checkpoint.json plus the session ledger. Resume uses the saved mode; an explicit `--mode rules` or `--mode project` overrides it. A legacy checkpoint lacking a bound mode requires an explicit choice unless a matching saved game state and memory establish the association. A terminal checkpoint has no next encounter. Browser Save checkpoint can instead retain the completed selection at the current game revision; export that session to carry it into the terminal.

For CLI compatibility, identities.source is SHA-256 of the UTF-8 JSON string produced from all current named work .mjs source entries, sorted by filename with localeCompare (the supplied bundle.mjs identity helper). identities.calibration is SHA-256 of the UTF-8 text of evaluation/calibration-data.json, including its exact whitespace (the supplied sha256 helper). The checkpoint writer computes both. Use those same values when constructing a record through the pure API for later CLI use. A changed source or calibration identity is refused; do not rewrite an old identity merely to suppress the refusal.

The project-plan.json sourceHash printed by `fingerprint` is a short project fingerprint for the capstone contract. It has a different purpose and encoding from the SHA-256 checkpoint identities. A pure API round trip with caller-supplied identity strings proves equality for those strings; CLI resume also checks compatibility with its independently computed values.

## 10 · project.mjs and project-plan.json

Create project.mjs yourself and export `policy(state,memory)`. Read the current target through your observation, including a supplied twelve-interval `state.targetSchedule`, and respect optional `state.requestLimit`. Outages set observationMissing on the current call. Return a legal rules fallback with reason='unavailable', origin='rules', and zero new calls when observation is unavailable. The reason must not be used on a normal measured state.

In the published final-round control, charge 12 is already secured and every candidate action survives both hazard values. There is no remaining-round tradeoff. Select an action minimizing the worst possible distance from the announced band under the documented fixed player. Tied optimal actions are all accepted. The low and high bands have different optima, so a target-blind health heuristic cannot pass. This is a bounded semantic check, not a general optimality requirement during the rest of the episode.

Create project-plan.json with version:1, sourceHash covering all current work/*.mjs (print it with `node lab.mjs fingerprint ./work`), adoption (rules/selective/collect-more-evidence), your nonempty rationale and limits, and at least two scenarios. Each scenario has unique id/seed, profile:'pulse', bot, a twelve-entry targetSchedule of valid [lo,hi] intervals, nonempty unique missingRounds in 0..11, and integer requestLimit in 0..2. The two contracts must differ in schedule, outage or allowance, not only names. Replace the REPORT.md starter with your own evidence account. The checker binds and executes the artifacts; it does not grade whether the written argument is persuasive. Use the separate rubric for that judgment.

The public check also retains the original meaningful-game minimum: at least one completion and 30% encounter exposure across twelve supplied cases. No model win is required. No complete project solution is supplied by support packs.

## Portable evidence files

Named exports include every listed work module plus REPORT.md, scenarios.json, project-plan.json, evaluation-plan.json, results.json and checkpoint.json. The browser creates plan/results/checkpoint from its controls. CLI freeze records source and gates; evaluate saves all event results. Freeze again only as a new experiment after a code change. Never copy credentials or arbitrary local files into these fields. Actual provider captures remain local and are not exported automatically.

Session storage restores the learner schema `{schema:1,sources,attempts,...}`. On disk, format 2 is `{schema:2,encoding:"source-text-table/1",texts,session}`. Format 3 uses `schema:3`, `encoding:"source-text-table/2"` and an additional `resultRefs` array of strictly increasing attempt indices. Each listed attempt stores a text-table index in its `result` field. That text must also be referenced as a current or historical `results.json` source and must contain a JSON `result` value. Parsing restores that value; all other attempt fields and every exact source string are unchanged. The writer uses a reference only when the original result has the exact same JSON serialization as the retained value. Unmatched results stay inline. Both stored and fully restored evidence count toward the existing limits; malformed, dangling or mixed-format references are rejected.

The scripted transport intentionally ignores question instruction semantics. `node generate-data.mjs WORKDIR NEWDIR` reproduces all 180 synthetic episodes using your adapter and observer. Changing prompt prose cannot turn this fixture into a model experiment.
