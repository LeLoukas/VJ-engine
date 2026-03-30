import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_speed;
uniform float u_zoom;
uniform float u_rings;
uniform float u_colorShift;
in vec2 v_uv; out vec4 fragColor;

vec3 palette(float t, float shift) {
  vec3 a = vec3(0.5, 0.5, 0.4);
  vec3 b = vec3(0.5, 0.4, 0.8);
  vec3 c = vec3(2.0, 2.0, 2.0);
  vec3 d = vec3(0.8, 0.6, 0.97);
  return a + b * cos(6.283185 * (c * t + d + shift));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.x *= u_resolution.x / u_resolution.y;

  // Tunnel zoom
  uv = fract((u_time * u_speed) / uv) - 0.5;

  float dist = length(uv) * u_zoom;
  vec3  col  = palette(dist, u_colorShift);

  // Rings
  dist = abs(sin(u_rings * dist - u_time * u_speed)) / u_rings;
  dist = 0.05 / max(dist, 0.001);

  fragColor = vec4(col * dist, 1.0);
}`;

export class MatrixNode extends Node {
  constructor() {
    super(); this.label = 'Matrix'; this._fbo = null;
  }
  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'speed',      type: 'float', min: 0,   max: 4,   value: 1.0,  step: 0.01 },
    { name: 'zoom',       type: 'float', min: 0.1, max: 5,   value: 1.0,  step: 0.01 },
    { name: 'rings',      type: 'float', min: 1,   max: 20,  value: 3.0,  step: 0.1  },
    { name: 'colorShift', type: 'float', min: 0,   max: 1,   value: 0.0,  step: 0.01 },
  ]; }

  init(renderer) {
    super.init(renderer);
    this.program = createProgram(renderer.gl, VERT, FRAG);
    this._fbo    = createFBO(renderer.gl, this.width, this.height);
  }
  resize(w,h) {
    super.resize(w,h);
    if (this.renderer && this._fbo)
      this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }
  render() {
    const {gl} = this.renderer;
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
