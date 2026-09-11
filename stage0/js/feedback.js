/**
 * Sound and touch feedback.
 *
 * Cues are synthesised with WebAudio rather than loaded from files, so the
 * arcade stays a folder of source with nothing to download before the first
 * round and nothing to go missing offline.
 *
 * The split here is deliberate: `Feedback` owns policy — muting, how often a
 * cue may repeat, how a combo lifts the pitch — while turning a layer into
 * actual sound lives in a sink. Tests hand it a recording sink, the browser
 * hands it `webAudioSink`.
 */

/** Frequency ratio for `n` semitones. */
const semitone = (n) => 2 ** (n / 12);

const clockNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * A cue is a stack of layers played together, plus one vibration pattern.
 *
 * Layer fields:
 *   type    "tone" for a pitched oscillator, "noise" for filtered white noise
 *   from/to glide, in Hz — the oscillator pitch, or the noise filter corner
 *   dur     seconds
 *   gain    peak before the master, kept low so stacked cues do not clip
 *   delay   seconds to wait before starting, for arpeggios
 *
 * `buzz` is passed straight to navigator.vibrate, so a number is one pulse and
 * an array alternates buzz and pause.
 */
export const CUES = {
  /* --- scoring --- */
  pop: {
    buzz: 12,
    layers: [
      { type: "tone", wave: "triangle", from: 680, to: 220, dur: 0.14, gain: 0.32 },
      { type: "noise", filter: "highpass", from: 2400, to: 1200, dur: 0.07, gain: 0.12 },
    ],
  },
  slice: {
    buzz: 14,
    layers: [
      { type: "noise", filter: "bandpass", q: 1.4, from: 3400, to: 700, dur: 0.18, gain: 0.26 },
      { type: "tone", wave: "triangle", from: 900, to: 400, dur: 0.1, gain: 0.14 },
    ],
  },
  coin: {
    buzz: 10,
    layers: [
      { type: "tone", wave: "square", from: 880, to: 880, dur: 0.06, gain: 0.16 },
      { type: "tone", wave: "square", from: 1320, to: 1320, dur: 0.12, gain: 0.16, delay: 0.055 },
    ],
  },
  thud: {
    buzz: 26,
    layers: [
      { type: "tone", wave: "sine", from: 190, to: 62, dur: 0.18, gain: 0.42 },
      { type: "noise", filter: "lowpass", from: 1100, to: 220, dur: 0.11, gain: 0.24 },
    ],
  },
  rep: {
    buzz: 18,
    layers: [
      { type: "tone", wave: "sine", from: 330, to: 494, dur: 0.13, gain: 0.28 },
      { type: "tone", wave: "triangle", from: 660, to: 988, dur: 0.1, gain: 0.1 },
    ],
  },
  lock: {
    buzz: [16, 40, 16],
    layers: [
      { type: "tone", wave: "sine", from: 523, to: 523, dur: 0.34, gain: 0.16 },
      { type: "tone", wave: "sine", from: 659, to: 659, dur: 0.34, gain: 0.14, delay: 0.04 },
      { type: "tone", wave: "sine", from: 784, to: 784, dur: 0.34, gain: 0.12, delay: 0.08 },
    ],
  },
  chime: {
    buzz: 8,
    layers: [{ type: "tone", wave: "sine", from: 1046, to: 1046, dur: 0.12, gain: 0.16 }],
  },

  /* --- failing --- */
  miss: {
    buzz: 30,
    layers: [{ type: "tone", wave: "sawtooth", from: 300, to: 150, dur: 0.22, gain: 0.2 }],
  },
  crash: {
    buzz: [34, 50, 60],
    layers: [
      { type: "noise", filter: "lowpass", from: 1400, to: 120, dur: 0.34, gain: 0.3 },
      { type: "tone", wave: "sawtooth", from: 165, to: 68, dur: 0.3, gain: 0.24 },
    ],
  },

  /* --- the shell around a round --- */
  tick: {
    buzz: 0,
    layers: [{ type: "tone", wave: "square", from: 660, to: 660, dur: 0.07, gain: 0.1 }],
  },
  go: {
    buzz: 22,
    layers: [{ type: "tone", wave: "square", from: 880, to: 1320, dur: 0.2, gain: 0.16 }],
  },
  finish: {
    buzz: [28, 60, 28, 60, 70],
    layers: [
      { type: "tone", wave: "triangle", from: 523, to: 523, dur: 0.16, gain: 0.16 },
      { type: "tone", wave: "triangle", from: 659, to: 659, dur: 0.16, gain: 0.16, delay: 0.13 },
      { type: "tone", wave: "triangle", from: 784, to: 784, dur: 0.16, gain: 0.16, delay: 0.26 },
      { type: "tone", wave: "triangle", from: 1046, to: 1046, dur: 0.4, gain: 0.18, delay: 0.39 },
    ],
  },
  ui: {
    buzz: 6,
    layers: [{ type: "tone", wave: "triangle", from: 520, to: 620, dur: 0.06, gain: 0.1 }],
  },
};

