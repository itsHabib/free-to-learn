# PocketDecoder-v1 public API

All code uses CPU JavaScript Number values and row-major arrays. numeric.mjs
supplies projection, vectors and validation without depending on another course.
spec.mjs is the exact original configuration and vocabulary contract.

## Model

loadModel(text,expectedSha256) is async. Validate the exact text digest before
using JSON. Return {format,config,vocab,weights,fingerprint}. The format is
ivy-pocket-json-v1. fingerprint is the validated SHA-256. Keep weights immutable.
Unknown, missing, malformed or nonfinite weights are rejected.

Weights are objects {shape,data}. Required names and shapes:

- embedding [32,8], finalNorm [8], lmHead [8,32].
- For each block l=0,1: layers.l.attnNorm [8], wq [8,8], wk [8,8], wv [8,8],
  wo [8,8], ffnNorm [8], w1 [8,16], w2 [16,8], w3 [8,16]. Each name includes
  the same layers.l. prefix. Extra names are rejected.

The config is {architecture:'pocket-decoder-v1',vocabSize:32,dim:8,heads:2,
layers:2,hidden:16,maxContext:32,ropeBase:10000,epsilon:1e-5}. Object field order
has no mathematical significance; validate fields by name.

encode(text) iterates Unicode code points. Vocabulary is EOS, unknown, newline,
space, a..z, period, comma. Unsupported characters become ID 1. decode(ids) omits
EOS, renders unknown as the replacement character, rejects invalid integer IDs.

## Numeric functions

- softmax(scores): finite scores or -Infinity masks; nonempty with at least one
  unmasked value; reject NaN and positive Infinity. Subtract max before exp.
- silu(number): x/(1+exp(-x)); finite input and finite output at tested extremes.
- rmsNorm(x,g,epsilon=1e-5): x*g/sqrt(mean(x*x)+epsilon), without centering;
  nonempty vectors, stable scaling before squaring large finite inputs.
- mlp(x,w1,w2,w3): (SiLU(x@w1) elementwise-multiply (x@w3)) @ w2.
- rotary(headVector,position,base=10000): even width, adjacent pairs; angle for
  pair at local j is position/base^(j/headWidth); nonnegative integer position.
- attention(query,keyRows,valueRows): softmax(q dot k / sqrt(headWidth)) weighted
  values; matching nonempty finite rows.

## Forward state

forward(model,tokens) returns {logits,cache}. logits has one 32-value vector per
token. Follow the complete pre-normalized residual block order in lesson 04.
prefill(model,tokens) returns {logits:lastLogits,cache}. Prompt is nonempty and
must fit context. Cache format is pocket-cache-v1, with model fingerprint,
position=processed-token count and layers:[{keys,values},{keys,values}]. Each
component contains position rows of width eight, with head vectors concatenated.
The exact required identity key is `fingerprint: model.fingerprint`, a validated
checkpoint SHA-256 string; it is not named modelFingerprint. Thus the cache schema
is `{format:'pocket-cache-v1',fingerprint,position,layers}`. Pocket uses the
checkpoint's embedded character vocabulary, so it has no separately required
`tokenizerFingerprint`. TRAINED.md specifies the trained profile's extra identity.
Keys have already received head-local rotary positions. Values are unrotated.

decodeStep(model,token,cache) validates the entire cache and token before changes,
uses old cache.position as the new zero-based position, appends one key/value per
block and returns {logits,cache:newCache}. Input cache remains unchanged. Reject
foreign fingerprints, malformed content or full context. A content-valid cache
can still belong to the wrong prompt; the capstone audits that separately.

## Sampling and generation

rng(seed) uses unsigned state=(imul(1664525,state)+1013904223) mod 2^32, returning
state/4294967296. Seed is 0..2^32-1. sample(logits,{temperature=1,topK=32},random)
ranks score descending then token ID ascending. Temperature zero returns the
first ID without a draw. Otherwise keep topK, subtract its maximum before dividing by temperature,
softmax and select the first cumulative interval greater than a draw in [0,1).
Require 32 finite logits and valid controls. The sample options object contains
only `temperature` and `topK`; either may be omitted to use the defaults above.
A stream adapter passes both resolved fields as `{temperature,topK}`. Do not
forward the generation-options object: `seed` is for `rng(seed)` and
`maxNewTokens` is the generation/iterator stopping budget. The guarded stream
checkpoint already checks this field boundary; object key order is immaterial.

generate(model,prompt,{maxNewTokens=8,seed=1,temperature=1,topK=32}) validates
settings before computation. Return {tokens,generated,text,stop,trace}. tokens
includes prompt; generated does not. EOS=0 is included in IDs but omitted from
decoded text. Stop immediately on EOS, then on context capacity, else on requested
limit. A full prompt returns context; zero new-token limit returns limit. Trace
records {position,token}. No extra decode occurs after stopping.

