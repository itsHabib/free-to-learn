# Check owned runtime bytes

Implementation reference for **M5: integrity**. Start with [the guided learning route at `/learn`](/learn) on the reference server, then return here for the exact source contract. This Markdown file does not submit answers or certify mastery. Use the [support and attempt workflow](../learning-support/README.md) for worked siblings, gradual guidance and help recording. A prepared source workspace need not serve `/learn`; keep the reference server open for that route.

An edited `engine.mjs` can still claim to be the same release. Build a startup policy that permits an approved runtime and refuses missing, extra or changed files before that runtime starts.

This lab assumes the earlier Courier exercises and JavaScript objects, arrays and functions. Your artifact is `integrity/policy.mjs`, plus an explanation in `response.md`. You do not need to write cryptography or filesystem code.

## Reference and observation

A **manifest** is an owner-approved list of expected paths and file hashes. A **hash** is a value computed from file bytes; this lab uses SHA-256, represented as 64 hexadecimal characters. Hashing `engine.mjs` after a one-character edit normally produces a different value, even if the edit is only a comment. The comparison concerns exact bytes, not whether the code still looks equivalent.

An **observed inventory** is a list of paths and hashes computed by the supplied file reader. The file reader reads regular files, refuses symbolic links and applies file-count and byte limits. A symbolic link is a filesystem entry that points to another path. Refusing links keeps a listed file from silently naming bytes elsewhere. The launcher chooses its runtime paths independently of the manifest; unlisted files are outside this explicit comparison.

The manifest and the observed inventory have different roles. The manifest says what the owner approved. The observation says what was read now. Replacing the approved hashes with the observed hashes makes changed files pass without approval.

Before continuing, put the required first answers or explicit skip reasons in `predictions.json` and explanations in `response.md`. They are explanations for later review, not automatically graded items: an original approved package; the same release with changed engine bytes; a supported new release with new approved hashes; and an extra observed file. State which result each should produce and why. Keep these answers when you repair the code.

## Follow one comparison

Consider an owner-approved one-file package, `settings.json`. Its expected hash starts with `a91c`. The reader reports the same path, with a hash starting with `b84e`.

First validate the approved record so its path and hash are usable. Then check that the release appears in the supported list. Next compare the path sets: both contain exactly `settings.json`, so there is no missing or extra file. Finally compare the complete hashes. These hashes differ, so the result is `{ok:false, reason:'digest'}`. A recognized release name cannot cancel that mismatch.

Compare this reasoning with your predictions. A missing file fails before hash comparison because there is no complete inventory to compare. An approved update may have different hashes from the older release: compare it with its own approved manifest, not with yesterday's hashes. The fixture update increases the runtime's bounded history capacity from 4096 to 8192 entries while preserving initial gameplay and the existing API. Approval also requires deciding whether that capacity and its cost are acceptable; a matching hash does not make that decision for the owner.

## Your editable policy

Prepare the exercise from the project directory:

```sh
npm run core:prepare -- integrity
```

Change into the exact workspace path printed by preparation, including any chosen name.

Edit `integrity/policy.mjs`. It exports `checkPackage({manifest, observed, supported})`. This is a **pure policy**: it decides from the supplied values and does not change them. It does not read files, fetch data or start the game. The owner-side launcher separately observes files, calls this policy and starts the runtime only after a successful result. Keeping these steps separate lets the same decision be tested without starting a server for every case.

The input is shaped like this; the displayed hash is abbreviated for reading and would fail validation as written:

```js
{
  manifest: {
    schema: 1,
    packageId: 'courier-runtime',
    release: 'courier-runtime-1',
    files: [{ path: 'engine.mjs', sha256: 'a91c…64 hex characters total' }]
  },
  observed: [{ path: 'engine.mjs', sha256: 'a91c…64 hex characters total' }],
  supported: ['courier-runtime-1', 'courier-runtime-2']
}
```

You may reorganize the implementation. The template supplies no completed comparison. Match files by path: changing the array order must not change a verdict. Do not sort an input array in place, because the caller may need its original observation later.

## Decide in order

The order makes a failure explain the first usable decision. For example, a malformed reference cannot tell you whether a package is approved.

| Decision | Required behavior | Result on failure |
| --- | --- | --- |
| Validate the reference | Exactly `schema`, `packageId`, `release`, `files`; schema `1`; package ID `courier-runtime`; nonblank release string; nonempty files list of exact `{path,sha256}` records | `schema` |
| Validate supported releases | An array of nonblank strings; an empty array supports nothing | `schema` |
| Check release support | Exact release string occurs in `supported` | `unsupported-release` |
| Validate and compare inventory | Every observed entry has exactly `path` and `sha256`; all paths are safe and unique; the two lists contain exactly the same paths | `inventory` |
| Compare hashes | Every path has equal complete SHA-256 values; hex letter case is irrelevant | `digest` |
| All decisions pass | Permit this observed package | `{ok:true, reason:'verified'}` |

Every failure returns `{ok:false, reason:'the-reason'}` with the table's reason. A malformed observed hash belongs to `inventory`; unequal, well-formed hashes belong to `digest`.

