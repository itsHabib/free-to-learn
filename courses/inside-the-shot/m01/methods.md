# From an output to an explanation

Use this page when you can run a program but are unsure what to try next. A useful model explains how an input produces an output. A list of matching examples is only a start.

## Choose a probe that can change your mind

A **hypothesis** is a candidate explanation. A **probe** is an input chosen to test one. Before running it, calculate what at least two hypotheses predict. If they predict the same output, that run cannot distinguish them, even if it succeeds.

Here is a different, fully revealed teaching example. A toy dispenser holds `stock` items, receives a `request`, and has a `closed` switch. The counts are nonnegative integers; `closed` is `1` for closed or `0` for open. It dispenses only when its lid is closed **and** enough items remain. Otherwise it keeps the stock unchanged. These are not the cart's rules.

Consider two explanations:

- **A:** enough stock alone permits dispensing.
- **B:** both enough stock and a closed lid are required.

With stock `5`, request `2`, and closed `1`, both predict stock `3`. That is a useful ordinary case, but a poor discriminator. Keep stock and request fixed and change only closed to `0`: A predicts `3`; B predicts `5`. One observed value can now reject one explanation for that case.

Changing one input at a time makes a difference easier to attribute. It is not a law: some hypotheses require a carefully chosen combination. State why the combination distinguishes them instead of changing everything and guessing which change mattered.

## Trace a compound condition without skipping values

A compound condition combines smaller tests. Here **and** means that both must be true. Trace the actual input values before following the selected path:

The input column gives `(stock, request, closed)` in that order. In the test column, the stock comparison comes first and the lid comparison second.

| Input | Tests and combined result | New stock |
| --- | --- | --- |
| `5,2,0` | true and false → false | `5` |
| `5,2,1` | true and true → true | `3` |
| `2,2,1` | true and true → true | `0` |
| `1,2,1` | false and true → false | `1` |

The last two rows locate an equality boundary: enough includes exactly the requested amount. Samples far from that boundary would not distinguish `>=` from `>`.

In an instruction listing, follow each comparison's operands and the path it selects. Do not infer the whole condition from one comparison. The compiler may arrange two tests as separate branches or select between values without an obvious source-style `if`. The evidence you need is which values reach the final write on each path.

## Find the first disagreement

Write a short trace with four columns: operation, inputs it reads, computed value, destination. Keep the old state separate from replacements. If your model and the program disagree, compare those traces from the start. A wrong early value can cause both wrong arithmetic and a wrong later branch. Patching only the last output can hide the cause.

For a multi-step run, feed each returned state into the next step. Do not reset to the original state between rows. A rule can match the first row and fail when its own output becomes the next input.

## State what transfers

When a related program changes, separate three questions: Which old assumptions still predict observations? Which specific observation rejects one? What new rule explains both the old ordinary case and the counterexample? Try the simplest candidate that fits your evidence, then seek a case that could refute it. “Simplest” is a starting preference, not proof.

Save predictions before output, and code before checker feedback. A correction made after seeing an answer is useful practice; preserve the earlier attempt and record the help. Public checker passes support the tested behavior. Your explanation still needs native observations, instruction evidence and an honest remaining uncertainty.
