import { BaseGame, approach, clamp, drawParticles, drawPrompt, lerp, skyGradient, unit } from "./common.js";
import { BODY, drawPip } from "../demo.js";

/**
 * Squat Rush - a pure time attack: bank as many clean reps as you can.
 *
 * A rep only counts once you have gone below the deep threshold and come all
 * the way back up, which rules out bouncing in the middle. There are no lives;
 * the only pressure is the clock.
 */
export function createGame(opts = {}) {
  return new SquatRush(opts);
}

class SquatRush extends BaseGame {
  constructor(opts = {}) {
    // No lives: the HUD hides the hearts when maxLives is zero.
    super({
      roundMs: opts.roundMs ?? 60_000,
      lives: 0,
      fx: opts.fx,
      scoreCue: "rep",
      clearsPerLevel: opts.clearsPerLevel ?? 3,
    });
    this.deep = opts.deep ?? 0.55;
    this.standing = opts.standing ?? 0.22;
    // Reps faster than this are almost certainly tracking noise.
    this.minRepMs = opts.minRepMs ?? 500;
    this.sky = {};
    this.reset();
  }

  reset() {
    super.reset();
    this.depth = 0;
    this.smooth = 0;
    this.down = false;
    this.reachedBottom = false;
    this.lastRepAt = -Infinity;
    this.repFlash = 0;
    this.bestDepth = 0;
  }

  tick(dt, signals, now, view = { w: 1, h: 1 }) {
    const result = { over: false, rep: 0 };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    this.repFlash = Math.max(0, this.repFlash - dt * 3);
    if (!signals.inFrame) return result;

    this.depth = clamp(signals.crouch ?? 0, 0, 1);
    this.smooth = lerp(this.smooth, this.depth, approach(12, dt));

    if (!this.down && this.smooth >= this.deep) {
      this.down = true;
      this.reachedBottom = true;
      // Logged at the bottom, so a rep that came back up too fast to score
      // still counts as a squat you did.
      this.countAction("squat");
      this.bestDepth = Math.max(this.bestDepth, this.smooth);
      // Confirms you went deep enough, which you cannot see with your head down.
      this.cue("tick");
    } else if (this.down && this.smooth <= this.standing) {
      // Back to standing: that closes the rep.
      this.down = false;
      if (this.reachedBottom && now - this.lastRepAt >= this.minRepMs) {
        this.lastRepAt = now;
        this.repFlash = 1;
        result.rep = this.award(0.5, 0.42, "REP", { color: "#c4b5fd", count: 14 });
      }
      this.reachedBottom = false;
    }

    return result;
  }

  draw(ctx, view, signals, now) {
    const { w, h } = view;
    ctx.fillStyle = skyGradient(this.sky, ctx, h, [
      [0, "#f3e8ff"],
      [1, "#faf5ff"],
    ]);
    ctx.fillRect(0, 0, w, h);

    this.#drawMeter(ctx, view);
    this.#drawFigure(ctx, view);
    drawParticles(ctx, view, this.particles);

    if (this.repFlash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.repFlash;
      drawPrompt(ctx, view, `${this.score}`, "rep banked");
      ctx.restore();
    } else if (!signals.inFrame) {
      drawPrompt(ctx, view, "Step back", "we need to see your whole body");
    } else {
      drawPrompt(ctx, view, this.down ? "Stand up!" : "Squat low", `${this.score} reps`);
    }
    void now;
  }

  /** A vertical gauge with the two thresholds marked on it. */
  #drawMeter(ctx, view) {
    const { w, h } = view;
    const mw = unit(view) * 0.09;
    const x = w - mw - unit(view) * 0.07;
    const top = h * 0.26;
    const bottom = h * 0.82;
    const span = bottom - top;

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.roundRect(x, top, mw, span, mw / 2);
    ctx.fill();

    ctx.fillStyle = this.down ? "#22c55e" : "#a855f7";
    const fill = span * clamp(this.smooth, 0, 1);
    ctx.beginPath();
    ctx.roundRect(x, bottom - fill, mw, fill, mw / 2);
    ctx.fill();

    for (const [level, colour, label] of [
      [this.deep, "#16a34a", "deep"],
      [this.standing, "#94a3b8", "up"],
    ]) {
      const y = bottom - span * level;
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(2, mw * 0.12);
      ctx.beginPath();
      ctx.moveTo(x - mw * 0.3, y);
      ctx.lineTo(x + mw * 1.3, y);
      ctx.stroke();
      ctx.fillStyle = colour;
      ctx.font = `700 ${Math.round(unit(view) * 0.028)}px system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(label, x - mw * 0.45, y + unit(view) * 0.01);
    }
  }

  /**
   * Pip, squatting exactly as deep as the player is.
   *
   * The same fox and the same movement the how-to screen just demonstrated.
   * It used to be a purple stick figure, which meant the game taught the rep
   * with one drawing and then scored it with another, and the player had
   * nothing to copy their own shape against.
   */
  #drawFigure(ctx, view) {
    const { w, h } = view;
    const groundY = h * 0.84;
    const down = clamp(this.smooth, 0, 1);

    ctx.fillStyle = "#c4b5fd";
    ctx.fillRect(0, groundY, w, h - groundY);
    ctx.fillStyle = "rgba(109,40,217,0.18)";
    ctx.fillRect(0, groundY, w, Math.max(2, unit(view) * 0.006));

    const cx = w * 0.4;
    // Pip is drawn 200 units tall, from the floor up.
    const k = (unit(view) * 0.46) / BODY.standing;

    // Sitting on the floor rather than pasted over it, and spreading as the
    // weight comes down.
    ctx.fillStyle = "rgba(76,29,149,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, groundY + k * 4, k * (34 + down * 12), k * 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(k, k);

    // The depth the hips have to get under, in the place the player is
    // already looking. The meter on the right says the same thing, but not
    // against the body it applies to.
    ctx.strokeStyle = down > this.deep ? "#16a34a" : "rgba(76,29,149,0.45)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(-104, BODY.hipY + this.deep * 46);
    ctx.lineTo(104, BODY.hipY + this.deep * 46);
    ctx.stroke();
    ctx.setLineDash([]);

    drawPip(ctx, {
      crouch: down,
      effort: down * 0.9,
      /*
       * Out to the sides as a counterweight, and kept near enough to full
       * stretch to stay legible: the elbow breaks towards the paw, so an arm
       * folded up in front of the chest puts its elbow inside the body and
       * draws as a stub with a paw floating beside it.
       */
      arms: {
        left: { dx: -(30 + down * 28), dy: 58 - down * 30 },
        right: { dx: 30 + down * 28, dy: 58 - down * 30 },
      },
    });
    ctx.restore();
  }
}
