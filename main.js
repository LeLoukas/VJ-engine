import { Renderer }      from './engine/Renderer.js';
import { NodeGraph }     from './engine/graph/NodeGraph.js';
import { NodeFactory }   from './engine/graph/NodeFactory.js';
import { Editor }        from './editor/Editor.js';

// ── WebGL + Audio ─────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new Renderer(canvas);
const graph    = new NodeGraph();
const factory  = new NodeFactory();
renderer.setGraph(graph);

// ── Editor ────────────────────────────────────────────────────
const editor = new Editor({
  container: document.getElementById('editor-overlay'),
  graph,
  factory,
});

// ── Default graph ─────────────────────────────────────────────
const src    = factory.create('ShaderSourceNode');
const glitch = factory.create('GlitchNode');
const output = factory.create('OutputNode');

graph.addNode(src);
graph.addNode(glitch);
graph.addNode(output);
glitch.connect('input', src);
output.connect('input', glitch);
editor.syncFromGraph();

// ── Feedback toggle (Enter) ───────────────────────────────────
// Insère/retire un FeedbackNode entre le dernier effect et l'OutputNode.
// Fonctionne sur le graphe actif au moment de l'appui.
let feedbackNode = null;

function toggleFeedback() {
  if (feedbackNode) {
    // Retirer : reconnecter les voisins en court-circuit
    const prev = _getPredecessor(output, 'input');
    const prevPrev = prev ? _getPredecessor(prev, 'input') : null;

    graph.removeNode(feedbackNode);
    editor.removeENode(feedbackNode.id);

    if (prevPrev) {
      output.connections.set('input', prevPrev);
      editor.rebuildEdgesFromGraph();
    }
    feedbackNode = null;
  } else {
    // Insérer avant l'OutputNode
    const before = _getPredecessor(output, 'input');
    if (!before) return;

    feedbackNode = factory.create('FeedbackNode');
    graph.addNode(feedbackNode);
    feedbackNode.connect('input', before);
    output.connections.set('input', feedbackNode);
    editor.addENodeForExisting(feedbackNode, 'FeedbackNode');
    editor.rebuildEdgesFromGraph();
  }
}

function _getPredecessor(node, port) {
  return node.connections.get(port) ?? null;
}

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target !== document.body) return;
  if (e.code === 'Space') {
    e.preventDefault();
    editor.toggle();
  }
  if (e.code === 'Enter') {
    e.preventDefault();
    toggleFeedback();
  }
});

// ── Audio button ──────────────────────────────────────────────
const audioBtn = document.getElementById('audio-btn');
if (audioBtn) {
  audioBtn.addEventListener('click', async () => {
    await renderer.startAudio();
    audioBtn.textContent = renderer.audio.error ? 'MIC ✗' : 'MIC ✓';
    audioBtn.classList.toggle('active', !renderer.audio.error);
  });
}

// ── Render loop ───────────────────────────────────────────────
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  renderer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
