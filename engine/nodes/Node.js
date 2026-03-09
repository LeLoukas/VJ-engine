/**
 * Node — classe de base abstraite
 *
 * Système de ports :
 *   - Chaque node déclare ses inputs via `inputPorts` (tableau de noms)
 *   - Les connexions sont stockées dans `this.connections` : Map<portName, Node>
 *   - Le NodeGraph résout les textures via `getInputTexture(portName)`
 *
 * Cycle de vie :
 *   init(renderer)   — appelé une fois par le NodeGraph
 *   resize(w, h)     — appelé à chaque redimensionnement du canvas
 *   render()         — appelé chaque frame, lit ses inputs via this.connections
 *                      retourne une WebGLTexture|null
 */
export class Node {
  constructor() {
    this.renderer    = null;
    this.width       = 0;
    this.height      = 0;
    this.id          = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.label       = this.constructor.name;
    // Connexions entrantes : Map<portName, Node>
    this.connections = new Map();
    // Cache des textures résolues pour la frame courante
    this._resolved   = new Map();
  }

  /**
   * Déclare les ports d'entrée du node.
   * Override dans les sous-classes.
   * @returns {string[]}
   */
  get inputPorts() { return []; }

  /**
   * Déclare les ports de sortie du node.
   * La plupart des nodes n'ont qu'un seul output.
   * @returns {string[]}
   */
  get outputPorts() { return ['output']; }

  /**
   * Connecte un port d'entrée à un node source.
   * @param {string} portName
   * @param {Node} sourceNode
   */
  connect(portName, sourceNode) {
    if (!this.inputPorts.includes(portName)) {
      throw new Error(`Node "${this.label}" has no input port "${portName}"`);
    }
    this.connections.set(portName, sourceNode);
    return this;
  }

  disconnect(portName) {
    this.connections.delete(portName);
  }

  /**
   * Récupère la texture résolue pour un port d'entrée.
   * Appelé par les nodes dans leur render().
   * @param {string} portName
   * @returns {WebGLTexture|null}
   */
  getInputTexture(portName) {
    return this._resolved.get(portName) ?? null;
  }

  /**
   * Appelé par le NodeGraph avant render() pour injecter les textures.
   * @param {Map<string, WebGLTexture>} resolvedTextures
   */
  _injectTextures(resolvedTextures) {
    this._resolved = resolvedTextures;
  }

  init(renderer) {
    this.renderer = renderer;
    this.width    = renderer.width;
    this.height   = renderer.height;
  }

  resize(w, h) {
    this.width  = w;
    this.height = h;
  }

  /** @returns {WebGLTexture|null} */
  render() { return null; }
}
