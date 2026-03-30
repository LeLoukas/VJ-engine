import { EffectNode } from './EffectNode.js';
export class PosterizeNode extends EffectNode {
  constructor() { super(); this.label = 'Posterize'; }
  get params() { return [
    { name: 'levels',    type: 'int',   min: 2,   max: 32,  value: 4    },
    { name: 'threshold', type: 'float', min: 0,   max: 1,   value: 0.0, step: 0.01 },
    { name: 'mode',      type: 'int',   min: 0,   max: 1,   value: 0    },
  ]; }
  static get modeNames() { return ['Posterize', 'Threshold']; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform int u_levels, u_mode;
uniform float u_threshold;
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec4 col = texture(u_input, v_uv);
  if (u_mode == 0) {
    float l = float(u_levels);
    col.rgb = floor(col.rgb * l) / (l - 1.0);
  } else {
    float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    col.rgb = vec3(step(u_threshold, luma));
  }
  fragColor = col;
}`; }
}
