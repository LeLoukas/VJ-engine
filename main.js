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
editor.initDebug(renderer);
editor.initSaveLoad(factory);

// ── Feedback toggle (Enter) ────────────────────────────────────
let feedbackNode = null;

function toggleFeedback() {
  if (feedbackNode) {
    const before = feedbackNode.connections.get('input');
    graph.removeNode(feedbackNode);
    editor.removeENode(feedbackNode.id);
    if (before) {
      output.connectPort('input', before, 'output');
      editor.rebuildEdgesFromGraph();
    }
    feedbackNode = null;
  } else {
    const before = output.connections.get('input');
    if (!before) return;
    feedbackNode = factory.create('FeedbackNode');
    graph.addNode(feedbackNode);
    feedbackNode.connectPort('input', before, 'output');
    output.connectPort('input', feedbackNode, 'output');
    editor.addENodeForExisting(feedbackNode, 'FeedbackNode');
    editor.rebuildEdgesFromGraph();
  }
}

// ── Keyboard ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target !== document.body) return;
  if (e.code === 'Space') { e.preventDefault(); editor.toggle(); }
  if (e.code === 'Enter') { e.preventDefault(); toggleFeedback(); }
});

// ── Audio button ──────────────────────────────────────────────
const audioBtn = document.getElementById('audio-btn');
if (audioBtn) {
  audioBtn.addEventListener('click', async () => {
    await renderer.startAudio();
    const ok = renderer.audio.started && !renderer.audio.error;
    audioBtn.textContent = ok ? 'MIC ON' : 'MIC ERR';
    audioBtn.classList.toggle('active', ok);
  });
}

// ── FPS display ───────────────────────────────────────────────
const fpsEl = document.getElementById('fps-display');

// ── Render loop ───────────────────────────────────────────────
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  renderer.render(dt);
  if (fpsEl && renderer.fps !== undefined) {
    fpsEl.textContent = renderer.fps + ' fps';
    fpsEl.className = 'fps-display ' +
      (renderer.fps >= 55 ? 'good' : renderer.fps >= 30 ? 'warn' : 'bad');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/*
 * ── DUAL SCREEN OUTPUT — NON IMPLÉMENTÉ ──────────────────────
 *
 * Objectif : afficher le rendu sur un second écran (projecteur)
 * sans perte de FPS sur l'écran principal (éditeur).
 *
 * Approches testées et pourquoi elles échouent :
 *
 *   1. BroadcastChannel + toBlob/createImageBitmap
 *      → readback GPU→CPU à chaque frame, très lent (<5fps)
 *
 *   2. captureStream(canvas) + <video> dans output.html
 *      → encode interne par le navigateur (VP8/VP9), lent sur Firefox
 *      → Chrome meilleur mais toujours < 30fps en pratique
 *
 *   3. window.opener + drawImage(srcCanvas)
 *      → ctx.drawImage sur un canvas WebGL force un readback GPU
 *
 *   4. Contextes WebGL partagés
 *      → impossible : les objets GPU (textures) appartiennent à
 *        leur contexte, ne peuvent pas être lus depuis un autre
 *
 *   5. requestFullscreen({ screen: target }) via Window Management API
 *      → met TOUTE la fenêtre en fullscreen, perd l'éditeur sur
 *        l'écran principal. Il faudrait ouvrir output.html positionné
 *        sur le second écran mais captureStream reste le goulot
 *
 * Solution correcte à implémenter :
 *   Utiliser un OffscreenCanvas dans un Worker pour le rendu.
 *   Le Worker peut partager son OffscreenCanvas via MessageChannel
 *   avec output.html. Zero copie CPU car l'OffscreenCanvas reste
 *   dans le Worker, seul le handle est transféré.
 *   Nécessite de refactorer Renderer.js pour tourner dans un Worker
 *   (transferControlToOffscreen + tout le code WebGL dans le Worker).
 *   Ref: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
 */
