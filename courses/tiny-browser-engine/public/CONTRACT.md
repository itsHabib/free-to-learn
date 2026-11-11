# Your engine interface

This is the public programming contract for the local TBE-1 candidate. The runtime, source parsers, diagnostics UI, font, rasterizer, packet import and notebook are supplied. The eight returned methods are your work. Public checks are finite, source-visible practice controls. Their expected observations are not hidden exam answers.

The editor accepts an ordinary JavaScript function body with a `support` argument. Return an object with `buildDOM`, `mutate`, `styles`, `layout`, `display`, `target`, `dispatch`, and `invalidation`. Do not put `import` or `export` statements in the editor. The same body can be checked through the supplied Node command. No author implementation is included in the learner package.

## Supplied support

`fail(code,message,detail)` throws a located diagnostic; `copy(value)` clones plain records; `node(doc,id)` resolves a handle or throws; `connected(doc,id)` tests connection to the root. `defaults` is the property registry, `tags` the supported tag set, `identifier` the ID/class pattern, and `textValue` the ASCII/length validator. `inside(rect,x,y)` uses half-open membership. `intersect(a,b)` intersects rectangles. `LIMITS` names resource limits. Read the actual `support.LIMITS` fields instead of inventing fallback bounds: `nodes`, `depth`, `rules`, `text`, `packet`, `commands`, `width`, `height` and `extent`. Their values are part of the supplied profile; `nodes` bounds retained records (including detached records), while `depth` bounds nesting.

Support does not implement matching, layout, painting order, hit selection, event propagation or invalidation for you.

## M1: buildDOM(tokens)

Tokens are supplied records:

- Start: `{kind:'start',tag,attrs,span:[start,end]}`. `attrs.class` is a unique ordered array when present; `attrs.id` is an optional string.
- End: `{kind:'end',tag,span}`.
- Text: `{kind:'text',text,span}` with entities already decoded.

Return `{nodes,root,nextId,revision:0}`. Nodes are an array in creation order. Each has `{id,kind,parent,children,span}`. IDs start at 1 and increase. Element nodes also have `tag` and `attrs` (always including a class array). Text nodes have `text`. Parent is a numeric ID or null. Children is an ordered numeric-ID array. Root is the single main element. nextId is the next unused numeric ID.

Reject mismatched closing tags, unclosed elements, multiple roots, non-main root, non-whitespace outside the root, duplicate connected HTML IDs, excessive nodes and depth. Keep whitespace text inside the tree. The current supplied intake accepts five tags and quoted id/class only; it does not repair general HTML.

## M1: mutate(doc, operation)

Modify the passed document on success and return `{status:'applied',revision,created}`. `created` is the new handle for creation, otherwise null/absent. A true no-op returns `{status:'noop',revision}`. Invalid operations return `{status:'rejected',revision,code,message}` without changing doc. Increment revision once per applied operation; no-op/rejection does not increment it.

Supported operation shapes:

- `{kind:'createElement',tag}` or `{kind:'createText',text}` creates a detached node.
- `{kind:'insert'|'move',nodeId,parentId,beforeId?}` attaches/moves an existing node. An absent/null beforeId appends it.
- `{kind:'remove',nodeId}` detaches a non-root subtree, retaining all identities.
- `{kind:'setText',nodeId,text}` requires a text node.
- `{kind:'setId',nodeId,value}`, `{kind:'removeId',nodeId}`, `{kind:'setClasses',nodeId,classes}` require an element.

Reject invalid handles, non-element parent, non-child anchor, cycles, root movement/removal, connected ID collision, invalid attributes or resource limits. Validate before detaching a node. Inserting before itself, removing an already detached node and appending an already-last child are no-ops. Detached records count toward the node budget.

## M2: styles(doc,rules)

The supplied rules include UA defaults and author rules. Each rule has `id`, `origin` (0 UA, 1 author), `order`, `parts` and `declarations`. A part has `atoms` and `relation`, where relation says how this part connects to its left neighbor: null, child or descendant. Atoms have `type` (universal, tag, id, class) and `value`. A declaration has property, normalized value and order.

