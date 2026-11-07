# Source-cited programming risks

These are documented technical distinctions used to design practice and diagnostics. They are not measurements of learner beliefs, prevalence or learning. All examples and feedback are original; the sources are linked for the relevant definitions and cautions.

## M-R01

Tempting claim: Correct object fields in a different order describe a different JSON model schema.

Correction: Compare object members by name and value. Preserve order for arrays such as vocabulary entries. Byte identity is a separate check.

Practice: r01-order in module 01; later required code check: module 05, cache-cross-checkpoint-identity.

Source: RFC 8259: JSON Data Interchange Format — https://www.rfc-editor.org/rfc/rfc8259 (Section 1, Introduction)

Scope: A different serialization still has a different byte digest, which this course deliberately uses as the cache fingerprint.

## M-R02

Tempting claim: A value that JavaScript can convert into a finite number is already a valid numeric score.

Correction: Numeric validation must reject strings, null and missing values. The attention mask is the one explicit nonfinite exception.

Practice: r02-types in module 02; later required code check: module 06, sampling-wrong-score-types.

Source: MDN: Number.isFinite — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite (Difference between Number.isFinite() and global isFinite())

Scope: This is the original runtime input policy, not a statement that every JavaScript API must reject coercible values.

## M-R03

Tempting claim: Finite input coordinates guarantee finite intermediate arithmetic.

Correction: Squaring or dividing can overflow. Rearrange the same formula to keep intermediate magnitudes bounded.

Practice: r03-extremes in module 03; later required code check: module 06, sampling-small-temperature.

Source: PyTorch: Numerical accuracy — https://docs.pytorch.org/docs/2.14/notes/numerical_accuracy.html (Extremal values)

Scope: The examples establish specific binary64 failure modes, not universal guarantees about all numerical algorithms.

## M-R04

Tempting claim: RMSNorm subtracts the row mean just as LayerNorm does.

Correction: This RMS normalization rescales by root mean square and learned gains without mean subtraction.

Practice: r03-normalize in module 03; later required code check: module 04, forward-independent-oracle.

Source: Zhang and Sennrich: Root Mean Square Layer Normalization — https://arxiv.org/abs/1910.07467v1 (Abstract)

Scope: PocketDecoder fixes epsilon, dimensions and gains. The source paper does not define this whole architecture.

## M-R05

Tempting claim: A cached next token can restart its position at zero because only one new token is computed.

Correction: The new token follows the already processed prefix; its zero-based position equals the old cache length.

Practice: r04-position in module 04; later required code check: module 08, capstone-generator-audit.

Source: Transformers: Best Practices for Generation with Cache — https://huggingface.co/docs/transformers/v4.49.0/en/kv_cache (Under the Hood: How Cache Object Works in Attention Mechanism)

Scope: The course uses immutable, fingerprint-bound full-prefix caches and RoPE. It does not implement Transformers cache classes, padding, sliding windows or session-reset APIs.

## Source record

Sources were read October 27, 2026. The exact observed versions, relevant sections, original paraphrases and reuse boundaries are in misconceptions.json. No external implementation, purchased-book passage or image was copied. Source-backed content remains subject to the existing independent reviewer's delta acceptance.
