; Escape count: iterate z = z * z + c from z = 0, with c from (u, v),
; until |z| reaches 2 or 40 turns have run. The grey level is the
; number of turns. Each lane leaves the loop after its own count.
.in u v                           ; r0 = u, r1 = v
mad r2, r0, 3, -2.2               ; c.x from -2.2 to 0.8
mad r3, r1, 2.4, -1.2             ; c.y from -1.2 to 1.2
mov r4, 0                         ; z.x
mov r5, 0                         ; z.y
mov r6, 0                         ; n, the turns run so far
loop
  mul r7, r4, r4                  ; z.x squared
  mul r8, r5, r5                  ; z.y squared
  add r9, r7, r8
  sge r10, r9, 4                  ; |z| >= 2
  sge r11, r6, 40                 ; or 40 turns already
  max r10, r10, r11
  break r10
  mul r9, r4, r5
  mad r5, r9, 2, r3               ; z.y = 2 z.x z.y + c.y
  sub r7, r7, r8
  add r4, r7, r2                  ; z.x = z.x^2 - z.y^2 + c.x
  add r6, r6, 1
endloop
mul r6, r6, 0.025                 ; n / 40
out r6, r6, r6
