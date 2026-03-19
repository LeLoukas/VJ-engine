import { Node } from '../Node.js';

/**
 * DrawNode
 * Canvas de dessin libre par-dessus le rendu WebGL.
 * Activé via drawNode.setDrawing(true) — capte les événements souris
 * directement sur le canvas WebGL sans changer de page.
 */
export class DrawNode extends Node {
  constructor() {
    super();
    this.label        = 'Draw';
    this._texture     = null;
    this._canvas      = null;
    this._ctx2d       = null;
    this._dirty       = true;
    this._drawing     = false;
    this._lastX       = 0;
    this._lastY       = 0;
    this._active      = false;  // mode dessin actif

    this.brushColor   = '#ffffff';
    this.mode         = 'draw';

    // Handlers bound pour pouvoir les remove
    this._onDown  = this._onDown.bind(this);
    this._onMove  = this._onMove.bind(this);
    this._onUp    = this._onUp.bind(this);
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'brushSize', type: 'int',   min: 1,   max: 100, value: 12 },
    { name: 'opacity',   type: 'float', min: 0.01, max: 1,  value: 1,  step: 0.01 },
  ]; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;

    this._canvas        = document.createElement('canvas');
    this._canvas.width  = this.width;
    this._canvas.height = this.height;
    this._ctx2d         = this._canvas.getContext('2d');

    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  resize(w, h) {
    if (!this._canvas) return;
    const tmp = document.createElement('canvas');
    tmp.width = this._canvas.width; tmp.height = this._canvas.height;
    tmp.getContext('2d').drawImage(this._canvas, 0, 0);
    this._canvas.width = w; this._canvas.height = h;
    this._ctx2d.drawImage(tmp, 0, 0, w, h);
    super.resize(w, h);
    this._dirty = true;
  }

  // ── Activation du mode dessin ────────────────────────────

  setActive(active) {
    this._active = active;
    const glCanvas = this.renderer?.canvas;
    if (!glCanvas) return;
    if (active) {
      glCanvas.style.cursor = 'crosshair';
      glCanvas.addEventListener('mousedown', this._onDown);
      window.addEventListener('mousemove', this._onMove);
      window.addEventListener('mouseup',   this._onUp);
    } else {
      glCanvas.style.cursor = '';
      glCanvas.removeEventListener('mousedown', this._onDown);
      window.removeEventListener('mousemove', this._onMove);
      window.removeEventListener('mouseup',   this._onUp);
    }
  }

  // ── Mouse handlers ───────────────────────────────────────

  _getPos(e) {
    const r = this.renderer.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.width  / r.width),
      y: (e.clientY - r.top)  * (this.height / r.height),
    };
  }

  _onDown(e) {
    e.preventDefault();
    this._drawing = true;
    const p = this._getPos(e);
    this._lastX = p.x; this._lastY = p.y;
    this._dot(p.x, p.y);
  }

  _onMove(e) {
    if (!this._drawing) return;
    const p = this._getPos(e);
    this._line(this._lastX, this._lastY, p.x, p.y);
    this._lastX = p.x; this._lastY = p.y;
  }

  _onUp() { this._drawing = false; }

  // ── Dessin 2D ────────────────────────────────────────────

  _dot(x, y) {
    const ctx   = this._ctx2d;
    const size  = this.getParam('brushSize');
    const alpha = this.getParam('opacity');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.fillStyle = this.brushColor;
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this._dirty = true;
  }

  _line(x0, y0, x1, y1) {
    const ctx   = this._ctx2d;
    const size  = this.getParam('brushSize');
    const alpha = this.getParam('opacity');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = this.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = this.brushColor;
    ctx.lineWidth   = size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
    this._dirty = true;
  }

  clear() {
    this._ctx2d?.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._dirty = true;
  }

  render() {
    if (!this._dirty) return this._texture;
    const gl = this.renderer.gl;
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this._canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this._dirty = false;
    return this._texture;
  }
}
