// GLSL twin of coherent-branch.asm (function form; see lambert.glsl).
// Precision: as in checker-branch.glsl, a pixel within a rounding step
// of a stripe edge (fract(u) = 0.875) can take the other side; the
// sheen is 0 there, so such a pixel differs only by the stripe's
// glint, which is 0 at the edge too: within 1 level either way.
const vec3 gold = vec3(1.0, 0.78, 0.3);

vec3 shade(vec3 color, vec2 uv, vec3 n) {
  float f = fract(uv.x);
  if (f >= 0.875) {
    float t = (f - 0.9375) * 16.0;  // -1 to 1 across the stripe
    t = 1.0 - t * t;                // 1 at the centre, 0 at the edges
    float sheen = t * t;
    vec3 c = (gold - color) * sheen + color;
    float glint = sheen * sheen;
    glint = glint * glint;
    return glint * 0.2 + c;
  } else {
    return color;
  }
}
