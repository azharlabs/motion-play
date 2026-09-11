import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cellsOf, COLS, createGame, PIECES, pieceById, ROWS } from "./hand-tetris.js";
import { VIEW, fxSpy, hand, run, signals } from "./test-support.js";

/** A hand held at hip height, which steers without turning the piece. */
const steering = (x, speed = 0) => signals({ hands: { right: hand(x, 0.6, speed) } });

/** A hand held above the shoulder, which is the turn gesture. */
const raised = (x = 0.5) => signals({ hands: { right: hand(x, 0.05, 0) } });

/** Put a chosen piece in a chosen place, so nothing depends on the draw. */
function place(g, id, { turn = 0, col = 2, row = 5 } = {}) {
  g.piece = { kind: pieceById(id), turn, col, row };
  return g.piece;
}

/** Fill a row, leaving one column open. */
function fillRow(g, y, gap = null) {
  for (let x = 0; x < COLS; x += 1) g.well[y][x] = x === gap ? null : "#888";
}

/** The columns a piece currently occupies. */
const columnsOf = (p) => cellsOf(p.kind, p.turn, p.col, 0).map(([x]) => x);

describe("Hand Tetris steering", () => {
  it("slides the piece towards the hand", () => {
    const g = createGame();
    g.start(0);
    place(g, "O", { col: 0 });
    run(g, steering(0.95), { ms: 600, view: VIEW });
    assert.ok(g.piece.col > 2, `piece stayed at column ${g.piece.col}`);
  });

  it("stops the piece at the wall rather than pushing it out of the well", () => {
    const g = createGame();
    g.start(0);
    place(g, "I", { col: 2 });
    run(g, steering(1.6), { ms: 1500, view: VIEW });
    const xs = columnsOf(g.piece);
    assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) < COLS, `cells at ${xs}`);
    assert.equal(Math.max(...xs), COLS - 1, "did not reach the wall it was sent to");
  });

  it("does not jump a column every frame, so the piece can be aimed", () => {
    const g = createGame({ slideRate: 10 });
    g.start(0);
    place(g, "O", { col: 0 });
    // Three frames is 48ms; at ten columns a second that is under one column.
    for (let i = 0; i < 3; i += 1) g.tick(0.016, steering(0.95), i * 16, VIEW);
    assert.ok(g.piece.col <= 1, `moved ${g.piece.col} columns in 48ms`);
  });

  it("turns the piece when a hand goes above the shoulder", () => {
    const g = createGame();
    g.start(0);
    place(g, "T");
    g.tick(0.016, steering(0.5), 16, VIEW);
    const ev = g.tick(0.016, raised(), 32, VIEW);
    assert.equal(ev.turned, true);
    assert.equal(g.piece.turn, 1);
  });

  it("turns once per raise, not once per frame it is held up", () => {
    const g = createGame();
    g.start(0);
    place(g, "T");
    g.tick(0.016, steering(0.5), 16, VIEW);
    let turns = 0;
    for (let i = 0; i < 20; i += 1) {
      if (g.tick(0.016, raised(), 32 + i * 16, VIEW).turned) turns += 1;
    }
    assert.equal(turns, 1, `turned ${turns} times on one raise`);
  });

  it("leaves the square alone, having nothing to turn", () => {
    const g = createGame();
    g.start(0);
    place(g, "O");
    g.tick(0.016, steering(0.5), 16, VIEW);
    const ev = g.tick(0.016, raised(), 32, VIEW);
    assert.equal(ev.turned, false);
  });

  it("steers with the lower hand, so turning does not drag the piece", () => {
    const g = createGame();
    g.start(0);
    place(g, "O", { col: 4 });
    const both = signals({
      hands: { left: hand(0.05, 0.6, 0), right: hand(0.95, 0.05, 0) },
    });
    run(g, both, { ms: 600, view: VIEW });
    assert.ok(g.piece.col < 4, `piece drifted to the raised hand at ${g.piece.col}`);
  });

  it("shifts a turn off the wall rather than refusing it", () => {
    const g = createGame();
    g.start(0);
    // The bar stood upright fills column 2 of its box, so hard against the
    // left wall the turn only fits if the piece is nudged across.
    place(g, "I", { turn: 1, col: -2, row: 4 });
    g.tick(0.016, steering(0.5), 16, VIEW);
    g.tick(0.016, raised(0.5), 32, VIEW);
    const xs = columnsOf(g.piece);
    assert.ok(Math.min(...xs) >= 0, `turn left cells at ${xs}`);
  });
});

