import {
  BaseGame,
  clamp,
  distanceToPath,
  drawHandCursors,
  drawParticles,
  drawPops,
  HandPaths,
  Rep,
  unit,
  withShake,
} from "./common.js";

/**
 * Punch Out - pads light up and you jab them with the matching hand.
 *
 * Pads are anchored to the side of the screen they belong to, so the left pad
 * always wants the left hand. Landing it needs speed as well as contact,
 * otherwise you could just park a hand on the pad and farm points.
 */
/**
 * How hard a hand is being thrown, whichever way it went.
 *
 * People do not punch sideways. Asked to hit a pad on the screen they still
 * throw the jab they know, which travels at the camera and barely crosses the
 * picture at all, so judging a punch on how fast it moved across the frame
 * throws away most of the real ones. Whichever is bigger — across or forward —
 * is the punch.
 */
export const punchDrive = (hand) =>
  hand?.visible && hand.x != null ? Math.max(hand.speed ?? 0, hand.push ?? 0) : 0;

export const PADS = [
  { id: "left-high", side: "left", x: 0.24, y: 0.3 },
  { id: "left-low", side: "left", x: 0.2, y: 0.56 },
  { id: "right-high", side: "right", x: 0.76, y: 0.3 },
  { id: "right-low", side: "right", x: 0.8, y: 0.56 },
];

export function createGame(opts = {}) {
  return new PunchOut(opts);
}

