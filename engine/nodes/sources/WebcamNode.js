import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';

/**
 * WebcamNode
 * Capture le flux webcam via getUserMedia et l'upload chaque frame
 * comme texture WebGL2.
 * Port de sortie : 'output'
 */

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, a_position.y * 0.5 + 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_video;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_video, v_uv);
}`;

export class WebcamNode extends Node {
  constructor() {
    super();
    this.label    = 'Webcam';
    this._video   = null;
    this._texture = null;
    this._ready   = false;
    this._error   = null;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);

    // Texture vidéo
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    // Placeholder 1x1 noir pendant que la caméra s'initialise
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._startCamera();
  }

  async _startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay  = true;
      video.playsInline = true;
      video.muted     = true;
      await video.play();
      this._video = video;
      this._ready = true;
    } catch (e) {
      this._error = e.message;
      console.warn('WebcamNode: camera unavailable —', e.message);
    }
  }

  render() {
    const { gl } = this.renderer;

    // Upload la frame vidéo si prête
    if (this._ready && this._video?.readyState >= 2) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,
                    gl.RGBA, gl.UNSIGNED_BYTE, this._video);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    // Rendu vers framebuffer (utiliser le FBO du renderer si dispo)
    // Pour simplifier : on retourne directement la texture vidéo
    // (OutputNode ou EffectNode suivant s'en occupent via TEXTURE0)
    return this._texture;
  }

  destroy() {
    if (this._video?.srcObject) {
      this._video.srcObject.getTracks().forEach(t => t.stop());
    }
  }
}
