import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_posX;
uniform float u_posY;
uniform float u_zoom;
uniform int   u_maxIter;
uniform int   u_mode;
uniform float u_juliaX;
uniform float u_juliaY;

in vec2 v_uv;
out vec4 fragColor;

vec3 palette(float t) {
  vec3 a  = vec3(0.5);
  vec3 b  = vec3(0.5);
  vec3 cc = vec3(1.0);
  vec3 d  = vec3(0.00, 0.10, 0.20);
  return a + b * cos(6.28318 * (cc * t + d));
}

void main() {
  vec2 uv  = v_uv - 0.5;
  uv.x    *= u_resolution.x / u_resolution.y;

  float scale = pow(2.0, -u_zoom);
  vec2 c      = uv * scale + vec2(u_posX, u_posY);
  vec2 z      = (u_mode == 1) ? c : vec2(0.0);
  vec2 julia  = vec2(u_juliaX, u_juliaY);

  float escape = -1.0;

  for (int n = 0; n < 512; n++) {
    if (n >= u_maxIter) break;
    if (dot(z, z) > 4.0) {
      escape = float(n);
      break;
    }
    vec2 zn = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
    z = zn + ((u_mode == 1) ? julia : c);
  }

  if (escape < 0.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Smooth coloring
  float smooth_i = escape - log2(max(log2(dot(z,z)), 1.0)) + 4.0;
  float t = smooth_i / float(u_maxIter);
  vec3 col = palette(t + u_time * 0.05);
  fragColor = vec4(col, 1.0);
}`;

export class FractalNode extends Node {
  constructor() {
    super();
    this.label   = 'Fractal';
    this.program = null;
    this._fbo    = null;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'posX',    type: 'float', min: -2.5, max: 2.5, value: -0.5,  step: 0.001 },
    { name: 'posY',    type: 'float', min: -2.5, max: 2.5, value:  0.0,  step: 0.001 },
    { name: 'zoom',    type: 'float', min:  0,   max: 40,  value:  1.5,  step: 0.01  },
    { name: 'maxIter', type: 'int',   min:  32,  max: 512, value:  128               },
    { name: 'mode',    type: 'int',   min:  0,   max: 1,   value:  0                 },
    { name: 'juliaX',  type: 'float', min: -2,   max: 2,   value: -0.7,  step: 0.001 },
    { name: 'juliaY',  type: 'float', min: -2,   max: 2,   value:  0.27, step: 0.001 },
  ]; }

  static get modeNames() { return ['Mandelbrot', 'Julia']; }

  init(renderer) {
    super.init(renderer);
    const gl     = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);
    this._fbo    = createFBO(gl, this.width, this.height);
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._fbo) return;
    this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }

  render() {
    const { gl } = this.renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    this.setParamUniforms(this.program);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
