// Supplied: attaches a shader program to a scene. The program is
// scenes/shaders/NAME.asm; its GLSL twin, NAME.glsl, goes with it so
// the comparison page can run the same shading in WebGL.
import { readFileSync } from 'node:fs';

const read = (name, ext) => readFileSync(
  new URL(`./shaders/${name}.${ext}`, import.meta.url), 'utf8');

export function withShader(scene, name) {
  return { ...scene, shaderName: name, shader: read(name, 'asm'),
    glsl: read(name, 'glsl') };
}
