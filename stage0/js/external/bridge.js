const CHANNEL = "motionplay.external-control.v1";

export class ExternalGameBridge {
  /**
   * @param {{ target?: Window, targets?: Window[] }} [opts]
   * Sends control messages to one or more windows (parent broadcast and/or
   * same-origin game iframe). Extension relay still listens on the controller
   * page window when that target is included.
   */
  constructor(opts = {}) {
    if (opts.targets?.length) {
      this.targets = [...opts.targets];
    } else if (opts.target) {
      this.targets = [opts.target];
    } else {
      this.targets = [globalThis];
    }
    this.sent = 0;
  }

  setTargets(targets = []) {
    this.targets = targets.filter(Boolean);
  }

  send(events, meta = {}) {
    for (const event of events ?? []) {
      const message = {
        channel: CHANNEL,
        type: "key",
        key: event.key,
        pressed: Boolean(event.pressed),
        at: typeof performance !== "undefined" ? performance.now() : Date.now(),
        ...meta,
      };
      for (const target of this.targets) {
        try {
          target.postMessage(message, "*");
        } catch {
          // Detached iframe / closed window — ignore.
        }
      }
      this.sent += 1;
    }
  }

  release(events, meta = {}) {
    this.send(events, meta);
  }
}

export const EXTERNAL_CONTROL_CHANNEL = CHANNEL;
