export class NodeGraph {
  constructor() {
    this.nodes    = [];
    this.renderer = null;
    this._outputs = new Map();
  }

  // ── Enregistrement ────────────────────────────────────────

  addNode(node) {
    if (!this.nodes.includes(node)) {
      this.nodes.push(node);
      if (this.renderer) node.init(this.renderer);
    }
    return this;
  }

  removeNode(node) {
    this.nodes = this.nodes.filter(n => n !== node);
    for (const n of this.nodes) {
      for (const [port, src] of n.connections) {
        if (src === node) n.disconnect(port);
      }
    }
  }

  // ── Tri topologique (Kahn) ────────────────────────────────
  // Ne retourne QUE les nodes qui sont dans la chaîne menant à un OutputNode.

  _topoSort() {
    const all = new Set(this.nodes);

    // inDegree = nombre de connexions entrantes (depuis des nodes du graphe)
    const inDegree = new Map();
    for (const n of all) inDegree.set(n, 0);
    for (const n of all) {
      for (const [, src] of n.connections) {
        if (all.has(src)) inDegree.set(n, inDegree.get(n) + 1);
      }
    }

    const queue  = [...all].filter(n => inDegree.get(n) === 0);
    const sorted = [];

    while (queue.length) {
      const node = queue.shift();
      sorted.push(node);
      for (const n of all) {
        for (const [, src] of n.connections) {
          if (src === node) {
            const deg = inDegree.get(n) - 1;
            inDegree.set(n, deg);
            if (deg === 0) queue.push(n);
          }
        }
      }
    }

    return sorted;
  }

  // ── Init / Resize ─────────────────────────────────────────

  init(renderer) {
    this.renderer = renderer;
    this.nodes.forEach(n => n.init(renderer));
  }

  resize(w, h) {
    this.nodes.forEach(n => n.resize(w, h));
  }

  // ── Exécution ─────────────────────────────────────────────

  execute() {
    const gl = this.renderer.gl;
    this._outputs.clear();

    // Trouver les OutputNodes qui ont toutes leurs entrées connectées
    const outputNodes = this.nodes.filter(n =>
      n.constructor.name === 'OutputNode' &&
      n.connections.has('input')
    );

    // Si aucun OutputNode connecté → effacer l'écran et sortir
    if (outputNodes.length === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.renderer.width, this.renderer.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    // Remonter le graphe depuis les OutputNodes pour ne garder
    // que les nodes utiles (atteignables depuis un output)
    const needed = this._collectNeeded(outputNodes);

    const sorted = this._topoSort().filter(n => needed.has(n));

    for (const node of sorted) {
      const resolved = new Map();
      for (const [portName, srcNode] of node.connections) {
        const tex = this._outputs.get(srcNode.id) ?? null;
        resolved.set(portName, tex);
      }
      node._injectTextures(resolved);

      const outputTex = node.render();
      if (outputTex !== null) {
        this._outputs.set(node.id, outputTex);
      }
    }
  }

  // Remonte le graphe depuis les noeuds de sortie pour collecter
  // uniquement les nodes dans la chaîne connectée
  _collectNeeded(outputNodes) {
    const needed = new Set();
    const visit  = (node) => {
      if (needed.has(node)) return;
      needed.add(node);
      for (const [, src] of node.connections) visit(src);
    };
    outputNodes.forEach(visit);
    return needed;
  }

  // ── Sérialisation ─────────────────────────────────────────

  serialize() {
    return {
      nodes: this.nodes.map(n => ({
        id:    n.id,
        type:  n.constructor.name,
        label: n.label,
      })),
      edges: this.nodes.flatMap(n =>
        [...n.connections.entries()].map(([port, src]) => ({
          fromId: src.id,
          toId:   n.id,
          toPort: port,
        }))
      ),
    };
  }

  // ── Reconstruction depuis l'éditeur ──────────────────────

  fromSerialized(data, factory) {
    const incoming = new Map(data.nodes.map(n => [n.id, n]));
    const existing = new Map(this.nodes.map(n => [n.id, n]));

    // 1. Supprimer les nodes absents
    for (const [id, node] of existing) {
      if (!incoming.has(id)) this.removeNode(node);
    }

    // 2. Créer ou remplacer les nodes
    for (const [id, def] of incoming) {
      const ex = existing.get(id);
      if (!ex) {
        const node = factory.create(def.type);
        node.id    = def.id;
        node.label = def.label;
        this.addNode(node);
      } else if (ex.constructor.name !== def.type) {
        this.removeNode(ex);
        const node = factory.create(def.type);
        node.id    = def.id;
        node.label = def.label;
        this.addNode(node);
      }
    }

    // 3. Reconstruire toutes les connexions
    for (const node of this.nodes) node.connections.clear();
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    for (const edge of data.edges) {
      const toNode   = nodeMap.get(edge.toId);
      const fromNode = nodeMap.get(edge.fromId);
      if (toNode && fromNode) {
        toNode.connections.set(edge.toPort, fromNode);
      }
    }
  }
}
