import { Node } from '../Node.js';

/**
 * ConstantNode
 * Émet une valeur scalaire constante 0→1 sur son port de sortie.
 * Utile pour brancher une valeur fixe sur un param sans MIDI.
 * Ne produit pas de texture — port de sortie "value" (scalaire).
 */
export class ConstantNode extends Node {
  constructor() {
    super();
    this.label = 'Constant';
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['value']; }

  get params() { return [
    { name: 'value', type: 'float', min: 0, max: 1, value: 0.5, step: 0.001 },
  ]; }

  getPortValue(portName) {
    if (portName === 'value') return this.getParam('value');
    return 0;
  }

  render() { return null; }
}
