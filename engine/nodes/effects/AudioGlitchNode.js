import { EffectNode } from './EffectNode.js';

/**
 * AudioGlitchNode
 * Glitch intensifié par le signal audio.
 * u_bass  → amplitude du décalage RGB
 * u_beat  → flash de corruption sur les kicks
 * u_fft   → déplacement vertical par bandes de fréquence
 */
export class AudioGlitchNode extends EffectNode {
  constructor() {
    super();
    this.label = 'AudioGlitch';
  }

  get fragSrc() { return `#version 300 es
precision highp float;

uniform sampler2D u_input;
uniform sampler2D u_fft;
uniform float     u_time;
uniform float     u_bass;
uniform float     u_mid;
uniform float     u_beat;
in vec2 v_uv;
out vec4 fragColor;

float rand(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float rand2(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = v_uv;

  // Bande fréquentielle correspondant à cette ligne
  float fftVal = texture(u_fft, vec2(uv.y, 0.5)).r;

  // Décalage horizontal modulé par FFT + bass
  float band    = floor(uv.y * 60.0);
  float trigger = step(0.88, rand(band + floor(u_time * 10.0)));
  float shift   = trigger * (rand(band) * 2.0 - 1.0) * (0.04 + u_bass * 0.12);

  // Sur un beat : décalage brutal sur certaines bandes
  float beatShift = u_beat * step(0.6, rand(band + 0.5)) * (rand2(vec2(band, u_time)) * 2.0 - 1.0) * 0.08;
  shift += beatShift;

  // Séparation RGB proportionnelle au mid
  float sep = 0.003 + u_mid * 0.015;
  float r = texture(u_input, vec2(uv.x + shift + sep, uv.y)).r;
  float g = texture(u_input, vec2(uv.x + shift,       uv.y)).g;
  float b = texture(u_input, vec2(uv.x + shift - sep, uv.y)).b;

  // Flash blanc sur beat fort
  float flash = u_beat * 0.15;
  vec3 col = vec3(r, g, b) + flash;

  // Scan line subtile modulée par FFT
  float scan = sin(uv.y * 400.0 + u_time * 2.0) * 0.03 * fftVal;
  col += scan;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`; }
}
