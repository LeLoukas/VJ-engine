import { EffectNode } from './EffectNode.js';
export class ColorGradeNode extends EffectNode {
  constructor() { super(); this.label = 'ColorGrade'; }
  get params() { return [
    { name: 'hue',        type: 'float', min: -1,  max: 1,  value: 0.0,  step: 0.01 },
    { name: 'saturation', type: 'float', min: 0,   max: 3,  value: 1.0,  step: 0.01 },
    { name: 'brightness', type: 'float', min: -1,  max: 1,  value: 0.0,  step: 0.01 },
    { name: 'contrast',   type: 'float', min: 0,   max: 3,  value: 1.0,  step: 0.01 },
    { name: 'temperature',type: 'float', min: -1,  max: 1,  value: 0.0,  step: 0.01 },
  ]; }
  get fragSrc() { return `#version 300 es
precision highp float;
uniform sampler2D u_input;
uniform float u_hue, u_saturation, u_brightness, u_contrast, u_temperature;
in vec2 v_uv; out vec4 fragColor;

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r,max(c.g,c.b)), mn = min(c.r,min(c.g,c.b));
  float h=0.0,s=0.0,l=(mx+mn)*0.5;
  float d=mx-mn;
  if(d>0.0){
    s=d/(1.0-abs(2.0*l-1.0));
    if(mx==c.r) h=mod((c.g-c.b)/d,6.0)/6.0;
    else if(mx==c.g) h=((c.b-c.r)/d+2.0)/6.0;
    else h=((c.r-c.g)/d+4.0)/6.0;
  }
  return vec3(h,s,l);
}
vec3 hsl2rgb(vec3 c) {
  float C=(1.0-abs(2.0*c.z-1.0))*c.y;
  float X=C*(1.0-abs(mod(c.x*6.0,2.0)-1.0));
  float m=c.z-C*0.5;
  vec3 rgb=vec3(0.0);
  float h=c.x*6.0;
  if(h<1.0) rgb=vec3(C,X,0);
  else if(h<2.0) rgb=vec3(X,C,0);
  else if(h<3.0) rgb=vec3(0,C,X);
  else if(h<4.0) rgb=vec3(0,X,C);
  else if(h<5.0) rgb=vec3(X,0,C);
  else rgb=vec3(C,0,X);
  return rgb+m;
}

void main() {
  vec4 col = texture(u_input, v_uv);
  vec3 hsl = rgb2hsl(col.rgb);
  hsl.x = fract(hsl.x + u_hue);
  hsl.y = clamp(hsl.y * u_saturation, 0.0, 1.0);
  vec3 rgb = hsl2rgb(hsl);
  // Brightness & contrast
  rgb = (rgb + u_brightness - 0.5) * u_contrast + 0.5;
  // Temperature (warm/cool)
  rgb.r += u_temperature * 0.1;
  rgb.b -= u_temperature * 0.1;
  fragColor = vec4(clamp(rgb, 0.0, 1.0), col.a);
}`; }
}
