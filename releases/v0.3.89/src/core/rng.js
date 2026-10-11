export function hashSeed(input) {
  const text = String(input ?? Date.now());
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 0x9e3779b9;
}

export class RNG {
  constructor(seed = Date.now(), state = null) {
    this.seed = String(seed);
    this.state = state ?? hashSeed(seed);
  }

  next() {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(percent) {
    return this.next() * 100 < Math.max(0, Math.min(100, percent));
  }

  pick(array) {
    if (!array?.length) return null;
    return array[this.int(0, array.length - 1)];
  }

  shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  snapshot() {
    return { seed: this.seed, state: this.state >>> 0 };
  }
}
