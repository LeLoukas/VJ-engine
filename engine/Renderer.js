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

    this.quad   = new Quad(this.gl);
    this.audio  = new AudioAnalyser(this.gl);

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

    const lTime = gl.getUniformLocation(program, 'u_time');
    const lRes  = gl.getUniformLocation(program, 'u_resolution');
    if (lTime) gl.uniform1f(lTime, this.time);
    if (lRes)  gl.uniform2f(lRes,  this.width, this.height);

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
    this.audio.update();
    if (this.graph) this.graph.execute();
  }
}
