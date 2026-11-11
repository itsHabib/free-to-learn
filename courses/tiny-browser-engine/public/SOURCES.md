# Sources and implementation limits

This is original course text and code, written for the bounded TBE-1 teaching profile. No book chapter, exercise solution, external runtime or font asset is bundled. The 5×7 diagnostic glyph patterns are supplied original data, displayed in 8×16 cells; lowercase intentionally shares the corresponding small-cap drawing.

Primary sources behind the declared model:

- WHATWG DOM: https://dom.spec.whatwg.org/ — tree relationships, mutations and event concepts. This course limits event registration and defines its own action protocol.
- WHATWG HTML parsing: https://html.spec.whatwg.org/multipage/parsing.html — the real parser is substantially more complex. This course supplies strict lexical intake and does not claim parser-recovery compatibility.
- CSS Cascade 5: https://www.w3.org/TR/2022/CR-css-cascade-5-20220113/ — origin, specificity, order and distinct computed/used values. This profile omits importance, layers and many CSS value forms.
- Selectors 4: https://www.w3.org/TR/2026/WD-selectors-4-20260122/ — selected simple/compound and child/descendant matching. This source is a Working Draft.
- CSS box model: https://www.w3.org/TR/CSS22/box.html
- CSS formatting and dimensions: https://www.w3.org/TR/CSS22/visuren.html and https://www.w3.org/TR/CSS22/visudet.html
- CSS overflow: https://www.w3.org/TR/CSS22/visufx.html
- CSS Text 3: https://www.w3.org/TR/2026/CRD-css-text-3-20260814/ — broad text-processing context. ASCII fixed metrics and vertical centering are explicit course simplifications.
- CSSOM View: https://www.w3.org/TR/2025/WD-cssom-view-1-20250916/ — observation APIs, not a complete exact hit-testing definition.
- Chromium authors on stages and structures: https://developer.chrome.com/docs/chromium/renderingng-architecture and https://developer.chrome.com/docs/chromium/renderingng-data-structures — implementation perspective, not a normative requirement for all browsers.

The local implementation is not a full browser. It omits network loading, arbitrary page JavaScript, HTML recovery, non-ASCII text shaping, flex/grid/tables, positioning/transforms, native form activation and a complete accessibility tree. The workbench supplies keyboard activation and text inspection, but its actual browser, screen-reader and phone behavior still require verification. Native-browser differential tests and independent course review have not run.

Finite checks assess their declared cases. They do not prove full conformance, optimal performance, authenticated authorship or human learning. The author demonstration is a prerecorded output; it never fills in a learner's code.
