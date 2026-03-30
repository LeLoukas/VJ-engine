import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * ChromaKeyNode
 * Supprime une couleur (ou les noirs/blancs) et la rend transparente.
 * La texture de sortie a un vrai canal alpha.
 *
 * Modes :
 *   0 — Color Key  : supprime une couleur spécifique (vert, bleu...)
 *   1 — Luma Key   : supprime les zones sombres (fond noir → transparent)
 *   2 — Luma Key + : supprime les zones claires (fond blanc → transparent)
 *
 * Pour composer sur un fond : brancher dans le port inputB d'un MixNode
 * en mode "Alpha" — le node en inputA sera le fond.
 */

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform int   u_mode;
uniform float u_keyR, u_keyG, u_keyB;
uniform float u_tolerance;
uniform float u_smoothness;
uniform float u_threshold;  // pour luma key
in vec2 v_uv; out vec4 fragColor;

void main() {
  vec4 col  = texture(u_input, v_uv);
  float alpha = 1.0;

  if (u_mode == 0) {
    // Color Key
    vec3 key  = vec3(u_keyR, u_keyG, u_keyB);
    float dist = distance(col.rgb, key);
    alpha = smoothstep(
      u_tolerance - u_smoothness * 0.5,
      u_tolerance + u_smoothness * 0.5,
      dist
    );
    // Despill
    vec3 rgb = col.rgb;
    if (u_keyG > u_keyR && u_keyG > u_keyB)
      rgb.g = min(rgb.g, (rgb.r + rgb.b) * 0.5 + 0.05);
    else if (u_keyB > u_keyR && u_keyB > u_keyG)
      rgb.b = min(rgb.b, (rgb.r + rgb.g) * 0.5 + 0.05);
    col.rgb = rgb;

  } else if (u_mode == 1) {
    // Luma Key — fond sombre transparent
    float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    alpha = smoothstep(
      u_threshold - u_smoothness * 0.5,
      u_threshold + u_smoothness * 0.5,
      luma
    );
  } else {
    // Luma Key + — fond clair transparent
    float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    alpha = 1.0 - smoothstep(
      u_threshold - u_smoothness * 0.5,
      u_threshold + u_smoothness * 0.5,
      luma
    );
  }

  fragColor = vec4(col.rgb, col.a * alpha);
}`;

export class ChromaKeyNode extends Node {
  constructor() {
    super();
    this.label = 'ChromaKey';
    this._fbo  = null;
  }

  get inputPorts()  { return ['input', 'bypass']; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'mode',       type: 'int',   min: 0, max: 2,   value: 1,    },
    { name: 'keyR',       type: 'float', min: 0, max: 1,   value: 0.0,  step: 0.01 },
    { name: 'keyG',       type: 'float', min: 0, max: 1,   value: 1.0,  step: 0.01 },
    { name: 'keyB',       type: 'float', min: 0, max: 1,   value: 0.0,  step: 0.01 },
    { name: 'tolerance',  type: 'float', min: 0, max: 1,   value: 0.35, step: 0.01 },
    { name: 'smoothness', type: 'float', min: 0, max: 0.5, value: 0.08, step: 0.01 },
    { name: 'threshold',  type: 'float', min: 0, max: 1,   value: 0.15, step: 0.01 },
  ]; }

  static get modeNames() { return ['Color Key', 'Luma Key (dark→transparent)', 'Luma Key (bright→transparent)']; }

  init(renderer) {
    super.init(renderer);
    const gl     = renderer.gl;
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

    const { gl } = this.renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    if (!this._inputLoc) this._inputLoc = gl.getUniformLocation(this.program, 'u_input');
    gl.uniform1i(this._inputLoc, 0);

    this.setParamUniforms(this.program);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
