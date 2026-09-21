(function () { /* de-moduled */
'use strict';
/**
 * Pixel-art sprite renderer for canvas arcade games.
 *
 * Sprite data format:
 *   { width, height, pixels: [...], palette: ['#color1', '#color2', ...] }
 *   `pixels` is a flat array of palette indices (0 = transparent).
 *
 * Sprite sheet format:
 *   { frames: [sprite, sprite, ...] }
 */

// ---------------------------------------------------------------------------
// Cache for offscreen-rendered sprites
// ---------------------------------------------------------------------------

const MAX_CACHE_SIZE = 256;

class SpriteCache {
  constructor() {
    this._map = new Map();
  }

  _key(sprite, scale, flipX, flipY) {
    // Build a string key from identity-relevant fields.
    // Using the pixel data directly is fine for small arcade sprites.
    return `${sprite.width}:${sprite.height}:${scale}:${flipX ? 1 : 0}:${flipY ? 1 : 0}:${sprite.pixels.join(',')}:${sprite.palette.join(',')}`;
  }

  get(sprite, scale, flipX, flipY) {
    return this._map.get(this._key(sprite, scale, flipX, flipY)) ?? null;
  }

  set(sprite, scale, flipX, flipY, canvas) {
    const key = this._key(sprite, scale, flipX, flipY);
    if (this._map.size >= MAX_CACHE_SIZE) {
      // Evict oldest entry (first inserted)
      const first = this._map.keys().next().value;
      this._map.delete(first);
    }
    this._map.set(key, canvas);
  }
}

// ---------------------------------------------------------------------------
// SpriteRenderer
// ---------------------------------------------------------------------------

class SpriteRenderer {
  constructor() {
    this._cache = new SpriteCache();
  }

  // -----------------------------------------------------------------------
  // Core rendering
  // -----------------------------------------------------------------------

  /**
   * Render a sprite's pixels to an offscreen canvas (or retrieve from cache).
   * Returns the offscreen canvas.
   */
  _renderToOffscreen(sprite, scale = 1, flipX = false, flipY = false) {
    const cached = this._cache.get(sprite, scale, flipX, flipY);
    if (cached) return cached;

    const w = sprite.width * scale;
    const h = sprite.height * scale;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');

    for (let py = 0; py < sprite.height; py++) {
      for (let px = 0; px < sprite.width; px++) {
        const idx = sprite.pixels[py * sprite.width + px];
        if (idx === 0) continue; // transparent

        const color = sprite.palette[idx - 1];
        if (!color) continue;

        const dx = flipX ? (sprite.width - 1 - px) * scale : px * scale;
        const dy = flipY ? (sprite.height - 1 - py) * scale : py * scale;

        octx.fillStyle = color;
        octx.fillRect(dx, dy, scale, scale);
      }
    }

    this._cache.set(sprite, scale, flipX, flipY, off);
    return off;
  }

  /**
   * Draw a sprite onto a destination context.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} sprite  - { width, height, pixels, palette }
   * @param {number} x
   * @param {number} y
   * @param {number} [scale=1]
   * @param {boolean} [flipX=false]
   * @param {boolean} [flipY=false]
   */
  drawSprite(ctx, sprite, x, y, scale = 1, flipX = false, flipY = false) {
    const off = this._renderToOffscreen(sprite, scale, flipX, flipY);
    ctx.drawImage(off, x, y);
  }

  /**
   * Draw a single frame from a sprite sheet.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} spriteSheet - { frames: [sprite, ...] }
   * @param {number} x
   * @param {number} y
   * @param {number} frame  - index into frames array
   * @param {number} [scale=1]
   * @param {boolean} [flipX=false]
   */
  drawAnimatedSprite(ctx, spriteSheet, x, y, frame, scale = 1, flipX = false) {
    const f = spriteSheet.frames[frame % spriteSheet.frames.length];
    this.drawSprite(ctx, f, x, y, scale, flipX, false);
  }

  /**
   * Draw a sprite with a neon glow effect using shadowBlur.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} sprite
   * @param {number} x
   * @param {number} y
   * @param {number} scale
   * @param {string} glowColor  - CSS color for the glow
   * @param {number} glowSize   - blur radius in pixels
   */
  drawWithGlow(ctx, sprite, x, y, scale, glowColor, glowSize) {
    const off = this._renderToOffscreen(sprite, scale, false, false);

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowSize;
    // Draw twice for a stronger glow
    ctx.drawImage(off, x, y);
    ctx.drawImage(off, x, y);
    ctx.restore();
  }

  /**
   * Draw a sprite rotated around its center.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} sprite
   * @param {number} x       - center x
   * @param {number} y       - center y
   * @param {number} angle   - rotation in radians
   * @param {number} [scale=1]
   */
  drawRotated(ctx, sprite, x, y, angle, scale = 1) {
    const off = this._renderToOffscreen(sprite, scale, false, false);
    const hw = off.width / 2;
    const hh = off.height / 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(off, -hw, -hh);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Sprite creation helpers
  // -----------------------------------------------------------------------

  /**
   * Create a sprite definition from a multi-line string template.
   *
   * Each character maps to a palette index:
   *   '.' or '0' => 0 (transparent)
   *   '1'        => 1 (palette[0])
   *   '2'        => 2 (palette[1])
   *   …etc. Supports 0-9 and a-f (10-15).
   *
   * @param {string} art     - multi-line string (leading/trailing blank lines stripped)
   * @param {string[]} palette - array of CSS color strings
   * @returns {object} sprite definition { width, height, pixels, palette }
   */
  createSpriteFromString(art, palette) {
    const lines = art
      .split('\n')
      .filter(l => l.trim().length > 0);

    const height = lines.length;
    const width = Math.max(...lines.map(l => l.trim().length));
    const pixels = [];

    const charToIndex = (ch) => {
      if (ch === '.' || ch === '0') return 0;
      if (ch >= '1' && ch <= '9') return parseInt(ch, 10);
      if (ch >= 'a' && ch <= 'f') return ch.charCodeAt(0) - 87; // a=10 .. f=15
      if (ch >= 'A' && ch <= 'F') return ch.charCodeAt(0) - 55;
      return 0;
    };

    for (let y = 0; y < height; y++) {
      const row = lines[y].trim();
      for (let x = 0; x < width; x++) {
        pixels.push(x < row.length ? charToIndex(row[x]) : 0);
      }
    }

    return { width, height, pixels, palette: [...palette] };
  }
}

// ---------------------------------------------------------------------------
// Neon text helper
// ---------------------------------------------------------------------------

/**
 * Draw text with a layered neon glow effect.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} fontSize   - in pixels
 * @param {string} color      - CSS color
 * @param {number} [glowSize=10] - outer glow radius
 */
function drawNeonText(ctx, text, x, y, fontSize, color, glowSize = 10) {
  ctx.save();
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outer glow pass (large, dim)
  ctx.shadowColor = color;
  ctx.shadowBlur = glowSize;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);

  // Middle glow pass (medium)
  ctx.shadowBlur = glowSize * 0.5;
  ctx.fillText(text, x, y);

  // Inner bright core
  ctx.shadowBlur = glowSize * 0.2;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Built-in sprite library
// ---------------------------------------------------------------------------

const renderer = new SpriteRenderer();

function _make(art, palette) {
  return renderer.createSpriteFromString(art, palette);
}

function _makeSheet(arts, palette) {
  return { frames: arts.map(a => _make(a, palette)) };
}

const SPRITES = {
  // 8x8 red heart (for lives display)
  heart: _make(
    `
.11.11.
1221221
1222221
1222221
.122221
..1221.
...11..
........
`, ['#ff0040', '#ff4070']),

  // 8x8 yellow star
  star: _make(
    `
...1....
...1....
..111...
.11211.
11122111
..1221..
..1..1..
.1....1.
`, ['#ffcc00', '#fff080']),

  // 8x8 spinning coin — 4 frame animation
  coin: _makeSheet([
    `
..1111..
.122221.
12122121
12211221
12211221
12122121
.122221.
..1111..
`,
    `
...11...
..1221..
.122221.
.121121.
.121121.
.122221.
..1221..
...11...
`,
    `
....1...
...121..
...121..
...121..
...121..
...121..
...121..
....1...
`,
    `
...11...
..1221..
.122221.
.121121.
.121121.
.122221.
..1221..
...11...
`
  ], ['#ffaa00', '#ffdd44']),

  // 12x12 explosion — 4 frame animation
  explosion: _makeSheet([
    `
............
....11......
...1221.....
..122221....
..122221....
...1221.....
....11......
............
............
............
............
............
`,
    `
............
....11......
..112211....
.1122221.1..
.12222221...
.12222221...
.1122221....
..112211....
....11......
............
............
............
`,
    `
.....1..1...
..1.111.....
..11232111..
.112323211..
1123333211..
.123333321.1
.1123232111.
..112322111.
...1123211..
....1111....
.....1.1....
............
`,
    `
..1.....1...
.....1......
..1..3.1..1.
....131.....
.1.13331..1.
...133321...
..1.131.1...
....1.31....
.1....1.....
......1..1..
..1.........
............
`
  ], ['#ff6600', '#ffcc00', '#ffffff']),

  // 8x8 directional arrows
  arrow: {
    up: _make(
      `
...1....
..111...
.11111..
1112111.
...1....
...1....
...1....
........
`, ['#00ff88']),

    down: _make(
      `
........
...1....
...1....
...1....
1112111.
.11111..
..111...
...1....
`, ['#00ff88']),

    left: _make(
      `
........
..1.....
.1......
11111111
11211111
.1......
..1.....
........
`, ['#00ff88', '#88ffcc']),

    right: _make(
      `
........
.....1..
......1.
11111111
11111211
......1.
.....1..
........
`, ['#00ff88', '#88ffcc']),
  },

  // 8x8 skull (game over)
  skull: _make(
    `
.11111..
1111111.
12112111
11111111
12112111
.111111.
.1.11.1.
..1111..
`, ['#ffffff', '#000000']),

  // 8x8 crown (high score)
  crown: _make(
    `
.1...1..
11.1.11.
11.1.11.
11.1.11.
11111111
12222221
12222221
11111111
`, ['#ffcc00', '#ff4444']),
};

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------


Object.assign(window, { SpriteRenderer, drawNeonText, SPRITES });
})();
