import {
  BaseGame,
  approach,
  clamp,
  drawParticles,
  drawPops,
  drawPrompt,
  lerp,
  unit,
  withShake,
} from "./common.js";

/**
 * Freeze Frame - creep forward on green, and be a statue on red.
 *
 * Every other game here scores movement, which means the only way to be bad
 * at them is to be still. This one inverts that: the green light pays for
 * moving, and the red light charges for it, so a round is a series of hard
 * stops rather than a steady effort. Stopping dead is a different skill from
 * moving well, and it is the one small children are worst at.
 *
 * Being caught has to be fair, which turns out to be the whole design. A
 * camera sees a still person as a slightly noisy one, and the noise is worse
 * in bad light, so a fixed threshold either lets a fidget through in a bright
 * room or catches a statue in a dim one. Instead the first moment of every
 * red light is spent watching how still "still" is for this player in this
 * room, and the bar is set from that.
 */

/** Movement is measured in the same units as hand speed: body widths a second. */
const FLOOR_MIN = 0.06;
const FLOOR_MAX = 0.4;

/** How long the light stays amber before it turns, at the first level. */
const WARN_S = 0.8;

/** Time at the start of a red light spent measuring, not judging. */
const SETTLE_S = 0.35;

/** Lamp radius, as a fraction of the screen height. */
const LAMP_R = 0.028;

/** How far down the word sits: clear of the bottom of the housing. */
const WORD_AT = 0.33;

export function createGame(opts = {}) {
  return new FreezeFrame(opts);
}

