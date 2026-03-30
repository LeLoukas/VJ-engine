/**
 * SaveLoad
 * Sérialise/désérialise le graphe complet en JSON.
 * Inclut : nodes, connexions, positions éditeur, params, noms de routes.
 */
export class SaveLoad {
  constructor(graph, editor, factory) {
    this.graph   = graph;
    this.editor  = editor;
    this.factory = factory;
  }

  // ── Sauvegarde ───────────────────────────────────────────

  save() {
    const data = {
      version: 1,
      nodes: [],
      edges: [],
    };

    // Nodes
    for (const wNode of this.graph.nodes) {
      const enode = this.editor.enodes.find(n => n.id === wNode.id);
      const nodeData = {
        id:        wNode.id,
        type:      wNode.constructor.name,
        label:     wNode.label,
        x:         enode?.x ?? 0,
        y:         enode?.y ?? 0,
        params:    {},
        bypassed:  wNode.bypassed,
      };

      // Params
      for (const p of wNode.params) {
        nodeData.params[p.name] = wNode.getParam(p.name);
      }

      // Props spéciales
      if (wNode.routeName)   nodeData.routeName   = wNode.routeName;
      if (wNode.fragSrc && wNode.constructor.name === 'ShaderEditNode') nodeData.fragSrc = wNode.fragSrc;
      if (wNode.brushColor)  nodeData.brushColor  = wNode.brushColor;
      if (wNode.text)        nodeData.text        = wNode.text;
      if (wNode.color)       nodeData.color       = wNode.color;

      // Params MIDI-contrôlés
      if (wNode._midiControlled) nodeData.midiControlled = wNode._midiControlled;
      if (wNode.activeSources)   nodeData.activeSources  = [...wNode.activeSources];

      data.nodes.push(nodeData);
    }

    // Edges (depuis l'éditeur — inclut fromPort)
    for (const edge of this.editor.edges) {
      data.edges.push({ ...edge });
    }

    return data;
  }

