import {
  BaseGame,
  clamp,
  drawParticles,
  drawPops,
  lerp,
  Rep,
  unit,
  withShake,
} from "./common.js";

/**
 * Hand Snake - the snake chases your hand, and the tail is the problem.
 *
 * The original this comes from steered by counting how many fingers were
 * folded: three closed meant up, five meant down. That needs a hand model
 * with knuckles in it, and it turns a game about a moving line into a game
 * about holding a shape still. Here the hand is simply where the snake wants
 * to be, which is a movement the camera reads reliably from across a room and
 * which asks the arm to travel rather than to pose.
 *
 * What makes it a game is that the snake cannot turn on the spot. It banks at
 * a fixed rate, so the hand has to lead it round a corner rather than drag it,
 * and a tail long enough to cross your own path turns the whole screen into
 * something to be steered out of.
 */

const TAU = Math.PI * 2;

/** Body thickness, and the spacing of the trail, as fractions of the view. */
const GIRTH = 0.032;
const APPLE_R = 0.03;

export function createGame(opts = {}) {
  return new HandSnake(opts);
}

class HandSnake extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 75_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "pop",
      clearsPerLevel: opts.clearsPerLevel ?? 4,
    });
    // Screen heights per second, at the first level and at the last.
    this.slowest = opts.slowest ?? 0.3;
    this.fastest = opts.fastest ?? 0.56;
    // Radians per second. Low enough that the hand has to lead the corner.
    this.turnRate = opts.turnRate ?? 4.6;
    this.growth = opts.growth ?? 0.16; // body lengths added per apple
    this.reset();
  }

  reset() {
    super.reset();
    this.head = { x: 0.5, y: 0.5 };
    this.heading = 0;
    // Where the body has been, newest last, in display space.
    this.trail = [{ x: 0.5, y: 0.5 }];
    this.length = 0.34; // in fractions of the view height
    this.apple = { x: 0.78, y: 0.3 };
    this.graceS = 0;
    this.reaches = new Rep(1.1, 0.5);
    this.hand = null;
  }

  /** How fast the snake is travelling at the level it has reached. */
  speed() {
    return lerp(this.slowest, this.fastest, this.ramp());
  }

  /**
   * The hand the snake is following, in the same space the snake lives in.
   *
   * Hands arrive in pose space, which for a camera backdrop is cropped
   * differently from the canvas; running both through the view's mapping and
   * back out again puts them on the same picture, so the snake arrives where
   * the player can see their own hand.
   */
  static target(signals, view) {
    let best = null;
    for (const hand of Object.values(signals.hands ?? {})) {
      if (!hand?.visible || hand.x == null) continue;
      if (!best || hand.speed > best.speed) best = hand;
    }
    if (!best) return null;
    return {
      x: view.poseX(best.x) / view.w,
      y: view.poseY(best.y) / view.h,
      speed: best.speed,
    };
  }

  /** Somewhere clear of the snake to put the next apple. */
  #place(view) {
    let best = { x: 0.5, y: 0.5 };
    let bestGap = -1;
    for (let i = 0; i < 12; i += 1) {
      const spot = { x: 0.12 + Math.random() * 0.76, y: 0.14 + Math.random() * 0.72 };
      let gap = Infinity;
      for (const p of this.trail) gap = Math.min(gap, dist(spot, p, view));
      if (gap > bestGap) {
        bestGap = gap;
        best = spot;
      }
      if (bestGap > GIRTH * 4) break;
    }
    this.apple = best;
  }

  /** Advance the head, and drag the body along behind it. */
  #swim(dt, target, view) {
    if (target) {
      // Turn towards the hand, but only as fast as the snake can bank.
      const want = Math.atan2(
        (target.y - this.head.y) * view.h,
        (target.x - this.head.x) * view.w,
      );
      let turn = want - this.heading;
      while (turn > Math.PI) turn -= TAU;
      while (turn < -Math.PI) turn += TAU;
      this.heading += clamp(turn, -this.turnRate * dt, this.turnRate * dt);
    }

    // Travelling at a constant speed on screen, not a constant speed in a
    // space that is taller than it is wide.
    const step = this.speed() * dt;
    this.head.x += (Math.cos(this.heading) * step * view.h) / view.w;
    this.head.y += Math.sin(this.heading) * step;

    // The edges wrap. A wall that kills would end most rounds in the first
    // few seconds, when the snake is still being learnt.
    if (this.head.x < 0) this.head.x += 1;
    if (this.head.x > 1) this.head.x -= 1;
    if (this.head.y < 0) this.head.y += 1;
    if (this.head.y > 1) this.head.y -= 1;

    const last = this.trail[this.trail.length - 1];
    // A wrap teleports the head, so start a fresh run rather than drawing a
    // body segment straight across the screen.
    if (!last || dist(this.head, last, view) > 0.4) this.trail.push({ ...this.head, cut: true });
    else if (dist(this.head, last, view) > GIRTH * 0.35) this.trail.push({ ...this.head });

    this.#trim(view);
  }

  /** Drop the oldest points once the body is longer than it should be. */
  #trim(view) {
    let run = 0;
    for (let i = this.trail.length - 1; i > 0; i -= 1) {
      run += dist(this.trail[i], this.trail[i - 1], view);
      if (run > this.length) {
        this.trail.splice(0, i - 1);
        return;
      }
    }
  }

  /** How far back along the body a point is, or null if it is not on it. */
  #bitesSelf(view) {
    let run = 0;
    for (let i = this.trail.length - 1; i > 0; i -= 1) {
      run += dist(this.trail[i], this.trail[i - 1], view);
      // The neck is always within a body's width of the head; only the part
      // beyond it is something the snake can actually run into.
      if (run < GIRTH * 2.6) continue;
      if (dist(this.head, this.trail[i], view) < GIRTH * 0.85) return true;
    }
    return false;
  }

  tick(dt, signals, now, view) {
    const result = { over: false, eaten: 0, bitten: false };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    const box = view ?? { w: 1, h: 1 };
    this.graceS = Math.max(0, this.graceS - dt);

    // The snake stops rather than wanders off while the player is away.
    if (!signals.inFrame) {
      this.hand = null;
      return result;
    }

    const target = HandSnake.target(signals, box);
    this.hand = target;
    // A reach is the arm travelling, whether or not it caught anything.
    if (this.reaches.step(target?.speed ?? 0)) this.countAction("reach");

    this.#swim(dt, target, box);

    if (dist(this.head, this.apple, box) < APPLE_R + GIRTH * 0.5) {
      this.length += this.growth;
      result.eaten += this.award(this.apple.x, this.apple.y, null, {
        color: "#f87171",
        count: 12,
        popY: this.apple.y - APPLE_R * 2,
      });
      this.#place(box);
    }

    if (this.graceS <= 0 && this.#bitesSelf(box)) {
      result.bitten = true;
      // Back to a starter length, or the same crash repeats every frame.
      this.length = 0.34;
      this.trail = [{ ...this.head, cut: true }];
      this.graceS = 1.2;
      if (this.penalise({ x: this.head.x, y: this.head.y, color: "#22c55e" })) {
        this.over = true;
        result.over = true;
      }
    }

    return result;
  }

  draw(ctx, view, signals) {
    void signals;
    withShake(ctx, this.shake, () => {
      this.#drawApple(ctx, view);
      this.#drawBody(ctx, view);
      this.#drawHead(ctx, view);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      this.#drawLead(ctx, view);
    });
  }

  #drawApple(ctx, view) {
    const r = unit(view) * APPLE_R;
    const x = this.apple.x * view.w;
    const y = this.apple.y * view.h;

    ctx.fillStyle = "rgba(8,15,25,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.9, r * 0.8, r * 0.28, 0, 0, TAU);
    ctx.fill();

    const skin = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    skin.addColorStop(0, "#fca5a5");
    skin.addColorStop(0.6, "#ef4444");
    skin.addColorStop(1, "#991b1b");
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#7c4a12";
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.85);
    ctx.quadraticCurveTo(x + r * 0.2, y - r * 1.4, x + r * 0.1, y - r * 1.5);
    ctx.stroke();

    ctx.fillStyle = "#4d7c0f";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.55, y - r * 1.25, r * 0.42, r * 0.2, -0.5, 0, TAU);
    ctx.fill();
  }

  /**
   * The body, as one tapering stroke per unbroken run.
   *
   * Runs are split where the snake wrapped round an edge, so the body never
   * gets drawn as a stripe straight back across the screen.
   */
  #drawBody(ctx, view) {
    const w = unit(view) * GIRTH;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        for (const [width, colour] of [
          [w * 2, "rgba(22,101,52,0.55)"],
          [w * 1.62, "#22c55e"],
          [w * 0.7, "rgba(190,242,100,0.55)"],
        ]) {
          ctx.strokeStyle = colour;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(run[0].x * view.w, run[0].y * view.h);
          for (const p of run.slice(1)) ctx.lineTo(p.x * view.w, p.y * view.h);
          ctx.stroke();
        }
      }
      run = [];
    };

    for (const p of this.trail) {
      if (p.cut) flush();
      run.push(p);
    }
    flush();
    ctx.restore();
  }

  #drawHead(ctx, view) {
    const r = unit(view) * GIRTH;
    ctx.save();
    ctx.translate(this.head.x * view.w, this.head.y * view.h);
    ctx.rotate(this.heading);
    // Blinking off during the crash grace period says "that one did not
    // count" without a line of text.
    ctx.globalAlpha = this.graceS > 0 && Math.floor(this.graceS * 10) % 2 ? 0.45 : 1;

    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.25, r, 0, 0, TAU);
    ctx.fill();

    // Tongue, flicking.
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.lineTo(r * 1.8, 0);
    ctx.stroke();

    for (const s of [-1, 1]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(r * 0.42, s * r * 0.46, r * 0.34, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(r * 0.56, s * r * 0.46, r * 0.16, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A thread from the head to the hand, so it is obvious what is steering. */
  #drawLead(ctx, view) {
    if (!this.hand) return;
    const hx = this.hand.x * view.w;
    const hy = this.hand.y * view.h;
    const r = unit(view) * 0.026;

    ctx.save();
    ctx.setLineDash([r * 0.5, r * 0.6]);
    ctx.strokeStyle = "rgba(190,242,100,0.5)";
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(this.head.x * view.w, this.head.y * view.h);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(190,242,100,0.9)";
    ctx.lineWidth = Math.max(2, r * 0.2);
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** Distance between two display-space points, measured on the screen. */
function dist(a, b, view) {
  const dx = (a.x - b.x) * view.w;
  const dy = (a.y - b.y) * view.h;
  return Math.hypot(dx, dy) / Math.min(view.w, view.h);
}
