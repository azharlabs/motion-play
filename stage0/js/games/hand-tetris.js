import { BaseGame, clamp, drawParticles, drawPops, lerp, Rep, withShake } from "./common.js";

/**
 * Hand Tetris - slide the piece with a hand, raise a hand to turn it.
 *
 * The version this comes from read the number of folded fingers to pick a
 * direction, which needs a hand model with knuckles in it and, worse, turns
 * every move into a pose held still until the model agrees. Sliding the piece
 * to wherever the hand is puts the control back into a movement: the arm
 * sweeps across the well and the piece goes with it, so a round is a lot of
 * reaching rather than a lot of waiting.
 *
 * Turning is the one thing a position cannot say, so it gets a gesture of its
 * own - a hand lifted above the shoulder. Either hand will do it, which means
 * a player can steer with one and turn with the other, or use one hand for
 * both by lifting it.
 */

export const COLS = 8;
export const ROWS = 14;

/**
 * The seven pieces, as the cells they fill in a 4x4 box at each turn.
 *
 * Written out rather than rotated by matrix, because the interesting part of
 * a piece is where its corners sit after a turn, and a formula that is nearly
 * right there is worse than a list that is exactly right.
 */
export const PIECES = [
  {
    id: "I",
    color: "#22d3ee",
    turns: [
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
      ],
      [
        [2, 0],
        [2, 1],
        [2, 2],
        [2, 3],
      ],
    ],
  },
  {
    id: "O",
    color: "#fbbf24",
    turns: [
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [2, 1],
      ],
    ],
  },
  {
    id: "T",
    color: "#c084fc",
    turns: [
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [1, 1],
        [2, 1],
        [1, 2],
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
    ],
  },
  {
    id: "S",
    color: "#4ade80",
    turns: [
      [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
      ],
      [
        [1, 0],
        [1, 1],
        [2, 1],
        [2, 2],
      ],
    ],
  },
  {
    id: "Z",
    color: "#f87171",
    turns: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ],
      [
        [2, 0],
        [1, 1],
        [2, 1],
        [1, 2],
      ],
    ],
  },
  {
    id: "J",
    color: "#60a5fa",
    turns: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [2, 0],
        [1, 1],
        [1, 2],
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [2, 2],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 2],
        [1, 2],
      ],
    ],
  },
  {
    id: "L",
    color: "#fb923c",
    turns: [
      [
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 2],
      ],
      [
        [0, 1],
        [1, 1],
        [2, 1],
        [0, 2],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 2],
      ],
    ],
  },
];

/** The piece looked up by letter, for anything that needs a specific one. */
export const pieceById = (id) => PIECES.find((p) => p.id === id);

/** The cells a piece fills at a given column, row and turn. */
export function cellsOf(kind, turn, col, row) {
  return kind.turns[turn % kind.turns.length].map(([x, y]) => [col + x, row + y]);
}

/** Where the well sits on screen, in pixels. */
export function wellBox(view) {
  const cell = Math.min((view.w * 0.86) / COLS, (view.h * 0.84) / ROWS);
  return {
    cell,
    left: (view.w - cell * COLS) / 2,
    top: (view.h - cell * ROWS) / 2,
    w: cell * COLS,
    h: cell * ROWS,
  };
}

export function createGame(opts = {}) {
  return new HandTetris(opts);
}

class HandTetris extends BaseGame {
  constructor(opts = {}) {
    super({
      roundMs: opts.roundMs ?? 90_000,
      lives: opts.lives ?? 3,
      fx: opts.fx,
      scoreCue: "pop",
      clearsPerLevel: opts.clearsPerLevel ?? 4,
    });
    // Rows per second, at the first level and at the last.
    this.slowest = opts.slowest ?? 1.1;
    this.fastest = opts.fastest ?? 3.4;
    // Columns per second the piece will chase the hand at. Fast enough to
    // feel attached to the arm, slow enough not to jitter between two cells.
    this.slideRate = opts.slideRate ?? 13;
    // How far above the shoulder, in shoulder widths, counts as a raise.
    this.raiseAt = opts.raiseAt ?? 0.32;
    this.reset();
  }

