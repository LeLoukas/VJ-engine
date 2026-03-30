import { SaveLoad } from './SaveLoad.js';
import { DebugPreview } from './DebugPreview.js';
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
  FractalNode:      { label: 'Fractal',      category: 'source',  inputs: [],                   outputs: ['output'] },
  MatrixNode:       { label: 'Matrix',      category: 'source',  inputs: [],                   outputs: ['output'] },
  VideoCollageNode: { label: 'VideoCollage', category: 'source',  inputs: [],                   outputs: ['output'] },
  ShaderEditNode:   { label: 'ShaderEdit',  category: 'source',  inputs: [],                   outputs: ['output'] },
  MidiNode:         { label: 'MIDI',          category: 'control', inputs: [],                   outputs: [] },
  ConstantNode:     { label: 'Constant',     category: 'control', inputs: [],                   outputs: ['value'] },
  LFONode:          { label: 'LFO',          category: 'control', inputs: [],                   outputs: ['value'] },
  AudioNode:        { label: 'Audio',        category: 'control', inputs: [],                   outputs: ['bass','mid','treble','amplitude','beat','tap'] },
  // Effects
  GlitchNode:       { label: 'Glitch',        category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  BlurNode:         { label: 'Blur',          category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  FeedbackNode:     { label: 'Feedback',      category: 'effect',  inputs: ['input', 'feedback'], outputs: ['output'] },
  KaleidoscopeNode: { label: 'Kaleidoscope', category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  ChromaKeyNode:    { label: 'ChromaKey',    category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  DistortionNode:   { label: 'Distortion',  category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  RGBSplitNode:     { label: 'RGBSplit',     category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  PixelateNode:     { label: 'Pixelate',     category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  PosterizeNode:    { label: 'Posterize',    category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  NoiseNode:        { label: 'Noise',        category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  ColorGradeNode:   { label: 'ColorGrade',   category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  StrobeNode:       { label: 'Strobe',       category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  TransformNode:    { label: 'Transform',    category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  PixelFallNode:    { label: 'PixelFall',    category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  SharpenNode:      { label: 'Sharpen',      category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  BloomNode:        { label: 'Bloom',        category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  VortexNode:       { label: 'Vortex',       category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  VideoDelayNode:   { label: 'VideoDelay',   category: 'effect',  inputs: ['input'],            outputs: ['output'] },
  RerouteNode:      { label: '•',            category: 'utility', inputs: ['input'],            outputs: ['output'] },
  RouteOutNode:     { label: 'Route OUT',    category: 'utility', inputs: ['input'],            outputs: ['output'] },
  RouteInNode:      { label: 'Route IN',     category: 'utility', inputs: [],                   outputs: ['output'] },
  MixNode:          { label: 'Mix',           category: 'mix',     inputs: ['inputA', 'inputB'], outputs: ['output'] },
  SceneMixNode:     { label: 'SceneMix',      category: 'mix',     inputs: ['A','B','C','D'],     outputs: ['output'] },
  // Output
  OutputNode:       { label: 'Output',        category: 'output',  inputs: ['input'],            outputs: [] },
};

const CAT_COLOR = {
  source:  '#4fffb0',
  control: '#ffd166',
  effect:  '#4fc3ff',
  mix:     '#c084fc',
  output:  '#ff6eb4',
  utility: '#888888',
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
    this._dragging    = null;
    this._connecting  = null;
    this._selected    = null;
    this._paletteDrag = null;
    this._multiSelect = new Set();  // ids des nodes sélectionnés
    this._selectBox   = null;       // { x0,y0,x1,y1 } drag de sélection
    this._insertTarget = null;      // { edge, timer } pour insertion sur câble
    this.saveLoad     = null;

    this._build();
  }

  // ── Build DOM ──────────────────────────────────────────────

  _build() {
    this.container.innerHTML = '';
    this.container.className = 'editor-overlay';

    // Handle
    const handle = document.createElement('div');
    handle.className = 'editor-handle';
    handle.innerHTML = '<div class="editor-handle-bar"></div><div class="editor-handle-label">Node Graph</div><div class="editor-handle-bar"></div>';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'editor-io-btn'; saveBtn.textContent = '↓ save';
    saveBtn.addEventListener('click', () => this.saveLoad?.saveToFile());
    const loadBtn = document.createElement('button');
    loadBtn.className = 'editor-io-btn'; loadBtn.textContent = '↑ load';
    loadBtn.addEventListener('click', () => this.saveLoad?.loadFromFile());
    const sceneBtn = document.createElement('button');
    sceneBtn.className = 'editor-io-btn editor-scene-btn';
    sceneBtn.textContent = '+ scene';
    sceneBtn.title = 'Import scene — adds nodes and creates a MixNode transition';
    sceneBtn.addEventListener('click', () => this.saveLoad?.importAsScene());
    handle.appendChild(saveBtn); handle.appendChild(loadBtn); handle.appendChild(sceneBtn);
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
    const rightCol = document.createElement('div');
    rightCol.className = 'editor-right-col';
    body.appendChild(rightCol);

    const panel = document.createElement('div');
    panel.className = 'editor-param-panel hidden';
    rightCol.appendChild(panel);
    this._paramPanel = panel;

    // Zone preview fixe en bas du panel droit
    const previewZone = document.createElement('div');
    previewZone.className = 'editor-preview-zone';
    rightCol.appendChild(previewZone);
    this._previewZone = previewZone;

    // Drop
    area.addEventListener('dragover', e => e.preventDefault());
    area.addEventListener('drop', e => {
      e.preventDefault();
      if (!this._paletteDrag) return;
      const rect = area.getBoundingClientRect();
      this._addNode(this._paletteDrag, e.clientX - rect.left - 75, e.clientY - rect.top - 30);
      this._paletteDrag = null;
    });

    // Click/drag on empty area → deselect or start selection box
    area.addEventListener('mousedown', e => {
      if (e.target === area || e.target === svg || e.target === nodeLayer) {
        if (!e.shiftKey) {
          this._selectNode(null);
          this._multiSelect.clear();
          this.enodes.forEach(n => n.el.classList.remove('selected'));
        }
        const ar = area.getBoundingClientRect();
        this._selectBox = { x0: e.clientX - ar.left, y0: e.clientY - ar.top,
                            x1: e.clientX - ar.left, y1: e.clientY - ar.top };
      }
    });

    document.addEventListener('mousemove', e => this._onMouseMove(e));
    document.addEventListener('mouseup',   e => this._onMouseUp(e));
    this._startLiveLoop();
  }

  initDebug(renderer) {
    this._debug = new DebugPreview(this.graph, renderer);
    if (this._previewZone) this._debug.mount(this._previewZone);
    this.saveLoad = new SaveLoad(this.graph, this, renderer._factory ?? null);
  }

  initSaveLoad(factory) {
    this.saveLoad = new SaveLoad(this.graph, this, factory);
  }

  _startLiveLoop() {
    const tick = () => {
      // Mettre à jour toutes les valeurs live des ports MIDI
      const allLiveEls = [
        ...(this._nodeLayer?.querySelectorAll('.editor-midi-live-val') ?? []),
        ...(this._paramPanel?.querySelectorAll('.editor-panel-live') ?? []),
      ];
      for (const el of allLiveEls) {
        const row     = el.closest('[data-param]');
        if (!row) continue;
        const param   = row.dataset.param;
        const nodeEl  = row.closest('.editor-node') ?? this._paramPanel;
        const nodeId  = row.closest('.editor-node')?.dataset.id ?? this._selected;
        if (!nodeId) continue;
        const portName = `midi_${param}`;
        const edge    = this.edges.find(e => e.toId === nodeId && e.toPort === portName);
        if (!edge) continue;
        const srcNode = this.graph.nodes.find(n => n.id === edge.fromId);
        if (!srcNode?.getPortValue) continue;
        const raw  = srcNode.getPortValue(edge.fromPort);
        // Range depuis le panel ou les inputs sous le node
        const minIn = row.querySelector('[data-range="min"]');
        const maxIn = row.querySelector('[data-range="max"]');
        const minV = minIn ? parseFloat(minIn.value) : 0;
        const maxV = maxIn ? parseFloat(maxIn.value) : 1;
        el.textContent = (minV + raw * (maxV - minV)).toFixed(2);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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
    el.className  = `editor-node cat-${def.category} cat-${type}`;
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
    if (wNode?.bypassed) el.classList.add('bypassed');

    // Port bypass sur les effect/mix nodes
    if (def && ['effect', 'mix'].includes(def.category)) {
      const bypassSection = document.createElement('div');
      bypassSection.className = 'editor-bypass-port-section';
      bypassSection.innerHTML = `
        <div class="editor-port-row input editor-bypass-port-row">
          <div class="editor-port editor-bypass-port" data-id="${id}" data-port="bypass" data-dir="input"></div>
          <span class="editor-port-label">bypass</span>
        </div>`;
      bypassSection.querySelector('.editor-bypass-port').addEventListener('mousedown', e => {
        e.stopPropagation();
        const ar = this._area.getBoundingClientRect();
        this._connecting = {
          fromId: id, fromPort: 'bypass', isOutput: false,
          mx: e.clientX - ar.left, my: e.clientY - ar.top,
        };
        bypassSection.querySelector('.editor-bypass-port').classList.add('active');
      });
      el.appendChild(bypassSection);
    }
    this._addSpecialUI(el, type, id, wNode);

    // Events
    // Debug preview on hover
    el.addEventListener('mouseenter', () => {
      if (!this._debug || !this.visible) return;
      this._debug.show(id);
    });
    el.addEventListener('mouseleave', () => {
      if (this._debug) this._debug.hide();
    });

    el.querySelector('.editor-node-header').addEventListener('mousedown', e => {
      if (e.target.classList.contains('editor-node-del')) return;
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      this._dragging = { id, el, ox: e.clientX - r.left, oy: e.clientY - r.top };
      this._selectNode(id);

      // Insertion sur câble — timer 500ms
      const def2 = NODE_DEFS[type];
      if (def2?.inputs?.length === 1 && def2?.outputs?.length === 1) {
        this._insertTimer = setTimeout(() => {
          const en = this.enodes.find(n => n.id === id);
          if (!en || !this._dragging) return;
          const cx = en.x + 75, cy = en.y + 20;
          this._tryInsertOnCable(id, cx, cy);
        }, 500);
      }
    });

    el.querySelector('.editor-node-header').addEventListener('mouseup', () => {
      clearTimeout(this._insertTimer);
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

    if (type === 'ShaderEditNode') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-shaderedit-wrap';
      wrap.addEventListener('mousedown', e => e.stopPropagation());

      const ta = document.createElement('textarea');
      ta.className = 'editor-shaderedit-ta';
      ta.spellcheck = false;
      ta.value = wNode?.fragSrc ?? '';

      const errBox = document.createElement('div');
      errBox.className = 'editor-shaderedit-err hidden';

      const compileBtn = document.createElement('button');
      compileBtn.className = 'editor-special-btn';
      compileBtn.style.margin = '3px 6px';
      compileBtn.textContent = '▶ compile';

      const doCompile = () => {
        wNode?.updateFrag(ta.value);
        if (wNode?.error) {
          errBox.textContent = wNode.error.split('\n').slice(0,3).join('\n');
          errBox.classList.remove('hidden');
        } else {
          errBox.classList.add('hidden');
        }
      };

      compileBtn.addEventListener('click', doCompile);
      // Ctrl+Enter compile
      ta.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doCompile(); }
      });

      if (wNode) {
        wNode.onError = (err) => {
          if (err) { errBox.textContent = err.split('\n').slice(0,3).join('\n'); errBox.classList.remove('hidden'); }
          else errBox.classList.add('hidden');
        };
        // Rebuild param panel when custom params change after compile
        wNode.onParamsChanged = () => {
          if (this._selected === wNode.id) this._buildParamPanel(wNode);
        };
      }

      wrap.appendChild(ta);
      wrap.appendChild(errBox);
      wrap.appendChild(compileBtn);
      el.appendChild(wrap);
    }

    if (type === 'LFONode') {
      // Mini visualizer LFO
      const viz = document.createElement('canvas');
      viz.width = 132; viz.height = 28;
      viz.className = 'editor-lfo-viz';
      viz.addEventListener('mousedown', e => e.stopPropagation());
      el.appendChild(viz);
      // Mise à jour en temps réel
      const ctx2d = viz.getContext('2d');
      const drawLFO = () => {
        if (!document.contains(viz)) return;
        ctx2d.clearRect(0, 0, 132, 28);
        ctx2d.strokeStyle = 'rgba(79,255,176,0.7)';
        ctx2d.lineWidth = 1.5;
        ctx2d.beginPath();
        const mode = wNode?.getParam('mode') ?? 1;
        const phase = wNode?.getParam('phase') ?? 0;
        for (let x = 0; x < 132; x++) {
          const p = ((x / 132) + phase) % 1;
          let y;
          if (mode === 0) y = p;
          else if (mode === 1) y = p < 0.5 ? p*2 : (1-p)*2;
          else y = (Math.sin(p * Math.PI * 2 - Math.PI/2) + 1) / 2;
          const py = 24 - y * 22;
          x === 0 ? ctx2d.moveTo(x, py) : ctx2d.lineTo(x, py);
        }
        ctx2d.stroke();
        // Curseur position actuelle
        if (wNode?._phase !== undefined) {
          const cx = ((wNode._phase + phase) % 1) * 132;
          ctx2d.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx2d.beginPath(); ctx2d.moveTo(cx, 2); ctx2d.lineTo(cx, 26); ctx2d.stroke();
        }
        requestAnimationFrame(drawLFO);
      };
      requestAnimationFrame(drawLFO);
    }

    if (type === 'AudioNode') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-audio-wrap';
      wrap.addEventListener('mousedown', e => e.stopPropagation());

      // Vumètres bass/mid/treble/beat
      const meters = document.createElement('div');
      meters.className = 'editor-audio-meters';
      ['bass','mid','treble','beat'].forEach(name => {
        const row = document.createElement('div');
        row.className = 'editor-audio-meter-row';
        row.innerHTML = `<span class="editor-audio-meter-label">${name}</span><div class="editor-audio-bar-wrap"><div class="editor-audio-bar" data-meter="${name}"></div></div>`;
        meters.appendChild(row);
      });
      wrap.appendChild(meters);

      // Bouton tap tempo
      const tapBtn = document.createElement('button');
      tapBtn.className = 'editor-tap-btn';
      tapBtn.textContent = 'TAP';
      tapBtn.title = 'Tap tempo';
      tapBtn.addEventListener('click', e => { e.stopPropagation(); wNode?.tap(); });
      wrap.appendChild(tapBtn);

      el.appendChild(wrap);

      // Mise à jour des vumètres
      const updateMeters = () => {
        if (!document.contains(wrap)) return;
        ['bass','mid','treble','beat'].forEach(name => {
          const bar = wrap.querySelector(`[data-meter="${name}"]`);
          if (bar && wNode) bar.style.width = `${wNode.getPortValue(name) * 100}%`;
        });
        requestAnimationFrame(updateMeters);
      };
      requestAnimationFrame(updateMeters);
    }

    if (type === 'VideoCollageNode') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-special-wrap';
      wrap.style.flexDirection = 'column'; wrap.style.gap = '4px';
      wrap.addEventListener('mousedown', e => e.stopPropagation());

      const info = document.createElement('div');
      info.className = 'editor-port-label';
      info.style.cssText = 'padding:4px 8px;color:var(--text-dim);font-size:9px';
      info.textContent = 'no videos loaded';

      const btn = document.createElement('button');
      btn.className = 'editor-special-btn';
      btn.style.margin = '0 6px 4px';
      btn.textContent = '📁 select videos';

      btn.addEventListener('click', e => {
        e.stopPropagation();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.multiple = true;
        input.addEventListener('change', () => {
          if (!input.files.length) return;
          wNode?.loadFiles(input.files);
          info.textContent = `${input.files.length} video${input.files.length > 1 ? 's' : ''} loaded`;
          info.style.color = 'var(--accent)';
          // Auto-spawn first slot immediately
          if (wNode?._spawnTimer !== undefined) wNode._spawnTimer = 999;
        });
        input.click();
      });

      if (wNode) {
        wNode.onFilesLoaded = (n) => {
          info.textContent = `${n} video${n > 1 ? 's' : ''} loaded`;
          info.style.color = 'var(--accent)';
        };
      }

      wrap.appendChild(btn);
      wrap.appendChild(info);
      el.appendChild(wrap);
    }

    if (type === 'RouteOutNode' || type === 'RouteInNode') {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'editor-route-name';
      inp.value = wNode?.routeName ?? 'route1';
      inp.placeholder = 'name';
      inp.addEventListener('input', () => { if (wNode) wNode.routeName = inp.value.trim() || 'route1'; });
      inp.addEventListener('mousedown', e => e.stopPropagation());
      el.appendChild(inp);
    }

    if (type === 'MidiNode') {
      const wrap = document.createElement('div');
      wrap.className = 'editor-midi-compact';
      wrap.addEventListener('mousedown', e => e.stopPropagation());

      // Device dropdown
      const sel = document.createElement('select');
      sel.className = 'editor-midi-select';
      sel.innerHTML = '<option value="">— no device —</option>';

      // Configure button
      const cfgBtn = document.createElement('button');
      cfgBtn.className = 'editor-special-btn editor-midi-cfg-btn';
      cfgBtn.textContent = '⚙ select sources';

      wrap.appendChild(sel);
      wrap.appendChild(cfgBtn);
      el.appendChild(wrap);

      // Ports actifs affichés sous le node (outputs)
      const portsSection = document.createElement('div');
      portsSection.className = 'editor-midi-active-ports';
      el.appendChild(portsSection);

      const refreshActivePorts = () => {
        portsSection.innerHTML = '';
        if (!wNode) return;
        for (const source of wNode.activeSources) {
          const portName = wNode._sourceToPort(source);
          const row = document.createElement('div');
          row.className = 'editor-port-row output editor-midi-out-row';
          row.innerHTML = `
            <span class="editor-port-label">${source}</span>
            <div class="editor-port" data-id="${wNode.id}" data-port="${portName}" data-dir="output"></div>`;
          row.querySelector('.editor-port').addEventListener('mousedown', e => {
            e.stopPropagation();
            const ar = this._area.getBoundingClientRect();
            this._connecting = {
              fromId: wNode.id, fromPort: portName, isOutput: true,
              mx: e.clientX - ar.left, my: e.clientY - ar.top,
            };
            row.querySelector('.editor-port').classList.add('active');
          });
          portsSection.appendChild(row);
        }
        // Sync NODE_DEFS outputs pour les câbles
        NODE_DEFS['MidiNode'].outputs = [...wNode.activeSources].map(s => wNode._sourceToPort(s));
        this._redrawEdges();
      };

      refreshActivePorts();

      // Panel flottant
      let panel = null;
      const openPanel = () => {
        if (panel) { panel.remove(); panel = null; if (wNode) wNode._vizPanel = null; return; }
        panel = document.createElement('div');
        panel.className = 'editor-midi-panel';
        panel.addEventListener('mousedown', e => e.stopPropagation());

        // Titre
        const title = document.createElement('div');
        title.className = 'editor-midi-sec-label';
        title.style.marginBottom = '4px';
        title.textContent = 'Active sources';
        panel.appendChild(title);

        // Source checkboxes
        const srcGrid = document.createElement('div');
        srcGrid.className = 'editor-midi-src-grid';

        const allSources = [
          { group: 'Knobs', items: Array.from({length:8}, (_,i) => `K${i+1}`) },
          { group: 'Pads',  items: Array.from({length:16},(_,i) => `Pad${i+1}`) },
        ];

        for (const { group, items } of allSources) {
          const groupEl = document.createElement('div');
          groupEl.className = 'editor-midi-src-group';
          groupEl.innerHTML = `<div class="editor-midi-sec-label">${group}</div>`;
          const grid = document.createElement('div');
          grid.className = 'editor-midi-src-items';
          for (const src of items) {
            const label = document.createElement('label');
            label.className = 'editor-midi-src-label';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = wNode?.activeSources?.has(src) ?? false;
            cb.addEventListener('change', () => {
              if (!wNode) return;
              if (cb.checked) wNode.activeSources.add(src);
              else {
                wNode.activeSources.delete(src);
                // Supprimer les edges de ce port
                const portName = wNode._sourceToPort(src);
                this.edges = this.edges.filter(e => !(e.fromId === wNode.id && e.fromPort === portName));
                this._applyEdgesToGraph();
              }
              refreshActivePorts();
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(src));
            // Indicateur d'activité
            const dot = document.createElement('span');
            dot.className = 'editor-midi-src-dot';
            dot.dataset.src = src;
            label.appendChild(dot);
            grid.appendChild(label);
          }
          groupEl.appendChild(grid);
          srcGrid.appendChild(groupEl);
        }
        panel.appendChild(srcGrid);

        // Séparateur
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:rgba(255,255,255,0.06);margin:4px 0';
        panel.appendChild(sep);

        // Canal pads
        const padChanRow = document.createElement('div');
        padChanRow.className = 'editor-midi-chan-row';
        padChanRow.innerHTML = `<span class="editor-midi-sec-label">pad channel</span>`;
        const padChanSel = document.createElement('select');
        padChanSel.className = 'editor-midi-select';
        padChanSel.style.marginTop = '3px';
        for (let ch = 1; ch <= 16; ch++) {
          const o = document.createElement('option');
          o.value = ch; o.textContent = `Ch ${ch}`;
          if (ch === (wNode?.padChannel ?? 10)) o.selected = true;
          padChanSel.appendChild(o);
        }
        padChanSel.addEventListener('change', () => {
          if (wNode) wNode.padChannel = parseInt(padChanSel.value);
        });
        padChanRow.appendChild(padChanSel);
        panel.appendChild(padChanRow);

        // Visualiseur live (knobs + pads)
        const vizTitle = document.createElement('div');
        vizTitle.className = 'editor-midi-sec-label';
        vizTitle.style.marginTop = '6px';
        vizTitle.textContent = 'Live activity';
        panel.appendChild(vizTitle);

        const knobsRow = document.createElement('div');
        knobsRow.className = 'editor-midi-knobs';
        for (let i = 1; i <= 8; i++) {
          const k = document.createElement('div');
          k.className = 'editor-midi-knob'; k.dataset.cc = i;
          k.innerHTML = `<div class="editor-midi-knob-fill-wrap"><div class="editor-midi-knob-fill"></div></div><span class="editor-midi-knob-label">K${i}</span><span class="editor-midi-knob-val">—</span>`;
          knobsRow.appendChild(k);
        }
        panel.appendChild(knobsRow);

        const padsRow = document.createElement('div');
        padsRow.className = 'editor-midi-pads';
        for (let i = 36; i <= 51; i++) {
          const p = document.createElement('div');
          p.className = 'editor-midi-pad'; p.dataset.note = i;
          p.textContent = i - 35;
          padsRow.appendChild(p);
        }
        panel.appendChild(padsRow);

        document.body.appendChild(panel);
        const r = cfgBtn.getBoundingClientRect();
        panel.style.left = `${r.left}px`;
        panel.style.top  = `${r.bottom + 4}px`;

        if (wNode) wNode._vizPanel = panel;

        const panelRef = panel;
        const onOutside = (e) => {
          if (!panelRef.isConnected) { document.removeEventListener('mousedown', onOutside); return; }
          if (!panelRef.contains(e.target) && e.target !== cfgBtn) {
            panelRef.remove();
            if (wNode) wNode._vizPanel = null;
            panel = null;
            document.removeEventListener('mousedown', onOutside);
          }
        };
        setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
      };

      cfgBtn.addEventListener('click', openPanel);

      // Device select
      const refreshSel = (ports) => {
        const cur = sel.value;
        sel.innerHTML = '<option value="">— no device —</option>';
        ports.forEach(p => {
          const o = document.createElement('option');
          o.value = p.id; o.textContent = p.name;
          if (p.id === cur) o.selected = true;
          sel.appendChild(o);
        });
        if (ports.length === 1) { sel.value = ports[0].id; wNode?.selectPort(ports[0].id); }
      };

      if (wNode) {
        wNode.onPortsChanged = refreshSel;
        if (wNode.availablePorts.length) refreshSel(wNode.availablePorts);
        sel.addEventListener('change', () => wNode.selectPort(sel.value));

        wNode.onActivity = (act) => {
          const p = wNode._vizPanel;
          if (!act) return;

          // Dot d'activité sur la source (toujours, panel ouvert ou non)
          if (act.portName) {
            const nodeEl = this._nodeLayer.querySelector(`.editor-node[data-id="${wNode.id}"]`);
            // (pas de dot sur le node compact pour l'instant)
          }

          if (!p) return;
          if (act.type === 'cc') {
            const k = p.querySelector(`.editor-midi-knob[data-cc="${act.num}"]`);
            if (k) {
              k.querySelector('.editor-midi-knob-fill').style.height = `${act.val * 100}%`;
              k.querySelector('.editor-midi-knob-val').textContent = act.val.toFixed(2);
              k.classList.add('active');
              clearTimeout(k._t); k._t = setTimeout(() => k.classList.remove('active'), 400);
            }
            const dot = p.querySelector(`.editor-midi-src-dot[data-src="${act.portName}"]`);
            if (dot) { dot.classList.add('lit'); clearTimeout(dot._t); dot._t = setTimeout(() => dot.classList.remove('lit'), 300); }
          } else if (act.type === 'pad') {
            const padEl = p.querySelector(`.editor-midi-pad[data-note="${act.num}"]`);
            if (padEl) padEl.classList.toggle('active', act.val > 0);
            const dot = p.querySelector(`.editor-midi-src-dot[data-src="${act.portName}"]`);
            if (dot) dot.classList.toggle('lit', act.val > 0);
          }
        };
      }
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
    if (!wNode?.allParams?.length) {
      this._paramPanel.classList.add('hidden');
      return;
    }

    this._paramPanel.classList.remove('hidden');
    this._buildParamPanel(wNode);
  }

  _buildParamPanel(wNode) {
    const panel = this._paramPanel;
    panel.innerHTML = `<div class="editor-panel-title">${wNode.label}</div>`;

    // ChromaKey: color picker pour mode Color Key
    if (wNode.constructor.name === 'ChromaKeyNode') {
      const pickRow = document.createElement('div');
      pickRow.className = 'editor-panel-row';
      pickRow.style.display = wNode.getParam('mode') === 0 ? '' : 'none';
      pickRow.dataset.chromaPick = '1';
      const toHex = v => Math.round(v*255).toString(16).padStart(2,'0');
      const curR = wNode.getParam('keyR'), curG = wNode.getParam('keyG'), curB = wNode.getParam('keyB');
      pickRow.innerHTML = `
        <div class="editor-panel-param-name">key color</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <input type="color" value="#${toHex(curR)}${toHex(curG)}${toHex(curB)}"
            style="width:36px;height:24px;border:none;border-radius:3px;cursor:pointer;background:none">
          <span style="font-size:9px;color:var(--text-dim)">color key</span>
        </div>`;
      panel.appendChild(pickRow);
      pickRow.querySelector('input[type=color]').addEventListener('input', e => {
        const hex = e.target.value;
        wNode.setParam('keyR', parseInt(hex.slice(1,3),16)/255);
        wNode.setParam('keyG', parseInt(hex.slice(3,5),16)/255);
        wNode.setParam('keyB', parseInt(hex.slice(5,7),16)/255);
      });
    }

    // Bypass toggle — uniquement pour les effect/mix nodes
    const def0 = NODE_DEFS[wNode.constructor.name];
    if (def0 && ['effect','mix'].includes(def0.category)) {
      const bypassRow = document.createElement('div');
      bypassRow.className = 'editor-bypass-row';
      const isBypassed = wNode.bypassed;
      bypassRow.innerHTML = `
        <span class="editor-bypass-label">BYPASS</span>
        <button class="editor-bypass-btn ${isBypassed ? 'active' : ''}">${isBypassed ? 'ON' : 'OFF'}</button>`;
      const bypassBtn = bypassRow.querySelector('.editor-bypass-btn');

      const syncBypassUI = (state) => {
        bypassBtn.textContent = state ? 'ON' : 'OFF';
        bypassBtn.classList.toggle('active', state);
        const nodeEl = this._nodeLayer.querySelector(`.editor-node[data-id="${wNode.id}"]`);
        if (nodeEl) nodeEl.classList.toggle('bypassed', state);
      };

      bypassBtn.addEventListener('click', () => {
        wNode.bypassed = !wNode.bypassed;
        syncBypassUI(wNode.bypassed);
      });

      // Callback pour que NodeGraph puisse sync l'UI (toggle via MIDI)
      wNode._onBypassChange = syncBypassUI;

      panel.appendChild(bypassRow);
    }

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
          // MIDI activé — range custom dans le panel
          const def2 = wNode.params?.find(px => px.name === p.name);
          ctrl.innerHTML = `
            <div class="editor-panel-midi-range">
              <span class="editor-midi-range-label">min</span>
              <input type="number" class="editor-midi-range-input" data-range="min"
                value="${def2?.min ?? 0}" step="${def2?.step ?? 0.01}">
              <span class="editor-midi-range-label">max</span>
              <input type="number" class="editor-midi-range-input" data-range="max"
                value="${def2?.max ?? 1}" step="${def2?.step ?? 0.01}">
              <span class="editor-midi-live-val editor-panel-live">—</span>
            </div>`;

          const updateRange = () => {
            const minV = parseFloat(ctrl.querySelector('[data-range="min"]').value);
            const maxV = parseFloat(ctrl.querySelector('[data-range="max"]').value);
            const portName = `midi_${p.name}`;
            const edge = this.edges.find(e => e.toId === wNode.id && e.toPort === portName);
            this.graph.setEdgeRange(wNode.id, portName, edge?.fromPort ?? 'cc1', minV, maxV);
          };
          ctrl.querySelectorAll('.editor-midi-range-input').forEach(inp => {
            inp.addEventListener('change', updateRange);
          });

          // Ajouter le port sous le node
          this._addMidiPortToNode(wNode, p.name);
        }
      };

      renderControl(isMidi);

      // Checkbox toggle
      header.querySelector('.editor-panel-midi-cb').addEventListener('change', (e) => {
        wNode._midiControlled[p.name] = e.target.checked;
        if (!e.target.checked) this._removeMidiPortFromNode(wNode, p.name);
        renderControl(e.target.checked);
      });

      // Carousel spécial pour les params avec modeNames (ex: MixNode mode)
      // Carousel pour tout param qui a un getter static <paramName>Names ou modeNames
      const paramNames2 = wNode.constructor[p.name + 'Names'] ?? (p.name === 'mode' ? wNode.constructor.modeNames : null);
      const modeNames2 = paramNames2;
      if (modeNames2 && !isMidi) {
        ctrl.innerHTML = '';
        const carousel = document.createElement('div');
        carousel.className = 'editor-mode-carousel';
        let cur = Math.round(wNode.getParam('mode'));
        const render = () => {
          carousel.innerHTML = '';
          modeNames2.forEach((name, i) => {
            const item = document.createElement('div');
            item.className = 'editor-mode-item' + (i === cur ? ' active' : '');
            item.textContent = name;
            item.addEventListener('click', () => {
              cur = i;
              wNode.setParam('mode', i);
              render();
              // ChromaKey: show/hide color picker
              if (wNode.constructor.name === 'ChromaKeyNode') {
                const pickRow = panel.querySelector('[data-chroma-pick]');
                if (pickRow) pickRow.style.display = i === 0 ? '' : 'none';
              }
            });
            carousel.appendChild(item);
          });
          setTimeout(() => {
            const active = carousel.querySelector('.active');
            if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 0);
        };
        render();
        ctrl.appendChild(carousel);
      }

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
      const x = e.clientX - ar.left - ox;
      const y = e.clientY - ar.top  - oy;
      const dx = x - (this.enodes.find(n=>n.id===id)?.x ?? x);
      const dy = y - (this.enodes.find(n=>n.id===id)?.y ?? y);

      // Déplacer le node draggé
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      const en = this.enodes.find(n => n.id === id);
      if (en) { en.x = x; en.y = y; }

      // Déplacer aussi les autres nodes sélectionnés
      if (this._multiSelect.has(id)) {
        for (const sid of this._multiSelect) {
          if (sid === id) continue;
          const sen = this.enodes.find(n => n.id === sid);
          if (sen) {
            sen.x += dx; sen.y += dy;
            sen.el.style.left = `${sen.x}px`;
            sen.el.style.top  = `${sen.y}px`;
          }
        }
      }
      this._redrawEdges();
    }

    // Selection box
    if (this._selectBox) {
      this._selectBox.x1 = mx; this._selectBox.y1 = my;
      this._drawSelectBox();
      // Marquer les nodes dans la box
      const bx0 = Math.min(this._selectBox.x0, mx);
      const by0 = Math.min(this._selectBox.y0, my);
      const bx1 = Math.max(this._selectBox.x0, mx);
      const by1 = Math.max(this._selectBox.y0, my);
      this.enodes.forEach(en => {
        const inBox = en.x > bx0 && en.x < bx1 && en.y > by0 && en.y < by1;
        en.el.classList.toggle('selected', inBox);
        if (inBox) this._multiSelect.add(en.id);
        else this._multiSelect.delete(en.id);
      });
    }

    if (this._connecting) {
      this._connecting.mx = mx;
      this._connecting.my = my;
      this._redrawEdges();
    }
  }

  _onMouseUp(e) {
    if (this._dragging) { this._dragging = null; }
    if (this._selectBox) {
      this._selectBox = null;
      this._clearSelectBox();
    }

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

          // Si connexion MIDI → enregistrer le fromPort dans l'edge meta
          if (toPort.startsWith('midi_')) {
            const toNode = this.graph.nodes.find(n => n.id === toId);
            const def    = toNode?.params?.find(p => `midi_${p.name}` === toPort);
            const minV   = def?.min ?? 0;
            const maxV   = def?.max ?? 1;
            this.graph.setEdgeRange(toId, toPort, fromPort, minV, maxV);
            // Mettre à jour les range inputs si le row existe
            const row = this._nodeLayer.querySelector(`[data-param="${toPort.replace('midi_','')}"]`);
            if (row) {
              const minIn = row.querySelector('[data-range="min"]');
              const maxIn = row.querySelector('[data-range="max"]');
              if (minIn) minIn.value = minV;
              if (maxIn) maxIn.value = maxV;
            }
          }
        }
      }
      this._nodeLayer.querySelectorAll('.editor-port.active').forEach(d => d.classList.remove('active'));
      this._connecting = null;
      this._redrawEdges();
    }
  }

  // ── Graph sync ─────────────────────────────────────────────

  _applyEdgesToGraph() {
    for (const node of this.graph.nodes) {
      node.connections.clear();
      node._connectionPort?.clear();
    }
    for (const edge of this.edges) {
      const toNode   = this.graph.nodes.find(n => n.id === edge.toId);
      const fromNode = this.graph.nodes.find(n => n.id === edge.fromId);
      if (toNode && fromNode) {
        // Stocker le fromPort pour la résolution (MIDI, bypass...)
        toNode.connectPort(edge.toPort, fromNode, edge.fromPort);
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


  // ── MIDI ports dynamiques sous les nodes ──────────────────

  _addMidiPortToNode(wNode, paramName) {
    const portName = `midi_${paramName}`;
    const enode    = this.enodes.find(n => n.id === wNode.id);
    if (!enode) return;

    // Éviter les doublons
    if (enode.el.querySelector(`.editor-port[data-port="${portName}"]`)) return;

    // Ajouter au wNode dynamiquement
    if (!wNode._dynamicInputPorts) wNode._dynamicInputPorts = [];
    if (!wNode._dynamicInputPorts.includes(portName)) {
      wNode._dynamicInputPorts.push(portName);
      Object.defineProperty(wNode, 'inputPorts', {
        configurable: true,
        get() {
          const proto = Object.getPrototypeOf(this);
          const base  = Object.getOwnPropertyDescriptor(proto, 'inputPorts')?.get?.call(this) ?? [];
          return [...base, ...(this._dynamicInputPorts || [])];
        }
      });
    }

    // Créer le port DOM sous le node
    let midiSection = enode.el.querySelector('.editor-midi-ports');
    if (!midiSection) {
      midiSection = document.createElement('div');
      midiSection.className = 'editor-midi-ports';
      enode.el.appendChild(midiSection);
    }

    const row = document.createElement('div');
    row.className = 'editor-midi-port-row-node';
    row.dataset.param = paramName;
    row.innerHTML = `
      <div class="editor-port-row input">
        <div class="editor-port" data-id="${wNode.id}" data-port="${portName}" data-dir="input"></div>
        <span class="editor-port-label" style="flex:1">${paramName}</span>
        <span class="editor-midi-live-val">—</span>
      </div>`;

    // Port drag
    row.querySelector('.editor-port').addEventListener('mousedown', e => {
      e.stopPropagation();
      const ar = this._area.getBoundingClientRect();
      this._connecting = {
        fromId: wNode.id, fromPort: portName, isOutput: false,
        mx: e.clientX - ar.left, my: e.clientY - ar.top,
      };
      row.querySelector('.editor-port').classList.add('active');
    });

    midiSection.appendChild(row);
    this._redrawEdges();
  }

  _removeMidiPortFromNode(wNode, paramName) {
    const portName = `midi_${paramName}`;
    const enode    = this.enodes.find(n => n.id === wNode.id);
    if (!enode) return;

    // Retirer le DOM
    const row = enode.el.querySelector(`[data-param="${paramName}"]`);
    if (row) row.remove();

    // Retirer le port dynamique
    if (wNode._dynamicInputPorts) {
      wNode._dynamicInputPorts = wNode._dynamicInputPorts.filter(p => p !== portName);
    }

    // Retirer les edges correspondants
    this.edges = this.edges.filter(e => !(e.toId === wNode.id && e.toPort === portName));
    wNode.connections.delete(portName);
    this._redrawEdges();
  }

  // ── Insert on cable ──────────────────────────────────────────────

  _tryInsertOnCable(nodeId, cx, cy) {
    const def = NODE_DEFS[this.enodes.find(n=>n.id===nodeId)?.type];
    if (!def) return;
    const inPort  = def.inputs[0];
    const outPort = def.outputs[0];

    // Chercher un câble proche du centre du node
    for (const edge of this.edges) {
      if (edge.fromId === nodeId || edge.toId === nodeId) continue;
      const from = this._portPos(edge.fromId, edge.fromPort, true);
      const to   = this._portPos(edge.toId,   edge.toPort,   false);
      if (!from || !to) continue;

      // Distance du point cx,cy à la courbe de Bézier (approximation par segments)
      if (this._distToCable(cx, cy, from, to) < 24) {
        // Insérer le node entre from et to
        const fromNode = this.graph.nodes.find(n => n.id === edge.fromId);
        const toNode   = this.graph.nodes.find(n => n.id === edge.toId);
        const insNode  = this.graph.nodes.find(n => n.id === nodeId);
        if (!fromNode || !toNode || !insNode) return;

        // Supprimer l'edge existant
        this.edges = this.edges.filter(e => e !== edge);

        // Ajouter les deux nouveaux edges
        this.edges.push({ fromId: edge.fromId, fromPort: edge.fromPort, toId: nodeId, toPort: inPort });
        this.edges.push({ fromId: nodeId, fromPort: outPort, toId: edge.toId, toPort: edge.toPort });
        this._applyEdgesToGraph();
        this._redrawEdges();

        // Flash visuel
        const en = this.enodes.find(n => n.id === nodeId);
        if (en) {
          en.el.classList.add('insert-flash');
          setTimeout(() => en.el.classList.remove('insert-flash'), 400);
        }
        return;
      }
    }
  }

  _distToCable(px, py, from, to) {
    // Approximation par 8 segments de la courbe de Bézier
    const dx = Math.abs(to.x - from.x) * 0.5;
    let minD = Infinity;
    let prev = from;
    for (let i = 1; i <= 8; i++) {
      const t  = i / 8;
      const mt = 1 - t;
      const x = mt*mt*mt*from.x + 3*mt*mt*t*(from.x+dx) + 3*mt*t*t*(to.x-dx) + t*t*t*to.x;
      const y = mt*mt*mt*from.y + 3*mt*mt*t*from.y       + 3*mt*t*t*to.y       + t*t*t*to.y;
      // Distance du point px,py au segment prev→(x,y)
      const d = this._distToSegment(px, py, prev.x, prev.y, x, y);
      if (d < minD) minD = d;
      prev = { x, y };
    }
    return minD;
  }

  _distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx-ax, dy = by-ay;
    const t  = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / (dx*dx+dy*dy+0.001)));
    return Math.hypot(px - (ax+t*dx), py - (ay+t*dy));
  }

  // ── Selection box ─────────────────────────────────────────────

  _drawSelectBox() {
    let box = this._nodeLayer.querySelector('.editor-select-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'editor-select-box';
      this._nodeLayer.appendChild(box);
    }
    const { x0, y0, x1, y1 } = this._selectBox;
    box.style.cssText = `
      left:${Math.min(x0,x1)}px; top:${Math.min(y0,y1)}px;
      width:${Math.abs(x1-x0)}px; height:${Math.abs(y1-y0)}px;`;
  }

  _clearSelectBox() {
    this._nodeLayer.querySelector('.editor-select-box')?.remove();
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
