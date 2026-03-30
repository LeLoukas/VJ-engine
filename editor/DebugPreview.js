/**
 * DebugPreview
 * Zone fixe en bas du panel droit — affiche la texture du node survolé.
 */
export class DebugPreview {
  constructor(graph, renderer) {
    this.graph    = graph;
    this.renderer = renderer;
    this._canvas  = null;
    this._ctx     = null;
    this._label   = null;
    this._currentNodeId = null;
    this._rafId   = null;
    this._running = false;
  }

  /** Appelé par l'éditeur après création du panel */
  mount(container) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'debug-preview-wrap';

    const title = document.createElement('div');
    title.className = 'debug-preview-title';
    title.textContent = 'preview';
    wrap.appendChild(title);

    this._canvas = document.createElement('canvas');
    this._canvas.width  = 156;
    this._canvas.height = 88;
    this._canvas.className = 'debug-preview-canvas';
    this._ctx = this._canvas.getContext('2d');
    wrap.appendChild(this._canvas);

    this._label = document.createElement('div');
    this._label.className = 'debug-preview-label';
    this._label.textContent = '—';
    wrap.appendChild(this._label);

    container.appendChild(wrap);
    this._drawEmpty();
    this._startLoop();
  }

  show(nodeId) {
    this._currentNodeId = nodeId;
    const wNode = this.graph.nodes.find(n => n.id === nodeId);
    if (this._label) this._label.textContent = wNode?.label ?? '—';
  }

  hide() {
    this._currentNodeId = null;
    if (this._label) this._label.textContent = '—';
    this._drawEmpty();
  }

  _drawEmpty() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 156, 88);
    ctx.fillStyle = '#222';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('hover a node', 78, 47);
  }

  _startLoop() {
    this._running = true;
    const tick = () => {
      if (!this._running) return;
      if (this._currentNodeId) this._update();
      this._rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  _update() {
    const nodeId = this._currentNodeId;
    if (!nodeId || !this._ctx) return;

    const gl      = this.renderer.gl;
    const texture = this.graph._outputs?.get(nodeId);

    if (!texture) {
      const ctx = this._ctx;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, 156, 88);
      ctx.fillStyle = '#333';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('no texture', 60, 37);
      return;
    }

    const W = 156, H = 88;

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Lire la vraie taille attachée au FBO — évite out-of-bounds
    const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    // Interroger la texture pour ses dimensions réelles
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const srcW = this.renderer.width;
    const srcH = this.renderer.height;

    // Vérifier que le FBO est complet avant de lire
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      this._drawEmpty();
      return;
    }

    const buf = new Uint8Array(srcW * srcH * 4);
    gl.readPixels(0, 0, srcW, srcH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);

    // Créer un canvas temporaire à la taille source, flipper Y
    const tmp = document.createElement('canvas');
    tmp.width = srcW; tmp.height = srcH;
    const tctx = tmp.getContext('2d');
    const imgData = tctx.createImageData(srcW, srcH);
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const src = ((srcH - 1 - y) * srcW + x) * 4;
        const dst = (y * srcW + x) * 4;
        imgData.data[dst]   = buf[src];
        imgData.data[dst+1] = buf[src+1];
        imgData.data[dst+2] = buf[src+2];
        imgData.data[dst+3] = 255;
      }
    }
    tctx.putImageData(imgData, 0, 0);
    // Dessiner scalé dans le canvas preview
    this._ctx.fillStyle = '#000';
    this._ctx.fillRect(0, 0, W, H);
    this._ctx.drawImage(tmp, 0, 0, W, H);
  }

  destroy() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
}
