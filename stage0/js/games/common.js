/**
 * Shared plumbing for the mini-games: the round clock, lives, combo scoring
 * and the few drawing helpers that should look identical everywhere.
 *
 * Games work in normalised coordinates (0..1 across the play area, y down) and
 * resolve sizes and hit tests in pixels, so circles stay round and reach stays
 * fair whatever shape the screen is.
 */
import { silentFeedback } from "../feedback.js";

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * How far to travel towards a target this frame, for smoothing that feels the
 * same however fast the device is drawing.
 *
 * The usual shorthand is `lerp(here, there, rate * dt)`, and it is wrong: it
 * applies the fraction once per frame, so a device drawing twice as often
 * closes the gap twice as many times and arrives sooner. Chasing something at
 * a constant rate is exponential decay, and the fraction of the gap that
 * closes over `dt` is this. It also cannot overshoot, so no cap is needed
 * around a long frame.
 *
 * `rate` is roughly "gaps closed per second": 7 shuts about 99.9% of one in a
 * second, and higher is snappier.
 */
export const approach = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Shortest side of the play area: the sane basis for any radius. */
export const unit = (view) => Math.min(view.w, view.h);

/** How far a point sits from the line segment `from`-`to`. All in pixels. */
export function distanceToPath(from, to, px, py) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = dx * dx + dy * dy;
  if (!span) return Math.hypot(px - to.x, py - to.y);
  const t = clamp(((px - from.x) * dx + (py - from.y) * dy) / span, 0, 1);
  return Math.hypot(px - (from.x + t * dx), py - (from.y + t * dy));
}

/**
 * A reading this old cannot be the previous frame, so treat the hand as having
 * appeared where it is rather than having travelled there. Without this, the
 * first frame after a pause sweeps a line across the whole screen and pops
 * everything on it.
 */
const MAX_PATH_GAP_MS = 200;

/**
 * Both hands in view pixels, each with the path it took since the last frame.
 *
 * Asking "is the hand on the target now" sounds like the whole question, and
 * it is the wrong one. Games draw 60 times a second but the camera only finds
 * the hands 10 to 20 times a second on a phone, so between two readings a hand
 * moving at any speed worth calling a swat crosses a balloon whole. Every
 * single frame the game gets to test then truthfully answers no, and the
 * player — who felt their hand go through it — is told they missed.
 *
 * Measuring against the line the hand travelled asks the question that matches
 * what the player did: did the hand go through the target, not was it caught
 * in the act.
 */
export class HandPaths {
  constructor() {
    this.reset();
  }

  reset() {
    this.at = { left: null, right: null };
    this.seenAt = null;
  }

  /**
   * Advance to this frame.
   *
   * @returns {Array<{side: string, hand: object, from: object, to: object}>}
   *   one entry per hand the camera can currently see.
   */
  update(view, signals, now) {
    const stale = this.seenAt == null || now - this.seenAt > MAX_PATH_GAP_MS;
    this.seenAt = now;

    const out = [];
    for (const side of ["left", "right"]) {
      const hand = signals?.hands?.[side];
      if (!hand?.visible || hand.x == null || hand.y == null) {
        this.at[side] = null;
        continue;
      }
      const to = { x: view.poseX(hand.x), y: view.poseY(hand.y) };
      const from = stale ? to : (this.at[side] ?? to);
      this.at[side] = to;
      out.push({ side, hand, from, to });
    }
    return out;
  }
}

/** How quickly a spark's sideways dash bleeds off. */
const SPARK_DRAG = 1.6;

