import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./body-drums.js";
import { IDX } from "../landmarks.js";
import { VIEW, fxSpy, hand, noHand, signals } from "./test-support.js";

/**
 * One frame of tracking. Hands are given in the picture the player sees;
 * knees are written into the raw landmark array unmirrored, the way the pose
 * model really delivers them, so the game has to flip them itself.
 */
function frame({ lh = null, rh = null, lk = null, rk = null } = {}) {
  const marks = [];
  const put = (i, p) => {
    if (p) marks[i] = { x: 1 - p.x, y: p.y, visibility: 0.9 };
  };
  put(IDX.LEFT_KNEE, lk);
  put(IDX.RIGHT_KNEE, rk);
  return signals({
    hands: {
      left: lh ? hand(lh.x, lh.y, lh.speed ?? 0) : noHand,
      right: rh ? hand(rh.x, rh.y, rh.speed ?? 0) : noHand,
    },
    shoulder: { x: 0.5, y: 0.35, width: 0.2 },
    landmarks: marks,
  });
}

/** A game with the beat generator switched off, so tests place their own. */
function quiet(opts = {}) {
  const g = createGame(opts);
  g.start(0);
  g.nextBeat = Number.MAX_SAFE_INTEGER;
  // One frame away from everything, to settle the pads and the contact state.
  g.tick(0.033, frame({ lh: { x: 0.1, y: 0.95 }, rh: { x: 0.9, y: 0.95 } }), 33, VIEW);
  return g;
}

const padNamed = (g, id) => g.layout(VIEW).find((p) => p.id === id);

/** Put a note on this pad a moment from now. */
function due(g, id, inS = 0.02) {
  g.notes.push({ pad: id, at: g.clock + inS, judged: false });
}

describe("Body Drums pads", () => {
  it("hangs the pads off the shoulders, two high and two low", () => {
    const g = quiet();
    const pads = g.layout(VIEW);
    assert.equal(pads.length, 4);
    const [lh, rh, lk, rk] = pads;
    assert.ok(lh.x < 0.5 && rh.x > 0.5, "the hand pads are not either side");
    assert.ok(lk.y > lh.y && rk.y > rh.y, "the knee pads are not below the hand pads");
    assert.ok(Math.abs(lk.x - 0.5) < Math.abs(lh.x - 0.5), "the knee pads are not inboard");
  });

  it("makes the pad you can hit the same circle that is drawn", () => {
    // A radius kept in display space is wider than it is tall once it is on
    // a screen, so the hit area has to be sized in pixels like the drawing.
    const g = quiet();
    const pad = padNamed(g, "rh");
    const justOut = pad.r + 3;
    for (const [dx, dy] of [
      [justOut, 0],
      [0, justOut],
    ]) {
      const at = {
        x: pad.x + dx / VIEW.w,
        y: pad.y + dy / VIEW.h,
        speed: 2.4,
      };
      const fresh = quiet();
      due(fresh, "rh");
      const ev = fresh.tick(0.033, frame({ rh: at }), 66, VIEW);
      assert.equal(ev.hits, 0, `a strike ${dx || dy}px outside the rim still counted`);
    }
  });

  it("moves the pads with the player, but not with the jitter", () => {
    const g = quiet();
    const before = padNamed(g, "rh").x;
    // One frame of the shoulders jumping right.
    const jump = frame({});
    jump.shoulder = { x: 0.8, y: 0.35, width: 0.2 };
    g.tick(0.033, jump, 66, VIEW);
    const after = padNamed(g, "rh").x;
    assert.ok(after > before, "the pads did not follow at all");
    assert.ok(after - before < 0.1, `the pads jumped ${after - before} in one frame`);
  });

  it("says to step back until the body is in shot", () => {
    const g = createGame();
    g.start(0);
    g.tick(0.033, signals({ shoulder: null }), 33, VIEW);
    assert.equal(g.layout(VIEW), null);
  });
});

describe("Body Drums striking", () => {
  it("scores a hand driven into its pad on the beat", () => {
    const fx = fxSpy();
    const g = quiet({ fx });
    due(g, "rh");
    const pad = padNamed(g, "rh");
    const ev = g.tick(0.033, frame({ rh: { x: pad.x, y: pad.y, speed: 2.4 } }), 66, VIEW);
    assert.equal(ev.hits, 1);
    assert.ok(g.score > 0);
    assert.equal(g.summary().actions.punch, 1);
    assert.equal(fx.played("pop"), true);
  });

  it("ignores a hand resting on the pad", () => {
    const g = quiet();
    due(g, "rh", 5);
    const pad = padNamed(g, "rh");
    // Parked on the pad, going nowhere.
    for (let i = 0; i < 10; i += 1) {
      g.tick(0.033, frame({ rh: { x: pad.x, y: pad.y, speed: 0.1 } }), 66 + i * 33, VIEW);
    }
    assert.equal(g.score, 0);
  });

  it("only scores once per strike, not once per frame on the pad", () => {
    const g = quiet();
    due(g, "rh");
    const pad = padNamed(g, "rh");
    let hits = 0;
    for (let i = 0; i < 10; i += 1) {
      hits += g.tick(
        0.033,
        frame({ rh: { x: pad.x, y: pad.y, speed: 2.4 } }),
        66 + i * 33,
        VIEW,
      ).hits;
    }
    assert.equal(hits, 1, `one strike scored ${hits} times`);
  });

  it("marks a strike on the beat as clean and one off it as merely a hit", () => {
    const clean = quiet();
    due(clean, "rh", 0);
    let pad = padNamed(clean, "rh");
    clean.tick(0.001, frame({ rh: { x: pad.x, y: pad.y, speed: 2.4 } }), 40, VIEW);
    assert.equal(clean.perfect, 1);

    const late = quiet();
    due(late, "rh", -0.16); // near the far edge of the window
    pad = padNamed(late, "rh");
    late.tick(0.001, frame({ rh: { x: pad.x, y: pad.y, speed: 2.4 } }), 40, VIEW);
    assert.equal(late.hits, 1);
    assert.equal(late.perfect, 0);
  });

  it("gives nothing for hitting a pad with no note on it", () => {
    const g = quiet();
    g.combo = 4;
    const pad = padNamed(g, "rh");
    const ev = g.tick(0.033, frame({ rh: { x: pad.x, y: pad.y, speed: 2.4 } }), 66, VIEW);
    assert.equal(ev.early, 1);
    assert.equal(g.score, 0);
    assert.equal(g.combo, 0, "flailing kept the combo");
  });

  it("will not let a hand answer a knee's note", () => {
    const g = quiet();
    due(g, "lk", 5);
    const pad = padNamed(g, "lk");
    // A hand right on the knee pad.
    g.tick(0.033, frame({ lh: { x: pad.x, y: pad.y, speed: 2.4 } }), 66, VIEW);
    assert.equal(g.score, 0);
  });
});

