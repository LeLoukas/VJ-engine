import { EffectNode } from './EffectNode.js';

export class KaleidoscopeNode extends EffectNode {
  constructor() {
    super();
    this.label = 'Kaleidoscope';
  }

  get params() { return [
    { name: 'sides',  type: 'int',   min: 1, max: 24, value: 6 },
    { name: 'angle',  type: 'float', min: 0, max: 6.2832, value: 0, step: 0.01 },
    { name: 'zoom',   type: 'float', min: 0.1, max: 4, value: 1, step: 0.01 },
    { name: 'offsetX',type: 'float', min: -1, max: 1, value: 0, step: 0.01 },
    { name: 'offsetY',type: 'float', min: -1, max: 1, value: 0, step: 0.01 },
  ]; }

  get fragSrc() { return `#version 300 es
precision highp float;

uniform sampler2D u_input;
uniform float     u_time;
uniform vec2      u_resolution;
uniform int       u_sides;
uniform float     u_angle;
uniform float     u_zoom;
uniform float     u_offsetX;
uniform float     u_offsetY;
in vec2 v_uv;
out vec4 fragColor;

#define PI 3.14159265358979

void main() {
  if (u_sides <= 1) { fragColor = texture(u_input, v_uv); return; }
  vec2 uv = v_uv - 0.5;
  uv.x *= u_resolution.x / u_resolution.y;

  // Zoom + offset
  uv = uv / u_zoom + vec2(u_offsetX, u_offsetY);

  // Coordonnées polaires
  float angle = atan(uv.y, uv.x) + u_angle;
  float radius = length(uv);

  // Symétrie par secteur
  float sector = PI / float(u_sides);
  angle = mod(angle, 2.0 * sector);
  if (angle > sector) angle = 2.0 * sector - angle;

  vec2 sampleUV = vec2(cos(angle), sin(angle)) * radius;
  sampleUV = sampleUV * 0.5 + 0.5;

  fragColor = texture(u_input, fract(sampleUV));
}`; }
}
