import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMBED_CATALOG,
  catalogEntry,
  embedUrl,
  CATALOG_CARD_IDS,
  LIBRARY_CARD_IDS,
  LIBRARY_SECTIONS,
  LEGACY_LIBRARY_CARDS,
  MOTION_LIBRARY_IDS,
  ARCADE_LIBRARY_IDS,
  isLibraryCard,
  legacyPlayUrl,
  libraryPresentation,
} from "./catalog.js";
import { GAMES, CANVAS_ENGINE_IDS, isCanvasEngine } from "../games/registry.js";
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
  it("lists every embed catalog entry and every canvas engine", () => {
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
    assert.deepEqual(LIBRARY_CARD_IDS, [...MOTION_LIBRARY_IDS, ...ARCADE_LIBRARY_IDS]);
    assert.equal(LIBRARY_CARD_IDS.length, CATALOG_CARD_IDS.length);
    assert.equal(new Set(LIBRARY_CARD_IDS).size, LIBRARY_CARD_IDS.length);
    for (const id of CATALOG_CARD_IDS) {
      assert.ok(LIBRARY_CARD_IDS.includes(id), `catalog entry missing from library: ${id}`);
      assert.equal(isLibraryCard(id), true);
      assert.equal(libraryPresentation(id)?.kind, "embed");
    }
    assert.ok(LIBRARY_CARD_IDS.includes("arcade-blaster"));
    assert.ok(LIBRARY_CARD_IDS.includes("arcade-underrun"));

    assert.equal(CANVAS_ENGINE_IDS.length, 15);
    assert.equal(LEGACY_LIBRARY_CARDS.length, 15);
    const titles = new Set(LIBRARY_CARD_IDS.map((id) => catalogEntry(id).title));
    for (const card of LEGACY_LIBRARY_CARDS) {
      assert.equal(isLibraryCard(card.id), true);
      assert.equal(libraryPresentation(card.id)?.kind, "canvas");
      assert.equal(isCanvasEngine(card.engineId), true);
      assert.match(card.title, /\(Classic\)$/);
      assert.equal(titles.has(card.title), false, `${card.title} collides with an embed title`);
      assert.match(legacyPlayUrl(card.engineId), new RegExp(`legacy=1&game=${card.engineId}&from=controller`));
      const engine = GAMES.find((game) => game.id === card.engineId);
      assert.match(engine.load.toString(), new RegExp(`\\./${card.engineId}\\.js`));
    }

    const sectionIds = LIBRARY_SECTIONS.flatMap((section) => section.ids);
    assert.equal(sectionIds.length, LIBRARY_CARD_IDS.length + LEGACY_LIBRARY_CARDS.length);
    assert.equal(new Set(sectionIds).size, sectionIds.length);
    assert.deepEqual(
      LIBRARY_SECTIONS.map((section) => section.id),
      ["motion", "arcade", "canvas"],
    );
    assert.equal(LIBRARY_SECTIONS[0].ids.length, 15);
    assert.equal(LIBRARY_SECTIONS[1].ids.length, 14);
    assert.equal(LIBRARY_SECTIONS[2].ids.length, 15);
  });
});
