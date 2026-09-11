import {
  BaseGame,
  clamp,
  distanceToPath,
  drawHandCursors,
  drawParticles,
  drawPops,
  HandPaths,
  unit,
  withShake,
} from "./common.js";

/**
 * Balloon Pop - played over the mirrored camera image.
 *
 * Positions are kept in the same normalised display space the motion signals
 * use, so a hand and a balloon that look like they touch really do touch. Sizes
 * and hit tests are resolved in pixels, which keeps circles round on any
 * screen shape.
 */
const COLORS = [
  ["#ff5d8f", "#ff9ebb"],
  ["#4cc9f0", "#a8e8ff"],
  ["#ffd166", "#ffe7a3"],
  ["#8ac926", "#c5ec86"],
  ["#c77dff", "#e6c6ff"],
];

export function createGame(opts = {}) {
  return new BalloonPop(opts);
}

class BalloonPop extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 60_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "pop",
      clearsPerLevel: opts.clearsPerLevel ?? 6,
    });
    this.spawnEvery = opts.spawnEvery ?? 1.5;
    this.riseBase = opts.riseBase ?? 0.11; // screen heights per second
    this.riseMax = opts.riseMax ?? 0.3;
    this.reset();
  }

  reset() {
    super.reset();
    this.balloons = [];
    this.spawnTimer = 0.4;
    this.nextId = 1;
    this.hands = new HandPaths();
  }

  /** Balloon radius in pixels, tuned to stay thumb-friendly on a phone. */
  static radius(view, size = 1) {
    return unit(view) * 0.082 * size;
  }

  #riseSpeed() {
    return this.riseBase + (this.riseMax - this.riseBase) * this.ramp();
  }

  #spawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    // Tighten the gap as the round goes on, down to about a third of the
    // opening pace by the final seconds.
    this.spawnTimer = Math.max(0.5, this.spawnEvery * (1 - 0.66 * this.ramp()));

    const pair = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.balloons.push({
      id: this.nextId++,
      x: 0.12 + Math.random() * 0.76,
      y: 1.12,
      drift: (Math.random() - 0.5) * 0.05,
      wobble: Math.random() * Math.PI * 2,
      size: 0.85 + Math.random() * 0.35,
      speed: this.#riseSpeed() * (0.85 + Math.random() * 0.3),
      color: pair[0],
      shine: pair[1],
      popping: 0,
    });
  }

  tick(dt, signals, now, view) {
    const result = { over: false, popped: 0, missed: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    // Nothing moves while the camera cannot see the player.
    if (!signals.inFrame) {
      this.hands.reset();
      return result;
    }

    this.#spawn(dt);

    const box = view ?? { w: 1, h: 1 };
    const hands = this.hands.update(box, signals, now);

    for (const b of this.balloons) {
      if (b.popping > 0) {
        b.popping -= dt * 4;
        continue;
      }

      b.y -= b.speed * dt;
      b.wobble += dt * 2.2;
      b.x = clamp(b.x + Math.sin(b.wobble) * b.drift * dt, 0.06, 0.94);

      const r = BalloonPop.radius(box, b.size);
      const bx = b.x * box.w;
      const by = b.y * box.h;

      for (const { from, to } of hands) {
        const reach = r + unit(box) * 0.045;
        if (distanceToPath(from, to, bx, by) > reach) continue;
        b.popping = 1;
        // Only completed reaches are counted. A swing at thin air is invisible
        // to the game, so the log under-reports rather than inventing effort.
        this.countAction("reach");
        result.popped += this.award(b.x, b.y, null, { color: b.color, count: 12 });
        break;
      }

      if (b.popping === 0 && b.y < -0.12) {
        b.escaped = true;
        result.missed += 1;
        if (this.penalise({ x: 0.5, y: 0.06, color: b.color })) {
          this.over = true;
          result.over = true;
        }
      }
    }

    // Keep live balloons and ones still playing their burst animation.
    this.balloons = this.balloons.filter(
      (b) => !b.escaped && (b.popping === 0 || b.popping > 0.02),
    );
    return result;
  }

  draw(ctx, view, signals, now) {
    withShake(ctx, this.shake, () => {
      for (const b of this.balloons) {
        const r = BalloonPop.radius(view, b.size);
        const x = b.x * view.w;
        const y = b.y * view.h;
        if (b.popping > 0) this.#drawBurst(ctx, x, y, r, b, 1 - b.popping);
        else this.#drawBalloon(ctx, x, y, r, b);
      }
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      drawHandCursors(ctx, view, signals);
    });
    void now;
  }

  #drawBalloon(ctx, x, y, r, b) {
    const sway = Math.sin(b.wobble) * r * 0.12;

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = Math.max(1.5, r * 0.055);
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.98);
    ctx.quadraticCurveTo(x + sway, y + r * 1.5, x - sway * 0.6, y + r * 2.1);
    ctx.stroke();

    // Body, slightly taller than wide like a real balloon.
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    grad.addColorStop(0, b.shine);
    grad.addColorStop(1, b.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.88, r, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.stroke();

    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.13, y + r * 0.97);
    ctx.lineTo(x + r * 0.13, y + r * 0.97);
    ctx.lineTo(x, y + r * 1.18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.17, r * 0.26, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawBurst(ctx, x, y, r, b, t) {
    const spread = r * (1 + t * 1.6);
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = b.color;
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * spread, y + Math.sin(a) * spread, r * 0.2 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
