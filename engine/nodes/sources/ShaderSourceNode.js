import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';
import { Node } from '../Node.js';

/**
 * ShaderSourceNode
 * Source procédurale — aucun port d'entrée.
 * Génère une image via un fragment shader GLSL.
 * Le fragSrc par défaut est un plasma animé.
 */

const DEFAULT_FRAG = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
out vec4 fragColor;

vec3 hash3(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)),
                dot(p, vec2(269.5, 183.3)),
                dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash3(i + vec2(0,0)).xy, f - vec2(0,0)),
        dot(hash3(i + vec2(1,0)).xy, f - vec2(1,0)), u.x),
    mix(dot(hash3(i + vec2(0,1)).xy, f - vec2(0,1)),
        dot(hash3(i + vec2(1,1)).xy, f - vec2(1,1)), u.x),
    u.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p  = uv * 2.0 - 1.0;
  p.x    *= u_resolution.x / u_resolution.y;

  float t  = u_time * 0.4;
  float n1 = noise(p * 2.5 + vec2(t * 0.7,  t * 0.3));
  float n2 = noise(p * 4.0 - vec2(t * 0.4,  t * 0.9));
  float n3 = noise(p * 1.5 + vec2(cos(t) * 0.5, sin(t) * 0.5));

  float plasma   = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  vec3  col      = 0.5 + 0.5 * cos(6.28318 * (plasma + vec3(0.0, 0.33, 0.66) + t * 0.1));

  fragColor = vec4(col, 1.0);
}`;

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export class ShaderSourceNode extends Node {
  constructor(fragSrc = DEFAULT_FRAG) {
    super();
    this._fragSrc = fragSrc;
    this.label    = 'ShaderSource';
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, this._fragSrc);
    this._fbo = createFBO(gl, this.width, this.height);
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer) return;
    this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }

  render() {
    const { gl } = this.renderer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
