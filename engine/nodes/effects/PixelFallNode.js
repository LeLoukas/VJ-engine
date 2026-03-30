import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * PixelFallNode
 * Les pixels brillants "tombent" vers le bas, laissant une traînée.
 * Implémenté avec ping-pong : chaque frame, on accumule la chute.
 *
 * Deux passes :
 *   1. Gravity pass  — déplace les pixels vers le bas selon leur luminosité
 *   2. Inject pass   — injecte les nouveaux pixels de l'input (additif)
 */

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

// Gravity pass : lit le buffer précédent, fait tomber les pixels
const GRAVITY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform vec2  u_resolution;
uniform float u_gravity;   // vitesse de chute en pixels/frame
uniform float u_decay;     // atténuation par frame
uniform float u_spread;    // diffusion latérale
in vec2 v_uv; out vec4 fragColor;

void main() {
  vec2 px = 1.0 / u_resolution;

  // Lire le pixel du dessus (gravity = chute vers le bas = lire depuis le haut)
  float offset = u_gravity * px.y;
  vec4 above   = texture(u_prev, v_uv + vec2(0.0, offset));

  // Spread latéral léger
  vec4 left  = texture(u_prev, v_uv + vec2(-px.x, offset));
  vec4 right = texture(u_prev, v_uv + vec2( px.x, offset));
  vec4 fallen = above + (left + right) * u_spread * 0.5;

  // Decay
  fragColor = fallen * u_decay;
}`;

// Inject pass : ajoute l'input courant au-dessus du buffer de chute
const INJECT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_fallen;
uniform sampler2D u_input;
uniform float u_threshold;
uniform float u_strength;
in vec2 v_uv; out vec4 fragColor;

void main() {
  vec4 fallen = texture(u_fallen, v_uv);
  vec4 src    = texture(u_input, v_uv);

  // Seuil de luminosité — seuls les pixels assez brillants "génèrent" de la chute
  float luma  = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  vec4 inject = src * step(u_threshold, luma) * u_strength;

  fragColor = clamp(fallen + inject, 0.0, 1.0);
}`;

export class PixelFallNode extends Node {
  constructor() {
    super();
    this.label    = 'PixelFall';
    this._pp      = null;   // ping-pong pour l'accumulation
    this._cur     = 0;
    this._tempFBO = null;   // FBO intermédiaire pour gravity pass
  }

  get inputPorts()  { return ['input', 'bypass']; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'gravity',   type: 'float', min: 0,    max: 20,  value: 3.0,  step: 0.1  },
    { name: 'decay',     type: 'float', min: 0,    max: 1,   value: 0.92, step: 0.01 },
    { name: 'spread',    type: 'float', min: 0,    max: 1,   value: 0.1,  step: 0.01 },
    { name: 'threshold', type: 'float', min: 0,    max: 1,   value: 0.3,  step: 0.01 },
    { name: 'strength',  type: 'float', min: 0,    max: 2,   value: 1.0,  step: 0.01 },
  ]; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this._gravProg   = createProgram(gl, VERT, GRAVITY_FRAG);
    this._injectProg = createProgram(gl, VERT, INJECT_FRAG);
    this._pp = [
      createFBO(gl, this.width, this.height),
      createFBO(gl, this.width, this.height),
    ];
    this._tempFBO = createFBO(gl, this.width, this.height);
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._pp) return;
    const gl = this.renderer.gl;
    this._pp = [
      resizeFBO(gl, this._pp[0], w, h),
      resizeFBO(gl, this._pp[1], w, h),
    ];
    this._tempFBO = resizeFBO(gl, this._tempFBO, w, h);
  }

  render() {
    if (this.bypassed) return this.getInputTexture('input');
    const inputTex = this.getInputTexture('input');
    if (!inputTex) return null;

    const { gl } = this.renderer;
    const read = this._cur, write = 1 - this._cur;

    // ── Pass 1 : Gravity ──────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._tempFBO.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this._gravProg);

    const Lg = this._cacheLocs(this._gravProg, ['u_prev','u_resolution','u_gravity','u_decay','u_spread']);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._pp[read].texture);
    gl.uniform1i(Lg.u_prev, 0);
    gl.uniform2f(Lg.u_resolution, this.width, this.height);
    gl.uniform1f(Lg.u_gravity,   this.getParam('gravity'));
    gl.uniform1f(Lg.u_decay,     this.getParam('decay'));
    gl.uniform1f(Lg.u_spread,    this.getParam('spread'));
    this.renderer.quad.draw();

    // ── Pass 2 : Inject input ─────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._pp[write].fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this._injectProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._tempFBO.texture);
    const Li = this._cacheLocs(this._injectProg, ['u_fallen','u_input','u_threshold','u_strength']);
    gl.uniform1i(Li.u_fallen, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    gl.uniform1i(Li.u_input, 1);

    gl.uniform1f(Li.u_threshold, this.getParam('threshold'));
    gl.uniform1f(Li.u_strength,  this.getParam('strength'));
    this.renderer.quad.draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._cur = write;
    return this._pp[write].texture;
  }
}
