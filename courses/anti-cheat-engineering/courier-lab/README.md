# Courier Lab: anti-cheat engineering beta

Build and test defensive rules in a tiny game you own. This project contains a real Node HTTP server and browser client, source exercises, independent HTTP tests, causal replay, synthetic evaluation, bounded exports and a local recovery trial. It is an educational system, not production anti-cheat.

This beta has not been validated for human learning or completion time. Native 200% zoom and VoiceOver checks remain pending. Exact historical generator model IDs are unavailable; [provenance](../provenance.json) preserves the known records and that gap.

Use Node 22+ and a terminal. No package installation is needed to play or run source/HTTP checks. Author browser checks additionally use Playwright/Chromium.

```sh
npm start
```

Open the full **`/learn`** URL printed in the terminal for the guided course. `/course` maps that route to the source projects. On a phone-sized browser, the guided numeric/JSON decisions, feedback and generated mastery checks remain usable. Full code production and HTTP testing need a workstation; browser decisions are preparation, not equivalent source artifacts. Navigate freely. The complete software core is M1–M7 and M9–M11; M8 optional native work is excluded.

| Module | Learner artifact | Start from the reference project |
| --- | --- | --- |
| M1: client/server authority | Missing circular proximity guard; explanation and new boundary tests | `npm run lab:prepare` |
| M2: state transitions | Input admission, sequence/expiry/coalescing policy | `npm run order:prepare` |
| M3: independent testing | HTTP scenario accepting two correct implementations and detecting wrong variants | Same ordering workspace |
| M4: time and recovery | Timing predictor compared with the real clock/engine and reconnect traces | `npm run core:prepare -- timing` |
| M5: owned integrity | Actual-byte inventory/digest validation and explicit trust limits | `npm run core:prepare -- integrity` |
| M6: causal replay | Checkpoint/window replay, missing/order/version refusal | `npm run core:prepare -- telemetry` |
| M7: detector evaluation | Classifier, case-level counts and rates; frozen settings/source | `npm run core:prepare -- evaluation` |
| M9: cost and privacy | Bounded field/age/count retention, measurements and export deletion | `npm run core:prepare -- retention` |
| M10: compatible recovery | Select package/configuration/snapshot tuple; prove recovery and lost actions | `npm run core:prepare -- recovery` |
| M11: new mechanic | Repair policy plus independently authored HTTP scenario | `npm run core:prepare -- capstone` |

Each guided section pairs original teaching with a solved sibling, a completion case and fresh checked practice. Three separately generated decisions form each unit’s mastery set; all must be correct on unassisted first scored responses. Format errors, revisions, declared help and reference exposure are retained. Navigation stays open. This local service is editable by the machine owner, and its mastery label is neither proctored evidence nor a claim of human learning.

Every prepare command prints its workspace. Core preparation optionally accepts `--name my-run` after the module name to start a separate personal attempt without touching existing QA or earlier learner work. Reusing an existing path is refused. Read its guide and preserve predictions before running the checker. In a core workspace run `npm run core:check -- --assistance "none"`, replacing `none` with the help actually used. M1 uses `lab:check`; M2/M3 use `order:check`. Incomplete templates are meant to fail behavioral checks. Do not copy author solutions and call them learner evidence.

Core attempts capture source files, exact prompt/version, response, help, feedback and separate revisions. Trusted fixtures run from immutable reference snapshots outside the learner copy. This provides reproducibility against ordinary edits; it is not an OS sandbox against the machine owner. An interrupted checker has a documented `core:recover` maintenance command that preserves attempt history.

The browser's prediction notebook records exact prompts, first answers, revisions and worked-example views on that browser origin. Export it before clearing storage. It is separate from source submissions: declare those views when checking source work, even if the source checker calls that its first captured attempt. Neither local record certifies an unaided human attempt. The browser's saved worked examples are separate from your source submissions. Reference-project commands for actual experiments:

```sh
npm run start:verified
npm run trace:sample -- artifacts/window-01.json
npm run window:replay -- artifacts/window-01.json
npm run evaluation:explore -- /path/to/evaluation-workspace 3 8 500
npm run evaluation:explore -- /path/to/evaluation-workspace 3 20 500
npm run evaluation:plan -- /path/to/evaluation-workspace 3 20 500
npm run evaluation:run -- /path/to/evaluation-workspace <printed-plan-id>
npm run retention:measure -- /path/to/policy.mjs artifacts/measure-01.json 4095:512:64 4095:128:16 --warmup 5 --samples 20
npm run retention:export -- /path/to/policy.mjs artifacts/denials-01.json artifacts/receipt-01.json 256 128
npm run retention:delete -- artifacts/receipt-01.json artifacts/deleted-01.json
npm run recovery:trial -- /path/to/policy.mjs artifacts/recovery-01.json
npm run capstone:trace -- /path/to/policy.mjs artifacts/repair-01.json
```

Evaluation records belong to the prepared session; a later plan requires `--revision "reason"`, and each plan can run once. The next check links that evidence without altering earlier submissions. Post-check prediction feedback appears only after responses are captured. Use fresh output paths for other experiment revisions. The integrity guide explains the approved reference, disposable runtime copy and compatible-update experiment. Changing both measured bytes and the reference defeats that comparison. The launch check assumes files stay unchanged between measurement and import; it is not an atomic trusted loader.

```sh
npm run ci
npm run test:browser
npm run test:analysis-browser
npm run test:completion-browser
node tests/prediction-browser.mjs
```

Browser evidence is written under `dist/anti-cheat-browser/`. These run source controls, actual loopback HTTP, intended mutants and desktop/390/320 browser checks. They establish the stated behavior on tested fixtures. The course has independent technical reviews and AI cold-reader evidence; human duration, learning, retention and assistive-technology trials remain unmeasured. Written explanation and transfer prompts are preserved for review, not automatically certified.

Keep the server on loopback. Session tokens are ephemeral capabilities created by this local game, not external credentials. Server authority does not identify all modified clients: legal automation can remain indistinguishable. The detector reports advisory findings, never bans. Synthetic label proportions and local sequential timings do not estimate population false positives, production capacity or intent. Retention minimization is not anonymity; deletion affects only its named export.

The dedicated workflow checks the same course without publishing it. No catalog/deployment allowlist, purchase, external credentials, third-party game, kernel installation or OS-security change is involved. The original browser-only model in the parent directory remains a separate conceptual aid. See the local /sources page for reading pointers and ../provenance.json for the preserved source and review metadata.
