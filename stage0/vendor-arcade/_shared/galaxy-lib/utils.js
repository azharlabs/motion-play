(function () { /* de-moduled */
'use strict';
// ── Vector Math ──────────────────────────────────────────────

/** @returns {{x: number, y: number}} */
const vec2 = (x = 0, y = 0) => ({ x, y });

/** @returns {{x: number, y: number}} */
const vec2Add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

/** @returns {{x: number, y: number}} */
const vec2Sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

/** @returns {{x: number, y: number}} */
const vec2Scale = (v, s) => ({ x: v.x * s, y: v.y * s });

/** @returns {number} */
const vec2Length = (v) => Math.hypot(v.x, v.y);

/** @returns {{x: number, y: number}} Unit vector, or zero if length is 0. */
const vec2Normalize = (v) => {
  const len = vec2Length(v);
  return len === 0 ? vec2() : { x: v.x / len, y: v.y / len };
};

/** @returns {number} */
const vec2Dot = (a, b) => a.x * b.x + a.y * b.y;

/** @returns {number} Distance between two points. */
const vec2Dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** @returns {number} Angle in radians from origin toward v. */
const vec2Angle = (v) => Math.atan2(v.y, v.x);

/** @returns {{x: number, y: number}} Unit vector from angle in radians. */
const vec2FromAngle = (angle) => ({ x: Math.cos(angle), y: Math.sin(angle) });

/** @returns {{x: number, y: number}} Linear interpolation between a and b. */
const vec2Lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** @returns {{x: number, y: number}} Rotate v by angle (radians) around origin. */
const vec2Rotate = (v, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

// ── Math Helpers ─────────────────────────────────────────────

/** @returns {number} Linear interpolation from a to b by t. */
const lerp = (a, b, t) => a + (b - a) * t;

/** @returns {number} Clamp value between min and max. */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** @returns {number} Remap value from [inMin, inMax] to [outMin, outMax]. */
const map = (value, inMin, inMax, outMin, outMax) =>
  outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);

/** @returns {number} Wrap value into range [0, max). */
const wrap = (value, max) => ((value % max) + max) % max;

/** @returns {number} Smooth Hermite interpolation for t in [0, 1]. */
const smoothstep = (t) => t * t * (3 - 2 * t);

/** @returns {number} Inverse lerp — where does value fall between a and b (0..1). */
const inverseLerp = (a, b, value) => (value - a) / (b - a);

// ── Easing Functions ─────────────────────────────────────────

/** @returns {number} */
const easeInQuad = (t) => t * t;

/** @returns {number} */
const easeOutQuad = (t) => t * (2 - t);

/** @returns {number} */
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

/** @returns {number} */
const easeInCubic = (t) => t * t * t;

/** @returns {number} */
const easeOutCubic = (t) => --t * t * t + 1;

/** @returns {number} */
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 + --t * (2 * t) * (2 * t);

/** @returns {number} Overshoots then settles. */
const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (--t) * t * ((c + 1) * t + c);
};

/** @returns {number} Spring-like elastic settle. */
const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
};

/** @returns {number} Bouncing settle. */
const easeOutBounce = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

// ── RNG ──────────────────────────────────────────────────────

/** @returns {() => number} Seeded PRNG (mulberry32), returns values in [0, 1). */
function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @returns {number} Random float in [min, max). */
const randomRange = (min, max) => Math.random() * (max - min) + min;

/** @returns {number} Random integer in [min, max] (inclusive). */
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** @returns {*} Random element from array. */
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** @returns {boolean} True with given probability (0..1). */
const randomChance = (probability) => Math.random() < probability;

/** @returns {Array} Shuffled copy of array (Fisher-Yates). */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Color ────────────────────────────────────────────────────

/** @returns {string} CSS hsl() string. */
const hslToString = (h, s, l, a = 1) =>
  a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`;

/** @returns {string} CSS rgba() string. */
const rgbaToString = (r, g, b, a = 1) =>
  a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;

/** @returns {{r: number, g: number, b: number}} RGB object from hex string. */
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** @returns {string} Bright saturated neon color as hsl string. */
const neonColor = (hue) => hslToString(hue % 360, 100, 60);

// ── Misc ─────────────────────────────────────────────────────

/** @returns {string} Number formatted with commas (e.g. 1,234,567). */
const formatScore = (n) => Math.floor(n).toLocaleString('en-US');

/** @returns {string} Seconds formatted as M:SS or H:MM:SS. */
function formatTime(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** @returns {*} Deep clone via structuredClone. */
const deepClone = (obj) => structuredClone(obj);

/** @returns {string} Short unique-ish ID string. */
const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

Object.assign(window, { vec2, vec2Add, vec2Sub, vec2Scale, vec2Length, vec2Normalize, vec2Dot, vec2Dist, vec2Angle, vec2FromAngle, vec2Lerp, vec2Rotate, lerp, clamp, map, wrap, smoothstep, inverseLerp, easeInQuad, easeOutQuad, easeInOutQuad, easeInCubic, easeOutCubic, easeInOutCubic, easeOutBack, easeOutElastic, easeOutBounce, seededRandom, randomRange, randomInt, randomChoice, randomChance, shuffle, hslToString, rgbaToString, hexToRgb, neonColor, formatScore, formatTime, deepClone, generateId });
})();
