# Supplied recoverable-store foundation

These two files are supplied prerequisite work from **Free to Learn — Recoverable Storage**, not learner-authored Advanced Storage code.

- `foundation.mjs`: executable `source` from public `support.json` stage 07, accepted source commit `43da55015fd39b04033023a4b0a5eba6f20880ea`; SHA-256 `dffd993b862ce0a657eb75018acc3aea8ae2dd33d55bce7e0c4ddc35eaa53473`.
- `disk.mjs`: `public/disk.mjs` from the same accepted source; SHA-256 `687b715b521a4a4c4c49021ca7971cf869f17d93ad1c854624e41a3d92169dde`.

## Existing MIT coverage and attribution

**Copyright (c) 2026 Free to Learn.** These two code components retain the existing MIT coverage recorded in the licensed Free to Learn export of 2 November 2026. Both files match that export byte-for-byte. Its file-level scope identifies the executable code in `support.json` and `public/disk.mjs` as MIT; narrative lesson content is a separate part of the original export's scope.

The complete, unchanged copyright and permission notice is supplied in [LICENSE-FOUNDATION-MIT.txt](LICENSE-FOUNDATION-MIT.txt). Retain it with copies or substantial portions of these two software components, including exported learner projects. The standard MIT text controls; this note adds no restrictions to that grant.

This notice records existing coverage for `foundation.mjs` and `disk.mjs` only. It does not license newer Advanced Storage code, lesson material or other assets, and it does not authorize a repository visibility change, publication or deployment. Rights elsewhere and release actions remain separate matters.

The original public support notice identifies earlier-layer source as explicit assistance. Do not submit this supplied engine as learner-owned implementation; the learner's client experiments and reports must be their own.

The inherited fault model covers process interruption, short writes and atomic replacement. It does not establish universal power-loss durability. The Advanced Storage learner does not reimplement WAL, framing, recovery or compaction.
