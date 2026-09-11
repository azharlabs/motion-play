/**
 * Run the real pose pipeline, end to end, in a real browser.
 *
 * tools/preview.mjs replaces pose.js with a mock so it can check layout without
 * waiting on a model download, which means it never exercises the thing most
 * likely to break: the worker, MediaPipe inside it, and the frames going back
 * and forth. This script stubs only the camera — the stream is a real one from
 * a canvas — and then plays a round for real.
 *
 * It answers three questions a unit test cannot:
 *   does the worker actually start on this browser
 *   do landmarks actually come back
 *   does the game thread actually stay smooth while they do
 *
 *   node tools/pose-smoke.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attach, sleep } from "./cdp.mjs";

const ORIGIN = "http://127.0.0.1:5173";
const PORT = 9223;

/** Any hand game will do; this one asks the least of the cardboard figure. */
const GAME = "balloon-pop";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

const CAMERA_STUB = `
export function preferredConstraints() { return {}; }
export async function startCamera(video) {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 640;
  const ctx = c.getContext('2d');
  // A moving figure, so the tracking has something to actually follow.
  (function paint(t) {
    ctx.fillStyle = '#243546'; ctx.fillRect(0, 0, c.width, c.height);
    const sway = Math.sin((t || 0) / 600) * c.width * 0.12;
    ctx.fillStyle = '#e8d4c0';
    ctx.beginPath(); ctx.arc(c.width / 2 + sway * 0.3, c.height * 0.18, 46, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#4a7fb5';
    ctx.fillRect(c.width * 0.34 + sway * 0.3, c.height * 0.27, c.width * 0.32, c.height * 0.34);
    ctx.fillStyle = '#e8d4c0';
    ctx.fillRect(c.width * 0.2 + sway, c.height * 0.3, c.width * 0.14, c.height * 0.1);
    ctx.fillRect(c.width * 0.66 - sway, c.height * 0.3, c.width * 0.14, c.height * 0.1);
    ctx.fillStyle = '#2f3e50';
    ctx.fillRect(c.width * 0.37, c.height * 0.6, c.width * 0.1, c.height * 0.3);
    ctx.fillRect(c.width * 0.53, c.height * 0.6, c.width * 0.1, c.height * 0.3);
    requestAnimationFrame(paint);
  })(0);
  video.srcObject = c.captureStream(30);
  video.playsInline = true; video.muted = true;
  await video.play();
  return video.srcObject;
}
export function stopCamera(s) { if (s) for (const t of s.getTracks()) t.stop(); }
`;

const PERF_START = `(() => {
  const p = { gaps: [], last: 0 };
  window.__perf = p;
  const step = (t) => {
    if (p.last) p.gaps.push(t - p.last);
    p.last = t;
    p.raf = requestAnimationFrame(step);
  };
  p.raf = requestAnimationFrame(step);
  return 'ok';
})()`;

const PERF_READ = `(() => {
  const p = window.__perf;
  cancelAnimationFrame(p.raf);
  const g = p.gaps.slice(3).sort((a, b) => a - b);
  if (!g.length) return JSON.stringify({ n: 0 });
  const at = (q) => g[Math.min(g.length - 1, Math.floor(g.length * q))];
  const r = (v) => Math.round(v * 10) / 10;
  return JSON.stringify({
    n: g.length,
    median: r(at(0.5)),
    p95: r(at(0.95)),
    worst: r(g[g.length - 1]),
    long: g.filter((x) => x > 32).length,
  });
})()`;

if (!CHROME) {
  console.error("No Chrome or Edge found.");
  process.exit(0);
}

// A fixed profile, so the model and wasm stay cached between runs.
const profile = join(tmpdir(), "motionplay-pose-profile");
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
};

