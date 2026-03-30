import { EffectNode } from './EffectNode.js';
export class DistortionNode extends EffectNode {
  constructor() { super(); this.label = 'Distortion'; }
  get params() { return [
    { name: 'amount',    type: 'float', min: 0, max: 1,   value: 0.3,  step: 0.01 },
    { name: 'frequency', type: 'float', min: 1, max: 40,  value: 8.0,  step: 0.1  },
    { name: 'speed',     type: 'float', min: 0, max: 5,   value: 1.0,  step: 0.01 },
    { name: 'type',      type: 'int',   min: 0, max: 2,   value: 0 },
  ]; }
  static get modeNames() { return ['Wave', 'Ripple', 'Twist']; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_time, u_amount, u_frequency, u_speed;
uniform int u_type;
uniform vec2 u_resolution;
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec2 uv = v_uv;
  float t = u_time * u_speed;
  if (u_type == 0) { // Wave
    uv.x += sin(uv.y * u_frequency + t) * u_amount * 0.1;
    uv.y += cos(uv.x * u_frequency + t) * u_amount * 0.05;
  } else if (u_type == 1) { // Ripple
    vec2 c = uv - 0.5;
    float d = length(c);
    float a = sin(d * u_frequency - t) * u_amount * 0.1;
    uv += normalize(c) * a;
  } else { // Twist
    vec2 c = uv - 0.5;
    float a = length(c) * u_frequency * u_amount;
    float s = sin(a + t), co = cos(a + t);
    uv = vec2(c.x*co - c.y*s, c.x*s + c.y*co) + 0.5;
  }
  fragColor = texture(u_input, clamp(uv, 0.0, 1.0));
}`; }
}
