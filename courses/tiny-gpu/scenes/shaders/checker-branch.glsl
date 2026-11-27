// GLSL twin of checker-branch.asm (function form; see lambert.glsl).
// Precision: the branch depends on floor(u * 8.0) and floor(v * 8.0).
// A pixel whose interpolated u or v lands within a rounding step of a
// square's edge can take the other side on a GPU whose interpolation
// rounds differently, and then differs by far more than 1 level. Such
// pixels sit only on square edges; elsewhere the twin matches within
// 1 level.
vec3 shade(vec3 color, vec2 uv, vec3 n) {
  float s = floor(uv.x * 8.0) + floor(uv.y * 8.0);
  s = fract(s * 0.5);               // 0.5 on odd squares, 0 on even
  if (s != 0.0) {
    return color * vec3(0.3, 0.35, 0.45);
  } else {
    return color * 0.6 + vec3(0.4, 0.4, 0.38);
  }
}