A **safe relative path** has 1–512 characters and names a file below the package root. It cannot start with `/`, contain a backslash, colon or control character, or contain an empty, `.` or `..` slash-separated segment. `rules/movement.mjs` is valid. `../movement.mjs`, `rules//movement.mjs` and `C:movement.mjs` are not. File matching and release spelling are case-sensitive, but an inventory must not contain two names differing only by letter case: `engine.mjs` and `ENGINE.mjs` can name the same file on some systems. Each segment uses only ASCII letters, digits, dot, underscore or hyphen. Hash values accept either hex letter case. Checking duplicate paths matters even when their hashes match: duplicates cannot stand in for an absent file.

Implement these decisions, then submit a check:

```sh
npm run core:check -- --assistance "none"
```

Replace `none` with the actual hints, reference material or AI help you used. The checker records captured source, the exact prompt and version, help and results as separate attempts. An import error, thrown exception or timeout means the run failed; it is not evidence that your policy detected a changed package.

## Inspect, repair and explain

Separate the first failed decision from its later consequences before changing the policy.

## Build in three checked milestones

1. **Separate structure from trust.** Trace the worked one-file comparison above. Completion: the approved package lists `a.mjs` and `b.mjs`, but the observation lists `a.mjs` twice. Decide the failure phase before comparing hashes. A duplicate is not evidence that both expected files exist.
2. **Match paths, then bytes.** Write the path-set check independently of list order, then compare each corresponding complete hash. Hand-check one reversed inventory and one changed, well-formed digest. Avoid sorting the input itself; callers retain the original observation.
3. **Run the boundary.** Use the core check's first failed criterion to identify structure, release, inventory or digest. Then use the disposable runtime experiment below to distinguish a correct pure verdict from an actual refused startup.

<details><summary>Hint 1 — ask what the record can establish</summary>

A malformed reference cannot establish approval. Validate it before trusting a release name or looking for matching bytes; this gives a meaningful first failure.

</details>

<details><summary>Hint 2 — check inventory membership separately</summary>

Build path-to-hash lookups after path validation. Check uniqueness and equal path sets before comparing any values, so duplicate entries cannot conceal a missing file.

</details>

<details><summary>Hint 3 — worked sibling, after a saved attempt</summary>

The worked `settings.json` package has equal path sets but different complete hashes, so its failure is `digest`. The two-`a.mjs` completion has a defective inventory before hash comparison. Record this as assistance; implement the complete ordered decision table yourself.

</details>

## Inspect the first failed criterion

Read the first failed criterion and its expected and actual values. A missing-file failure points to inventory comparison; an approved-update failure points to comparing against the wrong reference or hard-coding one release. The criterion links back to the decision table. Repair the responsible decision, append your explanation in `response.md`, and run again. Keep the first prediction and failed evidence alongside the revision.

A pass means the submitted policy agrees with the stated cases, including actual runtime bytes and a compatible update. It does not prove that every possible input is correct. The local expected manifest must remain separate from the package being checked: someone who controls both can change both and make a modified package pass. There is no signature, identity authentication, third-party game integration or proof that a remote client is executing the checked bytes. The package must also remain unchanged between observation and import; this lab does not provide a secure concurrent update mechanism.

## Run your policy at the actual startup boundary

From the reference project, create a disposable copy of the owned runtime:

```sh
npm run runtime:copy -- artifacts/package-trial
npm run start:verified -- --package-root artifacts/package-trial --policy artifacts/core/integrity-workspace/integrity/policy.mjs
```

The `--policy` path is your completed source file. The approved manifest remains in the reference project. Stop the server with Ctrl-C, append a comment to the copied `artifacts/package-trial/engine.mjs`, then repeat the startup command. Even a comment changes the bytes, so the old reference must refuse startup. Restore the copied file from the reference before trying a legitimate run again. Do not edit the original runtime or approve the changed copy to make this test pass.

This checks actual disk bytes before a real server import. It does not prove that bytes cannot change later, or that an owner who controls the launcher cannot change the check. The separate approved-update tests change both the reviewed package and its approved reference deliberately; a release label alone does not approve new bytes.

## Transfer for review

A level editor loads a project with required core files and optional community plug-ins. Yesterday's approved project had no plug-ins; today's project adds one. Design where approval of core files and plug-ins should live and how their inventories should be formed before any imports. Explain which new bytes require review, when a missing plug-in should block loading, and what happens if the project can rewrite its own approval record. Give one legal update and one refused update as concrete path/hash examples. This is a new design problem; the executable checker does not grade the explanation.

## Capture, compare and try a fresh case

In a newly prepared workspace, put the required first answers in `predictions.json`; use `response.md` for explanations and later repairs. Keep each question ID and its wording unchanged. Fill an `answer` or an explicit `skipReason` for every question before the first source check. A blank row refuses feedback rather than silently recording an empty attempt. The guide's additional trace questions are practice notes, not extra required JSON fields.

After a check accepts and captures the submission, inspect its `prediction-feedback.json` beside the result. Compare your first answer with the answer and governing reason, then append a correction without erasing the original. Complete the new `fresh-practice.json` answers or skip reasons and run `npm run core:practice -- --assistance "none"` from that workspace, replacing `none` with actual help. The practice command records your response before revealing its feedback. These prose responses are preserved and ungraded; they are separate from source-check results and `/learn` mastery.

Use the scripts generated in your workspace. Older prepared workspaces may retain the earlier response-only format; do not replace their original records with new templates. Record any worked-example views, final hints, reference code or AI help in your assistance declaration.
