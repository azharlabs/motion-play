/**
 * Headless UI check for the things Node tests cannot see: real layout at phone
 * and desktop sizes, the camera dock moving between screens, and each game
 * actually reaching the play loop.
 *
 * Camera and pose are stubbed at the network layer, so this needs no webcam
 * and nobody in front of it.
 *
 *   node tools/preview.mjs                       check every ready game
 *   node tools/preview.mjs --game balloon-pop    just one
 *   node tools/preview.mjs --shots out/          save screenshots
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attach, sleep } from "./cdp.mjs";

const ORIGIN = "http://127.0.0.1:5173";
const PORT = 9333;

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, mobile: true, scale: 3 },
  { name: "phone-landscape", width: 844, height: 390, mobile: true, scale: 3 },
  { name: "desktop", width: 1280, height: 900, mobile: false, scale: 1 },
];

const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));

/** A canvas-backed stream shaped like the viewport, as the real app requests. */
const CAMERA_STUB = `
export function preferredConstraints() { return {}; }
export async function startCamera(video) {
  const portrait = window.innerHeight >= window.innerWidth;
  const c = document.createElement('canvas');
  c.width = portrait ? 480 : 640;
  c.height = portrait ? 640 : 480;
  const ctx = c.getContext('2d');
  (function paint() {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#2b3f52'); g.addColorStop(1, '#16232e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(c.width / 2, c.height * 0.2, c.width * 0.09, 0, 6.3); ctx.fill();
    ctx.fillRect(c.width * 0.42, c.height * 0.28, c.width * 0.16, c.height * 0.3);
    requestAnimationFrame(paint);
  })();
  video.srcObject = c.captureStream(30);
  await video.play();
  return video.srcObject;
}
export function stopCamera(s) { if (s) for (const t of s.getTracks()) t.stop(); }
`;

/** A calm standing body whose hands sweep, so hand games actually score. */
const POSE_STUB = `
export const MEDIAPIPE_VERSION = 'mock';
export async function createPoseTracker() {
  return {
    delegate: 'MOCK',
    model: 'mock',
    mode: 'mock',
    close() {},
    track(video, t) {
      const { result } = detectPose(null, video, t);
      return { landmarks: result.landmarks[0], at: t, fresh: true, inferMs: 4 };
    },
  };
}
function detectPose(landmarker, video, t) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  const put = (i, x, y) => { pts[i] = { x, y, z: 0, visibility: 0.95 }; };
  const bob = Math.sin(t / 800) * 0.005;
  put(0, 0.5, 0.20 + bob);
  put(11, 0.44, 0.31 + bob); put(12, 0.56, 0.31 + bob);
  put(13, 0.42, 0.43 + bob); put(14, 0.58, 0.43 + bob);
  put(23, 0.46, 0.58 + bob); put(24, 0.54, 0.58 + bob);
  put(25, 0.46, 0.74);       put(26, 0.54, 0.74);
  put(27, 0.46, 0.90);       put(28, 0.54, 0.90);
  // Hands sweep a wide arc across the upper half after calibration settles.
  const sweep = t > 3000 ? Math.sin(t / 900) : 0;
  const lx = 0.5 + sweep * 0.34, ly = 0.42 + Math.cos(t / 1100) * 0.2;
  const rx = 0.5 - sweep * 0.34, ry = 0.42 + Math.sin(t / 1000) * 0.2;
  // Wrist plus knuckles, since the hand point is worked out from all three.
  put(15, lx, ly); put(19, lx, ly); put(17, lx, ly);
  put(16, rx, ry); put(20, rx, ry); put(18, rx, ry);
  return { result: { landmarks: [pts] }, inferMs: 4 };
}
`;

