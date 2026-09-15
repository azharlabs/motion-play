import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExternalGameBridge, EXTERNAL_CONTROL_CHANNEL } from "./bridge.js";

describe("ExternalGameBridge", () => {
  it("posts key events to every configured target", () => {
    const seen = [];
    const makeTarget = (name) => ({
      postMessage(message) {
        seen.push({ name, message });
      },
    });
    const a = makeTarget("a");
    const b = makeTarget("b");
    const bridge = new ExternalGameBridge({ targets: [a, b] });
    bridge.send([{ key: "ArrowLeft", pressed: true }], { profile: "runner" });
    assert.equal(seen.length, 2);
    assert.equal(seen[0].message.channel, EXTERNAL_CONTROL_CHANNEL);
    assert.equal(seen[0].message.key, "ArrowLeft");
    assert.equal(seen[0].message.pressed, true);
    assert.equal(seen[1].name, "b");
  });

  it("posts stop/pause control messages for embeds", () => {
    const seen = [];
    const target = { postMessage(message) { seen.push(message); } };
    const bridge = new ExternalGameBridge({ target });
    bridge.control("stop", { card: "lane-runner" });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].channel, EXTERNAL_CONTROL_CHANNEL);
    assert.equal(seen[0].type, "control");
    assert.equal(seen[0].action, "stop");
    assert.equal(seen[0].card, "lane-runner");
  });
});
