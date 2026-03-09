import { Node } from './Node.js';
import { createProgram } from '../gl/createProgram.js';

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_input;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  fragColor = texture(u_input, v_uv);
}`;

export class OutputNode extends Node {
  constructor() {
    super();
    this.label = 'Output';
  }

  get inputPorts()  { return ['input']; }
  get outputPorts() { return []; }

  init(renderer) {
    super.init(renderer);
    this.program = createProgram(renderer.gl, VERT, FRAG);
  }

  render() {
    const { gl, width, height } = this.renderer;
    const inputTexture = this.getInputTexture('input');

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    // Pas de texture connectée → écran noir
    if (inputTexture === null) {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return null;
    }

    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_input'), 0);
    this.renderer.quad.draw();
    return null;
  }
}
