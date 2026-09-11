import {
  approach,
  BaseGame,
  clamp,
  drawParticles,
  drawPops,
  drawPrompt,
  lerp,
  unit,
  withShake,
} from "./common.js";
import { IDX } from "../landmarks.js";

/**
 * Body Drums - four pads round the body, struck on the beat.
 *
 * Everything else in the arcade asks "did you get there", and answers as soon
 * as you do. A drum asks "did you get there *now*", which is a different
 * skill: the hit has to be started before the beat to land on it. That is the
 * whole game, and it is why the pads sit still and light up on a clock rather
 * than flying at you.
 *
 * Two pads are for the hands and two are driven into with the knees, so a
 * round is a full-body workout rather than arm-waving. Knees rather than
 * feet: the ankle is the landmark the model is least sure of, especially with
 * a phone on the floor, and driving a knee up is better exercise anyway.
 *
 * The pads hang off the player's shoulders, so they are in the same place
 * relative to the body wherever the player stands. The anchor is smoothed
 * hard: pads that chase every wobble of the tracking are pads you cannot
 * learn the position of.
 */

/** How long a note is on screen before it is due. */
const LEAD_S = 1.5;

/** Inside this of the beat is a hit; inside the tighter one is a clean hit. */
const WINDOW_S = 0.2;
const SWEET_S = 0.095;

/** A striker slower than this is resting on the pad, not hitting it. */
const STRIKE_SPEED = 0.9;

/**
 * The four pads, placed in shoulder widths from the middle of the shoulders.
 *
 * The hand pads are out and a little high, where an arm swings naturally. The
 * knee pads are low and inboard, over where a knee actually arrives.
 */
const PADS = [
  { id: "lh", by: "hand", side: "left", dx: -1.25, dy: 0.15, color: "#22d3ee" },
  { id: "rh", by: "hand", side: "right", dx: 1.25, dy: 0.15, color: "#f472b6" },
  { id: "lk", by: "knee", side: "left", dx: -0.6, dy: 1.95, color: "#fbbf24" },
  { id: "rk", by: "knee", side: "right", dx: 0.6, dy: 1.95, color: "#4ade80" },
];

export function createGame(opts = {}) {
  return new BodyDrums(opts);
}