Capstone: create project.mjs, exporting async runProject(runtime,model,spec).
spec={prompt,cache,maxNewTokens,seed,topK}; return {generation,differences}, with
differences containing {layer,component,maxError} for replay discrepancies above
1e-8. No findings for a valid cache. Reasoning evidence is specified in RUBRIC.md.

## Bounded capstone search extension

Create your own `beamDecode(runtime,model,prompt,{beamWidth,maxNewTokens})` in
project.mjs. It may return a result directly or a Promise. Both options are
required integers 1..4. The prompt is a dense nonempty array of valid integer
IDs, strictly shorter than model.config.maxContext. Read vocabSize and
maxContext from the validated model. Initial qualification uses the original
32-token/context32 fixture and EOS 0. No new architecture or model is supplied.

Return `{candidates:[{generated,text,logProbability,stop}]}`, at most beamWidth,
in ranked order. generated excludes the prompt and includes an emitted EOS;
text is runtime.decode(generated). Score by summing full-vocabulary,
temperature 1 log probabilities. Use stable log-softmax:
`(logit-max)-log(sum(exp(eachLogit-max)))`. Require dense finite logits and
finite computed scores. Rank by descending cumulative score, then ascending
numeric lexicographic generated IDs for exact score ties; shorter prefix first.
Score comparison uses atol 1e-10 plus rtol 1e-9 times the larger magnitude. That
tolerance does not define ranking ties. No top-k, RNG or length normalization.

Start with one prefill. Expand every active retained candidate by every token;
carry terminal candidates unchanged. Rank the combined pool and retain at most
beamWidth, with no separate completed pool. Decode only retained active children
that need another round, passing each child's last token with its own parent's
cache. Preserve caller/sibling cache contents; immutable sharing and copying are
both valid. Stop on EOS first, then context capacity, then token budget; stop the
search when all retained candidates are terminal. At most one prefill plus
beamWidth*(maxNewTokens-1) decodeStep calls (maximum 13). This is an operation
bound, not a measured speed or memory promise.

Use only runtime.prefill, runtime.decodeStep and runtime.decode. Invalid
controls/tokens, invalid logits or nonfinite computed scores reject clearly.
Propagate runtime errors and preserve caller state. The checks record validation
timing without requiring an extra zero-prefill rule for invalid arguments.
Unknown option-field policy is outside this bounded profile.

Public beam checks disclose finite synthetic tapes and expected outcomes. They
provide no search solution and cannot establish authorship or mastery. The
original-model check compares width 1 with greedy and rescores returned paths
through fresh prefixes. Your unfamiliar branching experiment and retained
wrong-control repair remain separate evidence. This extension earns no
pretrained language-quality, other-architecture or full-course claim.

## Capstone baseline streaming

In your own project.mjs, also export
`streamGenerate(runtime,model,prompt,options={})`, returning an async iterator.
The runtime argument is your existing module. Its whole-result generate and
runProject contracts remain unchanged. The options/defaults are those of
generate. Model metadata and token IDs use the same pinned architecture.

Construction performs no runtime work. The first next() validates the prompt
and controls before prefill, sampling or RNG work. Each pull returns one event:

- `{type:'token',index,position,token}` for each generated ID, including EOS;
  index starts at0 and position is prompt.length+index.
- `{type:'complete',result}` once, after the final token; result has generate's
  complete tokens/generated/text/stop/trace shape. The iterator then ends.

The consumer must receive a token before computation for the next token begins.
Use one prefill, then cached decode only when another token is needed. Do not
call generate and replay its finished output. Each generation has its own RNG;
greedy sampling draws nothing. Zero limit/full context emit no token and do no
prefill/decode/sample/RNG work. As in the current generate implementation, zero
limit takes precedence if the prompt is also full. After a sampled token, EOS
takes precedence over context and requested limit. No later decode is allowed.

A runtime error rejects the pending pull with that error unchanged; retain the
consumer's previously delivered prefix. Do not emit a normal completion or
invent an error stop. Later pulls may end or reject, with no new runtime work.
Preserve caller inputs. This contract qualifies sequential pulls only; it adds
no cancellation, concurrent-pull, transport, text-delta or resumption claim.
Streaming is required baseline behavior and does not earn distinct beam-search
extension credit. The current untrained fixture is numeric evidence only.

## Trained final profile

The contracts above remain the earlier PocketDecoder numerical slice. Your final
trained.mjs and trained-project.mjs use the exact distinct asset/header/tokenizer,
GQA/cache and stopping contract in [TRAINED.md](TRAINED.md), with the same guide
rendered at [trained.html](trained.html). No author decoder is supplied.
The trained namespace takes binary model/tokenizer bytes and model-bound encode/decode;
it must not pretend the pocket32-token configuration can load those weights.