export class BaseGame {
  /**
   * Subclasses must call `this.reset()` themselves at the end of their own
   * constructor. Calling it from here would run an override before the
   * subclass body has installed its private methods.
   */
  /**
   * @param clearsPerLevel successes needed to reach the next level
   * @param maxLevel       the level at which the difficulty stops climbing
   */
  constructor({
    roundMs = 60_000,
    lives = 3,
    fx = silentFeedback,
    scoreCue = "pop",
    clearsPerLevel = 6,
    maxLevel = 8,
  } = {}) {
    this.roundMs = roundMs;
    this.maxLives = lives;
    this.fx = fx;
    // The sound a plain award() makes. Games with a signature hit — a punch, a
    // slice — override it per call instead.
    this.scoreCue = scoreCue;
    this.clearsPerLevel = clearsPerLevel;
    this.maxLevel = maxLevel;
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.cleared = 0;
    this.missed = 0;
    this.lives = this.maxLives;
    this.over = false;
    this.elapsed = 0;
    this.startedAt = null;
    this.shake = 0;
    this.pops = [];
    this.particles = [];
    this.level = 1;
    this.levelFlash = 0;
    // Movements performed this round, keyed by action id. The activity log is
    // built from these, so they count what the body did, not what scored: a
    // squat you did not get credit for is still a squat you did.
    this.actions = {};
  }

  /** Record a physical movement. Ids come from the catalogue in skills.js. */
  countAction(id, n = 1) {
    this.actions[id] = (this.actions[id] ?? 0) + n;
  }

  start(now) {
    this.reset();
    this.startedAt = now;
  }

  hud() {
    return {
      score: this.score,
      lives: this.lives,
      maxLives: this.maxLives,
      timeLeft: Math.max(0, this.roundMs - this.elapsed),
      combo: this.combo,
      level: this.level,
      maxLevel: this.maxLevel,
      levelFlash: this.levelFlash,
    };
  }

  summary() {
    return {
      score: this.score,
      bestCombo: this.bestCombo,
      cleared: this.cleared,
      missed: this.missed,
      level: this.level,
      actions: { ...this.actions },
    };
  }

  /** 0 at the start of the round, 1 at the end. */
  progress() {
    return clamp(this.elapsed / this.roundMs, 0, 1);
  }

  /**
   * Difficulty, as 0 at level one and 1 at the top level.
   *
   * Keying this to the level rather than the clock means the game gets harder
   * because you are doing well, not because time passed. Someone struggling is
   * left at a pace they can actually play, and someone good is pushed.
   *
   * The curve is bent so the first couple of levels are a gentle introduction
   * and the top ones are where the real jump is.
   */
  ramp(curve = 1.35) {
    const span = Math.max(1, this.maxLevel - 1);
    return clamp((this.level - 1) / span, 0, 1) ** curve;
  }

  /** How far into the current level you are, for a progress bar. */
  levelProgress() {
    if (this.level >= this.maxLevel) return 1;
    return clamp((this.cleared % this.clearsPerLevel) / this.clearsPerLevel, 0, 1);
  }

