import { BaseGame, clamp, drawParticles, drawPops, drawPrompt, unit } from "./common.js";
import { BODY, drawPip } from "../demo.js";

/**
 * Pose Match - copy the shape on screen and hold it until it locks in.
 *
 * Targets are stored as wrist offsets from the shoulder centre, measured in
 * shoulder widths. That makes a pose the same shape whether you are near the
 * camera or across the room, and it never depends on where you stand in frame.
 */
export const POSES = [
  { name: "T-Pose", left: { dx: -1.5, dy: 0 }, right: { dx: 1.5, dy: 0 } },
  { name: "Arms up", left: { dx: -0.85, dy: -1.5 }, right: { dx: 0.85, dy: -1.5 } },
  { name: "Touchdown", left: { dx: -0.5, dy: -1.7 }, right: { dx: 0.5, dy: -1.7 } },
  { name: "Right hand up", left: { dx: -0.7, dy: 0.9 }, right: { dx: 0.8, dy: -1.6 } },
  { name: "Left hand up", left: { dx: -0.8, dy: -1.6 }, right: { dx: 0.7, dy: 0.9 } },
  { name: "Cross arms", left: { dx: 0.35, dy: 0.35 }, right: { dx: -0.35, dy: 0.35 } },
  { name: "Wide V", left: { dx: -1.35, dy: -0.95 }, right: { dx: 1.35, dy: -0.95 } },
];

export function createGame(opts = {}) {
  return new PoseMatch(opts);
}

