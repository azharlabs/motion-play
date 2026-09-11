import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./orbit-keeper.js";
import { IDX } from "../landmarks.js";
import { VIEW, fxSpy, signals } from "./test-support.js";

/**
 * A landmark array putting the arms wherever the test wants them.
 *
 * Positions are given in the picture the player sees and flipped back into
 * the unmirrored space the pose model reports in, so the game has to do the
 * same flip the real pipeline needs.
 */
const POSE = {
  [IDX.LEFT_SHOULDER]: { x: 0.38, y: 0.4 },
  [IDX.RIGHT_SHOULDER]: { x: 0.62, y: 0.4 },
  // Arms straight out to the sides, so a forearm is a level bat and a ball
  // dropped on it comes straight back up.
  [IDX.LEFT_ELBOW]: { x: 0.24, y: 0.4 },
  [IDX.LEFT_WRIST]: { x: 0.1, y: 0.4 },
  [IDX.RIGHT_ELBOW]: { x: 0.76, y: 0.4 },
  [IDX.RIGHT_WRIST]: { x: 0.9, y: 0.4 },
  [IDX.LEFT_HIP]: { x: 0.43, y: 0.66 },
  [IDX.RIGHT_HIP]: { x: 0.57, y: 0.66 },
  [IDX.LEFT_KNEE]: { x: 0.3, y: 0.8 },
  [IDX.RIGHT_KNEE]: { x: 0.7, y: 0.8 },
};

function body(points = {}) {
  const marks = [];
  for (const [i, p] of Object.entries({ ...POSE, ...points })) {
    if (p) marks[Number(i)] = { x: 1 - p.x, y: p.y, visibility: 0.9 };
  }
  return signals({ landmarks: marks });
}

/**
 * A spot just clear of the middle of a limb, on the upper side of it.
 *
 * Measured along the limb's own perpendicular rather than straight up, or a
 * steep limb ends up with the "above" point beside it instead.
 */
function above(a, b, gap = 24) {
  const ax = VIEW.poseX(a.x);
  const ay = VIEW.poseY(a.y);
  const bx = VIEW.poseX(b.x);
  const by = VIEW.poseY(b.y);
  let nx = -(by - ay);
  let ny = bx - ax;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (ax + bx) / 2 + nx * gap, y: (ay + by) / 2 + ny * gap };
}

/** The middle of the left forearm, which is level in this pose. */
const FOREARM = () => above(POSE[IDX.LEFT_ELBOW], POSE[IDX.LEFT_WRIST]);

/** Nobody in shot at all. */
const empty = () => signals({ landmarks: [] });

/** Drop the game straight into a known state with one ball. */
function withBall(g, ball) {
  g.balls = [
    { x: 0, y: 0, vx: 0, vy: 0, color: "#fff", spin: 0, lit: 0, ...ball },
  ];
  return g.balls[0];
}

/** Two frames of the same pose, so limb speeds settle at zero. */
function settle(g, s = body(), from = 0) {
  g.tick(0.016, s, from + 16, VIEW);
  g.tick(0.016, s, from + 32, VIEW);
}

describe("Orbit Keeper bouncing", () => {
  it("bounces a falling ball back up off an arm", () => {
    const g = createGame();
    g.start(0);
    settle(g);
    const spot = FOREARM();
    const ball = withBall(g, { x: spot.x, y: spot.y, vy: 260 });
    const ev = g.tick(0.016, body(), 48, VIEW);
    assert.equal(ev.struck, 1);
    assert.ok(ball.vy < 0, `the ball carried on downwards at ${ball.vy}`);
  });

  it("leaves a ball nowhere near the body alone", () => {
    const g = createGame();
    g.start(0);
    settle(g);
    const ball = withBall(g, { x: VIEW.w * 0.5, y: VIEW.h * 0.05, vy: 100 });
    const ev = g.tick(0.016, body(), 48, VIEW);
    assert.equal(ev.struck, 0);
    assert.ok(ball.vy > 100, "gravity stopped working");
  });

  it("does not let a resting ball creep through a still arm", () => {
    const g = createGame();
    g.start(0);
    settle(g);
    const arm = VIEW.poseY(POSE[IDX.LEFT_ELBOW].y);
    const spot = FOREARM();
    const ball = withBall(g, { x: spot.x, y: spot.y, vy: 0 });
    for (let i = 0; i < 60; i += 1) g.tick(0.016, body(), 48 + i * 16, VIEW);
    assert.ok(ball.y < arm, `the ball sank to ${ball.y}, past the arm at ${arm}`);
  });

  it("throws a ball harder when the arm is swinging at it", () => {
    // The whole game is in this: the limb's own speed goes into the ball.
    const spot = FOREARM();
    const still = createGame();
    still.start(0);
    settle(still);
    const calm = withBall(still, { x: spot.x, y: spot.y, vy: 260 });
    still.tick(0.016, body(), 48, VIEW);

    const swung = createGame();
    swung.start(0);
    // The same arm, but coming up to meet the ball rather than waiting.
    settle(
      swung,
      body({
        [IDX.LEFT_ELBOW]: { x: 0.24, y: 0.52 },
        [IDX.LEFT_WRIST]: { x: 0.1, y: 0.52 },
      }),
    );
    const hit = withBall(swung, { x: spot.x, y: spot.y, vy: 260 });
    swung.tick(0.016, body(), 48, VIEW);

    assert.ok(
      hit.vy < calm.vy,
      `swinging (${hit.vy}) sent it no faster than holding still (${calm.vy})`,
    );
  });

  it("counts an arm bounce as a reach and a thigh bounce as a knee drive", () => {
    const arm = createGame();
    arm.start(0);
    settle(arm);
    const forearm = FOREARM();
    withBall(arm, { x: forearm.x, y: forearm.y, vy: 260 });
    arm.tick(0.016, body(), 48, VIEW);
    assert.equal(arm.summary().actions.reach, 1);

    const leg = createGame();
    leg.start(0);
    settle(leg);
    const thigh = above(POSE[IDX.LEFT_HIP], POSE[IDX.LEFT_KNEE]);
    withBall(leg, { x: thigh.x, y: thigh.y, vy: 260 });
    leg.tick(0.016, body(), 48, VIEW);
    assert.equal(leg.summary().actions.kick, 1);
    assert.equal(leg.summary().actions.reach, undefined, "a thigh was counted as a reach");
  });

  it("bounces off the side walls rather than losing the ball", () => {
    const g = createGame();
    g.start(0);
    settle(g);
    const ball = withBall(g, { x: 4, y: VIEW.h * 0.2, vx: -600 });
    g.tick(0.016, body(), 48, VIEW);
    assert.ok(ball.vx > 0, "the ball went through the wall");
    assert.ok(ball.x > 0, `the ball is off screen at ${ball.x}`);
  });
});

