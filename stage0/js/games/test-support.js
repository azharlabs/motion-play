/** Builders for the motion signals the games consume, used by the game tests. */
import { poseMapping } from "../framing.js";

/**
 * A plain view with no camera behind it, so pose coordinates stretch across it.
 * Games that hit-test against the camera picture are also exercised through
 * `croppedView` below, which is where the two spaces come apart.
 */
export const VIEW = { w: 400, h: 700, ...poseMapping(400, 700) };

/**
 * A view showing a camera frame cropped to fill, as the camera-backdrop games
 * really get. Pose coordinates and screen pixels disagree here by design.
 */
export const croppedView = (w = 390, h = 844, videoW = 480, videoH = 640) => ({
  w,
  h,
  ...poseMapping(w, h, { videoW, videoH, cropped: true }),
});

export const hand = (x, y, speed = 0) => ({ x, y, vx: 0, vy: 0, speed, visible: true });

export const noHand = { x: null, y: null, vx: 0, vy: 0, speed: 0, visible: false };

export function signals(over = {}) {
  return {
    inFrame: true,
    calibrated: true,
    lean: 0,
    crouch: 0,
    lift: 0,
    hands: { left: noHand, right: noHand, ...(over.hands ?? {}) },
    shoulder: { x: 0.5, y: 0.35, width: 0.2 },
    scale: 0.2,
    ...over,
  };
}

/**
 * A stand-in for the feedback object that records what a game asked to play,
 * so a test can prove a hit is audible without a browser.
 */
export function fxSpy() {
  const cues = [];
  return {
    cues,
    cue(name) {
      cues.push(name);
      return true;
    },
    /** Did the game ever ask for this sound? */
    played: (name) => cues.includes(name),
  };
}

/** Run a game forward holding one set of signals steady. */
export function run(game, s, { ms = 1000, step = 33, from = 0, view = VIEW } = {}) {
  let now = from;
  let last = null;
  for (let t = 0; t < ms; t += step) {
    now += step;
    last = game.tick(step / 1000, s, now, view);
  }
  return { last, now };
}
