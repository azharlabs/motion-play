/**
 * Getting the camera picture and the pose to agree about where things are.
 *
 * Pose coordinates run 0 to 1 across the whole camera frame. A camera-backdrop
 * game shows that frame cropped to fill the screen, because a 3:4 frame letter-
 * boxed onto a tall phone would waste most of the display. The two spaces then
 * only agree down the middle, and disagree more the further out you reach —
 * which is exactly where a punch or a slice ends up.
 *
 * On a 390x844 phone showing a 480x640 frame that is a fifth of the screen at
 * the edges: a hand the player can see on a pad is measured well to one side of
 * it, so the game says miss. Everything here exists so the drawing and the
 * hit-testing are worked out from one set of numbers instead of two.
 */

/**
 * Where a frame of `videoW` x `videoH` lands when scaled to cover `w` x `h`.
 * The box returned is in view pixels and is usually bigger than the view, with
 * the overflow split evenly off both sides — that overflow is the crop.
 */
export function coverBox(videoW, videoH, w, h) {
  if (!(videoW > 0) || !(videoH > 0)) return { left: 0, top: 0, width: w, height: h };
  const scale = Math.max(w / videoW, h / videoH);
  const width = videoW * scale;
  const height = videoH * scale;
  return { left: (w - width) / 2, top: (h - height) / 2, width, height };
}

/**
 * Turn pose coordinates into view pixels.
 *
 * Without a camera behind the game there is nothing to line up with, so the
 * frame is simply stretched over the view and the player gets their whole
 * range of movement to play with.
 */
export function poseMapping(w, h, { videoW = 0, videoH = 0, cropped = false } = {}) {
  if (!cropped || !(videoW > 0) || !(videoH > 0)) {
    return { poseX: (n) => n * w, poseY: (n) => n * h };
  }
  const box = coverBox(videoW, videoH, w, h);
  return {
    poseX: (n) => box.left + n * box.width,
    poseY: (n) => box.top + n * box.height,
  };
}