describe("Orbit Keeper scoring", () => {
  it("scores a ball dropped into the bucket", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    settle(g);
    g.bucket = 0.5;
    const box = g.constructor.bucketBox(VIEW, 0.5);
    withBall(g, { x: box.x + box.w / 2, y: box.y - 2, vy: 200 });
    const ev = g.tick(0.016, body(), 48, VIEW);
    assert.equal(ev.potted, 1);
    assert.ok(g.score > 0);
    assert.equal(g.balls.length, 0, "the potted ball is still in play");
  });

  it("costs a life for a ball that reaches the floor", () => {
    const g = createGame();
    g.start(0);
    settle(g);
    g.bucket = 0; // bucket hard left, ball falling on the right
    withBall(g, { x: VIEW.w * 0.95, y: VIEW.h * 1.05, vy: 300 });
    const ev = g.tick(0.016, body(), 48, VIEW);
    assert.equal(ev.dropped, 1);
    assert.equal(g.lives, 2);
  });

  it("ends the round on the last life", () => {
    const g = createGame({ lives: 1 });
    g.start(0);
    settle(g);
    g.bucket = 0;
    withBall(g, { x: VIEW.w * 0.95, y: VIEW.h * 1.05, vy: 300 });
    assert.equal(g.tick(0.016, body(), 48, VIEW).over, true);
  });

  it("does not pot a ball on its way up through the bucket", () => {
    const g = createGame();
    g.start(0);
    settle(g);
    g.bucket = 0.5;
    const box = g.constructor.bucketBox(VIEW, 0.5);
    withBall(g, { x: box.x + box.w / 2, y: box.y + 2, vy: -400 });
    assert.equal(g.tick(0.016, body(), 48, VIEW).potted, 0);
  });
});

describe("Orbit Keeper pacing", () => {
  it("starts with one ball and works up to three", () => {
    const g = createGame();
    g.start(0);
    assert.equal(g.wanted(), 1);
    g.level = g.maxLevel;
    assert.equal(g.wanted(), 3);
  });

  it("brings a new ball on after one is lost", () => {
    const g = createGame();
    g.start(0);
    for (let i = 0; i < 200; i += 1) g.tick(0.016, body(), i * 16, VIEW);
    assert.ok(g.balls.length >= 1, "no ball ever arrived");
  });

  it("falls faster as the levels come", () => {
    const g = createGame();
    g.start(0);
    const slow = g.gravity(VIEW);
    g.level = g.maxLevel;
    assert.ok(g.gravity(VIEW) > slow * 1.5, "the last level falls no faster");
  });

  it("slides the bucket back and forth without escaping the floor", () => {
    const g = createGame();
    g.start(0);
    for (let i = 0; i < 900; i += 1) {
      g.tick(0.016, body(), i * 16, VIEW);
      assert.ok(g.bucket >= 0 && g.bucket <= 1, `the bucket left the floor at ${g.bucket}`);
    }
  });

  it("holds everything still while the player is out of shot", () => {
    const g = createGame();
    g.start(0);
    const ball = withBall(g, { x: 100, y: 100, vy: 50 });
    g.tick(0.016, signals({ inFrame: false }), 16, VIEW);
    assert.deepEqual([ball.x, ball.y], [100, 100]);
  });

  it("keeps the balls on screen when the canvas changes shape", () => {
    const g = createGame();
    g.start(0);
    settle(g);
    const ball = withBall(g, { x: VIEW.w * 0.5, y: VIEW.h * 0.5 });
    const wide = { w: 800, h: 400, poseX: (n) => n * 800, poseY: (n) => n * 400 };
    g.tick(0.016, empty(), 48, wide);
    assert.ok(ball.x <= wide.w && ball.y <= wide.h, `ball left the canvas at ${ball.x},${ball.y}`);
    assert.ok(Math.abs(ball.x / wide.w - 0.5) < 0.01, "the ball did not keep its place");
  });
});
