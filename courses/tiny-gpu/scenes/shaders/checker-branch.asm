; A checker of 8 x 8 squares in (u, v), shaded with a branch: dark
; squares take the if side, light squares the else side. Pixels on
; either side of a square's edge disagree, so a warp that straddles
; an edge runs both sides.
.in u v r g b                     ; r0 = u, r1 = v, r2 r3 r4 = colour
mul r5, r0, 8
floor r5, r5                      ; column
mul r6, r1, 8
floor r6, r6                      ; row
add r5, r5, r6
mul r5, r5, 0.5
frac r5, r5                       ; 0.5 on odd squares, 0 on even
if r5
  mul r2, r2, 0.3                 ; dark square: a dim, cool copy
  mul r3, r3, 0.35
  mul r4, r4, 0.45
else
  mad r2, r2, 0.6, 0.4            ; light square: towards white
  mad r3, r3, 0.6, 0.4
  mad r4, r4, 0.6, 0.38
endif
out r2, r3, r4
