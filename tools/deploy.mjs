/**
 * Put the game somewhere it will stay.
 *
 * `npm run share` is fine for showing someone across the room, but the address
 * dies with the process and every request goes through this machine. To hand
 * the game to a dozen people and collect what they think over a week, it needs
 * to live on a host - and since it is plain static files with no build step,
 * that is only an upload.
 *
 * This uses Cloudflare Pages, which is free, needs no card, and serves over
 * HTTPS - which is not optional here, because no phone will open its camera
 * for a page that is not secure. The first run opens a browser to log in.
 *
 *   npm run deploy
 */
import { spawn } from "node:child_process";

const PROJECT = "motionplay";

console.log(`Deploying stage0/ to Cloudflare Pages as "${PROJECT}".`);
console.log("The first run opens a browser window to log in.\n");

/*
 * The system certificate store, because a machine behind a company proxy has a
 * root certificate Windows trusts and Node, with its own list, does not; the
 * symptom is UNABLE_TO_GET_ISSUER_CERT_LOCALLY and nothing installing.
 */
const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--yes", "wrangler", "pages", "deploy", "stage0", "--project-name", PROJECT],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --use-system-ca`.trim(),
    },
  },
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log("\nDone. Send that address to your testers.");
    console.log("On an iPhone: open it in Safari, tap Share, then 'Add to Home Screen'.");
  }
  process.exit(code ?? 0);
});
