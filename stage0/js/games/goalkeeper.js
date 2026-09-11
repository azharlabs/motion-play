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
 * Goalkeeper - shots come at the camera and you put a hand in the way.
 *
 * Each ball has a flight time rather than a position-based speed, so the shot
 * always arrives when the on-screen wind-up says it will. The ball is drawn
 * growing from the centre to sell the approach.
 */
export function createGame(opts = {}) {
  return new Goalkeeper(opts);
}

class Goalkeeper extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 80_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "thud",
      clearsPerLevel: opts.clearsPerLevel ?? 4,
    });
    this.flightMs = opts.flightMs ?? 1500;
    this.fastestMs = opts.fastestMs ?? 850;
    this.gapMs = opts.gapMs ?? 1900;
    // How close a hand must be when the ball lands, in shortest-side fractions.
    this.saveRadius = opts.saveRadius ?? 0.13;
    this.reset();
  }

  reset() {
    super.reset();
    this.shots = [];
    this.spawnTimer = 0.9;
    this.nextId = 1;
    this.flash = 0;
    this.lastResult = null;
    this.hands = new HandPaths();
  }

  #spawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const t = this.ramp();
    this.spawnTimer = Math.max(0.9, (this.gapMs / 1000) * (1 - 0.45 * t));

    this.shots.push({
      id: this.nextId++,
      // Corners are more interesting than the middle, but stay reachable.
      x: 0.2 + Math.random() * 0.6,
      y: 0.25 + Math.random() * 0.42,
      born: null,
      flight: (this.flightMs - (this.flightMs - this.fastestMs) * t) / 1000,
      age: 0,
      settled: false,
    });
    // The strike is audible, so you can start moving before you find the ball.
    this.cue("tick");
  }

  tick(dt, signals, now, view) {
    const result = { over: false, saved: 0, conceded: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    this.flash = Math.max(0, this.flash - dt * 3);
    if (!signals.inFrame) {
      this.hands.reset();
      return result;
    }

    this.#spawn(dt);
    const box = view ?? { w: 1, h: 1 };
    const reach = unit(box) * this.saveRadius;
    const paths = this.hands.update(box, signals, now);

    for (const shot of this.shots) {
      if (shot.settled) {
        shot.age += dt;
        continue;
      }
      shot.age += dt;
      if (shot.age < shot.flight) continue;

      // The ball has arrived: is a hand on it?
      shot.settled = true;
      const sx = shot.x * box.w;
      const sy = shot.y * box.h;
      // A dive that swept through the ball is a save, even if the reading
      // taken as the ball landed caught the hand already past it.
      const saved = paths.some(({ from, to }) => distanceToPath(from, to, sx, sy) <= reach);

      shot.saved = saved;
      if (saved) {
        // A save is a reach that got there. Dives that fell short are not
        // counted, because the game only ever sees the contact.
        this.countAction("reach");
        result.saved += this.award(shot.x, shot.y, "SAVE", { color: "#22c55e", count: 12 });
        this.lastResult = "save";
      } else {
        this.flash = 1;
        this.lastResult = "goal";
        result.conceded += 1;
        if (this.penalise({ x: shot.x, y: shot.y, color: "#ef4444" })) {
          this.over = true;
          result.over = true;
        }
      }
    }

    this.shots = this.shots.filter((s) => !s.settled || s.age - s.flight < 0.6);
    return result;
  }

  draw(ctx, view, signals) {
    this.#drawGoal(ctx, view);

    withShake(ctx, this.shake, () => {
      for (const shot of this.shots) this.#drawShot(ctx, view, shot);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      drawHandCursors(ctx, view, signals, { radius: this.saveRadius * 0.62 });
    });

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(239,68,68,${this.flash * 0.35})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  #drawGoal(ctx, view) {
    const m = unit(view) * 0.055;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(4, unit(view) * 0.018);
    ctx.strokeRect(m, m * 1.4, view.w - m * 2, view.h - m * 3);

    // Netting, kept faint so it never competes with the ball.
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.5;
    const step = unit(view) * 0.075;
    ctx.beginPath();
    for (let x = m; x < view.w - m; x += step) {
      ctx.moveTo(x, m * 1.4);
      ctx.lineTo(x, view.h - m * 1.6);
    }
    for (let y = m * 1.4; y < view.h - m * 1.6; y += step) {
      ctx.moveTo(m, y);
      ctx.lineTo(view.w - m, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  #drawShot(ctx, view, shot) {
    const x = shot.x * view.w;
    const y = shot.y * view.h;
    const full = unit(view) * 0.085;

    if (shot.settled) {
      const k = clamp((shot.age - shot.flight) / 0.6, 0, 1);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = shot.saved ? "#22c55e" : "#ef4444";
      ctx.lineWidth = Math.max(3, full * 0.22);
      ctx.beginPath();
      ctx.arc(x, y, full * (1 + k * 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    const k = clamp(shot.age / shot.flight, 0, 1);
    const r = full * (0.18 + k * 0.82);

    // A shrinking ring telegraphs where and when the ball lands.
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(2, full * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, full * (2.1 - k * 1.1), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.stroke();

    // Panel marks so the ball reads as a football, not a dot.
    ctx.fillStyle = "#1f2937";
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + shot.age * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
