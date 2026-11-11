# Finish with a real trained decoder

The first seven modules give you a small numerical model you can inspect. Now adapt those mechanisms to one pinned trained model and deliver a useful local text-completion tool. Your earlier runtime, predictions and attempts stay intact. This is the final part of lesson 08, not another course or a multi-model loader.

The model is Andrej Karpathy's Stories260K from revision `0bd21da7698eaf29a0d7de3992de8a46ef624add`. Its publisher states TinyStories pretraining and marks the repository MIT. The exact checkpoint, tokenizer, publisher license declaration and related publisher MIT notice are included under `fixtures/trained/`; `manifest.json` keeps their source URLs, sizes and hashes. No account, download, GPU, training corpus, hosted inference or inference bill is needed. It is a tiny story model, not a general assistant or a promise of reliable answers.

## Keep the prediction before the result

Write your first predictions in `work/data.json` or `work/REPORT.md` before the first trained check. Choose your own short prompt. Predict which dimensions differ from the pocket model, which query heads share a KV head, how positions change when BPE merges several characters, and what a buffered generator would do to consumer delivery. Keep the original question/text, help and every failed attempt. Public goldens/checks disclose expectations; passing them does not establish authorship or mastery.

Start with the documented course workspace. A new `lab.mjs start` creates `work/trained.mjs` as TODO code beside your earlier `runtime.mjs`. For an older exported workspace, use the new package's `node lab.mjs trained-start ./work`; it refuses to overwrite a trained file. Create `work/trained-project.mjs` yourself. No completed project or trained decoder is supplied.

```sh
node lab.mjs check trained ./work --help-used "earlier modules and public guide"
node lab.mjs status ./work
```

The first TODO failures are expected. The ten named checks make the adaptation incremental: loader/tokenizer, forward goldens, cache, generation, streaming delivery, stops, error behavior, cache investigation, beam extension and trained beam stops/limits. Preserve each intermediate result. `check all` still means the earlier 01–08 pocket checks; `check trained` is this final profile. Neither substitutes for the other or grades your causal explanation.

You may use the existing optional `node lab.mjs support 08 ./work` to supply prerequisite modules 01–07. It preserves the earlier draft and records reference assistance. It never supplies `trained.mjs`, `trained-project.mjs` or their target mechanisms. Do not claim the supplied runtime as your own. The provided numeric backend remains independent of the tensor course.

## 1. Check the bytes before using them

`trained-spec.mjs` supplies profile and asset facts, not inference. Your `trained.mjs` must export async `loadModel(modelBytes,tokenizerBytes)`, taking Uint8Array bytes. Copy bytes before asynchronous hashing so later caller mutation cannot change what you parse. Require exact size and SHA-256 before using either binary; reject altered/truncated data. Do not import or execute a pickle.

- `stories260K.bin`: 1,056,540 bytes; SHA-256 `b0a507e7ad0f626624f17112325e66691f9076d622e1d3274d103d00299f2696`.
- `tok512.bin`: 6,227 bytes; SHA-256 `037cb335abb25d1fa9e8ecae30ed2a3a8ace9302862ebcdc05d51a6bbb10c312`.

The checkpoint starts with seven little-endian signed 32-bit integers, in this order: model dimension 64, feed-forward hidden size 172, layers 5, query heads 8, key/value heads 4, vocabulary size 512 and context length 512. A positive vocabulary count means the classifier shares the input embedding. The remaining values are little-endian float32 weights; promote to JavaScript Number for computation. Reject nonfinite values and unexpected trailing bytes.

Matrices are stored by output row, then input column. Reuse your projection with an explicit conversion or adapt its indexing; silently using the pocket storage orientation changes the model. Each group contains all five layers before the next group:

- token embedding: `[512,64]`
- attention normalization: `[5,64]`
- query projection: `[5,64,64]`
- key projection: `[5,32,64]`
- value projection: `[5,32,64]`
- attention output: `[5,64,64]`
- feed-forward normalization: `[5,64]`
- gate W1: `[5,172,64]`
- down W2: `[5,64,172]`
- up W3: `[5,172,64]`
- final normalization: `[64]`
- legacy rotary real, then imaginary: `[512,4] each`

Retain/check the legacy-table spans but compute head-local positions independently as before. There is no separate output-head tensor after them. Your returned model exposes `config`, exact checkpoint `fingerprint` and exact `tokenizerFingerprint`; internal weight storage is your choice. The required config values are in `trained-spec.mjs`. Preserve caller bytes and loaded weights. Accept only this pinned trained profile; no format zoo or altered-weight shortcut is needed.

## 2. Tokenize the trained vocabulary

The tokenizer starts with a little-endian int32 maximum piece byte length, 7. For each of 512 entries, read a float32 merge score, an int32 byte length and that many UTF-8 bytes. Consume exactly 6,227 bytes. The table starts with three special pieces: ID 0 is unknown, ID 1 is BOS (beginning of sequence) and ID 2 is EOS (end of sequence). IDs 3..258 are the exact `<0x00>` through `<0xFF>` byte fallback spellings. Do not treat their textual spelling as the decoded byte.

