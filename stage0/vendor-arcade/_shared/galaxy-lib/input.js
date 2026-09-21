(function () { /* de-moduled */
'use strict';
/**
 * Unified input handling for arcade games.
 * Supports keyboard, touch (virtual D-pad + buttons), and gamepad.
 */

const ACTIONS = [
  'UP', 'DOWN', 'LEFT', 'RIGHT',
  'ACTION1', 'ACTION2', 'ACTION3',
  'PAUSE', 'START',
];

const DEFAULT_KEY_MAP = {
  ArrowUp:    'UP',
  ArrowDown:  'DOWN',
  ArrowLeft:  'LEFT',
  ArrowRight: 'RIGHT',
  KeyW:       'UP',
  KeyS:       'DOWN',
  KeyA:       'LEFT',
  KeyD:       'RIGHT',
  Space:      'ACTION1',
  KeyZ:       'ACTION2',
  KeyX:       'ACTION3',
  Enter:      'START',
  Escape:     'PAUSE',
};

const GAMEPAD_BUTTON_MAP = {
  12: 'UP',      // D-pad up
  13: 'DOWN',    // D-pad down
  14: 'LEFT',    // D-pad left
  15: 'RIGHT',   // D-pad right
  0:  'ACTION1', // A / Cross
  2:  'ACTION2', // X / Square
  1:  'ACTION3', // B / Circle
  9:  'START',   // Start
  8:  'PAUSE',   // Back / Select
};

const STICK_THRESHOLD = 0.4;

const GAME_KEYS = new Set(Object.keys(DEFAULT_KEY_MAP));

class InputManager {
  /**
   * @param {EventTarget} [target=document] — element to listen for keyboard events on
   */
  constructor(target = document) {
    this._target = target;

    // State maps: action -> boolean
    this._held = Object.create(null);
    this._justPressed = Object.create(null);
    this._justReleased = Object.create(null);

    // Previous frame held state (for gamepad edge detection)
    this._prevGamepadHeld = Object.create(null);

    for (const a of ACTIONS) {
      this._held[a] = false;
      this._justPressed[a] = false;
      this._justReleased[a] = false;
      this._prevGamepadHeld[a] = false;
    }

    this._keyMap = { ...DEFAULT_KEY_MAP };
    this._touchContainer = null;
    this._touchIds = new Map(); // touchId -> action

    // Bind handlers so we can remove them later
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);

    this._target.addEventListener('keydown', this._onKeyDown);
    this._target.addEventListener('keyup', this._onKeyUp);
  }

  // ---- Public query API ----

  /** True while the action is held down. */
  isDown(action) {
    return !!this._held[action];
  }

  /** True only on the frame the action was first pressed. */
  isPressed(action) {
    return !!this._justPressed[action];
  }

  /** True only on the frame the action was released. */
  isReleased(action) {
    return !!this._justReleased[action];
  }

  // ---- Frame lifecycle ----

  /**
   * Call at the end of every frame (after game logic).
   * Resets edge-triggered flags and polls gamepads.
   */
  update() {
    // Reset edge triggers from the previous frame
    for (const a of ACTIONS) {
      this._justPressed[a] = false;
      this._justReleased[a] = false;
    }

    // Poll gamepads
    this._pollGamepads();
  }

  // ---- Keyboard ----

  /**
   * Replace or extend the keyboard mapping.
   * @param {Object<string, string>} map  — code -> action  (e.g. { KeyJ: 'ACTION1' })
   * @param {boolean} [merge=true] — if true, merges with existing; if false, replaces entirely
   */
  setKeyMap(map, merge = true) {
    if (merge) {
      Object.assign(this._keyMap, map);
    } else {
      this._keyMap = { ...map };
    }
  }

  /** @private */
  _handleKeyDown(e) {
    const action = this._keyMap[e.code];
    if (!action) return;

    // Prevent scrolling / default browser behaviour for game keys
    e.preventDefault();

    if (!this._held[action]) {
      this._held[action] = true;
      this._justPressed[action] = true;
    }
  }

  /** @private */
  _handleKeyUp(e) {
    const action = this._keyMap[e.code];
    if (!action) return;

    e.preventDefault();

    if (this._held[action]) {
      this._held[action] = false;
      this._justReleased[action] = true;
    }
  }

  // ---- Touch controls ----

  /**
   * Create on-screen D-pad and action buttons inside `container`.
   * @param {HTMLElement} container
   */
  enableTouchControls(container) {
    this._touchContainer = container;

    // D-pad zone (left side) — single touch zone with angle detection
    const dpad = document.createElement('div');
    dpad.className = 'input-dpad';
    dpad.dataset.role = 'dpad';

    // Action buttons (right side)
    const btnGroup = document.createElement('div');
    btnGroup.className = 'input-buttons';

    const makeBtn = (action, label) => {
      const btn = document.createElement('div');
      btn.className = 'input-btn';
      btn.dataset.action = action;
      btn.textContent = label;
      return btn;
    };

    btnGroup.appendChild(makeBtn('ACTION1', 'A'));
    btnGroup.appendChild(makeBtn('ACTION2', 'B'));
    btnGroup.appendChild(makeBtn('ACTION3', 'C'));

    const metaGroup = document.createElement('div');
    metaGroup.className = 'input-meta';
    metaGroup.appendChild(makeBtn('START', 'START'));
    metaGroup.appendChild(makeBtn('PAUSE', 'PAUSE'));

    container.appendChild(dpad);
    container.appendChild(btnGroup);
    container.appendChild(metaGroup);

    // Functional positioning only — appearance left to CSS
    Object.assign(dpad.style, {
      position: 'absolute', left: '0', bottom: '0',
      width: '40%', height: '50%',
      touchAction: 'none',
    });
    Object.assign(btnGroup.style, {
      position: 'absolute', right: '0', bottom: '0',
      width: '40%', height: '50%',
      touchAction: 'none',
    });
    Object.assign(metaGroup.style, {
      position: 'absolute', left: '50%', bottom: '0',
      transform: 'translateX(-50%)',
      touchAction: 'none',
    });

    // Touch handlers
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);

    container.addEventListener('touchstart', this._onTouchStart, { passive: false });
    container.addEventListener('touchmove', this._onTouchMove, { passive: false });
    container.addEventListener('touchend', this._onTouchEnd, { passive: false });
    container.addEventListener('touchcancel', this._onTouchEnd, { passive: false });

    // Auto-show/hide based on touch support
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    dpad.style.display = isTouchDevice ? '' : 'none';
    btnGroup.style.display = isTouchDevice ? '' : 'none';
    metaGroup.style.display = isTouchDevice ? '' : 'none';
  }

  /** @private */
  _handleTouchStart(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      this._processTouch(touch, true);
    }
  }

  /** @private */
  _handleTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      // For d-pad moves, release old directions then press new ones
      const prev = this._touchIds.get(touch.identifier);
      if (prev && prev.startsWith('DPAD:')) {
        this._releaseDpadActions(touch.identifier);
      }
      this._processTouch(touch, true);
    }
  }

  /** @private */
  _handleTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const tag = this._touchIds.get(touch.identifier);
      if (!tag) continue;

      if (tag.startsWith('DPAD:')) {
        this._releaseDpadActions(touch.identifier);
      } else {
        this._releaseAction(tag);
      }
      this._touchIds.delete(touch.identifier);
    }
  }

  /** @private */
  _processTouch(touch, isDown) {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;

    // Check if it's a button
    const btnEl = el.closest('[data-action]');
    if (btnEl) {
      const action = btnEl.dataset.action;
      if (isDown) {
        this._pressAction(action);
        this._touchIds.set(touch.identifier, action);
      }
      return;
    }

    // Check if it's the d-pad zone
    const dpadEl = el.closest('[data-role="dpad"]');
    if (dpadEl && isDown) {
      const rect = dpadEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = touch.clientX - cx;
      const dy = touch.clientY - cy;

      // Dead zone: 15% of zone half-width
      const halfW = rect.width / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < halfW * 0.15) {
        this._touchIds.set(touch.identifier, 'DPAD:NONE');
        return;
      }

      const angle = Math.atan2(dy, dx); // radians, 0 = right

      // 8-way: allow diagonals
      const actions = [];
      // Right: -45 to 45 deg
      if (angle > -Math.PI * 0.375 && angle < Math.PI * 0.375) actions.push('RIGHT');
      // Left: 135 to -135 deg
      if (angle > Math.PI * 0.625 || angle < -Math.PI * 0.625) actions.push('LEFT');
      // Down: 45 to 135 deg
      if (angle > Math.PI * 0.125 && angle < Math.PI * 0.875) actions.push('DOWN');
      // Up: -45 to -135 deg
      if (angle > -Math.PI * 0.875 && angle < -Math.PI * 0.125) actions.push('UP');

      for (const a of actions) this._pressAction(a);
      this._touchIds.set(touch.identifier, 'DPAD:' + actions.join(','));
    }
  }

  /** @private */
  _releaseDpadActions(touchId) {
    const tag = this._touchIds.get(touchId);
    if (!tag || !tag.startsWith('DPAD:')) return;
    const dirs = tag.slice(5); // after "DPAD:"
    if (dirs && dirs !== 'NONE') {
      for (const a of dirs.split(',')) {
        this._releaseAction(a);
      }
    }
  }

  /** @private */
  _pressAction(action) {
    if (!this._held[action]) {
      this._held[action] = true;
      this._justPressed[action] = true;
    }
  }

  /** @private */
  _releaseAction(action) {
    if (this._held[action]) {
      this._held[action] = false;
      this._justReleased[action] = true;
    }
  }

  // ---- Gamepad ----

  /** @private */
  _pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    // Track which actions the gamepad is asserting this frame
    const gpHeld = Object.create(null);
    for (const a of ACTIONS) gpHeld[a] = false;

    for (const gp of gamepads) {
      if (!gp) continue;

      // Buttons
      for (const [idx, action] of Object.entries(GAMEPAD_BUTTON_MAP)) {
        if (gp.buttons[idx] && gp.buttons[idx].pressed) {
          gpHeld[action] = true;
        }
      }

      // Left stick
      if (gp.axes.length >= 2) {
        const lx = gp.axes[0];
        const ly = gp.axes[1];
        if (lx < -STICK_THRESHOLD) gpHeld['LEFT'] = true;
        if (lx > STICK_THRESHOLD) gpHeld['RIGHT'] = true;
        if (ly < -STICK_THRESHOLD) gpHeld['UP'] = true;
        if (ly > STICK_THRESHOLD) gpHeld['DOWN'] = true;
      }
    }

    // Generate press / release edges by comparing to previous frame
    for (const a of ACTIONS) {
      if (gpHeld[a] && !this._prevGamepadHeld[a]) {
        this._pressAction(a);
      } else if (!gpHeld[a] && this._prevGamepadHeld[a]) {
        this._releaseAction(a);
      }
      this._prevGamepadHeld[a] = gpHeld[a];
    }
  }

  // ---- Cleanup ----

  /** Remove all event listeners and touch DOM. */
  destroy() {
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);

    if (this._touchContainer) {
      this._touchContainer.removeEventListener('touchstart', this._onTouchStart);
      this._touchContainer.removeEventListener('touchmove', this._onTouchMove);
      this._touchContainer.removeEventListener('touchend', this._onTouchEnd);
      this._touchContainer.removeEventListener('touchcancel', this._onTouchEnd);

      // Remove generated touch elements
      const dpad = this._touchContainer.querySelector('.input-dpad');
      const btns = this._touchContainer.querySelector('.input-buttons');
      const meta = this._touchContainer.querySelector('.input-meta');
      if (dpad) dpad.remove();
      if (btns) btns.remove();
      if (meta) meta.remove();

      this._touchContainer = null;
    }

    this._touchIds.clear();
  }
}

Object.assign(window, { InputManager });
})();
