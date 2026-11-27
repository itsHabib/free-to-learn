; A branch most warps agree on: a gold stripe over the last eighth of
; each unit of u. The condition changes only at the stripe's two
; edges, so nearly every 4 x 2 block is all inside or all outside and
; runs one side. The stripe side is long; the other is one line.
.in u v r g b                     ; r0 = u, r1 = v, r2 r3 r4 = colour
.const gold 1.0 0.78 0.3
frac r5, r0                       ; 0 to 1 across each unit of u
sge r6, r5, 0.875                 ; the last eighth is the stripe
if r6
  sub r7, r5, 0.9375              ; -0.0625 to 0.0625 across it
  mul r7, r7, 16                  ; -1 to 1
  mul r7, r7, r7
  sub r7, 1, r7                   ; 1 at the centre, 0 at the edges
  mul r8, r7, r7                  ; a sharper sheen
  sub r9, gold.r, r2
  mad r2, r9, r8, r2              ; colour + (gold - colour) * sheen
  sub r9, gold.g, r3
  mad r3, r9, r8, r3
  sub r9, gold.b, r4
  mad r4, r9, r8, r4
  mul r8, r8, r8
  mul r8, r8, r8                  ; a narrow glint on top
  mad r2, r8, 0.2, r2
  mad r3, r8, 0.2, r3
  mad r4, r8, 0.2, r4
  out r2, r3, r4
else
  out r2, r3, r4                  ; outside the stripe: the colour
endif
