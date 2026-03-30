import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

export const DEFAULT_FRAG = `#version 300 es
precision highp float;
uniform vec2  u_resolution;
uniform float u_time;
// Declare custom params like: uniform float p_amount; // min:0 max:1 default:0.5
in vec2 v_uv; out vec4 fragColor;

void main() {
  vec2 uv = v_uv - 0.5;
  uv.x *= u_resolution.x / u_resolution.y;
  float d = length(uv);
  vec3 col = 0.5 + 0.5*cos(u_time + d*6.0 + vec3(0,2,4));
  fragColor = vec4(col, 1.0);
}`;

// Globals injected by Renderer — never parsed as custom params
const BUILTIN_UNIFORMS = new Set([
  'u_time','u_resolution','u_bass','u_mid','u_treble',
  'u_amplitude','u_beat','u_fft','u_input',
]);

/**
 * Parse les uniforms custom depuis le GLSL.
 * Format supporté :
 *   uniform float p_name;               → range 0..1, default 0.5
 *   uniform float p_name; // min:0 max:10 default:5
 *   uniform int   p_name; // min:0 max:8 default:4
 */
function parseCustomUniforms(src) {
  const params = [];
  const re = /uniform\s+(float|int)\s+(\w+)\s*;[^\n]*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [line, type, name] = m;
    if (BUILTIN_UNIFORMS.has(name)) continue;

    const minM  = line.match(/min:([-\d.]+)/);
    const maxM  = line.match(/max:([-\d.]+)/);
    const defM  = line.match(/default:([-\d.]+)/);
    const stepM = line.match(/step:([-\d.]+)/);

    const isInt = type === 'int';
    const min   = minM  ? parseFloat(minM[1])  : 0;
    const max   = maxM  ? parseFloat(maxM[1])  : 1;
    const val   = defM  ? parseFloat(defM[1])  : (min + max) / 2;
    const step  = stepM ? parseFloat(stepM[1]) : isInt ? 1 : 0.01;

    params.push({ name, type: isInt ? 'int' : 'float', min, max, value: val, step });
  }
  return params;
}

export class ShaderEditNode extends Node {
  constructor() {
    super();
    this.label      = 'ShaderEdit';
    this._fbo       = null;
    this.fragSrc    = DEFAULT_FRAG;
    this._customParams = [];
    this.error      = null;
    this.onError    = null;
    this.onParamsChanged = null;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }
  get params()      { return this._customParams; }

  init(renderer) {
    super.init(renderer);
    this._compile(renderer.gl);
    this._fbo = createFBO(renderer.gl, this.width, this.height);
  }

  resize(w,h) {
    super.resize(w,h);
    if (this.renderer && this._fbo)
      this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }

  updateFrag(src) {
    this.fragSrc = src;
    // Re-parse params
    const newParams = parseCustomUniforms(src);
    // Preserve existing values for params that still exist
    for (const p of newParams) {
      const old = this._customParams.find(o => o.name === p.name);
      if (old) p.value = this._paramValues[p.name] ?? p.value;
    }
    this._customParams = newParams;
    // Re-init paramValues for new params
    for (const p of this._customParams) {
      if (!(p.name in this._paramValues)) this._paramValues[p.name] = p.value;
    }
    if (this.renderer) this._compile(this.renderer.gl);
    if (this.onParamsChanged) this.onParamsChanged(this._customParams);
  }

  _compile(gl) {
    try {
      const prog = createProgram(gl, VERT, this.fragSrc);
      this.program = prog;
      this.error   = null;
      if (this.onError) this.onError(null);
    } catch(e) {
      this.error = e.message;
      if (this.onError) this.onError(e.message);
    }
  }

  render() {
    if (!this.program) return null;
    const {gl} = this.renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    // Injecter les params custom
    for (const p of this._customParams) {
      const loc = gl.getUniformLocation(this.program, p.name);
      if (loc === null) continue;
      const val = this.getParam(p.name);
      if (p.type === 'int') gl.uniform1i(loc, val);
      else                  gl.uniform1f(loc, val);
    }
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
