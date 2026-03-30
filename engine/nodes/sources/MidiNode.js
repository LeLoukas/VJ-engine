import { Node } from '../Node.js';

/**
 * MidiNode
 * Expose uniquement les ports activés par l'utilisateur.
 * Distingue pads (canal 10 par défaut) et notes piano (autres canaux).
 *
 * Sources disponibles :
 *   K1…K8   → CC1…CC8
 *   Pad1…16 → Note 36…51, canal 10
 *   Note    → toutes les notes, canaux autres que 10
 */
export class MidiNode extends Node {
  constructor() {
    super();
    this.label        = 'MIDI';
    this._access      = null;
    this._activeInput = null;
    this._portId      = null;
    this.channels     = new Set();     // vide = omni
    this.padChannel   = 10;            // canal des pads MPK Mini

    // Valeurs brutes 0→1
    this._cc   = new Float32Array(128).fill(0);
    this._note = new Float32Array(128).fill(0);  // notes piano
    this._pad  = new Float32Array(128).fill(0);  // pads

    // Ports activés par l'utilisateur : Set de noms ('K1', 'Pad1', 'note60'...)
    this.activeSources = new Set(['K1']);

    this.availablePorts = [];
    this.error          = null;
    this.started        = false;

    this.onPortsChanged = null;
    this.onActivity     = null;
  }

  get inputPorts()  { return []; }

  // Ports de sortie = les noms des sources (K1, Pad1...)
  get outputPorts() {
    return [...this.activeSources];
  }

  // Le nom du port = le nom de la source (K1, Pad1, etc.)
  _sourceToPort(source) { return source; }

  getPortValue(portName) {
    if (portName.startsWith('K')) {
      const ccNum = parseInt(portName.slice(1));
      return this._cc[ccNum] ?? 0;
    }
    if (portName.startsWith('Pad')) {
      const noteNum = 35 + parseInt(portName.slice(3));
      return this._pad[noteNum] ?? 0;
    }
    if (portName.startsWith('note')) return this._note[parseInt(portName.slice(4))] ?? 0;
    return 0;
  }

  // Liste de toutes les sources disponibles pour le sélecteur UI
  static get availableSources() {
    const knobs = Array.from({length: 8}, (_, i) => `K${i+1}`);
    const pads  = Array.from({length: 16},(_, i) => `Pad${i+1}`);
    return [...knobs, ...pads];
  }

  init(renderer) {
    super.init(renderer);
    this._start();
  }

  async _start() {
    if (!navigator.requestMIDIAccess) { this.error = 'Web MIDI not supported'; return; }
    try {
      this._access = await navigator.requestMIDIAccess({ sysex: false });
      this.started = true;
      this._refreshPorts();
      this._access.onstatechange = () => this._refreshPorts();
    } catch(e) { this.error = e.message; }
  }

  _refreshPorts() {
    this.availablePorts = [];
    for (const [id, input] of this._access.inputs) {
      this.availablePorts.push({ id, name: input.name });
    }
    if (this.availablePorts.length === 1 && !this._portId) {
      this.selectPort(this.availablePorts[0].id);
    }
    if (this.onPortsChanged) this.onPortsChanged(this.availablePorts);
  }

  selectPort(id) {
    if (this._activeInput) this._activeInput.onmidimessage = null;
    this._portId      = id;
    this._activeInput = this._access?.inputs.get(id) ?? null;
    if (this._activeInput) this._activeInput.onmidimessage = e => this._onMessage(e);
  }

  _onMessage(msg) {
    const [status, d1, d2] = msg.data;
    const type    = status & 0xF0;
    const channel = (status & 0x0F) + 1;

    // Filtre canal global
    if (this.channels.size > 0 && !this.channels.has(channel)) return;

    let activity = null;
    const isPadChannel = channel === this.padChannel;

    if (type === 0xB0) {
      // Control Change → knobs K1…K8
      this._cc[d1] = d2 / 127;
      activity = { type: 'cc', num: d1, val: this._cc[d1], channel, portName: `K${d1}` };
    } else if (type === 0x90 && d2 > 0) {
      if (isPadChannel) {
        this._pad[d1] = d2 / 127;
        const padNum = d1 - 35;  // Pad1=36→1, Pad16=51→16
        activity = { type: 'pad', num: d1, val: this._pad[d1], channel, portName: `Pad${padNum}` };
      } else {
        this._note[d1] = d2 / 127;
        activity = { type: 'note', num: d1, val: this._note[d1], channel, portName: `note${d1}` };
      }
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      if (isPadChannel) {
        this._pad[d1] = 0;
        const padNum = d1 - 35;
        activity = { type: 'pad', num: d1, val: 0, channel, portName: `Pad${padNum}` };
      } else {
        this._note[d1] = 0;
        activity = { type: 'note', num: d1, val: 0, channel, portName: `note${d1}` };
      }
    }

    if (activity) {
      this.lastActivity = activity;
      if (this.onActivity) this.onActivity(activity);
    }
  }

  render() { return null; }
}
