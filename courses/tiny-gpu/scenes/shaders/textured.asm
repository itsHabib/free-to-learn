; A texture fetch times Lambert: colour x texel x light.
.in r g b u v nx ny nz            ; r0-r2 colour, r3 r4 uv, r5-r7 normal
.const light 0.30305 0.80812 0.50508  ; unit vector towards the light
tex r8, r3, r4, floor             ; r8 r9 r10 r11 = texel RGBA (nearest)
mul r12, r5, light.x
mad r12, r6, light.y, r12
mad r12, r7, light.z, r12         ; n . light
max r12, r12, 0
mad r12, r12, 0.8, 0.2            ; 20% ambient, 80% diffuse
mul r0, r0, r8
mul r1, r1, r9
mul r2, r2, r10
mul r0, r0, r12
mul r1, r1, r12
mul r2, r2, r12
out r0, r1, r2
