import { EffectNode } from './EffectNode.js';
export class SharpenNode extends EffectNode {
  constructor() { super(); this.label = 'Sharpen'; }
  get params() { return [
    { name: 'amount', type: 'float', min: 0, max: 5,   value: 1.0, step: 0.1 },
    { name: 'mode',   type: 'int',   min: 0, max: 1,   value: 0 },
  ]; }
  static get modeNames() { return ['Sharpen', 'Edge Detect']; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform vec2  u_resolution;
uniform float u_amount;
uniform int   u_mode;
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec2 px = 1.0 / u_resolution;
  vec4 c  = texture(u_input, v_uv);
  vec4 n  = texture(u_input, v_uv + vec2( 0, px.y));
  vec4 s  = texture(u_input, v_uv + vec2( 0,-px.y));
  vec4 e  = texture(u_input, v_uv + vec2( px.x, 0));
  vec4 w  = texture(u_input, v_uv + vec2(-px.x, 0));
  vec4 lap = c*4.0 - n - s - e - w;
  if (u_mode == 0) fragColor = clamp(c + lap * u_amount, 0.0, 1.0);
  else             fragColor = clamp(abs(lap) * u_amount, 0.0, 1.0);
}`; }
}
