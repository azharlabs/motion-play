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
 * Ski Slalom - lean to carve down the hill and pass inside every gate.
 *
 * Unlike Lane Runner this is continuous rather than snapped to lanes, so lean
 * maps straight to a position with a little momentum behind it.
 */
export const SKIER_Y = 0.7;

export function createGame(opts = {}) {
  return new SkiSlalom(opts);
}

class SkiSlalom extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 90_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "chime",
      clearsPerLevel: opts.clearsPerLevel ?? 6,
    });
    this.speed = opts.speed ?? 0.42; // screen heights per second
    this.maxSpeed = opts.maxSpeed ?? 0.85;
    this.spacing = opts.spacing ?? 0.62; // screen heights between gates
    this.gateWidth = opts.gateWidth ?? 0.3;
    this.minGateWidth = opts.minGateWidth ?? 0.19;
    // How far a full lean carries you from the centre.
    this.travel = opts.travel ?? 0.36;
    this.sky = {};
    this.reset();
  }

  reset() {
    super.reset();
    this.gates = [];
    this.x = 0.5;
    this.targetX = 0.5;
    this.scroll = 0;
    this.nextId = 1;
    this.spawnAt = 0.5;
    this.tilt = 0;
    this.carveLeft = new Rep(0.35, 0.12);
    this.carveRight = new Rep(0.35, 0.12);
  }

  currentSpeed() {
    return lerp(this.speed, this.maxSpeed, this.ramp());
  }

  currentWidth() {
    return lerp(this.gateWidth, this.minGateWidth, this.ramp());
  }

  tick(dt, signals, now, view = { w: 1, h: 1 }) {
    const result = { over: false, passed: 0, missed: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }
    if (!signals.inFrame) return result;

    // Steering is continuous, so a carve is counted as a committed lean to one
    // side: you have to come back towards upright before the next one counts.
    const lean = signals.lean ?? 0;
    if (this.carveLeft.step(-lean) || this.carveRight.step(lean)) this.countAction("lean");

    this.targetX = clamp(0.5 + lean * this.travel, 0.08, 0.92);
    const prev = this.x;
    this.x = lerp(this.x, this.targetX, approach(6.5, dt));
    this.tilt = clamp((this.x - prev) / Math.max(dt, 0.001) * 1.6, -1, 1);

    const speed = this.currentSpeed();
    this.scroll += speed * dt;

    this.spawnAt -= speed * dt;
    if (this.spawnAt <= 0) {
      this.spawnAt = this.spacing;
      const width = this.currentWidth();
      this.gates.push({
        id: this.nextId++,
        y: -0.18,
        // Keep both flags on screen whatever the gate width is.
        center: clamp(0.2 + Math.random() * 0.6, width / 2 + 0.06, 1 - width / 2 - 0.06),
        width,
        judged: false,
      });
    }

    for (const gate of this.gates) {
      gate.y += speed * dt;
      if (gate.judged || gate.y < SKIER_Y) continue;

      gate.judged = true;
      const inside = Math.abs(this.x - gate.center) <= gate.width / 2;
      gate.clean = inside;
      if (inside) {
        // Spray thrown up behind the skis, so it reads as a carve.
        result.passed += this.award(this.x, SKIER_Y, null, { color: "#e0f2fe", count: 8 });
      } else {
        result.missed += 1;
        if (this.penalise({ x: gate.center, y: SKIER_Y, color: "#ef4444" })) {
          this.over = true;
          result.over = true;
        }
      }
    }

    this.gates = this.gates.filter((g) => g.y < 1.25);
    return result;
  }

  draw(ctx, view, signals, now) {
    const { w, h } = view;
    ctx.fillStyle = skyGradient(this.sky, ctx, h, [
      [0, "#e0f2fe"],
      [1, "#ffffff"],
    ]);
    ctx.fillRect(0, 0, w, h);
    this.#drawPiste(ctx, view);

    withShake(ctx, this.shake, () => {
      for (const gate of this.gates) this.#drawGate(ctx, view, gate);
      this.#drawSkier(ctx, view, now);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
    });
    void signals;
  }

  /** Moguls scrolling past give the hill a sense of speed. */
  #drawPiste(ctx, view) {
    const { w, h } = view;
    ctx.fillStyle = "rgba(148,197,232,0.28)";
    const spacing = 0.17;
    for (let i = 0; i < 8; i += 1) {
      const y = (((i * spacing + this.scroll) % 1.2) - 0.1) * h;
      const x = (0.14 + ((i * 37) % 10) / 13) * w;
      ctx.beginPath();
      ctx.ellipse(x, y, unit(view) * 0.07, unit(view) * 0.024, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawGate(ctx, view, gate) {
    const { w, h } = view;
    const y = gate.y * h;
    const poleH = unit(view) * 0.17;
    const left = (gate.center - gate.width / 2) * w;
    const right = (gate.center + gate.width / 2) * w;
    const done = gate.judged;
    const colour = done ? (gate.clean ? "#22c55e" : "#94a3b8") : "#ef4444";
    const colourB = done ? (gate.clean ? "#22c55e" : "#94a3b8") : "#3b82f6";

    // A faint band between the flags shows the line to take.
    ctx.fillStyle = done
      ? "rgba(148,163,184,0.12)"
      : gate.clean === undefined
        ? "rgba(59,130,246,0.1)"
        : "rgba(148,163,184,0.12)";
    ctx.fillRect(left, y - poleH * 0.1, right - left, poleH * 0.16);

    for (const [x, c, dir] of [
      [left, colour, 1],
      [right, colourB, -1],
    ]) {
      ctx.fillStyle = "#64748b";
      ctx.fillRect(x - unit(view) * 0.006, y - poleH, unit(view) * 0.012, poleH);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x, y - poleH);
      ctx.lineTo(x + dir * unit(view) * 0.075, y - poleH * 0.82);
      ctx.lineTo(x, y - poleH * 0.62);
      ctx.closePath();
      ctx.fill();
    }
  }

  #drawSkier(ctx, view, now) {
    const x = this.x * view.w;
    const y = SKIER_Y * view.h;
    const s = unit(view) * 0.055;

    // Spray kicks out on the outside of the turn.
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 5; i += 1) {
      const k = i / 5;
      ctx.beginPath();
      ctx.arc(
        x - this.tilt * s * (0.8 + k * 2.2),
        y + s * (0.7 + k * 0.9),
        s * (0.26 - k * 0.04),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.tilt * 0.35);

    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = s * 0.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, s * 0.85);
    ctx.lineTo(-s * 0.42, -s * 0.2);
    ctx.moveTo(s * 0.42, s * 0.85);
    ctx.lineTo(s * 0.42, -s * 0.2);
    ctx.stroke();

    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.roundRect(-s * 0.5, -s * 0.75, s, s * 1.05, s * 0.3);
    ctx.fill();

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(0, -s * 1.0, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0ea5e9";
    ctx.beginPath();
    ctx.ellipse(0, -s * 1.02, s * 0.34, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    void now;
  }
}
