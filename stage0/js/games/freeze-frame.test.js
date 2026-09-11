import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./freeze-frame.js";
import { VIEW, fxSpy, hand, signals } from "./test-support.js";

/**
 * Feed the game frames in which the body is displaced by `jog` either side of
 * where it started, so a steady amount of movement can be held for a while.
 *
 * `jog` is in display space, and the game divides by a shoulder width of 0.2
 * to get body widths, so a jog of 0.01 at 33ms a frame is a brisk march and a
 * jog of 0.0005 is the twitch of somebody trying to stand still.
 */
function drive(g, { ms, step = 33, jog = 0, from = 0, inFrame = true } = {}) {
  // Being caught and getting home are single-frame events, so the run has to
  // report whether they happened at all, not what the final frame said.
  const seen = { caught: false, home: false, over: false, light: g.phase };
  let now = from;
  let i = 0;
  for (let t = 0; t < ms; t += step) {
    now += step;
    const off = (i % 2 ? 1 : -1) * jog;
    i += 1;
    const ev = g.tick(
      step / 1000,
      signals({
        inFrame,
        hands: { left: hand(0.35 + off, 0.5), right: hand(0.65 + off, 0.5) },
        shoulder: { x: 0.5 + off, y: 0.35, width: 0.2 },
      }),
      now,
      VIEW,
    );
    seen.caught ||= ev.caught;
    seen.home ||= ev.home;
    seen.over ||= ev.over;
    seen.light = ev.light;
  }
  return seen;
}

/** Put the game on a red light that is already judging. */
function onRed(g, seconds = 2) {
  g.phase = "red";
  g.phaseLeft = seconds;
  g.settle = 0;
}

describe("Freeze Frame lights", () => {
  it("turns red when the green light runs out", () => {
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 0.1;
    const ev = drive(g, { ms: 300, jog: 0.004 });
    assert.equal(ev.light, "red");
  });

  it("warns before it turns, so stopping in time is possible", () => {
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 2;
    assert.equal(g.warning(), false);
    g.phaseLeft = 0.4;
    assert.equal(g.warning(), true);
  });

  it("goes back to green after the red light, and scores the freeze", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    onRed(g, 0.5);
    const ev = drive(g, { ms: 800, jog: 0 });
    assert.equal(ev.light, "green");
    assert.ok(g.score > 0, "surviving a red light scored nothing");
    assert.equal(g.summary().actions.hold, 1);
    assert.equal(g.lives, 3);
    assert.equal(fx.played("go"), true);
  });
});

describe("Freeze Frame catching", () => {
  it("catches a player who moves on red", () => {
    const g = createGame();
    g.start(0);
    onRed(g);
    const ev = drive(g, { ms: 600, jog: 0.01 });
    assert.equal(ev.caught, true);
    assert.equal(g.lives, 2);
  });

  it("leaves a still player alone on red", () => {
    const g = createGame();
    g.start(0);
    onRed(g);
    const ev = drive(g, { ms: 600, jog: 0 });
    assert.equal(ev.caught, false);
    assert.equal(g.lives, 3);
  });

  it("costs one life per red light, however long the wriggling goes on", () => {
    const g = createGame();
    g.start(0);
    onRed(g, 5);
    drive(g, { ms: 3000, jog: 0.01 });
    assert.equal(g.lives, 2);
  });

  it("does not judge the first moment of a red light", () => {
    // Nobody stops dead on the whistle; the tail of the movement that was
    // already happening must not count.
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 0.01;
    const ev = drive(g, { ms: 300, jog: 0.01 });
    assert.equal(ev.light, "red");
    assert.equal(g.lives, 3, "caught on the tail of the movement it asked for");
  });

  it("catches the same movement once the settling is over", () => {
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 0.01;
    drive(g, { ms: 1200, jog: 0.01 });
    assert.equal(g.lives, 2);
  });

  it("sets the bar from this player's own stillness, not a fixed number", () => {
    // A camera in poor light reports a statue as a fidget. A player whose
    // stillness reads high through the settling must not then be caught for
    // exactly that much movement.
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 0.01;
    drive(g, { ms: 1500, jog: 0.00075 });
    assert.ok(g.floor > 0.06, `the bar never moved off its minimum (${g.floor})`);
    assert.equal(g.lives, 3, "caught for the jitter it measured as this player's still");
  });

  it("still catches a real movement from a jittery player", () => {
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 0.01;
    // Settle against a jittery baseline, then actually move.
    drive(g, { ms: 500, jog: 0.00075 });
    drive(g, { ms: 600, jog: 0.01, from: 500 });
    assert.equal(g.lives, 2);
  });

  it("ends the round when the last life goes", () => {
    const g = createGame({ lives: 1 });
    g.start(0);
    onRed(g);
    assert.equal(drive(g, { ms: 600, jog: 0.01 }).over, true);
  });

  it("judges nothing while the player is out of shot", () => {
    const g = createGame();
    g.start(0);
    onRed(g, 5);
    drive(g, { ms: 1000, jog: 0.02, inFrame: false });
    assert.equal(g.lives, 3);
  });

  it("gets stricter as the levels come", () => {
    const g = createGame();
    g.start(0);
    const easy = g.strictness();
    g.level = g.maxLevel;
    assert.ok(g.strictness() < easy, "the last level is no stricter than the first");
  });
});

describe("Freeze Frame track", () => {
  it("only covers ground while the player is moving", () => {
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 30;
    drive(g, { ms: 1000, jog: 0 });
    assert.equal(g.progress, 0, "standing about got down the track");

    drive(g, { ms: 1000, jog: 0.01, from: 1000 });
    assert.ok(g.progress > 0.1, `a second of marching moved ${g.progress}`);
  });

  it("scores a run home and sends the runner back to the start", () => {
    const g = createGame();
    g.start(0);
    g.phase = "green";
    g.phaseLeft = 30;
    g.progress = 0.97;
    const ev = drive(g, { ms: 700, jog: 0.01 });
    assert.equal(ev.home, true);
    assert.ok(g.progress < 0.5, `progress stayed at ${g.progress}`);
    assert.ok(g.score > 0);
  });

  it("knocks the runner back when caught, but never past the start", () => {
    const g = createGame();
    g.start(0);
    onRed(g);
    g.progress = 0.05;
    drive(g, { ms: 600, jog: 0.01 });
    assert.equal(g.progress, 0);
  });

  it("loses ground for being caught", () => {
    const g = createGame();
    g.start(0);
    onRed(g);
    g.progress = 0.6;
    drive(g, { ms: 600, jog: 0.01 });
    assert.ok(g.progress < 0.6, "being caught cost nothing on the track");
  });
});
