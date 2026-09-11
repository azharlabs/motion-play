import { IDX } from "./landmarks.js";

const BONES = [
  [IDX.LEFT_SHOULDER, IDX.RIGHT_SHOULDER],
  [IDX.LEFT_SHOULDER, IDX.LEFT_HIP],
  [IDX.RIGHT_SHOULDER, IDX.RIGHT_HIP],
  [IDX.LEFT_HIP, IDX.RIGHT_HIP],
  [IDX.LEFT_HIP, IDX.LEFT_ANKLE],
  [IDX.RIGHT_HIP, IDX.RIGHT_ANKLE],
  [IDX.LEFT_SHOULDER, IDX.NOSE],
  [IDX.RIGHT_SHOULDER, IDX.NOSE],
];

function guide(ctx, y, w, color, dash, label) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.scale(-1, 1);
  ctx.fillStyle = color;
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, -w + 6, y - 5);
  ctx.restore();
}

export function drawOverlay(ctx, landmarks, debug, show) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!show) return;

  if (debug?.floorY != null) {
    guide(ctx, debug.floorY * h, w, "rgba(34,197,94,0.9)", [], "floor");
  }
  if (debug?.jumpLineY != null) {
    guide(ctx, debug.jumpLineY * h, w, "rgba(56,189,248,0.95)", [10, 6], "jump");
  }
  if (debug?.duckEnterY != null) {
    guide(ctx, debug.duckEnterY * h, w, "rgba(251,191,36,0.95)", [6, 6], "duck");
  }

  if (!landmarks?.length) return;

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  for (const [a, b] of BONES) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }

  for (const p of landmarks) {
    const score = Math.max(p?.visibility ?? 0, p?.presence ?? 0);
    if (!p || score < 0.4) continue;
    ctx.fillStyle = score > 0.7 ? "#34d399" : "#fbbf24";
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
