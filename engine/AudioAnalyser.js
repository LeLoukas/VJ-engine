/**
 * AudioAnalyser
 * Capture le micro via getUserMedia + Web Audio API.
 * Calcule chaque frame : FFT, bass, mid, treble, amplitude, beat.
 * Expose une texture WebGL 1D (256x1) pour u_fft.
 *
 * Usage :
 *   const audio = new AudioAnalyser(gl);
 *   await audio.start();
 *   // dans setGlobalUniforms :
 *   audio.bindUniforms(gl, program, textureUnit);
 */
export class AudioAnalyser {
  constructor(gl) {
    this.gl        = gl;
    this.started   = false;
    this.error     = null;

    // Données FFT (256 bins)
    this.fftSize   = 512;   // bins = fftSize / 2 = 256
    this.fftData   = new Uint8Array(256);

    // Uniforms calculés
    this.bass      = 0;
    this.mid       = 0;
    this.treble    = 0;
    this.amplitude = 0;
    this.beat      = 0;

    // Beat detection
    this._beatHistory   = new Float32Array(43);  // ~1s à 60fps / 1.4
    this._beatIdx       = 0;
    this._beatCooldown  = 0;

    // Web Audio
    this._ctx      = null;
    this._analyser = null;

    // Texture FFT 256x1 LUMINANCE
    this._fftTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._fftTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0,
                  gl.RED, gl.UNSIGNED_BYTE, this.fftData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // ── Start ───────────────────────────────────────────────

  async start() {
    try {
      const stream  = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this._ctx     = new AudioContext();
      const source  = this._ctx.createMediaStreamSource(stream);
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize            = this.fftSize;
      this._analyser.smoothingTimeConstant = 0.8;
      source.connect(this._analyser);
      this.started = true;
    } catch(e) {
      this.error = e.message;
      console.warn('AudioAnalyser: mic unavailable —', e.message);
    }
  }

  // ── Update (appelé chaque frame avant setGlobalUniforms) ──

  update() {
    if (!this.started) return;

    this._analyser.getByteFrequencyData(this.fftData);

    // Upload texture FFT
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this._fftTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1,
                     gl.RED, gl.UNSIGNED_BYTE, this.fftData);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Bandes fréquentielles (bins normalisés 0→1)
    // 256 bins, Nyquist ≈ 22050 Hz → ~86 Hz/bin
    // bass  :  0–3   (~0–260 Hz)
    // mid   :  4–40  (~340–3400 Hz)
    // treble: 41–128 (~3500–11000 Hz)
    this.bass      = this._avg(0,  3)  / 255;
    this.mid       = this._avg(4,  40) / 255;
    this.treble    = this._avg(41, 128)/ 255;
    this.amplitude = this._avg(0,  255)/ 255;

    // Beat detection — énergie bass vs moyenne historique
    const energy = this.bass;
    this._beatHistory[this._beatIdx % this._beatHistory.length] = energy;
    this._beatIdx++;
    const avg = this._beatHistory.reduce((a, b) => a + b, 0) / this._beatHistory.length;

    if (this._beatCooldown > 0) {
      this._beatCooldown--;
      this.beat *= 0.85;  // decay rapide
    } else if (energy > avg * 1.4 && energy > 0.15) {
      this.beat = 1.0;
      this._beatCooldown = 12;  // ~200ms à 60fps
    } else {
      this.beat *= 0.92;
    }
  }

  _avg(from, to) {
    let sum = 0;
    for (let i = from; i <= to; i++) sum += this.fftData[i];
    return sum / (to - from + 1);
  }

  // ── Bind uniforms dans un program ───────────────────────

  /**
   * @param {WebGL2RenderingContext} gl
   * @param {WebGLProgram} program  — doit être bindé (useProgram) avant l'appel
   * @param {number} textureUnit   — unité texture à utiliser pour u_fft (ex: 7)
   */
  bindUniforms(gl, program, textureUnit = 7) {
    const u = (name) => gl.getUniformLocation(program, name);

    const lBass  = u('u_bass');      if (lBass)      gl.uniform1f(lBass,      this.bass);
    const lMid   = u('u_mid');       if (lMid)       gl.uniform1f(lMid,       this.mid);
    const lTre   = u('u_treble');    if (lTre)       gl.uniform1f(lTre,       this.treble);
    const lAmp   = u('u_amplitude'); if (lAmp)       gl.uniform1f(lAmp,       this.amplitude);
    const lBeat  = u('u_beat');      if (lBeat)      gl.uniform1f(lBeat,      this.beat);

    const lFft   = u('u_fft');
    if (lFft) {
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this._fftTexture);
      gl.uniform1i(lFft, textureUnit);
    }
  }
}
