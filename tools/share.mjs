/**
 * Put the game on the internet for as long as this stays running.
 *
 * A phone will not open its camera for a page served over plain http unless
 * that page is localhost, so testing on a real device needs a real HTTPS
 * address - there is no way around it on a home network. This opens a throwaway
 * Cloudflare tunnel to the local server and prints the address, which is enough
 * to try it on your own phone and to hand to someone else for an afternoon.
 *
 * It is not hosting. The address dies with this process and the traffic runs
 * through this machine. For anything longer lived, deploy the `stage0` folder
 * to a static host - see the README.
 *
 *   npm run share
 */
import { spawn } from "node:child_process";

const PORT = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 5173);

const server = spawn(process.execPath, ["tools/serve.mjs", "--port", String(PORT)], {
  stdio: "ignore",
});

console.log(`Serving stage0 on http://127.0.0.1:${PORT}`);
console.log("Opening a public HTTPS address (the first run downloads cloudflared)…\n");

/*
 * `npx --yes` so an unattended first run does not stop on a confirmation, and
 * the system certificate store because a machine behind a company proxy has a
 * root certificate Windows trusts and Node, with its own built-in list, does
 * not - which shows up as `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` and nothing
 * downloading at all.
 */
const tunnel = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--yes", "cloudflared", "tunnel", "--url", `http://127.0.0.1:${PORT}`],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --use-system-ca`.trim(),
    },
  },
);

let announced = false;

/** cloudflared prints the address once, in a box, on stderr. */
function watch(chunk) {
  const text = chunk.toString();
  const found = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (found && !announced) {
    announced = true;
    const url = found[0];
    console.log("─".repeat(58));
    console.log("  Open this on your phone:\n");
    console.log(`    ${url}`);
    console.log("\n  Allow the camera when it asks. On an iPhone, tap Share");
    console.log("  then 'Add to Home Screen' to play it full screen.");
    console.log("\n  Anyone with this address can play while this is running.");
    console.log("  Press Ctrl+C to take it down.");
    console.log("─".repeat(58));
  }
  // Anything that is not the banner is only worth showing if it went wrong.
  if (/ERR|error|failed/i.test(text) && !found) process.stderr.write(text);
}

tunnel.stdout.on("data", watch);
tunnel.stderr.on("data", watch);

tunnel.on("exit", (code) => {
  if (!announced) {
    console.error(`\ncloudflared stopped (code ${code}).`);
    console.error("Another way: npx --yes localtunnel --port " + PORT);
  }
  server.kill();
  process.exit(code ?? 0);
});

const stop = () => {
  tunnel.kill();
  server.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
