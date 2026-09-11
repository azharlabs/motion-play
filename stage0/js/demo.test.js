import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { armPose, clipsFor, currentClip, clipCue, drawHowTo, drawPip, CLIPS } from "./demo.js";
import { GAMES } from "./games/registry.js";
import { ACTIONS } from "./skills.js";

/** A 2D context stand-in that records the calls worth asserting on. */
function stubCtx() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const target = { calls };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "calls") return calls;
      if (prop === "canvas") return { width: 300, height: 250 };
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => gradient;
      }
      if (prop === "measureText") return () => ({ width: 40 });
      if (!(prop in t)) {
        t[prop] = (...args) => {
          calls.push([prop, ...args]);
          // Nothing a clip draws may be NaN: it paints as nothing at all, so
          // a broken pose would be an invisible failure rather than a loud one.
          for (const a of args) {
            if (typeof a === "number") assert.ok(Number.isFinite(a), `${prop} got ${a}`);
          }
        };
      }
      return t[prop];
    },
    set() {
      return true;
    },
  });
}

describe("posing an arm", () => {
  it("puts the paw on the target when it can reach", () => {
    const { hand, elbow } = armPose(0, 0, 30, 30, 1, 30, 30);
    assert.ok(Math.hypot(hand.x - 30, hand.y - 30) < 1e-6, "the paw missed the target");
    // The bones do not stretch to get there.
    assert.ok(Math.abs(Math.hypot(elbow.x, elbow.y) - 30) < 1e-6, "the upper arm changed length");
    assert.ok(
      Math.abs(Math.hypot(hand.x - elbow.x, hand.y - elbow.y) - 30) < 1e-6,
      "the forearm changed length",
    );
  });

  it("stops at arm's length instead of stretching", () => {
    const { hand } = armPose(0, 0, 400, 0, 1, 30, 30);
    const reach = Math.hypot(hand.x, hand.y);
    assert.ok(reach <= 60, `reached ${reach.toFixed(1)}, further than the arm is long`);
    assert.ok(reach > 55, `only reached ${reach.toFixed(1)} of a possible 60`);
  });

  it("breaks the elbow the way it is told", () => {
    const out = armPose(0, 0, 0, 50, 1).elbow;
    const other = armPose(0, 0, 0, 50, -1).elbow;
    assert.ok(out.x * other.x < 0, "both bends put the elbow on the same side");
  });

  it("survives a target on top of the shoulder", () => {
    const { hand, elbow } = armPose(0, 0, 0, 0, 1);
    for (const n of [hand.x, hand.y, elbow.x, elbow.y]) assert.ok(Number.isFinite(n));
  });
});

describe("choosing what to demonstrate", () => {
  it("has a clip for every movement a game counts", () => {
    for (const game of GAMES) {
      for (const action of game.actions) {
        assert.ok(CLIPS[action], `${game.id} counts "${action}" with nothing to show for it`);
      }
    }
  });

  it("has something to demonstrate for every game", () => {
    for (const game of GAMES) {
      assert.ok(clipsFor(game).length > 0, `${game.id} demonstrates nothing`);
    }
  });

  it("tells the player how to do every movement", () => {
    for (const action of ACTIONS) {
      const cue = clipCue(action.id);
      assert.ok(cue.length > 12, `"${action.id}" has no usable cue`);
      // A cue is an instruction to a body, not a sentence about a game.
      assert.ok(!/\bpoints?\b|\bscore\b/i.test(cue), `"${action.id}" talks about scoring`);
    }
  });

  it("works through each movement in turn, then comes back round", () => {
    const twoThings = GAMES.find((g) => clipsFor(g).length > 1);
    assert.ok(twoThings, "expected at least one game asking for two movements");
    const ids = clipsFor(twoThings);
    const total = ids.reduce((sum, id) => sum + CLIPS[id].ms, 0);

    const seen = new Set();
    for (let t = 0; t < total; t += 50) seen.add(currentClip(twoThings, t).id);
    assert.deepEqual([...seen].sort(), [...ids].sort(), "not every movement got shown");

    // The loop repeats rather than running out.
    assert.equal(currentClip(twoThings, 0).id, currentClip(twoThings, total).id);
    assert.equal(currentClip(twoThings, 25).id, currentClip(twoThings, total * 3 + 25).id);
  });

  it("keeps the phase inside the clip", () => {
    const game = GAMES[0];
    for (let t = -5000; t < 20000; t += 37) {
      const { phase } = currentClip(game, t);
      assert.ok(phase >= 0 && phase < 1, `phase ${phase} at ${t}`);
    }
  });

  it("says nothing rather than guessing for a game with no movements", () => {
    assert.deepEqual(currentClip({ actions: [] }, 500), { id: null, index: -1, phase: 0 });
    assert.equal(currentClip({}, 0).id, null);
  });
});

