// =============================================================================
// Seeded RNG — Deterministic pseudo-random number generator (xorshift128+)
// =============================================================================

import type { SeededRng } from "../../ports/agent-testing.port.js";

export class Xorshift128Plus implements SeededRng {
  private s0: number;
  private s1: number;

  constructor(seed: number) {
    // Initialize state from seed using splitmix32
    this.s0 = this.splitmix32(seed);
    this.s1 = this.splitmix32(this.s0);
    if (this.s0 === 0 && this.s1 === 0) {
      this.s0 = 1;
    }
  }

  private splitmix32(state: number): number {
    state |= 0;
    state = (state + 0x9e3779b9) | 0;
    let t = state ^ (state >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return t >>> 0;
  }

  next(): number {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23;
    s1 ^= s1 >>> 17;
    s1 ^= s0;
    s1 ^= s0 >>> 26;
    this.s1 = s1;
    return ((this.s0 + this.s1) >>> 0) / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Cannot pick from empty array");
    return arr[this.nextInt(0, arr.length)]!;
  }

  randomString(length: number): string {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !@#$%^&*()";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[this.nextInt(0, chars.length)];
    }
    return result;
  }
}
