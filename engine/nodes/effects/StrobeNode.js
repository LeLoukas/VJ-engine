import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * StrobeNode
 * Alterne entre la texture et le noir à une fréquence donnée.
 * Garde la dernière frame visible pendant la période "on".
 */
const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv = a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_phase;
in vec2 v_uv; out vec4 fragColor;
void main() {
  fragColor = u_phase > 0.5 ? texture(u_input, v_uv) : vec4(0,0,0,1);
}`;

export class StrobeNode extends Node {
  constructor() {
    super();
    this.label   = 'Strobe';
    this._fbo    = null;
    this._phase  = 1.0;
    this._accum  = 0.0;
  }
  get inputPorts()  { return ['input', 'bypass']; }
  get outputPorts() { return ['output']; }
  get params() { return [
    { name: 'bpm',  type: 'float', min: 1,  max: 300, value: 120, step: 1   },
    { name: 'duty', type: 'float', min: 0,  max: 1,   value: 0.5, step: 0.01},
  ]; }
  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);
    this._fbo    = createFBO(gl, this.width, this.height);
  }
  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._fbo) return;
    this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }
  render() {
    if (this.bypassed) return this.getInputTexture('input');
    const inputTex = this.getInputTexture('input');
    if (!inputTex) return null;
    const dt      = 1 / 60;
    const period  = 60.0 / this.getParam('bpm');
    this._accum   = (this._accum + dt) % period;
    this._phase   = this._accum < period * this.getParam('duty') ? 1.0 : 0.0;
    const { gl }  = this.renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    const Ls = this._cacheLocs(this.program, ['u_input','u_phase']);
    gl.uniform1i(Ls.u_input, 0);
    gl.uniform1f(Ls.u_phase, this._phase);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
