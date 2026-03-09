import { EffectNode } from './EffectNode.js';

/**
 * BlurNode — flou gaussien approximé en un seul pass.
 * @param {number} radius - rayon en pixels (défaut: 4)
 */
export class BlurNode extends EffectNode {
  constructor(radius = 4) {
    super();
    this.radius = radius;
    this.label  = 'Blur';
  }

  get fragSrc() { return `#version 300 es
precision highp float;

uniform sampler2D u_input;
uniform vec2      u_resolution;
uniform float     u_radius;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 texel = 1.0 / u_resolution;
  vec4 color = vec4(0.0);
  float total = 0.0;
  int r = int(u_radius);

  for (int x = -8; x <= 8; x++) {
    for (int y = -8; y <= 8; y++) {
      if (abs(x) > r || abs(y) > r) continue;
      float w = exp(-float(x*x + y*y) / (2.0 * u_radius * u_radius));
      color += texture(u_input, v_uv + vec2(x, y) * texel) * w;
      total += w;
    }
  }

  fragColor = color / total;
}`; }

  render() {
    const { gl } = this.renderer;
    const inputTexture = this.getInputTexture('input');

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    this.renderer.setGlobalUniforms(this.program);

    if (inputTexture !== null) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTexture);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_input'), 0);
    }

    gl.uniform1f(gl.getUniformLocation(this.program, 'u_radius'), this.radius);

    this.renderer.quad.draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this._fbo.texture;
  }
}
