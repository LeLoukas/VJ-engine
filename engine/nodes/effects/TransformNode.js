import { EffectNode } from './EffectNode.js';

export class TransformNode extends EffectNode {
  constructor() { super(); this.label = 'Transform'; }

  get params() { return [
    { name: 'scaleX',  type: 'float', min: 0.01, max: 4,       value: 1.0,  step: 0.01  },
    { name: 'scaleY',  type: 'float', min: 0.01, max: 4,       value: 1.0,  step: 0.01  },
    { name: 'shiftX',  type: 'float', min: -1,   max: 1,       value: 0.0,  step: 0.005 },
    { name: 'shiftY',  type: 'float', min: -1,   max: 1,       value: 0.0,  step: 0.005 },
    { name: 'rotate',  type: 'float', min: -3.14159, max: 3.14159, value: 0.0, step: 0.01 },
    { name: 'outside', type: 'int',   min: 0,    max: 2,       value: 1 },
  ]; }

  static get modeNames() { return ['Black', 'Transparent', 'Wrap']; }

  // "outside" param uses modeNames — but we need a separate getter name
  static get outsideNames() { return ['Black', 'Transparent', 'Wrap']; }

  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_scaleX, u_scaleY, u_shiftX, u_shiftY, u_rotate;
uniform int   u_outside;  // 0=black 1=transparent 2=wrap
in vec2 v_uv; out vec4 fragColor;

void main() {
  vec2 uv = v_uv - 0.5;

  float s = sin(u_rotate), c = cos(u_rotate);
  uv = vec2(uv.x*c - uv.y*s, uv.x*s + uv.y*c);
  uv = uv / vec2(u_scaleX, u_scaleY);
  uv += vec2(u_shiftX, u_shiftY) + 0.5;

  bool outside = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;

  if (u_outside == 2) {
    uv = fract(uv);
  } else if (outside) {
    if (u_outside == 0) fragColor = vec4(0.0, 0.0, 0.0, 1.0);  // Black
    else                fragColor = vec4(0.0, 0.0, 0.0, 0.0);  // Transparent
    return;
  }

  fragColor = texture(u_input, uv);
}`; }
}
