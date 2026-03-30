import { Node } from '../Node.js';

/**
 * AudioNode
 * Expose les valeurs audio comme ports scalaires.
 * - bass, mid, treble, amplitude : depuis l'AudioAnalyser du Renderer
 * - beat : détection de kick avec envelope
 * - tap : BPM tap tempo (pulse périodique sans micro)
 *
 * Chaque valeur a un envelope attack/release configurable.
 * Ports de sortie : bass, mid, treble, amplitude, beat, tap
 */
export class AudioNode extends Node {
  constructor() {
    super();
    this.label = 'Audio';

    // Envelopes par port { current, target }
    this._env = {
      bass:      { val: 0 },
      mid:       { val: 0 },
      treble:    { val: 0 },
      amplitude: { val: 0 },
      beat:      { val: 0 },
    };

    // Tap tempo
    this._tapBPM      = 120;
    this._tapTimes    = [];
    this._tapPhase    = 0;
    this._tapLastTime = null;
    this._tapVal      = 0;
  }

  get inputPorts()  { return []; }
  get outputPorts() { return ['bass', 'mid', 'treble', 'amplitude', 'beat', 'tap']; }

  get params() { return [
    { name: 'attack',  type: 'float', min: 0.001, max: 1,   value: 0.01, step: 0.001 },
    { name: 'release', type: 'float', min: 0.001, max: 2,   value: 0.15, step: 0.001 },
    { name: 'tapBPM',  type: 'float', min: 20,    max: 300, value: 120,  step: 1     },
    { name: 'tapDuty', type: 'float', min: 0.01,  max: 0.99, value: 0.1, step: 0.01  },
  ]; }

  getPortValue(portName) {
    if (portName === 'tap') return this._tapVal;
    return this._env[portName]?.val ?? 0;
  }

  /** Tap tempo — appelé depuis l'UI quand on appuie sur le bouton */
  tap() {
    const now = performance.now() / 1000;
    this._tapTimes.push(now);
    // Garder les 8 derniers taps
    if (this._tapTimes.length > 8) this._tapTimes.shift();
    if (this._tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < this._tapTimes.length; i++) {
        intervals.push(this._tapTimes[i] - this._tapTimes[i-1]);
      }
      const avg = intervals.reduce((a,b) => a+b, 0) / intervals.length;
      this._tapBPM = Math.round(60 / avg);
      // Sync le param
      this.setParam('tapBPM', this._tapBPM);
    }
    // Reset phase sur le tap
    this._tapPhase    = 0;
    this._tapLastTime = now;
  }

  render() {
    const audio  = this.renderer?.audio;
    const dt     = 1 / 60;
    const attack  = this.getParam('attack');
    const release = this.getParam('release');

    // Enveloppes audio
    if (audio?.started) {
      const targets = {
        bass:      audio.bass,
        mid:       audio.mid,
        treble:    audio.treble,
        amplitude: audio.amplitude,
        beat:      audio.beat,
      };
      for (const [key, target] of Object.entries(targets)) {
        const env = this._env[key];
        if (target > env.val) {
          // Attack
          env.val += (target - env.val) * Math.min(1, dt / attack);
        } else {
          // Release
          env.val += (target - env.val) * Math.min(1, dt / release);
        }
      }
    }

    // Tap tempo pulse
    const tapBPM  = this.getParam('tapBPM');
    const duty    = this.getParam('tapDuty');
    const period  = 60 / tapBPM;
    this._tapPhase = (this._tapPhase + dt / period) % 1;
    this._tapVal   = this._tapPhase < duty ? 1 : 0;

    return null;
  }
}