describe("Hand Tetris well", () => {
  it("locks a piece into the stack when it lands", () => {
    const g = createGame();
    g.start(0);
    // The square fills columns 1 and 2 of its own box, so at column 3 it
    // lands in columns 4 and 5.
    place(g, "O", { col: 3, row: ROWS - 2 });
    run(g, signals(), { ms: 600, view: VIEW });
    assert.equal(g.well[ROWS - 1][4], "#fbbf24");
    assert.equal(g.well[ROWS - 2][5], "#fbbf24");
  });

  it("rests a piece on the floor rather than sinking into it", () => {
    const g = createGame();
    g.start(0);
    place(g, "O", { col: 3, row: ROWS - 2 });
    // Half of the lock delay: landed, but not yet part of the stack.
    run(g, signals(), { ms: 140, step: 16, view: VIEW });
    assert.ok(g.piece, "locked too early to check where it was resting");
    assert.ok(
      g.piece.row <= ROWS - 2 + 0.05,
      `sank to row ${g.piece.row}, past the floor at ${ROWS - 2}`,
    );
  });

  it("clears a completed row and scores it", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    // A floor missing two columns, and a square that exactly fills them.
    fillRow(g, ROWS - 1);
    fillRow(g, ROWS - 2);
    for (const y of [ROWS - 1, ROWS - 2]) {
      g.well[y][3] = null;
      g.well[y][4] = null;
    }
    place(g, "O", { col: 2, row: ROWS - 2 });
    run(g, signals(), { ms: 600, view: VIEW });

    assert.ok(g.score >= 2, `two full rows scored only ${g.score}`);
    assert.equal(g.well[ROWS - 1].some(Boolean), false, "the floor was not swept");
    assert.equal(fx.played("pop"), true);
  });

  it("drops the rows above a clear, and only those", () => {
    const g = createGame();
    g.start(0);
    // A marker sitting above a row that is about to vanish.
    g.well[ROWS - 4][1] = "#0f0";
    fillRow(g, ROWS - 1);
    g.well[ROWS - 1][3] = null;
    g.well[ROWS - 1][4] = null;
    place(g, "O", { col: 2, row: ROWS - 2 });
    run(g, signals(), { ms: 600, view: VIEW });

    // One row went, so the marker and the square's leftover half both fall
    // exactly one row.
    assert.equal(g.well[ROWS - 3][1], "#0f0", "the marker did not come down one row");
    assert.equal(g.well[ROWS - 1][3], "#fbbf24", "the half-square did not come down");
  });

  it("takes several rows out at once without shearing the stack", () => {
    const g = createGame();
    g.start(0);
    g.well[ROWS - 5][6] = "#0f0";
    for (const y of [ROWS - 1, ROWS - 2, ROWS - 3, ROWS - 4]) {
      fillRow(g, y);
      g.well[y][3] = null;
    }
    // The bar stood on end fills all four rows of the one open column.
    place(g, "I", { turn: 1, col: 1, row: ROWS - 4 });
    run(g, signals(), { ms: 600, view: VIEW });

    assert.equal(g.well.flat().filter(Boolean).length, 1, "more than the marker survived");
    assert.equal(g.well[ROWS - 1][6], "#0f0", "the marker did not fall four rows");
  });

  it("sweeps the well and costs a life when the stack reaches the top", () => {
    const g = createGame();
    g.start(0);
    for (let y = 0; y < ROWS - 1; y += 1) fillRow(g, y);
    g.piece = null;
    g.tick(0.016, signals(), 16, VIEW);
    assert.equal(g.lives, 2);
    assert.equal(g.well.flat().filter(Boolean).length, 0, "the well was not swept");
  });

  it("ends the round when the last life goes", () => {
    const g = createGame({ lives: 1 });
    g.start(0);
    for (let y = 0; y < ROWS - 1; y += 1) fillRow(g, y);
    g.piece = null;
    assert.equal(g.tick(0.016, signals(), 16, VIEW).over, true);
  });

  it("holds a landed piece a moment so it can still be slid into a gap", () => {
    const g = createGame();
    g.start(0);
    // A solid floor with a hole at the far end, and a square resting on it.
    fillRow(g, ROWS - 1);
    g.well[ROWS - 1][6] = null;
    g.well[ROWS - 1][7] = null;
    place(g, "O", { col: 0, row: ROWS - 3 });
    // Already landed; the hand asks for the far side before it locks.
    run(g, steering(0.95), { ms: 240, step: 16, view: VIEW });
    assert.ok(g.piece, "locked before the hand could move it");
    assert.ok(g.piece.col > 0, "the landed piece could not be slid");
  });
});

