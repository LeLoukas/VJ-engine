import { EffectNode } from './EffectNode.js';

/**
 * GlitchNode — décalage horizontal par bandes, séparation RGB, corruption.
 */
export class GlitchNode extends EffectNode {
  constructor() {
    super();
    this.label = 'Glitch';
  }

  get fragSrc() { return `#version 300 es
precision highp float;

uniform sampler2D u_input;
uniform float     u_time;
uniform vec2      u_resolution;
in vec2 v_uv;
out vec4 fragColor;

float rand(float x) {
  return fract(sin(x * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;

  // Bandes horizontales glitchées
  float band     = floor(uv.y * 40.0);
  float trigger  = step(0.92, rand(band + floor(u_time * 8.0)));
  float shift    = trigger * (rand(band) * 2.0 - 1.0) * 0.08;

  // Séparation RGB
  float rShift = shift + trigger * 0.01;
  float bShift = shift - trigger * 0.01;

  float r = texture(u_input, vec2(uv.x + rShift, uv.y)).r;
  float g = texture(u_input, vec2(uv.x + shift,  uv.y)).g;
  float b = texture(u_input, vec2(uv.x + bShift, uv.y)).b;

  // Corruption verticale occasionnelle
  float corrupt = step(0.97, rand(floor(u_time * 3.0))) *
                  step(0.5,  rand(uv.y * 100.0 + u_time));
  if (corrupt > 0.0) {
    uv.x = rand(uv.y + u_time);
    vec4 s = texture(u_input, uv);
    r = s.r; g = s.g; b = s.b;
  }

  fragColor = vec4(r, g, b, 1.0);
}`; }
}
