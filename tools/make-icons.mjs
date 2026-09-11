/**
 * Draw the home screen icons, using the same Pip the app draws.
 *
 * A phone that has been sent this game shows an icon long before it shows a
 * frame of it, so the icon should be the actual mascot rather than a stand-in
 * that drifts out of date. Pip is procedural, so the only way to get a PNG of
 * him is to run his drawing code - which is what this does, in a real browser,
 * then reads the canvas back.
 *
 *   node tools/make-icons.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { attach, sleep } from "./cdp.mjs";

const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));

if (!CHROME) {
  console.error("No Chrome or Edge found.");
  process.exit(1);
}

const PORT = 5199;
const OUT = "stage0/icons";
const PROFILE = join(process.env.TEMP ?? "/tmp", `motionplay-icons-${Date.now()}`);

/*
 * What each size is for.
 *
 * `padding` is the share of the tile left empty around Pip. iOS crops nothing
 * and rounds the corners itself, so its icon can sit fairly tight; Android may
 * mask a maskable icon down to a circle, and anything in the outer 10% of the
 * tile can be shaved off, so that one is drawn small and safe.
 */
const ICONS = [
  { file: "apple-touch-icon.png", size: 180, padding: 0.16, round: false },
  { file: "icon-192.png", size: 192, padding: 0.16, round: false },
  { file: "icon-512.png", size: 512, padding: 0.16, round: false },
  // Sized so Pip's corners stay inside the 80%-diameter circle Android may
  // crop a maskable icon down to, rather than merely small enough to be safe.
  { file: "icon-maskable-512.png", size: 512, padding: 0.18, round: false },
  { file: "icon-1024.png", size: 1024, padding: 0.16, round: false },
];

const server = spawn(process.execPath, ["tools/serve.mjs", "--port", String(PORT)], {
  stdio: "ignore",
});
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=9223`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--disable-gpu",
    `http://127.0.0.1:${PORT}/index.html`,
  ],
  { stdio: "ignore" },
);

/** Chrome needs a moment before its debugging port answers. */
async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      return await attach(9223);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("could not attach to the browser");
}

const cdp = await connect();
await sleep(600);

mkdirSync(OUT, { recursive: true });

/*
 * Where Pip actually is inside his own badge.
 *
 * `drawMascotBadge` puts his feet on the point you give it and grows him
 * upwards, and his tail sweeps out to one side, so centring the call is not
 * the same as centring the fox: the first attempt left him high and pushed
 * right, with a bald strip along the bottom of the tile. Rather than nudge
 * numbers until it looks right, draw him once on nothing, find the pixels he
 * covers, and let that decide the framing for every size.
 */
const box = await cdp.evaluate(`(async () => {
  const { drawMascotBadge } = await import('/js/mascot.js');
  const probe = 400, at = 0.8, of = 0.7;
  const c = document.createElement('canvas');
  c.width = c.height = probe;
  const ctx = c.getContext('2d');
  drawMascotBadge(ctx, probe / 2, probe * at, probe * of, 0);
  const d = ctx.getImageData(0, 0, probe, probe).data;
  let minX = probe, minY = probe, maxX = -1, maxY = -1;
  for (let y = 0; y < probe; y += 1) {
    for (let x = 0; x < probe; x += 1) {
      if (d[(y * probe + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // Reported against the badge's own origin and scale, so it holds at any size.
  const cx = probe / 2, cy = probe * at, s = probe * of;
  return {
    left: (minX - cx) / s, right: (maxX - cx) / s,
    top: (minY - cy) / s, bottom: (maxY - cy) / s,
  };
})()`);

const wide = box.right - box.left;
const tall = box.bottom - box.top;
console.log(`Pip measures ${wide.toFixed(2)} x ${tall.toFixed(2)} badge units\n`);

for (const { file, size, padding } of ICONS) {
  // Scale so his longest side just fits the safe area, then sit him dead centre.
  const inner = size * (1 - padding * 2);
  const scale = inner / Math.max(wide, tall);
  const cx = size / 2 - ((box.left + box.right) / 2) * scale;
  const cy = size / 2 - ((box.top + box.bottom) / 2) * scale;

  const dataUrl = await cdp.evaluate(`(async () => {
    const { drawMascotBadge } = await import('/js/mascot.js');
    const c = document.createElement('canvas');
    c.width = c.height = ${size};
    const ctx = c.getContext('2d');

    // A warm tile rather than a transparent one: iOS composites a home screen
    // icon onto white, and Pip's cream belly would vanish into it.
    const bg = ctx.createLinearGradient(0, 0, 0, ${size});
    bg.addColorStop(0, '#ffd9a8');
    bg.addColorStop(1, '#f9a03c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, ${size}, ${size});

    drawMascotBadge(ctx, ${cx}, ${cy}, ${scale}, 0);
    return c.toDataURL('image/png');
  })()`);

  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(join(OUT, file), png);
  console.log(`${file.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

cdp.close();
chrome.kill();
server.kill();
await rm(PROFILE, { recursive: true, force: true }).catch(() => {});
console.log(`\nWritten to ${OUT}/`);
process.exit(0);