class BodyDrums extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 80_000,
      // A rhythm game with lives is a rhythm game you stop playing on the
      // first bad bar. Missing costs the combo, which is punishment enough.
      lives: opts.lives ?? 0,
      fx: opts.fx,
      scoreCue: "pop",
      clearsPerLevel: opts.clearsPerLevel ?? 8,
    });
    this.slowBpm = opts.slowBpm ?? 76;
    this.fastBpm = opts.fastBpm ?? 132;
    this.reset();
  }

  reset() {
    super.reset();
    this.clock = 0;
    this.notes = [];
    this.nextBeat = 2; // a couple of beats of silence to find the pads
    this.anchor = null;
    this.strikers = {};
    this.touching = {};
    this.hits = 0;
    this.perfect = 0;
    this.flash = {};
  }

  bpm() {
    return lerp(this.slowBpm, this.fastBpm, this.ramp());
  }

  beatS() {
    return 60 / this.bpm();
  }

  /**
   * Where the pads sit, or null before the body has been seen.
   *
   * Both a place in display space, for scoring against, and a place and size
   * in pixels. The pixels are what matters: a radius kept in display space is
   * a different number of pixels across than it is down, so the pad you can
   * hit would not be the circle that was drawn.
   */
  layout(view) {
    if (!this.anchor) return null;
    const { x, y, width } = this.anchor;
    const halfPx = Math.abs(view.poseX(x + width / 2) - view.poseX(x - width / 2)) / 2;
    return PADS.map((pad) => {
      const at = {
        x: clamp(x + pad.dx * width, 0.06, 0.94),
        y: clamp(y + pad.dy * width, 0.06, 0.94),
      };
      return {
        ...pad,
        ...at,
        px: view.poseX(at.x),
        py: view.poseY(at.y),
        r: halfPx * 0.84,
      };
    });
  }

  /**
   * Where each striker is, in display space, with how fast it is moving.
   *
   * Hands come ready-made off the signals. Knees have to be read out of the
   * raw landmarks and mirrored by hand, because nothing else needs them.
   */
  #readStrikers(signals, dt) {
    const out = {};
    for (const side of ["left", "right"]) {
      const h = signals.hands?.[side];
      if (h?.visible && h.x != null) out[`${side}-hand`] = { x: h.x, y: h.y, speed: h.speed ?? 0 };
    }

    const marks = signals.landmarks;
    const width = signals.shoulder?.width || signals.scale || 0.2;
    if (marks) {
      for (const [side, i] of [
        ["left", IDX.LEFT_KNEE],
        ["right", IDX.RIGHT_KNEE],
      ]) {
        const p = marks[i];
        if (!p || Math.max(p.visibility ?? 0, p.presence ?? 0) < 0.4) continue;
        // Landmarks arrive unmirrored; everything else here is in the picture
        // the player sees, so flip x to match.
        const key = `${side}-knee`;
        const at = { x: 1 - p.x, y: p.y };
        const was = this.strikers[key];
        const speed = was && dt > 0 ? Math.hypot(at.x - was.x, at.y - was.y) / width / dt : 0;
        out[key] = { ...at, speed };
      }
    }
    return out;
  }

  /** Put beats on the clock far enough ahead to be seen coming. */
  #schedule() {
    const beat = this.beatS();
    const t = this.ramp();
    while (this.nextBeat * beat < this.clock + LEAD_S + beat) {
      const at = this.nextBeat * beat;
      this.nextBeat += 1;
      // Rests keep it musical, and give a beginner somewhere to breathe.
      if (Math.random() > lerp(0.62, 0.95, t)) continue;

      const first = PADS[Math.floor(Math.random() * PADS.length)];
      this.notes.push({ pad: first.id, at, judged: false });
      // Two at once only once the four pads are known, and never two for the
      // same limb, which cannot be in two places at once.
      if (Math.random() < t * 0.35) {
        const pair = PADS.filter((p) => p.by !== first.by || p.side !== first.side);
        const other = pair[Math.floor(Math.random() * pair.length)];
        if (other.id !== first.id) this.notes.push({ pad: other.id, at, judged: false });
      }
    }
  }

  /** The note this pad is closest to owing, if it is within the window. */
  #dueOn(padId) {
    let best = null;
    for (const note of this.notes) {
      if (note.judged || note.pad !== padId) continue;
      const off = Math.abs(note.at - this.clock);
      if (off > WINDOW_S) continue;
      if (!best || off < Math.abs(best.at - this.clock)) best = note;
    }
    return best;
  }

  tick(dt, signals, now, view) {
    const result = { over: false, hits: 0, misses: 0, early: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    if (!signals.inFrame || !signals.shoulder) {
      this.strikers = {};
      this.touching = {};
      return result;
    }

    // Follow the body slowly. Pads that jump about cannot be aimed at.
    const want = signals.shoulder;
    if (!this.anchor) this.anchor = { ...want };
    else {
      const k = approach(2.2, dt);
      this.anchor.x += (want.x - this.anchor.x) * k;
      this.anchor.y += (want.y - this.anchor.y) * k;
      this.anchor.width += (want.width - this.anchor.width) * k;
    }

    this.clock += dt;
    this.#schedule();

    const pads = this.layout(view);
    const strikers = this.#readStrikers(signals, dt);
    this.#judgeStrikes(pads, strikers, view, result);
    this.strikers = strikers;

    // Anything that went past its window unstruck.
    for (const note of this.notes) {
      if (note.judged || this.clock <= note.at + WINDOW_S) continue;
      note.judged = true;
      note.missed = true;
      result.misses += 1;
      this.penalise({ costsLife: false });
    }
    this.notes = this.notes.filter((n) => this.clock < n.at + WINDOW_S + 0.4);

    for (const id of Object.keys(this.flash)) {
      this.flash[id] = Math.max(0, this.flash[id] - dt * 3);
    }
    return result;
  }

  /** Score any pad a striker has just driven into. */
  #judgeStrikes(pads, strikers, view, result) {
    const touching = {};
    for (const pad of pads) {
      for (const [key, striker] of Object.entries(strikers)) {
        const [side, by] = key.split("-");
        if (by !== pad.by || side !== pad.side) continue;

        const dx = view.poseX(striker.x) - pad.px;
        const dy = view.poseY(striker.y) - pad.py;
        const near = Math.hypot(dx, dy) < pad.r;
        touching[key] = near;
        // A drum is struck by arriving, not by being rested on, so the hit
        // fires on the way in and only if the limb is actually travelling.
        if (!near || this.touching[key] || striker.speed < STRIKE_SPEED) continue;

        this.#strike(pad, result);
      }
    }
    this.touching = touching;
  }

  #strike(pad, result) {
    this.flash[pad.id] = 1;
    const note = this.#dueOn(pad.id);
    if (!note) {
      // Struck off the beat. No score, and the combo goes, but no worse —
      // flailing should be unrewarding, not punishing.
      result.early += 1;
      this.combo = 0;
      this.cue("miss");
      return;
    }

    note.judged = true;
    note.hit = true;
    this.countAction(pad.by === "knee" ? "kick" : "punch");
    this.hits += 1;
    const clean = Math.abs(note.at - this.clock) <= SWEET_S;
    if (clean) this.perfect += 1;
    result.hits += 1;
    this.award(pad.x, pad.y, clean ? "PERFECT" : null, {
      color: pad.color,
      count: clean ? 20 : 11,
    });
  }

  summary() {
    return {
      ...super.summary(),
      hits: this.hits,
      perfect: this.perfect,
    };
  }

  draw(ctx, view, signals) {
    void signals;
    withShake(ctx, this.shake, () => {
      const pads = this.layout(view);
      if (!pads) {
        drawPrompt(ctx, view, "Step back", "Get your whole body in shot");
        return;
      }
      for (const pad of pads) this.#drawPad(ctx, pad);
      for (const pad of pads) this.#drawApproach(ctx, pad);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      this.#drawBeat(ctx, view);
    });
  }

  #drawPad(ctx, pad) {
    const { px: x, py: y, r } = pad;
    const lit = this.flash[pad.id] ?? 0;

    ctx.save();
    // A drum head: dark skin, bright rim, lit from above.
    const skin = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    skin.addColorStop(0, lit > 0 ? pad.color : "rgba(20,28,44,0.85)");
    skin.addColorStop(1, "rgba(8,12,22,0.85)");
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = pad.color;
    ctx.globalAlpha = 0.45 + lit * 0.55;
    ctx.lineWidth = Math.max(2, r * 0.13);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Struck: a ring thrown off the rim.
    if (lit > 0) {
      ctx.globalAlpha = lit * 0.7;
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + (1 - lit) * 0.7), 0, Math.PI * 2);
      ctx.stroke();
    }

    // A small mark saying which limb this pad belongs to.
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = pad.color;
    if (pad.by === "knee") {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.2, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The ring that closes on the pad as a note comes due. */
  #drawApproach(ctx, pad) {
    const { px: x, py: y, r } = pad;

    for (const note of this.notes) {
      if (note.pad !== pad.id || note.judged) continue;
      const left = note.at - this.clock;
      if (left > LEAD_S || left < -WINDOW_S) continue;
      // Closes from three pad widths down to the rim, so "now" is the moment
      // the two circles meet — a shape, not a number.
      const t = clamp(left / LEAD_S, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.35 + (1 - t) * 0.6;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.beginPath();
      ctx.arc(x, y, r * (1 + t * 2), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * A pulse on the beat, so the tempo is visible as well as audible.
   *
   * Along the bottom, because the top of the screen belongs to the score and
   * the clock and a metronome tucked behind those is no metronome at all.
   */
  #drawBeat(ctx, view) {
    const beat = this.beatS();
    const phase = beat > 0 ? (this.clock % beat) / beat : 0;
    const u = unit(view);
    const r = u * 0.018 * (1 + (1 - phase) * 0.5);
    ctx.save();
    ctx.globalAlpha = 0.3 + (1 - phase) * 0.5;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(view.w / 2, view.h * 0.95, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
