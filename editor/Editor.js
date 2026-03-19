/**
 * Editor — overlay graph editor
 * - Nodes drag & drop depuis palette
 * - Câbles bézier SVG entre ports
 * - Params inline (sliders) + panel détaillé au clic
 * - UI spéciale pour Text, Draw, MIDI
 */

const NODE_DEFS = {
  // Sources
  ShaderSourceNode: { label: 'ShaderSource', category: 'source',  inputs: [],                   outputs: ['output'] },
  MediaNode:        { label: 'Media',         category: 'source',  inputs: [],                   outputs: ['output'] },
  WebcamNode:       { label: 'Webcam',        category: 'source',  inputs: [],                   outputs: ['output'] },
  TextNode:         { label: 'Text',          category: 'source',  inputs: [],                   outputs: ['output'] },
  DrawNode:         { label: 'Draw',          category: 'source',  inputs: [],                   outputs: ['output'] },
  GameOfLifeNode:   { label: 'GameOfLife',    category: 'source',  inputs: [],                   outputs: ['output'] },
  MidiNode:         { label: 'MIDI',          category: 'control', inputs: [],                   outputs: ['cc0','cc1','cc2','cc3','cc4','cc5','cc6','cc7','cc8','cc9','cc10','cc11','cc12','cc13','cc14','cc15'] },
  // Effects
  GlitchNode:       { label: 'Glitch',        category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  AudioGlitchNode:  { label: 'AudioGlitch',   category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  BlurNode:         { label: 'Blur',          category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  FeedbackNode:     { label: 'Feedback',      category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  MixNode:          { label: 'Mix',           category: 'mix',     inputs: ['inputA', 'inputB'], outputs: ['output'] },
  // Output
  OutputNode:       { label: 'Output',        category: 'output',  inputs: ['input'],            outputs: [] },
};

const CAT_COLOR = {
  source:  '#4fffb0',
  control: '#ffd166',
  effect:  '#4fc3ff',
  mix:     '#c084fc',
  output:  '#ff6eb4',
};

export class Editor {
  constructor({ container, graph, factory }) {
    this.container = container;
    this.graph     = graph;
    this.factory   = factory;
    this.visible   = false;

    this.enodes      = [];
    this.edges       = [];
    this._seq        = 0;
    this._dragging   = null;
    this._connecting = null;
    this._selected   = null;   // enode sélectionné pour le panel
    this._paletteDrag = null;

    this._build();
  }

  // ── Build DOM ──────────────────────────────────────────────

  _build() {
    this.container.innerHTML = '';
    this.container.className = 'editor-overlay';

    // Handle
    const handle = document.createElement('div');
    handle.className = 'editor-handle';
    handle.innerHTML = '<div class="editor-handle-bar"></div><div class="editor-handle-label">Node Graph — <span id="editor-hint-keys">SPACE close · right-click delete</span></div><div class="editor-handle-bar"></div>';
    this.container.appendChild(handle);

    // Body
    const body = document.createElement('div');
    body.className = 'editor-body';
    this.container.appendChild(body);

    // Sidebar palette
    const sidebar = document.createElement('div');
    sidebar.className = 'editor-sidebar';
    sidebar.innerHTML = '<div class="editor-panel-title">Nodes</div>';
    const groups = {};
    for (const [type, def] of Object.entries(NODE_DEFS)) {
      if (!groups[def.category]) groups[def.category] = [];
      groups[def.category].push({ type, def });
    }
    for (const [cat, items] of Object.entries(groups)) {
      const g = document.createElement('div');
      g.innerHTML = `<div class="editor-cat-label">${cat}</div>`;
      for (const { type, def } of items) {
        const item = document.createElement('div');
        item.className    = 'editor-palette-item';
        item.dataset.type = type;
        item.draggable    = true;
        item.innerHTML    = `<span class="editor-dot" style="background:${CAT_COLOR[cat]}"></span>${def.label}`;
        item.addEventListener('dragstart', e => {
          this._paletteDrag = type;
          e.dataTransfer.effectAllowed = 'copy';
        });
        g.appendChild(item);
      }
      sidebar.appendChild(g);
    }
    body.appendChild(sidebar);

    // Canvas area
    const area = document.createElement('div');
    area.className = 'editor-area';
    body.appendChild(area);
    this._area = area;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'editor-svg');
    area.appendChild(svg);
    this._svg = svg;

    const nodeLayer = document.createElement('div');
    nodeLayer.className = 'editor-node-layer';
    area.appendChild(nodeLayer);
    this._nodeLayer = nodeLayer;

    // Param panel (droite)
    const panel = document.createElement('div');
    panel.className = 'editor-param-panel hidden';
    body.appendChild(panel);
    this._paramPanel = panel;

    // Drop
    area.addEventListener('dragover', e => e.preventDefault());
    area.addEventListener('drop', e => {
      e.preventDefault();
      if (!this._paletteDrag) return;
      const rect = area.getBoundingClientRect();
      this._addNode(this._paletteDrag, e.clientX - rect.left - 75, e.clientY - rect.top - 30);
      this._paletteDrag = null;
    });

    // Click outside → deselect
    area.addEventListener('mousedown', e => {
      if (e.target === area || e.target === svg || e.target === nodeLayer) {
        this._selectNode(null);
      }
    });

    document.addEventListener('mousemove', e => this._onMouseMove(e));
    document.addEventListener('mouseup',   e => this._onMouseUp(e));
  }

  // ── Toggle ─────────────────────────────────────────────────

  toggle() {
    this.visible = !this.visible;
    this.container.classList.toggle('open', this.visible);
    const hint = document.getElementById('space-hint');
    if (hint) hint.classList.toggle('hidden', this.visible);
    if (this.visible) requestAnimationFrame(() => this._redrawEdges());
  }

  show() {
    this.visible = true;
    this.container.classList.add('open');
    const hint = document.getElementById('space-hint');
    if (hint) hint.classList.add('hidden');
    requestAnimationFrame(() => this._redrawEdges());
  }

  hide() {
    this.visible = false;
    this.container.classList.remove('open');
    const hint = document.getElementById('space-hint');
    if (hint) hint.classList.remove('hidden');
  }

  // ── Add node ───────────────────────────────────────────────

  _addNode(type, x, y) {
    const wNode = this.factory.create(type);
    this.graph.addNode(wNode);
    this._createENode(type, wNode.id, x, y);
    this._redrawEdges();
    return wNode;
  }

  _createENode(type, id, x, y) {
    const def = NODE_DEFS[type];
    if (!def) return null;

    const el = document.createElement('div');
    el.className  = `editor-node cat-${def.category}`;
    el.dataset.id = id;
    el.style.cssText = `left:${x}px;top:${y}px`;

    // Header
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

    // UI spéciales
    const wNode = this.graph.nodes.find(n => n.id === id);
    this._addSpecialUI(el, type, id, wNode);

    // Events
    el.querySelector('.editor-node-header').addEventListener('mousedown', e => {
      if (e.target.classList.contains('editor-node-del')) return;
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      this._dragging = { id, el, ox: e.clientX - r.left, oy: e.clientY - r.top };
      this._selectNode(id);
    });
    el.querySelector('.editor-node-del').addEventListener('click', e => {
      e.stopPropagation();
      this._deleteNode(id);
    });
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

  // ── UI spéciales par type ──────────────────────────────────

  _addSpecialUI(el, type, id, wNode) {
    if (type === 'MediaNode') {
      const btn = document.createElement('div');
      btn.className   = 'editor-special-btn';
      btn.textContent = '+ load file';
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const input   = document.createElement('input');
        input.type    = 'file';
        input.accept  = 'image/*,video/*';
        input.addEventListener('change', () => {
          const file = input.files[0];
          if (!file) return;
          wNode?.loadFile(file);
          btn.textContent = file.name.length > 18 ? file.name.slice(0,16) + '…' : file.name;
        });
        input.click();
      });
      el.appendChild(btn);
    }

    if (type === 'TextNode') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-special-wrap';
      wrap.innerHTML = `
        <input class="editor-text-input" type="text" value="Hello" placeholder="text…">
        <input class="editor-text-color" type="color" value="#ffffff" title="color">`;
      const textIn  = wrap.querySelector('.editor-text-input');
      const colorIn = wrap.querySelector('.editor-text-color');
      textIn.addEventListener('input', e => {
        e.stopPropagation();
        wNode?.setText(textIn.value);
      });
      colorIn.addEventListener('input', () => wNode?.setColor(colorIn.value));
      // Prevent drag from starting when typing
      textIn.addEventListener('mousedown', e => e.stopPropagation());
      el.appendChild(wrap);
    }

    if (type === 'DrawNode') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-special-wrap editor-draw-controls';
      wrap.innerHTML = `
        <button class="editor-draw-toggle" title="Toggle drawing mode">✏ draw OFF</button>
        <input type="color" class="editor-text-color" value="#ffffff" title="brush color">
        <button class="editor-draw-erase" title="Toggle erase">✕</button>
        <button class="editor-draw-clear" title="Clear canvas">⌫</button>`;

      const toggle  = wrap.querySelector('.editor-draw-toggle');
      const colorIn = wrap.querySelector('.editor-text-color');
      const eraseBtn = wrap.querySelector('.editor-draw-erase');
      const clearBtn = wrap.querySelector('.editor-draw-clear');

      let drawActive = false;
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        drawActive = !drawActive;
        wNode?.setActive(drawActive);
        toggle.textContent = drawActive ? '✏ draw ON' : '✏ draw OFF';
        toggle.classList.toggle('active', drawActive);
      });
      colorIn.addEventListener('input', () => {
        if (wNode) wNode.brushColor = colorIn.value;
      });
      eraseBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (wNode) {
          wNode.mode = wNode.mode === 'erase' ? 'draw' : 'erase';
          eraseBtn.classList.toggle('active', wNode.mode === 'erase');
        }
      });
      clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        wNode?.clear();
      });

      // prevent drag when interacting
      wrap.addEventListener('mousedown', e => e.stopPropagation());
      el.appendChild(wrap);
    }

    if (type === 'MidiNode') {
      const info = document.createElement('div');
      info.className = 'editor-midi-info';
      info.textContent = 'awaiting MIDI…';
      el.appendChild(info);
      // Mise à jour périodique du device name
      setInterval(() => {
        if (wNode?._device) info.textContent = `▶ ${wNode._device}`;
        else if (wNode?._error) info.textContent = `✗ ${wNode._error}`;
      }, 1000);
    }
  }

  // ── Draw canvas overlay ────────────────────────────────────

  _openDrawCanvas(drawNode, onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'editor-draw-overlay';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-draw-toolbar';
    toolbar.innerHTML = `
      <label class="editor-draw-tool">
        <span>Color</span>
        <input type="color" id="dc-color" value="#ffffff">
      </label>
      <label class="editor-draw-tool">
        <span>Size</span>
        <input type="range" id="dc-size" min="1" max="80" value="12">
      </label>
      <button class="editor-draw-btn" id="dc-erase">Erase</button>
      <button class="editor-draw-btn" id="dc-draw">Draw</button>
      <button class="editor-draw-btn danger" id="dc-clear">Clear</button>
      <button class="editor-draw-btn" id="dc-close">Close</button>`;
    overlay.appendChild(toolbar);

    // Canvas de dessin
    const cvs = document.createElement('canvas');
    cvs.className = 'editor-draw-canvas';
    cvs.width     = window.innerWidth;
    cvs.height    = window.innerHeight - 50;
    overlay.appendChild(cvs);

    document.body.appendChild(overlay);

    // Synchroniser les tools
    const colorIn = toolbar.querySelector('#dc-color');
    const sizeIn  = toolbar.querySelector('#dc-size');
    colorIn.addEventListener('input', () => drawNode.brushColor = colorIn.value);
    sizeIn.addEventListener('input',  () => drawNode.setParam('brushSize', parseInt(sizeIn.value)));
    toolbar.querySelector('#dc-erase').addEventListener('click', () => drawNode.mode = 'erase');
    toolbar.querySelector('#dc-draw').addEventListener('click',  () => drawNode.mode = 'draw');
    toolbar.querySelector('#dc-clear').addEventListener('click', () => {
      drawNode.clear();
      ctx2d.clearRect(0, 0, cvs.width, cvs.height);
    });
    toolbar.querySelector('#dc-close').addEventListener('click', () => {
      overlay.remove();
      if (onClose) onClose();
    });

    // Canvas local (preview du dessin)
    const ctx2d = cvs.getContext('2d');
    ctx2d.fillStyle = 'rgba(0,0,0,0)';

    const scaleX = () => drawNode.width  / cvs.width;
    const scaleY = () => drawNode.height / cvs.height;

    const pos = e => {
      const r = cvs.getBoundingClientRect();
      return { x: (e.clientX - r.left) * scaleX(), y: (e.clientY - r.top) * scaleY() };
    };

    cvs.addEventListener('mousedown', e => {
      const p = pos(e);
      drawNode.startStroke(p.x, p.y);
      this._drawOnLocal(ctx2d, drawNode, p.x / scaleX(), p.y / scaleY(), null, null);
    });
    cvs.addEventListener('mousemove', e => {
      if (!drawNode._drawing) return;
      const p    = pos(e);
      const prev = { x: drawNode._lastX / scaleX(), y: drawNode._lastY / scaleY() };
      drawNode.continueStroke(p.x, p.y);
      this._drawOnLocal(ctx2d, drawNode, prev.x, prev.y, p.x / scaleX(), p.y / scaleY());
    });
    cvs.addEventListener('mouseup',   () => drawNode.endStroke());
    cvs.addEventListener('mouseleave',() => drawNode.endStroke());
  }

  _drawOnLocal(ctx, drawNode, x0, y0, x1, y1) {
    const size  = drawNode.getParam('brushSize') * 0.5;
    const alpha = drawNode.getParam('opacity');
    ctx.save();
    ctx.globalAlpha = alpha;
    if (drawNode.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.fillStyle   = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawNode.brushColor;
      ctx.fillStyle   = drawNode.brushColor;
    }
    ctx.lineWidth = size;
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    if (x1 !== null) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x0, y0, size / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ── Select node → param panel ──────────────────────────────

  _selectNode(id) {
    // Deselect previous
    this.enodes.forEach(n => n.el.classList.remove('selected'));
    this._selected = id;

    if (!id) {
      this._paramPanel.classList.add('hidden');
      return;
    }

    const enode = this.enodes.find(n => n.id === id);
    if (enode) enode.el.classList.add('selected');

    const wNode = this.graph.nodes.find(n => n.id === id);
    if (!wNode?.params?.length) {
      this._paramPanel.classList.add('hidden');
      return;
    }

    this._paramPanel.classList.remove('hidden');
    this._buildParamPanel(wNode);
  }

  _buildParamPanel(wNode) {
    const panel = this._paramPanel;
    panel.innerHTML = `<div class="editor-panel-title">${wNode.label}</div>`;

    // Track which params are MIDI-controlled
    if (!wNode._midiControlled) wNode._midiControlled = {};

    for (const p of wNode.params) {
      const val     = wNode.getParam(p.name);
      const isMidi  = !!wNode._midiControlled[p.name];
      const row     = document.createElement('div');
      row.className = 'editor-panel-row';

      // Header: name + MIDI checkbox
      const header = document.createElement('div');
      header.className = 'editor-panel-param-header';
      header.innerHTML = `
        <span class="editor-panel-param-name">${p.name}</span>
        <label class="editor-panel-midi-label">
          <input type="checkbox" class="editor-panel-midi-cb" ${isMidi ? 'checked' : ''}>
          <span>MIDI</span>
        </label>`;
      row.appendChild(header);

      // Control area: slider OR midi port
      const ctrl = document.createElement('div');
      ctrl.className = 'editor-panel-control';
      row.appendChild(ctrl);

      const renderControl = (midi) => {
        ctrl.innerHTML = '';
        if (!midi) {
          // Slider
          // Mode names si disponibles (ex: MixNode)
          const modeNames = wNode.constructor.modeNames ?? null;
          const showMode  = p.name === 'mode' && modeNames;
          const initVal   = wNode.getParam(p.name);
          const initLabel = showMode ? modeNames[Math.round(initVal)] : (p.type === 'int' ? Math.round(initVal) : initVal.toFixed(2));
          ctrl.innerHTML = `
            <input type="range" min="${p.min}" max="${p.max}"
              step="${p.step ?? (p.type === 'int' ? 1 : 0.001)}"
              value="${initVal}" class="editor-panel-slider">
            <span class="editor-panel-val">${initLabel}</span>`;
          const slider = ctrl.querySelector('input');
          const valEl  = ctrl.querySelector('.editor-panel-val');
          slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            wNode.setParam(p.name, v);
            valEl.textContent = showMode
              ? modeNames[Math.round(v)]
              : (p.type === 'int' ? Math.round(v) : v.toFixed(2));
          });
        } else {
          // MIDI port input — affiche un port de connexion
          const portName = `midi_${p.name}`;
          ctrl.innerHTML = `
            <div class="editor-port-row input editor-midi-port-row">
              <div class="editor-port" data-id="${wNode.id}" data-port="${portName}" data-dir="input"></div>
              <span class="editor-port-label">${p.name} ← CC</span>
            </div>`;
          // Ajouter ce port aux inputPorts dynamiquement
          if (!wNode._dynamicInputPorts) wNode._dynamicInputPorts = [];
          if (!wNode._dynamicInputPorts.includes(portName)) {
            wNode._dynamicInputPorts.push(portName);
            const origGet = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(wNode), 'inputPorts');
            // Override inputPorts on instance
            Object.defineProperty(wNode, 'inputPorts', {
              get() {
                const base = origGet ? origGet.get.call(this) : [];
                return [...base, ...(this._dynamicInputPorts || [])];
              }
            });
          }
          // Bind port drag
          ctrl.querySelectorAll('.editor-port').forEach(dot => {
            dot.addEventListener('mousedown', e => {
              e.stopPropagation();
              const areaRect = this._area.getBoundingClientRect();
              this._connecting = {
                fromId: dot.dataset.id, fromPort: dot.dataset.port,
                isOutput: false,
                mx: e.clientX - areaRect.left, my: e.clientY - areaRect.top,
              };
              dot.classList.add('active');
            });
          });
        }
      };

      renderControl(isMidi);

      // Checkbox toggle
      header.querySelector('.editor-panel-midi-cb').addEventListener('change', (e) => {
        wNode._midiControlled[p.name] = e.target.checked;
        renderControl(e.target.checked);
      });

      panel.appendChild(row);
    }
  }

  // ── Delete ─────────────────────────────────────────────────

  _deleteNode(id) {
    const wNode = this.graph.nodes.find(n => n.id === id);
    if (wNode) this.graph.removeNode(wNode);
    const en = this.enodes.find(n => n.id === id);
    if (en) en.el.remove();
    this.enodes = this.enodes.filter(n => n.id !== id);
    this.edges  = this.edges.filter(e => e.fromId !== id && e.toId !== id);
    if (this._selected === id) this._selectNode(null);
    this._redrawEdges();
  }

  // ── Port position ──────────────────────────────────────────

  _portPos(nodeId, portName, isOutput) {
    const en = this.enodes.find(n => n.id === nodeId);
    if (!en) return null;
    const dot = en.el.querySelector(
      `.editor-port[data-id="${nodeId}"][data-port="${portName}"][data-dir="${isOutput ? 'output' : 'input'}"]`
    );
    if (!dot) return null;
    const ar  = this._area.getBoundingClientRect();
    const dr  = dot.getBoundingClientRect();
    return { x: dr.left + dr.width / 2 - ar.left, y: dr.top + dr.height / 2 - ar.top };
  }

  // ── Mouse ──────────────────────────────────────────────────

  _onMouseMove(e) {
    if (!this.visible) return;
    const ar = this._area.getBoundingClientRect();
    const mx = e.clientX - ar.left;
    const my = e.clientY - ar.top;

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
    if (this._dragging) { this._dragging = null; }

    if (this._connecting) {
      const target = e.target;
      if (target.classList.contains('editor-port')) {
        const tDir   = target.dataset.dir;
        const tId    = target.dataset.id;
        const tPort  = target.dataset.port;
        const srcOut = this._connecting.isOutput;

        if (srcOut !== (tDir === 'output') && tId !== this._connecting.fromId) {
          const fromId   = srcOut ? this._connecting.fromId   : tId;
          const fromPort = srcOut ? this._connecting.fromPort : tPort;
          const toId     = srcOut ? tId                       : this._connecting.fromId;
          const toPort   = srcOut ? tPort                     : this._connecting.fromPort;

          // Un seul edge par port d'entrée
          this.edges = this.edges.filter(e => !(e.toId === toId && e.toPort === toPort));
          this.edges.push({ fromId, fromPort, toId, toPort });
          this._applyEdgesToGraph();
        }
      }
      this._nodeLayer.querySelectorAll('.editor-port.active').forEach(d => d.classList.remove('active'));
      this._connecting = null;
      this._redrawEdges();
    }
  }

  // ── Graph sync ─────────────────────────────────────────────

  _applyEdgesToGraph() {
    for (const node of this.graph.nodes) node.connections.clear();
    for (const edge of this.edges) {
      const toNode   = this.graph.nodes.find(n => n.id === edge.toId);
      const fromNode = this.graph.nodes.find(n => n.id === edge.fromId);
      if (toNode && fromNode) {
        toNode.connections.set(edge.toPort, fromNode);
      }
    }
  }

  syncFromGraph() {
    if (this.enodes.length) return;
    let x = 60;
    for (const node of this.graph.nodes) {
      this._createENode(node.constructor.name, node.id, x, 120);
      x += 200;
    }
    for (const node of this.graph.nodes) {
      for (const [toPort, srcNode] of node.connections) {
        this.edges.push({ fromId: srcNode.id, fromPort: 'output', toId: node.id, toPort });
      }
    }
    requestAnimationFrame(() => this._redrawEdges());
  }

  // ── Public API (for main.js) ───────────────────────────────

  removeENode(id) {
    this.edges  = this.edges.filter(e => e.fromId !== id && e.toId !== id);
    const en    = this.enodes.find(n => n.id === id);
    if (en) en.el.remove();
    this.enodes = this.enodes.filter(n => n.id !== id);
    this._redrawEdges();
  }

  addENodeForExisting(wNode, type) {
    const maxX = this.enodes.reduce((m, n) => Math.max(m, n.x), 60);
    this._createENode(type, wNode.id, maxX + 200, 120);
    this._redrawEdges();
  }

  rebuildEdgesFromGraph() {
    this.edges = [];
    for (const node of this.graph.nodes) {
      for (const [toPort, srcNode] of node.connections) {
        this.edges.push({ fromId: srcNode.id, fromPort: 'output', toId: node.id, toPort });
      }
    }
    this._redrawEdges();
  }

  // ── Draw edges SVG ─────────────────────────────────────────

  _redrawEdges() {
    this._svg.innerHTML = '';
    const W = this._area.clientWidth;
    const H = this._area.clientHeight;
    this._svg.setAttribute('width',  W);
    this._svg.setAttribute('height', H);

    for (const edge of this.edges) {
      const from = this._portPos(edge.fromId, edge.fromPort, true);
      const to   = this._portPos(edge.toId,   edge.toPort,   false);
      if (from && to) this._drawCable(from, to, false);
    }

    if (this._connecting) {
      const fixed = this._portPos(this._connecting.fromId, this._connecting.fromPort, this._connecting.isOutput);
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
    path.setAttribute('stroke', temp ? 'rgba(79,255,176,0.35)' : 'rgba(79,255,176,0.75)');
    path.setAttribute('stroke-width', '1.5');
    if (temp) path.setAttribute('stroke-dasharray', '5,4');
    this._svg.appendChild(path);
  }
}
