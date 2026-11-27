; Lambert diffuse: the vertex colour times how squarely the surface
; faces a fixed light, plus a little ambient so shadowed faces are
; not black. Normals are unit length (each face has one normal).
.in r g b nx ny nz                ; r0 r1 r2 = colour, r3 r4 r5 = normal
.const light 0.30305 0.80812 0.50508  ; unit vector towards the light
mul r6, r3, light.x
mad r6, r4, light.y, r6
mad r6, r5, light.z, r6           ; r6 = n . light
max r6, r6, 0                     ; a face turned away gets no light
mad r6, r6, 0.8, 0.2              ; 20% ambient, 80% diffuse
mul r0, r0, r6
mul r1, r1, r6
mul r2, r2, r6
out r0, r1, r2
