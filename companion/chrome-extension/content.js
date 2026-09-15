const CHANNEL = "motionplay.external-control.v1";
const pressed = new Set();

const KEY_CODES = {
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Space: 32,
  KeyA: 65,
  KeyD: 68,
  KeyW: 87,
  KeyS: 83,
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

  // Older games often read keyCode/which. Modern KeyboardEvent constructors do
  // not reliably populate them, so expose compatibility getters.
  try {
    Object.defineProperty(event, "keyCode", { get: () => code });
    Object.defineProperty(event, "which", { get: () => code });
  } catch {
    // Some engines only use key/code and do not need the legacy fields.
  }

  document.dispatchEvent(event);
}

window.addEventListener("message", (event) => {
  const payload = event.data;
  if (event.source !== window || payload?.channel !== CHANNEL || payload?.type !== "key") return;
  chrome.runtime.sendMessage({ type: "MOTIONPLAY_CONTROL", payload });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "MOTIONPLAY_APPLY_CONTROL") return;
  const payload = message.payload;
  if (!payload?.key) return;
  dispatchKey(payload.key, Boolean(payload.pressed));
});

window.addEventListener("blur", () => {
  for (const key of [...pressed]) dispatchKey(key, false);
});
