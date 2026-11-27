// GLSL twin of escape.asm (function form; see lambert.glsl).
// Precision: the turn count of a point near the set's edge is chaotic.
// If a GPU fuses z.x * z.y * 2.0 + c.y (or the c lines) into one
// rounding, a point that escapes on exactly turn n in the assembly may
// escape a turn earlier or later: 0.025 of white, about 6 levels.
// Points well inside or well outside match exactly.
vec3 shade(vec3 color, vec2 uv, vec3 n) {
  vec2 c = vec2(uv.x * 3.0 - 2.2, uv.y * 2.4 - 1.2);
  vec2 z = vec2(0.0);
  float turns = 0.0;
  for (int i = 0; i <= 40; i++) {
    float xx = z.x * z.x;
    float yy = z.y * z.y;
    if (xx + yy >= 4.0 || turns >= 40.0) break;
    z.y = z.x * z.y * 2.0 + c.y;
    z.x = (xx - yy) + c.x;
    turns += 1.0;
  }
  return vec3(turns * 0.025);
}
