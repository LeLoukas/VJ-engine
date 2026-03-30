import { EffectNode } from './EffectNode.js';
export class NoiseNode extends EffectNode {
  constructor() { super(); this.label = 'Noise'; }
  get params() { return [
    { name: 'amount',  type: 'float', min: 0, max: 1,  value: 0.2,  step: 0.01 },
    { name: 'speed',   type: 'float', min: 0, max: 60, value: 24.0, step: 1    },
    { name: 'colored', type: 'int',   min: 0, max: 1,  value: 0 },
  ]; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_time, u_amount, u_speed;
uniform int u_colored;
in vec2 v_uv; out vec4 fragColor;
float rand(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main() {
  vec4 col = texture(u_input, v_uv);
  float t = floor(u_time * u_speed);
  if (u_colored == 1) {
    vec3 noise = vec3(rand(v_uv + t), rand(v_uv + t + 1.0), rand(v_uv + t + 2.0));
    col.rgb += (noise - 0.5) * u_amount;
  } else {
    float noise = rand(v_uv + t);
    col.rgb += (noise - 0.5) * u_amount;
  }
  fragColor = clamp(col, 0.0, 1.0);
}`; }
}
