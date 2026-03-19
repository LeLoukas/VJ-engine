import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * MixNode — combine deux textures selon différents modes.
 * Modes : mix, add, max, min, diff, multiply, screen
 * Params : factor (0→1), mode (int 0→6)
 */

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_inputA;
uniform sampler2D u_inputB;
uniform float     u_factor;
uniform int       u_mode;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 a = texture(u_inputA, v_uv);
  vec4 b = texture(u_inputB, v_uv);
  vec4 result;

  if      (u_mode == 0) result = mix(a, b, u_factor);                    // Mix
  else if (u_mode == 1) result = clamp(a + b * u_factor, 0.0, 1.0);      // Add
  else if (u_mode == 2) result = max(a, b * u_factor);                    // Max
  else if (u_mode == 3) result = min(a, mix(vec4(1.0), b, u_factor));    // Min
  else if (u_mode == 4) result = abs(a - b) * u_factor + a * (1.0 - u_factor); // Diff
  else if (u_mode == 5) result = a * b * u_factor + a * (1.0 - u_factor); // Multiply
  else if (u_mode == 6) {                                                  // Screen
    vec4 s = 1.0 - (1.0 - a) * (1.0 - b);
    result = mix(a, s, u_factor);
  }
  else result = mix(a, b, u_factor);

  fragColor = clamp(result, 0.0, 1.0);
}`;

const MODE_NAMES = ['Mix', 'Add', 'Max', 'Min', 'Diff', 'Multiply', 'Screen'];

export class MixNode extends Node {
  constructor() {
    super();
    this.label = 'Mix';
  }

  get inputPorts()  { return ['inputA', 'inputB']; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'factor', type: 'float', min: 0, max: 1,                   value: 0.5, step: 0.01 },
    { name: 'mode',   type: 'int',   min: 0, max: MODE_NAMES.length-1, value: 0 },
  ]; }

  // Expose les noms de modes pour l'UI
  static get modeNames() { return MODE_NAMES; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);
    this._fbo    = createFBO(gl, this.width, this.height);
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer) return;
    this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }

  render() {
    const { gl } = this.renderer;
    const texA = this.getInputTexture('inputA');
    const texB = this.getInputTexture('inputB');

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    this.setParamUniforms(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_inputA'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texB ?? texA);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_inputB'), 1);

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
