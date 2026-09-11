/**
 * Pose detection, moved off the thread that draws the game.
 *
 * MediaPipe's web API is synchronous: detectForVideo blocks until the answer
 * is ready. Run it on the main thread at 30fps and a 20ms detection eats 600ms
 * of every second, so the drawing gets whatever is left and the round visibly
 * stutters no matter how little is being painted. In here it costs the game
 * nothing but the time to hand over a frame.
 *
 * The main thread sends ImageBitmaps and gets landmarks back. It stays usable
 * throughout; frames that arrive while a detection is running are dropped by
 * the sender rather than queued, so the answer is always about the most recent
 * frame rather than a backlog of stale ones.
 *
 * This is deliberately a *classic* worker, not a module one. MediaPipe loads
 * its wasm glue with importScripts, which module workers forbid outright, so
 * a module worker fails the moment it tries to build the landmarker.
 */

/**
 * Get at MediaPipe from a classic worker.
 *
 * The package only ships ESM and CommonJS builds. Dynamic import is the clean
 * way in and works in current browsers; where it does not, the CommonJS build
 * can be pulled in with importScripts given somewhere to hang its exports.
 */
async function loadVision(bundle) {
  try {
    return await import(bundle);
  } catch {
    self.module = { exports: {} };
    self.exports = self.module.exports;
    importScripts(bundle.replace(/\.mjs$/, ".cjs"));
    return self.module.exports;
  }
}

let landmarker = null;
let lastTimestamp = 0;

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
 * Run one throwaway detection to get the expensive first call over with.
 *
 * The first call is nothing like the ones after it: the graph is built and the
 * GPU shaders are compiled on the spot, which took several seconds on the test
 * machine against about ten milliseconds afterwards. It runs after we report
 * ready, so the cost lands while the player is still being asked to step into
 * frame; real frames arriving meanwhile simply wait their turn, since the
 * worker handles one message at a time.
 */
function warmUp() {
  try {
    const canvas = new OffscreenCanvas(256, 256);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);
    landmarker.detectForVideo(canvas, 1);
  } catch {
    // Not being able to warm up is not a reason to refuse to run.
  }
  lastTimestamp = 0;
}

async function init({ bundle, wasm, models }) {
  const { FilesetResolver, PoseLandmarker } = await loadVision(bundle);
  const fileset = await FilesetResolver.forVisionTasks(wasm);

  /*
   * The GPU matters more than the model does.
   *
   * Trying every model on the GPU before touching the CPU is deliberate:
   * the better model run on a CPU is slower than the rougher one on a GPU by
   * far more than it is more accurate, and a detector that cannot keep up
   * misses the fast movements these games are made of. So the order is
   * best-model-on-GPU, rough-model-on-GPU, and only then the CPU.
   */
  const attempts = [];
  for (const delegate of ["GPU", "CPU"]) {
    for (const model of models) attempts.push({ delegate, model });
  }

  const refused = [];
  for (const { delegate, model } of attempts) {
    try {
      landmarker = await PoseLandmarker.createFromOptions(
        fileset,
        poseOptions(delegate, model.url),
      );
      return { delegate, model: model.label, refused };
    } catch (err) {
      // Remember why, rather than silently ending up on the rough model with
      // nothing to explain it.
      refused.push(`${model.label}/${delegate}: ${String(err?.message ?? err)}`);
    }
  }
  throw new Error(`Could not create MediaPipe Pose Landmarker — ${refused.join("; ")}`);
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    try {
      const { delegate, model, refused } = await init(msg);
      self.postMessage({ type: "ready", delegate, model, refused });
      warmUp();
    } catch (err) {
      self.postMessage({ type: "failed", message: String(err?.message ?? err) });
    }
    return;
  }

  if (msg.type === "frame") {
    const { bitmap, capturedAt } = msg;
    if (!landmarker) {
      bitmap.close();
      return;
    }
    // detectForVideo insists on a timestamp that always moves forward.
    const ts = Math.max(lastTimestamp + 1, Math.floor(msg.ts));
    lastTimestamp = ts;
    const t0 = performance.now();
    try {
      const result = landmarker.detectForVideo(bitmap, ts);
      self.postMessage({
        type: "result",
        landmarks: result?.landmarks?.[0] ?? null,
        capturedAt,
        inferMs: performance.now() - t0,
      });
    } catch (err) {
      self.postMessage({ type: "failed", message: String(err?.message ?? err) });
    } finally {
      bitmap.close();
    }
  }
};
