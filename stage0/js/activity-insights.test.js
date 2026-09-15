import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { todayInsights, benefitDashboard, movementFocusSentence } from "./activity-insights.js";
import { roundEntry } from "./stats.js";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("Today's activity insights", () => {
  const catalogue = [
    {
      id: "runner",
      title: "Motion Runner",
      benefits: ["active-play", "lower-body", "reaction"],
    },
    {
      id: "slice",
      title: "Fruit Slice",
      benefits: ["active-play", "coordination"],
    },
  ];

  const history = [
    roundEntry({
      game: "runner",
      at: at(2026, 9, 15, 9),
      ms: 60_000,
      actions: { jump: 12, duck: 4 },
    }),
    roundEntry({
      game: "slice",
      at: at(2026, 9, 15, 11),
      ms: 30_000,
      actions: { swipe: 18 },
    }),
    roundEntry({
      game: "runner",
      at: at(2026, 9, 14, 18),
      ms: 45_000,
      actions: { jump: 7 },
    }),
  ];

  it("only counts rounds from the selected local day", () => {
    const out = todayInsights(history, { now: at(2026, 9, 15), catalogue });
    assert.equal(out.rounds, 2);
    assert.equal(out.ms, 90_000);
    assert.equal(out.totalMovements, 34);
  });

  it("keeps a per-motion breakdown", () => {
    const out = todayInsights(history, { now: at(2026, 9, 15), catalogue });
    assert.deepEqual(out.actions, { jump: 12, duck: 4, swipe: 18 });
  });

  it("keeps the games played today", () => {
    const out = todayInsights(history, { now: at(2026, 9, 15), catalogue });
    assert.deepEqual(
      out.games.map((game) => game.title).sort(),
      ["Fruit Slice", "Motion Runner"],
    );
  });

  it("aggregates today's movement-focus time", () => {
    const out = todayInsights(history, { now: at(2026, 9, 15), catalogue });
    const benefits = Object.fromEntries(out.benefits.map((entry) => [entry.id, entry.ms]));
    assert.equal(benefits["active-play"], 90_000);
    assert.equal(benefits["lower-body"], 60_000);
    assert.equal(benefits.coordination, 30_000);
  });
});

describe("Benefit dashboard", () => {
  it("includes focuses that have not been trained yet", () => {
    const cards = benefitDashboard([], { catalogue: [] });
    assert.ok(cards.length > 0);
    assert.ok(cards.every((card) => card.ms === 0));
  });
});

describe("Movement focus wording", () => {
  it("uses non-medical focus language", () => {
    assert.equal(
      movementFocusSentence(["balance", "reaction"]),
      "Movement focus: balance and reaction.",
    );
  });
});
