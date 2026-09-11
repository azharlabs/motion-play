import { World, Vec2, Box } from "../vendor/planck.mjs";

/**
 * Rigid-body physics for Jump the Wall, backed by planck.js (a port of Box2D).
 *
 * The rest of the game thinks in pixels of the 960x540 logical field with "up"
 * positive from the ground line. Box2D wants metre-scale bodies and y-up, so
 * every value crossing this boundary is converted here and nowhere else.
 */
const PPM = 50; // pixels per metre: a 110px player is a believable 2.2m box
const FIXED_STEP = 1 / 120;

export const OB_WALL = "wall";
export const OB_BRANCH = "branch";

/** Obstacle collider geometry, in pixels above the ground line. */
export const OB_SHAPE = {
  [OB_WALL]: { width: 56, bottom: 0, top: 90 },
  [OB_BRANCH]: { width: 96, bottom: 80, top: 145 },
};

const toM = (px) => px / PPM;
const toPx = (m) => m * PPM;

/**
 * A projectile that reaches `apex` after `hang`/2 seconds needs gravity
 * 8*apex/hang^2 and a takeoff speed of 4*apex/hang. Expressing the jump this
 * way means the feel is tuned in the units we actually care about - how high
 * and how long - instead of by guessing at a gravity constant.
 */
export function jumpSolve(apexPx, hangMs) {
  const apex = toM(apexPx);
  const hang = hangMs / 1000;
  return { gravity: (8 * apex) / (hang * hang), takeoff: (4 * apex) / hang };
}

export class Physics {
  constructor(opts = {}) {
    this.playerX = opts.playerX ?? 150;
    this.playerWidth = opts.playerWidth ?? 54;
    this.standHeight = opts.standHeight ?? 110;
    this.duckHeight = opts.duckHeight ?? 62;
    this.apexPx = opts.apexPx ?? 180;
    this.hangMs = opts.hangMs ?? 950;

    const { gravity, takeoff } = jumpSolve(this.apexPx, this.hangMs);
    this.gravity = gravity;
    this.takeoff = takeoff;

    this.world = new World({ gravity: new Vec2(0, -gravity) });
    this.obstacles = new Map();
    this.touching = new Set();
    this.#buildGround();
    this.#buildPlayer();

    this.world.on("begin-contact", (contact) => {
      const a = contact.getFixtureA().getBody().getUserData();
      const b = contact.getFixtureB().getBody().getUserData();
      for (const data of [a, b]) {
        if (data && data.kind === "obstacle") this.touching.add(data.id);
      }
    });
  }

  #buildGround() {
    this.ground = this.world.createBody({ userData: { kind: "ground" } });
    // A thick slab, so a fast fall can never tunnel through it.
    this.ground.createFixture(new Box(toM(4000), toM(200), new Vec2(0, toM(-200))), {
      friction: 0,
    });
  }

  #buildPlayer() {
    this.player = this.world.createDynamicBody({
      position: new Vec2(toM(this.playerX + this.playerWidth / 2), 0),
      fixedRotation: true,
      userData: { kind: "player" },
    });
    this.ducking = false;
    this.#fitPlayer(this.standHeight);
  }

  /**
   * Swap the player's collider. The box is offset up by its own half-height so
   * the body origin sits at the feet, which keeps them planted when ducking
   * shrinks the shape.
   */
  #fitPlayer(heightPx) {
    if (this.playerFixture) this.player.destroyFixture(this.playerFixture);
    const hw = toM(this.playerWidth / 2);
    const hh = toM(heightPx / 2);
    this.playerFixture = this.player.createFixture(new Box(hw, hh, new Vec2(0, hh)), {
      density: 1,
      friction: 0,
      restitution: 0,
    });
    this.playerHeight = heightPx;
  }

  setDuck(on) {
    const want = Boolean(on);
    if (want === this.ducking) return;
    this.ducking = want;
    this.#fitPlayer(want ? this.duckHeight : this.standHeight);
  }

  /** Height of the player's feet above the ground line, in pixels. */
  get feetPx() {
    return Math.max(0, toPx(this.player.getPosition().y));
  }

  get verticalSpeedPx() {
    return toPx(this.player.getLinearVelocity().y);
  }

  get grounded() {
    return this.feetPx <= 1.5 && Math.abs(this.verticalSpeedPx) < 25;
  }

  get airborne() {
    return !this.grounded;
  }

  /** Launch, but only from the floor - no double jumps. */
  jump() {
    if (!this.grounded) return false;
    const v = this.player.getLinearVelocity();
    this.player.setLinearVelocity(new Vec2(v.x, this.takeoff));
    return true;
  }

  addObstacle(id, type, xPx, speedPx) {
    const shape = OB_SHAPE[type];
    const body = this.world.createKinematicBody({
      position: new Vec2(toM(xPx + shape.width / 2), 0),
      userData: { kind: "obstacle", id, type },
    });
    const hh = toM((shape.top - shape.bottom) / 2);
    const cy = toM((shape.top + shape.bottom) / 2);
    body.createFixture(new Box(toM(shape.width / 2), hh, new Vec2(0, cy)), {
      // Sensors report the overlap without shoving the player off their lane.
      isSensor: true,
    });
    body.setLinearVelocity(new Vec2(-toM(speedPx), 0));
    this.obstacles.set(id, { body, type, width: shape.width });
    return body;
  }

  setSpeed(speedPx) {
    const v = new Vec2(-toM(speedPx), 0);
    for (const { body } of this.obstacles.values()) body.setLinearVelocity(v);
  }

  obstacleX(id) {
    const entry = this.obstacles.get(id);
    if (!entry) return null;
    return toPx(entry.body.getPosition().x) - entry.width / 2;
  }

  removeObstacle(id) {
    const entry = this.obstacles.get(id);
    if (!entry) return;
    this.world.destroyBody(entry.body);
    this.obstacles.delete(id);
  }

  /** Freeze the world while the player is out of frame. */
  pause() {
    this.setSpeed(0);
  }

  /**
   * Box2D is only stable at a fixed timestep, so a variable frame is drained
   * in 1/120s slices. The cap stops a long stall (tab in the background) from
   * turning into a huge catch-up that would teleport obstacles.
   *
   * Whatever the cap refuses is thrown away rather than left on the clock.
   * Keeping it looks harmless and is not: a device that cannot draw a frame
   * inside 66ms puts in more time than it can ever take out, so the debt only
   * grows, the world creeps further behind real time, and the moment the
   * device recovers it sprints through the backlog — the exact teleport the
   * cap exists to prevent. Dropping it means a struggling phone runs the
   * world slowly and honestly instead.
   */
  step(dt) {
    this.touching.clear();
    this.accumulator = (this.accumulator ?? 0) + Math.min(dt, 0.25);
    let slices = 0;
    while (this.accumulator >= FIXED_STEP && slices < 8) {
      this.world.step(FIXED_STEP, 8, 3);
      this.accumulator -= FIXED_STEP;
      slices += 1;
    }
    this.accumulator = Math.min(this.accumulator, FIXED_STEP);
    return this.touching;
  }
}
