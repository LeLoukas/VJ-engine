import { Node } from '../Node.js';

/**
 * MidiNode
 * Écoute les messages MIDI CC via Web MIDI API.
 * Expose 16 ports de sortie cc0…cc15, valeurs normalisées 0→1.
 *
 * Ces ports ne transportent PAS de texture — ils transportent des valeurs
 * scalaires. Le NodeGraph les résout différemment : via getInputValue()
 * plutôt que getInputTexture().
 *
 * Usage dans un node param :
 *   const val = this.getInputValue('myParam') ?? this.getParam('myParam');
 */
export class MidiNode extends Node {
  constructor() {
    super();
    this.label   = 'MIDI';
    this._cc     = new Float32Array(128).fill(0); // 128 CC, 0→1
    this._access = null;
    this._error  = null;
    this._active = false;
    this._device = null; // nom du device actif
  }

  get inputPorts()  { return []; }
  get outputPorts() {
    // CC 0→15 exposés comme ports
    return Array.from({ length: 16 }, (_, i) => `cc${i}`);
  }

  /** Retourne la valeur d'un CC par son numéro (0→1) */
  getCCValue(ccNum) { return this._cc[ccNum] ?? 0; }

  /** Retourne la valeur du port (ex: 'cc7' → _cc[7]) */
  getPortValue(portName) {
    const n = parseInt(portName.replace('cc', ''), 10);
    return isNaN(n) ? 0 : this._cc[n];
  }

  init(renderer) {
    super.init(renderer);
    this._start();
  }

  async _start() {
    if (!navigator.requestMIDIAccess) {
      this._error = 'Web MIDI not supported';
      return;
    }
    try {
      this._access = await navigator.requestMIDIAccess({ sysex: false });
      this._active = true;
      this._bindInputs();
      this._access.onstatechange = () => this._bindInputs();
    } catch(e) {
      this._error = e.message;
      console.warn('MidiNode:', e.message);
    }
  }

  _bindInputs() {
    for (const input of this._access.inputs.values()) {
      input.onmidimessage = (msg) => this._onMessage(msg, input.name);
    }
    const inputs = [...this._access.inputs.values()];
    this._device = inputs.length ? inputs[0].name : null;
  }

  _onMessage(msg, deviceName) {
    const [status, cc, value] = msg.data;
    // 0xB0 = Control Change (channel 1), 0xB1…0xBF = autres canaux
    if ((status & 0xF0) === 0xB0) {
      this._cc[cc] = value / 127;
    }
  }

  render() { return null; } // pas de texture, valeurs seulement
}
