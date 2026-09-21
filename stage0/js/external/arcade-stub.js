/**
 * Stub module for vendored arcade titles that play via iframe embed only.
 * Legacy Stage 0 canvas path never loads these; registry still requires `load`
 * and actions.test expects a BaseGame-compatible createGame().
 */
import { BaseGame } from "../games/common.js";

class ArcadeStubGame extends BaseGame {
  constructor(opts = {}) {
    super(opts);
    this.reset();
  }

  update() {}
  draw() {}
  stop() {}
}

export function createGame(opts = {}) {
  return new ArcadeStubGame(opts);
}
