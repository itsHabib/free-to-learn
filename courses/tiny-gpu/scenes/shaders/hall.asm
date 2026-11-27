; The hall's stone: texel times vertex colour, lit by a light ahead
; and above the camera, with a third of the light from everywhere so
; faces turned away from it are not black.
.in r g b u v nx ny nz            ; r0-r2 colour, r3 r4 uv, r5-r7 normal
.const light 0.29963 0.69913 0.64919  ; unit vector towards the light
tex r8, r3, r4, stone             ; r8 r9 r10 = texel colour
mul r12, r5, light.x
mad r12, r6, light.y, r12
mad r12, r7, light.z, r12         ; n . light
max r12, r12, 0
mad r12, r12, 0.66, 0.34          ; 34% ambient, 66% direct
mul r0, r0, r8
mul r1, r1, r9
mul r2, r2, r10
mul r0, r0, r12
mul r1, r1, r12
mul r2, r2, r12
out r0, r1, r2