  reset() {
    super.reset();
    this.well = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.piece = null;
    this.next = PIECES[Math.floor(Math.random() * PIECES.length)];
    this.slideWait = 0;
    this.lockWait = 0;
    this.clearing = null;
    this.raises = new Rep(this.raiseAt, this.raiseAt * 0.45);
    this.reaches = new Rep(1, 0.45);
    this.aim = null;
    this.#spawn();
  }

  /** How fast pieces fall at the level reached. */
  dropRate() {
    return lerp(this.slowest, this.fastest, this.ramp());
  }

  /** Can the piece sit here without leaving the well or hitting the stack? */
  #fits(kind, turn, col, row) {
    for (const [x, y] of cellsOf(kind, turn, col, row)) {
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      // Above the top of the well is allowed while a piece is coming in.
      if (y >= 0 && this.well[y][x]) return false;
    }
    return true;
  }

  #spawn() {
    const kind = this.next;
    this.next = PIECES[Math.floor(Math.random() * PIECES.length)];
    const col = Math.floor((COLS - 4) / 2);
    this.piece = { kind, turn: 0, col, row: -1 };
    this.lockWait = 0;
    // Reported rather than acted on, so the caller decides what a full well
    // costs; the round may be over or may just be down a life.
    return this.#fits(kind, 0, col, -1);
  }

  /** Turn the piece, nudging it sideways if the turn would clip a wall. */
  #turn() {
    const p = this.piece;
    if (!p || p.kind.turns.length === 1) return false;
    const next = (p.turn + 1) % p.kind.turns.length;
    const row = Math.floor(p.row);
    // A bar turning upright against the wall needs two cells of room, so try
    // shifting further than one before giving up on the turn.
    for (const kick of [0, -1, 1, -2, 2]) {
      if (this.#fits(p.kind, next, p.col + kick, row)) {
        p.turn = next;
        p.col += kick;
        return true;
      }
    }
    return false;
  }

  /** The column the piece should be heading for, given where the hand is. */
  #aimFor(handX) {
    const p = this.piece;
    const cells = p.kind.turns[p.turn];
    let min = 4;
    let max = 0;
    for (const [x] of cells) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    // Line the middle of the piece up with the hand, not the corner of the
    // box it is described in.
    const middle = (min + max + 1) / 2;
    const want = clamp(handX, 0, 1) * COLS - middle;
    return clamp(Math.round(want), -min, COLS - 1 - max);
  }

  /** Drop the piece into the stack and clear any rows it completed. */
  #lock() {
    const p = this.piece;
    const row = Math.floor(p.row);
    for (const [x, y] of cellsOf(p.kind, p.turn, p.col, row)) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) this.well[y][x] = p.kind.color;
    }
    this.piece = null;

    const full = [];
    for (let y = 0; y < ROWS; y += 1) {
      if (this.well[y].every(Boolean)) full.push(y);
    }
    return full;
  }

  #clearRows(rows, view) {
    const box = wellBox(view);
    const screenY = (row) => (box.top + (row + 0.5) * box.cell) / view.h;

    // Score each row where it sat, so a four-row clear sends up four scores
    // in a stack rather than one number that could have been anything. The
    // combo does the rest of the work: four in a row is worth more than four
    // ones, which is the whole reason to let the well get deep.
    for (const y of rows) {
      this.award(0.5, screenY(y), null, { color: "#fef08a", count: 14 });
    }
    if (rows.length >= 4) {
      this.award(0.5, screenY(rows[0]), "TETRIS", { color: "#fde047", count: 26 });
    }

    // Removing from the bottom up, or each cut moves the rows still to go.
    for (const y of [...rows].sort((a, b) => b - a)) this.well.splice(y, 1);
    for (let i = 0; i < rows.length; i += 1) this.well.unshift(Array(COLS).fill(null));
  }

  tick(dt, signals, now, view) {
    const result = { over: false, locked: false, lines: 0, turned: false };
    if (this.beginTick(dt, now, view)) {
      result.over = this.over;
      return result;
    }

    const box = view ?? { w: 1, h: 1 };
    // The well pauses rather than burying the player while they step away.
    if (!signals.inFrame) {
      this.aim = null;
      return result;
    }

    this.#steer(dt, signals, box, result);
    this.#fall(dt, box, result);
    return result;
  }

  /** Slide the piece towards the hand, and turn it on a raise. */
  #steer(dt, signals, view, result) {
    const hands = Object.values(signals.hands ?? {}).filter((h) => h?.visible && h.x != null);
    if (!hands.length) {
      this.aim = null;
      return;
    }

    // Steering follows the lower hand, so lifting the other one to turn the
    // piece never drags it sideways at the same time.
    const steer = hands.reduce((a, b) => (b.y > a.y ? b : a));
    if (this.reaches.step(steer.speed ?? 0)) this.countAction("reach");

    const box = wellBox(view);
    const px = view.poseX(steer.x);
    this.aim = clamp((px - box.left) / box.w, 0, 1);

    // Either hand above the shoulder turns the piece.
    const width = signals.shoulder?.width || 0.2;
    const top = signals.shoulder?.y ?? 0.35;
    const lift = Math.max(...hands.map((h) => (top - h.y) / width));
    if (this.raises.step(lift)) {
      this.countAction("raise");
      if (this.#turn()) {
        result.turned = true;
        this.cue("swipe");
      }
    }

    if (!this.piece) return;
    this.slideWait -= dt;
    if (this.slideWait > 0) return;
    const want = this.#aimFor(this.aim);
    if (want === this.piece.col) return;
    const dir = Math.sign(want - this.piece.col);
    if (this.#fits(this.piece.kind, this.piece.turn, this.piece.col + dir, Math.floor(this.piece.row))) {
      this.piece.col += dir;
      this.slideWait = 1 / this.slideRate;
    }
  }

  /** Let the piece fall, lock it when it lands, and bring on the next. */
  #fall(dt, view, result) {
    if (!this.piece) {
      if (!this.#spawn()) this.#topOut(view, result);
      return;
    }

    const p = this.piece;
    const next = p.row + this.dropRate() * dt;
    // Part-way between two rows the piece is showing in both of them, so the
    // one it is sinking into has to be clear. Testing the row it has mostly
    // left instead lets it slide a whole cell into the floor and snap back.
    if (this.#fits(p.kind, p.turn, p.col, Math.ceil(next))) {
      p.row = next;
      this.lockWait = 0;
      return;
    }

    // Landed. Hold it there briefly so a piece can still be slid into the
    // gap it is sitting over, which is most of the skill in the game.
    p.row = Math.floor(p.row);
    this.lockWait += dt;
    if (this.lockWait < 0.28) return;

    const rows = this.#lock();
    result.locked = true;
    if (rows.length) {
      result.lines = rows.length;
      this.#clearRows(rows, view);
    } else {
      this.combo = 0;
    }
    if (!this.#spawn()) this.#topOut(view, result);
  }

  /** The stack reached the top. Sweep it away rather than end the round. */
  #topOut(view, result) {
    this.piece = null;
    this.well = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    if (this.penalise({ x: 0.5, y: 0.2, color: "#f87171" })) {
      this.over = true;
      result.over = true;
      return;
    }
    this.#spawn();
  }

  draw(ctx, view, signals, now) {
    void signals;
    withShake(ctx, this.shake, () => {
      const box = wellBox(view);
      this.#drawWell(ctx, box);
      this.#drawStack(ctx, box);
      if (this.piece) {
        this.#drawGhost(ctx, box);
        this.#drawPiece(ctx, box);
      }
      this.#drawAim(ctx, box, now);
      this.#drawNext(ctx, box);
      drawParticles(ctx, view, this.particles);
      drawPops(ctx, view, this.pops);
    });
  }

  #drawWell(ctx, box) {
    ctx.save();
    // Dark enough to read blocks against, sheer enough to still see yourself.
    ctx.fillStyle = "rgba(9,14,26,0.52)";
    ctx.beginPath();
    ctx.roundRect(box.left, box.top, box.w, box.h, box.cell * 0.3);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x += 1) {
      ctx.moveTo(box.left + x * box.cell, box.top);
      ctx.lineTo(box.left + x * box.cell, box.top + box.h);
    }
    for (let y = 1; y < ROWS; y += 1) {
      ctx.moveTo(box.left, box.top + y * box.cell);
      ctx.lineTo(box.left + box.w, box.top + y * box.cell);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = Math.max(2, box.cell * 0.07);
    ctx.beginPath();
    ctx.roundRect(box.left, box.top, box.w, box.h, box.cell * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  /** One block, bevelled so a wall of them still reads as separate cells. */
  static block(ctx, x, y, cell, color, alpha = 1) {
    const pad = cell * 0.06;
    const s = cell - pad * 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, s, s, s * 0.2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.roundRect(x + pad + s * 0.12, y + pad + s * 0.1, s * 0.76, s * 0.24, s * 0.12);
    ctx.fill();

    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.roundRect(x + pad + s * 0.12, y + pad + s * 0.68, s * 0.76, s * 0.2, s * 0.1);
    ctx.fill();
    ctx.restore();
  }

  #drawStack(ctx, box) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const colour = this.well[y][x];
        if (colour) {
          HandTetris.block(ctx, box.left + x * box.cell, box.top + y * box.cell, box.cell, colour);
        }
      }
    }
  }

  #drawPiece(ctx, box) {
    const p = this.piece;
    for (const [x, y] of cellsOf(p.kind, p.turn, p.col, p.row)) {
      if (y < -0.9) continue;
      HandTetris.block(ctx, box.left + x * box.cell, box.top + y * box.cell, box.cell, p.kind.color);
    }
  }

  /** Where the piece would land if left alone — the difference between
   * guessing and placing. */
  #drawGhost(ctx, box) {
    const p = this.piece;
    let row = Math.floor(p.row);
    while (this.#fits(p.kind, p.turn, p.col, row + 1)) row += 1;
    if (row === Math.floor(p.row)) return;

    ctx.save();
    ctx.strokeStyle = p.kind.color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1.5, box.cell * 0.08);
    for (const [x, y] of cellsOf(p.kind, p.turn, p.col, row)) {
      if (y < 0) continue;
      const pad = box.cell * 0.14;
      ctx.beginPath();
      ctx.roundRect(
        box.left + x * box.cell + pad,
        box.top + y * box.cell + pad,
        box.cell - pad * 2,
        box.cell - pad * 2,
        box.cell * 0.14,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A marker on the rim showing where the hand is pointing. */
  #drawAim(ctx, box, now) {
    if (this.aim == null) return;
    const x = box.left + this.aim * box.w;
    const y = box.top + box.h;
    const r = box.cell * 0.34;
    ctx.save();
    ctx.fillStyle = "rgba(190,242,100,0.9)";
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.9);
    ctx.lineTo(x - r * 0.8, y + r * 0.7);
    ctx.lineTo(x + r * 0.8, y + r * 0.7);
    ctx.closePath();
    ctx.fill();

    // A hint that keeps breathing while the hand is low, so the turn control
    // is discoverable without a line of text on screen.
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin((now ?? 0) / 320);
    ctx.strokeStyle = "rgba(190,242,100,0.9)";
    ctx.lineWidth = Math.max(1.5, r * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, box.top - r * 1.9);
    ctx.lineTo(x, box.top - r * 0.7);
    ctx.moveTo(x - r * 0.55, box.top - r * 1.35);
    ctx.lineTo(x, box.top - r * 1.95);
    ctx.lineTo(x + r * 0.55, box.top - r * 1.35);
    ctx.stroke();
    ctx.restore();
  }

  /** The piece after this one, tucked into the corner of the well. */
  #drawNext(ctx, box) {
    if (!this.next) return;
    const cell = box.cell * 0.42;
    const x = box.left + box.w - cell * 4.4;
    const y = box.top + cell * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.75;
    for (const [cx, cy] of this.next.turns[0]) {
      HandTetris.block(ctx, x + cx * cell, y + cy * cell, cell, this.next.color);
    }
    ctx.restore();
  }
}
