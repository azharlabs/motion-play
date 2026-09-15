/**
 * Ask for a frame shaped like the screen. On a phone held upright a landscape
 * stream would have to be cropped hard to fill the display, which throws away
 * exactly the head-to-feet framing these games depend on.
 */
export function preferredConstraints() {
  const portrait = window.innerHeight >= window.innerWidth;
  const long = { ideal: 640, max: 960 };
  const short = { ideal: 480, max: 720 };
  return {
    audio: false,
    video: {
      facingMode: "user",
      width: portrait ? short : long,
      height: portrait ? long : short,
      /*
       * Ask for 60 even though pose detection cannot keep up with it.
       * The point is not the extra frames, it is the shorter exposure that
       * comes with them: at 30fps a phone indoors will happily expose for a
       * thirtieth of a second, and a hand thrown at a punch pad smears across
       * the frame badly enough that the model cannot find it. A sharper frame
       * is worth more here than a faster one, and the detector simply takes
       * the most recent frame whenever it is ready for another.
       */
      frameRate: { ideal: 60 },
    },
  };
}

export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not available in this browser");
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(preferredConstraints());
  } catch (err) {
    // Some cameras reject the aspect hint outright; any usable frame will do.
    if (err?.name === "OverconstrainedError") {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    } else if (err?.name === "NotFoundError" || /Requested device not found/i.test(err?.message || "")) {
      throw new Error("Requested device not found (no camera). Tap / keys still work.");
    } else {
      throw err;
    }
  }

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}
