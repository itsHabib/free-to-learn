# Retained third-party material and attribution

These exceptions are outside the Free to Learn original-material grant. Their bytes and existing notices are preserved; no new ownership or replacement license is asserted.

## Eval fonts

`courses/agent-evals/fonts/IBMPlexMono-Regular.woff2` and `IBMPlexMono-Medium.woff2` retain IBM's SIL Open Font License 1.1 and reserved-font-name terms. The complete copyright and license notice is `courses/agent-evals/FONT-LICENSE.txt`. Keep that notice with the fonts.

## Runtime pretrained assets and publisher material

`courses/small-llm-runtime/fixtures/trained/stories260K.bin` and `tok512.bin` retain the pinned publisher's stated terms. The included `manifest.json` records exact source URLs, revision, sizes, hashes and header; `publisher-README.md` is the retained publisher declaration. `publisher-reference-project-LICENSE.txt` is the complete MIT notice from the publisher's related reference project, attributed to that source; it is not represented as a license file retrieved from the model repository. Retain all those existing notices and provenance with redistributed assets. The original course implementation is separate. No blanket clearance of training-corpus rights is asserted.

## Firmware public classroom test material

The Ed25519 public-key values in `courses/firmware-forensics/trust/crypto.mjs`, the two public-key `.hex` files and five `.sig` fixtures in `trust/fixtures/` use the published RFC 8032 section 7.1 classroom vectors. Their public origin and limitations remain described in the included trust README and SOURCES.md. Free to Learn does not claim ownership or relicense the underlying published test values. The original verification implementation is MIT. These fixtures do not authenticate a vendor or authorize any device operation.

## License texts and external references

The copied third-party notices retain their own terms. Creative Commons dedicates its legal-license text to the public domain under CC0, as stated in the included legal code. The root MIT text grants rights in the identified original software, not ownership of standard license wording. Public bibliographic links do not license external books, websites or assets, and no external reference media is granted by this repository's original-material licenses.

## Anti-cheat Engineering

Courier Lab's teaching/runtime/control files are original Free to Learn
material under the split code/content licenses. The optional, non-vendored
axe-core dependency listed for author accessibility tooling retains MPL-2.0;
no third-party package code is included or required for course setup/offline
checks. The reading references remain links, not relicensed source material.

## Additional original course projects

Tiny Browser, portable Sandbox, Blockchain, Onion Routing and Agent League contain
original educational implementations with linked primary references; those references
and the installed Node/Rust/Python runtimes are not relicensed or bundled here. Tiny
Browser's diagnostic glyph data is original course data, not an external font asset.
Advanced Storage retains runtime/FOUNDATION-NOTICE.md and the complete accompanying
runtime/LICENSE-FOUNDATION-MIT.txt for its supplied Free to Learn foundation. Those
notices remain byte-identical. Original project code is MIT and original lesson prose
and illustrations CC BY4.0 under LICENSE.md; existing explicit third-party/model terms
and notices take precedence. Keep these notices with copies, including matching ZIPs.

## Sightline and two part-two courses

Sightline, Time-travel Debugger part two and Anti-cheat Engineering part two are
original Free to Learn material under the split licenses in LICENSE.md. Sightline's
fixtures/recorded/ holds measurement records of two models run locally on Ollama,
llama3.2:1b and qwen2.5:7b. No model weights, Ollama code or other third-party
code is included, and those models keep their own terms.

## Quantum Link Lab

The eight Delft parity counts are numerical results reported by Hensen et al. (2015), Fig. 4a. The paper, archive, and individual time-ordered measurements remain at their original sources. The local table preserves the reported counts. See the [measurement provenance](courses/quantum-link-lab/fixtures/README.md). The book guide describes cited publications and contains no book scans or source text.

Original learner code and lesson materials follow LICENSE.md. Film typography is rendered into pixels; no font programs are distributed.

The four original scripts are voiced with the included en-us formant voice of eSpeak NG 1.52.0. The files carry the generated speech. The eSpeak NG program, dictionaries, and model files remain external tools. [Production credits and sources](courses/quantum-link-lab/films/REBUILD.md).

## Frame Perfect

Frame Perfect, its game Kettle, the lessons, the bench page and the films' scripts and drawings are original Free to Learn material under the split licenses in LICENSE.md. The films are narrated by Pip, the channel's voice: Kokoro voice af_heart from the Kokoro-82M speech model (Apache License 2.0), run locally with kokoro-onnx 0.6.1 (MIT License). The files carry the generated speech; the model, its voices and kokoro-onnx remain external tools and are not included.

The films' text is set in two fonts whose files are included in `courses/frame-perfect/films/fonts/`, each under the SIL Open Font License 1.1 with its license beside it:

- Barlow (barlow-medium.ttf, barlow-semibold.ttf), Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow). License: `barlow-license.txt`.
- IBM Plex Mono (IBMPlexMono-Regular.woff2, IBMPlexMono-Medium.woff2), Copyright © 2017 IBM Corp. with Reserved Font Name "Plex". License: `plex-license.txt`.

These fonts are not covered by LICENSE.md.
