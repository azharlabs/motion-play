/** Official Google MediaPipe Tasks Vision (Pose Landmarker / BlazePose). */
export const MEDIAPIPE_VERSION = "0.10.21";
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const model = (name) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${name}/float16/1/pose_landmarker_${name}.task`;

/**
 * Two models, picked by where detection is running.
 *
 * `full` places wrists and knuckles noticeably better than `lite`, which is
 * what the punching and slicing games live on, but it costs more per frame.
 * On the worker that is affordable, because the cost lands on a thread the
 * game is not drawing on. On the main thread it is not, so the fallback stays
 * with `lite`: a rough hand beats a stuttering one.
 */
const MODEL_FULL = model("full");
const MODEL_LITE = model("lite");

const INFER_WIDTH = 320;

/**
 * How long to wait for the worker to come up before giving up on it.
 *
 * Patient on purpose: most of this is downloading several megabytes of wasm
 * and model, which the main-thread fallback would have to download too, so
 * giving up early costs the player the wait twice over. It is here to catch a
 * worker that will never answer, not a slow connection.
 */
const WORKER_READY_MS = 45000;

/**
 * How long to wait on a frame before deciding the worker is not coming back.
 * The first one is allowed much longer because it queues behind the warm-up,
 * which builds the graph and compiles shaders and can take seconds; after
 * that, a wait this long means the worker has wedged rather than slowed.
 */
const FIRST_STALL_MS = 20000;
const STALL_MS = 6000;

function poseOptions(delegate, modelAssetPath) {
  return {
    baseOptions: { modelAssetPath, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  };
}

/**
 * Detection on the worker thread.
 *
 * Its whole job is deciding when to hand over a frame. One detection is in
 * flight at a time: while the worker is busy, new camera frames are dropped
 * rather than queued, because a queue would only mean answering questions
 * about where the player's hands were half a second ago.
 *
 * The browser bits are injected so the scheduling can be tested without one.
 */
export class WorkerTracker {
  constructor({ worker, capture, onFail }) {
    this.worker = worker;
    this.capture = capture;
    this.onFail = onFail ?? (() => {});
    this.busy = false;
    this.closed = false;
    this.lastVideoTime = -1;
    this.landmarks = null;
    this.at = 0;
    this.unread = false;
    this.inferMs = 0;
    this.sentAt = 0;
    this.answered = false;
    this.video = null;
    this.watching = false;

    worker.onmessage = (e) => this.#receive(e.data);
    worker.onerror = () => this.#fail("worker crashed");
  }

  #receive(msg) {
    if (msg.type === "result") {
      this.busy = false;
      this.answered = true;
      this.landmarks = msg.landmarks;
      this.at = msg.capturedAt;
      this.unread = true;
      this.inferMs = msg.inferMs;
      // Straight back out with the next frame. Waiting for the game's next
      // turn to notice the worker is free spends a whole frame of the budget
      // doing nothing, and it is the budget the player feels.
      this.#offer(this.video, performance.now());
    } else if (msg.type === "failed") {
      this.busy = false;
      this.#fail(msg.message);
    }
  }

  #fail(message) {
    if (this.closed) return;
    this.closed = true;
    this.onFail(message);
  }

  /**
   * Offer the newest camera frame, and collect whatever the worker has ready.
   * `fresh` says whether these landmarks have been handed out before, so the
   * caller can avoid feeding the same frame to the filters twice.
   */
  track(video, nowMs) {
    this.video = video;
    this.#watchFrames(video);

    // A worker that says it is ready and then never answers would leave the
    // game blind, which is worse than a slow one. Give up on it and let the
    // main thread take over.
    const patience = this.answered ? STALL_MS : FIRST_STALL_MS;
    if (this.busy && this.sentAt && nowMs - this.sentAt > patience) {
      this.#fail(`worker stopped answering after ${Math.round(patience / 1000)}s`);
    }

    this.#offer(video, nowMs);

    const fresh = this.unread;
    this.unread = false;
    return { landmarks: this.landmarks, at: this.at, fresh, inferMs: this.inferMs };
  }

  /**
   * Hand over the newest camera frame, if there is one and the worker is free.
   *
   * Both of those become true at moments the game loop does not get told
   * about, so this is called from all three: the loop, the arrival of a frame,
   * and the return of a result.
   */
  #offer(video, nowMs) {
    if (this.closed || this.busy || !video) return;
    if (!(video.readyState >= 2) || video.currentTime === this.lastVideoTime) return;

    this.lastVideoTime = video.currentTime;
    this.busy = true;
    this.sentAt = nowMs;
    Promise.resolve(this.capture(video))
      .then((bitmap) => {
        if (this.closed) {
          bitmap?.close?.();
          this.busy = false;
          return;
        }
        const frame = { type: "frame", bitmap, ts: nowMs, capturedAt: nowMs };
        this.worker.postMessage(frame, [bitmap]);
      })
      .catch((err) => {
        this.busy = false;
        this.#fail(String(err?.message ?? err));
      });
  }

  /**
   * Be told when a camera frame lands, rather than checking each time we draw.
   *
   * Polling from the render loop means a frame that arrives just after a draw
   * waits out the rest of that frame before anyone looks at it, and the same
   * delay lands on `capturedAt`, so the reading is also recorded as younger
   * than it is and gets under-extrapolated. Not every browser has this yet,
   * and the poll in `track` remains for those, and as a backstop for a
   * callback that stops arriving.
   */
  #watchFrames(video) {
    if (this.watching || typeof video?.requestVideoFrameCallback !== "function") return;
    this.watching = true;
    const step = () => {
      if (this.closed) return;
      this.#offer(video, performance.now());
      video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  }

  close() {
    this.closed = true;
    this.worker.terminate?.();
  }
}

/**
 * Detection on the main thread, for browsers where the worker will not start.
 * Same interface, and it always answers about the frame it was just given, so
 * everything it returns is fresh.
 */
export class InlineTracker {
  constructor(landmarker, { usingGpu = false } = {}) {
    this.landmarker = landmarker;
    this.usingGpu = usingGpu;
    this.lastTimestamp = 0;
    this.inferMs = 0;
    this.canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    this.ctx = this.canvas?.getContext("2d", { alpha: false, desynchronized: true }) ?? null;
  }

  /*
   * On the GPU the video element uploads straight to a texture, so shrinking it
   * through a 2D canvas first only adds work. On the CPU every pixel costs, so
   * the small copy earns its keep.
   */
  #frame(video) {
    if (this.usingGpu) return video;
    if (!this.canvas || !this.ctx || video.videoWidth < 2) return video;
    const aspect = video.videoHeight / video.videoWidth;
    const w = INFER_WIDTH;
    const h = Math.max(256, Math.round(INFER_WIDTH * aspect));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    return this.canvas;
  }

  track(video, nowMs) {
    if (video.readyState < 2) {
      return { landmarks: null, at: nowMs, fresh: false, inferMs: this.inferMs };
    }
    const ts = Math.max(this.lastTimestamp + 1, Math.floor(nowMs));
    this.lastTimestamp = ts;
    const t0 = performance.now();
    let result;
    try {
      result = this.landmarker.detectForVideo(this.#frame(video), ts);
    } catch (err) {
      // Some drivers refuse a video texture. Fall back to the copy for good.
      if (!this.usingGpu) throw err;
      this.usingGpu = false;
      result = this.landmarker.detectForVideo(this.#frame(video), ts);
    }
    this.inferMs = performance.now() - t0;
    return {
      landmarks: result?.landmarks?.[0] ?? null,
      at: nowMs,
      fresh: true,
      inferMs: this.inferMs,
    };
  }

  close() {}
}

async function startWorker() {
  // Classic, not module: MediaPipe's wasm loader needs importScripts.
  const worker = new Worker(new URL("./pose-worker.js", import.meta.url));
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("pose worker timed out")), WORKER_READY_MS);
    worker.onmessage = (e) => {
      if (e.data?.type === "ready") {
        clearTimeout(timer);
        resolve(e.data);
      } else if (e.data?.type === "failed") {
        clearTimeout(timer);
        reject(new Error(e.data.message));
      }
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      reject(new Error(String(err?.message ?? "worker failed to load")));
    };
    // Best model first; the worker drops to the lighter one if it cannot
    // build the better one at all.
    worker.postMessage({

      type: "init",
      bundle: BUNDLE,
      wasm: WASM,
      models: [
        { url: MODEL_FULL, label: "full" },
        { url: MODEL_LITE, label: "lite" },
      ],
    });
  }).catch((err) => {
    worker.terminate();
    throw err;
  });

  /*
   * Say so when the accurate model was turned down.
   *
   * Dropping to `lite` costs the hand games most of their precision, and it
   * happens silently on whichever devices refuse the bigger model. Without
   * this the only clue is one word in the debug readout, with no way to find
   * out why it says what it says.
   */
  if (ready.refused?.length) {
    console.warn(
      `Pose: running the ${ready.model} model on the ${ready.delegate}. ` +
        `Turned down first: ${ready.refused.join("; ")}`,
    );
  }

  return { worker, delegate: ready.delegate, model: ready.model };
}

async function startInline() {
  const { FilesetResolver, PoseLandmarker } = await import(BUNDLE);
  const fileset = await FilesetResolver.forVisionTasks(WASM);

  let lastError;
  for (const delegate of ["GPU", "CPU"]) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(
        fileset,
        poseOptions(delegate, MODEL_LITE),
      );
      return new InlineTracker(landmarker, { usingGpu: delegate === "GPU" });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Could not create MediaPipe Pose Landmarker");
}

/**
 * Get pose detection going, on a worker if this browser will allow it.
 *
 * If the worker cannot start, or dies partway through a session, detection
 * quietly moves back onto the main thread. That costs frames, but a stuttery
 * game is a great deal better than one that stops seeing the player.
 */
export async function createPoseTracker() {
  let tracker = null;
  let meta = { delegate: "—", model: "lite", mode: "inline" };

  const fallBack = async () => {
    try {
      tracker = await startInline();
      meta = { delegate: tracker.usingGpu ? "GPU" : "CPU", model: "lite", mode: "inline" };
    } catch {
      tracker = null;
    }
  };

  try {
    const { worker, delegate, model: label } = await startWorker();
    tracker = new WorkerTracker({
      worker,
      capture: (video) => createImageBitmap(video),
      onFail: (why) => {
        console.warn(`[pose] worker stopped, falling back to the main thread: ${why}`);
        worker.terminate();
        meta = { ...meta, mode: "inline" };
        fallBack();
      },
    });
    meta = { delegate, model: label, mode: "worker" };
  } catch (err) {
    console.warn(`[pose] worker unavailable, detecting on the main thread: ${err?.message ?? err}`);
    await fallBack();
    if (!tracker) throw new Error("Could not start pose detection");
  }

  return {
    track: (video, now) =>
      tracker ? tracker.track(video, now) : { landmarks: null, at: now, fresh: false, inferMs: 0 },
    get delegate() {
      return meta.delegate;
    },
    get model() {
      return meta.model;
    },
    get mode() {
      return meta.mode;
    },
    close: () => tracker?.close(),
  };
}
