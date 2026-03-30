import { Node } from '../Node.js';

/**
 * LFONode — Low Frequency Oscillator
 * Génère un signal 0→1 périodique utilisable comme source de param.
 *
 * Modes : sawtooth, triangle, sine
 * Speed : en BPM ou Hz
 * Phase : décalage 0→1
 */
export class LFONode extends Node {
  constructor() {
    super();
    this.label  = 'LFO';
    this._phase = 0;
    this._value = 0;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['value']; }

  get params() { return [
    { name: 'mode',  type: 'int',   min: 0, max: 2,    value: 0 },
    { name: 'bpm',   type: 'float', min: 1, max: 600,  value: 60,  step: 1   },
    { name: 'phase', type: 'float', min: 0, max: 1,    value: 0,   step: 0.01 },
    { name: 'min',   type: 'float', min: 0, max: 1,    value: 0,   step: 0.01 },
    { name: 'max',   type: 'float', min: 0, max: 1,    value: 1,   step: 0.01 },
  ]; }

  static get modeNames() { return ['Sawtooth', 'Triangle', 'Sine']; }

  getPortValue(portName) {
    if (portName === 'value') return this._value;
    return 0;
  }

  render() {
    const dt    = 1 / 60;
    const bpm   = this.getParam('bpm');
    const phase = this.getParam('phase');
    const lo    = this.getParam('min');
    const hi    = this.getParam('max');
    const mode  = this.getParam('mode');

    const freq  = bpm / 60;
    this._phase = (this._phase + dt * freq) % 1;

    const p = (this._phase + phase) % 1;

    let raw;
    if (mode === 0) {
      // Sawtooth : 0→1
      raw = p;
    } else if (mode === 1) {
      // Triangle : 0→1→0
      raw = p < 0.5 ? p * 2 : (1 - p) * 2;
    } else {
      // Sine : 0→1→0 (demi-période positive)
      raw = (Math.sin(p * Math.PI * 2) + 1) * 0.5;
    }

    this._value = lo + raw * (hi - lo);
    return null;
  }
}
