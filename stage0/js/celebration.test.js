import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

/**
 * celebration.js needs a handful of DOM APIs. Stub just enough for Node so the
 * overlay can be constructed, shown, continued, and torn down without a browser.
 */
function installDomStub() {
  if (globalThis.document?.createElement) return;

  class FakeEl {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.style = {};
      this.hidden = false;
      this.width = 0;
      this.height = 0;
      this._listeners = new Map();
      this._inner = "";
      this.textContent = "";
    }
    set innerHTML(html) {
      this._inner = String(html);
      // One canvas for fx, one for mascot, one button — enough for querySelector.
      this._fx = new FakeEl("canvas");
      this._fx.className = "celebrate-fx";
      this._mascot = new FakeEl("canvas");
      this._mascot.className = "celebrate-mascot";
      this._title = new FakeEl("strong");
      this._title.className = "celebrate-title";
      this._title.id = "celebrate-title";
      this._btn = new FakeEl("button");
      this._btn.className = "primary celebrate-continue";
    }
    get innerHTML() {
      return this._inner;
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    querySelector(sel) {
      if (sel === ".celebrate-fx") return this._fx;
      if (sel === ".celebrate-mascot") return this._mascot;
      if (sel === ".celebrate-title") return this._title;
      if (sel === ".celebrate-continue") return this._btn;
      return null;
    }
    setAttribute() {}
    getBoundingClientRect() {
      return { width: 390, height: 640, top: 0, left: 0 };
    }
    getContext() {
      const noop = () => {};
      return new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "setTransform" || prop === "clearRect" || prop === "save" || prop === "restore")
              return noop;
            if (prop === "fillRect" || prop === "translate" || prop === "rotate" || prop === "scale")
              return noop;
            if (prop === "beginPath" || prop === "fill" || prop === "roundRect" || prop === "ellipse")
              return noop;
            if (prop === "moveTo" || prop === "lineTo" || prop === "closePath" || prop === "arc" || prop === "stroke")
              return noop;
            return noop;
          },
          set: () => true,
        },
      );
    }
    addEventListener(type, fn) {
      this._listeners.set(type, fn);
    }
    click() {
      this._listeners.get("click")?.();
    }
    focus() {}
  }

  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
  };
  globalThis.devicePixelRatio = 1;
  if (!globalThis.queueMicrotask) {
    globalThis.queueMicrotask = (fn) => Promise.resolve().then(fn);
  }
  if (!globalThis.performance) {
    globalThis.performance = { now: () => Date.now() };
  }
}

describe("Level celebration", () => {
  before(installDomStub);

  it("pauses behind an active overlay until Continue", async () => {
    const { createCelebration } = await import("./celebration.js");
    const cues = [];
    const parent = document.createElement("div");
    const celebration = createCelebration({
      parent,
      fx: { cue: (name) => (cues.push(name), true) },
    });

    assert.equal(celebration.active, false);
    celebration.show(3, 1000);
    assert.equal(celebration.active, true);
    assert.equal(cues[0], "celebrate");
    assert.equal(parent.children[0].querySelector(".celebrate-title").textContent, "Level 3!");

    celebration.frame(1016, 0.016);
    parent.children[0].querySelector(".celebrate-continue").click();
    assert.equal(celebration.active, false);
    assert.ok(cues.includes("ui"));
  });
});
