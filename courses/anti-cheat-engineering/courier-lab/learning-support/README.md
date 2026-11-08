# Use the implementation references

Start with the [guided learning route at `/learn`](/learn) on the running reference server. Select a unit there for its explanation, worked sibling, completion problem, checked practice and fresh mastery items. Navigation stays open. The `LEARNER.md` files describe the exact source contracts when you move into an implementation workspace; they are companions to that route, not interactive assessments.

This folder adds support for three procedures that involve several moving parts:

- [Construct an HTTP test](http-tests.md): distinguish sending a request from observing and asserting its effect.
- [Build a timing predictor](timing-predictor.md): keep clock credit, processed ticks, actor state and output snapshots separate.
- [Reason about repair receipts](capstone-receipts.md): preserve one successful transaction across retries, refusals and bounded history.

The worked siblings solve different cases. Completion problems remove a final step, then more of the procedure. The final source task uses the contract in its own guide. Do not copy a sibling's constants or treat completing its trace as proof that the source task works.

## Keep predictions, help and revisions distinct

New source workspaces include `predictions.json`. It contains exact question IDs and wording. For each row, fill `answer` or an explicit `skipReason`; leave the other blank. Keep the schema, stage, module, IDs and questions unchanged. An unanswered row does not silently count as a prediction. Write longer reasoning and later repairs in `response.md` (`lab/response.md` for M1).

Run the workspace's checker with an accurate assistance declaration:

| Workspace | Source check | Fresh-practice feedback |
| --- | --- | --- |
| M1 spatial | `npm run lab:check -- --assistance "none"` | `npm run lab:practice -- --assistance "none"` |
| M2/M3 order and tests | `npm run order:check -- --assistance "none"` | `npm run order:practice -- --assistance "none"` |
| Core modules | `npm run core:check -- --assistance "none"` | `npm run core:practice -- --assistance "none"` |

Replace `none` with the help actually used. Reading a worked sibling or final hint is assistance; name its file and section. A prior browser reveal still counts when this is your first source submission. These declarations describe available help, not a secure identity or honesty guarantee.

The first accepted source check captures the submitted predictions, source and response before publishing prediction feedback. It also provides `fresh-practice.json`. Fill each fresh answer or explicit skip reason, then use the matching practice command above. That command captures the response before returning the answer and governing reason. These written explanations are preserved for review; they are not automatically graded. Source checks and the generated `/learn` checks report their own results separately.

Keep the original answer and append the correction, what evidence changed it and the attempt path. Do not replace an old answer with the revealed key. Existing prepared workspaces may retain an older response-only format; use the files and scripts generated for that workspace, or prepare a new named core workspace to use the new flow. Do not copy a new response file over an earlier attempt.

## Read a milestone as a testable claim

Each guide's milestones identify an intermediate state and a way to check it. The tables are an implementation aid, not a progress button. A prediction in a Markdown file is not a submitted `/learn` item. A manual trace is not an executed source test. A green finite checker result establishes agreement with its stated cases, not all inputs, human learning or production safety.

Hints have three levels: orient to the responsible concept, identify a useful intermediate step, then show a worked sibling step after an attempt. The browser route controls its reveals. Markdown disclosures are ordinary reference text and cannot enforce when you read them. Use the last level after saving an attempt, and record it as assistance. Hints do not apply to independent mastery or transfer items.

## Authoring and evidence note

These references apply `sequencing-01`, `sequencing-02`, `sequencing-06`, `projects-01`, `projects-07`, `feedback-01`, `feedback-07`, `feedback-10` and `feedback-11` from Ivy's course-craft standard. They add explicit intermediate decisions where the prior guides jumped from prose to full source production. They do not replace the course's submitted practice and mastery path.

Authored 2026-10-16 by the Codex `teaching_support` agent against source base `bf923c118d31adf1f6f3fc33e3476abd55fc702b` and the whole-course teaching-repair interface. The exact model identifier is not exposed to this agent. Sources consulted: project source and public contracts, the existing learner guides, `CLAUDE.md`, and `docs/course-craft.md`. Worked traces and code examples are author-created teaching cases. Any duration estimate is a planning estimate; human duration and learning remain unmeasured.

Checks on 2026-10-16: the displayed HTTP sibling ran against the actual loopback server for seeds 17, 31 and 99; its assertions passed. The smaller-clock table, circular-boundary arithmetic and receipt balances were recomputed. All 23 relative links across the 13 edited/new references resolved; Markdown fences and hint disclosures were balanced. Temporary Markdown previews were visually inspected at 320, 390 and 1280 pixels. Those previews check reference readability, not the integrated `/learn` runtime or human learning. The source-flow owner separately verified the new preparation and practice command lifecycle before these commands were documented.
