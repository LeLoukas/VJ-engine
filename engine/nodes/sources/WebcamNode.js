import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';

/**
 * WebcamNode
 * Source vidéo live via MediaDevices / getUserMedia.
 * Permet maintenant de choisir explicitement un périphérique vidéo (deviceId).
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
    this._stream  = null;
    this._texture = null;
    this._ready   = false;
    this._error   = null;

    this.deviceId = '';
    this.devices  = [];
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this.program = createProgram(gl, VERT, FRAG);

    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this._startCamera();
  }

  async refreshDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('WebcamNode: enumerateDevices() not supported');
        return [];
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter(d => d.kind === 'videoinput');
      return this.devices;
    } catch (e) {
      console.warn('WebcamNode: failed to enumerate devices —', e.message);
      return [];
    }
  }

  async setDeviceId(deviceId) {
    if (this.deviceId === deviceId) return;
    this.deviceId = deviceId || '';
    await this._startCamera();
  }

  _stopCurrentStream() {
    this._ready = false;

    if (this._video) {
      this._video.pause();
      this._video.srcObject = null;
    }

    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
  }

  _buildConstraints() {
    if (this.deviceId) {
      return {
        video: {
          deviceId: { exact: this.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
    }

    return {
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
  }

  async _startCamera() {
    this._stopCurrentStream();
    this._error = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(this._buildConstraints());

      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      await video.play();

      this._stream = stream;
      this._video = video;
      this._ready = true;

      await this.refreshDevices();

      // Si aucun deviceId n’était encore fixé, on récupère celui réellement utilisé
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      if (!this.deviceId && settings?.deviceId) {
        this.deviceId = settings.deviceId;
      }
    } catch (e) {
      this._error = e.message;
      console.warn('WebcamNode: camera unavailable —', e.message);

      // Même en cas d’échec, on tente de lister les devices si possible
      await this.refreshDevices();
    }
  }

  render() {
    const { gl } = this.renderer;

    if (this._ready && this._video?.readyState >= 2) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, this._texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this._video
      );
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    return this._texture;
  }

  destroy() {
    this._stopCurrentStream();
  }
}