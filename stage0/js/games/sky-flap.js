import {
  BaseGame,
  approach,
  clamp,
  drawParticles,
  drawPops,
  lerp,
  Rep,
  skyGradient,
  unit,
  withShake,
} from "./common.js";

/**
 * Sky Flap - your hands are the altitude control.
 *
 * Hand height is used directly rather than through the jump detector, because
 * this is an upper-body game: hips and feet are usually out of shot. Raising
 * both hands flies high, dropping them dives.
 */
export const BIRD_X = 0.28;

export function createGame(opts = {}) {
  return new SkyFlap(opts);
}

class SkyFlap extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 90_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "chime",
      clearsPerLevel: opts.clearsPerLevel ?? 4,
    });
    this.speed = opts.speed ?? 0.3; // screen widths per second
    this.maxSpeed = opts.maxSpeed ?? 0.55;
    this.gap = opts.gap ?? 0.34; // fraction of height
    this.minGap = opts.minGap ?? 0.24;
    this.spacing = opts.spacing ?? 0.75; // screen widths between pipes
    // Hands resting low map to the bottom, raised overhead to the top.
    this.handLow = opts.handLow ?? 0.72;
    this.handHigh = opts.handHigh ?? 0.18;
    this.invulnerableMs = opts.invulnerableMs ?? 1200;
    this.sky = {};
    this.reset();
  }

  reset() {
    super.reset();
    this.pipes = [];
    this.birdY = 0.5;
    this.targetY = 0.5;
    this.tilt = 0;
    this.distance = 0;
    this.nextId = 1;
    this.invulnerableUntil = 0;
    this.invulnerable = false;
    this.spawnAt = 0.9;
    this.raises = new Rep(0.7, 0.4);
  }

  currentSpeed() {
    return lerp(this.speed, this.maxSpeed, this.ramp());
  }

  currentGap() {
    return lerp(this.gap, this.minGap, this.ramp());
  }

  /** Average height of whichever hands are visible, as a 0..1 target. */
  static handTarget(signals, low, high) {
    const hands = ["left", "right"]
      .map((s) => signals.hands?.[s])
      .filter((h) => h?.visible && h.y != null);
    if (!hands.length) return null;
    const avg = hands.reduce((a, h) => a + h.y, 0) / hands.length;
    return clamp((avg - high) / (low - high), 0, 1);
  }

  tick(dt, signals, now, view = { w: 1, h: 1 }) {
    const result = { over: false, passed: 0, hit: false };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    this.invulnerable = now < this.invulnerableUntil;
    if (!signals.inFrame) return result;

    const target = SkyFlap.handTarget(signals, this.handLow, this.handHigh);
    if (target != null) {
      this.targetY = clamp(0.08 + target * 0.84, 0.06, 0.94);
      // handTarget runs 0 at the top of your reach, so invert it: one arm
      // raise is counted each time the hands go up and come back down.
      if (this.raises.step(1 - target)) this.countAction("raise");
    }

    const prev = this.birdY;
    // Ease toward the hands so the bird glides instead of snapping.
    this.birdY = lerp(this.birdY, this.targetY, approach(7, dt));
    this.tilt = clamp((this.birdY - prev) / Math.max(dt, 0.001) * 0.6, -0.8, 0.8);

    const speed = this.currentSpeed();
    this.distance += speed * dt;

    this.spawnAt -= speed * dt;
    if (this.spawnAt <= 0) {
      this.spawnAt = this.spacing;
      const gap = this.currentGap();
      this.pipes.push({
        id: this.nextId++,
        x: 1.15,
        // Keep the gap fully on screen with room to reach it.
        center: 0.2 + Math.random() * 0.6,
        gap,
        passed: false,
      });
    }

    for (const pipe of this.pipes) {
      pipe.x -= speed * dt;

      const half = pipe.gap / 2;
      const overlapping = Math.abs(pipe.x - BIRD_X) < 0.06;
      const clear = this.birdY > pipe.center - half && this.birdY < pipe.center + half;

      if (overlapping && !clear && !this.invulnerable) {
        this.invulnerableUntil = now + this.invulnerableMs;
        this.invulnerable = true;
        result.hit = true;
        if (this.penalise({ x: BIRD_X, y: this.birdY, color: "#f8fafc" })) {
          this.over = true;
          result.over = true;
        }
      }

      if (!pipe.passed && pipe.x < BIRD_X - 0.06) {
        pipe.passed = true;
        if (clear || this.invulnerable) {
          result.passed += this.award(BIRD_X, this.birdY, null, {
            color: "#fde68a",
            count: 7,
          });
        }
      }
    }

    this.pipes = this.pipes.filter((p) => p.x > -0.2);
    return result;
  }

  draw(ctx, view, signals, now) {
    const { w, h } = view;
    ctx.fillStyle = skyGradient(this.sky, ctx, h, [
      [0, "#99f6e4"],
      [1, "#ecfeff"],
    ]);
    ctx.fillRect(0, 0, w, h);
    this.#drawClouds(ctx, view);

    withShake(ctx, this.shake, () => {
      for (const pipe of this.pipes) this.#drawPipe(ctx, view, pipe);
      this.#drawBird(ctx, view, now);
      this.#drawGuide(ctx, view, signals);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
    });
  }

  #drawClouds(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 4; i += 1) {
      const x = ((i * 0.31 - this.distance * 0.25) % 1.3 + 1.3) % 1.3;
      const y = (0.12 + i * 0.19) % 0.8;
      const r = unit(view) * (0.05 + (i % 2) * 0.02);
      ctx.beginPath();
      ctx.arc(x * w, y * h, r, 0, Math.PI * 2);
      ctx.arc(x * w + r, y * h + r * 0.2, r * 0.8, 0, Math.PI * 2);
      ctx.arc(x * w - r, y * h + r * 0.25, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawPipe(ctx, view, pipe) {
    const { w, h } = view;
    const pw = unit(view) * 0.16;
    const x = pipe.x * w - pw / 2;
    const half = (pipe.gap / 2) * h;
    const cy = pipe.center * h;
    const lip = pw * 0.22;

    ctx.fillStyle = "#0d9488";
    ctx.fillRect(x, 0, pw, cy - half);
    ctx.fillRect(x, cy + half, pw, h - (cy + half));

    ctx.fillStyle = "#14b8a6";
    ctx.fillRect(x - lip * 0.4, cy - half - lip, pw + lip * 0.8, lip);
    ctx.fillRect(x - lip * 0.4, cy + half, pw + lip * 0.8, lip);

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + pw * 0.14, 0, pw * 0.16, cy - half);
    ctx.fillRect(x + pw * 0.14, cy + half, pw * 0.16, h - (cy + half));
  }

  #drawBird(ctx, view, now) {
    const x = BIRD_X * view.w;
    const y = this.birdY * view.h;
    const r = unit(view) * 0.045;
    const blink = this.invulnerable && Math.floor(now / 110) % 2 === 0;

    ctx.save();
    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.translate(x, y);
    ctx.rotate(this.tilt * 0.5);

    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Wing flaps faster the harder the bird is climbing.
    const flap = Math.sin(now / 90) * 0.5 - 0.2;
    ctx.fillStyle = "#f59e0b";
    ctx.save();
    ctx.rotate(flap);
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, 0, r * 0.62, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(r * 0.85, -r * 0.1);
    ctx.lineTo(r * 1.5, 0);
    ctx.lineTo(r * 0.85, r * 0.22);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.arc(r * 0.44, -r * 0.3, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A faint marker showing where your hands are asking the bird to go. */
  #drawGuide(ctx, view, signals) {
    const target = SkyFlap.handTarget(signals, this.handLow, this.handHigh);
    if (target == null) return;
    const y = clamp(0.08 + target * 0.84, 0.06, 0.94) * view.h;
    ctx.save();
    ctx.setLineDash([unit(view) * 0.03, unit(view) * 0.025]);
    ctx.strokeStyle = "rgba(15,155,142,0.4)";
    ctx.lineWidth = Math.max(2, unit(view) * 0.006);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(BIRD_X * view.w, y);
    ctx.stroke();
    ctx.restore();
  }
}
