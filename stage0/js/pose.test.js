import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkerTracker } from "./pose.js";

/** A stand-in for the worker that only answers when the test says so. */
function fakeWorker() {
  const sent = [];
  const worker = {
    onmessage: null,
    onerror: null,
    terminated: false,
    postMessage(msg) {
      sent.push(msg);
    },
    terminate() {
      this.terminated = true;
    },
  };
  return {
    worker,
    sent,
    /** Answer the oldest outstanding frame. */
    reply(landmarks = [{ x: 0.5 }], inferMs = 12) {
      const frame = sent.shift();
      worker.onmessage({
        data: { type: "result", landmarks, capturedAt: frame.capturedAt, inferMs },
      });
    },
    fail(message = "no delegate") {
      worker.onmessage({ data: { type: "failed", message } });
    },
  };
}

const video = (currentTime, readyState = 4) => ({ currentTime, readyState });

/** Let the capture promise settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function build(opts = {}) {
  const f = fakeWorker();
  const captured = [];
  const tracker = new WorkerTracker({
    worker: f.worker,
    capture: (v) => {
      captured.push(v.currentTime);
      return Promise.resolve({ close() {} });
    },
    ...opts,
  });
  return { ...f, tracker, captured };
}

describe("Handing frames to the pose worker", () => {
  it("sends the first frame it is offered", async () => {
    const { tracker, sent, captured } = build();
    tracker.track(video(0.1), 100);
    await settle();
    assert.deepEqual(captured, [0.1]);
    assert.equal(sent.length, 1);
  });

  it("does not send the same camera frame twice", async () => {
    const { tracker, sent } = build();
    tracker.track(video(0.1), 100);
    await settle();
    sent.length = 0;
    // The screen redraws faster than the camera produces frames.
    tracker.track(video(0.1), 116);
    tracker.track(video(0.1), 133);
    await settle();
    assert.equal(sent.length, 0);
  });

  it("drops frames rather than queueing them while the worker is busy", async () => {
    const { tracker, sent, captured } = build();
    tracker.track(video(0.1), 100);
    await settle();
    tracker.track(video(0.2), 133);
    tracker.track(video(0.3), 166);
    await settle();
    assert.equal(sent.length, 1, "a backlog would make the answers stale");
    assert.deepEqual(captured, [0.1]);
  });

  it("sends the newest frame once the worker comes free", async () => {
    const { tracker, reply, captured } = build();
    tracker.track(video(0.1), 100);
    await settle();
    reply();
    tracker.track(video(0.2), 133);
    await settle();
    assert.deepEqual(captured, [0.1, 0.2]);
  });

  it("waits for the camera before sending anything", async () => {
    const { tracker, captured } = build();
    tracker.track(video(0, 0), 100);
    await settle();
    assert.deepEqual(captured, []);
  });

  /*
   * The worker coming free and the next camera frame landing both happen
   * between draws, and waiting for the next draw to notice either costs a
   * frame of detection every time round. At a 30ms detection on a 60Hz screen
   * that is the difference between tracking at 19 and at 28 frames a second,
   * measured with tools/pose-smoke.mjs.
   */
  it("sends the next frame the moment the worker answers, unprompted", async () => {
    const { tracker, reply, captured } = build();
    const cam = video(0.1);
    tracker.track(cam, 100);
    await settle();

    cam.currentTime = 0.2; // a frame arrived while detection was running
    reply();
    await settle();

    assert.deepEqual(captured, [0.1, 0.2], "it waited to be asked again");
  });

  it("sends a frame the moment the camera produces one, unprompted", async () => {
    const { tracker, reply, captured } = build();
    let onFrame = null;
    const cam = { currentTime: 0.1, readyState: 4, requestVideoFrameCallback: (f) => (onFrame = f) };

    tracker.track(cam, 100);
    await settle();
    reply();
    await settle();
    assert.deepEqual(captured, [0.1], "nothing new to send yet");

    cam.currentTime = 0.2;
    onFrame();
    await settle();
    assert.deepEqual(captured, [0.1, 0.2]);
  });

  it("still works on a browser with no frame callback", async () => {
    const { tracker, reply, captured } = build();
    tracker.track(video(0.1), 100);
    await settle();
    reply();
    tracker.track(video(0.2), 133);
    await settle();
    assert.deepEqual(captured, [0.1, 0.2]);
  });
});

describe("Collecting results from the pose worker", () => {
  it("has nothing to report before the first answer", () => {
    const { tracker } = build();
    const out = tracker.track(video(0.1), 100);
    assert.equal(out.landmarks, null);
    assert.equal(out.fresh, false);
  });

  it("reports an answer as fresh exactly once", async () => {
    const { tracker, reply } = build();
    tracker.track(video(0.1), 100);
    await settle();
    reply([{ x: 0.7 }]);

    const first = tracker.track(video(0.2), 133);
    assert.equal(first.fresh, true);
    assert.deepEqual(first.landmarks, [{ x: 0.7 }]);

    const second = tracker.track(video(0.2), 150);
    assert.equal(second.fresh, false, "the same frame must not be filtered twice");
    assert.deepEqual(second.landmarks, [{ x: 0.7 }], "but it is still the best we know");
  });

  it("timestamps landmarks with when the frame was taken, not when it arrived", async () => {
    const { tracker, reply } = build();
    tracker.track(video(0.1), 100);
    await settle();
    reply();
    // The answer comes back two screen frames later.
    const out = tracker.track(video(0.2), 166);
    assert.equal(out.at, 100, "the filters need the capture time to judge speed");
  });

  it("passes on what detection cost", async () => {
    const { tracker, reply } = build();
    tracker.track(video(0.1), 100);
    await settle();
    reply([{ x: 0.5 }], 23.5);
    assert.equal(tracker.track(video(0.2), 133).inferMs, 23.5);
  });
});

describe("When the pose worker gives up", () => {
  it("says so, once", async () => {
    const fails = [];
    const { tracker, fail } = build({ onFail: (m) => fails.push(m) });
    tracker.track(video(0.1), 100);
    await settle();
    fail("gpu is gone");
    fail("gpu is gone");
    assert.deepEqual(fails, ["gpu is gone"]);
  });

  it("stops sending it frames", async () => {
    const { tracker, fail, captured } = build({ onFail: () => {} });
    fail();
    tracker.track(video(0.1), 100);
    await settle();
    assert.deepEqual(captured, []);
  });

  it("falls over to the caller when a frame cannot even be captured", async () => {
    const fails = [];
    const f = fakeWorker();
    const tracker = new WorkerTracker({
      worker: f.worker,
      capture: () => Promise.reject(new Error("bitmap refused")),
      onFail: (m) => fails.push(m),
    });
    tracker.track(video(0.1), 100);
    await settle();
    assert.deepEqual(fails, ["bitmap refused"]);
  });

  it("reports a crashed worker", () => {
    const fails = [];
    const { worker } = build({ onFail: (m) => fails.push(m) });
    worker.onerror(new Error("boom"));
    assert.equal(fails.length, 1);
  });
});
