import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * MixNode — mélange deux textures.
 * Ports d'entrée : 'inputA', 'inputB'
 * Port de sortie : 'output'
 *
 * Connexion :
 *   mix.connect('inputA', sourceNode)
 *   mix.connect('inputB', effectNode)
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
uniform float     u_mix;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 a = texture(u_inputA, v_uv);
  vec4 b = texture(u_inputB, v_uv);
  fragColor = mix(a, b, u_mix);
}`;

export class MixNode extends Node {
  constructor(factor = 0.5) {
    super();
    this.factor = factor;
    this.label  = 'Mix';
  }

  get inputPorts()  { return ['inputA', 'inputB']; }
  get outputPorts() { return ['output']; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);
    this._fbo = createFBO(gl, this.width, this.height);
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

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_inputA'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texB ?? texA);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_inputB'), 1);

    gl.uniform1f(gl.getUniformLocation(this.program, 'u_mix'), this.factor);

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
