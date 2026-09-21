import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GAMES, gameById, CANVAS_ENGINE_IDS, isCanvasEngine } from "./registry.js";
import { ACTION_IDS, SKILLS } from "../skills.js";
import { BENEFIT_IDS } from "../wellness.js";

const SKILL_IDS = SKILLS.map((skill) => skill.id);

describe("MotionPlay active-play catalogue", () => {
  it("contains the motion catalogue plus vendored arcade classics", () => {
    assert.ok(GAMES.length >= 27, `expected expanded catalogue, got ${GAMES.length}`);
    assert.ok(GAMES.some((g) => g.id === "balloon-pop"));
    assert.ok(GAMES.some((g) => g.id === "arcade-snake"));
    assert.ok(GAMES.some((g) => g.id === "arcade-tetris"));
  });

  it("has unique stable ids and unique product ids", () => {
    assert.equal(new Set(GAMES.map((game) => game.id)).size, GAMES.length);
    assert.equal(new Set(GAMES.map((game) => game.productId)).size, GAMES.length);
  });

  it("resolves both stable and product ids", () => {
    for (const game of GAMES) {
      assert.equal(gameById(game.id), game);
      assert.equal(gameById(game.productId), game);
    }
  });

  it("only references known movements, skills and benefits", () => {
    for (const game of GAMES) {
      assert.ok(game.actions.length, `${game.title} has no countable movement`);
      assert.ok(game.skills.length, `${game.title} has no motor-skill focus`);
      assert.ok(game.benefits.length, `${game.title} has no movement-focus benefits`);

      for (const action of game.actions) {
        assert.ok(ACTION_IDS.includes(action), `${game.title} has unknown action ${action}`);
      }
      for (const skill of game.skills) {
        assert.ok(SKILL_IDS.includes(skill), `${game.title} has unknown skill ${skill}`);
      }
      for (const benefit of game.benefits) {
        assert.ok(BENEFIT_IDS.includes(benefit), `${game.title} has unknown benefit ${benefit}`);
      }
    }
  });

  it("keeps every experience playable during the migration", () => {
    assert.ok(GAMES.every((game) => game.ready === true));
    assert.ok(GAMES.every((game) => typeof game.load === "function"));
  });

  it("marks the fifteen original canvas engines", () => {
    assert.equal(CANVAS_ENGINE_IDS.length, 15);
    for (const id of CANVAS_ENGINE_IDS) {
      assert.equal(isCanvasEngine(id), true);
      assert.match(gameById(id).load.toString(), new RegExp(`\\./${id}\\.js`));
    }
    for (const game of GAMES) {
      if (game.id.startsWith("arcade-")) assert.equal(isCanvasEngine(game.id), false);
    }
  });
});
