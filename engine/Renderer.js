import { Quad }          from './Quad.js';
import { AudioAnalyser } from './AudioAnalyser.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl     = canvas.getContext('webgl2');
    if (!this.gl) throw new Error('WebGL2 not supported');

    this.width  = canvas.clientWidth;
    this.height = canvas.clientHeight;
    this.time   = 0;
    this.graph  = null;

    this.quad            = new Quad(this.gl);
    this.audio           = new AudioAnalyser(this.gl);
    this._routeRegistry  = new Map();

    this._bindResize();
  }

  // ── Resize ──────────────────────────────────────────────

  _bindResize() {
    const observer = new ResizeObserver(() => this._onResize());
    observer.observe(this.canvas);
    this._onResize();
  }

  _onResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width  = w;
    this.canvas.height = h;
    this.width  = w;
    this.height = h;
    this.gl.viewport(0, 0, w, h);
    if (this.graph) this.graph.resize(w, h);
  }

  // ── Audio ───────────────────────────────────────────────

  async startAudio() {
    await this.audio.start();
  }

  // ── Uniforms globaux ────────────────────────────────────

  /**
   * Injecte dans le program actif :
   *   u_time, u_resolution
   *   u_bass, u_mid, u_treble, u_amplitude, u_beat
   *   u_fft  (texture R8 256x1, unit 7)
   */
  setGlobalUniforms(program) {
    const gl = this.gl;
    // Cache des locations par program pour éviter getUniformLocation chaque frame
    if (!this._uniformCache) this._uniformCache = new WeakMap();
    let locs = this._uniformCache.get(program);
    if (!locs) {
      locs = {
        time: gl.getUniformLocation(program, 'u_time'),
        res:  gl.getUniformLocation(program, 'u_resolution'),
      };
      this._uniformCache.set(program, locs);
    }
    if (locs.time) gl.uniform1f(locs.time, this.time);
    if (locs.res)  gl.uniform2f(locs.res,  this.width, this.height);
    this.audio.bindUniforms(gl, program, 7);
  }

  // ── Graph ───────────────────────────────────────────────

  setGraph(graph) {
    this.graph = graph;
    graph.init(this);
  }

  // ── Render loop ─────────────────────────────────────────

  render(dt) {
    this.time += dt;
    this._routeRegistry.clear();
    this.audio.update();
    if (this.graph) this.graph.execute();

    // ── FPS counter ───────────────────────────────────────
    this._fpsFrames = (this._fpsFrames ?? 0) + 1;
    this._fpAccum   = (this._fpAccum   ?? 0) + dt;
    if (this._fpAccum >= 0.5) {
      this.fps       = Math.round(this._fpsFrames / this._fpAccum);
      this._fpsFrames = 0;
      this._fpAccum   = 0;
    }


  }
}
