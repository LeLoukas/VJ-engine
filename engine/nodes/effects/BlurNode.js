import { EffectNode } from './EffectNode.js';

export class BlurNode extends EffectNode {
  constructor() {
    super();
    this.label = 'Blur';
  }

  get params() { return [
    { name: 'radius', type: 'float', min: 0, max: 20, value: 4, step: 0.1 },
  ]; }

  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform vec2      u_resolution;
uniform float     u_radius;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 color = vec4(0.0);
  float total = 0.0;
  int r = int(u_radius);
  for (int x = -10; x <= 10; x++) {
    for (int y = -10; y <= 10; y++) {
      if (abs(x) > r || abs(y) > r) continue;
      float w = exp(-float(x*x + y*y) / (2.0 * u_radius * u_radius + 0.001));
      color += texture(u_input, v_uv + vec2(x, y) * texel) * w;
      total += w;
    }
  }
  fragColor = total > 0.0 ? color / total : texture(u_input, v_uv);
}`; }
}