Export `encode(model,text,{bos=true,eos=false})` and `decode(model,ids)`. A nonempty input gets one dummy space before its codepoints. Prefer a vocabulary entry for a codepoint; otherwise emit its UTF-8 bytes as byte+3 IDs. Repeatedly merge the adjacent pair whose joined vocabulary entry has the greatest learned score; ties use the leftmost pair. Finish when no pair can merge. BOS/EOS controls are separate from the text, and no extra Unicode normalization is applied. For a lone UTF-16 surrogate, TextEncoder's replacement behavior applies.

Decoding joins byte fallback and ordinary piece bytes, omits special IDs 1 and 2 and renders unknown (ID 0) as the replacement character. Strip exactly one initial dummy space when the first supplied ID is BOS (ID 1). A generated sequence without BOS retains a leading separator space. State this behavior in your report; do not silently trim the bytes to match a display example. Test ordinary text, punctuation, newline, multibyte text and your own unfamiliar string. Characters, UTF-8 bytes and token positions have different counts.

## 3. Adapt the block and its state

Reuse your RMSNorm, gated SiLU MLP and adjacent-pair RoPE mechanisms. Epsilon is 1e-5, the rotary base is 10000 and the head width is 64/8 = 8. There are eight query vectors but four key/value vectors: heads 0/1 use KV0, heads 2/3 use KV1, heads 4/5 use KV2 and heads 6/7 use KV3. Sharing a KV vector within that pair is intended. Giving an advanced sibling cache to a different beam is still wrong.

Export `forward(model,ids)` returning `{logits,cache}` with one 512-number logit row per prefix position; `prefill(model,ids)` returns the last logit row and cache; `decodeStep(model,token,cache)` appends one position. Keep attention causal and use token positions, including BOS and dummy-space effects, for rotation. Compare against the independent scalar vectors and several appended positions before trusting sampled text.

The returned cache has the exact schema `{format:'stories260k-cache-v1',fingerprint:model.fingerprint,tokenizerFingerprint:model.tokenizerFingerprint,position,layers}`. Both fingerprint values are the validated 64-character SHA-256 strings: `fingerprint` identifies stories260K.bin and `tokenizerFingerprint` identifies tok512.bin. These property names are case-sensitive; neither is named modelFingerprint. `position` is the processed-token count and `layers` contains five `{keys,values}` objects. Each component has position rows of width 32, with rotated keys and unrotated values. Preserve the input cache, including caller writability/configurability/extensibility. JSON equality alone misses accidental freezing of a mutable copied row. Immutable sharing and copying are both valid. Validate complete cache shape, numeric content, identity, token and capacity before changes. Full position 512 refuses another step. All public vectors/rows are dense JavaScript arrays of finite Number values.

## 4. Generate with explicit limits

Export `rng(seed)`, `sample(logits,options,random)` and `generate(model,prompt,options={})`. Reuse LCG32: unsigned state becomes `(1664525*state+1013904223) mod 2^32`, returning state/2^32. Defaults are maxNewTokens 16, seed 1, temperature 1 and topK 512. The new-token budget is an integer 0..512; the prompt is a nonempty dense array of valid IDs with at most 512 tokens. Validate all settings even when no token will be emitted.

The sample options object contains only `temperature` and `topK`, defaulting to 1 and 512. Either field can be omitted when calling sample directly. In your stream adapter pass both resolved sampling fields: `runtime.sample(logits,{temperature,topK},random)`. Keep `seed` for `runtime.rng(seed)` and `maxNewTokens` for generation/iterator stopping; do not pass those generation fields through to sample.

Rank the 512 finite logits by descending score, then ascending token ID. Greedy temperature 0 draws nothing. Otherwise keep topK 1..512, subtract the retained maximum before dividing by positive temperature, softmax and select the first cumulative interval strictly above the draw. Use a separate RNG per generation. Zero limit wins if the prompt is also full. After emission, ID 1 (BOS) or ID 2 (EOS) stops the story with `eos`; otherwise context wins before requested limit. The generated terminal ID remains in IDs/trace and contributes no text. Both story delimiters are this course's explicit policy; upstream runners may choose different display/stopping rules.

Return `{tokens,generated,text,stop,trace}` exactly as before: tokens includes prompt, generated excludes it, and trace records each emitted `{position,token}`. No unnecessary decode follows a terminal token or limit.

The supplied launcher calls your code:

```sh
node trained-run.mjs ./work "A blue bird sat." --seed 42 --top-k 8 --max-new-tokens 16
node trained-run.mjs ./work "A blue bird sat." --mode stream --seed 42 --top-k 8 --max-new-tokens 16
node trained-run.mjs ./work "A blue bird sat." --mode beam --beam-width 2 --max-new-tokens 3
```

It is local process/file plumbing. It contains no trained decoder or search solution. Sampling flags apply to generate/stream; beam accepts its width and token budget and rejects sampling flags rather than silently ignoring them. Inspect code you choose to execute; Node runs your code with ordinary local permissions.

## 5. Keep the project yours

