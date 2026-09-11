/**
 * Is this thing actually installable, and does the feedback screen work?
 *
 * The install path is easy to get subtly wrong and impossible to notice from a
 * desktop tab: a manifest that parses but points at an icon that 404s, an
 * apple-touch-icon that was never added, a form whose fields iOS will zoom into
 * because the text is a pixel too small. All of that only shows up on a real
 * phone, by which point the link has already been sent to people.
 *
 *   node tools/pwa-check.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  console.error("No Chrome or Edge found; skipping.");
  process.exit(0);
}

const SERVE_PORT = 5198;
const DEBUG_PORT = 9224;
const profile = join(tmpdir(), `motionplay-pwa-${process.pid}`);

const server = spawn(process.execPath, ["tools/serve.mjs", "--port", String(SERVE_PORT)], {
  stdio: "ignore",
});
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures += 1;
};

async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      return await attach(DEBUG_PORT);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("could not attach to the browser");
}

try {
  const cdp = await connect();
  const base = `http://127.0.0.1:${SERVE_PORT}`;

  // A phone-shaped window, because that is what testers will hold.
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url: `${base}/index.html` });
  await sleep(2500);

  console.log("\nInstalling to a home screen");

  const head = await cdp.evaluate(`(() => {
    const link = (sel) => document.querySelector(sel)?.getAttribute('href') ?? null;
    const meta = (name) => document.querySelector('meta[name="' + name + '"]')?.content ?? null;
    return {
      manifest: link('link[rel="manifest"]'),
      appleIcon: link('link[rel="apple-touch-icon"]'),
      appleCapable: meta('apple-mobile-web-app-capable'),
      appleTitle: meta('apple-mobile-web-app-title'),
      themeColor: meta('theme-color'),
      viewportCover: (meta('viewport') ?? '').includes('viewport-fit=cover'),
    };
  })()`);

  check("the page declares a manifest", head.manifest != null, head.manifest);
  check("iOS is told it can go full screen", head.appleCapable === "yes", head.appleCapable);
  check("iOS has an icon to use", head.appleIcon != null, head.appleIcon);
  check("the home screen name is set", head.appleTitle === "MotionPlay", head.appleTitle);
  check("the notch is accounted for", head.viewportCover);

  const manifest = await cdp.evaluate(`(async () => {
    const res = await fetch('${base}/manifest.webmanifest');
    if (!res.ok) return { error: res.status };
    const m = await res.json();
    // An icon listed but missing is the classic silent failure: the manifest
    // validates, the install offer appears, and the icon is a grey square.
    const icons = [];
    for (const icon of m.icons ?? []) {
      const url = new URL(icon.src, '${base}/').href;
      const head = await fetch(url);
      const blob = head.ok ? await head.blob() : null;
      icons.push({ src: icon.src, ok: head.ok, bytes: blob?.size ?? 0, purpose: icon.purpose });
    }
    return { name: m.name, display: m.display, start: m.start_url, icons };
  })()`);

  check("the manifest parses", !manifest.error, manifest.error ? `HTTP ${manifest.error}` : manifest.name);
  check("it asks to open without browser chrome", manifest.display === "standalone", manifest.display);
  const badIcons = (manifest.icons ?? []).filter((i) => !i.ok || i.bytes < 500);
  check(
    "every icon it lists really exists",
    badIcons.length === 0,
    `${manifest.icons?.length ?? 0} icons, ${badIcons.length} broken`,
  );
  check(
    "there is a maskable icon for Android",
    (manifest.icons ?? []).some((i) => (i.purpose ?? "").includes("maskable")),
  );

  const appleIcon = await cdp.evaluate(
    `fetch('${base}/icons/apple-touch-icon.png').then(async r => r.ok ? (await r.blob()).size : 0)`,
  );
  check("the iOS icon is a real file", appleIcon > 500, `${(appleIcon / 1024).toFixed(1)} kB`);

  /*
   * Asked by computed style rather than by the `hidden` property, because the
   * two disagree in exactly the case worth catching: an author `display` rule
   * beats the browser's own `[hidden] { display: none }`, so an element can
   * report itself hidden while sitting there in full view. That is how an
   * empty install banner - no text, no label, just a bare button and a cross -
   * ended up at the top of the home screen on a desktop browser.
   */
  const banner = await cdp.evaluate(`(() => {
    const b = document.querySelector('.install-banner');
    if (!b) return { drawn: false };
    return {
      drawn: getComputedStyle(b).display !== 'none',
      saysHidden: b.hidden,
      text: b.querySelector('p')?.textContent.trim() ?? '',
      label: b.querySelector('.install-do')?.textContent.trim() ?? '',
    };
  })()`);
  check(
    "the install banner is never shown wordless",
    !banner.drawn || Boolean(banner.text && banner.label),
    banner.drawn ? `showing "${banner.text}" / "${banner.label}"` : "not shown here",
  );
  /*
   * Put a hidden banner on the page and see whether it disappears.
   *
   * Watching the real one is not a test: it is only wordless for the moment
   * between being built and the browser offering an install, so a check that
   * happens to look afterwards passes while the bug is still there. A throwaway
   * copy has no such timing.
   */
  const whenHidden = await cdp.evaluate(`(() => {
    const probe = document.createElement('div');
    probe.className = 'install-banner';
    probe.hidden = true;
    document.body.append(probe);
    const display = getComputedStyle(probe).display;
    probe.remove();
    return display;
  })()`);
  check("and marking it hidden really hides it", whenHidden === "none", `display: ${whenHidden}`);

  console.log("\nSaying how it went");

  const feedback = await cdp.evaluate(`(() => {
    document.getElementById('btn-feedback').click();
    const screen = document.getElementById('screen-feedback');
    const faces = document.querySelectorAll('#fb-rating .rating-face');
    faces[3]?.click();
    document.getElementById('fb-notes').value = 'The left hand was missed on fast jabs.';
    const smallText = [...document.querySelectorAll('#fb-notes, #fb-game')].filter(
      (n) => parseFloat(getComputedStyle(n).fontSize) < 16,
    ).length;
    return {
      open: !screen.hidden,
      homeHidden: document.getElementById('screen-home').hidden,
      faces: faces.length,
      picked: document.querySelectorAll('#fb-rating .picked').length,
      games: document.getElementById('fb-game').options.length,
      diagnostics: document.getElementById('fb-diagnostics').textContent.trim(),
      smallText,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    };
  })()`);

  check("the feedback screen opens", feedback.open && feedback.homeHidden);
  check("there is a rating to give", feedback.faces === 5, `${feedback.faces} faces`);
  check("picking one sticks", feedback.picked === 1, `${feedback.picked} chosen`);
  check("every game can be named", feedback.games === 11, `${feedback.games} options`);
  check(
    "it reports what the phone is",
    /device:/.test(feedback.diagnostics) && /pose:/.test(feedback.diagnostics),
    feedback.diagnostics.split("\n")[0]?.slice(0, 40),
  );
  // Safari zooms the whole page in when a focused field is under 16px, which
  // leaves the tester scrolled sideways and unable to see what they typed.
  check("typing will not zoom the page on iOS", feedback.smallText === 0, `${feedback.smallText} small`);
  check("nothing hangs off the side", feedback.overflow === 0, `${feedback.overflow}px`);

  // Measured per button, not as page overflow: the home screen is its own
  // scrolling box, so a control pushed past the right edge is clipped silently
  // without the document ever reporting that it is wider than the window.
  const reachable = await cdp.evaluate(`(() => {
    document.getElementById('btn-feedback-back').click();
    const out = [];
    for (const b of document.querySelectorAll('#screen-home .home-head button')) {
      const r = b.getBoundingClientRect();
      if (r.left < 0 || r.right > window.innerWidth + 0.5) {
        out.push((b.getAttribute('aria-label') ?? '?') + ' at ' + Math.round(r.right));
      }
    }
    return { out, width: window.innerWidth };
  })()`);
  check(
    "every button on the home screen is on the screen",
    reachable.out.length === 0,
    reachable.out.join(", ") || `all within ${reachable.width}px`,
  );

  // Unconfigured, the only thing offered must be the one that works.
  const destination = await cdp.evaluate(`(async () => {
    const { canSend } = await import('/js/feedback-form.js');
    const send = document.getElementById('btn-fb-send');
    return {
      configured: canSend(),
      // Computed, for the same reason as the banner above.
      sendShown: getComputedStyle(send).display !== 'none',
      copyLabel: document.getElementById('btn-fb-copy').textContent,
    };
  })()`);
  check(
    "there is no dead Send button when nothing is set up",
    destination.configured === destination.sendShown,
    destination.configured ? "a destination is configured" : `copy only: "${destination.copyLabel}"`,
  );

  const copied = await cdp.evaluate(`(() => {
    document.getElementById('btn-fb-copy').click();
    return new Promise((r) => setTimeout(() => r(document.getElementById('fb-status').textContent), 400));
  })()`);
  check("a report can be copied out", copied.length > 0, copied);

  const back = await cdp.evaluate(`(() => {
    document.getElementById('btn-feedback-back').click();
    return { home: !document.getElementById('screen-home').hidden };
  })()`);
  check("back returns to the arcade", back.home);

  console.log("\nWhat an iPhone sees");

  /*
   * iOS never fires an install prompt and offers no way to ask for one, so the
   * only thing that gets this game onto an iPhone home screen is the written
   * hint. It is also the one piece that cannot be checked from a desktop tab,
   * because it is the branch that only runs for Safari on an iPhone.
   */
  await cdp.send("Emulation.setUserAgentOverride", {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });
  await cdp.send("Page.navigate", { url: `${base}/index.html` });
  await sleep(2000);

  const ios = await cdp.evaluate(`(() => {
    const banner = document.querySelector('.install-banner');
    if (!banner || getComputedStyle(banner).display === 'none') return { shown: false };
    const before = banner.querySelector('p').textContent;
    const action = banner.querySelector('.install-do');
    action.click();
    return {
      shown: true,
      before,
      after: banner.querySelector('p').textContent,
      // Once it has answered its own question there is nothing left to ask.
      askGone: getComputedStyle(action).display === 'none',
      coversCards: banner.getBoundingClientRect().bottom > window.innerHeight,
    };
  })()`);

  check("an iPhone is told how to install it", ios.shown, ios.before);
  check(
    "and asking says which button to press",
    /Share/.test(ios.after ?? "") && /Add to Home Screen/.test(ios.after ?? ""),
    ios.after,
  );
  check("the How button goes away once answered", ios.askGone === true);
  check("the hint does not push the games off screen", ios.coversCards === false);

  if (process.argv.includes("--shots")) {
    mkdirSync("out", { recursive: true });
    const shoot = async (name) => {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join("out", `${name}.png`), Buffer.from(data, "base64"));
      console.log(`  shot out/${name}.png`);
    };
    await shoot("pwa-home");
    await cdp.evaluate(`document.getElementById('btn-feedback').click()`);
    await sleep(400);
    await shoot("pwa-feedback");
  }

  console.log("\nWorking with no signal");

  /*
   * The offline cache is the one piece that never runs during development - it
   * is skipped on localhost on purpose, so that a half-cached set of modules
   * cannot produce the baffling import errors the dev server's `no-store` was
   * added to prevent. That leaves it completely unexercised until it is live,
   * where a bad worker is worse than no worker: it installs itself in front of
   * the site on every tester's phone and keeps serving whatever it cached.
   * So it is registered by hand here and made to prove itself.
   */
  const registered = await cdp.evaluate(`(async () => {
    const reg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    // Give the install step a moment to finish filling the cache.
    await new Promise((r) => setTimeout(r, 800));
    const names = await caches.keys();
    const shell = await caches.open(names.find((n) => n.includes('shell')) ?? 'none');
    const held = await shell.keys();
    return { scope: reg.scope, names, cached: held.length };
  })()`);

  check("the offline cache installs", registered.names.length > 0, registered.names.join(", "));
  check("and puts the app in it", registered.cached >= 4, `${registered.cached} files`);

  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await cdp.send("Page.reload");
  await sleep(2500);

  // Games hang off the skill screens now, so open one to prove the arcade came
  // back whole and not just as a home screen.
  const offline = await cdp.evaluate(`(() => {
    const skills = document.querySelectorAll('#skill-grid .skill-card');
    skills[0]?.click();
    const games = document.querySelectorAll('#skill-games .game-card').length;
    document.getElementById('btn-skill-back').click();
    return {
      title: document.title,
      skills: skills.length,
      games,
      home: !document.getElementById('screen-home').hidden,
    };
  })()`);

  check(
    "the arcade still opens with no network",
    offline.home && offline.skills === 9 && offline.games > 0,
    `${offline.skills} skills, ${offline.games} games behind the first`,
  );

  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await cdp.evaluate(
    `navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))`,
  );

  const errors = cdp.logs.filter((l) => /EXCEPTION|error:/i.test(l));
  check("no page errors", errors.length === 0, errors[0] ?? "");

  cdp.close();
} finally {
  chrome.kill();
  server.kill();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
