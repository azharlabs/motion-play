/**
 * The same play should give the same result on any device.
 *
 * Every game here eases something towards a target - a bird towards your
 * hands, a skier towards your lean - and the tempting way to write that is
 * `lerp(here, there, rate * dt)`. It is wrong, because it closes a fraction of
 * the gap once per frame, so a 120Hz laptop closes it four times as often as a
 * 30fps phone and gets there sooner. The game is then quietly more responsive
 * on better hardware, which for a game scored on how fast you move is a
 * fairness problem, not a polish one.
 *
 * Easing at a constant rate is exponential decay, and the gap left after a
 * given stretch of time does not depend on how that time was sliced up. So
 * these tests can demand near-exact agreement between frame rates rather than
 * a loose tolerance, and they fail loudly the moment anyone writes `rate * dt`
 * again.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { approach } from "./common.js";
import { createGame as createSkyFlap } from "./sky-flap.js";
import { createGame as createSkiSlalom } from "./ski-slalom.js";
import { createGame as createLaneRunner } from "./lane-runner.js";
import { createGame as createSquatRush } from "./squat-rush.js";
import { hand, signals, VIEW } from "./test-support.js";

const fx = { cue: () => true };

/**
 * Hold one pose for `seconds` at a given frame rate and report the game.
 * The rates all divide the duration exactly, so the two runs are compared at
 * the very same instant rather than half a frame apart.
 */
function hold(create, s, fps, seconds) {
  const dt = 1 / fps;
  const game = create({ fx });
  game.start(0);
  let now = 0;
  for (let i = 0; i < Math.round(seconds * fps); i += 1) {
    game.tick(dt, s, (now += dt * 1000), VIEW);
  }
  return game;
}

/**
 * Read one number off the same held pose at 30, 60 and 120fps. The duration
 * is a whole number of frames at all three, so every run really does cover
 * the same stretch of time.
 */
function atEachRate(create, s, read, seconds = 0.2) {
  for (const fps of [30, 60, 120]) {
    assert.equal(seconds * fps, Math.round(seconds * fps), `${seconds}s is not whole at ${fps}fps`);
  }
  return [30, 60, 120].map((fps) => read(hold(create, s, fps, seconds)));
}

function assertAgree(values, what) {
  const spread = Math.max(...values) - Math.min(...values);
  assert.ok(
    spread < 1e-9,
    `${what} differs with frame rate: ${values.map((v) => v.toFixed(6)).join(" vs ")}`,
  );
}

describe("approach", () => {
  it("closes the same share of the gap however the time is sliced", () => {
    // Chasing for a second in one lump, in sixty frames, or in six hundred,
    // has to leave the same distance to go.
    const left = (fps) => {
      let gap = 1;
      for (let i = 0; i < fps; i += 1) gap *= 1 - approach(7, 1 / fps);
      return gap;
    };
    const one = 1 - approach(7, 1);
    for (const fps of [1, 30, 60, 600]) {
      assert.ok(Math.abs(left(fps) - one) < 1e-12, `${fps}fps left ${left(fps)}, want ${one}`);
    }
  });

  it("never overshoots, however long the frame", () => {
    // A very long frame arrives exactly, which is right; what it must never do
    // is sail past the target and come back, the way `rate * dt` does without
    // a cap bolted on.
    for (const dt of [0.016, 0.25, 2, 60]) {
      const t = approach(9, dt);
      assert.ok(t > 0 && t <= 1, `a ${dt}s frame moved ${t} of the way`);
    }
  });

  it("is quicker at a higher rate", () => {
    assert.ok(approach(12, 0.1) > approach(3, 0.1));
  });
});

describe("frame rate independence", () => {
  it("Sky Flap: the bird is in the same place", () => {
    const s = signals({ hands: { left: hand(0.4, 0.18), right: hand(0.6, 0.18) } });
    const seen = atEachRate(createSkyFlap, s, (g) => g.birdY);
    // The bird must actually have set off, or this proves nothing.
    assert.ok(Math.abs(seen[0] - 0.5) > 0.05, `the bird never moved: ${seen[0]}`);
    assertAgree(seen, "bird height");
  });

  it("Ski Slalom: the skier is in the same place", () => {
    const s = signals({ lean: 0.8 });
    const seen = atEachRate(createSkiSlalom, s, (g) => g.x);
    assert.ok(Math.abs(seen[0] - 0.5) > 0.05, `the skier never moved: ${seen[0]}`);
    assertAgree(seen, "skier position");
  });

  it("Lane Runner: the runner is the same distance across", () => {
    const s = signals({ lean: -0.9 });
    const seen = atEachRate(createLaneRunner, s, (g) => g.laneX);
    assert.ok(Math.abs(seen[0] - 1) > 0.05, `the runner never moved: ${seen[0]}`);
    assertAgree(seen, "lane position");
  });

  it("Squat Rush: the squat is read as the same depth", () => {
    const s = signals({ crouch: 0.7 });
    const seen = atEachRate(createSquatRush, s, (g) => g.smooth);
    assert.ok(seen[0] > 0.05, `the squat never registered: ${seen[0]}`);
    assertAgree(seen, "squat depth");
  });
});
