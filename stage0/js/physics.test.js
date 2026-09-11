import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Physics, jumpSolve, OB_WALL, OB_BRANCH, OB_SHAPE } from "./physics.js";

const STEP = 1 / 60;

function run(physics, seconds, onStep) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const hits = physics.step(STEP);
    if (onStep) onStep(i * STEP, hits);
  }
}

describe("jumpSolve", () => {
  it("derives gravity and takeoff from the apex and hang time we want", () => {
    const { gravity, takeoff } = jumpSolve(180, 950);
    // Apex = v^2/2g and hang = 2v/g should reproduce the inputs.
    const apexM = (takeoff * takeoff) / (2 * gravity);
    const hangS = (2 * takeoff) / gravity;
    assert.ok(Math.abs(apexM * 50 - 180) < 0.5, `apex ${apexM * 50}px`);
    assert.ok(Math.abs(hangS * 1000 - 950) < 1, `hang ${hangS * 1000}ms`);
  });
});

describe("Physics player", () => {
  it("rests on the ground under gravity instead of sinking or drifting", () => {
    const p = new Physics();
    run(p, 2);
    assert.ok(p.feetPx < 1, `feet settled at ${p.feetPx}px`);
    assert.equal(p.grounded, true);
  });

  it("reaches the requested apex and lands after the hang time", () => {
    const p = new Physics({ apexPx: 180, hangMs: 950 });
    run(p, 0.5); // settle
    p.jump();

    let apex = 0;
    let landedAt = null;
    run(p, 2, (t) => {
      apex = Math.max(apex, p.feetPx);
      if (landedAt == null && t > 0.2 && p.grounded) landedAt = t;
    });

    assert.ok(Math.abs(apex - 180) < 12, `apex was ${apex.toFixed(1)}px`);
    assert.ok(Math.abs(landedAt * 1000 - 950) < 60, `landed at ${(landedAt * 1000).toFixed(0)}ms`);
  });

  it("refuses a second jump while airborne", () => {
    const p = new Physics();
    run(p, 0.5);
    assert.equal(p.jump(), true);
    run(p, 0.25);
    assert.equal(p.jump(), false, "no double jump");
  });

  it("shrinks the collider when ducking but keeps the feet planted", () => {
    const p = new Physics();
    run(p, 0.5);
    p.setDuck(true);
    run(p, 0.5);
    assert.equal(p.playerHeight, p.duckHeight);
    assert.ok(p.feetPx < 1, `feet lifted to ${p.feetPx}px while ducking`);
    p.setDuck(false);
    run(p, 0.5);
    assert.equal(p.playerHeight, p.standHeight);
    assert.ok(p.feetPx < 1);
  });
});

describe("Physics timestep", () => {
  it("reaches the same height whatever the frame rate", () => {
    const apexes = [30, 60, 90, 144].map((fps) => {
      const dt = 1 / fps;
      const p = new Physics({ apexPx: 180, hangMs: 950 });
      for (let i = 0; i < Math.round(0.5 / dt); i += 1) p.step(dt);
      p.jump();
      let apex = 0;
      for (let i = 0; i < Math.round(1.5 / dt); i += 1) {
        p.step(dt);
        apex = Math.max(apex, p.feetPx);
      }
      return apex;
    });
    const spread = Math.max(...apexes) - Math.min(...apexes);
    assert.ok(spread < 2, `jump height varies by ${spread.toFixed(1)}px: ${apexes.join(", ")}`);
  });

  it("does not sprint through a backlog after the device stalls", () => {
    // A phone that drops a couple of seconds of frames must come back to a
    // world where it left it. Banking the time it could not simulate and
    // spending it later throws the obstacles at the player at several times
    // the speed they were promised, through no fault of their own.
    const p = new Physics();
    p.addObstacle(1, OB_WALL, 100000, 300);
    for (let i = 0; i < 6; i += 1) p.step(0.4);

    const before = p.obstacleX(1);
    for (let i = 0; i < 30; i += 1) p.step(STEP);
    const ranFor = (before - p.obstacleX(1)) / 300;

    assert.ok(
      Math.abs(ranFor - 0.5) < 0.05,
      `half a second of smooth frames ran ${ranFor.toFixed(3)}s of world`,
    );
  });
});

describe("Physics collisions", () => {
  /** Send one obstacle past the player and report whether it ever touched. */
  function pass(type, { jumpAt = null, duck = false, speed = 300 } = {}) {
    const p = new Physics();
    run(p, 0.5);
    p.setDuck(duck);
    p.addObstacle(1, type, 900, speed);

    let touched = false;
    let jumped = false;
    const startX = 900;
    run(p, 4, () => {
      const x = p.obstacleX(1);
      if (jumpAt != null && !jumped && x <= jumpAt) {
        jumped = p.jump();
      }
      if (p.touching.has(1)) touched = true;
      if (x < -200) return;
      assert.ok(x <= startX + 1);
    });
    return touched;
  }

  it("a standing player is hit by the wall", () => {
    assert.equal(pass(OB_WALL), true);
  });

  it("a well timed jump clears the wall", () => {
    assert.equal(pass(OB_WALL, { jumpAt: 290 }), false);
  });

  it("gives a jump window of at least 80px of approach to aim at", () => {
    const clears = [];
    for (let at = 200; at <= 420; at += 10) {
      if (!pass(OB_WALL, { jumpAt: at })) clears.push(at);
    }
    const span = clears.at(-1) - clears[0];
    assert.ok(clears.length > 0, "some jump timing must work");
    assert.ok(span >= 80, `only ${span}px of usable timing: ${clears.join(",")}`);
  });

  it("jumping far too early still clips the wall on the way down", () => {
    assert.equal(pass(OB_WALL, { jumpAt: 820 }), true);
  });

  it("a standing player is hit by the low branch", () => {
    assert.equal(pass(OB_BRANCH), true);
  });

  it("ducking clears the branch", () => {
    assert.equal(pass(OB_BRANCH, { duck: true }), false);
  });

  it("jumping into a branch is a hit, because you rise into it", () => {
    assert.equal(pass(OB_BRANCH, { jumpAt: 290 }), true);
  });

  it("keeps the clearance window wider than the overlap at every speed", () => {
    // Feet must stay above the wall for as long as the boxes overlap,
    // otherwise even a perfectly timed jump is unwinnable.
    const p = new Physics();
    const wall = OB_SHAPE[OB_WALL];
    const g = p.gravity * 50;
    const v = p.takeoff * 50;
    const disc = v * v - 2 * g * wall.top;
    assert.ok(disc > 0, "the jump must clear the wall at all");
    const windowMs = ((2 * Math.sqrt(disc)) / g) * 1000;

    for (const speed of [300, 400, 520]) {
      const overlapMs = ((wall.width + p.playerWidth) / speed) * 1000;
      assert.ok(
        windowMs > overlapMs + 150,
        `at ${speed}px/s the window is ${windowMs.toFixed(0)}ms vs ${overlapMs.toFixed(0)}ms overlap`,
      );
    }
  });
});
