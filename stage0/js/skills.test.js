import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SKILLS, ACTIONS, ACTION_IDS, skillById, actionById } from "./skills.js";
import { GAMES } from "./games/registry.js";

describe("Motor skill catalogue", () => {
  it("gives every skill something to show for itself", () => {
    for (const skill of SKILLS) {
      assert.ok(skill.label, `${skill.id} has no label`);
      assert.ok(skill.icon, `${skill.id} has no icon`);
      assert.ok(skill.blurb, `${skill.id} has no blurb`);
    }
  });

  it("has no duplicate skills", () => {
    const ids = SKILLS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("gives every skill card its own colour", () => {
    for (const skill of SKILLS) {
      assert.match(skill.tint, /^#[0-9a-f]{6}$/i, `${skill.id} has no usable tint`);
    }
    const tints = SKILLS.map((s) => s.tint);
    // Two cards the same colour would be telling the player they are related.
    assert.equal(new Set(tints).size, tints.length, "two skills share a colour");
  });

  it("keeps the blurbs short enough to sit on a card", () => {
    for (const skill of SKILLS) {
      // Two lines on a phone-width card; a third makes the shelf ragged.
      assert.ok(skill.blurb.length <= 48, `${skill.id}: "${skill.blurb}" will wrap to three lines`);
    }
  });

  it("looks a skill up by id", () => {
    assert.equal(skillById("balance").label, "Balance");
    assert.equal(skillById("nonsense"), null);
  });
});

describe("Physical action catalogue", () => {
  it("can name and count every action", () => {
    for (const action of ACTIONS) {
      assert.ok(action.verb, `${action.id} has no column heading`);
      assert.ok(action.unit, `${action.id} has no plural`);
      assert.ok(action.icon, `${action.id} has no icon`);
    }
  });

  it("has no duplicate actions", () => {
    assert.equal(new Set(ACTION_IDS).size, ACTION_IDS.length);
  });

  it("looks an action up by id", () => {
    assert.equal(actionById("squat").unit, "squats");
    assert.equal(actionById("nonsense"), null);
  });
});

describe("Games tagged by skill", () => {
  it("gives every game at least one motor skill", () => {
    for (const game of GAMES) {
      assert.ok(game.skills?.length, `${game.id} trains nothing`);
    }
  });

  it("only claims skills that exist", () => {
    for (const game of GAMES) {
      for (const id of game.skills) {
        assert.ok(skillById(id), `${game.id} claims unknown skill "${id}"`);
      }
    }
  });

  it("only counts movements the log can name", () => {
    for (const game of GAMES) {
      assert.ok(game.actions?.length, `${game.id} counts nothing`);
      for (const id of game.actions) {
        assert.ok(actionById(id), `${game.id} counts unknown action "${id}"`);
      }
    }
  });

  it("leaves no skill without a game behind it", () => {
    const covered = new Set(GAMES.flatMap((g) => g.skills));
    for (const skill of SKILLS) {
      assert.ok(covered.has(skill.id), `nothing trains ${skill.id}`);
    }
  });

  it("leaves no action nobody performs", () => {
    const counted = new Set(GAMES.flatMap((g) => g.actions));
    for (const id of ACTION_IDS) {
      assert.ok(counted.has(id), `no game ever counts a ${id}`);
    }
  });

  it("keeps the skill list short enough to browse", () => {
    for (const game of GAMES) {
      assert.ok(game.skills.length <= 3, `${game.id} claims too many skills to show`);
    }
  });
});
