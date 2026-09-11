/**
 * A contact sheet of every how-to animation, for looking at.
 *
 * The clips are the one part of this that cannot be judged by a test: an
 * assertion can say the arm reached its target, not whether the result looks
 * like a fox throwing a punch. This lays every game out across several moments
 * of its loop in one image, which is the quickest way to see a pose that has
 * gone wrong.
 *
 *   node tools/demo-sheet.mjs            every game
 *   node tools/demo-sheet.mjs punch-out  just one, in more detail
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attach, sleep } from "./cdp.mjs";

const ORIGIN = "http://127.0.0.1:5173";
const PORT = 9335;
const only = process.argv[2] ?? null;
const CELL = { w: 260, h: 220 };
const STEPS = only ? 6 : 4;

const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));

const profile = join(tmpdir(), `motionplay-sheet-${process.pid}`);
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp = null;
try {
  await sleep(2500);
  cdp = await attach(PORT);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `${ORIGIN}/index.html` });
  await sleep(1200);

  const size = await cdp.evaluate(`(async () => {
    const { drawHowTo, clipsFor, CLIPS } = await import('${ORIGIN}/js/demo.js');
    const { GAMES } = await import('${ORIGIN}/js/games/registry.js');
    const games = ${JSON.stringify(only)} ? GAMES.filter(g => g.id === ${JSON.stringify(only)}) : GAMES;
    const steps = ${STEPS};
    const cw = ${CELL.w}, ch = ${CELL.h}, label = 22;

    const cv = document.createElement('canvas');
    const dpr = 2;
    cv.width = (cw * steps) * dpr;
    cv.height = (games.length * (ch + label)) * dpr;
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:' +
      (cw * steps) + 'px;height:' + (games.length * (ch + label)) + 'px';
    document.body.append(cv);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fdf6e9';
    ctx.fillRect(0, 0, cv.width, cv.height);

    games.forEach((game, row) => {
      const total = clipsFor(game).reduce((s, id) => s + CLIPS[id].ms, 0);
      const top = row * (ch + label);
      ctx.fillStyle = '#1f2937';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(game.id + '  (' + game.needs + ' body: ' + clipsFor(game).join(', ') + ')', 6, top + 15);
      for (let i = 0; i < steps; i++) {
        // Nudged off the exact start so a clip that begins at rest still
        // shows the movement rather than four identical standing poses.
        const t = total * ((i + 0.35) / steps);
        ctx.save();
        ctx.translate(i * cw + 4, top + label);
        drawHowTo(ctx, { w: cw - 8, h: ch - 8 }, game, t);
        ctx.restore();
      }
    });
    document.documentElement.style.background = '#fdf6e9';
    return JSON.stringify({ w: cw * steps, h: games.length * (ch + label) });
  })()`);

  const box = JSON.parse(size);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: box.w,
    height: box.h,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await sleep(400);

  mkdirSync("out", { recursive: true });
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = join("out", only ? `demo-${only}.png` : "demo-sheet.png");
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log(`wrote ${file}  (${box.w}x${box.h})`);
} finally {
  try {
    await cdp?.send("Browser.close");
  } catch {
    /* already gone */
  }
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* the profile dir is disposable */
  }
}
