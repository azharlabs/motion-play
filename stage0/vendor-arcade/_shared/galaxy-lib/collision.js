(function () { /* de-moduled */
'use strict';
/**
 * 2D collision detection — pure functions, no allocations on miss.
 * All spatial params use top-left origin (x, y) with positive-right, positive-down axes.
 */

/**
 * AABB vs AABB overlap test.
 * @param {{x:number,y:number,w:number,h:number}} a
 * @param {{x:number,y:number,w:number,h:number}} b
 * @returns {{hit:true, overlapX:number, overlapY:number}|null}
 */
function rectVsRect(a, b) {
  const dx = (a.x + a.w * 0.5) - (b.x + b.w * 0.5);
  const halfW = (a.w + b.w) * 0.5;
  const ox = halfW - (dx < 0 ? -dx : dx);
  if (ox <= 0) return null;

  const dy = (a.y + a.h * 0.5) - (b.y + b.h * 0.5);
  const halfH = (a.h + b.h) * 0.5;
  const oy = halfH - (dy < 0 ? -dy : dy);
  if (oy <= 0) return null;

  return {
    hit: true,
    overlapX: dx < 0 ? -ox : ox,
    overlapY: dy < 0 ? -oy : oy,
  };
}

/**
 * Circle vs Circle overlap test.
 * @param {{x:number,y:number,r:number}} a
 * @param {{x:number,y:number,r:number}} b
 * @returns {{hit:true, overlapX:number, overlapY:number, dist:number}|null}
 */
function circleVsCircle(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distSq = dx * dx + dy * dy;
  const radii = a.r + b.r;
  if (distSq >= radii * radii) return null;

  const dist = Math.sqrt(distSq);
  if (dist === 0) {
    // Coincident centres — push along arbitrary axis
    return { hit: true, overlapX: radii, overlapY: 0, dist: 0 };
  }
  const overlap = radii - dist;
  const invDist = 1 / dist;
  return {
    hit: true,
    overlapX: dx * invDist * overlap,
    overlapY: dy * invDist * overlap,
    dist,
  };
}

/**
 * Point-in-AABB test.
 * @param {number} px
 * @param {number} py
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {boolean}
 */
function pointInRect(px, py, rect) {
  return px >= rect.x && px < rect.x + rect.w &&
         py >= rect.y && py < rect.y + rect.h;
}

/**
 * Point-in-circle test.
 * @param {number} px
 * @param {number} py
 * @param {{x:number,y:number,r:number}} circle
 * @returns {boolean}
 */
function pointInCircle(px, py, circle) {
  const dx = px - circle.x;
  const dy = py - circle.y;
  return dx * dx + dy * dy < circle.r * circle.r;
}

/**
 * Circle vs AABB overlap test.
 * Finds the closest point on the rect to the circle centre and tests distance.
 * @param {{x:number,y:number,r:number}} circle
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {{hit:true, overlapX:number, overlapY:number, contactX:number, contactY:number}|null}
 */
function circleVsRect(circle, rect) {
  // Clamp circle centre to rect to find nearest point
  const rx2 = rect.x + rect.w;
  const ry2 = rect.y + rect.h;
  const cx = circle.x < rect.x ? rect.x : circle.x > rx2 ? rx2 : circle.x;
  const cy = circle.y < rect.y ? rect.y : circle.y > ry2 ? ry2 : circle.y;

  const dx = circle.x - cx;
  const dy = circle.y - cy;
  const distSq = dx * dx + dy * dy;
  const rSq = circle.r * circle.r;

  if (distSq >= rSq) return null;

  // Circle centre is inside rect
  if (distSq === 0) {
    // Push out along the shortest axis
    const midX = rect.x + rect.w * 0.5;
    const midY = rect.y + rect.h * 0.5;
    const pdx = circle.x - midX;
    const pdy = circle.y - midY;
    const halfW = rect.w * 0.5;
    const halfH = rect.h * 0.5;
    const ox = halfW - (pdx < 0 ? -pdx : pdx) + circle.r;
    const oy = halfH - (pdy < 0 ? -pdy : pdy) + circle.r;

    if (ox < oy) {
      const sx = pdx < 0 ? -1 : 1;
      return { hit: true, overlapX: ox * sx, overlapY: 0, contactX: rect.x + (sx < 0 ? 0 : rect.w), contactY: circle.y };
    }
    const sy = pdy < 0 ? -1 : 1;
    return { hit: true, overlapX: 0, overlapY: oy * sy, contactX: circle.x, contactY: rect.y + (sy < 0 ? 0 : rect.h) };
  }

  const dist = Math.sqrt(distSq);
  const overlap = circle.r - dist;
  const invDist = 1 / dist;
  return {
    hit: true,
    overlapX: dx * invDist * overlap,
    overlapY: dy * invDist * overlap,
    contactX: cx,
    contactY: cy,
  };
}

/**
 * Segment vs AABB using the slab method.
 * Returns the first intersection along the ray from (x1,y1) to (x2,y2) where 0 <= t <= 1.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {{hit:true, contactX:number, contactY:number, normalX:number, normalY:number, t:number}|null}
 */
function lineVsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  let tmin = 0;
  let tmax = 1;
  let normalX = 0;
  let normalY = 0;

  // X slab
  if (dx !== 0) {
    const invDx = 1 / dx;
    let t0 = (rect.x - x1) * invDx;
    let t1 = (rect.x + rect.w - x1) * invDx;
    let nx = -1;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; nx = 1; }
    if (t0 > tmin) { tmin = t0; normalX = nx; normalY = 0; }
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return null;
  } else {
    if (x1 < rect.x || x1 > rect.x + rect.w) return null;
  }

  // Y slab
  if (dy !== 0) {
    const invDy = 1 / dy;
    let t0 = (rect.y - y1) * invDy;
    let t1 = (rect.y + rect.h - y1) * invDy;
    let ny = -1;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; ny = 1; }
    if (t0 > tmin) { tmin = t0; normalX = 0; normalY = ny; }
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return null;
  } else {
    if (y1 < rect.y || y1 > rect.y + rect.h) return null;
  }

  return {
    hit: true,
    contactX: x1 + dx * tmin,
    contactY: y1 + dy * tmin,
    normalX,
    normalY,
    t: tmin,
  };
}

/**
 * Line segment intersection.
 * Segments: (x1,y1)-(x2,y2) and (x3,y3)-(x4,y4).
 * @returns {{x:number, y:number, t:number, u:number}|null}
 */
function lineVsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const dx1 = x2 - x1;
  const dy1 = y2 - y1;
  const dx2 = x4 - x3;
  const dy2 = y4 - y3;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (denom === 0) return null; // parallel or collinear

  const invDenom = 1 / denom;
  const t = ((x3 - x1) * dy2 - (y3 - y1) * dx2) * invDenom;
  const u = ((x3 - x1) * dy1 - (y3 - y1) * dx1) * invDenom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return {
    x: x1 + dx1 * t,
    y: y1 + dy1 * t,
    t,
    u,
  };
}

/**
 * Broad-phase distance check — squared distance vs squared range, no sqrt.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {number} range
 * @returns {boolean}
 */
function withinRange(a, b, range) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= range * range;
}

Object.assign(window, { rectVsRect, circleVsCircle, pointInRect, pointInCircle, circleVsRect, lineVsRect, lineVsLine, withinRange });
})();