describe("drawing the demonstration", () => {
  it("draws every game, all the way through its loop", () => {
    for (const game of GAMES) {
      const ctx = stubCtx();
      const total = clipsFor(game).reduce((sum, id) => sum + CLIPS[id].ms, 0);
      for (let t = 0; t <= total; t += 40) {
        drawHowTo(ctx, { w: 300, h: 250 }, game, t);
      }
      assert.ok(ctx.calls.length > 200, `${game.id} barely drew anything`);
    }
  });

  it("draws at any size without complaint", () => {
    for (const size of [{ w: 120, h: 90 }, { w: 900, h: 700 }, { w: 300, h: 40 }]) {
      drawHowTo(stubCtx(), size, GAMES[0], 700);
    }
  });

  it("copes with a game it knows nothing about", () => {
    drawHowTo(stubCtx(), { w: 300, h: 250 }, { id: "mystery", actions: [] }, 0);
    drawHowTo(stubCtx(), { w: 300, h: 250 }, {}, 1234);
  });

  it("draws Pip in an empty pose", () => {
    const ctx = stubCtx();
    drawPip(ctx, {});
    assert.ok(ctx.calls.length > 20, "Pip barely drew anything");
  });

  /*
   * Goalkeeper and Balloon Pop are the same movement, so they share a clip.
   * Sharing the movement is right; sharing the prop told keepers to pop a
   * balloon on a string, which is a different game entirely.
   */
  it("hands the keeper a ball and the popper a balloon", () => {
    const propsOf = (game) => {
      const ctx = stubCtx();
      for (let t = 0; t <= CLIPS.reach.ms; t += 40) {
        drawHowTo(ctx, { w: 300, h: 250 }, game, t);
      }
      return ctx.calls;
    };

    const keeper = propsOf(GAMES.find((g) => g.id === "goalkeeper"));
    const popper = propsOf(GAMES.find((g) => g.id === "balloon-pop"));

    // A balloon is an ellipse on a curved string; the ball is neither.
    const strings = (calls) => calls.filter((c) => c[0] === "quadraticCurveTo").length;
    assert.ok(strings(popper) > 0, "the balloon lost its string");
    assert.equal(strings(keeper), 0, "the keeper is being shown a balloon on a string");
  });

  /*
   * The arm is only at full stretch for a moment in the middle of the reach.
   * The save has to happen inside it, or the picture is a ball hanging in the
   * air beside a paw that has already started coming back.
   */
  it("has the ball on the paw at the moment of the save", () => {
    let saves = 0;
    for (let phase = 0; phase < 1; phase += 0.004) {
      const clip = CLIPS.reach.draw(phase, "#6366f1", { reachFor: "ball" });
      const front = stubCtx();
      clip.front(front);
      if (!front.calls.length) continue;

      const back = stubCtx();
      clip.back(back);
      const ball = back.calls.find((c) => c[0] === "arc");
      const paw = Object.values(clip.pose.arms)[0];
      const gap = Math.hypot(ball[1] - paw.x, ball[2] - paw.y);
      assert.ok(gap < 18, `the paw was ${gap.toFixed(0)} away from the ball it just saved`);
      saves += 1;
    }
    assert.ok(saves > 0, "the ball never got saved at all");
  });

  it("still draws a balloon for a game that does not ask for anything else", () => {
    const ctx = stubCtx();
    drawHowTo(ctx, { w: 300, h: 250 }, { needs: "upper", actions: ["reach"] }, 200);
    assert.ok(ctx.calls.some((c) => c[0] === "ellipse"), "expected the default prop");
  });

  it("frames upper-body games closer than full-body ones", () => {
    const scaleOf = (needs) => {
      const ctx = stubCtx();
      drawHowTo(ctx, { w: 300, h: 250 }, { needs, actions: ["punch"], accent: "#fff" }, 0);
      return ctx.calls.filter((c) => c[0] === "scale")[0]?.[1];
    };
    assert.ok(scaleOf("upper") > scaleOf("full"), "upper-body games should be framed closer");
  });
});
