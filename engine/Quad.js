/**
 * Fullscreen quad partagé par tous les nodes.
 * Géométrie : 4 vertices en TRIANGLE_STRIP couvrant [-1, 1]².
 * Créé une seule fois par le Renderer, passé aux nodes via renderer.quad.
 */
export class Quad {
  constructor(gl) {
    this.gl  = gl;
    this.vao = null;
    this._init();
  }

  _init() {
    const gl    = this.gl;
    const verts = new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
