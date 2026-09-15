import { profileById } from "./profiles.js";

const changed = (a, b) => a !== b;

export class ExternalMotionMapper {
  constructor(profile = "runner", opts = {}) {
    this.profile = profileById(profile);
    this.enterLean = opts.enterLean ?? 0.34;
    this.exitLean = opts.exitLean ?? 0.18;
    this.reset();
  }

  reset() {
    this.side = 0;
    this.wasJump = false;
    this.wasDuck = false;
    this.controls = {};
    this.actions = {};
  }

  count(id) {
    this.actions[id] = (this.actions[id] ?? 0) + 1;
  }

  update(signals = {}) {
    const next = {};
    const lean = Number(signals.lean ?? 0);

    if (this.side === 0) {
      if (lean <= -this.enterLean) {
        this.side = -1;
        this.count("lean");
      } else if (lean >= this.enterLean) {
        this.side = 1;
        this.count("lean");
      }
    } else if (this.side < 0 && lean > -this.exitLean) {
      this.side = 0;
    } else if (this.side > 0 && lean < this.exitLean) {
      this.side = 0;
    }

    next[this.profile.keys.left] = this.side < 0;
    next[this.profile.keys.right] = this.side > 0;

    const jumping = Boolean(signals.jump);
    if (this.profile.keys.jump) {
      next[this.profile.keys.jump] = jumping;
      if (jumping && !this.wasJump) this.count("jump");
    }
    this.wasJump = jumping;

    const ducking = Boolean(signals.ducking || (signals.crouch ?? 0) > 0.55);
    const duckKey = this.profile.keys.duck ?? this.profile.keys.brake;
    if (duckKey) {
      next[duckKey] = ducking;
      if (ducking && !this.wasDuck) this.count("duck");
    }
    this.wasDuck = ducking;

    if (this.profile.autoAccelerate && this.profile.keys.accelerate) {
      next[this.profile.keys.accelerate] = Boolean(signals.inFrame);
    }

    const events = [];
    const all = new Set([...Object.keys(this.controls), ...Object.keys(next)]);
    for (const key of all) {
      const before = Boolean(this.controls[key]);
      const after = Boolean(next[key]);
      if (changed(before, after)) events.push({ key, pressed: after });
    }
    this.controls = next;

    return { events, controls: { ...next }, actions: { ...this.actions } };
  }

  releaseAll() {
    const events = Object.entries(this.controls)
      .filter(([, pressed]) => pressed)
      .map(([key]) => ({ key, pressed: false }));
    this.controls = {};
    this.side = 0;
    return events;
  }
}
