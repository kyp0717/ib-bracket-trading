import type { Candidate } from "./scan";

export interface Scored extends Candidate {
  score: number;
  reasons: string[];
}

function band(v: number, lo: number, hi: number): number {
  if (v < lo) return 0;
  if (v > hi) return 0;
  const mid = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  return Math.max(0, 1 - Math.abs(v - mid) / half);
}

export function score(c: Candidate): Scored {
  const reasons: string[] = [];
  let score = 0;

  if (c.close < 2 || c.close > 60) reasons.push("price outside 2..60");
  else score += 30 * band(c.close, 2, 60);

  if (c.avgDollarVolume < 5e6) reasons.push("dollar volume under 5M");
  else score += 40 * Math.min(1, c.avgDollarVolume / 5e8);

  if (c.avgRangePct > 0.1) reasons.push("daily range over 10%");
  else if (c.avgRangePct < 0.002) reasons.push("daily range under 0.2%");
  else score += 30 * band(c.avgRangePct, 0.008, 0.06);

  return { ...c, score: Math.round(score), reasons };
}

export function rank(candidates: Candidate[]): Scored[] {
  return candidates.map(score).sort((a, b) => b.score - a.score || b.avgDollarVolume - a.avgDollarVolume);
}
