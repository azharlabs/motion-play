import { profileById } from "./profiles.js";

const changed = (a, b) => a !== b;

function handSnapshot(hand) {
  if (!hand) return { visible: false };
  return {
    visible: Boolean(hand.visible),
    x: hand.x ?? null,
    y: hand.y ?? null,
    z: hand.z ?? null,
  };
}

function raiseFromHands(signals = {}) {
  const hands = [signals.hands?.left, signals.hands?.right].filter((h) => h?.visible && h.y != null);
  if (!hands.length) return null;
  const avgY = hands.reduce((s, h) => s + h.y, 0) / hands.length;
  // MediaPipe y grows downward; high hands => low y => high raise 0..1
  return Math.max(0, Math.min(1, 1 - avgY));
}

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

    if (this.profile.keys.left) next[this.profile.keys.left] = this.side < 0;
    if (this.profile.keys.right) next[this.profile.keys.right] = this.side > 0;

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

    // Raise profile: map arm height to up/down keys continuously via thresholds
    const raise = raiseFromHands(signals);
    if (this.profile.id === "raise" && raise != null) {
      next.ArrowUp = raise > 0.62;
      next.ArrowDown = raise < 0.38;
    }

    const events = [];
    const all = new Set([...Object.keys(this.controls), ...Object.keys(next)]);
    for (const key of all) {
      const before = Boolean(this.controls[key]);
      const after = Boolean(next[key]);
      if (changed(before, after)) events.push({ key, pressed: after });
    }
    this.controls = next;

    const pose = {
      inFrame: Boolean(signals.inFrame),
      lean,
      jump: jumping,
      ducking,
      crouch: Number(signals.crouch ?? 0),
      raise: raise ?? 0.5,
      hands: {
        left: handSnapshot(signals.hands?.left),
        right: handSnapshot(signals.hands?.right),
      },
    };

    return { events, controls: { ...next }, actions: { ...this.actions }, pose };
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
