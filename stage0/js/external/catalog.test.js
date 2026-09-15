import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMBED_CATALOG, catalogEntry, embedUrl, CATALOG_CARD_IDS } from "./catalog.js";
import { GAMES } from "../games/registry.js";
import { CONTROL_PROFILES } from "./profiles.js";

describe("sticky embed catalog", () => {
  it("covers all 15 registry games", () => {
    assert.equal(CATALOG_CARD_IDS.length, 15);
    for (const game of GAMES) {
      assert.ok(catalogEntry(game.id), `missing catalog entry for ${game.id}`);
      assert.equal(catalogEntry(game.id).title, game.title);
    }
  });

  it("points every card at a known profile and embed slug", () => {
    for (const [id, entry] of Object.entries(EMBED_CATALOG)) {
      assert.ok(CONTROL_PROFILES[entry.profile], `${id} unknown profile ${entry.profile}`);
      assert.ok(entry.slug, `${id} missing slug`);
      const url = embedUrl(id);
      assert.match(url, new RegExp(`/external-games/${entry.slug}/`));
    }
  });
});
