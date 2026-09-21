import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EMBED_CATALOG, catalogEntry, embedUrl, CATALOG_CARD_IDS, LIBRARY_CARD_IDS, isLibraryCard } from "./catalog.js";
import { GAMES } from "../games/registry.js";
import { CONTROL_PROFILES } from "./profiles.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

describe("sticky embed catalog", () => {
  it("covers every registry game", () => {
    assert.equal(CATALOG_CARD_IDS.length, GAMES.length);
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
      const root = entry.root === "vendor-arcade" ? "vendor-arcade" : "external-games";
      assert.match(url, new RegExp(`/${root}/${entry.slug}/`));
    }
  });
});

describe("sticky embed HTML asset URLs", () => {
  it("uses root-absolute script/css paths so Vercel no-slash URLs still load", async () => {
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

describe("vendored arcade HTML asset URLs", () => {
  it("uses root-absolute /vendor-arcade paths and key-bridge", async () => {
    const root = join(process.cwd(), "stage0/vendor-arcade");
    const slugs = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);
    assert.ok(slugs.length >= 12, `expected >=12 vendored titles, got ${slugs.length}`);
    for (const slug of slugs) {
      const html = await readFile(join(root, slug, "index.html"), "utf8");
      assert.match(html, new RegExp(`base href="/vendor-arcade/${slug}/"`));
      assert.match(html, /src="\/vendor-arcade\/_shared\/key-bridge\.js"/);
      assert.doesNotMatch(html, /src="\.\.\//);
    }
    const attribution = await readFile(join(root, "ATTRIBUTION.md"), "utf8");
    assert.match(attribution, /MIT/);
    assert.match(attribution, /GameBox|susam\/invaders|javascript-tetris/);
  });
});

describe("controller library keep list", () => {
  it("keeps delight-8 and expands with classic arcade titles", () => {
    const delight8 = [
      "jump-the-wall",
      "lane-runner",
      "ski-slalom",
      "fruit-slice",
      "balloon-pop",
      "punch-out",
      "freeze-frame",
      "goalkeeper",
    ];
    for (const id of delight8) {
      assert.ok(LIBRARY_CARD_IDS.includes(id), `delight title missing: ${id}`);
    }
    assert.ok(LIBRARY_CARD_IDS.length >= 18 && LIBRARY_CARD_IDS.length <= 22);
    for (const id of LIBRARY_CARD_IDS) {
      assert.ok(catalogEntry(id), `missing catalog entry for library card ${id}`);
      assert.equal(isLibraryCard(id), true);
    }
    // Thin sticky embeds stay deep-linkable but off the primary grid
    const hiddenSticky = ["pose-match", "squat-rush", "body-drums", "orbit-keeper", "hand-snake", "hand-tetris"];
    for (const id of hiddenSticky) {
      assert.equal(isLibraryCard(id), false, `${id} should be hidden from library`);
      assert.ok(catalogEntry(id), `${id} stays in catalog for deep links`);
    }
  });
});