describe("Body Drums knees", () => {
  it("scores a knee driven up into its pad", () => {
    const g = quiet();
    const pad = padNamed(g, "lk");
    // Down first, so the game has something to measure the drive against.
    g.tick(0.033, frame({ lk: { x: pad.x, y: 0.95 } }), 66, VIEW);
    due(g, "lk");
    const ev = g.tick(0.033, frame({ lk: { x: pad.x, y: pad.y } }), 99, VIEW);
    assert.equal(ev.hits, 1);
    assert.equal(g.summary().actions.kick, 1);
  });

  it("reads the knee in the picture the player sees, not the raw frame", () => {
    // The left knee pad is left of centre on screen. A landmark array that
    // has not been flipped would put the knee on the wrong side of the body.
    const g = quiet();
    const pad = padNamed(g, "lk");
    assert.ok(pad.x < 0.5);
    g.tick(0.033, frame({ lk: { x: pad.x, y: 0.95 } }), 66, VIEW);
    due(g, "lk");
    g.tick(0.033, frame({ lk: { x: pad.x, y: pad.y } }), 99, VIEW);
    assert.equal(g.hits, 1, "the knee did not arrive where the pad is drawn");
  });

  it("ignores a knee the model cannot see", () => {
    const g = quiet();
    due(g, "lk", 5);
    const pad = padNamed(g, "lk");
    const blind = frame({ lk: { x: pad.x, y: pad.y } });
    blind.landmarks[IDX.LEFT_KNEE].visibility = 0.1;
    for (let i = 0; i < 6; i += 1) g.tick(0.033, blind, 66 + i * 33, VIEW);
    assert.equal(g.score, 0);
  });
});

describe("Body Drums timing", () => {
  it("counts a note nobody answered as a miss, without ending anything", () => {
    const g = quiet();
    g.combo = 5;
    due(g, "rh", 0.05);
    let misses = 0;
    let over = false;
    for (let i = 0; i < 20; i += 1) {
      const ev = g.tick(0.033, frame({}), 66 + i * 33, VIEW);
      misses += ev.misses;
      over ||= ev.over;
    }
    assert.equal(misses, 1);
    assert.equal(g.combo, 0);
    assert.equal(over, false, "a missed beat ended the round");
    assert.equal(g.lives, 0, "a rhythm game should not be carrying lives");
  });

  it("clears notes away once they are past answering", () => {
    const g = quiet();
    due(g, "rh", 0.05);
    for (let i = 0; i < 40; i += 1) g.tick(0.033, frame({}), 66 + i * 33, VIEW);
    assert.equal(g.notes.length, 0, "old notes are piling up");
  });

  it("speeds the beat up as the levels come", () => {
    const g = createGame();
    g.start(0);
    const slow = g.bpm();
    g.level = g.maxLevel;
    assert.ok(g.bpm() > slow * 1.4, `the last level runs at ${g.bpm()} against ${slow}`);
  });

  it("puts every note far enough ahead to be seen coming", () => {
    // Some beats are rests, so this watches for notes appearing over a long
    // run rather than expecting one on any particular tick.
    const g = createGame();
    g.start(0);
    let seen = 0;
    for (let i = 0; i < 400; i += 1) {
      const before = new Set(g.notes);
      g.tick(0.033, frame({}), i * 33, VIEW);
      for (const note of g.notes) {
        if (before.has(note)) continue;
        seen += 1;
        assert.ok(
          note.at - g.clock > 1,
          `a note appeared only ${note.at - g.clock}s ahead of the beat`,
        );
      }
    }
    assert.ok(seen > 5, `only ${seen} notes were scheduled in 13 seconds`);
  });

  it("never asks one limb to be in two places on the same beat", () => {
    const g = createGame();
    g.start(0);
    g.level = g.maxLevel;
    for (let i = 0; i < 400; i += 1) g.tick(0.033, frame({}), i * 33, VIEW);
    const byBeat = new Map();
    for (const note of g.notes) {
      const at = byBeat.get(note.at) ?? [];
      at.push(note.pad);
      byBeat.set(note.at, at);
    }
    for (const [at, pads] of byBeat) {
      assert.equal(new Set(pads).size, pads.length, `beat ${at} asks for ${pads} at once`);
    }
  });

  it("stops judging while the player is out of shot", () => {
    const g = quiet();
    due(g, "rh", 0.05);
    for (let i = 0; i < 20; i += 1) {
      g.tick(0.033, signals({ inFrame: false }), 66 + i * 33, VIEW);
    }
    assert.equal(g.missed, 0, "notes were missed while nobody was there to play them");
  });
});