class PunchOut extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 70_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "thud",
      clearsPerLevel: opts.clearsPerLevel ?? 4,
    });
    this.holdMs = opts.holdMs ?? 1700;
    this.fastestHoldMs = opts.fastestHoldMs ?? 900;
    this.gapMs = opts.gapMs ?? 550;
    this.punchSpeed = opts.punchSpeed ?? 1.9;
    this.hitRadius = opts.hitRadius ?? 0.11;
    this.reset();
  }

  reset() {
    super.reset();
    this.active = null;
    this.restTimer = 0.7;
    this.lastPadId = null;
    this.impacts = [];
    this.punches = {
      left: new Rep(this.punchSpeed, this.punchSpeed * 0.5),
      right: new Rep(this.punchSpeed, this.punchSpeed * 0.5),
    };
    this.hands = new HandPaths();
  }

  #light() {
    // Never light the same pad twice running.
    const choices = PADS.filter((p) => p.id !== this.lastPadId);
    const pad = choices[Math.floor(Math.random() * choices.length)];
    this.lastPadId = pad.id;
    const hold = this.holdMs - (this.holdMs - this.fastestHoldMs) * this.ramp();
    this.active = { pad, left: hold / 1000, total: hold / 1000 };
    // A pad lighting up is worth hearing; on a phone the screen is often at the
    // edge of your vision while you are actually punching.
    this.cue("tick");
  }

  tick(dt, signals, now, view) {
    const result = { over: false, landed: 0, missed: 0, wrongHand: false };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    for (const i of this.impacts) i.t += dt;
    this.impacts = this.impacts.filter((i) => i.t < 0.35);

    if (!signals.inFrame) {
      this.hands.reset();
      return result;
    }

    const box = view ?? { w: 1, h: 1 };
    const paths = this.hands.update(box, signals, now);

    // Count the punch you threw, not the one that landed: a miss cost you the
    // same swing, and so did one thrown between pads.
    for (const side of ["left", "right"]) {
      if (this.punches[side].step(punchDrive(signals.hands?.[side]))) this.countAction("punch");
    }

    if (!this.active) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) this.#light();
      return result;
    }

    const { pad } = this.active;
    const reach = unit(box) * this.hitRadius;
    const px = pad.x * box.w;
    const py = pad.y * box.h;

    // A jab thrown hard enough can be past the pad by the next reading, so the
    // pad is tested against the line the fist travelled down.
    const path = paths.find((p) => p.side === pad.side);
    const hand = path?.hand;
    const onTarget = Boolean(path) && distanceToPath(path.from, path.to, px, py) <= reach;

    if (onTarget && punchDrive(hand) >= this.punchSpeed) {
      this.impacts.push({ x: pad.x, y: pad.y, t: 0 });
      // Sparks fly back towards the middle, away from the pad you just hit.
      result.landed += this.award(pad.x, pad.y, null, { color: "#fbbf24", count: 12 });
      this.active = null;
      this.restTimer = this.gapMs / 1000;
      return result;
    }

    this.active.left -= dt;
    if (this.active.left <= 0) {
      this.active = null;
      this.restTimer = this.gapMs / 1000;
      result.missed += 1;
      if (this.penalise({ x: pad.x, y: pad.y, color: "#94a3b8" })) {
        this.over = true;
        result.over = true;
      }
    }
    return result;
  }

  draw(ctx, view, signals) {
    withShake(ctx, this.shake, () => {
      for (const pad of PADS) {
        const live = this.active?.pad.id === pad.id;
        this.#drawPad(ctx, view, pad, live ? this.active.left / this.active.total : 0, live);
      }
      for (const i of this.impacts) this.#drawImpact(ctx, view, i);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      drawHandCursors(ctx, view, signals, { radius: this.hitRadius * 0.55 });
    });
  }

  /**
   * A focus mitt: leather face, stitched rim, a target to hit in the middle.
   *
   * It was a flat disc with a smaller disc inside it, which over a live camera
   * picture looked like a piece of the interface that had drifted onto the
   * video rather than something in the room to be hit. Roundness is what sells
   * it as an object: the face is lit from the upper left like everything else
   * Pip is drawn with, and it is what tells you the pad is facing you.
   */
  #drawPad(ctx, view, pad, remaining, live) {
    const r = unit(view) * this.hitRadius;
    const x = pad.x * view.w;
    const y = pad.y * view.h;

    // Sitting in the room rather than pasted on the front of it.
    ctx.fillStyle = "rgba(8,15,25,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.08, y + r * 0.12, r * 0.98, r * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();

    const face = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.08);
    if (live) {
      face.addColorStop(0, "#fb7185");
      face.addColorStop(0.55, "#ef4444");
      face.addColorStop(1, "#9f1239");
    } else {
      face.addColorStop(0, "rgba(203,213,225,0.62)");
      face.addColorStop(0.55, "rgba(148,163,184,0.44)");
      face.addColorStop(1, "rgba(71,85,105,0.42)");
    }
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Stitched rim, the way a mitt is actually made.
    ctx.lineWidth = Math.max(3, r * 0.13);
    ctx.strokeStyle = live ? "#fff" : "rgba(255,255,255,0.5)";
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([r * 0.16, r * 0.13]);
    ctx.lineWidth = Math.max(1.5, r * 0.045);
    ctx.strokeStyle = live ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // The spot to actually hit.
    ctx.beginPath();
    ctx.arc(x, y, r * 0.36, 0, Math.PI * 2);
    ctx.fillStyle = live ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.28)";
    ctx.fill();
    if (live) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    }

    // The shine that makes it a curved surface instead of a hole.
    ctx.fillStyle = live ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.26, r * 0.17, -0.6, 0, Math.PI * 2);
    ctx.fill();

    if (!live) return;

    // A countdown arc so you can see how long you have left.
    ctx.beginPath();
    ctx.arc(x, y, r * 1.28, -Math.PI / 2, -Math.PI / 2 + clamp(remaining, 0, 1) * Math.PI * 2);
    ctx.lineWidth = Math.max(3, r * 0.16);
    ctx.strokeStyle = remaining < 0.3 ? "#fbbf24" : "#fff";
    ctx.stroke();
  }

  /** A ring going out, and spokes thrown off the point of contact. */
  #drawImpact(ctx, view, impact) {
    const base = unit(view) * this.hitRadius;
    const r = base * (1 + impact.t * 3.5);
    const x = impact.x * view.w;
    const y = impact.y * view.h;

    ctx.save();
    ctx.globalAlpha = 1 - impact.t / 0.35;
    ctx.strokeStyle = "#fbbf24";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(3, unit(view) * 0.014);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // A ring alone spreads like something dropped in water. Spokes are what
    // make it read as a hit landing.
    const from = base * (0.55 + impact.t * 2.2);
    const to = from + base * (0.62 - impact.t * 1.1);
    if (to > from) {
      ctx.lineWidth = Math.max(2.5, unit(view) * 0.011);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from);
        ctx.lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
