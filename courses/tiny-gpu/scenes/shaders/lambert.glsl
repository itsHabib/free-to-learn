// GLSL twin of lambert.asm, in the comparison page's function form:
// the page adds the #version line, highp precision and the varyings,
// and calls shade() with the interpolated colour, uv and normal.
// highp float is float32, so each line below rounds as the assembly
// does. One place may differ: a GPU may fuse a * b + c into one
// rounding where the assembly's mad rounds twice (a last-bit change,
// far below one 8-bit level).
const vec3 light = vec3(0.30305, 0.80812, 0.50508);

vec3 shade(vec3 color, vec2 uv, vec3 n) {
  float d = n.x * light.x;
  d = n.y * light.y + d;
  d = n.z * light.z + d;            // n . light, in the same order
  d = max(d, 0.0);
  d = d * 0.8 + 0.2;                // 20% ambient, 80% diffuse
  return color * d;
}
