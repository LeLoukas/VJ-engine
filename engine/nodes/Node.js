export class Node {
  constructor() {
    this.renderer     = null;
    this.width        = 0;
    this.height       = 0;
    this.id           = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.label        = this.constructor.name;
    this.connections     = new Map();  // portName → srcNode
    this._connectionPort = new Map();  // portName → fromPort (port sur le srcNode)
    this._resolved       = new Map();
    this._paramValues = {};
    this._bypassed    = false;
  }

  // ── Ports ─────────────────────────────────────────────────

  get inputPorts()  { return []; }
  get outputPorts() { return ['output']; }

  connect(portName, sourceNode, fromPort = 'output') {
    if (!this.inputPorts.includes(portName))
      throw new Error(`Node "${this.label}" has no input port "${portName}"`);
    this.connections.set(portName, sourceNode);
    this._connectionPort.set(portName, fromPort);
    return this;
  }
  disconnect(portName) {
    this.connections.delete(portName);
    this._connectionPort.delete(portName);
  }

  /** Connexion avec le port source explicite */
  connectPort(toPort, srcNode, fromPort) {
    this.connections.set(toPort, srcNode);
    this._connectionPort.set(toPort, fromPort);
  }

  /** Retourne le nom du port sur le node source pour une connexion */
  getFromPort(toPort) {
    return this._connectionPort.get(toPort) ?? null;
  }
  getInputTexture(portName) { return this._resolved.get(portName) ?? null; }
  _injectTextures(resolvedTextures) { this._resolved = resolvedTextures; }

  // ── Params ────────────────────────────────────────────────

  /** Paramètres custom du node. Override dans les sous-classes. */
  get params() { return []; }

  /**
   * Tous les params affichés dans l'UI.
   * bypass est géré séparément (port dédié + bouton).
   */
  get allParams() { return this.params; }

  /** true si le node est en mode bypass */
  get bypassed() { return this._bypassed ?? false; }
  set bypassed(v) { this._bypassed = !!v; }

  getParam(name) {
    if (name in this._paramValues) return this._paramValues[name];
    const def = this.params.find(p => p.name === name);
    return def ? def.value : 0;
  }

  setParam(name, value) {
    const def = this.params.find(p => p.name === name);
    if (!def) return;
    this._paramValues[name] = def.type === 'int'
      ? Math.round(Math.min(def.max, Math.max(def.min, value)))
      : Math.min(def.max, Math.max(def.min, value));
  }

  /** Cache et retourne les uniform locations pour un program.
   *  Usage: const L = this._cacheLocs(prog, ['u_input','u_decay'])
   *  Puis : gl.uniform1f(L.u_decay, val)
   */
  _cacheLocs(program, names) {
    if (!this._uniformCache) this._uniformCache = new WeakMap();
    let locs = this._uniformCache.get(program);
    if (!locs) { locs = {}; this._uniformCache.set(program, locs); }
    const gl = this.renderer.gl;
    for (const n of names) {
      if (!(n in locs)) locs[n] = gl.getUniformLocation(program, n);
    }
    return locs;
  }

  /** Injecte les params custom comme uniforms GLSL (locations cachées par program) */
  setParamUniforms(program) {
    const gl = this.renderer?.gl;
    if (!gl) return;
    if (!this._uniformCache) this._uniformCache = new WeakMap();
    let locs = this._uniformCache.get(program);
    if (!locs) { locs = {}; this._uniformCache.set(program, locs); }
    for (const def of this.params) {
      if (!(def.name in locs)) locs[def.name] = gl.getUniformLocation(program, `u_${def.name}`);
    }
    for (const def of this.params) {
      const loc = locs[def.name];
      if (loc === null || loc === undefined) continue;
      const val = this.getParam(def.name);
      if (def.type === 'int') gl.uniform1i(loc, val);
      else                    gl.uniform1f(loc, val);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────

  init(renderer) {
    this.renderer = renderer;
    this.width    = renderer.width;
    this.height   = renderer.height;
    for (const p of this.params) {
      if (!(p.name in this._paramValues)) this._paramValues[p.name] = p.value;
    }
  }

  resize(w, h) { this.width = w; this.height = h; }

  /**
   * Vérifie si le node est bypassé.
   * Si oui, retourne la texture d'entrée du port spécifié (pass-through).
   * Si non, retourne false.
   * Utilisé dans render() des sous-classes : if (this.bypassed) return input;
   */
  _checkBypass(inputPort = 'input') {
    if (!this.bypassed) return false;
    return this.getInputTexture(inputPort) ?? null;
  }

  /** @returns {WebGLTexture|null} */
  render() { return null; }
}
