import { Physics, OB_WALL, OB_BRANCH, OB_SHAPE } from "./physics.js";

export { OB_WALL, OB_BRANCH, OB_SHAPE };

/**
 * Jump the Wall.
 *
 * Logical space is a fixed 960x540 field; the renderer scales it to the canvas
 * so gameplay is identical on every screen. Movement and contact are handled by
 * the Box2D world in physics.js - this class owns pacing, scoring and lives.
 */
export class JumpGame {
  constructor(opts = {}) {
    this.width = opts.width ?? 960;
    this.height = opts.height ?? 540;
    this.playerX = opts.playerX ?? 150;
    this.playerWidth = opts.playerWidth ?? 54;

    this.baseSpeed = opts.baseSpeed ?? 300;
    this.maxSpeed = opts.maxSpeed ?? 520;
    this.rampPerSecond = opts.rampPerSecond ?? 5;

    this.roundMs = opts.roundMs ?? 180_000;
    this.lives = opts.lives ?? 3;
    this.maxLives = this.lives;
    this.invulnerableMs = opts.invulnerableMs ?? 1200;

    this.minGap = opts.minGap ?? 300;
    this.spawnEvery = opts.spawnEvery ?? 1.5;
    this.apexPx = opts.apexPx ?? 180;
    this.hangMs = opts.hangMs ?? 950;
    this.physicsOpts = opts.physics ?? {};
    this.reset();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lives = this.maxLives;
    this.over = false;
    this.elapsed = 0;
    this.activeMs = 0;
    this.spawnTimer = 1.1;
    this.obstacles = [];
    this.invulnerableUntil = 0;
    this.startedAt = null;
    this.nextIsWall = true;
    this.cleared = 0;
    this.nextId = 1;
    // Extra pixels per second granted by the level the player has reached.
    // The adapter owns levelling; the game just honours the number.
    this.levelBoost = 0;

    this.physics = new Physics({
      playerX: this.playerX,
      playerWidth: this.playerWidth,
      apexPx: this.apexPx,
      hangMs: this.hangMs,
      ...this.physicsOpts,
    });
    this.player = { jumping: false, ducking: false, feetPx: 0 };
  }

  start(now) {
    this.reset();
    this.startedAt = now;
  }

  currentSpeed(activeMs = this.activeMs) {
    const boost = (activeMs / 1000) * this.rampPerSecond + this.levelBoost;
    return Math.min(this.maxSpeed, this.baseSpeed + boost);
  }

  get invulnerable() {
    return this.lastNow != null && this.lastNow < this.invulnerableUntil;
  }

  #syncPlayer() {
    this.player.feetPx = this.physics.feetPx;
    this.player.jumping = this.physics.airborne;
    this.player.ducking = this.physics.ducking;
    this.player.verticalSpeedPx = this.physics.verticalSpeedPx;
  }

  tick(dt, motion, now) {
    this.lastNow = now;
    // `jumped` and `ducked` are the movements the body actually made, as
    // opposed to the ones asked for: a jump attempted in mid-air never happens.
    const result = { hit: false, timeout: false, scored: 0, jumped: false, ducked: false };
    if (this.over) return result;

    if (this.startedAt == null) this.startedAt = now;
    this.elapsed = now - this.startedAt;
    if (this.elapsed >= this.roundMs) {
      this.over = true;
      result.timeout = true;
      return result;
    }

    // The world waits for a player the camera cannot see, but the body still
    // falls so nobody comes back to find themselves frozen mid-air.
    if (motion.inFrame === false) {
      this.physics.setDuck(false);
      this.physics.pause();
      this.physics.step(dt);
      this.#syncPlayer();
      return result;
    }

    this.activeMs += dt * 1000;
    const speed = this.currentSpeed();

    const wasDucking = this.physics.ducking;
    this.physics.setDuck(Boolean(motion.ducking));
    result.ducked = this.physics.ducking && !wasDucking;
    if (motion.jump) result.jumped = this.physics.jump();
    this.physics.setSpeed(speed);
    this.#spawn(dt, speed);

    const touching = this.physics.step(dt);
    this.#syncPlayer();

    const playerLeft = this.playerX;

    for (const ob of this.obstacles) {
      ob.x = this.physics.obstacleX(ob.id) ?? ob.x;

      if (touching.has(ob.id) && !ob.resolved) {
        ob.resolved = true;
        if (now >= this.invulnerableUntil) {
          this.lives -= 1;
          this.combo = 0;
          this.invulnerableUntil = now + this.invulnerableMs;
          result.hit = true;
          if (this.lives <= 0) {
            this.lives = 0;
            this.over = true;
            return result;
          }
        }
      }

      if (!ob.scored && ob.x + ob.width < playerLeft) {
        ob.scored = true;
        if (!ob.resolved) {
          this.combo += 1;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          const points = 1 + Math.floor(this.combo / 5);
          this.score += points;
          this.cleared += 1;
          result.scored = points;
        }
      }
    }

    this.obstacles = this.obstacles.filter((ob) => {
      if (ob.x + ob.width > -80) return true;
      this.physics.removeObstacle(ob.id);
      return false;
    });

    return result;
  }

  #spawn(dt, speed) {
    this.spawnTimer += dt;
    const interval = Math.max(0.85, this.spawnEvery * (this.baseSpeed / speed));
    if (this.spawnTimer < interval) return;

    // You cannot duck while airborne, so the gap must outlast a full jump or
    // the following obstacle is impossible rather than hard.
    const gap = Math.max(this.minGap, speed * (this.hangMs / 1000) + 150);
    const last = this.obstacles.at(-1);
    if (last && this.width + 40 - (last.x + last.width) < gap) return;

    this.spawnTimer = 0;
    const type = this.nextIsWall ? OB_WALL : OB_BRANCH;
    this.nextIsWall = Math.random() < (type === OB_WALL ? 0.35 : 0.65);

    const id = this.nextId++;
    const x = this.width + 40;
    this.physics.addObstacle(id, type, x, speed);
    this.obstacles.push({
      id,
      type,
      x,
      width: OB_SHAPE[type].width,
      scored: false,
      resolved: false,
      seed: Math.random(),
    });
  }
}
