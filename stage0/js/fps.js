export class FpsMeter {
  constructor(windowMs = 1000) {
    this.windowMs = windowMs;
    this.stamps = [];
  }

  hit(now) {
    this.stamps.push(now);
    const cut = now - this.windowMs;
    while (this.stamps.length && this.stamps[0] < cut) this.stamps.shift();
  }

  value() {
    if (this.stamps.length < 2) return 0;
    const span = this.stamps.at(-1) - this.stamps[0];
    if (span <= 0) return 0;
    return ((this.stamps.length - 1) / span) * 1000;
  }
}