try {
  await sleep(1500);
  const cdp = await attach(PORT);

  const errors = [];
  const warnings = [];
  cdp.on("Runtime.consoleAPICalled", (p) => {
    const text = p.args.map((a) => a.value ?? a.description).join(" ");
    if (p.type === "error") errors.push(text);
    if (p.type === "warning") warnings.push(text);
  });
  cdp.on("Runtime.exceptionThrown", (p) => {
    errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "error");
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");

  // The worker is its own debugging target, so anything it logs or throws is
  // invisible from the page. Attach to it too, or a hang in there looks like
  // silence out here.
  const workerLog = [];
  cdp.onAny((method, params, sessionId) => {
    if (!sessionId) return;
    if (method === "Runtime.consoleAPICalled") {
      workerLog.push(`${params.type}: ${params.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
    if (method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails;
      workerLog.push(`EXCEPTION: ${d.exception?.description ?? d.text}`);
    }
  });
  cdp.on("Target.attachedToTarget", async (p) => {
    workerLog.push(`attached: ${p.targetInfo.type} ${p.targetInfo.url.split("/").pop()}`);
    await cdp.send("Runtime.enable", {}, p.sessionId);
    await cdp.send("Runtime.runIfWaitingForDebugger", {}, p.sessionId);
  });
  await cdp.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
  });

  // Only the camera is faked. pose.js, the worker and MediaPipe are the real ones.
  cdp.on("Fetch.requestPaused", async (p) => {
    if (p.request.url.includes("camera.js")) {
      await cdp.send("Fetch.fulfillRequest", {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
        body: Buffer.from(CAMERA_STUB, "utf8").toString("base64"),
      });
    } else {
      await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
    }
  });
  await cdp.send("Network.enable");
  // The cache is left on so the model does not come down the wire every run.
  // Our own files cannot go stale: tools/serve.mjs sends them no-store.
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*camera.js*" }] });

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await cdp.send("Page.navigate", { url: `${ORIGIN}/?t=${Date.now()}` });
  await sleep(2000);

  console.log("\nstarting a round with the real detector (downloading the model)...");
  // The home screen lists skills, not games, so get to one the way a player
  // does: open a skill that trains it, then tap the card.
  await cdp.evaluate(`(() => {
    for (const skill of document.querySelectorAll('#skill-grid .skill-card')) {
      skill.click();
      const card = document.querySelector('#skill-games [data-game="${GAME}"]');
      if (card) { card.click(); return 'ok'; }
      document.getElementById('btn-skill-back').click();
    }
    throw new Error('no skill lists ${GAME}');
  })()`);
  // Picking a game shows how to play it while the camera and model load, and
  // waits for a tap. Keep trying the button until the load behind it finishes.
  for (let i = 0; i < 60; i += 1) {
    await sleep(1000);
    const done = await cdp.evaluate(`(() => {
      const b = document.getElementById('btn-howto-play');
      if (document.getElementById('screen-howto').hidden) return true;
      if (b && !b.disabled) { b.click(); return true; }
      return false;
    })()`);
    if (done === "true" || done === true) break;
  }
  // The model comes off a CDN the first time, and the warm-up detection after
  // it is slow on software rendering, so give the whole thing room.
  await sleep(20000);

  const started = JSON.parse(
    await cdp.evaluate(`(() => {
      const err = document.getElementById('error-note');
      return JSON.stringify({
        screen: document.querySelector('.screen:not([hidden])')?.id ?? 'none',
        error: err && !err.hidden ? err.textContent.trim() : '',
      });
    })()`),
  );
  // A cardboard figure will not pass calibration, so reaching the calibrate
  // screen is as far as this can get; what matters is that nothing errored.
  check(
    "the round started",
    started.screen === "screen-play" || started.screen === "screen-calibrate",
    started.error || started.screen,
  );
  for (const w of warnings.filter((w) => w.includes("[pose]"))) console.log(`  note: ${w}`);

  // Turn on the debug readout and see what it says about the pipeline.
  await cdp.evaluate(`document.getElementById('btn-skeleton').click()`);
  await sleep(3000);

  const readout = await cdp.evaluate(
    `document.getElementById('perf-readout').textContent.trim()`,
  );
  console.log(`  readout: ${readout}`);
  check("detection runs on a worker", /worker/.test(readout), readout);

  const posed = JSON.parse(
    await cdp.evaluate(`(() => {
      const m = /pose (\\d+)fps/.exec(document.getElementById('perf-readout').textContent);
      const d = /detect ([\\d.]+)ms/.exec(document.getElementById('perf-readout').textContent);
      return JSON.stringify({ fps: m ? +m[1] : 0, ms: d ? +d[1] : 0 });
    })()`),
  );
  check("landmarks are coming back", posed.fps > 8, `${posed.fps}fps tracking`);
  check("detection cost is measured", posed.ms > 0, `${posed.ms}ms per detection`);

  console.log("\nmeasuring the game thread while detection runs...");
  await cdp.evaluate(PERF_START);
  await sleep(4000);
  const perf = JSON.parse(await cdp.evaluate(PERF_READ));
  console.log(
    `  frames: median ${perf.median}ms  p95 ${perf.p95}ms  worst ${perf.worst}ms  dropped ${perf.long}/${perf.n}`,
  );
  // The whole point of the worker: detection must not push the drawing late.
  check("drawing stays smooth", perf.p95 <= 26, `p95 ${perf.p95}ms`);
  check("few dropped frames", perf.long / perf.n <= 0.05, `${perf.long}/${perf.n}`);

  for (const w of warnings.filter((w) => w.includes("[pose]"))) console.log(`  note: ${w}`);
  if (workerLog.length) {
    console.log("\nfrom inside the worker:");
    for (const line of workerLog.slice(0, 12)) console.log(`  ${line}`);
  }
  const real = errors.filter((e) => !/favicon|Failed to load resource/i.test(e));
  check("no page errors", real.length === 0, real.slice(0, 3).join(" | "));

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  // Ask the browser to shut itself down: killing the launcher on Windows
  // leaves the renderer and GPU processes behind, and a pile of those makes
  // the next run's frame-rate numbers meaningless.
  try {
    await cdp.send("Browser.close");
  } catch {
    /* it may already be gone */
  }
  cdp.close();
} finally {
  chrome.kill();
}

process.exit(failures ? 1 : 0);
