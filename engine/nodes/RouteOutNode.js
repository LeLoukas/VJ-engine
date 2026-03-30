import { Node } from './Node.js';
import { createProgram } from '../gl/createProgram.js';
import { createFBO, resizeFBO } from '../gl/createFBO.js';

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;
const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
in vec2 v_uv; out vec4 fragColor;
void main() { fragColor = texture(u_input, v_uv); }`;

export class RouteOutNode extends Node {
  constructor() {
    super();
    this.label     = 'Out';
    this.routeName = 'route1';
    this._fbo      = null;
  }
  get inputPorts()  { return ['input']; }
  get outputPorts() { return ['output']; }  // exposé comme source normale

  init(renderer) {
    super.init(renderer);
    const gl  = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);
    this._fbo    = createFBO(gl, this.width, this.height);
  }
  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._fbo) return;
    this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }

  render() {
    const inputTex = this.getInputTexture('input');
    if (!inputTex) return this._fbo?.texture ?? null;

    const { gl } = this.renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    if (!this._inputLoc) this._inputLoc = gl.getUniformLocation(this.program, 'u_input');
    gl.uniform1i(this._inputLoc, 0);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
