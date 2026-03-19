export class Node {
  constructor() {
    this.renderer    = null;
    this.width       = 0;
    this.height      = 0;
    this.id          = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.label       = this.constructor.name;
    this.connections = new Map();
    this._resolved   = new Map();
    // Valeurs courantes des params { name → value }
    this._paramValues = {};
  }

  // ── Ports ────────────────────────────────────────────────

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  connect(portName, sourceNode) {
    if (!this.inputPorts.includes(portName))
      throw new Error(`Node "${this.label}" has no input port "${portName}"`);
    this.connections.set(portName, sourceNode);
    return this;
  }

  disconnect(portName) { this.connections.delete(portName); }

  getInputTexture(portName) { return this._resolved.get(portName) ?? null; }

  _injectTextures(resolvedTextures) { this._resolved = resolvedTextures; }

  // ── Params ───────────────────────────────────────────────

  /**
   * Déclare les paramètres du node.
   * @returns {Array<{ name:string, type:'float'|'int', min:number, max:number, value:number, step?:number }>}
   */
  get params() { return []; }

  /** Lit la valeur courante d'un param (avec fallback sur la définition) */
  getParam(name) {
    if (name in this._paramValues) return this._paramValues[name];
    const def = this.params.find(p => p.name === name);
    return def ? def.value : 0;
  }

  /** Met à jour la valeur d'un param */
  setParam(name, value) {
    const def = this.params.find(p => p.name === name);
    if (!def) return;
    this._paramValues[name] = def.type === 'int'
      ? Math.round(Math.min(def.max, Math.max(def.min, value)))
      : Math.min(def.max, Math.max(def.min, value));
  }

  /**
   * Injecte les params comme uniforms dans le program actif.
   * Convention : uniform float u_<name> ou uniform int u_<name>
   */
  setParamUniforms(program) {
    const gl = this.renderer?.gl;
    if (!gl) return;
    for (const def of this.params) {
      const loc = gl.getUniformLocation(program, `u_${def.name}`);
      if (loc === null) continue;
      const val = this.getParam(def.name);
      if (def.type === 'int') gl.uniform1i(loc, val);
      else                    gl.uniform1f(loc, val);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────

  init(renderer) {
    this.renderer = renderer;
    this.width    = renderer.width;
    this.height   = renderer.height;
    // Init paramValues depuis les defaults
    for (const p of this.params) {
      if (!(p.name in this._paramValues)) this._paramValues[p.name] = p.value;
    }
  }

  resize(w, h) { this.width = w; this.height = h; }

  /** @returns {WebGLTexture|null} */
  render() { return null; }
}
