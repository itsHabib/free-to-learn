# Taking Tiny Browser Engine in the terminal

No browser, server, installation or network is needed for this route. Use an already installed Node with ES modules, structuredClone and Web Crypto. This candidate is qualified on Node v26.5.1. These commands execute trusted local learner JavaScript; they are not a hostile-code sandbox.

## Each module

1. Read `node tools/lesson.mjs M1` (replace M1 with M2 through M8 as you advance). It prints the lesson, three conceptual practices and the cumulative project.
2. Record your predictions and first answers in your own file. Request feedback with `node tools/lesson.mjs M1 --answers A,B,C`, using your choices. Feedback is practice, not certification. Text diagnoses and project explanations remain self-/reviewer-graded.
3. Copy `public/starter.body.js` to `my-engine.body.js`. Implement your current methods and retain later explicit stubs. Preserve numbered source versions when repairing a failure.
4. Run `node tools/check.mjs my-engine.body.js M1`. The starter must fail; do not treat that expected failure as completion.
5. Run `node tools/stage.mjs my-engine.body.js M1 stage-M1.json`. M3 defaults to empty block fixtures. Other stages use the guided page. M6 invokes one action and rebuilds with the correct viewport. Later unimplemented methods are not invoked by an earlier stage.

For your own page, write a JSON packet with `html`, `css`, `viewport` and optional supplied `listeners`/`defaultActions`, following `public/CONTRACT.md`. Then use:

```
node tools/stage.mjs my-engine.body.js M8 own-stage.json own-page.json
node tools/render.mjs my-engine.body.js own-page.json own-page.png
```

The built-in names `board` and `field` still work. The render command's optional final `click` activates the first button; use sessions below for precise, repeatable input.

## Your cumulative project and recoverable session

Once the complete engine works, start a new local workspace:

```
node tools/session.mjs start my-engine.body.js own-page.json my-session
node tools/session.mjs inspect my-session
node tools/session.mjs note my-session "My prediction, assistance used, and first divergent stage."
node tools/session.mjs apply my-session '{"kind":"click","point":{"targetId":5}}'
node tools/session.mjs apply my-session '{"kind":"scroll","scrollY":12}'
node tools/session.mjs apply my-session '{"kind":"resize","width":240,"height":180}'
```

Use actual handles from `inspect`, not the example handle blindly. `apply` accepts inline JSON or an input JSON file. Inputs are click, hit, mutate, scroll and resize, matching the workbench protocol. A mutation input contains an `operation` from the DOM contract. Hit and click coordinates are viewport coordinates; the host adds scrollY.

Each saved revision creates a new `book-NNNNNN.json`, frame JSON and PNG when a frame exists. Earlier snapshots are retained. The latest numbered notebook is the active session. A rejected operation or unsupported intermediate state returns exit 1 **and retains its input/result**. Inspect the result, then submit an explicit repair. A stale frame rejects activation. New source code starts a new workspace, preserving old attempts.

```
node tools/session.mjs export my-session my-export.json
node tools/session.mjs restore my-export.json restored-session
node tools/session.mjs inspect restored-session
node tools/session.mjs apply restored-session '{"kind":"scroll","scrollY":20}'
node tools/replay.mjs my-export.json replay-report.json
```

Restore uses the retained source, packet and input history in a fresh process. It verifies notebook structure and every source/packet hash before creating the new workspace. It does not authenticate grades or authorship. Source and inputs are the recovery data; JSON frames and PNGs are diagnostics. Keep exports private if your source or notes are private. Export paths and new workspaces must not already exist. No temporary-file cleanup or deletion is performed.

For P3, freeze your first engine and notebook before receiving a reviewer-created unfamiliar packet. The visible field page and self-authored page are practice and own-project evidence, not a blind human transfer assessment. Retain the first failure, minimized case, general repair, regression results and limitations. Passing all finite checks does not establish full web compatibility or course release acceptance.
