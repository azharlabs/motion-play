/**
 * Receives MotionPlay external-control messages and synthesizes keyboard events
 * so this same-origin game can be driven from the parent controller iframe.
 *
 * Also handles session control (stop/pause): releases every injected key and
 * notifies the embed via `mp-control` + optional `__motionPlayOnControl`.
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

  function releaseAll() {
    for (const key of [...pressed]) dispatchKey(key, false);
  }

  function notifyControl(payload) {
    try {
      window.dispatchEvent(new CustomEvent("mp-control", { detail: payload }));
    } catch {
      /* ignore */
    }
    if (typeof window.__motionPlayOnControl === "function") {
      try {
        window.__motionPlayOnControl(payload);
      } catch {
        /* ignore */
      }
    }
  }

  window.addEventListener("message", (event) => {
    const payload = event.data;
    if (payload?.channel !== CHANNEL) return;

    if (payload.type === "key") {
      if (!payload.key) return;
      dispatchKey(payload.key, Boolean(payload.pressed));
      return;
    }

    if (payload.type === "control") {
      const action = payload.action;
      if (action === "stop" || action === "pause") {
        releaseAll();
        notifyControl(payload);
      } else if (action === "resume") {
        notifyControl(payload);
      }
    }
  });

  window.addEventListener("blur", () => {
    releaseAll();
  });

  window.__motionPlayKeyBridge = {
    channel: CHANNEL,
    releaseAll,
  };
})();
