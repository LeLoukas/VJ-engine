import { EffectNode } from './EffectNode.js';
export class PixelateNode extends EffectNode {
  constructor() { super(); this.label = 'Pixelate'; }
  get params() { return [
    { name: 'size',  type: 'int',   min: 1, max: 128, value: 16 },
    { name: 'shape', type: 'int',   min: 0, max: 1,   value: 0  },
  ]; }
  static get modeNames() { return ['Square', 'Circle']; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform vec2 u_resolution;
uniform int u_size, u_shape;
in vec2 v_uv; out vec4 fragColor;
void main() {
  float s = float(u_size);
  vec2 pxUV = floor(v_uv * u_resolution / s) * s / u_resolution + (s * 0.5) / u_resolution;
  vec4 col = texture(u_input, pxUV);
  if (u_shape == 1) {
    vec2 center = pxUV * u_resolution;
    vec2 pos    = v_uv * u_resolution;
    float d = length(pos - center);
    if (d > s * 0.45) col.a = 0.0;
  }
  fragColor = col;
}`; }
}
