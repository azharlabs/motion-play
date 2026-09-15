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

describe("sticky embed HTML asset URLs", () => {
  it("uses root-absolute script/css paths so Vercel no-slash URLs still load", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const root = join(process.cwd(), "stage0/external-games");
    const slugs = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);
    assert.ok(slugs.length >= 9);
    for (const slug of slugs) {
      const html = await readFile(join(root, slug, "index.html"), "utf8");
      assert.match(html, /href="\/external-games\/_shared\/shell\.css"/);
      assert.match(html, /src="\/external-games\/_shared\/mini\.js"/);
      assert.match(html, new RegExp(`src="/external-games/${slug}/game\\.js"`));
      assert.match(html, /Tap or press Space to start/);
      assert.doesNotMatch(html, />Loading…</);
    }
  });
});
