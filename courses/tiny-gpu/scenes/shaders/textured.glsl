// GLSL twin of textured.asm (function form; see lambert.glsl).
// The page binds texture "floor" to the sampler tex_floor, nearest
// filtering with repeat wrapping, as the assembly's tex. A texel
// lookup is exact; a pixel whose u * width lands within a rounding
// step of a texel edge may read the neighbouring texel on another GPU.
const vec3 light = vec3(0.30305, 0.80812, 0.50508);

vec3 shade(vec3 color, vec2 uv, vec3 n) {
  vec4 t = texture(tex_floor, uv);
  float d = n.x * light.x;
  d = n.y * light.y + d;
  d = n.z * light.z + d;
  d = max(d, 0.0);
  d = d * 0.8 + 0.2;
  return color * t.rgb * d;
}
