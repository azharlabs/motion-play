/**
 * Lane Runner - lean your body to slide between three lanes.
 *
 * The road is drawn to fill whatever box it is given, so it works in phone
 * portrait and on a wide desktop without letterboxing. Lane positions are
 * fractions of the road width rather than fixed pixels.
 */
import { BaseGame, approach, clamp, drawParticles, drawPops, skyGradient, withShake } from "./common.js";

const LANES = 3;
/** Where the runner sits, as a fraction of height. Kept clear of the camera
 *  thumbnail in the bottom corner so nothing important hides behind it. */
export const PLAYER_Y = 0.72;

export function createGame(opts = {}) {
  return new LaneRunner(opts);
}

class LaneRunner extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 90_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "coin",
      clearsPerLevel: opts.clearsPerLevel ?? 6,
    });
    this.baseSpeed = opts.baseSpeed ?? 0.5; // screen heights per second
    this.maxSpeed = opts.maxSpeed ?? 1.25;
    this.spawnEvery = opts.spawnEvery ?? 1.05;
    // Hysteresis, so hovering on a lane edge does not flicker between lanes.
    this.enterLean = opts.enterLean ?? 0.34;
    this.exitLean = opts.exitLean ?? 0.2;
    this.invulnerableMs = opts.invulnerableMs ?? 1100;
    this.sky = {};
    this.reset();
  }

  reset() {
    super.reset();
    this.things = [];
    this.spawnTimer = 0.6;
    this.nextId = 1;
    this.lane = 1;
    this.laneX = 1; // smoothed, for drawing
    this.invulnerableUntil = 0;
    this.scroll = 0;
  }

  speed() {
    return this.baseSpeed + (this.maxSpeed - this.baseSpeed) * this.ramp();
  }

  /** Map a continuous lean onto a discrete lane, with a dead zone. */
  #steer(lean) {
    const before = this.lane;
    if (this.lane !== 0 && lean <= -this.enterLean) this.lane = 0;
    else if (this.lane !== 2 && lean >= this.enterLean) this.lane = 2;
    else if (this.lane === 0 && lean > -this.exitLean) this.lane = 1;
    else if (this.lane === 2 && lean < this.exitLean) this.lane = 1;
    // A lane change is a deliberate shift of weight, which is the movement
    // this game is actually training.
    if (this.lane !== before) this.countAction("lean");
  }

  #spawn(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = Math.max(0.42, this.spawnEvery * (1 - 0.45 * this.ramp()));

    // Never fill every lane: there must always be a way through. Two-barrel
    // rows are rare early and normal late, which is most of the ramp.
    const blocked = Math.random() < 0.25 + 0.45 * this.ramp() ? 2 : 1;
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const barrels = lanes.slice(0, blocked);
    const free = lanes.slice(blocked);

    for (const lane of barrels) {
      this.things.push({ id: this.nextId++, kind: "barrel", lane, y: -0.12, done: false });
    }
    if (free.length && Math.random() < 0.75) {
      this.things.push({
        id: this.nextId++,
        kind: "coin",
        lane: free[Math.floor(Math.random() * free.length)],
        y: -0.12,
        done: false,
      });
    }
  }

  tick(dt, signals, now, view = { w: 1, h: 1 }) {
    const result = { over: false, coin: 0, hit: false };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }
    if (!signals.inFrame) return result;

    this.#steer(signals.lean ?? 0);
    // Ease towards the target lane so the runner slides rather than teleports.
    this.laneX += (this.lane - this.laneX) * approach(11, dt);

    const speed = this.speed();
    this.scroll = (this.scroll + speed * dt) % 1;
    this.#spawn(dt);

    for (const thing of this.things) {
      thing.y += speed * dt;
      if (thing.done) continue;

      const near = Math.abs(thing.y - PLAYER_Y) < 0.055;
      const sameLane = Math.abs(thing.lane - this.laneX) < 0.55;
      if (!near || !sameLane) continue;

      thing.done = true;
      // Scoring effects belong over the lane, not over the fraction of the
      // whole screen that lane index happens to work out to.
      const x = this.laneCenter(view, thing.lane) / view.w;
      if (thing.kind === "coin") {
        result.coin = this.award(x, PLAYER_Y, null, { color: "#f5b301", count: 9 });
      } else if (now >= this.invulnerableUntil) {
        this.invulnerableUntil = now + this.invulnerableMs;
        result.hit = true;
        if (this.penalise({ x, y: PLAYER_Y, color: "#b45309" })) {
          this.over = true;
          result.over = true;
        }
      }
    }

    this.things = this.things.filter((t) => t.y < 1.2);
    this.invulnerable = now < this.invulnerableUntil;
    return result;
  }

  /** Road geometry for the current box. */
  #road(view) {
    const width = Math.min(view.w * 0.86, view.h * 0.62);
    return { x0: (view.w - width) / 2, width, laneW: width / LANES };
  }

  laneCenter(view, lane) {
    const { x0, laneW } = this.#road(view);
    return x0 + laneW * (lane + 0.5);
  }

  draw(ctx, view, signals, now) {
    const { w, h } = view;
    const road = this.#road(view);

    ctx.fillStyle = skyGradient(this.sky, ctx, h, [
      [0, "#bfe9ff"],
      [1, "#e8f7e4"],
    ]);
    ctx.fillRect(0, 0, w, h);

    this.#drawScenery(ctx, view, road);

    withShake(ctx, this.shake, () => {
      this.#drawRoad(ctx, view, road);

      for (const thing of this.things) {
        if (thing.done && thing.kind === "coin") continue;
        const x = road.x0 + road.laneW * (thing.lane + 0.5);
        const y = thing.y * h;
        if (thing.kind === "coin") this.#drawCoin(ctx, x, y, road.laneW, now);
        else this.#drawBarrel(ctx, x, y, road.laneW);
      }

      this.#drawRunner(ctx, view, road, now);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
    });
    void signals;
  }

  #drawScenery(ctx, view, road) {
    const { w, h } = view;
    ctx.fillStyle = "#7cc47f";
    ctx.fillRect(0, 0, road.x0, h);
    ctx.fillRect(road.x0 + road.width, 0, w - road.x0 - road.width, h);

    // Bushes drift past at the road speed to sell the motion.
    const spacing = h * 0.26;
    const off = (this.scroll * spacing * 4) % spacing;
    ctx.fillStyle = "#57a961";
    for (let i = -1; i * spacing < h + spacing; i += 1) {
      const y = i * spacing + off;
      const r = Math.max(8, road.x0 * 0.3);
      if (road.x0 > r) {
        ctx.beginPath();
        ctx.arc(road.x0 * 0.45, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w - road.x0 * 0.45, y + spacing * 0.5, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  #drawRoad(ctx, view, road) {
    const { h } = view;
    ctx.fillStyle = "#4b5563";
    ctx.fillRect(road.x0, 0, road.width, h);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(road.x0 - 3, 0, 6, h);
    ctx.fillRect(road.x0 + road.width - 3, 0, 6, h);

    // Dashed lane dividers scrolling toward the player.
    const dash = h * 0.11;
    const gap = dash * 0.85;
    const period = dash + gap;
    const off = (this.scroll * h) % period;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let lane = 1; lane < LANES; lane += 1) {
      const x = road.x0 + road.laneW * lane;
      for (let y = -period + off; y < h + period; y += period) {
        ctx.fillRect(x - 3, y, 6, dash);
      }
    }
  }

  #drawCoin(ctx, x, y, laneW, now) {
    const r = laneW * 0.2;
    const squash = Math.abs(Math.cos(now / 260));
    ctx.fillStyle = "#f5b301";
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.35 + squash * 0.65), r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b97e05";
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.stroke();
  }

  #drawBarrel(ctx, x, y, laneW) {
    const wBar = laneW * 0.56;
    const hBar = wBar * 1.1;
    ctx.fillStyle = "#b45309";
    ctx.beginPath();
    ctx.roundRect(x - wBar / 2, y - hBar / 2, wBar, hBar, wBar * 0.18);
    ctx.fill();
    ctx.fillStyle = "#fcd34d";
    ctx.fillRect(x - wBar / 2, y - hBar * 0.18, wBar, hBar * 0.16);
    ctx.fillRect(x - wBar / 2, y + hBar * 0.14, wBar, hBar * 0.16);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = Math.max(2, wBar * 0.06);
    ctx.beginPath();
    ctx.roundRect(x - wBar / 2, y - hBar / 2, wBar, hBar, wBar * 0.18);
    ctx.stroke();
  }

  #drawRunner(ctx, view, road, now) {
    const x = road.x0 + road.laneW * (this.laneX + 0.5);
    const y = PLAYER_Y * view.h;
    const r = road.laneW * 0.26;
    const blink = this.invulnerable && Math.floor(now / 110) % 2 === 0;

    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 1.15, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Simple kart so the lane read is instant.
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.roundRect(x - r * 0.95, y - r * 0.5, r * 1.9, r * 1.1, r * 0.3);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.roundRect(x - r * 0.75, y - r * 1.15, r * 1.5, r * 1.3, r * 0.32);
    ctx.fill();
    ctx.fillStyle = "#bfdbfe";
    ctx.beginPath();
    ctx.roundRect(x - r * 0.45, y - r * 0.95, r * 0.9, r * 0.5, r * 0.16);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
