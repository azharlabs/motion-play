(function () { /* de-moduled */
'use strict';
/**
 * Web Audio API sound system for arcade games.
 * All sounds are synthesized procedurally — no audio file dependencies.
 * ES Module — default export is the AudioManager class.
 */

const MAX_CONCURRENT = 16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

/** Create a stereo panner (falls back to gain if unsupported). */
function createPanner(ctx, value) {
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(value, -1, 1);
    return p;
  }
  return ctx.createGain(); // silent fallback
}

/** Generate a buffer of white noise (1 s, mono). */
function noiseBuffer(ctx) {
  if (ctx._noiseBuffer) return ctx._noiseBuffer;
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  ctx._noiseBuffer = buf;
  return buf;
}

/** Quick envelope helper — sets a value then ramps linearly. */
function env(param, pairs, t0) {
  // pairs: [[value, time], …]  time is relative offset from t0
  param.cancelScheduledValues(t0);
  for (let i = 0; i < pairs.length; i++) {
    const [val, dt] = pairs[i];
    if (i === 0) {
      param.setValueAtTime(val, t0 + dt);
    } else {
      param.linearRampToValueAtTime(val, t0 + dt);
    }
  }
}

// ---------------------------------------------------------------------------
// Sound preset definitions
// Each returns { duration } and wires nodes into `dest`.
// ---------------------------------------------------------------------------

const presets = {
  /** Short rising two-tone blip. */
  coin(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(987, t);
    o.frequency.setValueAtTime(1319, t + 0.06);
    env(g.gain, [[vol * 0.35, 0], [vol * 0.35, 0.06], [0, 0.12]], t);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.12);
    return { duration: 0.12, nodes: [o, g] };
  },

  /** White noise burst with pitch envelope. */
  shoot(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(5000, t);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    bp.Q.value = 1.5;
    env(g.gain, [[vol * 0.5, 0], [0, 0.1]], t);
    src.connect(bp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.1);
    return { duration: 0.1, nodes: [src, bp, g] };
  },

  /** Low rumble noise with decay. */
  explosion(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(50, t + 0.6);
    env(g.gain, [[vol * 0.7, 0], [vol * 0.5, 0.05], [0, 0.6]], t);
    src.connect(lp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.6);
    return { duration: 0.6, nodes: [src, lp, g] };
  },

  /** Short mid-frequency impact. */
  hit(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.12);
    env(g.gain, [[vol * 0.5, 0], [0, 0.12]], t);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const ng = ctx.createGain();
    env(ng.gain, [[vol * 0.3, 0], [0, 0.08]], t);
    o.connect(g).connect(dest);
    src.connect(ng).connect(dest);
    o.start(t);
    o.stop(t + 0.12);
    src.start(t);
    src.stop(t + 0.12);
    return { duration: 0.12, nodes: [o, g, src, ng] };
  },

  /** Ascending arpeggio. */
  powerup(ctx, dest, t, vol) {
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    const step = 0.07;
    const dur = notes.length * step + 0.12;
    const nodes = [];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      const on = t + i * step;
      env(g.gain, [[0, 0], [vol * 0.25, 0.01], [0, step + 0.05]], on);
      o.connect(g).connect(dest);
      o.start(on);
      o.stop(on + step + 0.05);
      nodes.push(o, g);
    });
    return { duration: dur, nodes };
  },

  /** Descending pitch sweep. */
  die(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(800, t);
    o.frequency.exponentialRampToValueAtTime(100, t + 0.5);
    env(g.gain, [[vol * 0.4, 0], [vol * 0.3, 0.1], [0, 0.5]], t);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.5);
    return { duration: 0.5, nodes: [o, g] };
  },

  /** Quick pitch rise. */
  jump(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(250, t);
    o.frequency.exponentialRampToValueAtTime(800, t + 0.12);
    env(g.gain, [[vol * 0.3, 0], [vol * 0.25, 0.06], [0, 0.15]], t);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.15);
    return { duration: 0.15, nodes: [o, g] };
  },

  /** Soft click. */
  select(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 1200;
    env(g.gain, [[vol * 0.2, 0], [0, 0.04]], t);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.04);
    return { duration: 0.04, nodes: [o, g] };
  },

  /** Fanfare-like short sequence. */
  start(ctx, dest, t, vol) {
    const seq = [
      [523, 0, 0.1],   // C5
      [659, 0.1, 0.1],  // E5
      [784, 0.2, 0.15], // G5
      [1047, 0.38, 0.2] // C6
    ];
    const dur = 0.6;
    const nodes = [];
    seq.forEach(([freq, offset, len]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      const on = t + offset;
      env(g.gain, [[0, 0], [vol * 0.25, 0.01], [vol * 0.2, len - 0.03], [0, len]], on);
      o.connect(g).connect(dest);
      o.start(on);
      o.stop(on + len + 0.01);
      nodes.push(o, g);
    });
    return { duration: dur, nodes };
  },

  /** Pleasant ascending tone. */
  score(ctx, dest, t, vol) {
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.15);
    env(g.gain, [[vol * 0.3, 0], [vol * 0.25, 0.05], [0, 0.2]], t);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.2);
    return { duration: 0.2, nodes: [o, g] };
  },
};

