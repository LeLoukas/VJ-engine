import { Node } from './Node.js';

/**
 * RerouteNode
 * Node transparent — passe la texture sans modification.
 * Utile pour organiser les cables dans le graphe.
 * Existe en deux variantes : RerouteIn et RerouteOut
 * mais c'est le même node, juste utilisé différemment.
 */
export class RerouteNode extends Node {
  constructor() {
    super();
    this.label = '•';
  }

  get inputPorts()  { return ['input']; }
  get outputPorts() { return ['output']; }

  render() {
    return this.getInputTexture('input');
  }
}