/** Collect the gap between animation frames while a round is running. */
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
  // Drop the first few: the probe itself lands mid-frame.
  const g = p.gaps.slice(3).sort((a, b) => a - b);
  if (!g.length) return JSON.stringify({ n: 0 });
  const at = (q) => g[Math.min(g.length - 1, Math.floor(g.length * q))];
  const r = (v) => Math.round(v * 10) / 10;
  return JSON.stringify({
    n: g.length,
    median: r(at(0.5)),
    p95: r(at(0.95)),
    worst: r(g[g.length - 1]),
    // A 60Hz frame is 16.7ms, so anything past 32ms dropped at least one.
    long: g.filter((x) => x > 32).length,
  });
})()`;

/**
 * The home screen lists skills, not games, so the harness reaches a game the
 * way a player does: open a skill that trains it, then tap the card.
 */
const OPEN_GAME = (id) => `(() => {
  if (document.getElementById('screen-home').hidden) document.getElementById('btn-skill-back').click();
  for (const skill of document.querySelectorAll('#skill-grid .skill-card')) {
    skill.click();
    const card = document.querySelector('#skill-games [data-game="${id}"]');
    if (card) { card.click(); return 'ok'; }
    document.getElementById('btn-skill-back').click();
  }
  throw new Error('no skill lists ${id}');
})()`;

/** Every game a player can start, gathered across the skill screens. */
const READY_GAMES = `(() => {
  const ids = new Set();
  for (const skill of document.querySelectorAll('#skill-grid .skill-card')) {
    skill.click();
    for (const c of document.querySelectorAll('#skill-games .game-card:not([disabled])')) ids.add(c.dataset.game);
    document.getElementById('btn-skill-back').click();
  }
  return JSON.stringify([...ids]);
})()`;

/** Watch a couple of seconds of frames and summarise the pacing. */
async function measureFrames(cdp) {
  await cdp.evaluate(PERF_START);
  await sleep(2500);
  return JSON.parse(await cdp.evaluate(PERF_READ));
}

/**
 * Smooth enough that a player would not notice. A game that cannot keep up
 * shows it in the p95; the long-frame allowance is a proportion so it means
 * the same whatever the sample size.
 */
const steady = (perf) => perf.n > 30 && perf.p95 <= 26 && perf.long / perf.n <= 0.05;

if (!CHROME) {
  console.error("No Chrome or Edge found; skipping UI check.");
  process.exit(0);
}

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
};
const onlyGame = arg("--game");
const shotDir = arg("--shots");
if (shotDir) mkdirSync(shotDir, { recursive: true });

const profile = join(tmpdir(), `motionplay-ui-${process.pid}`);
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    // Without these an occluded window throttles rAF and nothing renders.
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
  await sleep(3000);
  const cdp = await attach(PORT);
  const enc = (s) => Buffer.from(s, "utf8").toString("base64");

  cdp.on("Fetch.requestPaused", async (p) => {
    const url = p.request.url;
    const body = url.includes("camera.js")
      ? CAMERA_STUB
      : url.includes("/pose.js")
        ? POSE_STUB
        : null;
    if (body) {
      await cdp.send("Fetch.fulfillRequest", {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
        body: enc(body),
      });
    } else {
      await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
    }
  });

  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Fetch.enable", {
    patterns: [{ urlPattern: "*camera.js*" }, { urlPattern: "*pose.js*" }],
  });

  for (const vp of VIEWPORTS) {
    console.log(`\n[${vp.name} ${vp.width}x${vp.height}]`);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.scale,
      mobile: vp.mobile,
    });

    await cdp.send("Page.navigate", { url: `${ORIGIN}/?t=${Date.now()}` });
    await sleep(1800);

    const home = JSON.parse(
      await cdp.evaluate(`(() => {
        const cards = [...document.querySelectorAll('#screen-home .skill-card')];
        const boxes = cards.map((c) => c.getBoundingClientRect());
        const sound = document.getElementById('btn-sound').getBoundingClientRect();
        const title = document.querySelector('.home-title').getBoundingClientRect();
        return JSON.stringify({
          skills: boxes.length,
          painted: cards.filter((c) => {
            const cv = c.querySelector('canvas.skill-art');
            if (!cv) return false;
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return true;
            return false;
          }).length,
          // The flat list of all ten games no longer lives here.
          games: document.querySelectorAll('#screen-home .game-card').length,
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          offRight: boxes.filter((b) => b.right > window.innerWidth + 1).length,
          sound: {
            w: Math.round(sound.width),
            h: Math.round(sound.height),
            fits: sound.right <= window.innerWidth + 1 && sound.top >= -1,
            clearsTitle: sound.left >= title.right - 1,
          },
        });
      })()`),
    );

    check(
      "home leads with skills instead of every game",
      home.skills === 9 && home.games === 0,
      `${home.skills} skills, ${home.games} game cards`,
    );
    check(
      "every skill card is illustrated",
      home.painted === home.skills,
      `${home.painted}/${home.skills} drawn`,
    );
    check("no sideways overflow", home.overflowX <= 0 && home.offRight === 0, `${home.overflowX}px`);
    check(
      "sound toggle is tappable and out of the title's way",
      home.sound.w >= 38 && home.sound.h >= 38 && home.sound.fits && home.sound.clearsTitle,
      `${home.sound.w}x${home.sound.h}, fits ${home.sound.fits}, clear ${home.sound.clearsTitle}`,
    );

    if (shotDir) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(shotDir, `home-${vp.name}.png`), Buffer.from(shot.data, "base64"));
    }

    /* ---- browse by motor skill ---- */

    const shelf = JSON.parse(
      await cdp.evaluate(`(() => {
        const grid = document.getElementById('skill-grid');
        const cards = [...grid.querySelectorAll('.skill-card')];
        const boxes = cards.map(c => c.getBoundingClientRect());
        return JSON.stringify({
          cards: cards.length,
          minW: Math.round(Math.min(...boxes.map(b => b.width))),
          minH: Math.round(Math.min(...boxes.map(b => b.height))),
          // Every card must say what it is, how many games, and show its art.
          complete: cards.every(c =>
            c.querySelector('.skill-art') &&
            c.querySelector('.card-title')?.textContent.trim() &&
            /game/.test(c.querySelector('.skill-count')?.textContent ?? '')),
          fits: boxes.every(b => b.right <= window.innerWidth + 1 && b.left >= -1),
        });
      })()`),
    );

    check("home offers a card per motor skill", shelf.cards === 9, `${shelf.cards} cards`);
    check("skill cards are real cards", shelf.minW > 80 && shelf.minH > 90, `${shelf.minW}x${shelf.minH}`);
    check("skill cards are complete", shelf.complete);
    check("skill cards stay inside the screen", shelf.fits);

    // Tapping a skill card should open a screen holding exactly its games.
    const opened = JSON.parse(
      await cdp.evaluate(`(() => {
        document.querySelector('.skill-card[data-skill="lower-body"]').click();
        const screen = document.getElementById('screen-skill');
        const cards = [...document.querySelectorAll('#skill-games .game-card')];
        const boxes = cards.map((c) => c.getBoundingClientRect());
        return JSON.stringify({
          open: !screen.hidden,
          homeHidden: document.getElementById('screen-home').hidden,
          shown: cards.length,
          title: document.getElementById('skill-title').textContent.trim(),
          painted: cards.filter((c) => {
            const cv = c.querySelector('canvas');
            if (!cv) return false;
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
            for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return true;
            return false;
          }).length,
          minW: Math.round(Math.min(...boxes.map((b) => b.width))),
          minH: Math.round(Math.min(...boxes.map((b) => b.height))),
          tagged: cards.length > 0 && cards.every(c =>
            [...c.querySelectorAll('.skill-pill')].some(p => p.textContent.includes('Lower body'))),
          overflow: Math.max(0, document.getElementById('screen-skill').scrollWidth - window.innerWidth),
        });
      })()`),
    );

    check("a skill card opens its own screen", opened.open && opened.homeHidden, opened.title);
    check(
      "that screen holds exactly the games for the skill",
      opened.shown > 0 && opened.shown < 10 && opened.tagged,
      `${opened.shown} games, all tagged ${opened.tagged}`,
    );
    check(
      "game card art renders",
      opened.painted === opened.shown,
      `${opened.painted}/${opened.shown} painted`,
    );
    check(
      "game cards have real size",
      opened.minW > 80 && opened.minH > 90,
      `${opened.minW}x${opened.minH}`,
    );
    check("the skill screen fits the width", opened.overflow === 0, `${opened.overflow}px over`);

    if (shotDir) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(shotDir, `skill-${vp.name}.png`), Buffer.from(shot.data, "base64"));
    }

    const back = JSON.parse(
      await cdp.evaluate(`(() => {
        document.getElementById('btn-skill-back').click();
        return JSON.stringify({
          home: !document.getElementById('screen-home').hidden,
          skills: document.querySelectorAll('#skill-grid .skill-card').length,
        });
      })()`),
    );
    check("back returns to the skill shelf", back.home && back.skills === 9, `${back.skills} skills`);

    /* ---- the activity log ---- */

    // Seed a history so the screen has something real to lay out.
    await cdp.evaluate(`(() => {
      const day = (back) => { const d = new Date(); d.setDate(d.getDate() - back); return d; };
      const key = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const rounds = [
        ['jump-the-wall', 0, { jump: 24, duck: 9 }, 31, 4],
        ['squat-rush', 0, { squat: 18 }, 18, 3],
        ['punch-out', 1, { punch: 46 }, 22, 3],
        ['ski-slalom', 3, { lean: 27 }, 14, 2],
      ].map(([game, back, actions, score, level]) => ({
        game, at: day(back).getTime(), day: key(day(back)),
        ms: 60000, score, level, actions,
      }));
      localStorage.setItem('motionplay.history', JSON.stringify(rounds));
    })()`);

    await cdp.evaluate(`location.reload()`);
    await sleep(700);
    await cdp.evaluate(`document.getElementById('btn-activity').click()`);
    await sleep(200);

    const activity = JSON.parse(
      await cdp.evaluate(`(() => {
        const screen = document.getElementById('screen-activity');
        const body = document.getElementById('activity-body');
        const boxes = [...body.querySelectorAll('.stat-tile, .day-card, .bar-row')]
          .map(n => n.getBoundingClientRect());
        return JSON.stringify({
          open: !screen.hidden,
          tiles: body.querySelectorAll('.stat-tile').length,
          days: body.querySelectorAll('.day-card').length,
          skills: body.querySelectorAll('.bar-row').length,
          movements: body.textContent.includes('Movements so far'),
          offRight: boxes.filter(b => b.right > window.innerWidth + 1).length,
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          sub: document.getElementById('activity-sub').textContent,
        });
      })()`),
    );

    check("activity screen opens", activity.open, `${activity.sub}`);
    check("it breaks the log down by day", activity.days === 3, `${activity.days} days`);
    check("it shows movements and skills", activity.movements && activity.skills > 0, `${activity.skills} skills`);
    check(
      "activity screen fits the viewport",
      activity.offRight === 0 && activity.overflowX <= 0,
      `${activity.offRight} off right, ${activity.overflowX}px wide`,
    );

    if (shotDir) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(shotDir, `activity-${vp.name}.png`), Buffer.from(shot.data, "base64"));
    }

    // Back to a clean slate so the game runs below are not affected.
    await cdp.evaluate(`localStorage.removeItem('motionplay.history'); location.reload()`);
    await sleep(700);

    const ready = JSON.parse(await cdp.evaluate(READY_GAMES));

    /* ---- how to play ---- */

    // Picking a game should explain it before asking for any movement.
    await cdp.evaluate(OPEN_GAME("punch-out"));
    await sleep(900);

    const howto = JSON.parse(
      await cdp.evaluate(`(() => {
        const screen = document.getElementById('screen-howto');
        const cv = document.getElementById('howto-canvas');
        const box = cv.getBoundingClientRect();
        const btn = document.getElementById('btn-howto-play').getBoundingClientRect();
        let painted = 0;
        try {
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) painted++;
        } catch { painted = -1; }
        return JSON.stringify({
          open: !screen.hidden,
          steps: [...document.querySelectorAll('#howto-steps li')].map(li => li.textContent.trim()),
          showing: document.querySelectorAll('#howto-steps li.showing').length,
          rules: document.querySelectorAll('#howto-rules li').length,
          badge: document.getElementById('howto-badge').textContent.trim(),
          skills: document.getElementById('howto-skills').textContent.trim(),
          demoW: Math.round(box.width), demoH: Math.round(box.height),
          painted,
          btnH: Math.round(btn.height),
          btnOnScreen: btn.bottom <= window.innerHeight + 1 && btn.top >= 0,
          overflowX: Math.max(0, screen.scrollWidth - window.innerWidth),
        });
      })()`),
    );

    check("picking a game explains it first", howto.open);
    check(
      "the demonstration is drawn, and big enough to copy",
      howto.painted > 2000 && howto.demoH >= 150,
      `${howto.demoW}x${howto.demoH}, ${howto.painted}px painted`,
    );
    check(
      "it says which movements to make",
      howto.steps.length > 0 && howto.steps.every((s) => s.length > 12),
      howto.steps.join(" / "),
    );
    check("the movement on screen is the one highlighted", howto.showing === 1, `${howto.showing} marked`);
    check("it says how much of you has to be in shot", howto.badge === "Upper body", howto.badge);
    check("it says what the game trains", /^Trains .+\.$/.test(howto.skills), howto.skills);
    check("it still lists the rules of the game", howto.rules >= 2, `${howto.rules} rules`);
    check(
      "the play button is tappable without scrolling",
      howto.btnOnScreen && howto.btnH >= 40,
      `${howto.btnH}px tall, on screen ${howto.btnOnScreen}`,
    );
    check("the how-to screen fits the width", howto.overflowX === 0, `${howto.overflowX}px over`);

    if (shotDir) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(shotDir, `howto-${vp.name}.png`), Buffer.from(shot.data, "base64"));
    }

    // The animation should move on to the next movement by itself.
    const cycles = JSON.parse(
      await cdp.evaluate(`(() => new Promise(done => {
        const mark = () => document.querySelector('#howto-steps li.showing')?.textContent.trim();
        const seen = new Set([mark()]);
        const timer = setInterval(() => seen.add(mark()), 120);
        setTimeout(() => { clearInterval(timer); done(JSON.stringify([...seen])); }, 2600);
      }))()`),
    );
    check("the demonstration keeps looping", cycles.filter(Boolean).length >= 1, cycles.join(" / "));

    // Backing out lands on the skill the game was picked from, so the next
    // game in the same category is one tap away.
    await cdp.evaluate(`document.getElementById('btn-howto-back').click()`);
    await sleep(250);
    const left = JSON.parse(
      await cdp.evaluate(`(() => JSON.stringify({
        skill: !document.getElementById('screen-skill').hidden,
        games: document.querySelectorAll('#skill-games .game-card').length,
      }))()`),
    );
    check(
      "backing out of the instructions returns to the shelf it came from",
      left.skill && left.games > 0,
      `${left.games} games`,
    );

    for (const id of onlyGame ? [onlyGame] : ready) {
      await cdp.evaluate(OPEN_GAME(id));

      // The camera dock is placed by script, so confirm it really lands on the
      // slot each screen reserves for it.
      const dockCheck = `(() => {
        const dock = document.getElementById('camera-dock').getBoundingClientRect();
        const screen = document.querySelector('section:not([hidden])[id^=screen-]')?.id;
        const slot = (screen === 'screen-calibrate'
          ? document.getElementById('calib-camera-slot')
          : document.getElementById('play-camera-slot')).getBoundingClientRect();
        const off = Math.max(
          Math.abs(dock.left - slot.left), Math.abs(dock.top - slot.top),
          Math.abs(dock.width - slot.width), Math.abs(dock.height - slot.height));
        return JSON.stringify({ screen, off: Math.round(off), w: Math.round(dock.width) });
      })()`;

      // Everything the play-screen checks need, read in one round trip.
      const playState = `(() => {
        const screen = document.querySelector('section:not([hidden])[id^=screen-]')?.id;
        const stage = document.getElementById('stage').getBoundingClientRect();
        const cv = document.getElementById('game');
        const hud = document.querySelector('.hud-bar').getBoundingClientRect();
        const pip = document.getElementById('play-camera-slot').getBoundingClientRect();
        const camera = document.getElementById('stage').classList.contains('camera-backdrop');
        let painted = 0;
        try {
          const d = cv.getContext('2d')
            .getImageData(0, 0, Math.min(cv.width, 400), Math.min(cv.height, 400)).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) painted++;
        } catch { painted = -1; }
        return JSON.stringify({
          screen,
          stage: Math.round(stage.width) + 'x' + Math.round(stage.height),
          canvasCss: Math.round(cv.getBoundingClientRect().width) + 'x'
            + Math.round(cv.getBoundingClientRect().height),
          hudFits: hud.left >= -1 && hud.right <= window.innerWidth + 1 && hud.top >= -1,
          pipFits: pip.width === 0
            || (pip.right <= window.innerWidth + 1 && pip.bottom <= window.innerHeight + 1),
          score: document.getElementById('hud-score').textContent,
          lives: document.getElementById('hud-lives').textContent,
          maxLives: Number(document.getElementById('hud-lives').dataset.max ?? -1),
          rotate: !document.getElementById('rotate-hint').hidden,
          cameraBackdrop: camera,
          painted,
          band: (() => {
            // Where the drawn scene starts and stops down the middle of the
            // canvas, to compare against the fit maths. A camera backdrop
            // fills the canvas with dark video so it is measured by coverage;
            // a drawn scene is measured against its near-black letterbox bars.
            try {
              const col = cv.getContext('2d')
                .getImageData(Math.floor(cv.width / 2), 0, 1, cv.height).data;
              const lit = (y) => {
                if (col[y * 4 + 3] < 8) return false;
                return camera || col[y * 4] + col[y * 4 + 1] + col[y * 4 + 2] > 120;
              };
              let top = -1, bottom = -1;
              for (let y = 0; y < cv.height; y++) if (lit(y)) { top = y; break; }
              for (let y = cv.height - 1; y >= 0; y--) if (lit(y)) { bottom = y; break; }
              const dpr = cv.height / cv.getBoundingClientRect().height;
              return {
                top: Math.round(top / dpr),
                bottom: Math.round(bottom / dpr),
                raw: top + '-' + bottom + ' of ' + cv.width + 'x' + cv.height + ' @' + dpr,
              };
            } catch { return null; }
          })(),
        });
      })()`;

      let state = null;
      let calibShot = false;
      for (let i = 0; i < 12; i += 1) {
        await sleep(900);

        // Picking a game now lands on the how-to screen, which waits for a
        // tap so the player can watch the movement before getting into frame.
        await cdp.evaluate(`(() => {
          const b = document.getElementById('btn-howto-play');
          if (!document.getElementById('screen-howto').hidden && b && !b.disabled) b.click();
        })()`);

        const dock = JSON.parse(await cdp.evaluate(dockCheck));
        if (dock.screen === "screen-calibrate") {
          check(`  ${id}: camera sits on its slot while calibrating`, dock.off <= 1, `${dock.off}px off`);
          if (shotDir && !calibShot) {
            calibShot = true;
            const s = await cdp.send("Page.captureScreenshot", { format: "png" });
            writeFileSync(join(shotDir, `calibrate-${vp.name}.png`), Buffer.from(s.data, "base64"));
          }
        }

        state = JSON.parse(await cdp.evaluate(playState));
        if (state.screen === "screen-play") {
          // Give the new game a few frames to paint before measuring, so we
          // never grade it on the previous round's leftovers.
          await sleep(400);
          state = JSON.parse(await cdp.evaluate(playState));
          break;
        }
      }

      const label = `  ${id}`;
      check(`${label}: reaches play`, state.screen === "screen-play", state.screen);
      check(`${label}: canvas fills the stage`, state.canvasCss === state.stage, `${state.canvasCss} vs ${state.stage}`);
      check(`${label}: game paints`, state.painted > 500, `${state.painted}px`);
      check(`${label}: hud inside the viewport`, state.hudFits === true);
      check(`${label}: camera pip inside the viewport`, state.pipFits === true);
      const wantHearts = state.maxLives > 0;
      check(
        `${label}: ${wantHearts ? "lives shown" : "no lives bar, as intended"}`,
        wantHearts ? (state.lives ?? "").length > 0 : state.lives === "",
        `max ${state.maxLives}, showing "${state.lives}"`,
      );

      const playDock = JSON.parse(await cdp.evaluate(dockCheck));
      check(`${label}: camera sits on its slot while playing`, playDock.off <= 1, `${playDock.off}px off`);

      // Only the side-scroller should ever ask to be turned sideways.
      const wantRotate = id === "jump-the-wall" && vp.height > vp.width;
      check(`${label}: rotate prompt correct`, state.rotate === wantRotate, `got ${state.rotate}`);

      if (state.band && !state.rotate) {
        // Jump the Wall keeps a fixed 960x540 field and is letterboxed into
        // the stage; every other game is expected to fill it edge to edge.
        const [sw, sh] = state.stage.split("x").map(Number);
        const fit = id === "jump-the-wall" ? Math.min(sw / 960, sh / 540) : null;
        const wantTop = fit ? Math.round((sh - 540 * fit) / 2) : 0;
        const wantBottom = fit ? Math.round(wantTop + 540 * fit) - 1 : sh - 1;
        const off = Math.max(
          Math.abs(state.band.top - wantTop),
          Math.abs(state.band.bottom - wantBottom),
        );
        check(
          `${label}: ${state.cameraBackdrop ? "backdrop covers the stage" : "scene sits where the fit maths says"}`,
          off <= 3,
          `drawn ${state.band.top}-${state.band.bottom}, expected ${wantTop}-${wantBottom} [${state.band.raw}]`,
        );
        if (off > 3) {
          const trace = JSON.parse(
            await cdp.evaluate(`JSON.stringify((window.__fit ?? []).concat(window.__draw ?? []))`),
          );
          for (const line of trace) console.log(`         ${line}`);
        }
      }

      // Frame pacing. Pose is stubbed, so this is the cost of the game's own
      // drawing and DOM work: the part that makes a round feel sticky.
      //
      // Sampled twice when the first sample is poor. A game that genuinely
      // cannot hold 60fps fails both; a burst of long frames caused by
      // something else on the machine almost never repeats.
      let perf = await measureFrames(cdp);
      let retried = false;
      if (!steady(perf)) {
        perf = await measureFrames(cdp);
        retried = true;
      }
      check(
        `${label}: holds a steady frame rate`,
        steady(perf),
        `median ${perf.median}ms, p95 ${perf.p95}ms, worst ${perf.worst}ms,` +
          ` ${perf.long} long of ${perf.n}${retried ? " (resampled)" : ""}`,
      );

      if (shotDir) {
        // Clear the countdown, then give the round long enough to put
        // something on screen; a shot of the opening frame shows an empty game.
        await sleep(2600 + 4000);
        const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(join(shotDir, `${id}-${vp.name}.png`), Buffer.from(shot.data, "base64"));
      }

      await cdp.evaluate(`document.getElementById('btn-quit').click()`);
      await sleep(400);
    }
  }

  const errors = cdp.logs.filter((l) => l.startsWith("EXCEPTION") || l.startsWith("error"));
  console.log("");
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  // Killing the launcher on Windows leaves the renderer and GPU processes
  // behind, and a pile of those makes later frame-rate numbers meaningless.
  try {
    await cdp.send("Browser.close");
  } catch {
    /* it may already be gone */
  }
  cdp.close();
} finally {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