// ---------------------------------------------------------------------------
// Music generator
// ---------------------------------------------------------------------------

class ProceduralMusic {
  constructor(ctx, dest) {
    this._ctx = ctx;
    this._dest = dest;
    this._nodes = [];
    this._timers = [];
    this._playing = false;
    this._paused = false;
    this._gainNode = ctx.createGain();
    this._gainNode.connect(dest);
  }

  get playing() {
    return this._playing;
  }

  get paused() {
    return this._paused;
  }

  /**
   * Generate a simple bass + lead loop.
   * @param {number} bpm — beats per minute (default 120)
   * @param {string} key — root note name, e.g. 'C', 'A' (default 'C')
   */
  createBasicBeat(bpm = 120, key = 'C') {
    this.stop();

    const rootFreqs = {
      C: 130.81, D: 146.83, E: 164.81, F: 174.61,
      G: 196.00, A: 220.00, B: 246.94,
    };
    const root = rootFreqs[key.toUpperCase()] || rootFreqs.C;

    // Simple minor-pentatonic scale ratios
    const scale = [1, 1.1892, 1.3348, 1.4983, 1.7818]; // approx m-pent
    const beatSec = 60 / bpm;
    const ctx = this._ctx;
    const dest = this._gainNode;

    this._playing = true;
    this._paused = false;

    let step = 0;

    const schedule = () => {
      if (!this._playing || this._paused) return;

      const now = ctx.currentTime + 0.05; // slight lookahead

      // Bass — root note on every beat, octave shift every 4
      const bassFreq = step % 8 < 4 ? root : root * 1.3348;
      const bo = ctx.createOscillator();
      const bg = ctx.createGain();
      bo.type = 'triangle';
      bo.frequency.value = bassFreq;
      env(bg.gain, [[0.18, 0], [0.12, beatSec * 0.3], [0, beatSec * 0.9]], now);
      bo.connect(bg).connect(dest);
      bo.start(now);
      bo.stop(now + beatSec);
      this._nodes.push(bo, bg);

      // Lead — pick from scale, simple pattern
      if (step % 2 === 0) {
        const idx = (step / 2) % scale.length;
        const leadFreq = root * 2 * scale[idx];
        const lo = ctx.createOscillator();
        const lg = ctx.createGain();
        lo.type = 'square';
        lo.frequency.value = leadFreq;
        env(lg.gain, [[0.08, 0], [0.06, beatSec * 0.2], [0, beatSec * 0.5]], now);
        lo.connect(lg).connect(dest);
        lo.start(now);
        lo.stop(now + beatSec * 0.5);
        this._nodes.push(lo, lg);
      }

      // Hi-hat noise on off-beats
      if (step % 2 === 1) {
        const ns = ctx.createBufferSource();
        ns.buffer = noiseBuffer(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 8000;
        const ng = ctx.createGain();
        env(ng.gain, [[0.06, 0], [0, beatSec * 0.1]], now);
        ns.connect(hp).connect(ng).connect(dest);
        ns.start(now);
        ns.stop(now + beatSec * 0.15);
        this._nodes.push(ns, hp, ng);
      }

      step++;

      // Cleanup old nodes periodically
      if (step % 16 === 0) this._cleanup();

      const timer = setTimeout(schedule, beatSec * 1000 * 0.95);
      this._timers.push(timer);
    };

    schedule();
  }

  stop() {
    this._playing = false;
    this._paused = false;
    this._timers.forEach(clearTimeout);
    this._timers.length = 0;
    const now = this._ctx.currentTime;
    this._nodes.forEach((n) => {
      try {
        if (n.stop) n.stop(now);
      } catch (_) {
        /* already stopped */
      }
      try {
        n.disconnect();
      } catch (_) {
        /* ok */
      }
    });
    this._nodes.length = 0;
  }

  pause() {
    if (!this._playing || this._paused) return;
    this._paused = true;
    this._gainNode.gain.setValueAtTime(0, this._ctx.currentTime);
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._gainNode.gain.setValueAtTime(1, this._ctx.currentTime);
    // Restart scheduling
    this.createBasicBeat();
  }

  setGain(v) {
    this._gainNode.gain.setValueAtTime(clamp(v), this._ctx.currentTime);
  }

  _cleanup() {
    // Remove nodes that have finished (heuristic: keep last 64)
    if (this._nodes.length > 64) {
      const old = this._nodes.splice(0, this._nodes.length - 32);
      old.forEach((n) => {
        try { n.disconnect(); } catch (_) { /* ok */ }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// AudioManager
// ---------------------------------------------------------------------------

class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this._ctx = null;
    this._masterGain = null;
    this._sfxGain = null;
    this._musicGain = null;
    this._music = null;

    this._masterVolume = 1.0;
    this._sfxVolume = 1.0;
    this._musicVolume = 0.5;

    /** Active sound count for concurrency limiting. */
    this._activeSounds = 0;

    this._initialized = false;
  }

  // ---- Volume properties ----

  get masterVolume() { return this._masterVolume; }
  set masterVolume(v) { this.setVolume('master', v); }

  get sfxVolume() { return this._sfxVolume; }
  set sfxVolume(v) { this.setVolume('sfx', v); }

  get musicVolume() { return this._musicVolume; }
  set musicVolume(v) { this.setVolume('music', v); }

  // ---- Core ----

  /**
   * Lazily initialise the AudioContext. Safe to call multiple times.
   * Typically invoked on first user interaction (click / key).
   */
  _init() {
    if (this._initialized) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      console.warn('AudioManager: Web Audio API not supported.');
      return;
    }

    this._ctx = new AC();

    // Master → destination
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this._masterVolume;
    this._masterGain.connect(this._ctx.destination);

    // SFX bus
    this._sfxGain = this._ctx.createGain();
    this._sfxGain.gain.value = this._sfxVolume;
    this._sfxGain.connect(this._masterGain);

    // Music bus
    this._musicGain = this._ctx.createGain();
    this._musicGain.gain.value = this._musicVolume;
    this._musicGain.connect(this._masterGain);

    this._music = new ProceduralMusic(this._ctx, this._musicGain);

    this._initialized = true;
  }

  /**
   * Play a named sound preset.
   * @param {string} name — one of the preset names (coin, shoot, etc.)
   * @param {object} [options]
   * @param {number} [options.volume=1] — 0.0-1.0 multiplier
   * @param {number} [options.pitch=1]  — playback rate / frequency multiplier
   * @param {number} [options.pan=0]    — stereo pan -1 (left) to 1 (right)
   */
  play(name, options = {}) {
    this._init();
    if (!this._ctx) return;

    // Resume suspended context (autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }

    if (this._activeSounds >= MAX_CONCURRENT) return;

    const preset = presets[name];
    if (!preset) {
      console.warn(`AudioManager: unknown preset "${name}"`);
      return;
    }

    const { volume = 1, pitch = 1, pan = 0 } = options;

    // Build per-sound output chain: panner → sfx bus
    const panner = createPanner(this._ctx, pan);
    panner.connect(this._sfxGain);

    const vol = clamp(volume);
    const ctx = this._ctx;
    const t = ctx.currentTime;

    // If pitch !== 1, we apply it by wrapping the preset's dest through a
    // gain that we don't modify — the preset itself handles freq.  For a
    // simple approach we scale frequencies via a detune wrapper.
    let dest = panner;
    // pitch shifting: we create a gain node and let presets set freq
    // We'll post-multiply frequencies if pitch != 1 by re-calling
    // Not trivial for arbitrary presets, so we adjust volume-only here
    // and apply pitch by detuning oscillators after creation.

    const result = preset(ctx, dest, t, vol);

    // Apply pitch adjustment to any oscillator nodes
    if (pitch !== 1) {
      const cents = 1200 * Math.log2(pitch);
      result.nodes.forEach((n) => {
        if (n instanceof OscillatorNode) {
          n.detune.setValueAtTime(cents, t);
        }
        // For BufferSource nodes (noise), adjust playbackRate
        if (n instanceof AudioBufferSourceNode) {
          n.playbackRate.setValueAtTime(pitch, t);
        }
      });
    }

    this._activeSounds++;

    // Auto-cleanup after duration
    const cleanupDelay = (result.duration + 0.1) * 1000;
    setTimeout(() => {
      this._activeSounds = Math.max(0, this._activeSounds - 1);
      result.nodes.forEach((n) => {
        try { n.disconnect(); } catch (_) { /* ok */ }
      });
      try { panner.disconnect(); } catch (_) { /* ok */ }
    }, cleanupDelay);
  }

  // ---- Music controls ----

  /**
   * Start procedural music.
   * @param {string} [name='basic'] — music type (currently only 'basic')
   * @param {object} [options]
   * @param {number} [options.bpm=120]
   * @param {string} [options.key='C']
   */
  playMusic(name = 'basic', options = {}) {
    this._init();
    if (!this._ctx || !this._music) return;
    if (this._ctx.state === 'suspended') this._ctx.resume();

    const { bpm = 120, key = 'C' } = options;
    this._music.createBasicBeat(bpm, key);
  }

  /** Stop all music. */
  stopMusic() {
    if (this._music) this._music.stop();
  }

  /** Pause music (keeps position conceptually, restarts on resume). */
  pauseMusic() {
    if (this._music) this._music.pause();
  }

  /** Resume paused music. */
  resumeMusic() {
    if (this._music) this._music.resume();
  }

  // ---- Volume ----

  /**
   * Set volume for a category.
   * @param {'master'|'sfx'|'music'} category
   * @param {number} value — 0.0 to 1.0
   */
  setVolume(category, value) {
    const v = clamp(value);
    switch (category) {
      case 'master':
        this._masterVolume = v;
        if (this._masterGain) {
          this._masterGain.gain.setValueAtTime(v, this._ctx.currentTime);
        }
        break;
      case 'sfx':
        this._sfxVolume = v;
        if (this._sfxGain) {
          this._sfxGain.gain.setValueAtTime(v, this._ctx.currentTime);
        }
        break;
      case 'music':
        this._musicVolume = v;
        if (this._musicGain) {
          this._musicGain.gain.setValueAtTime(v, this._ctx.currentTime);
        }
        if (this._music) this._music.setGain(v);
        break;
      default:
        console.warn(`AudioManager: unknown volume category "${category}"`);
    }
  }

  /**
   * Resume AudioContext after suspension (e.g. page visibility change,
   * autoplay policy). Call this from a user-gesture handler.
   */
  resume() {
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  /** List available preset names. */
  get presetNames() {
    return Object.keys(presets);
  }
}


Object.assign(window, { AudioManager });
})();
