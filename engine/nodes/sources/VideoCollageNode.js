import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * VideoCollageNode
 * Joue plusieurs vidéos en simultané avec positions/tailles aléatoires.
 * Les vidéos se superposent en mode additif ou alpha.
 * L'utilisateur sélectionne un dossier de vidéos via un input file.
 */

const VERT = `#version 300 es
in vec2 a_position; out vec2 v_uv;
void main() { v_uv=a_position*0.5+0.5; gl_Position=vec4(a_position,0,1); }`;

// Passe 1 : clear + accumulation background
const CLEAR_FRAG = `#version 300 es
precision highp float;
void main() { }`;  // unused, we use gl.clear

// Passe pour chaque vidéo : draw dans le FBO avec position/taille/blend
const COMP_VERT = `#version 300 es
in vec2 a_position;
uniform vec4 u_rect;  // x, y, w, h en coordonnées normalisées
out vec2 v_uv;
void main() {
  // a_position est [-1,1] — on le mappe dans u_rect
  vec2 pos = a_position * 0.5 + 0.5;  // 0..1
  vec2 world = u_rect.xy + pos * u_rect.zw;
  // Ramener en clip space
  gl_Position = vec4(world * 2.0 - 1.0, 0.0, 1.0);
  v_uv = pos;
}`;

const COMP_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_video;
uniform float     u_alpha;
uniform int       u_blendMode;  // 0=alpha, 1=additive
in vec2 v_uv; out vec4 fragColor;
void main() {
  vec4 col = texture(u_video, vec2(v_uv.x, 1.0 - v_uv.y));
  col.a   *= u_alpha;
  if (u_blendMode == 1) {
    // Additive : pas de alpha, juste ajouter
    fragColor = vec4(col.rgb * u_alpha, 0.0);
  } else {
    fragColor = col;
  }
}`;

function rand(min, max) { return min + Math.random() * (max - min); }

export class VideoCollageNode extends Node {
  constructor() {
    super();
    this.label    = 'VideoCollage';
    this._fbo     = null;
    this._videos  = [];      // liste des fichiers chargés
    this._slots   = [];      // slots actifs { el, tex, rect, alpha, file }
    this._spawnTimer = 0;
    this._compProg = null;
    this._quadVAO  = null;
    this.onFilesLoaded = null;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  get params() { return [
    { name: 'maxSlots',   type: 'int',   min: 1,   max: 8,   value: 3    },
    { name: 'spawnEvery', type: 'float', min: 0.1, max: 10,  value: 2.0, step: 0.1 },
    { name: 'minSize',    type: 'float', min: 0.1, max: 1,   value: 0.3, step: 0.01 },
    { name: 'maxSize',    type: 'float', min: 0.1, max: 1.5, value: 0.7, step: 0.01 },
    { name: 'alpha',      type: 'float', min: 0,   max: 1,   value: 0.8, step: 0.01 },
    { name: 'blendMode',  type: 'int',   min: 0,   max: 1,   value: 0   },
  ]; }

  static get modeNames() { return ['Alpha', 'Additive']; }

  init(renderer) {
    super.init(renderer);
    const gl = renderer.gl;
    this._compProg = createProgram(gl, COMP_VERT, COMP_FRAG);
    this._fbo      = createFBO(gl, this.width, this.height);
    this._initQuad(gl);
  }

  _initQuad(gl) {
    const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    this._quadBuf = buf;
  }

  resize(w, h) {
    super.resize(w, h);
    if (!this.renderer || !this._fbo) return;
    this._fbo = resizeFBO(this.renderer.gl, this._fbo, w, h);
  }

  /** Appelé depuis l'UI avec les fichiers sélectionnés */
  loadFiles(files) {
    this._videos = [...files];
    if (this.onFilesLoaded) this.onFilesLoaded(this._videos.length);
  }

  _spawnSlot() {
    if (!this._videos.length) return;
    const maxSlots = this.getParam('maxSlots');
    if (this._slots.length >= maxSlots) {
      // Supprimer le plus vieux
      const old = this._slots.shift();
      old.el.pause();
      if (old.url) URL.revokeObjectURL(old.url);
      old.el.src = '';
      if (old.tex) this.renderer.gl.deleteTexture(old.tex);
    }

    const file = this._videos[Math.floor(Math.random() * this._videos.length)];
    const minS = this.getParam('minSize');
    const maxS = this.getParam('maxSize');
    const size = rand(minS, maxS);
    const aspect = this.width / this.height;

    // Position aléatoire — peut déborder légèrement
    const x = rand(-0.1, 1.1 - size);
    const y = rand(-0.1, 1.1 - size / aspect);

    const objectURL = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.src    = objectURL;
    el.loop   = true;
    el.addEventListener('error', (e) => {
      console.error('[VideoCollage] Video load failed:', file.name, e.target.error?.message ?? e);
    }, { once: true });
    el.muted  = true;
    el.playsInline = true;
    el.preload = 'metadata';

    // Démarrer à un moment aléatoire une fois les métadonnées chargées
    el.addEventListener('loadedmetadata', () => {
      const duration = el.duration;
      if (duration && isFinite(duration) && duration > 1) {
        el.currentTime = Math.random() * (duration * 0.9);  // éviter la toute fin
      }
      el.play().catch(() => {});
    }, { once: true });

    const gl  = this.renderer.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Placeholder 1x1
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));

    this._slots.push({ el, tex, rect: [x, y, size, size / aspect], ready: false, url: objectURL });
  }

  render() {
    const { gl } = this.renderer;
    const dt = 1 / 60;
    this._spawnTimer += dt;

    if (this._spawnTimer >= this.getParam('spawnEvery') && this._videos.length) {
      this._spawnTimer = 0;
      this._spawnSlot();
    }

    // Mettre à jour les textures vidéo
    for (const slot of this._slots) {
      if (slot.el.readyState >= 2) {
        gl.bindTexture(gl.TEXTURE_2D, slot.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, slot.el);
        slot.ready = true;
      }
    }

    // Render dans le FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this._slots.some(s => s.ready)) {
      gl.useProgram(this._compProg);

      // Activer le blending
      gl.enable(gl.BLEND);
      const mode = this.getParam('blendMode');
      if (mode === 1) {
        gl.blendFunc(gl.ONE, gl.ONE);  // Additive
      } else {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);  // Alpha
      }

      const posLoc = gl.getAttribLocation(this._compProg, 'a_position');
      gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuf);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const alpha = this.getParam('alpha');
      const Lv = this._cacheLocs(this._compProg, ['u_blendMode','u_video','u_alpha','u_rect']);
      gl.uniform1i(Lv.u_blendMode, mode);

      for (const slot of this._slots) {
        if (!slot.ready) continue;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, slot.tex);
        gl.uniform1i(Lv.u_video, 0);
        gl.uniform1f(Lv.u_alpha, alpha);
        gl.uniform4fv(Lv.u_rect, slot.rect);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      gl.disable(gl.BLEND);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
