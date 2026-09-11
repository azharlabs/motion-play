import { JumpGame } from "../game.js";
import { GameRenderer, FIELD_W, FIELD_H } from "../render.js";
import { silentFeedback } from "../feedback.js";

/**
 * Adapter that puts the original side-scroller behind the shared game
 * interface. It keeps its fixed 960x540 field and is fitted into whatever box
 * the stage provides, letterboxed rather than stretched so the physics and the
 * art never disagree about distances.
 */
export function createGame(opts = {}) {
  return new JumpTheWall(opts);
}

class JumpTheWall {
  constructor(opts = {}) {
    this.game = new JumpGame({
      width: FIELD_W,
      height: FIELD_H,
      roundMs: opts.roundMs ?? 120_000,
    });
    this.renderer = new GameRenderer();
    // The original game predates the feedback layer and the level system, so
    // the adapter is where both are added rather than reaching into JumpGame.
    this.fx = opts.fx ?? silentFeedback;
    this.clearsPerLevel = opts.clearsPerLevel ?? 5;
    this.maxLevel = opts.maxLevel ?? 8;
    // How much faster the field runs at the top level.
    this.speedPerLevel = opts.speedPerLevel ?? 16;
    this.level = 1;
    this.levelFlash = 0;
    this.actions = {};
  }

  start(now) {
    this.game.start(now);
    this.renderer.reset();
    this.level = 1;
    this.levelFlash = 0;
    this.game.levelBoost = 0;
    this.actions = {};
  }

  countAction(id, n = 1) {
    this.actions[id] = (this.actions[id] ?? 0) + n;
  }

  /** Promote on cleared obstacles, the same currency the other games use. */
  #updateLevel() {
    const earned = Math.min(
      this.maxLevel,
      1 + Math.floor(this.game.cleared / this.clearsPerLevel),
    );
    if (earned <= this.level) return;
    this.level = earned;
    this.levelFlash = 1;
    this.game.levelBoost = (this.level - 1) * this.speedPerLevel;
    this.fx.cue("go");
  }

  get over() {
    return this.game.over;
  }

  hud() {
    return {
      score: this.game.score,
      lives: this.game.lives,
      maxLives: this.game.maxLives,
      timeLeft: Math.max(0, this.game.roundMs - this.game.elapsed),
      combo: this.game.combo,
      level: this.level,
      maxLevel: this.maxLevel,
      levelFlash: this.levelFlash,
    };
  }

  summary() {
    return {
      score: this.game.score,
      bestCombo: this.game.bestCombo,
      cleared: this.game.cleared,
      missed: this.game.maxLives - this.game.lives,
      level: this.level,
      actions: { ...this.actions },
    };
  }

  tick(dt, signals, now) {
    const ev = this.game.tick(dt, signals, now);
    this.levelFlash = Math.max(0, this.levelFlash - dt * 0.7);
    this.#updateLevel();
    if (ev.jumped) this.countAction("jump");
    if (ev.ducked) this.countAction("duck");
    if (ev.scored) {
      this.renderer.onScore(ev.scored, now);
      this.fx.cue("coin", { step: this.game.combo });
    }
    if (ev.hit) {
      this.renderer.onHit();
      this.fx.cue("crash");
    }
    return { over: this.game.over || ev.timeout, coin: ev.scored, hit: ev.hit };
  }

  draw(ctx, view, signals, now, dt) {
    const scale = Math.min(view.w / FIELD_W, view.h / FIELD_H);
    const w = FIELD_W * scale;
    const h = FIELD_H * scale;

    ctx.fillStyle = "#0d141b";
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();
    ctx.translate((view.w - w) / 2, (view.h - h) / 2);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(0, 0, FIELD_W, FIELD_H);
    ctx.clip();
    this.renderer.draw(ctx, this.game, signals, now, dt);
    ctx.restore();
  }
}