class PoseMatch extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 90_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "lock",
      clearsPerLevel: opts.clearsPerLevel ?? 2,
    });
    // Tolerance in shoulder widths: generous enough to be fun, tight enough
    // that a wrong pose cannot pass.
    this.tolerance = opts.tolerance ?? 0.62;
    this.holdMs = opts.holdMs ?? 700;
    this.timeLimitMs = opts.timeLimitMs ?? 7000;
    this.fastestLimitMs = opts.fastestLimitMs ?? 4200;
    this.reset();
  }

  reset() {
    super.reset();
    this.index = -1;
    this.target = null;
    this.held = 0;
    this.left = 0;
    this.matching = false;
    this.order = [];
    this.#next();
  }

  #next() {
    if (!this.order.length) {
      this.order = POSES.map((_, i) => i).sort(() => Math.random() - 0.5);
    }
    this.index = this.order.pop();
    this.target = POSES[this.index];
    this.held = 0;
    this.matching = false;
    this.left =
      (this.timeLimitMs - (this.timeLimitMs - this.fastestLimitMs) * this.ramp()) / 1000;
  }

  /**
   * Where each wrist currently sits relative to the shoulder centre, measured
   * in shoulder widths. Returns null when the body is not readable.
   */
  static offsets(signals) {
    const sh = signals.shoulder;
    if (!sh || !sh.width) return null;
    const out = {};
    for (const side of ["left", "right"]) {
      const hand = signals.hands?.[side];
      if (!hand?.visible || hand.x == null) return null;
      out[side] = {
        dx: (hand.x - sh.x) / sh.width,
        dy: (hand.y - sh.y) / sh.width,
      };
    }
    return out;
  }

  /** Worst-case wrist error against the target, in shoulder widths. */
  static error(offsets, target) {
    return Math.max(
      Math.hypot(offsets.left.dx - target.left.dx, offsets.left.dy - target.left.dy),
      Math.hypot(offsets.right.dx - target.right.dx, offsets.right.dy - target.right.dy),
    );
  }

  tick(dt, signals, now, view = { w: 1, h: 1 }) {
    const result = { over: false, matched: 0, expired: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }
    if (!signals.inFrame) return result;

    const offsets = PoseMatch.offsets(signals);
    this.error = offsets ? PoseMatch.error(offsets, this.target) : null;
    const wasMatching = this.matching;
    this.matching = this.error != null && this.error <= this.tolerance;

    if (this.matching) {
      // A short rising click as the hold fills tells you the shape is right
      // before the lock, which is the moment people give up and readjust.
      if (!wasMatching) this.cue("chime");
      this.held += dt * 1000;
      if (this.held >= this.holdMs) {
        this.countAction("hold");
        result.matched += this.award(0.5, 0.35, this.target.name, {
          color: "#facc15",
          count: 16,
        });
        this.#next();
        return result;
      }
    } else {
      // Decay rather than reset, so a momentary wobble is forgiving.
      this.held = Math.max(0, this.held - dt * 1400);
    }

    this.left -= dt;
    if (this.left <= 0) {
      result.expired += 1;
      const dead = this.penalise({ x: 0.5, y: 0.35, color: "#94a3b8" });
      this.#next();
      if (dead) {
        this.over = true;
        result.over = true;
      }
    }
    return result;
  }

  draw(ctx, view, signals, now) {
    const sh = signals.shoulder;
    // Kept in pose coordinates and mapped at the last moment, so the rings land
    // exactly where a hand would have to be to match them.
    const body =
      sh?.width ? { x: sh.x, y: sh.y, width: sh.width } : { x: 0.5, y: 0.4, width: 0.2 };

    this.#drawTarget(ctx, view, body, now);
    this.#drawHands(ctx, view, signals);
    drawParticles(ctx, view, this.particles);
    drawPops(ctx, view, this.pops);

    const pct = Math.round(clamp(this.held / this.holdMs, 0, 1) * 100);
    drawPrompt(
      ctx,
      view,
      this.target.name,
      this.matching ? `holding ${pct}%` : `${this.left.toFixed(1)}s`,
    );
    this.#drawTimer(ctx, view);
  }

  /** Ghost markers where the wrists need to be, anchored to your shoulders. */
  #drawTarget(ctx, view, body, now) {
    const r = unit(view) * 0.062;
    const pulse = 1 + Math.sin(now / 260) * 0.06;
    const anchor = { x: view.poseX(body.x), y: view.poseY(body.y) };
    // The inverse of offsets(): where a hand would sit if it matched.
    const spot = (t) => ({
      x: view.poseX(body.x + t.dx * body.width),
      y: view.poseY(body.y + t.dy * body.width),
    });

    this.#drawGhost(ctx, view, body);

    for (const side of ["left", "right"]) {
      const { x, y } = spot(this.target[side]);

      ctx.save();
      ctx.setLineDash([r * 0.5, r * 0.35]);
      ctx.lineWidth = Math.max(3, r * 0.2);
      ctx.strokeStyle = this.matching ? "#22c55e" : "#eab308";
      ctx.fillStyle = this.matching ? "rgba(34,197,94,0.22)" : "rgba(234,179,8,0.18)";
      ctx.beginPath();
      ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Guide line from the shoulder centre so the shape is readable.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
    }

    if (this.held <= 0) return;
    // Fill the ring as the hold builds.
    const k = clamp(this.held / this.holdMs, 0, 1);
    for (const side of ["left", "right"]) {
      const { x, y } = spot(this.target[side]);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.25, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      ctx.lineWidth = Math.max(3, r * 0.18);
      ctx.strokeStyle = "#22c55e";
      ctx.stroke();
    }
  }

  /**
   * The shape itself, faint, standing where the player is standing.
   *
   * Two rings and the words "Wide V" ask the player to work out the pose and
   * then copy it. A body already in the pose, sized to their shoulders and
   * laid over their own reflection, is something to line up against instead —
   * and it costs nothing extra to know, since the pose is already stored as
   * wrist offsets in shoulder widths, which is exactly how Pip is built.
   */
  #drawGhost(ctx, view, body) {
    // One shoulder width on screen, matched to the 50 units Pip is wide.
    const wide = Math.abs(view.poseX(body.x + body.width) - view.poseX(body.x));
    const k = wide / (BODY.shoulderHalf * 2);
    if (!(k > 0) || !Number.isFinite(k)) return;

    // Pose offsets are from the shoulder centre, and so is Pip's shoulder
    // line, so the two line up by construction.
    const paw = (t) => ({ x: t.dx * BODY.shoulderHalf * 2, y: BODY.shoulderY + t.dy * BODY.shoulderHalf * 2 });

    ctx.save();
    ctx.globalAlpha = this.matching ? 0.5 : 0.32;
    ctx.translate(view.poseX(body.x), view.poseY(body.y));
    ctx.scale(k, k);
    ctx.translate(0, -BODY.shoulderY);
    drawPip(ctx, {
      effort: this.matching ? 0.2 : 0.5,
      arms: { left: paw(this.target.left), right: paw(this.target.right) },
    });
    ctx.restore();
  }

  #drawHands(ctx, view, signals) {
    const r = unit(view) * 0.032;
    for (const [side, hand] of Object.entries(signals.hands ?? {})) {
      if (!hand?.visible || hand.x == null) continue;
      ctx.beginPath();
      ctx.arc(view.poseX(hand.x), view.poseY(hand.y), r, 0, Math.PI * 2);
      ctx.fillStyle = side === "left" ? "#38bdf8" : "#fb923c";
      ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.25);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
    }
  }

  #drawTimer(ctx, view) {
    const limit =
      (this.timeLimitMs - (this.timeLimitMs - this.fastestLimitMs) * this.progress()) / 1000;
    const k = clamp(this.left / limit, 0, 1);
    const h = unit(view) * 0.016;
    const y = view.h - h * 3;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(view.w * 0.1, y, view.w * 0.8, h);
    ctx.fillStyle = k < 0.3 ? "#ef4444" : "#eab308";
    ctx.fillRect(view.w * 0.1, y, view.w * 0.8 * k, h);
  }
}
