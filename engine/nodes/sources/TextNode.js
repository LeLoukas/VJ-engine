import { Node } from '../Node.js';

/**
 * TextNode
 * Rend du texte sur un canvas 2D offscreen et l'uploade en texture WebGL.
 * Re-render uniquement quand le texte ou les params changent.
 */
export class TextNode extends Node {
  constructor() {
    super();
    this.label     = 'Text';
    this._texture  = null;
    this._canvas   = null;
    this._ctx2d    = null;
    this._dirty    = true;

    // Contenu
    this.text      = 'Hello';
    this.fontSize  = 80;
    this.fontFamily = 'monospace';
    this.color     = '#ffffff';
    this.align     = 'center';
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'size',    type: 'int',   min: 8,   max: 300, value: 80  },
    { name: 'offsetX', type: 'float', min: -1,  max: 1,   value: 0, step: 0.01 },
    { name: 'offsetY', type: 'float', min: -1,  max: 1,   value: 0, step: 0.01 },
  ]; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;

    // Canvas 2D offscreen
    this._canvas      = document.createElement('canvas');
    this._canvas.width  = this.width;
    this._canvas.height = this.height;
    this._ctx2d       = this._canvas.getContext('2d');

    // Texture WebGL
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._dirty = true;
  }

  resize(w, h) {
    super.resize(w, h);
    if (this._canvas) {
      this._canvas.width  = w;
      this._canvas.height = h;
      this._dirty = true;
    }
  }

  setText(text) {
    this.text   = text;
    this._dirty = true;
  }

  setColor(color) {
    this.color  = color;
    this._dirty = true;
  }

  _render2D() {
    const ctx  = this._ctx2d;
    const w    = this._canvas.width;
    const h    = this._canvas.height;
    const size = this.getParam('size');
    const ox   = this.getParam('offsetX') * w * 0.5;
    const oy   = this.getParam('offsetY') * h * 0.5;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle   = this.color;
    ctx.font        = `${size}px ${this.fontFamily}`;
    ctx.textAlign   = this.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, w / 2 + ox, h / 2 + oy);
  }

  render() {
    const gl    = this.renderer.gl;
    const size  = this.getParam('size');
    const ox    = this.getParam('offsetX');
    const oy    = this.getParam('offsetY');

    // Re-render si dirty ou si les params ont changé
    if (this._dirty || this._lastSize !== size || this._lastOx !== ox || this._lastOy !== oy) {
      this._render2D();
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,
                    gl.RGBA, gl.UNSIGNED_BYTE, this._canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this._dirty   = false;
      this._lastSize = size;
      this._lastOx   = ox;
      this._lastOy   = oy;
    }

    return this._texture;
  }
}