  saveToFile(filename = 'scene.json') {
    const data    = this.save();
    const json    = JSON.stringify(data, null, 2);
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Chargement ───────────────────────────────────────────

  async loadFromFile() {
    return new Promise((resolve, reject) => {
      const input   = document.createElement('input');
      input.type    = 'file';
      input.accept  = '.json';
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          this.load(data);
          resolve(data);
        } catch(e) { reject(e); }
      });
      input.click();
    });
  }

  load(data) {
    if (data.version !== 1) {
      console.warn('SaveLoad: unknown version', data.version);
    }

    // 1. Vider le graphe et l'éditeur
    this._clearAll();

    // 2. Créer les nodes
    const nodeMap = new Map(); // id sauvegardé → nouveau wNode

    for (const nd of data.nodes) {
      let wNode;
      try {
        wNode = this.factory.create(nd.type);
      } catch(e) {
        console.warn('SaveLoad: unknown node type', nd.type);
        continue;
      }

      wNode.id    = nd.id;
      wNode.label = nd.label;

      // Params
      for (const [name, value] of Object.entries(nd.params ?? {})) {
        wNode.setParam(name, value);
      }

      // Bypass
      if (nd.bypassed) wNode.bypassed = true;

      // Props spéciales
      if (nd.routeName)       wNode.routeName       = nd.routeName;
      if (nd.fragSrc && wNode.constructor.name === 'ShaderEditNode') {
        wNode.fragSrc = nd.fragSrc;
        wNode._customParams = [];
        // updateFrag will be called after init in addNode
      }
      if (nd.brushColor)      wNode.brushColor      = nd.brushColor;
      if (nd.text)            { wNode.text = nd.text; wNode._dirty = true; }
      if (nd.color)           wNode.color           = nd.color;
      if (nd.midiControlled)  wNode._midiControlled = nd.midiControlled;
      if (nd.activeSources)   wNode.activeSources   = new Set(nd.activeSources);

      this.graph.addNode(wNode);
      // ShaderEditNode: recompile avec le fragSrc restauré
      if (nd.fragSrc && wNode.constructor.name === 'ShaderEditNode') {
        wNode.updateFrag(nd.fragSrc);
      }
      nodeMap.set(nd.id, wNode);

      // Créer le node visuel
      this.editor._createENode(nd.type, nd.id, nd.x, nd.y);
    }

    // 3. Restaurer les edges
    for (const edge of data.edges ?? []) {
      this.editor.edges.push({ ...edge });
    }
    this.editor._applyEdgesToGraph();

    // 4. Restaurer les ports MIDI dynamiques
    for (const nd of data.nodes) {
      if (!nd.midiControlled) continue;
      const wNode = nodeMap.get(nd.id);
      if (!wNode) continue;
      for (const [paramName, controlled] of Object.entries(nd.midiControlled)) {
        if (controlled) this.editor._addMidiPortToNode(wNode, paramName);
      }
    }

    requestAnimationFrame(() => this.editor._redrawEdges());
  }

  _clearAll() {
    // Supprimer tous les nodes du graphe
    [...this.graph.nodes].forEach(n => this.graph.removeNode(n));

    // Supprimer les nodes visuels
    this.editor.enodes.forEach(en => en.el.remove());
    this.editor.enodes = [];
    this.editor.edges  = [];
    this.editor._selectNode(null);
    this.editor._redrawEdges();
  }
  // ── Import comme nouvelle scène ──────────────────────────

  async importAsScene() {
    return new Promise((resolve, reject) => {
      const input  = document.createElement('input');
      input.type   = 'file';
      input.accept = '.json';
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          this._mergeScene(data);
          resolve(data);
        } catch(e) { reject(e); }
      });
      input.click();
    });
  }

  _mergeScene(data) {
    // Compter les scènes déjà importées pour nommer les routes
    const existingRouteOuts = this.graph.nodes.filter(n => n.constructor.name === 'RouteOutNode');
    const sceneIndex = existingRouteOuts.length;  // 0 = première import, 1 = deuxième...

    const routeNameMain  = 'scene_main';
    const routeNameNew   = `scene_${sceneIndex}`;

    // 1. Trouver l'OutputNode existant et son prédécesseur direct
    const existingOutput    = this.graph.nodes.find(n => n.constructor.name === 'OutputNode');
    const existingPreOutput = existingOutput?.connections.get('input');
    if (!existingOutput) return;

    // 2. Première import : wrapper la scène courante dans un RouteOut "scene_main"
    //    (seulement si pas déjà fait)
    const alreadyHasMainRoute = this.graph.nodes.some(
      n => n.constructor.name === 'RouteOutNode' && n.routeName === routeNameMain
    );

    const outEn = this.editor.enodes.find(n => n.id === existingOutput.id);
    const outX  = outEn?.x ?? 600;
    const outY  = outEn?.y ?? 120;

    if (!alreadyHasMainRoute && existingPreOutput) {
      // Créer RouteOut "scene_main" avant l'output existant
      const routeOutMain = this.factory.create('RouteOutNode');
      routeOutMain.routeName = routeNameMain;
      this.graph.addNode(routeOutMain);
      this.editor._createENode('RouteOutNode', routeOutMain.id, outX - 200, outY);

      // Brancher l'ancien pre-output → RouteOut main
      this.editor.edges.push({
        fromId: existingPreOutput.id, fromPort: 'output',
        toId: routeOutMain.id, toPort: 'input',
      });

      // Supprimer l'ancien edge vers Output
      this.editor.edges = this.editor.edges.filter(e =>
        !(e.toId === existingOutput.id && e.toPort === 'input')
      );
    }

    // 3. Calculer offset pour la nouvelle scène
    const maxX = Math.max(0, ...this.editor.enodes.map(n => n.x)) + 60;
    const offsetY = (sceneIndex) * 180;

    // 4. Importer les nodes de la nouvelle scène (sauf OutputNode)
    const nodeMap = new Map();
    let newPreOutput = null;
    const importedOutputId = data.nodes.find(n => n.type === 'OutputNode')?.id;

    for (const nd of data.nodes) {
      if (nd.type === 'OutputNode') continue;

      let wNode;
      try { wNode = this.factory.create(nd.type); }
      catch(e) { console.warn('ImportScene: unknown type', nd.type); continue; }

      const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      wNode.id    = newId;
      wNode.label = nd.label;
      nodeMap.set(nd.id, { wNode, newId });

      for (const [name, value] of Object.entries(nd.params ?? {})) {
        wNode.setParam(name, value);
      }
      if (nd.bypassed)      wNode.bypassed     = true;
      if (nd.routeName)     wNode.routeName    = nd.routeName + '_s' + sceneIndex;
      if (nd.fragSrc)       { wNode.fragSrc = nd.fragSrc; }
      if (nd.activeSources) wNode.activeSources = new Set(nd.activeSources);

      this.graph.addNode(wNode);
      this.editor._createENode(nd.type, newId, nd.x + maxX, nd.y + offsetY);
    }

    // 5. Reconnecter les edges internes
    for (const edge of data.edges ?? []) {
      if (edge.toId === importedOutputId) {
        const mapped = nodeMap.get(edge.fromId);
        if (mapped) newPreOutput = mapped.wNode;
        continue;
      }
      const from = nodeMap.get(edge.fromId);
      const to   = nodeMap.get(edge.toId);
      if (from && to) {
        this.editor.edges.push({
          fromId: from.newId, fromPort: edge.fromPort,
          toId:   to.newId,   toPort:   edge.toPort,
        });
      }
    }

    // 6. Créer RouteOut pour la nouvelle scène
    if (newPreOutput) {
      const routeOutNew = this.factory.create('RouteOutNode');
      routeOutNew.routeName = routeNameNew;
      this.graph.addNode(routeOutNew);
      const newOutEn = this.editor.enodes.find(n => n.id === newPreOutput.id);
      this.editor._createENode('RouteOutNode', routeOutNew.id,
        (newOutEn?.x ?? maxX) + 180, (newOutEn?.y ?? offsetY));
      this.editor.edges.push({
        fromId: newPreOutput.id, fromPort: 'output',
        toId: routeOutNew.id, toPort: 'input',
      });
    }

    // 7. Créer RouteIn x2 + MixNode → Output
    const routeInMain = this.factory.create('RouteInNode');
    routeInMain.routeName = routeNameMain;
    this.graph.addNode(routeInMain);
    this.editor._createENode('RouteInNode', routeInMain.id, outX - 400, outY + 40);

    const routeInNew = this.factory.create('RouteInNode');
    routeInNew.routeName = routeNameNew;
    this.graph.addNode(routeInNew);
    this.editor._createENode('RouteInNode', routeInNew.id, outX - 400, outY + 80 + offsetY * 0.5);

    const mixNode = this.factory.create('MixNode');
    this.graph.addNode(mixNode);
    this.editor._createENode('MixNode', mixNode.id, outX - 200, outY + 60);

    this.editor.edges.push({ fromId: routeInMain.id, fromPort: 'output', toId: mixNode.id, toPort: 'inputA' });
    this.editor.edges.push({ fromId: routeInNew.id,  fromPort: 'output', toId: mixNode.id, toPort: 'inputB' });
    this.editor.edges.push({ fromId: mixNode.id, fromPort: 'output', toId: existingOutput.id, toPort: 'input' });

    this.editor._applyEdgesToGraph();
    requestAnimationFrame(() => this.editor._redrawEdges());
  }

}
