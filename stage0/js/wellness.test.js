import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GAMES } from "./games/registry.js";
import { BENEFIT_IDS, benefitById, benefitTime, benefitsForGame } from "./wellness.js";

describe("Movement benefit vocabulary", () => {
  it("has unique benefit ids", () => {
    assert.equal(new Set(BENEFIT_IDS).size, BENEFIT_IDS.length);
  });

  it("every game only references known benefits", () => {
    for (const game of GAMES) {
      assert.ok(game.benefits?.length, `${game.id} should declare movement benefits`);
      for (const id of game.benefits) {
        assert.ok(benefitById(id), `${game.id} references unknown benefit ${id}`);
      }
    }
  });

  it("resolves a game's benefit cards", () => {
    const runner = GAMES.find((game) => game.productId === "motion-runner");
    const ids = benefitsForGame(runner).map((benefit) => benefit.id);
    assert.ok(ids.includes("active-play"));
    assert.ok(ids.includes("lower-body"));
  });
});

describe("Benefit time", () => {
  it("credits each focus with the round's active time", () => {
    const catalogue = [
      { id: "a", benefits: ["active-play", "reaction"] },
      { id: "b", benefits: ["active-play", "coordination"] },
    ];
    const out = benefitTime(
      [
        { game: "a", ms: 20_000 },
        { game: "b", ms: 10_000 },
      ],
      catalogue,
    );
    const byId = Object.fromEntries(out.map((entry) => [entry.id, entry.ms]));
    assert.equal(byId["active-play"], 30_000);
    assert.equal(byId.reaction, 20_000);
    assert.equal(byId.coordination, 10_000);
  });

  it("ignores removed games and negative time", () => {
    const out = benefitTime(
      [
        { game: "missing", ms: 99_000 },
        { game: "a", ms: -100 },
      ],
      [{ id: "a", benefits: ["active-play"] }],
    );
    assert.equal(out[0].ms, 0);
  });
});