describe("Hand Tetris pacing", () => {
  it("drops faster as the levels come", () => {
    const g = createGame();
    g.start(0);
    const early = g.dropRate();
    g.level = g.maxLevel;
    assert.ok(g.dropRate() > early * 2, `level ${g.maxLevel} is barely faster`);
  });

  it("freezes while the player is out of shot", () => {
    const g = createGame();
    g.start(0);
    const row = g.piece.row;
    run(g, signals({ inFrame: false }), { ms: 1000, view: VIEW });
    assert.equal(g.piece.row, row);
  });

  it("counts the arm working, not just the rows it cleared", () => {
    const g = createGame();
    g.start(0);
    for (let i = 0; i < 4; i += 1) {
      g.tick(0.05, steering(0.8, 2.2), i * 200 + 50, VIEW);
      g.tick(0.05, steering(0.8, 0.1), i * 200 + 100, VIEW);
      g.tick(0.05, raised(0.8), i * 200 + 150, VIEW);
      g.tick(0.05, steering(0.8, 0.1), i * 200 + 200, VIEW);
    }
    const acted = g.summary().actions;
    assert.ok(acted.reach >= 2, `only ${acted.reach ?? 0} reaches counted`);
    assert.ok(acted.raise >= 2, `only ${acted.raise ?? 0} raises counted`);
  });
});

describe("Hand Tetris pieces", () => {
  it("gives every piece four cells inside its box at every turn", () => {
    assert.equal(PIECES.length, 7);
    for (const kind of PIECES) {
      for (const [t, turn] of kind.turns.entries()) {
        assert.equal(turn.length, 4, `${kind.id} turn ${t} is not four cells`);
        for (const [x, y] of turn) {
          assert.ok(x >= 0 && x < 4 && y >= 0 && y < 4, `${kind.id} escapes its box`);
        }
        const seen = new Set(turn.map(([x, y]) => `${x},${y}`));
        assert.equal(seen.size, 4, `${kind.id} turn ${t} stacks cells on top of each other`);
      }
    }
  });

  it("can turn every piece on the spot in open space", () => {
    // A piece that could not complete a turn in the middle of an empty well
    // would be one the player can never rotate.
    for (const kind of PIECES) {
      const g = createGame();
      g.start(0);
      place(g, kind.id, { col: 2, row: 5 });
      for (let t = 0; t < kind.turns.length; t += 1) {
        g.tick(0.016, steering(0.5), t * 400 + 16, VIEW);
        const ev = g.tick(0.016, raised(0.5), t * 400 + 32, VIEW);
        assert.equal(
          ev.turned,
          kind.turns.length > 1,
          `${kind.id} would not turn at step ${t}`,
        );
      }
    }
  });
});
