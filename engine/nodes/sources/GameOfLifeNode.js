import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * GameOfLifeNode
 * Jeu de la Vie de Conway simulé sur GPU avec ping-pong FBO.
 * Résolution indépendante du canvas (cellSize contrôle la taille).
 */

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Shader de simulation — règles de Conway
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform vec2      u_size;
in vec2 v_uv;
out vec4 fragColor;

float cell(vec2 offset) {
  return texture(u_state, v_uv + offset / u_size).r > 0.5 ? 1.0 : 0.0;
}

void main() {
  float alive = cell(vec2(0));
  float n =
    cell(vec2(-1,-1)) + cell(vec2(0,-1)) + cell(vec2(1,-1)) +
    cell(vec2(-1, 0)) +                    cell(vec2(1, 0)) +
    cell(vec2(-1, 1)) + cell(vec2(0, 1)) + cell(vec2(1, 1));

  float next = 0.0;
  if (alive > 0.5) next = (n == 2.0 || n == 3.0) ? 1.0 : 0.0;
  else             next = (n == 3.0) ? 1.0 : 0.0;

  fragColor = vec4(next, next, next, 1.0);
}`;

// Shader de rendu — colorie les cellules vivantes
const RENDER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform float     u_time;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  float alive = texture(u_state, v_uv).r;
  if (alive < 0.5) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // Couleur basée sur la position + temps
  vec3 col = 0.5 + 0.5 * cos(u_time * 0.3 + v_uv.xyx * 4.0 + vec3(0.0, 2.1, 4.2));
  fragColor = vec4(col, 1.0);
}`;

export class GameOfLifeNode extends Node {
  constructor() {
    super();
    this.label      = 'GameOfLife';
    this._simProg   = null;
    this._renderProg= null;
    this._pingpong  = null;
    this._outputFBO = null;
    this._current   = 0;
    this._stepTimer = 0;
    this._cellW     = 0;
    this._cellH     = 0;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'cellSize', type: 'int',   min: 2,  max: 16,  value: 4  },
    { name: 'speed',    type: 'float', min: 1,  max: 60,  value: 15, step: 1 },
  ]; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this._simProg    = createProgram(gl, VERT, SIM_FRAG);
    this._renderProg = createProgram(gl, VERT, RENDER_FRAG);
    this._initBuffers(gl);
  }

  _initBuffers(gl) {
    const cellSize = this.getParam('cellSize');
    this._cellW = Math.floor(this.width  / cellSize);
    this._cellH = Math.floor(this.height / cellSize);

    // Init aléatoire
    const data = new Uint8Array(this._cellW * this._cellH * 4);
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() > 0.65 ? 255 : 0;
      data[i] = data[i+1] = data[i+2] = v; data[i+3] = 255;
    }

    const makeTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this._cellW, this._cellH, 0,
                    gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    };

    const makeFBO = (tex) => {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return fbo;
    };

    const t0 = makeTex(), t1 = makeTex();
    this._pingpong = [
      { texture: t0, fbo: makeFBO(t0) },
      { texture: t1, fbo: makeFBO(t1) },
    ];
    this._outputFBO = createFBO(gl, this.width, this.height);
    this._current   = 0;
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer) return;
    const gl = this.renderer.gl;
    this._outputFBO = resizeFBO(gl, this._outputFBO, w, h);
    this._initBuffers(gl);
  }

  render() {
    const { gl } = this.renderer;

    // Reinit si cellSize a changé
    const cellSize = this.getParam('cellSize');
    if (cellSize !== this._lastCellSize) {
      this._lastCellSize = cellSize;
      this._initBuffers(gl);
    }

    const dt      = 1 / 60;
    const speed   = this.getParam('speed');
    this._stepTimer += dt;

    if (this._stepTimer >= 1 / speed) {
      this._stepTimer = 0;
      this._step(gl);
    }

    this._draw(gl);
    return this._outputFBO.texture;
  }

  _step(gl) {
    const read  = this._current;
    const write = 1 - this._current;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._pingpong[write].fbo);
    gl.viewport(0, 0, this._cellW, this._cellH);
    gl.useProgram(this._simProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._pingpong[read].texture);
    const Ls = this._cacheLocs(this._simProg, ['u_state','u_size']);
    gl.uniform1i(Ls.u_state, 0);
    gl.uniform2f(Ls.u_size, this._cellW, this._cellH);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._current = write;
  }

  _draw(gl) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._outputFBO.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this._renderProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._pingpong[this._current].texture);
    const Lr = this._cacheLocs(this._renderProg, ['u_state','u_time']);
    gl.uniform1i(Lr.u_state, 0);
    gl.uniform1f(Lr.u_time, this.renderer.time);
    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
