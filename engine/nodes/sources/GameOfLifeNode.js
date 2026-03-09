import { Node } from '../Node.js';
import { createProgram } from '../../gl/createProgram.js';
import { createFBO, resizeFBO } from '../../gl/createFBO.js';

/**
 * GameOfLifeNode
 * Source procédurale — Jeu de la Vie de Conway simulé sur GPU.
 * Utilise un ping-pong FBO : deux textures alternées à chaque frame.
 *
 * TODO: implémenter la simulation GLSL
 */
export class GameOfLifeNode extends Node {
  // stub — à implémenter
  render(_input) { return null; }
}
