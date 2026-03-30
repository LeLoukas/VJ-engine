import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * SceneMixNode
 * Sélectionne et mélange jusqu'à 4 scènes (sous-graphes).
 * scene  : 0→3 — scène active
 * blend  : 0→1 — fondu vers la scène suivante
 *
 * Exemple :
 *   scene=1.0, blend=0.0 → 100% scène B
 *   scene=1.0, blend=0.7 → 30% B + 70% C
 */

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_a, u_b, u_c, u_d;
uniform float u_scene, u_blend;
in vec2 v_uv; out vec4 fragColor;

vec4 getScene(int idx) {
  if (idx == 0) return texture(u_a, v_uv);
  if (idx == 1) return texture(u_b, v_uv);
  if (idx == 2) return texture(u_c, v_uv);
  return texture(u_d, v_uv);
}

void main() {
  int cur  = int(floor(u_scene));
  int next = min(cur + 1, 3);
  vec4 a   = getScene(cur);
  vec4 b   = getScene(next);
  fragColor = mix(a, b, clamp(u_blend, 0.0, 1.0));
}`;

export class SceneMixNode extends Node {
  constructor() {
    super();
    this.label = 'SceneMix';
    this._fbo  = null;
  }

  get inputPorts()  { return ['A', 'B', 'C', 'D', 'bypass']; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'scene', type: 'float', min: 0, max: 3,   value: 0, step: 0.01 },
    { name: 'blend', type: 'float', min: 0, max: 1,   value: 0, step: 0.01 },
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
    if (this.bypassed) return this.getInputTexture('A');

    const { gl } = this.renderer;
    const texA = this.getInputTexture('A');
    const texB = this.getInputTexture('B');
    const texC = this.getInputTexture('C');
    const texD = this.getInputTexture('D');

    // Fallback : une texture noire si non connecté
    const black = this._getBlack(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);

    const Ls = this._cacheLocs(this.program, ['u_a','u_b','u_c','u_d','u_scene','u_blend']);
    const bind = (tex, unit, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex ?? black);
      gl.uniform1i(Ls[name], unit);
    };
    bind(texA, 0, 'u_a');
    bind(texB, 1, 'u_b');
    bind(texC, 2, 'u_c');
    bind(texD, 3, 'u_d');

    gl.uniform1f(Ls.u_scene, this.getParam('scene'));
    gl.uniform1f(Ls.u_blend, this.getParam('blend'));

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }

  _getBlack(gl) {
    if (!this._blackTex) {
      this._blackTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._blackTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0,
                    gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    return this._blackTex;
  }
}
