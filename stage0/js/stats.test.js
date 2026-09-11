import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addRound,
  dayKey,
  formatDay,
  formatDuration,
  parseHistory,
  roundEntry,
  streakLength,
  summarise,
} from "./stats.js";

/** A small stand-in arcade, so these tests do not move when the games do. */
const CATALOGUE = [
  { id: "jumper", title: "Jumper", skills: ["lower-body", "agility"] },
  { id: "reacher", title: "Reacher", skills: ["reach"] },
];

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

const round = (over = {}) =>
  roundEntry({ game: "jumper", at: at(2026, 9, 5), ms: 60_000, score: 10, level: 2, ...over });

describe("Recording a round", () => {
  it("stamps it with the local day", () => {
    assert.equal(round({ at: at(2026, 9, 5) }).day, "2026-09-05");
  });

  it("counts a late night round as that evening, not the next morning", () => {
    assert.equal(round({ at: at(2026, 9, 5, 23) }).day, "2026-09-05");
  });

  it("keeps the movements the catalogue knows", () => {
    assert.deepEqual(round({ actions: { jump: 12, duck: 3 } }).actions, { jump: 12, duck: 3 });
  });

  it("drops anything it cannot name", () => {
    assert.deepEqual(round({ actions: { jump: 4, cartwheel: 9 } }).actions, { jump: 4 });
  });

  it("drops movements that never happened", () => {
    assert.deepEqual(round({ actions: { jump: 0 } }).actions, {});
  });
});

describe("The log itself", () => {
  it("keeps rounds in the order they were played", () => {
    const log = addRound(addRound([], round({ score: 1 })), round({ score: 2 }));
    assert.deepEqual(
      log.map((r) => r.score),
      [1, 2],
    );
  });

  it("forgets the oldest rounds once it is full", () => {
    let log = [];
    for (let i = 0; i < 10; i += 1) log = addRound(log, round({ score: i }), 4);
    assert.equal(log.length, 4);
    assert.equal(log[0].score, 6, "should have kept the most recent four");
  });

  it("survives a log that was never written", () => {
    assert.deepEqual(parseHistory(null), []);
  });

  it("survives a log that got corrupted", () => {
    assert.deepEqual(parseHistory("{not json"), []);
    assert.deepEqual(parseHistory('"a string"'), []);
  });

  it("throws away entries that are not rounds", () => {
    const raw = JSON.stringify([round(), { nonsense: true }, null]);
    assert.equal(parseHistory(raw).length, 1);
  });
});

describe("Reading the log back", () => {
  const history = [
    round({ at: at(2026, 9, 5), ms: 60_000, actions: { jump: 10, duck: 2 }, score: 8, level: 3 }),
    round({ at: at(2026, 9, 5), ms: 30_000, actions: { jump: 5 }, score: 20, level: 2 }),
    round({
      game: "reacher",
      at: at(2026, 9, 4),
      ms: 45_000,
      actions: { reach: 30 },
      score: 12,
      level: 4,
    }),
  ];
  const view = () => summarise(history, { catalogue: CATALOGUE, now: at(2026, 9, 5) });

  it("totals every movement across the whole log", () => {
    assert.deepEqual(view().totals.actions, { jump: 15, duck: 2, reach: 30 });
  });

  it("totals the time spent moving", () => {
    assert.equal(view().totals.ms, 135_000);
    assert.equal(view().totals.rounds, 3);
  });

  it("breaks the log down by day, newest first", () => {
    const days = view().days;
    assert.deepEqual(
      days.map((d) => d.day),
      ["2026-09-05", "2026-09-04"],
    );
    assert.equal(days[0].rounds, 2);
    assert.deepEqual(days[0].actions, { jump: 15, duck: 2 });
  });

  it("records which games were played on a day", () => {
    assert.deepEqual(view().days[0].games, { jumper: 2 });
  });

  it("limits the breakdown to the days asked for", () => {
    const short = summarise(history, { catalogue: CATALOGUE, days: 1, now: at(2026, 9, 5) });
    assert.equal(short.days.length, 1);
    assert.equal(short.totals.rounds, 3, "totals still cover everything");
  });

  it("ranks games by time spent in them", () => {
    const games = view().games;
    assert.equal(games[0].id, "jumper");
    assert.equal(games[0].ms, 90_000);
    assert.equal(games[0].rounds, 2);
  });

  it("keeps the best score and level per game", () => {
    const jumper = view().games.find((g) => g.id === "jumper");
    assert.equal(jumper.bestScore, 20);
    assert.equal(jumper.bestLevel, 3);
  });

  it("credits a round in full to every skill it trains", () => {
    const skills = Object.fromEntries(view().skills.map((s) => [s.id, s.ms]));
    assert.equal(skills["lower-body"], 90_000);
    assert.equal(skills.agility, 90_000, "a game working two things trains both");
    assert.equal(skills.reach, 45_000);
  });

  it("copes with an empty log", () => {
    const empty = summarise([], { catalogue: CATALOGUE });
    assert.deepEqual(empty.totals.actions, {});
    assert.deepEqual(empty.days, []);
    assert.equal(empty.streak, 0);
  });

  it("copes with a game that has since been removed", () => {
    const orphan = [round({ game: "deleted-game" })];
    const out = summarise(orphan, { catalogue: CATALOGUE });
    assert.equal(out.games[0].title, "deleted-game", "falls back to the id");
    assert.deepEqual(out.skills, []);
  });
});

describe("Streaks", () => {
  const on = (...days) => new Set(days);

  it("counts consecutive days up to today", () => {
    assert.equal(streakLength(on("2026-09-05", "2026-09-04", "2026-09-03"), at(2026, 9, 5)), 3);
  });

  it("stops at the first missed day", () => {
    assert.equal(streakLength(on("2026-09-05", "2026-09-03"), at(2026, 9, 5)), 1);
  });

  it("keeps the streak alive until today is over", () => {
    assert.equal(streakLength(on("2026-09-04", "2026-09-03"), at(2026, 9, 5)), 2);
  });

  it("is broken once two days have passed", () => {
    assert.equal(streakLength(on("2026-09-03"), at(2026, 9, 5)), 0);
  });

  it("is zero for someone who has never played", () => {
    assert.equal(streakLength(on(), at(2026, 9, 5)), 0);
  });

  it("counts across the turn of a month", () => {
    assert.equal(streakLength(on("2026-09-01", "2026-08-31"), at(2026, 9, 1)), 2);
  });
});

describe("Wording the numbers", () => {
  it("keeps short sessions in seconds", () => {
    assert.equal(formatDuration(40_000), "40 s");
  });

  it("rounds a normal session to minutes", () => {
    assert.equal(formatDuration(12 * 60_000), "12 min");
  });

  it("switches to hours once there are enough minutes", () => {
    assert.equal(formatDuration(64 * 60_000), "1 h 04");
  });

  it("names today and yesterday rather than dating them", () => {
    assert.equal(formatDay(dayKey(at(2026, 9, 5)), at(2026, 9, 5)), "Today");
    assert.equal(formatDay(dayKey(at(2026, 9, 4)), at(2026, 9, 5)), "Yesterday");
  });

  it("dates anything older", () => {
    const label = formatDay("2026-09-01", at(2026, 9, 5));
    assert.notEqual(label, "Today");
    assert.match(label, /Sep/);
  });
});
