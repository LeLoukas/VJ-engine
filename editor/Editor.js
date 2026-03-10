/**
 * Editor
 * Éditeur de graphe en overlay — canvas 2D + nodes drag & drop.
 * S'appuie directement sur le NodeGraph en mémoire, pas de sérialisation.
 */

const NODE_DEFS = {
  ShaderSourceNode: { label: 'ShaderSource', category: 'source',  inputs: [],                   outputs: ['output'] },
  GameOfLifeNode:   { label: 'GameOfLife',   category: 'source',  inputs: [],                   outputs: ['output'] },
  WebcamNode:       { label: 'Webcam',        category: 'source',  inputs: [],                   outputs: ['output'] },
  MediaNode:        { label: 'Media',         category: 'source',  inputs: [],                   outputs: ['output'] },
  GlitchNode:       { label: 'Glitch',        category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  AudioGlitchNode:  { label: 'AudioGlitch',   category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  FeedbackNode:     { label: 'Feedback',      category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  BlurNode:         { label: 'Blur',          category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  MixNode:          { label: 'Mix',           category: 'mix',     inputs: ['inputA', 'inputB'], outputs: ['output'] },
  OutputNode:       { label: 'Output',        category: 'output',  inputs: ['input'],            outputs: [] },
};

const CAT_COLOR = {
  source:  '#3dff9a',
  effect:  '#00c8ff',
  mix:     '#c084fc',
  output:  '#ff6b6b',
};

export class Editor {
  constructor({ container, graph, factory, renderer }) {
    this.container = container;
    this.graph     = graph;
    this.factory   = factory;
    this.renderer  = renderer;
    this.visible   = false;

    // Editor state — visual nodes (not WebGL nodes)
    this.enodes   = [];   // { id, type, x, y, el }
    this.edges    = [];   // { fromId, fromPort, toId, toPort }
    this._seq     = 0;

    // Drag state
    this._dragging   = null;  // { enode, ox, oy }
    this._connecting = null;  // { fromId, fromPort, isOutput, mx, my }

    this._build();
  }

  // ── Build DOM ──────────────────────────────────────────────

  _build() {
    this.container.innerHTML = '';
    this.container.className = 'editor-overlay';

    // Handle bar
    const handle = document.createElement('div');
    handle.className = 'editor-handle';
    handle.innerHTML = '<div class="editor-handle-bar"></div><div class="editor-handle-label">Node Graph</div><div class="editor-handle-bar"></div>';
    this.container.appendChild(handle);

    // Split: sidebar + canvas area
    const body = document.createElement('div');
    body.className = 'editor-body';
    this.container.appendChild(body);

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'editor-sidebar';
    sidebar.innerHTML = '<div class="editor-panel-title">Nodes</div>';
    body.appendChild(sidebar);

    // Palette
    const groups = { source: [], effect: [], mix: [], output: [] };
    for (const [type, def] of Object.entries(NODE_DEFS)) {
      groups[def.category]?.push({ type, def });
    }
    for (const [cat, items] of Object.entries(groups)) {
      if (!items.length) continue;
      const g = document.createElement('div');
      g.innerHTML = `<div class="editor-cat-label">${cat}</div>`;
      for (const { type, def } of items) {
        const item = document.createElement('div');
        item.className = 'editor-palette-item';
        item.dataset.type = type;
        item.draggable = true;
        item.innerHTML = `<span class="editor-dot" style="background:${CAT_COLOR[cat]}"></span>${def.label}`;
        item.addEventListener('dragstart', e => {
          this._paletteDrag = type;
          e.dataTransfer.effectAllowed = 'copy';
        });
        g.appendChild(item);
      }
      sidebar.appendChild(g);
    }

    // Canvas area
    const area = document.createElement('div');
    area.className = 'editor-area';
    body.appendChild(area);
    this._area = area;

    // SVG for edges
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'editor-svg');
    area.appendChild(svg);
    this._svg = svg;

    // Node layer
    const nodeLayer = document.createElement('div');
    nodeLayer.className = 'editor-node-layer';
    area.appendChild(nodeLayer);
    this._nodeLayer = nodeLayer;

    // Drop
    area.addEventListener('dragover', e => e.preventDefault());
    area.addEventListener('drop', e => {
      e.preventDefault();
      if (!this._paletteDrag) return;
      const rect = area.getBoundingClientRect();
      this._addNode(this._paletteDrag, e.clientX - rect.left - 80, e.clientY - rect.top - 30);
      this._paletteDrag = null;
    });

    // Mouse
    document.addEventListener('mousemove', e => this._onMouseMove(e));
    document.addEventListener('mouseup',   e => this._onMouseUp(e));
  }

  // ── Show/Hide ──────────────────────────────────────────────

  toggle() {
    this.visible = !this.visible;
    this.container.classList.toggle('open', this.visible);
    const hint = document.getElementById('space-hint');
    if (hint) hint.classList.toggle('hidden', this.visible);
    if (this.visible) requestAnimationFrame(() => this._redrawEdges());
  }

  show() { this.visible = true;  this.container.classList.add('open');    requestAnimationFrame(() => this._redrawEdges()); }
  hide() { this.visible = false; this.container.classList.remove('open'); }

  // ── Sync: reflect current graph state into editor visuals ──

  syncFromGraph() {
    // Already has visual nodes — skip
    if (this.enodes.length) return;
    let x = 60;
    for (const node of this.graph.nodes) {
      this._createENode(node.constructor.name, node.id, x, 120);
      x += 220;
    }
    // Rebuild edges from graph connections
    for (const node of this.graph.nodes) {
      for (const [toPort, srcNode] of node.connections) {
        this.edges.push({ fromId: srcNode.id, fromPort: 'output', toId: node.id, toPort });
      }
    }
    this._redrawEdges();
  }

  // ── Add node ───────────────────────────────────────────────

  _addNode(type, x, y) {
    // Create WebGL node
    const wNode = this.factory.create(type);
    this.graph.addNode(wNode);

    // Create visual node (same id)
    this._createENode(type, wNode.id, x, y);
    this._redrawEdges();
    return wNode;
  }

  _createENode(type, id, x, y) {
    const def = NODE_DEFS[type];
    if (!def) return null;

    const el = document.createElement('div');
    el.className = `editor-node cat-${def.category}`;
    el.dataset.id = id;
    el.style.cssText = `left:${x}px;top:${y}px`;

    el.innerHTML = `
      <div class="editor-node-header">
        <span class="editor-dot" style="background:${CAT_COLOR[def.category]}"></span>
        <span class="editor-node-label">${def.label}</span>
        <span class="editor-node-del" data-id="${id}">×</span>
      </div>
      <div class="editor-node-ports">
        ${def.inputs.map(p => `
          <div class="editor-port-row input">
            <div class="editor-port" data-id="${id}" data-port="${p}" data-dir="input"></div>
            <span class="editor-port-label">${p}</span>
          </div>`).join('')}
        ${def.outputs.map(p => `
          <div class="editor-port-row output">
            <span class="editor-port-label">${p}</span>
            <div class="editor-port" data-id="${id}" data-port="${p}" data-dir="output"></div>
          </div>`).join('')}
      </div>`;

    // Header drag
    el.querySelector('.editor-node-header').addEventListener('mousedown', e => {
      if (e.target.classList.contains('editor-node-del')) return;
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      this._dragging = { id, el, ox: e.clientX - r.left, oy: e.clientY - r.top };
    });

    // Delete
    el.querySelector('.editor-node-del').addEventListener('click', e => {
      e.stopPropagation();
      this._deleteNode(id);
    });

    // Port mousedown → start connection
    el.querySelectorAll('.editor-port').forEach(dot => {
      dot.addEventListener('mousedown', e => {
        e.stopPropagation();
        const areaRect = this._area.getBoundingClientRect();
        this._connecting = {
          fromId:   dot.dataset.id,
          fromPort: dot.dataset.port,
          isOutput: dot.dataset.dir === 'output',
          mx: e.clientX - areaRect.left,
          my: e.clientY - areaRect.top,
        };
        dot.classList.add('active');
      });
    });

    // Right-click delete
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      this._deleteNode(id);
    });

    // MediaNode : bouton de chargement de fichier
    if (type === 'MediaNode') {
      const btn = document.createElement('div');
      btn.className = 'editor-media-btn';
      btn.textContent = '+ load file';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type   = 'file';
        input.accept = 'image/*,video/*';
        input.addEventListener('change', () => {
          const file = input.files[0];
          if (!file) return;
          const wNode = this.graph.nodes.find(n => n.id === id);
          if (wNode?.loadFile) {
            wNode.loadFile(file);
            btn.textContent = file.name.length > 16
              ? file.name.slice(0, 14) + '…'
              : file.name;
          }
        });
        input.click();
      });
      el.appendChild(btn);
    }

        // WebcamNode : sélection du périphérique vidéo
    if (type === 'WebcamNode') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-webcam-controls';

      const refreshBtn = document.createElement('div');
      refreshBtn.className = 'editor-media-btn';
      refreshBtn.textContent = '↻ refresh devices';

      const select = document.createElement('select');
      select.className = 'editor-webcam-select';

      const fillDevices = async () => {
        const wNode = this.graph.nodes.find(n => n.id === id);
        if (!wNode) return;

        const devices = await wNode.refreshDevices();
        select.innerHTML = '';

        const autoOpt = document.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = 'Default camera';
        select.appendChild(autoOpt);

        devices.forEach((device, index) => {
          const opt = document.createElement('option');
          opt.value = device.deviceId;
          opt.textContent = device.label || `Camera ${index + 1}`;
          select.appendChild(opt);
        });

        select.value = wNode.deviceId || '';
      };

      refreshBtn.addEventListener('click', async e => {
        e.stopPropagation();
        await fillDevices();
      });

      select.addEventListener('click', e => e.stopPropagation());

      select.addEventListener('change', async e => {
        e.stopPropagation();
        const wNode = this.graph.nodes.find(n => n.id === id);
        if (!wNode?.setDeviceId) return;
        await wNode.setDeviceId(select.value);
        await fillDevices();
      });

      wrap.appendChild(refreshBtn);
      wrap.appendChild(select);
      el.appendChild(wrap);

      // Remplissage initial
      queueMicrotask(() => {
        fillDevices();
      });
    }

    this._nodeLayer.appendChild(el);
    this.enodes.push({ id, type, el, x, y });
    return el;
  }

  // ── Delete node ────────────────────────────────────────────

  _deleteNode(id) {
    // Remove from graph
    const wNode = this.graph.nodes.find(n => n.id === id);
    if (wNode) this.graph.removeNode(wNode);

    // Remove visual
    const enode = this.enodes.find(n => n.id === id);
    if (enode) enode.el.remove();
    this.enodes = this.enodes.filter(n => n.id !== id);

    // Remove edges
    this.edges = this.edges.filter(e => e.fromId !== id && e.toId !== id);

    this._redrawEdges();
  }

  // ── Port position ──────────────────────────────────────────

  _portPos(nodeId, portName, isOutput) {
    const enode = this.enodes.find(n => n.id === nodeId);
    if (!enode) return null;
    const dot = enode.el.querySelector(
      `.editor-port[data-id="${nodeId}"][data-port="${portName}"][data-dir="${isOutput ? 'output' : 'input'}"]`
    );
    if (!dot) return null;
    const areaRect = this._area.getBoundingClientRect();
    const dotRect  = dot.getBoundingClientRect();
    return {
      x: dotRect.left + dotRect.width  / 2 - areaRect.left,
      y: dotRect.top  + dotRect.height / 2 - areaRect.top,
    };
  }

  // ── Mouse events ───────────────────────────────────────────

  _onMouseMove(e) {
    if (!this.visible) return;
    const areaRect = this._area.getBoundingClientRect();
    const mx = e.clientX - areaRect.left;
    const my = e.clientY - areaRect.top;

    if (this._dragging) {
      const { id, el, ox, oy } = this._dragging;
      const x = e.clientX - this._area.getBoundingClientRect().left - ox;
      const y = e.clientY - this._area.getBoundingClientRect().top  - oy;
      el.style.left = `${x}px`;
      el.style.top  = `${y}px`;
      const en = this.enodes.find(n => n.id === id);
      if (en) { en.x = x; en.y = y; }
      this._redrawEdges();
    }

    if (this._connecting) {
      this._connecting.mx = mx;
      this._connecting.my = my;
      this._redrawEdges();
    }
  }

  _onMouseUp(e) {
    if (this._dragging) {
      this._dragging = null;
    }

    if (this._connecting) {
      const target = e.target;
      if (target.classList.contains('editor-port')) {
        const tDir    = target.dataset.dir;
        const tId     = target.dataset.id;
        const tPort   = target.dataset.port;
        const srcOut  = this._connecting.isOutput;

        // Valid: output→input, different nodes
        if (srcOut !== (tDir === 'output') && tId !== this._connecting.fromId) {
          const fromId   = srcOut ? this._connecting.fromId   : tId;
          const fromPort = srcOut ? this._connecting.fromPort : tPort;
          const toId     = srcOut ? tId                       : this._connecting.fromId;
          const toPort   = srcOut ? tPort                     : this._connecting.fromPort;

          // Remove existing edge on same input port
          this.edges = this.edges.filter(e => !(e.toId === toId && e.toPort === toPort));

          this.edges.push({ fromId, fromPort, toId, toPort });

          // Update WebGL graph
          this._applyEdgesToGraph();
        }
      }

      this._nodeLayer.querySelectorAll('.editor-port.active')
        .forEach(d => d.classList.remove('active'));
      this._connecting = null;
      this._redrawEdges();
    }
  }

  // ── Apply edges to WebGL graph ─────────────────────────────

  _applyEdgesToGraph() {
    // Clear all connections
    for (const node of this.graph.nodes) node.connections.clear();

    // Re-apply from editor edges
    for (const edge of this.edges) {
      const toNode   = this.graph.nodes.find(n => n.id === edge.toId);
      const fromNode = this.graph.nodes.find(n => n.id === edge.fromId);
      if (toNode && fromNode) {
        toNode.connections.set(edge.toPort, fromNode);
      }
    }
  }

  // ── Draw edges ─────────────────────────────────────────────

  _redrawEdges() {
    this._svg.innerHTML = '';
    const W = this._area.clientWidth;
    const H = this._area.clientHeight;
    this._svg.setAttribute('width',  W);
    this._svg.setAttribute('height', H);

    // Committed edges
    for (const edge of this.edges) {
      const from = this._portPos(edge.fromId, edge.fromPort, true);
      const to   = this._portPos(edge.toId,   edge.toPort,   false);
      if (!from || !to) continue;
      this._drawCable(from, to, false);
    }

    // In-progress
    if (this._connecting) {
      const fixed = this._portPos(
        this._connecting.fromId,
        this._connecting.fromPort,
        this._connecting.isOutput
      );
      if (fixed) {
        const mouse = { x: this._connecting.mx, y: this._connecting.my };
        const from  = this._connecting.isOutput ? fixed : mouse;
        const to    = this._connecting.isOutput ? mouse : fixed;
        this._drawCable(from, to, true);
      }
    }
  }

  _drawCable(from, to, temp) {
    const dx  = Math.abs(to.x - from.x) * 0.5;
    const d   = `M${from.x},${from.y} C${from.x+dx},${from.y} ${to.x-dx},${to.y} ${to.x},${to.y}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', temp ? 'rgba(0,200,255,0.4)' : 'rgba(0,200,255,0.8)');
    path.setAttribute('stroke-width', '1.5');
    if (temp) path.setAttribute('stroke-dasharray', '5,4');
    this._svg.appendChild(path);
  }
  // ── API publique pour manipulation externe ────────────────

  /** Supprime le visual node sans toucher au graph WebGL */
  removeENode(id) {
    this.edges  = this.edges.filter(e => e.fromId !== id && e.toId !== id);
    const en    = this.enodes.find(n => n.id === id);
    if (en) en.el.remove();
    this.enodes = this.enodes.filter(n => n.id !== id);
    this._redrawEdges();
  }

  /** Crée un visual node pour un WebGL node déjà dans le graph */
  addENodeForExisting(wNode, type) {
    // Position à droite du dernier noeud visible
    const maxX = this.enodes.reduce((m, n) => Math.max(m, n.x), 60);
    this._createENode(type, wNode.id, maxX + 180, 120);
    this._redrawEdges();
  }

  /** Reconstruit les edges visuels depuis les connexions du graph */
  rebuildEdgesFromGraph() {
    this.edges = [];
    for (const node of this.graph.nodes) {
      for (const [toPort, srcNode] of node.connections) {
        this.edges.push({
          fromId: srcNode.id, fromPort: 'output',
          toId:   node.id,   toPort,
        });
      }
    }
    this._redrawEdges();
  }

}
