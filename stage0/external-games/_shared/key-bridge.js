/**
 * Receives MotionPlay external-control messages and synthesizes keyboard events
 * so this same-origin game can be driven from the parent controller iframe.
 */
(function () {
  const CHANNEL = "motionplay.external-control.v1";
  const pressed = new Set();

  const KEY_CODES = {
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Space: 32,
  };

  function dispatchKey(key, down) {
    if (down && pressed.has(key)) return;
    if (!down && !pressed.has(key)) return;
    if (down) pressed.add(key);
    else pressed.delete(key);

    const code = KEY_CODES[key] ?? 0;
    const event = new KeyboardEvent(down ? "keydown" : "keyup", {
      key: key === "Space" ? " " : key,
      code: key,
      bubbles: true,
      cancelable: true,
    });

    try {
      Object.defineProperty(event, "keyCode", { get: () => code });
      Object.defineProperty(event, "which", { get: () => code });
    } catch {
      /* ignore */
    }

    window.dispatchEvent(event);
    document.dispatchEvent(event);
  }

  window.addEventListener("message", (event) => {
    const payload = event.data;
    if (payload?.channel !== CHANNEL || payload?.type !== "key") return;
    if (!payload.key) return;
    dispatchKey(payload.key, Boolean(payload.pressed));
  });

  window.addEventListener("blur", () => {
    for (const key of [...pressed]) dispatchKey(key, false);
  });

  window.__motionPlayKeyBridge = { channel: CHANNEL };
})();
