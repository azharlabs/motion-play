import {
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
 * Orbit Keeper - your arms and legs are the bats.
 *
 * Nothing here is scripted. The balls fall, your limbs are in the way, and
 * the difficulty is whatever comes out of that: a ball nudged gently goes up
 * gently, a ball met with a swinging forearm goes across the room. Because
 * the limb's own speed is added to the bounce, keeping three in the air is a
 * problem you solve with timing rather than with position, which is the one
 * thing none of the other games ask for.
 *
 * The bounce is worked out here rather than handed to the physics engine the
 * runner uses. That engine models a body as one box that jumps and ducks,
 * which is the wrong shape entirely; and a limb is a line segment that
 * teleports a little every frame, which a rigid-body solver handles badly and
 * a circle-against-capsule test handles exactly.
 */

/** How bouncy a limb is. Under one, or a ball parked on a still arm creeps. */
const BOUNCE = 0.72;

/** How much of the limb's own speed goes into the ball it strikes. */
const TRANSFER = 1.15;

/** Segments of the body, as pairs of landmarks, and what they count as. */
const LIMBS = [
  { a: IDX.LEFT_SHOULDER, b: IDX.LEFT_ELBOW, as: "reach" },
  { a: IDX.LEFT_ELBOW, b: IDX.LEFT_WRIST, as: "reach" },
  { a: IDX.RIGHT_SHOULDER, b: IDX.RIGHT_ELBOW, as: "reach" },
  { a: IDX.RIGHT_ELBOW, b: IDX.RIGHT_WRIST, as: "reach" },
  // Shoulders and hips as two bars rather than a closed torso: a ball can
  // pass between them instead of getting shut inside a box it cannot leave.
  { a: IDX.LEFT_SHOULDER, b: IDX.RIGHT_SHOULDER, as: null },
  { a: IDX.LEFT_HIP, b: IDX.RIGHT_HIP, as: null },
  { a: IDX.LEFT_HIP, b: IDX.LEFT_KNEE, as: "kick" },
  { a: IDX.RIGHT_HIP, b: IDX.RIGHT_KNEE, as: "kick" },
];

const COLORS = ["#38bdf8", "#f472b6", "#facc15", "#4ade80", "#c084fc"];

export function createGame(opts = {}) {
  return new OrbitKeeper(opts);
}

class OrbitKeeper extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 80_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "pop",
      clearsPerLevel: opts.clearsPerLevel ?? 4,
    });
    // Screen heights per second squared. Slow enough to get under.
    this.slowG = opts.slowG ?? 0.55;
    this.fastG = opts.fastG ?? 1.0;
    this.reset();
  }

  reset() {
    super.reset();
    this.balls = [];
    this.limbs = [];
    this.wasLimbs = new Map();
    this.bucket = 0.5; // fraction across the floor
    this.bucketDir = 1;
    this.dropped = 0;
    this.potted = 0;
    this.view = null;
    this.spawnIn = 0.8;
  }

  gravity(view) {
    return lerp(this.slowG, this.fastG, this.ramp()) * view.h;
  }

  /** How many balls should be in the air at the level reached. */
  wanted() {
    return 1 + Math.min(2, Math.floor(this.ramp() * 3));
  }

  static ballR(view) {
    return unit(view) * 0.048;
  }

  static limbR(view) {
    return unit(view) * 0.024;
  }

  /** Where the bucket sits, in pixels. */
  static bucketBox(view, at) {
    const w = view.w * 0.24;
    return { w, h: unit(view) * 0.09, x: (view.w - w) * at, y: view.h * 0.9 };
  }

  /**
   * The body as a set of line segments in view pixels, with how fast each end
   * is travelling, so a swing can throw a ball rather than just stop it.
   */
  #readLimbs(signals, view, dt) {
    const marks = signals.landmarks;
    const out = [];
    if (!marks) {
      this.wasLimbs = new Map();
      return out;
    }

    const seen = new Map();
    const at = (i) => {
      const p = marks[i];
      if (!p || Math.max(p.visibility ?? 0, p.presence ?? 0) < 0.4) return null;
      // Landmarks are unmirrored; the game is played in the picture the
      // player sees, so x flips.
      return { x: view.poseX(1 - p.x), y: view.poseY(p.y) };
    };

    for (const limb of LIMBS) {
      const a = at(limb.a);
      const b = at(limb.b);
      if (!a || !b) continue;
      const key = `${limb.a}-${limb.b}`;
      const was = this.wasLimbs.get(key);
      const vel = (now, before) =>
        was && dt > 0 ? { x: (now.x - before.x) / dt, y: (now.y - before.y) / dt } : { x: 0, y: 0 };
      out.push({ a, b, va: vel(a, was?.a), vb: vel(b, was?.b), as: limb.as });
      seen.set(key, { a, b });
    }
    this.wasLimbs = seen;
    return out;
  }

  #spawn(view) {
    const r = OrbitKeeper.ballR(view);
    this.balls.push({
      x: view.w * (0.25 + Math.random() * 0.5),
      y: -r,
      vx: (Math.random() - 0.5) * view.w * 0.12,
      vy: 0,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      spin: 0,
      lit: 0,
    });
  }

  /** Keep ball positions sensible if the canvas changes shape mid-round. */
  #rescale(view) {
    const was = this.view;
    this.view = { w: view.w, h: view.h };
    if (!was || (was.w === view.w && was.h === view.h)) return;
    const kx = view.w / was.w;
    const ky = view.h / was.h;
    for (const ball of this.balls) {
      ball.x *= kx;
      ball.y *= ky;
      ball.vx *= kx;
      ball.vy *= ky;
    }
  }

  tick(dt, signals, now, view) {
    const result = { over: false, potted: 0, dropped: 0, struck: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    const box = view ?? { w: 400, h: 700, poseX: (n) => n * 400, poseY: (n) => n * 700 };
    this.#rescale(box);

    // The bucket slides regardless, so a ball has to be timed into it.
    const pace = lerp(0.1, 0.26, this.ramp());
    this.bucket += this.bucketDir * pace * dt;
    if (this.bucket > 1) {
      this.bucket = 1;
      this.bucketDir = -1;
    } else if (this.bucket < 0) {
      this.bucket = 0;
      this.bucketDir = 1;
    }

    this.limbs = signals.inFrame ? this.#readLimbs(signals, box, dt) : [];
    if (!signals.inFrame) return result;

    this.spawnIn -= dt;
    if (this.balls.length < this.wanted() && this.spawnIn <= 0) {
      this.#spawn(box);
      this.spawnIn = 1.2;
    }

    for (const ball of this.balls) this.#move(ball, dt, box, result);
    this.balls = this.balls.filter((b) => !b.gone);
    if (this.over) result.over = true;
    return result;
  }

  #move(ball, dt, view, result) {
    const r = OrbitKeeper.ballR(view);
    ball.vy += this.gravity(view) * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.lit = Math.max(0, ball.lit - dt * 4);
    ball.spin += ball.vx * dt * 0.02;

    // The sides are walls, so a wild swing does not simply lose the ball.
    if (ball.x < r) {
      ball.x = r;
      ball.vx = Math.abs(ball.vx) * 0.8;
    } else if (ball.x > view.w - r) {
      ball.x = view.w - r;
      ball.vx = -Math.abs(ball.vx) * 0.8;
    }

    for (const limb of this.limbs) {
      if (this.#bounce(ball, limb, r, OrbitKeeper.limbR(view))) {
        result.struck += 1;
        if (limb.as) this.countAction(limb.as);
        ball.lit = 1;
        this.cue("swipe");
      }
    }

    const bucket = OrbitKeeper.bucketBox(view, this.bucket);
    const inMouth =
      ball.vy > 0 &&
      ball.y + r >= bucket.y &&
      ball.y < bucket.y + bucket.h &&
      ball.x > bucket.x &&
      ball.x < bucket.x + bucket.w;
    if (inMouth) {
      ball.gone = true;
      this.potted += 1;
      result.potted += 1;
      this.award(ball.x / view.w, bucket.y / view.h, null, {
        color: ball.color,
        count: 18,
      });
      return;
    }

    if (ball.y - r > view.h) {
      ball.gone = true;
      this.dropped += 1;
      result.dropped += 1;
      if (this.penalise({ x: clamp(ball.x / view.w, 0, 1), y: 0.98, color: ball.color })) {
        this.over = true;
      }
    }
  }

  /**
   * Bounce a ball off one limb, if it is touching it.
   *
   * The limb's own speed at the point of contact is added before reflecting,
   * so a ball met by a moving arm leaves faster than it arrived and a ball
   * resting against a still arm simply sits there.
   */
  #bounce(ball, limb, r, limbR) {
    const ax = limb.a.x;
    const ay = limb.a.y;
    const dx = limb.b.x - ax;
    const dy = limb.b.y - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp(((ball.x - ax) * dx + (ball.y - ay) * dy) / len2, 0, 1) : 0;
    const qx = ax + dx * t;
    const qy = ay + dy * t;

    let nx = ball.x - qx;
    let ny = ball.y - qy;
    let gap = Math.hypot(nx, ny);
    const reach = r + limbR;
    if (gap > reach) return false;

    if (gap < 1e-6) {
      // Dead centre on the limb: push it out along the limb's normal rather
      // than dividing by nothing.
      nx = -dy;
      ny = dx;
      gap = Math.hypot(nx, ny) || 1;
    }
    nx /= gap;
    ny /= gap;

    // Out of the limb, then reflected about it.
    ball.x = qx + nx * reach;
    ball.y = qy + ny * reach;

    const lvx = lerp(limb.va.x, limb.vb.x, t) * TRANSFER;
    const lvy = lerp(limb.va.y, limb.vb.y, t) * TRANSFER;
    const rvx = ball.vx - lvx;
    const rvy = ball.vy - lvy;
    const into = rvx * nx + rvy * ny;
    // Already leaving: the limb caught up with it, not the other way round.
    if (into > 0) return false;

    ball.vx = lvx + (rvx - 2 * into * nx) * BOUNCE;
    ball.vy = lvy + (rvy - 2 * into * ny) * BOUNCE;
    return true;
  }

  summary() {
    return { ...super.summary(), potted: this.potted, dropped: this.dropped };
  }

  draw(ctx, view, signals, now) {
    void now;
    withShake(ctx, this.shake, () => {
      this.#drawBucket(ctx, view);
      this.#drawLimbs(ctx, view);
      for (const ball of this.balls) this.#drawBall(ctx, view, ball);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      if (!signals.inFrame) drawPrompt(ctx, view, "Step back", "Get your arms in shot");
    });
  }

  /** A faint trace along the limbs, so it is clear what the balls hit. */
  #drawLimbs(ctx, view) {
    if (!this.limbs.length) return;
    const r = OrbitKeeper.limbR(view);
    ctx.save();
    ctx.lineCap = "round";
    for (const [width, colour] of [
      [r * 2.2, "rgba(56,189,248,0.16)"],
      [r * 0.9, "rgba(186,230,253,0.5)"],
    ]) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const limb of this.limbs) {
        ctx.moveTo(limb.a.x, limb.a.y);
        ctx.lineTo(limb.b.x, limb.b.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawBall(ctx, view, ball) {
    const r = OrbitKeeper.ballR(view);
    ctx.save();
    ctx.fillStyle = "rgba(8,15,25,0.25)";
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + r * 1.1, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    const skin = ctx.createRadialGradient(
      ball.x - r * 0.35,
      ball.y - r * 0.4,
      r * 0.1,
      ball.x,
      ball.y,
      r,
    );
    skin.addColorStop(0, "#ffffff");
    skin.addColorStop(0.35, ball.color);
    skin.addColorStop(1, "rgba(15,23,42,0.9)");
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fill();

    // A flash on the frame it was struck, so contact is unmistakable.
    if (ball.lit > 0) {
      ctx.globalAlpha = ball.lit;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r * (1 + (1 - ball.lit) * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  #drawBucket(ctx, view) {
    const b = OrbitKeeper.bucketBox(view, this.bucket);
    ctx.save();
    // Open at the top, tapering, so it reads as something to drop into.
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w * 0.84, b.y + b.h);
    ctx.lineTo(b.x + b.w * 0.16, b.y + b.h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = Math.max(2, b.h * 0.16);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.w, b.y);
    ctx.stroke();

    // A guide down to the mouth, which is what makes aiming possible.
    ctx.setLineDash([b.h * 0.25, b.h * 0.3]);
    ctx.strokeStyle = "rgba(251,191,36,0.35)";
    ctx.lineWidth = Math.max(1, b.h * 0.08);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w / 2, b.y - view.h * 0.2);
    ctx.lineTo(b.x + b.w / 2, b.y);
    ctx.stroke();
    ctx.restore();
  }
}