/** Highest combo step that still lifts the pitch, so it never turns shrill. */
const MAX_STEP = 12;

export class Feedback {
  /**
   * @param sink      called once per layer; the thing that actually makes noise
   * @param vibrate   navigator.vibrate, or null where there is no motor
   * @param gapMs     a cue will not repeat inside this window
   * @param buzzGapMs vibration is rationed harder than sound; the motor cannot
   *                  keep up with a frame that scores several times and the
   *                  result is one long smear rather than distinct taps
   */
  constructor({ sink = () => {}, vibrate = null, muted = false, gapMs = 40, buzzGapMs = 90 } = {}) {
    this.sink = sink;
    this.vibrate = vibrate;
    this.muted = Boolean(muted);
    this.gapMs = gapMs;
    this.buzzGapMs = buzzGapMs;
    this.lastAt = new Map();
    this.lastBuzzAt = -Infinity;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    return this.muted;
  }

  toggle() {
    return this.setMuted(!this.muted);
  }

  /**
   * Play a cue.
   *
   * `step` is normally the combo count: each step lifts the pitch a semitone so
   * a run of successes climbs, which is the cheapest way to make scoring feel
   * like it is going somewhere. Returns whether anything was played, which is
   * what the tests read.
   */
  cue(name, { step = 0, gain = 1, now = clockNow() } = {}) {
    const spec = CUES[name];
    if (!spec || this.muted) return false;
    if (now - (this.lastAt.get(name) ?? -Infinity) < this.gapMs) return false;
    this.lastAt.set(name, now);

    const shift = semitone(Math.min(Math.max(step, 0), MAX_STEP));
    for (const layer of spec.layers) {
      this.sink({
        ...layer,
        from: layer.from * shift,
        to: (layer.to ?? layer.from) * shift,
        gain: layer.gain * gain,
      });
    }

    if (spec.buzz && this.vibrate && now - this.lastBuzzAt >= this.buzzGapMs) {
      this.lastBuzzAt = now;
      this.vibrate(spec.buzz);
    }
    return true;
  }
}

/** A feedback object that does nothing, so games work without a browser. */
export const silentFeedback = new Feedback();

/**
 * Render layers through WebAudio. One noise buffer and one master gain are
 * shared by everything; each layer gets its own short-lived nodes, which the
 * browser collects once they have stopped.
 */
export function webAudioSink(ctx, { master = 0.55 } = {}) {
  const bus = ctx.createGain();
  bus.gain.value = master;
  bus.connect(ctx.destination);

  const seconds = 0.5;
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const channel = noise.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;

  return (layer) => {
    const start = ctx.currentTime + (layer.delay ?? 0);
    const end = start + layer.dur;

    // A short fade in stops the click you get from starting at full volume,
    // and the exponential tail is what makes it read as a hit rather than a beep.
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(layer.gain, start + Math.min(0.012, layer.dur * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(bus);

    let source;
    if (layer.type === "noise") {
      source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter ?? "bandpass";
      filter.Q.value = layer.q ?? 1;
      filter.frequency.setValueAtTime(Math.max(40, layer.from), start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, layer.to), end);
      source.connect(filter);
      filter.connect(env);
    } else {
      source = ctx.createOscillator();
      source.type = layer.wave ?? "sine";
      source.frequency.setValueAtTime(Math.max(20, layer.from), start);
      source.frequency.exponentialRampToValueAtTime(Math.max(20, layer.to), end);
      source.connect(env);
    }
    source.start(start);
    source.stop(end);
  };
}

/**
 * Feedback wired to the browser. The audio context stays unbuilt until
 * `unlock()` runs inside a real tap, because every mobile browser refuses to
 * start one any earlier.
 */
class BrowserFeedback extends Feedback {
  #ctx = null;

  unlock() {
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return false;
    if (!this.#ctx) {
      try {
        this.#ctx = new Ctor();
        this.sink = webAudioSink(this.#ctx);
      } catch {
        return false;
      }
    }
    if (this.#ctx.state === "suspended") this.#ctx.resume().catch(() => {});
    return true;
  }
}

export function createFeedback({ muted = false } = {}) {
  const canBuzz = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  if (!canBuzz) return new BrowserFeedback({ muted, vibrate: null });

  // Browsers refuse to vibrate until the page has been genuinely tapped, and
  // asking early logs an error rather than throwing. Wait for a trusted
  // gesture, and give up for good the first time the motor declines.
  let tapped = false;
  let allowed = true;
  if (typeof window !== "undefined") {
    const seen = (e) => {
      if (e.isTrusted) tapped = true;
    };
    window.addEventListener("pointerdown", seen, { capture: true, passive: true });
    window.addEventListener("keydown", seen, { capture: true, passive: true });
  }

  return new BrowserFeedback({
    muted,
    vibrate: (pattern) => {
      if (!tapped || !allowed) return;
      try {
        if (navigator.vibrate(pattern) === false) allowed = false;
      } catch {
        allowed = false;
      }
    },
  });
}
