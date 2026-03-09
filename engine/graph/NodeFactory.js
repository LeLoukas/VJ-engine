import { ShaderSourceNode } from '../nodes/sources/ShaderSourceNode.js';
import { GameOfLifeNode }   from '../nodes/sources/GameOfLifeNode.js';
import { WebcamNode }       from '../nodes/sources/WebcamNode.js';
import { MediaNode }        from '../nodes/sources/MediaNode.js';
import { GlitchNode }       from '../nodes/effects/GlitchNode.js';
import { AudioGlitchNode }  from '../nodes/effects/AudioGlitchNode.js';
import { FeedbackNode }     from '../nodes/effects/FeedbackNode.js';
import { BlurNode }         from '../nodes/effects/BlurNode.js';
import { MixNode }          from '../nodes/effects/MixNode.js';
import { OutputNode }       from '../nodes/OutputNode.js';

const REGISTRY = {
  ShaderSourceNode,
  GameOfLifeNode,
  WebcamNode,
  MediaNode,
  GlitchNode,
  AudioGlitchNode,
  FeedbackNode,
  BlurNode,
  MixNode,
  OutputNode,
};

/**
 * NodeFactory
 * Instancie un Node depuis son nom de classe (string).
 * Utilisé par le BroadcastChannel pour reconstruire le graphe
 * depuis la sérialisation envoyée par l'éditeur.
 */
export class NodeFactory {
  static create(type) {
    const Ctor = REGISTRY[type];
    if (!Ctor) throw new Error(`NodeFactory: unknown type "${type}"`);
    return new Ctor();
  }

  static types() {
    return Object.keys(REGISTRY);
  }

  // Instance method — délègue au static pour compatibilité
  create(type) {
    return NodeFactory.create(type);
  }
}
