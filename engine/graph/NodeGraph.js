export class NodeGraph {
  constructor() {
    this.nodes        = [];
    this.renderer     = null;
    this._outputs     = new Map();
    this._edgeMeta    = [];
  }

  setEdgeRange(toId, toPort, fromPort, min, max) {
    const existing = this._edgeMeta.find(e => e.toId === toId && e.toPort === toPort);
    if (existing) { existing.fromPort = fromPort; existing.range = { min, max }; }
    else this._edgeMeta.push({ toId, toPort, fromPort, range: { min, max } });
  }

  removeEdgeMeta(toId, toPort) {
    this._edgeMeta = this._edgeMeta.filter(e => !(e.toId === toId && e.toPort === toPort));
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

  // ── Tri topologique ───────────────────────────────────────
  // Le port 'feedback' des FeedbackNodes est ignoré pour le topo sort
  // (c'est une connexion asynchrone — frame précédente)

  _topoSort() {
    const all = new Set(this.nodes);

    const inDegree = new Map();
    for (const n of all) inDegree.set(n, 0);

    for (const n of all) {
      for (const [portName, src] of n.connections) {
        // Ignorer le port 'feedback' pour briser les cycles
        if (portName === 'feedback') continue;
        if (all.has(src)) inDegree.set(n, inDegree.get(n) + 1);
      }
    }

    const queue  = [...all].filter(n => inDegree.get(n) === 0);
    const sorted = [];

    while (queue.length) {
      const node = queue.shift();
      sorted.push(node);
      for (const n of all) {
        for (const [portName, src] of n.connections) {
          if (portName === 'feedback') continue;
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

  // ── Collecte des nodes utiles ─────────────────────────────
  // Remonte depuis OutputNodes — inclut la boucle feedback entière

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

  // ── Exécution ─────────────────────────────────────────────

  _linkRoutes() {
    // Établir les connexions RouteIn → RouteOut par nom
    for (const node of this.nodes) {
      if (node.constructor.name !== 'RouteInNode') continue;
      const routeOut = this.nodes.find(n =>
        n.constructor.name === 'RouteOutNode' && n.routeName === node.routeName
      );
      if (routeOut) {
        node.connections.set('input', routeOut);
        node._connectionPort.set('input', 'output');
      } else {
        node.connections.delete('input');
      }
    }
  }

  execute() {
    const gl = this.renderer.gl;
    this._outputs.clear();

    // Connecter virtuellement chaque RouteIn au RouteOut du même nom
    this._linkRoutes();

    const outputNodes = this.nodes.filter(n =>
      n.constructor.name === 'OutputNode' && n.connections.has('input')
    );

    if (outputNodes.length === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.renderer.width, this.renderer.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    const needed = this._collectNeeded(outputNodes);

    // Certains nodes s'exécutent toujours même hors de la chaîne texture
    const alwaysRun = new Set(['MidiNode', 'ConstantNode', 'AudioNode', 'LFONode']);
    const sorted = this._topoSort().filter(n => needed.has(n) || alwaysRun.has(n.constructor.name));

    for (const node of sorted) {
      // Résoudre les textures entrantes
      // Le port 'feedback' utilise le _outputs de la frame précédente
      // (stocké avant le clear dans _prevOutputs)
      const resolved = new Map();
      for (const [portName, srcNode] of node.connections) {
        if (portName === 'feedback') {
          // Utilise la texture de la frame précédente
          const tex = this._prevOutputs?.get(srcNode.id) ?? null;
          resolved.set(portName, tex);
        } else {
          const tex = this._outputs.get(srcNode.id) ?? null;
          resolved.set(portName, tex);
        }
      }
      node._injectTextures(resolved);

      // Résolution port bypass
      const bypassSrc = node.connections.get('bypass');
      if (bypassSrc) {
        const fromPort = node.getFromPort('bypass') ?? 'Pad1';
        const val = bypassSrc.getPortValue?.(fromPort) ?? 0;
        if (val > 0.5 && !node._bypassGate) {
          node._bypassGate = true;
          node.bypassed = !node.bypassed;
          if (node._onBypassChange) node._onBypassChange(node.bypassed);
        } else if (val <= 0.5) {
          node._bypassGate = false;
        }
      }

      // Résolution ports scalaires → params (MIDI, LFO, Audio, Constant)
      const SCALAR_SOURCES = new Set(['MidiNode','LFONode','AudioNode','ConstantNode']);
      for (const [portName, srcNode] of node.connections) {
        if (!portName.startsWith('midi_')) continue;
        if (!SCALAR_SOURCES.has(srcNode.constructor.name)) continue;
        const paramName = portName.replace('midi_', '');
        const def = node.params?.find(p => p.name === paramName);
        if (!def) continue;
        const defaultPort = srcNode.constructor.name === 'ConstantNode' ? 'value'
                          : srcNode.constructor.name === 'MidiNode'     ? 'K1'
                          : 'value';
        const srcPort = node.getFromPort(portName) ?? defaultPort;
        const raw     = srcNode.getPortValue(srcPort);
        const edge    = this._edgeMeta?.find(e => e.toId === node.id && e.toPort === portName);
        const range   = edge?.range ?? { min: def.min, max: def.max };
        node.setParam(paramName, range.min + raw * (range.max - range.min));
      }

      const outputTex = node.render();
      if (outputTex !== null) {
        this._outputs.set(node.id, outputTex);
      }
    }

    // Sauvegarder les outputs pour la prochaine frame (utilisé par port 'feedback')
    this._prevOutputs = new Map(this._outputs);
  }

  // ── Sérialisation ─────────────────────────────────────────

  serialize() {
    return {
      nodes: this.nodes.map(n => ({ id: n.id, type: n.constructor.name, label: n.label })),
      edges: this.nodes.flatMap(n =>
        [...n.connections.entries()].map(([port, src]) => ({
          fromId: src.id, toId: n.id, toPort: port,
        }))
      ),
    };
  }

  fromSerialized(data, factory) {
    const incoming = new Map(data.nodes.map(n => [n.id, n]));
    const existing = new Map(this.nodes.map(n => [n.id, n]));

    for (const [id, node] of existing) {
      if (!incoming.has(id)) this.removeNode(node);
    }
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

    for (const node of this.nodes) {
      node.connections.clear();
      node._connectionPort?.clear();
    }
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    for (const edge of data.edges) {
      const toNode   = nodeMap.get(edge.toId);
      const fromNode = nodeMap.get(edge.fromId);
      if (toNode && fromNode) toNode.connections.set(edge.toPort, fromNode);
    }
  }
}