class FreezeFrame extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 75_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "pop",
      clearsPerLevel: opts.clearsPerLevel ?? 5,
    });
    // How much over the measured noise floor counts as moving.
    this.strictEasy = opts.strictEasy ?? 3.2;
    this.strictHard = opts.strictHard ?? 1.7;
    // Ground covered per second at a full-blooded march.
    this.pace = opts.pace ?? 0.32;
    this.reset();
  }

  reset() {
    super.reset();
    this.phase = "green";
    this.phaseLeft = 2.6;
    this.settle = 0;
    this.progress = 0;
    this.stir = 0;
    this.floor = FLOOR_MIN;
    this.caught = false;
    this.last = null;
    this.runs = 0;
  }

  /** Green lights shorten and red lights lengthen as the levels come. */
  #greenFor() {
    return lerp(3.4, 1.9, this.ramp()) * (0.85 + Math.random() * 0.3);
  }

  #redFor() {
    return lerp(1.9, 3.4, this.ramp()) * (0.85 + Math.random() * 0.3);
  }

  /** How far over the noise floor a movement has to be to be caught. */
  strictness() {
    return lerp(this.strictEasy, this.strictHard, this.ramp());
  }

  /** The bar this player has to stay under, on this red light. */
  bar() {
    return clamp(this.floor, FLOOR_MIN, FLOOR_MAX) * this.strictness();
  }

  /**
   * How much the body moved this frame, in body widths a second.
   *
   * Read off the smoothed signals rather than the raw landmarks: the filter
   * has already taken the model's per-frame jitter out of them, which is the
   * difference between measuring a person and measuring the camera.
   */
  #measure(signals, dt) {
    const now = {
      lx: signals.hands?.left?.visible ? signals.hands.left.x : null,
      ly: signals.hands?.left?.visible ? signals.hands.left.y : null,
      rx: signals.hands?.right?.visible ? signals.hands.right.x : null,
      ry: signals.hands?.right?.visible ? signals.hands.right.y : null,
      sx: signals.shoulder?.x ?? null,
      sy: signals.shoulder?.y ?? null,
      lean: signals.lean ?? 0,
      crouch: signals.crouch ?? 0,
    };
    const was = this.last;
    this.last = now;
    if (!was || dt <= 0) return 0;

    const width = signals.shoulder?.width || signals.scale || 0.2;
    const travel = (ax, ay, bx, by) =>
      ax == null || bx == null ? 0 : Math.hypot(ax - bx, ay - by) / width / dt;

    // The torso counts for more than the hands: shifting your weight is the
    // movement a statue is trying not to make, and it is a smaller number on
    // screen than a waving arm.
    return Math.max(
      travel(now.lx, now.ly, was.lx, was.ly),
      travel(now.rx, now.ry, was.rx, was.ry),
      travel(now.sx, now.sy, was.sx, was.sy) * 2.2,
      (Math.abs(now.lean - was.lean) / dt) * 0.6,
      (Math.abs(now.crouch - was.crouch) / dt) * 0.9,
    );
  }

  tick(dt, signals, now, view) {
    const result = { over: false, caught: false, home: false, light: this.phase };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    // Out of shot nothing is judged, or stepping away would cost three lives
    // in as many seconds.
    if (!signals.inFrame) {
      this.last = null;
      this.stir = 0;
      return result;
    }

    const raw = this.#measure(signals, dt);
    // Rises fast so a twitch is not averaged away, falls slowly so the whole
    // of a movement is seen rather than its last frame.
    const rate = raw > this.stir ? 30 : 5;
    this.stir += (raw - this.stir) * approach(rate, dt);

    this.phaseLeft -= dt;
    if (this.phase === "green") this.#green(dt, result);
    else this.#red(dt, result);

    result.light = this.phase;
    return result;
  }

  #green(dt, result) {
    // Ground is covered in proportion to how hard the player is working, so
    // standing about on a green light gets nowhere.
    this.progress += clamp(this.stir / 1.6, 0, 1) * this.pace * dt;

    if (this.progress >= 1) {
      this.progress = 0;
      this.runs += 1;
      result.home = true;
      this.award(0.5, 0.82, "HOME", { color: "#4ade80", count: 22 });
    }

    if (this.phaseLeft <= 0) {
      this.phase = "red";
      this.phaseLeft = this.#redFor();
      this.settle = SETTLE_S;
      this.floor = FLOOR_MIN;
      this.caught = false;
      this.cue("crash");
    }
  }

  #red(dt, result) {
    if (this.settle > 0) {
      // Still settling: learn what this player's stillness looks like rather
      // than judging them on the tail of the movement they just stopped.
      this.settle -= dt;
      this.floor = Math.max(this.floor, this.stir * 0.55);
      return;
    }

    if (!this.caught && this.stir > this.bar()) {
      this.caught = true;
      result.caught = true;
      // Sent back down the track, but never past the start.
      this.progress = Math.max(0, this.progress - 0.18);
      if (this.penalise({ x: 0.5, y: 0.5, color: "#f87171" })) {
        this.over = true;
        result.over = true;
        return;
      }
    }

    if (this.phaseLeft <= 0) {
      if (!this.caught) {
        this.countAction("hold");
        this.award(0.5, 0.36, null, { color: "#a7f3d0", count: 14 });
      }
      this.phase = "green";
      this.phaseLeft = this.#greenFor();
      this.cue("go");
    }
  }

  /** True while the light is green but about to turn. */
  warning() {
    return this.phase === "green" && this.phaseLeft <= WARN_S;
  }

  draw(ctx, view, signals, now) {
    void signals;
    withShake(ctx, this.shake, () => {
      this.#drawLight(ctx, view, now);
      this.#drawTrack(ctx, view);
      if (this.phase === "red" && this.settle <= 0) this.#drawMeter(ctx, view);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
      this.#drawWord(ctx, view, now);
    });
  }

  /** The light itself, three lamps in a dark housing. */
  #drawLight(ctx, view, now) {
    // Sized off the height rather than the short side, so the housing takes
    // up the same slice of the screen on a wide desktop as on a tall phone
    // and always finishes above the word underneath it.
    const r = view.h * LAMP_R;
    const cx = view.w / 2;
    const top = view.h * 0.075;
    const gap = r * 2.5;

    ctx.save();
    ctx.fillStyle = "rgba(9,14,26,0.72)";
    ctx.beginPath();
    ctx.roundRect(cx - r * 1.7, top - r * 1.7, r * 3.4, gap * 2 + r * 3.4, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.stroke();

    const lamps = [
      ["#ef4444", this.phase === "red"],
      ["#f59e0b", this.warning()],
      ["#22c55e", this.phase === "green" && !this.warning()],
    ];
    lamps.forEach(([colour, lit], i) => {
      const y = top + i * gap;
      if (lit) {
        const glow = ctx.createRadialGradient(cx, y, r * 0.2, cx, y, r * 2.6);
        glow.addColorStop(0, colour);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = lit ? colour : "rgba(255,255,255,0.13)";
      ctx.beginPath();
      ctx.arc(cx, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (lit) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.3, y - r * 0.35, r * 0.34, r * 0.22, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // The amber lamp ticks while it is counting down, so the turn is heard as
    // well as seen.
    if (this.warning()) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin((now ?? 0) / 90);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = Math.max(2, r * 0.18);
      ctx.beginPath();
      ctx.arc(cx, top + gap, r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The track along the bottom, with the runner on it. */
  #drawTrack(ctx, view) {
    const u = unit(view);
    const y = view.h * 0.88;
    const left = view.w * 0.1;
    const right = view.w * 0.9;
    const h = u * 0.03;

    ctx.save();
    ctx.fillStyle = "rgba(9,14,26,0.5)";
    ctx.beginPath();
    ctx.roundRect(left, y - h / 2, right - left, h, h / 2);
    ctx.fill();

    ctx.fillStyle = this.phase === "green" ? "#4ade80" : "#fca5a5";
    ctx.beginPath();
    ctx.roundRect(left, y - h / 2, (right - left) * this.progress, h, h / 2);
    ctx.fill();

    // Finish flag.
    const fx = right;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1.5, u * 0.006);
    ctx.beginPath();
    ctx.moveTo(fx, y - h * 0.6);
    ctx.lineTo(fx, y - u * 0.07);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(fx, y - u * 0.07, u * 0.035, u * 0.024);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(fx, y - u * 0.07, u * 0.0175, u * 0.012);
    ctx.fillRect(fx + u * 0.0175, y - u * 0.058, u * 0.0175, u * 0.012);

    // The runner.
    const rx = left + (right - left) * this.progress;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(rx, y, h * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.phase === "green" ? "#16a34a" : "#dc2626";
    ctx.beginPath();
    ctx.arc(rx, y, h * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** How close the player is to being caught, while a red light is judging. */
  #drawMeter(ctx, view) {
    const u = unit(view);
    const cx = view.w / 2;
    const cy = view.h * 0.62;
    const r = u * 0.13;
    const fill = clamp(this.stir / this.bar(), 0, 1);

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = u * 0.02;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.stroke();

    // Green while safe, through amber, to red at the moment of being caught.
    const hue = lerp(140, 0, fill);
    ctx.strokeStyle = `hsl(${hue} 85% 60%)`;
    ctx.lineWidth = u * 0.02;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.75, -Math.PI * 0.75 + fill * Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  #drawWord(ctx, view, now) {
    if (this.phase === "red") {
      const sub = this.caught ? null : "Don't move";
      drawPrompt(ctx, view, this.caught ? "CAUGHT" : "FREEZE", sub, WORD_AT);
      return;
    }
    if (this.warning()) {
      // Only shown on the blink, so it reads as a countdown rather than a
      // label that happens to be there.
      if (Math.floor((now ?? 0) / 180) % 2) {
        drawPrompt(ctx, view, "READY", "About to stop", WORD_AT);
      }
      return;
    }
    drawPrompt(ctx, view, "GO", "Move to get down the track", WORD_AT);
  }
}
