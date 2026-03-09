import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * FeedbackNode — boucle de rétroaction avec zoom centré.
 * Ping-pong FBO : chaque frame mélange l'input courant
 * avec la frame précédente zoomée légèrement.
 *
 * Uniforms custom :
 *   u_zoom    — facteur de zoom par frame (défaut 1.02)
 *   u_decay   — persistance du feedback (défaut 0.92)
 *   u_mix     — proportion input vs feedback (défaut 0.15)
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

uniform sampler2D u_input;
uniform sampler2D u_prev;
uniform float     u_zoom;
uniform float     u_decay;
uniform float     u_mix;
uniform vec2      u_resolution;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // UV zoomé depuis le centre
  vec2 center  = vec2(0.5);
  vec2 zoomedUV = (v_uv - center) / u_zoom + center;

  vec4 current  = texture(u_input, v_uv);
  vec4 feedback = texture(u_prev,  zoomedUV) * u_decay;

  fragColor = mix(feedback, current, u_mix);
}`;

export class FeedbackNode extends Node {
  constructor({ zoom = 1.02, decay = 0.92, mix = 0.15 } = {}) {
    super();
    this.label  = 'Feedback';
    this.zoom   = zoom;
    this.decay  = decay;
    this.mixVal = mix;
    this._pingpong = null;  // [fbo0, fbo1]
    this._current  = 0;     // index du FBO courant en écriture
  }

  get inputPorts()  { return ['input']; }
  get outputPorts() { return ['output']; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);
    this._pingpong = [
      createFBO(gl, this.width, this.height),
      createFBO(gl, this.width, this.height),
    ];
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer) return;
    const gl = this.renderer.gl;
    this._pingpong = [
      resizeFBO(gl, this._pingpong[0], w, h),
      resizeFBO(gl, this._pingpong[1], w, h),
    ];
  }

  render() {
    const { gl } = this.renderer;
    const inputTexture = this.getInputTexture('input');
    if (!inputTexture) return null;

    const write = this._current;
    const read  = 1 - this._current;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._pingpong[write].fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);

    this.renderer.setGlobalUniforms(this.program);

    // Input courant → TEXTURE0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_input'), 0);

    // Frame précédente → TEXTURE1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._pingpong[read].texture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_prev'), 1);

    // Paramètres
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_zoom'),  this.zoom);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_decay'), this.decay);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_mix'),   this.mixVal);

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Swap
    this._current = read;
    return this._pingpong[write].texture;
  }
}
