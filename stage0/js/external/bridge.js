const CHANNEL = "motionplay.external-control.v1";

export class ExternalGameBridge {
  constructor({ target = window } = {}) {
    this.target = target;
    this.sent = 0;
  }

  send(events, meta = {}) {
    for (const event of events ?? []) {
      this.target.postMessage(
        {
          channel: CHANNEL,
          type: "key",
          key: event.key,
          pressed: Boolean(event.pressed),
          at: performance.now(),
          ...meta,
        },
        "*",
      );
      this.sent += 1;
    }
  }

  release(events, meta = {}) {
    this.send(events, meta);
  }
}

export const EXTERNAL_CONTROL_CHANNEL = CHANNEL;
