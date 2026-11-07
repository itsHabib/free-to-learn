# Practice feedback for Project7

Open after choosing on [m07-practice.md](m07-practice.md). Preserve the original answer and any later correction.

## m07-distinct-layouts

Correct choice: b.

Entry address=0x7000+2=0x7002. Direction=0x44=68; packed=68+256*2=580=0x0244. State pointer is independently supplied as 0x9000.

- **a.** The file buffer and mutable state are separate objects. The decoder reads at entry address 0x7002; the operation receives state pointer 0x9000 plus the decoded value, not the state pointer as record bits.

- **b.** Direction is 0x44=68 and amount is 2, so packed value is 68+2*256=580=0x0244. The stated state pointer remains 0x9000 regardless of the entry's file offset.

- **c.** Offset 2 must be added to the file base to form an entry address. The declared packing puts direction in the low byte, yielding 0x0244; neither an offset nor byte order can be substituted by guess.

[Return to this question](m07-practice.md#m07-distinct-layouts).

## m07-competing-hypotheses

Correct choice: a.

Start (2,0). U3: (2+3,0+3)=(5,3). D6 proposes 5-6=-1<0, so state remains (5,3). Continue U1: (5+1,3+1)=(6,4), 3 events. Stop after D6: (5,3), 2 events.

- **a.** U3 reaches (5,3). D6 proposes -1 and is rejected, retaining (5,3). Continuing evaluates U1 and reaches (6,4); stopping records the rejection as event 2 and never evaluates U1.

- **b.** D6 is well-formed but would exceed the floor bound. The supplied toy rule leaves both state values unchanged on rejection; it does not add the rejected six units to travel.

- **c.** The explicit difference between hypotheses is whether U1 is evaluated after rejection. Its accepted change from (5,3) to (6,4) makes this sequence discriminating.

[Return to this question](m07-practice.md#m07-competing-hypotheses).

## m07-invariant-diagnosis

Correct choice: c.

u,d>=0 imply u+d>=abs(u-d). For floor 4 from floor 1, abs(displacement)=3. Travel 1<3 is impossible. Controls: U3 gives (4,3); U4,D1 gives (4,5), both respecting bounds.

- **a.** U3 alone reaches floor 4 with travel 3, staying inside the bounds. No downward move is required; this is a valid example satisfying the ledger.

- **b.** U4 then D1 stays within floors 0..6 and reaches floor 4 with travel 5. Opposite-direction travel can exceed net displacement.

- **c.** The exact ledger gives travel=u+d and displacement=u-d, with u,d nonnegative. Therefore travel must be at least abs(4-1)=3. A reported travel of 1 violates this necessary condition.

[Return to this question](m07-practice.md#m07-invariant-diagnosis).

## m07-published-state

Correct choice: b.

Speculative accepted movement: u=3+1=4,d=0, so f=2+4=6,t=4. Published no-commit history has u=d=0, so f=2,t=0. Both satisfy their own ledger; substituting u=4 into final f=2 mixes state versions.

- **a.** The snapshots explicitly describe changing working state. A final reset can coexist with internal updates to a working copy; the output alone cannot establish absence of stores.

- **b.** Accepted speculative moves total 3+1=4, reaching floor 6. The reported final retains initial (2,0). An invariant must name whether it describes speculative accepted movement or committed movement.

- **c.** That equivalence is the hypothesis under investigation, not an interface guarantee. These supplied observations distinguish event snapshots from the final publication result.

[Return to this question](m07-practice.md#m07-published-state).

## m07-evidence-boundary

Correct choice: a.

Output equality on a set S constrains the composition replay(decode(raw)) for raw in S. It does not uniquely identify decode: a reversible relabeling P can be canceled by replay composed with inverse(P). Required keys and bounds do not rule out every such semantic error.

- **a.** Shape constrains structure, while six matches support end-to-end behavior on six cases. Cite offsets, widths, byte order, discriminating mutations and actual value flow to support each field meaning independently.

- **b.** A well-shaped dictionary can attach a label to the wrong byte. If replay compensates for that mismatch, final outputs can agree while the decoder boundary remains wrong.

- **c.** Repeated cases can check repeatability but do not create a new distinction between equivalent end-to-end explanations. Design evidence that observes or separates the claimed field boundary.

[Return to this question](m07-practice.md#m07-evidence-boundary).
