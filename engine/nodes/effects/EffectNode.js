import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

export const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/**
 * EffectNode — base pour tous les effets à une entrée.
 * Port d'entrée : 'input'
 * Port de sortie : 'output'
 */
export class EffectNode extends Node {
  get inputPorts() { return ['input']; }

  /** @returns {string} GLSL fragment shader source */
  get fragSrc() {
    throw new Error(`${this.constructor.name} must implement get fragSrc()`);
  }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, this.fragSrc);
    this._fbo = createFBO(gl, this.width, this.height);
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer) return;
    this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }

  get texture() { return this._fbo.texture; }

  render() {
    const { gl } = this.renderer;
    const inputTexture = this.getInputTexture('input');

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    this.setParamUniforms(this.program);

    if (inputTexture !== null) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTexture);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_input'), 0);
    }

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
