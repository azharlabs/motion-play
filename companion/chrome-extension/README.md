# MotionPlay Game Relay

This Chrome/Edge extension lets the MotionPlay web pose engine control a separate browser game tab.

## Why it exists

The primary sticky path embeds a same-origin Lane Runner iframe in `controller.html` and does **not** need this extension. Use the extension when you want MotionPlay to drive a *different* browser tab.


A normal web page cannot safely send keyboard events into an unrelated browser tab. The relay extension bridges that browser boundary: MotionPlay detects the body movement, the extension forwards the resulting control state, and the armed game tab receives ordinary keyboard-style events.

## Install for development

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on Developer mode.
3. Choose **Load unpacked**.
4. Select `companion/chrome-extension/`.

## Use

1. Open the web game you want to control.
2. Click the MotionPlay Game Relay extension icon on that game tab. The badge shows `ON`.
3. Open `stage0/controller.html` from the MotionPlay deployment.
4. Choose a control profile.
5. Start motion control and calibrate.
6. Return focus to the game tab if the game requires it.

### Runner profile

- lean left -> ArrowLeft
- lean right -> ArrowRight
- physical jump -> ArrowUp
- crouch -> ArrowDown

This is intended for endless-runner controls such as Subway Surfers-style browser games.

### Racer profile

- lean left/right -> steering
- player visible -> ArrowUp held for acceleration
- crouch -> ArrowDown brake

A good open-source reference target is `jakesgordon/javascript-racer`, which is MIT licensed and uses arrow/WASD controls.

## Compatibility

The relay works best with HTML/JavaScript games that listen for browser keyboard events. Games that explicitly reject synthetic events, protected browser pages, native desktop games, or some deeply sandboxed/cross-origin game frames may need the future native virtual-gamepad bridge instead.

The extension intentionally has broad host access because it must inject the relay into whichever game tab the user chooses. For a packaged release, narrow this permission to a reviewed allowlist of supported games.
