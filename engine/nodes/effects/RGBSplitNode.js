import { EffectNode } from './EffectNode.js';
export class RGBSplitNode extends EffectNode {
  constructor() { super(); this.label = 'RGBSplit'; }
  get params() { return [
    { name: 'amount',  type: 'float', min: 0, max: 0.1, value: 0.01, step: 0.001 },
    { name: 'angle',   type: 'float', min: 0, max: 6.28, value: 0.0, step: 0.01  },
    { name: 'animate', type: 'int',   min: 0, max: 1,    value: 0 },
  ]; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_time, u_amount, u_angle;
uniform int u_animate;
in vec2 v_uv; out vec4 fragColor;
void main() {
  float a = u_angle + (u_animate == 1 ? sin(u_time * 2.0) * 1.57 : 0.0);
  vec2 dir = vec2(cos(a), sin(a)) * u_amount;
  float r = texture(u_input, v_uv + dir).r;
  float g = texture(u_input, v_uv).g;
  float b = texture(u_input, v_uv - dir).b;
  fragColor = vec4(r, g, b, 1.0);
}`; }
}
