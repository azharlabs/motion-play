import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BaseGame, Rep } from "./common.js";
import { ACTION_IDS } from "../skills.js";
import { GAMES } from "./registry.js";

describe("Counting a repeated movement", () => {
  it("counts one movement per repetition, not per frame", () => {
    const rep = new Rep(0.7, 0.3);
    let count = 0;
    for (const v of [0, 0.8, 0.9, 0.85, 0.2, 0.75]) if (rep.step(v)) count += 1;
    assert.equal(count, 2);
  });

  it("will not count again until the body has come back", () => {
    const rep = new Rep(0.7, 0.3);
    assert.equal(rep.step(0.8), true);
    // Hovering just under the trigger is not a second repetition.
    for (const v of [0.6, 0.69, 0.5, 0.8]) assert.equal(rep.step(v), false);
  });

  it("counts again once it has", () => {
    const rep = new Rep(0.7, 0.3);
    rep.step(0.8);
    rep.step(0.1);
    assert.equal(rep.step(0.8), true);
  });

  it("starts fresh after a reset", () => {
    const rep = new Rep(0.7, 0.3);
    rep.step(0.8);
    rep.reset();
    assert.equal(rep.step(0.8), true);
  });
});

describe("The round's movement tally", () => {
  const game = () => {
    const g = new (class extends BaseGame {})();
    g.reset();
    return g;
  };

  it("starts empty", () => {
    assert.deepEqual(game().actions, {});
  });

  it("adds movements up", () => {
    const g = game();
    g.countAction("squat");
    g.countAction("squat", 3);
    assert.equal(g.actions.squat, 4);
  });

  it("hands the tally to the shell", () => {
    const g = game();
    g.countAction("jump");
    assert.deepEqual(g.summary().actions, { jump: 1 });
  });

  it("gives out a copy, so the log cannot be edited by the next round", () => {
    const g = game();
    g.countAction("jump");
    const taken = g.summary().actions;
    g.countAction("jump");
    assert.equal(taken.jump, 1);
  });

  it("empties for the next round", () => {
    const g = game();
    g.countAction("jump");
    g.reset();
    assert.deepEqual(g.actions, {});
  });
});

describe("Every game counts what it promises", () => {
  for (const meta of GAMES) {
    it(`${meta.id} only counts movements from the catalogue`, async () => {
      const mod = await meta.load();
      const g = mod.createGame({});
      g.start(0);
      g.countAction(meta.actions[0]);
      for (const id of Object.keys(g.summary().actions)) {
        assert.ok(ACTION_IDS.includes(id), `${meta.id} reported unknown "${id}"`);
      }
    });

    it(`${meta.id} clears its tally between rounds`, async () => {
      const mod = await meta.load();
      const g = mod.createGame({});
      g.start(0);
      g.countAction(meta.actions[0], 5);
      g.start(1000);
      assert.deepEqual(g.summary().actions, {}, `${meta.id} carried movements over`);
    });
  }
});
