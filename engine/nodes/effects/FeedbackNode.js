import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * FeedbackNode (FeedbackMix)
 * Mélange la frame courante avec la frame précédente (ou tout ce qui
 * arrive sur le port 'feedback' — peut être une chaîne d'effets).
 *
 * Ports :
 *   input    → frame courante
 *   feedback → frame à réinjecter (si non connecté, utilise sa propre sortie)
 *
 * Params :
 *   decay  → atténuation de la frame précédente (0=noir, 1=infini)
 *   mix    → proportion input vs feedback (0=100% feedback, 1=100% input)
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
uniform sampler2D u_feedback;
uniform float     u_decay;
uniform float     u_mix;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec4 current  = texture(u_input,    v_uv);
  vec4 previous = texture(u_feedback, v_uv) * u_decay;
  fragColor = mix(previous, current, u_mix);
}`;

export class FeedbackNode extends Node {
  constructor() {
    super();
    this.label     = 'Feedback';
    this._pingpong = null;
    this._current  = 0;
  }

  get inputPorts()  { return ['input', 'feedback', 'bypass']; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'decay', type: 'float', min: 0,   max: 1,   value: 0.92, step: 0.01 },
    { name: 'mix',   type: 'float', min: 0,   max: 1,   value: 0.15, step: 0.01 },
  ]; }

  init(renderer) {
    super.init(renderer);
    const gl   = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);
    this._pingpong = [
      createFBO(gl, this.width, this.height),
      createFBO(gl, this.width, this.height),
    ];
    // Initialiser les deux FBO avec du noir pour éviter lazy initialization
    this._clearFBO(gl, this._pingpong[0]);
    this._clearFBO(gl, this._pingpong[1]);
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._pingpong) return;
    const gl = this.renderer.gl;
    this._pingpong = [
      resizeFBO(gl, this._pingpong[0], w, h),
      resizeFBO(gl, this._pingpong[1], w, h),
    ];
  }

  _clearFBO(gl, fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render() {
    if (this.bypassed) return this.getInputTexture('input');

    const inputTex    = this.getInputTexture('input');
    if (!inputTex) return null;

    const { gl }      = this.renderer;
    const write       = this._current;
    const read        = 1 - this._current;

    // Port feedback : si connecté, utilise la texture fournie
    // sinon utilise la frame précédente (auto-feedback)
    const feedbackTex = this.getInputTexture('feedback')
                     ?? this._pingpong[read].texture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._pingpong[write].fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);

    if (!this._locs) {
      this._locs = {
        input:    gl.getUniformLocation(this.program, 'u_input'),
        feedback: gl.getUniformLocation(this.program, 'u_feedback'),
        decay:    gl.getUniformLocation(this.program, 'u_decay'),
        mix:      gl.getUniformLocation(this.program, 'u_mix'),
      };
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(this._locs.input, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, feedbackTex);
    gl.uniform1i(this._locs.feedback, 1);

    gl.uniform1f(this._locs.decay, this.getParam('decay'));
    gl.uniform1f(this._locs.mix,   this.getParam('mix'));

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this._current = read;
    return this._pingpong[write].texture;
  }
}
