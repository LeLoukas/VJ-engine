import { EffectNode } from './EffectNode.js';

export class GlitchNode extends EffectNode {
  constructor() {
    super();
    this.label = 'Glitch';
  }

  get params() { return [
    { name: 'amount',    type: 'float', min: 0, max: 1,  value: 0.5, step: 0.01 },
    { name: 'speed',     type: 'float', min: 0, max: 20, value: 8,   step: 0.1  },
    { name: 'bands',     type: 'int',   min: 4, max: 80, value: 40              },
  ]; }

  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float     u_time;
uniform float     u_amount;
uniform float     u_speed;
uniform int       u_bands;
in vec2 v_uv;
out vec4 fragColor;

float rand(float x) { return fract(sin(x * 127.1) * 43758.5453); }

void main() {
  vec2 uv = v_uv;
  float band    = floor(uv.y * float(u_bands));
  float trigger = step(1.0 - u_amount * 0.3 - 0.7, rand(band + floor(u_time * u_speed)));
  float shift   = trigger * (rand(band) * 2.0 - 1.0) * u_amount * 0.1;
  float sep     = u_amount * 0.008;
  float r = texture(u_input, vec2(uv.x + shift + sep, uv.y)).r;
  float g = texture(u_input, vec2(uv.x + shift,       uv.y)).g;
  float b = texture(u_input, vec2(uv.x + shift - sep, uv.y)).b;
  fragColor = vec4(r, g, b, 1.0);
}`; }
}