  /**
   * Recalculate the level from what has been cleared. Returns true on the
   * frame the player levels up, which is when the shell shows the banner.
   */
  #updateLevel() {
    const earned = Math.min(
      this.maxLevel,
      1 + Math.floor(this.cleared / this.clearsPerLevel),
    );
    if (earned <= this.level) return false;
    this.level = earned;
    this.levelFlash = 1;
    this.cue("go");
    return true;
  }

  /**
   * Advance the clock and cosmetic timers. Returns true when the round is
   * finished and the caller should stop early.
   */
  beginTick(dt, now, view = { w: 1, h: 1 }) {
    if (this.over) return true;
    if (this.startedAt == null) this.startedAt = now;
    this.elapsed = now - this.startedAt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.levelFlash = Math.max(0, this.levelFlash - dt * 0.7);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.7);
    this.stepParticles(dt, view);
    if (this.elapsed >= this.roundMs) {
      this.over = true;
      return true;
    }
    return false;
  }

  /** Play a sound and a buzz. Silent unless the shell supplied real feedback. */
  cue(name, opts = {}) {
    return this.fx.cue(name, opts);
  }

  /**
   * Throw a handful of sparks from a point.
   *
   * Positions are normalised but velocities are in fractions of the short side
   * per second, so a burst stays circular on a tall phone instead of being
   * stretched into a column.
   */
  burst(
    x,
    y,
    { color = "#ffffff", count = 10, speed = 0.55, spread = Math.PI * 2, angle = 0, gravity = 1.2, size = 1 } = {},
  ) {
    for (let i = 0; i < count; i += 1) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.45 + Math.random() * 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity,
        life: 0,
        max: 0.35 + Math.random() * 0.4,
        size: size * (0.5 + Math.random() * 0.7),
        color,
      });
    }
    // A burst mid-round should never be the thing that costs a frame.
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }

  stepParticles(dt, view = { w: 1, h: 1 }) {
    if (!this.particles.length) return;
    const u = unit(view);
    const perX = u / view.w;
    const perY = u / view.h;
    // Both halves of a spark's motion have exact answers: a curve under
    // constant gravity, and a sideways dash bleeding off at a steady rate. Use
    // them, so a burst looks the same on a slow phone as on a fast laptop.
    const dragged = approach(SPARK_DRAG, dt);
    for (const p of this.particles) {
      p.life += dt;
      p.x += ((p.vx * dragged) / SPARK_DRAG) * perX;
      p.y += (p.vy * dt + 0.5 * p.gravity * dt * dt) * perY;
      p.vx *= 1 - dragged;
      p.vy += p.gravity * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  /**
   * Score a success. Every fifth combo step is worth an extra point.
   *
   * `cue` and `color` are how a game gives its own hit a voice and a spray of
   * sparks without repeating the bookkeeping.
   */
  /**
   * @param popY where the score text floats up from, if not off the hit
   *             itself — for a target big enough that "+1" would sit on top
   *             of whatever the hit just revealed
   */
  award(
    x = 0.5,
    y = 0.5,
    label = null,
    { cue = this.scoreCue, color = null, count = 10, popY = y } = {},
  ) {
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.cleared += 1;
    const points = 1 + Math.floor(this.combo / 5);
    this.score += points;
    this.pops.push({ x, y: popY, t: 0, text: label ?? `+${points}` });
    if (cue) this.cue(cue, { step: this.combo });
    if (color) this.burst(x, y, { color, count });
    if (this.#updateLevel() && color) {
      this.burst(x, y, { color, count: 18, speed: 0.9 });
    }
    return points;
  }

  /** Score a failure. Returns true if that was the last life. */
  penalise({ costsLife = true, cue = null, x = null, y = null, color = null } = {}) {
    this.combo = 0;
    this.missed += 1;
    this.shake = 13;
    const fatal = costsLife && this.maxLives > 0 && this.lives - 1 <= 0;
    this.cue(cue ?? (costsLife && this.maxLives > 0 ? "crash" : "miss"));
    if (color && x != null) this.burst(x, y, { color, count: 12, speed: 0.7 });
    if (!costsLife || this.maxLives === 0) return false;
    this.lives -= 1;
    if (fatal) {
      this.lives = 0;
      this.over = true;
      return true;
    }
    return false;
  }
}

/** Wrap a draw in the current screen shake. */
export function withShake(ctx, amount, draw) {
  ctx.save();
  if (amount > 0) {
    ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
  }
  draw();
  ctx.restore();
}

/** Rings on each tracked hand, so you can see what the game is following. */
export function drawHandCursors(ctx, view, signals, { radius = 0.045 } = {}) {
  const r = unit(view) * radius;
  for (const [side, hand] of Object.entries(signals.hands ?? {})) {
    if (!hand?.visible || hand.x == null) continue;
    const x = view.poseX(hand.x);
    const y = view.poseY(hand.y);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = side === "left" ? "rgba(56,189,248,0.26)" : "rgba(251,146,60,0.26)";
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = side === "left" ? "#38bdf8" : "#fb923c";
    ctx.stroke();
  }
}

/**
 * A top-to-bottom gradient that is only rebuilt when the height changes.
 *
 * Backdrops are repainted every frame and a fresh gradient object per frame is
 * pure waste; `cache` is any object the caller keeps around to hold it.
 */
export function skyGradient(cache, ctx, h, stops) {
  if (cache.h !== h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    cache.h = h;
    cache.grad = grad;
  }
  return cache.grad;
}

/**
 * Counts a repeated movement once per repetition rather than once per frame.
 *
 * Fires when the signal crosses `on`, and will not fire again until it has
 * fallen back past `off`. The gap between the two is what stops a body
 * hovering near the threshold from registering fifty squats a second.
 */
export class Rep {
  constructor(on, off) {
    this.on = on;
    this.off = off;
    this.high = false;
  }

  /** True on the frame the movement begins. */
  step(value) {
    if (!this.high && value >= this.on) {
      this.high = true;
      return true;
    }
    if (this.high && value <= this.off) this.high = false;
    return false;
  }

  reset() {
    this.high = false;
  }
}

/** Sparks left behind by burst(). Drawn under the score pops. */
export function drawParticles(ctx, view, particles) {
  if (!particles?.length) return;
  const r = unit(view) * 0.012;
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * view.w, p.y * view.h, r * p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Floating "+2" text left behind by award(). */
export function drawPops(ctx, view, pops) {
  const size = Math.round(unit(view) * 0.058);
  ctx.save();
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  for (const p of pops) {
    ctx.globalAlpha = 1 - p.t / 0.7;
    ctx.fillStyle = "#ffffff";
    const y = p.y * view.h - p.t * view.h * 0.12;
    ctx.strokeText(p.text, p.x * view.w, y);
    ctx.fillText(p.text, p.x * view.w, y);
  }
  ctx.restore();
}

/**
 * The "LEVEL 3" card that swells and fades when you move up.
 *
 * Drawn by the shell rather than by each game, so it looks and times the same
 * everywhere. `flash` runs 1 down to 0.
 */
export function drawLevelBanner(ctx, view, level, flash) {
  if (flash <= 0.01) return;
  const t = 1 - flash; // 0 at the moment of the level up
  const grow = 1 + Math.min(1, t * 6) * 0.12;
  const fade = flash > 0.75 ? (1 - flash) / 0.25 : Math.min(1, flash / 0.35);
  const size = unit(view) * 0.075;

  ctx.save();
  ctx.globalAlpha = clamp(fade, 0, 1);
  ctx.translate(view.w / 2, view.h * 0.34);
  ctx.scale(grow, grow);
  ctx.textAlign = "center";

  ctx.fillStyle = "rgba(12,20,28,0.62)";
  const boxW = size * 5.2;
  ctx.beginPath();
  ctx.roundRect(-boxW / 2, -size * 1.15, boxW, size * 1.95, size * 0.4);
  ctx.fill();

  ctx.fillStyle = "#fde68a";
  ctx.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
  ctx.fillText(`LEVEL ${level}`, 0, size * 0.34);
  ctx.restore();
}

/**
 * Centre-of-screen prompt used by the pose and rep games.
 *
 * `at` is how far down the screen it sits, for the games that already have
 * something of their own in the usual spot.
 */
export function drawPrompt(ctx, view, text, sub = null, at = 0.16) {
  const size = Math.round(unit(view) * 0.062);
  const y = view.h * at;
  ctx.save();
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(3, size * 0.14);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.strokeText(text, view.w / 2, y);
  ctx.fillText(text, view.w / 2, y);
  if (sub) {
    ctx.font = `700 ${Math.round(size * 0.45)}px system-ui, sans-serif`;
    ctx.strokeText(sub, view.w / 2, y + size * 0.75);
    ctx.fillText(sub, view.w / 2, y + size * 0.75);
  }
  ctx.restore();
}
