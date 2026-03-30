import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * BloomNode — halo lumineux autour des zones brillantes.
 * 1. Threshold pass : extrait les zones > threshold
 * 2. Blur pass x2   : flou horizontal + vertical (séparable)
 * 3. Composite pass : additionne le halo sur l'original
 */

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

const THRESHOLD_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_threshold, u_knee;
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec4 col = texture(u_input, v_uv);
  float luma = dot(col.rgb, vec3(0.299,0.587,0.114));
  float rq = clamp(luma - u_threshold + u_knee, 0.0, 2.0*u_knee);
  float w  = (rq*rq) / (4.0*u_knee + 0.00001);
  float weight = max(luma - u_threshold, w) / max(luma, 0.00001);
  fragColor = vec4(col.rgb * weight, 1.0);
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform vec2 u_dir;
uniform vec2 u_resolution;
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec2 px = u_dir / u_resolution;
  vec4 c = vec4(0.0);
  float w[5]; w[0]=0.227; w[1]=0.194; w[2]=0.121; w[3]=0.054; w[4]=0.016;
  c += texture(u_input, v_uv) * w[0];
  for (int i=1;i<5;i++) {
    c += texture(u_input, v_uv + px*float(i)) * w[i];
    c += texture(u_input, v_uv - px*float(i)) * w[i];
  }
  fragColor = c;
}`;

const COMP_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_original, u_bloom;
uniform float u_intensity;
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec4 orig  = texture(u_original, v_uv);
  vec4 bloom = texture(u_bloom,    v_uv);
  fragColor = clamp(orig + bloom * u_intensity, 0.0, 1.0);
}`;

export class BloomNode extends Node {
  constructor() {
    super(); this.label = 'Bloom';
    this._fbos = null;
  }
  get inputPorts()  { return ['input', 'bypass']; }
  get outputPorts() { return ['output']; }
  get params() { return [
    { name: 'threshold', type: 'float', min: 0,   max: 1,  value: 0.6,  step: 0.01 },
    { name: 'knee',      type: 'float', min: 0,   max: 0.5,value: 0.1,  step: 0.01 },
    { name: 'intensity', type: 'float', min: 0,   max: 5,  value: 1.5,  step: 0.1  },
    { name: 'radius',    type: 'int',   min: 1,   max: 4,  value: 2 },
  ]; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this._threshProg = createProgram(gl, VERT, THRESHOLD_FRAG);
    this._blurProg   = createProgram(gl, VERT, BLUR_FRAG);
    this._compProg   = createProgram(gl, VERT, COMP_FRAG);
    this._mkFBOs(gl);
  }
  _mkFBOs(gl) {
    const w = this.width, h = this.height;
    this._fbos = [
      createFBO(gl, w, h),  // threshold
      createFBO(gl, w, h),  // blur h
      createFBO(gl, w, h),  // blur v
    ];
  }
  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._fbos) return;
    const gl = this.renderer.gl;
    this._fbos = this._fbos.map(f => resizeFBO(gl, f, w, h));
  }

  _pass(gl, prog, src, dst, setUniforms) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    if (!this._inputLocs) this._inputLocs = new WeakMap();
    let inputLoc = this._inputLocs.get(prog);
    if (inputLoc === undefined) {
      inputLoc = gl.getUniformLocation(prog, 'u_input');
      this._inputLocs.set(prog, inputLoc);
    }
    gl.uniform1i(inputLoc, 0);
    setUniforms(prog);
    this.renderer.quad.draw();
  }

  render() {
    if (this.bypassed) return this.getInputTexture('input');
    const inputTex = this.getInputTexture('input');
    if (!inputTex) return null;
    const { gl } = this.renderer;

    // 1. Threshold
    this._pass(gl, this._threshProg, inputTex, this._fbos[0], p => {
      const Lt = this._cacheLocs(p, ['u_threshold','u_knee']);
      gl.uniform1f(Lt.u_threshold, this.getParam('threshold'));
      gl.uniform1f(Lt.u_knee,      this.getParam('knee'));
    });

    // 2. Blur passes (radius iterations)
    const radius = this.getParam('radius');
    let src = this._fbos[0].texture;
    for (let i = 0; i < radius; i++) {
      this._pass(gl, this._blurProg, src, this._fbos[1], p => {
        const Lb = this._cacheLocs(p, ['u_dir','u_resolution']);
        gl.uniform2f(Lb.u_dir, 1, 0);
        gl.uniform2f(Lb.u_resolution, this.width, this.height);
      });
      this._pass(gl, this._blurProg, this._fbos[1].texture, this._fbos[2], p => {
        const Lb = this._cacheLocs(p, ['u_dir','u_resolution']);
        gl.uniform2f(Lb.u_dir, 0, 1);
        gl.uniform2f(Lb.u_resolution, this.width, this.height);
      });
      src = this._fbos[2].texture;
    }

    // 3. Composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbos[0].fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this._compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex);
    if (!this._compLocs) this._compLocs = {
      orig:  gl.getUniformLocation(this._compProg, 'u_original'),
      bloom: gl.getUniformLocation(this._compProg, 'u_bloom'),
      intens:gl.getUniformLocation(this._compProg, 'u_intensity'),
    };
    gl.uniform1i(this._compLocs.orig, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(this._compLocs.bloom, 1);
    gl.uniform1f(this._compLocs.intens, this.getParam('intensity'));
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbos[0].texture;
  }
}