Export `runProject(runtime,model,spec)`, `streamGenerate(runtime,model,prompt,options)` and `beamDecode(runtime,model,prompt,{beamWidth,maxNewTokens})` from `trained-project.mjs`. You can adapt your own earlier project. The runtime argument binds `decode(ids)` and `encode(text)` to the loaded tokenizer; prefill/decodeStep/generate still take model first.

For the terminal trained check, an existing regular `work/project.mjs` is an optional snapshotted sibling: `trained-project.mjs` may import `./project.mjs`. The attempt records both its contents and hash, and status also notices its later addition, edit or removal. `runtime.mjs` and the supplied numeric/spec dependencies are already copied. No arbitrary local import graph is discovered: other local helpers must be kept inside these documented files or inlined. Work directories, the attempt directory and snapshotted/exported siblings must not be symlinks. This is snapshot containment, not a Node security sandbox; your code still runs with normal local permissions.

The existing lesson 08 contracts apply with the declared trained defaults, context 512 and `model.config.stopIds=[1,2]`. Stream construction is lazy. Each pull emits one `{type:'token',index,position,token}` before another token's computation, then exactly one `{type:'complete',result}` and end. No generate-and-replay. The pending pull rejects with the original runtime error unchanged. Subsequent pulls may end or reject, with no normal completion or new runtime work; their rejection need not reuse the original object. The delivered prefix remains available. Sequential pulls only; no cancellation, transport-latency or concurrent-pull claim is added.

Beam width and new-token budget stay 1..4. Use full-vocabulary cumulative log probabilities, global pruning including carried terminal candidates, exact-score numeric-token lexicographic ties and at most one prefill plus width*(budget-1) decode calls. Pass each retained child its own parent's unadvanced cache. Width 1 must match greedy. Fresh prefix rescoring must agree. Keep your original wrong-score or branch-state failure and controlled repair. The earlier separate unfamiliar branching example remains evidence of that work; now also demonstrate your search on the trained model. The cache audit and baseline streaming are required work, separate from the optional beam extension.

## 6. Diagnose and transfer

`fixtures/trained/mystery-cache.json` supplies a prompt and content-valid cache whose origin claim is worth testing. Validate identity/dimensions, replay the stated prompt, and retain the first logit discrepancy at several appended positions. Locate the earliest affected layer/component/row and explain a mechanism consistent with observed values. Repair with prompt/model/tokenizer/seed/settings held fixed. Include a valid-cache control and two additional prompts. Merely naming a component or seeing falling output loss does not explain the cache fault.

In runProject, spec is `{prompt,cache,maxNewTokens,seed,topK}`. Return `{generation,differences}`; each difference is `{layer,component,maxError}` for component replay discrepancies above 1e-8, and a valid cache has no findings. Your explanation, first prediction and experiments remain separately assessable; the public numeric checks do not grade their quality.

Write a small own consumer. Before running it, predict a zero/full prompt, both story delimiters, interleaved seeded streams and a later decode failure. Retain ordered pulls, delivered events, runtime calls, first failure and controlled repair. Choose a different prompt/seed/failure position for transfer, with the prediction before feedback. Preserve source/input identities and assistance; a known planted mutant is labelled as such. This is not a claim of a cold human trial.

For a standalone experiment without another runtime wrapper, your exported project can expose an extra function you call using the supplied `loadWork` helper. Put the executable experiment inside `trained-project.mjs` and its inputs in data.json. For example, after you define your own `runEvidence(runtime,model,data)`:

```sh
node --input-type=module -e 'import {loadWork} from "./trained-run.mjs"; import {readFileSync} from "node:fs"; const {runtime,model,project}=await loadWork("./work"); const data=JSON.parse(readFileSync("./work/data.json","utf8")); const result=await project.runEvidence(runtime,model,data); console.log(JSON.stringify(result));'
```

This example only loads/calls your function; no experiment implementation is supplied. Use a clearer equivalent command if you prefer and record its exact exit/result. Arbitrary local filenames are not automatically collected.

## 7. Export and explain the limits

```sh
node lab.mjs export ./work ./my-trained-runtime.zip
```

The explicit export includes trained.mjs, trained-project.mjs, the original runtime/project when present, supplied dependencies, data.json, REPORT.md and preserved attempts/reference assistance. It refuses overwrite. Unzip into a new directory and rerun both `node lab.mjs check trained ./work --help-used "fresh exported work"` and your standalone experiment/generation command. A public check pass alone does not establish standalone portability. Final trained work uses this terminal route; the browser workbench/editor/export still represents the earlier pocket exercises and does not silently import your terminal files.

The supplied model, CPU measurements and independent scalar goldens establish the specifically recorded supported profile. Keep actual measurements, checkpoint identity, all original failures and source/help history. Do not turn model size or a V8 heap option into a universal RAM promise. The tiny trained output does not establish general reasoning, language quality or arbitrary-model support. Node 26.5.1 on Darwin arm64 is the tested profile; minimum/other runtimes, physical devices, assistive-user and human-learning outcomes remain unverified. No staff queue or paid LLM judge is required.