Return an object keyed by numeric element ID. Each value is `{values,provenance,matched}`. values contains every property in support.defaults. provenance records the initial/inherited/winning source for each property. For a property won by a declaration, the required compatibility field is `provenance[property].source`, a string equal to that winning rule's `id` (for example `{source: "theme-rule"}` for an input rule with `id: "theme-rule"`). Additional diagnostic fields are allowed; a differently named key such as `ruleId` does not supply this field. This specifies the output record, not how to find the winner. matched is the array of matching rule IDs. Match only elements and include all connected elements, even under display none.

Rank each matching declaration by origin, lexicographic [ID,class,type] counts, rule order, declaration order. Inherit only color and line-height when no declaration supplies them. Other unspecified properties use defaults. Keep `auto` symbolic. Numbers for lengths are normalized integer pixels, not strings.

## M3–M4: layout(doc,styles,viewport)

Viewport is `{width,height,scrollY}`. Layout uses width; scrolling does not move document-space geometry. Return `{boxes,glyphs,height}`.

Each block box has `{nodeId,x,y,width,height,contentX,contentY,contentWidth,contentHeight,border,padding}`. x/y and width/height describe the border box; padding has top/right/bottom/left numbers. Boxes appear in document preorder. Used border is zero for style none. The four computed border widths/styles/colors must each be uniform, otherwise report unsupported geometry.

`box.border` is the single used uniform border width, expressed as a number (not a per-side object).

Block children stack at the parent's content origin. Auto width gets the available content width less its own horizontal padding/border, floored at zero. Explicit content width may overflow. Auto height encloses in-flow children or text lines; explicit height does not grow with overflow. A hidden subtree generates no geometry. Reject visible mixed block/inline content and block content inside an inline element. Ignore whitespace-only text between block children without deleting it from the DOM.

Each glyph fragment has `{char,nodeId,offset,ownerId,blockId,line,x,y,width:8,height:16,ancestors}`. nodeId/offset locate the original decoded text, ownerId is its nearest element, blockId identifies its containing block, line starts at zero in that block, and ancestors records inline ancestors. Store geometry and ownership, not cached paint color.

Collapse ASCII whitespace across inline boundaries; retain source of the first whitespace in a collapsed run. Trim line-edge spaces. A word may span nodes. Break only at spaces; exact fits stay; oversized words overflow one line and must terminate even at width zero. No line for whitespace-only content. Line height is max(block line-height, contributing inline line-heights); center 16-pixel glyph cells vertically with odd spare space below. The supplied raster glyphs are explicitly small-cap diagnostic art, with lowercase mapped to its uppercase drawing.

## M5: display(doc,styles,layout,viewport)

Return `{commands,regions}` in painter order. The supplied raster accepts:

- `{kind:'rect',x,y,width,height,color,nodeId,clip}`.
- `{kind:'glyph',char,x,y,color,nodeId,...,clip}`.

Colors are #RRGGBB; transparent background emits no fill. clip is an integer rectangle. Emit block background and border before descendants. The background fills the border box. Border strips must not leave gaps. An overflow-hidden element clips descendants at its padding edge, not its own border. Intersect with ancestor/viewport clips. Keep clipped and hidden semantics distinct.

A region has `{x,y,width,height,nodeId,clip}`. Export block border boxes and inline glyph/fragment intervals, including transparent regions. A glyph region targets ownerId. The local interface accepts per-glyph region segmentation; do not infer regions from visible glyph pixels. More complete inline ancestor fragment modeling remains a candidate-quality gap recorded in the handoff.

Check the visible supported profile when painting too. Reused geometry does not prove that a new style is supported: changing one border color can make borders nonuniform without a geometry change. Hidden unsupported geometry is checked when it becomes visible. Reject rather than silently approximating it.

## M5: target(display,point,viewport)

point is document-space `{x,y}`; the supplied host adds scrollY. Return the numeric ID of the last region containing the point in both its geometry and clip, or null. Enforce viewport bounds too. Left/top edges are included; right/bottom excluded; zero-area rectangles contain no point.

## M6: dispatch(doc,targetId,listeners,event,invoke)

Listeners have `nodeId`, boolean capture and a name/ID. The host binds these once at load. event has bubbles and cancelable. `invoke(listener,eventView)` is supplied; it performs the action's mutations and returns any `{stop,immediate,cancel,error}` flags. It does not decide propagation.

