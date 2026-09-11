import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coverBox, poseMapping } from "./framing.js";

// A portrait phone showing the portrait camera frame: the classic case, where
// the frame is far squarer than the screen and gets cropped left and right.
const PHONE = { w: 390, h: 844 };
const FRAME = { videoW: 480, videoH: 640 };

describe("Fitting the camera frame over the screen", () => {
  it("covers the screen completely", () => {
    const box = coverBox(480, 640, PHONE.w, PHONE.h);
    assert.ok(box.width >= PHONE.w - 0.01, `only ${box.width} of ${PHONE.w} wide`);
    assert.ok(box.height >= PHONE.h - 0.01, `only ${box.height} of ${PHONE.h} tall`);
  });

  it("keeps the frame's shape", () => {
    const box = coverBox(480, 640, PHONE.w, PHONE.h);
    assert.ok(Math.abs(box.width / box.height - 480 / 640) < 1e-9);
  });

  it("splits the overflow evenly, so the middle stays the middle", () => {
    const box = coverBox(480, 640, PHONE.w, PHONE.h);
    assert.ok(Math.abs(box.left + box.width / 2 - PHONE.w / 2) < 1e-9);
    assert.ok(Math.abs(box.top + box.height / 2 - PHONE.h / 2) < 1e-9);
  });

  it("copes with a camera that has not started yet", () => {
    const box = coverBox(0, 0, PHONE.w, PHONE.h);
    assert.deepEqual(box, { left: 0, top: 0, width: PHONE.w, height: PHONE.h });
  });
});

describe("Placing a hand on the screen", () => {
  const mapped = poseMapping(PHONE.w, PHONE.h, { ...FRAME, cropped: true });
  const plain = poseMapping(PHONE.w, PHONE.h, { ...FRAME, cropped: false });

  it("agrees with the plain mapping in the centre", () => {
    assert.ok(Math.abs(mapped.poseX(0.5) - plain.poseX(0.5)) < 1e-9);
    assert.ok(Math.abs(mapped.poseY(0.5) - plain.poseY(0.5)) < 1e-9);
  });

  it("puts a hand held out to the side where it is actually seen", () => {
    // This is the bug: stretching would call this 78px, but the cropped
    // picture shows that part of the frame near the very edge of the screen.
    const stretched = plain.poseX(0.2);
    const real = mapped.poseX(0.2);
    assert.ok(
      Math.abs(stretched - real) > 60,
      `the two mappings should disagree badly out here, got ${stretched} and ${real}`,
    );
    assert.ok(real < 20, `a hand at 0.2 of the frame is near the screen edge, not ${real}`);
  });

  it("reports a hand cropped out of shot as off screen", () => {
    assert.ok(mapped.poseX(0.02) < 0, "the edges of the frame are not on the screen at all");
    assert.ok(mapped.poseX(0.98) > PHONE.w, "nor is the other side");
  });

  it("stretches to the whole view when nothing is shown behind the game", () => {
    assert.equal(plain.poseX(0), 0);
    assert.equal(plain.poseX(1), PHONE.w);
    assert.equal(plain.poseY(1), PHONE.h);
  });

  it("stretches when the camera has not reported a size yet", () => {
    const unknown = poseMapping(PHONE.w, PHONE.h, { cropped: true });
    assert.equal(unknown.poseX(1), PHONE.w);
  });

  it("crops top and bottom instead when the screen is the wider one", () => {
    const wide = poseMapping(844, 390, { ...FRAME, cropped: true });
    assert.ok(Math.abs(wide.poseX(0) - 0) < 1e-9, "nothing to crop across the width");
    assert.ok(wide.poseY(0) < 0, "the top of the frame is above the screen");
  });
});
