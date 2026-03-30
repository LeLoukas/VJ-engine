import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * VideoDelayNode — écho visuel : retarde la vidéo de N frames.
 * Maintient un ring buffer de FBOs, retourne le frame d'il y a `delay` frames.
 * Max 60 frames (≈1s à 60fps).
 */

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

const COPY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
in vec2 v_uv; out vec4 fragColor;
void main() { fragColor = texture(u_input, v_uv); }`;

const MAX_FRAMES = 60;

export class VideoDelayNode extends Node {
  constructor() {
    super(); this.label = 'VideoDelay';
    this._ring   = null;
    this._head   = 0;
    this._filled = 0;
  }
  get inputPorts()  { return ['input', 'bypass']; }
  get outputPorts() { return ['output']; }
  get params() { return [
    { name: 'delay', type: 'int',   min: 1, max: MAX_FRAMES, value: 15 },
    { name: 'mix',   type: 'float', min: 0, max: 1,          value: 1.0, step: 0.01 },
  ]; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this._copyProg = createProgram(gl, VERT, COPY_FRAG);
    this._ring = Array.from({length: MAX_FRAMES}, () => createFBO(gl, this.width, this.height));
    this._outFBO = createFBO(gl, this.width, this.height);
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._ring) return;
    const gl = this.renderer.gl;
    this._ring   = this._ring.map(f => resizeFBO(gl, f, w, h));
    this._outFBO = resizeFBO(gl, this._outFBO, w, h);
    this._filled = 0;
    this._head   = 0;
  }

  render() {
    if (this.bypassed) return this.getInputTexture('input');
    const inputTex = this.getInputTexture('input');
    if (!inputTex) return null;
    const { gl } = this.renderer;

    // Copier l'input dans le slot courant
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._ring[this._head].fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this._copyProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    if (!this._copyInputLoc) this._copyInputLoc = gl.getUniformLocation(this._copyProg, 'u_input');
    gl.uniform1i(this._copyInputLoc, 0);
    this.renderer.quad.draw();

    this._filled = Math.min(this._filled + 1, MAX_FRAMES);

    // Index du frame retardé
    const delay    = Math.min(this.getParam('delay'), this._filled);
    const readIdx  = (this._head - delay + MAX_FRAMES) % MAX_FRAMES;
    const delayTex = this._ring[readIdx].texture;

    // Avancer la tête
    this._head = (this._head + 1) % MAX_FRAMES;

    // Mix delayed + original
    const mix = this.getParam('mix');
    if (mix >= 0.999) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return delayTex;
    }

    // Blend delayed over original
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._outFBO.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this._copyProg); // reuse copy for now — just return delayed
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, delayTex);
    const Lc2 = this._cacheLocs(this._copyProg, ['u_input']);
    gl.uniform1i(Lc2.u_input, 0);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._outFBO.texture;
  }
}