Build the initial target-to-root path before invoking. Visit ancestor capture groups root-first, target capture, target noncapture, then ancestor noncapture groups nearest-first when bubbles is true. Preserve registration order within groups. Both target groups report phase `target`; other phases are `capture` and `bubble`.

The M6 stage inspector runs a supplied full rebuild after the action: styles, then `layout(doc, styles, viewport)`, then display. The third layout argument is always the current viewport, including after dispatch. The previous layout is not an input to this interface. Check that a height-changing action moves later siblings and leaves finite geometry; a nonempty DOM alone does not establish successful post-event rendering.

Stop prevents later groups but not the current group's remaining callbacks. Immediate stop also ends the current group. Cancel sets cancellation only for cancelable events. Mutations are synchronous through invoke, but the original path remains fixed. Catch a callback failure into evidence; it must not look like a successful dispatch. Return `{path,trace,canceled,failed}`; each trace row names target, currentTarget, phase, listener and returned flags. The exact TBE group semantics are declared behavior; full native event conformance is not claimed.

The supplied packet may have `listeners` and `defaultActions`, each an array of `{id,action:[operations...]}` with at most 128 bindings and 64 actions per binding. Listeners may additionally name `capture` and `name`. Both arrays bind HTML IDs to engine handles once at load. Supplied actions include the DOM operations plus `{kind:'toggleClass',id,className}`, `{kind:'stop'}`, `{kind:'immediate'}` and `{kind:'cancel'}`. An `id` on a mutation action resolves a currently connected element; a numeric `nodeId` remains a direct handle.

After dispatch, the host runs a supplied default action only when its bound handle equals the target and the result is not canceled. This is a deliberately narrow application convention, not HTML activation behavior. It does not search button ancestors or navigate. Earlier ordinary listener mutations are not undone by cancellation.

## M7: invalidation(change)

Before style: change has `phase:'before'` and a type (initial, mutation, text, resize, scroll or noop). Return `{restyle:boolean}`. The coordinator then supplies computed-value differences in `phase:'after'`: geometryChanged, paintChanged, structureChanged and textChanged. Return `{layout:boolean,paint:boolean}`.

Initial load requires all stages. A text or structure change and a viewport-width resize require layout and paint. A paint-only computed effect needs paint but no layout. Scroll needs updated display/clip/raster but no style/layout. A true no-op skips every stage. Full restyle and full layout on legitimate geometry changes are allowed; no optimal cache is required. Current coordinator rerasterizes each published frame, even when display is reused; raster-call optimization is not assessed.

Successful publication assigns a new frame ID even when the stage products are reused. `frame.documentRevision` says which DOM revision was evaluated; a retained old picture after failure keeps its older revision and is marked stale. Coordinate/keyboard activation rejects stale frames. An explicit DOM operation may repair the retained session; recovery performs a fresh full evaluation. A source edit starts a new session instead. Worker timeout terminates the session while preserving the committed notebook attempt.

`frame.stages` records each product's successful generation, original build revision, current validated-for revision and viewport dependency. `frame.schedule` records the decisions that published that frame. The session's `lastFlush` also retains failed/reused/computed stage outcomes. Counters count real calls, including calls that throw; a failed call does not increment a published product's generation.

## P3 transfer and limits

Use the field-reference packet, then create one additional conforming page. Preserve your first failure, identify the first divergent stage, repair the general engine rule, and rerun earlier checks. Export source, packet, interactions and diagnosis. The source body, public profile and recorded inputs define the claim; a matching screenshot or success count alone does not.

The field packet and M8 checks are public rehearsal. A reviewer-supervised final uses a newly supplied packet after the first source is frozen. It must change dependencies or topology, not only names/colors. The private author instrument is not included in learner delivery; local finite checks cannot authenticate human mastery.

This is a local candidate. No network fetches, arbitrary page scripts, full browser parser recovery, flex/grid/table layout, transforms, Unicode shaping, native forms or accessibility-tree engine are promised. The workbench supplies keyboard actions and text inspection, but actual browser/accessibility review is pending.
