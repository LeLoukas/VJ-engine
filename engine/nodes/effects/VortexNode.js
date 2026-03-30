import { EffectNode } from './EffectNode.js';
export class VortexNode extends EffectNode {
  constructor() { super(); this.label = 'Vortex'; }
  get params() { return [
    { name: 'angle',   type: 'float', min: -20, max: 20, value: 3.0,  step: 0.1  },
    { name: 'radius',  type: 'float', min: 0.01,max: 2,  value: 0.5,  step: 0.01 },
    { name: 'centerX', type: 'float', min: 0,   max: 1,  value: 0.5,  step: 0.01 },
    { name: 'centerY', type: 'float', min: 0,   max: 1,  value: 0.5,  step: 0.01 },
  ]; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform vec2  u_resolution;
uniform float u_angle, u_radius, u_centerX, u_centerY;
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec2 uv  = v_uv;
  vec2 ctr = vec2(u_centerX, u_centerY);
  vec2 d   = uv - ctr;
  d.x     *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  float a  = u_angle * smoothstep(u_radius, 0.0, dist);
  float s  = sin(a), c = cos(a);
  d = vec2(d.x*c - d.y*s, d.x*s + d.y*c);
  d.x /= u_resolution.x / u_resolution.y;
  fragColor = texture(u_input, clamp(ctr + d, 0.0, 1.0));
}`; }
}
