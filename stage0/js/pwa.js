/**
 * Getting the game onto a home screen, and keeping it up to date.
 *
 * Someone sent this link by a friend arrives in a browser tab, which is the
 * worst place to play it: the address bar eats the top of the screen, it slides
 * away mid-round and resizes the stage under the player, and the next time they
 * want a go they have to find the message again. Installed, it is a normal icon
 * that opens full screen.
 *
 * Android will offer that itself, given a prompt to hang the offer on. iOS
 * never offers it and has no API to ask, so the only thing that works there is
 * telling people which button to press.
 */

const DISMISSED = "motionplay.install.dismissed";

/** Already installed: opened from the home screen rather than a browser tab. */
export function isInstalled() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari's own flag, which predates the standard media query.
    window.navigator.standalone === true
  );
}

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // An iPad on recent iOS reports itself as a Mac, and is told apart by the
  // fact that Macs do not have touch screens.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Register the offline cache.
 *
 * Deliberately not during local development. The dev server sends `no-store`
 * on everything because a half-cached set of ES modules produces baffling
 * "does not provide an export named X" errors, and a service worker sitting in
 * front of it would put that trap straight back.
 */
export function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Offline cache unavailable:", err.message);
    });
  });
}

/**
 * Show a way to install, if there is one worth showing.
 *
 * `host` is the element the banner is added to.
 */
export function offerInstall(host) {
  if (!host || isInstalled() || localStorage.getItem(DISMISSED) === "yes") return;

  let prompt = null;

  const banner = document.createElement("div");
  banner.className = "install-banner";
  banner.hidden = true;

  const text = document.createElement("p");
  const action = document.createElement("button");
  action.type = "button";
  action.className = "install-do";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "install-close";
  close.setAttribute("aria-label", "Not now");
  close.textContent = "✕";
  close.addEventListener("click", () => {
    localStorage.setItem(DISMISSED, "yes");
    banner.remove();
  });

  banner.append(text, action, close);
  host.prepend(banner);

  if (isIOS()) {
    // No prompt to offer, so describe the two taps instead. The share glyph is
    // spelled out because the icon does not render on non-Apple devices.
    text.innerHTML = "Add MotionPlay to your home screen so it opens full screen.";
    action.textContent = "How?";
    action.addEventListener("click", () => {
      text.textContent = "Tap the Share button in Safari, then “Add to Home Screen”.";
      action.hidden = true;
    });
    banner.hidden = false;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    // Holding onto the event is what lets us put the offer somewhere sensible
    // rather than wherever the browser would have put it.
    event.preventDefault();
    prompt = event;
    text.textContent = "Install MotionPlay so it opens full screen.";
    action.textContent = "Install";
    banner.hidden = false;
  });

  action.addEventListener("click", async () => {
    if (!prompt) return;
    banner.hidden = true;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    prompt = null;
    if (outcome === "accepted") banner.remove();
    else banner.hidden = false;
  });

  window.addEventListener("appinstalled", () => banner.remove());
}
