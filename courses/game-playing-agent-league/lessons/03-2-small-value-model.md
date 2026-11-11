# 3.2 Fit and inspect a small value model

Your examples have meaningful labels, but fixed hand-written weights cannot learn from them. You will fit a small linear model and show that its predictions respond to relevant training data.

## Predict with a declared feature order

A linear model predicts a value with a dot product: multiply each feature by its corresponding weight and add the products. With features `[1, advancement]` and weights `[0.1, 0.4]`, advancement 0.5 produces `0.1 + 0.4 × 0.5 = 0.3`. The first feature is the bias. Reordering features without reordering weights changes the model even when the weight file is unchanged.

Keep the feature version, coefficient order, training input identity and configuration beside the weights. Normalize quantities whose scales differ greatly. For example, a bounded material difference and a raw byte-sized state identifier should not be treated as equally meaningful measurements. An identifier is generally a poor feature here: it encourages recognition of named cases rather than reasoning from the board.

The learner file exports `features(state, player)` and `fit(examples, {seed, epochs, learningRate})`. The fit returns `{weights}`. You may choose a suitable fitting method; the checker evaluates behavior rather than requiring one particular loop.

**Commit 3.2-p1.** A saved model expects `[bias, materialDifference, advancement]`, but a refactor returns `[bias, advancement, materialDifference]`. Both vectors contain finite numbers and the same length. Explain why shape validation cannot catch the full error and what identity must change.

```sh
node cli.mjs attempt 3.2-p1 --answer 'your diagnosis and repair'
node cli.mjs feedback 3.2-p1
```

## Fit a prediction error, not a preferred answer

Squared error measures the distance between a prediction and its labelled outcome. For a single example, use half the squared difference, `(prediction - target)² / 2`; the half simplifies its derivative. Gradient descent adjusts weights opposite the loss gradient. For a linear prediction, each coordinate's gradient is the prediction error multiplied by that feature. Batch fitting averages gradients across the chosen examples; stochastic fitting updates from individual examples in a declared order.

As a worked sibling, suppose one example has feature 0.5, target 1, and current weight 0. The prediction is 0, the error is -1, and the gradient is -0.5. A small step opposite that gradient increases the weight. It should move the prediction toward 1, not away from it. This sign check is useful before running thousands of updates.

A learning rate controls step size. A rate that is too large can make loss oscillate or explode. A constant or redundant feature may make some fitting formulations singular. Handle these cases explicitly; do not allow NaN weights to reach search. A stable regularized fit or an appropriate gradient method can both be valid.

**Commit 3.2-p2.** Training loss grows every epoch, and doubling the learning rate makes growth faster. Name two checks that distinguish a wrong gradient sign from an excessively large correct step. Explain why running more epochs is not the first repair.

```sh
node cli.mjs attempt 3.2-p2 --answer 'your diagnostic experiments'
node cli.mjs feedback 3.2-p2
```

## Demonstrate that the model learned from its inputs

Complete the two functions and run:

```sh
node cli.mjs check 3
node cli.mjs fit ./work/behavior.json --out ./work/value-model.json
```

Inspect the saved source and checker messages. A genuine fitter changes appropriately when relevant targets change. Returning a copied constant vector is not training, even if it happens to score well on one fixture. Test a small dataset whose expected relationship you can calculate independently before trusting game data.

The `fit` command supplies episode transport and grouped splitting, then calls your feature and fitting functions. Inspect the resulting weights and metrics. This command does not require the opponent sampler from module 5.

Compare training and validation prediction error, retaining the initial weights and configuration. Lower training loss with worse validation loss is a useful finding, not a reason to move validation examples into training without recording the change. Predictive accuracy also differs from playing strength: a model can reduce error on common easy positions yet mishandle a rare decisive move.

**Commit 3.2-p3.** A fitter reduces training error, barely changes validation error, and chooses worse moves. Give one data explanation and one feature/model explanation. State the next controlled comparison you would run rather than declaring learning a success or failure from one number.

```sh
node cli.mjs attempt 3.2-p3 --answer 'your explanations and next comparison'
node cli.mjs feedback 3.2-p3
```

Keep the fitted weights, raw metrics and failed experiment. Lesson 3.3 will put those weights into the same search you already tested.
