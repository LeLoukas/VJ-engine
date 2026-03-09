import { Node } from '../Node.js';

/**
 * MediaNode
 * Charge une image ou une vidéo depuis un fichier local (input file)
 * et l'expose comme texture WebGL.
 * - Image : statique, uploadée une fois
 * - Vidéo : loop, uploadée chaque frame quand readyState >= 2
 */
export class MediaNode extends Node {
  constructor() {
    super();
    this.label    = 'Media';
    this._texture = null;
    this._video   = null;
    this._isVideo = false;
    this._loaded  = false;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  init(renderer) {
    super.init(renderer);
    const gl = this.renderer.gl;

    // Texture placeholder 1x1 gris
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 30, 30, 255]));
    this._setTextureParams(gl);
  }

  _setTextureParams(gl) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // ── Chargement ───────────────────────────────────────────

  loadFile(file) {
    const url = URL.createObjectURL(file);
    const type = file.type;

    if (type.startsWith('video/')) {
      this._loadVideo(url);
    } else if (type.startsWith('image/')) {
      this._loadImage(url);
    } else {
      console.warn(`MediaNode: unsupported type "${type}"`);
    }
  }

  _loadImage(url) {
    const img = new Image();
    img.onload = () => {
      const gl = this.renderer?.gl;
      if (!gl) return;
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,
                    gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this._setTextureParams(gl);
      this._isVideo = false;
      this._loaded  = true;
    };
    img.src = url;
  }

  _loadVideo(url) {
    // Arrêter l'ancienne vidéo si besoin
    if (this._video) {
      this._video.pause();
      this._video.src = '';
    }
    const video = document.createElement('video');
    video.src       = url;
    video.loop      = true;
    video.muted     = true;
    video.autoplay  = true;
    video.playsInline = true;
    video.play().catch(() => {});
    this._video  = video;
    this._isVideo = true;
    this._loaded  = true;
  }

  // ── Render ───────────────────────────────────────────────

  render() {
    const gl = this.renderer.gl;

    if (this._isVideo && this._video?.readyState >= 2) {
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,
                    gl.RGBA, gl.UNSIGNED_BYTE, this._video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    return this._texture;
  }
}
