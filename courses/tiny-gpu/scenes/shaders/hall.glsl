// GLSL twin of hall.asm (function form; see lambert.glsl). The page
// binds texture "stone" to tex_stone, nearest filtering with repeat
// wrapping, as the assembly's tex. A pixel whose u * width lands
// within a rounding step of a texel edge may read the neighbouring
// texel on another GPU; elsewhere the twin matches within 1 level.
const vec3 light = vec3(0.29963, 0.69913, 0.64919);

vec3 shade(vec3 color, vec2 uv, vec3 n) {
  vec4 t = texture(tex_stone, uv);
  float d = n.x * light.x;
  d = n.y * light.y + d;
  d = n.z * light.z + d;
  d = max(d, 0.0);
  d = d * 0.66 + 0.34;
  return color * t.rgb * d;
}
