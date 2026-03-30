import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_inputA;
uniform sampler2D u_inputB;
uniform float u_factor;
uniform int   u_mode;
in vec2 v_uv; out vec4 fragColor;

void main() {
  vec4 a = texture(u_inputA, v_uv);
  vec4 b = texture(u_inputB, v_uv);
  vec4 r;

  if (u_mode == 0) {
    // Mix — fondu entre A et B
    r = mix(a, b, u_factor);

  } else if (u_mode == 1) {
    // Add — B s'additionne sur A (noir de B = invisible)
    r = clamp(a + b * u_factor, 0.0, 1.0);

  } else if (u_mode == 2) {
    // Screen — comme Add mais ne sature pas
    vec4 s = 1.0 - (1.0 - a) * (1.0 - b * u_factor);
    r = s;

  } else if (u_mode == 3) {
    // Over — B par dessus A, utilise l'alpha de B (ChromaKey → MixNode Over)
    float alpha = b.a * u_factor;
    r = vec4(mix(a.rgb, b.rgb, alpha), 1.0);

  } else if (u_mode == 4) {
    // Luma Over — B par dessus A, luminosité de B comme masque (sans ChromaKey)
    float luma = dot(b.rgb, vec3(0.299, 0.587, 0.114)) * u_factor;
    r = vec4(mix(a.rgb, b.rgb, luma), 1.0);

  } else if (u_mode == 5) {
    // Multiply
    r = mix(a, a * b, u_factor);

  } else if (u_mode == 6) {
    // Max
    r = max(a, b * u_factor);

  } else if (u_mode == 7) {
    // Diff
    r = vec4(abs(a.rgb - b.rgb) * u_factor + a.rgb * (1.0 - u_factor), 1.0);

  } else {
    r = a;
  }

  fragColor = clamp(r, 0.0, 1.0);
}`;

const MODE_NAMES = ['Mix', 'Add', 'Screen', 'Over (alpha)', 'Luma Over', 'Multiply', 'Max', 'Diff'];

export class MixNode extends Node {
  constructor() { super(); this.label = 'Mix'; }

  get inputPorts()  { return ['inputA', 'inputB', 'bypass']; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'factor', type: 'float', min: 0, max: 1, value: 1.0, step: 0.01 },
    { name: 'mode',   type: 'int',   min: 0, max: MODE_NAMES.length-1, value: 1 },
  ]; }

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
    if (this.bypassed) return this.getInputTexture('inputA');
    const { gl } = this.renderer;
    const texA = this.getInputTexture('inputA');
    const texB = this.getInputTexture('inputB');

    // Si inputB non connecté, retourner A directement
    if (!texB) return texA;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    this.setParamUniforms(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    const Lm = this._cacheLocs(this.program, ['u_inputA','u_inputB']);
    gl.uniform1i(Lm.u_inputA, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1i(Lm.u_inputB, 1);

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
