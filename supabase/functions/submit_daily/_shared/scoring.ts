export const SCORE_TABLE: Record<number, number> = {
  3: 1,
  4: 1,
  5: 2,
  6: 4,
  7: 7,
  8: 12,
}

export function scoreForLen(len: number): number {
  if (len < 3) return 0
  if (len >= 8) return SCORE_TABLE[8]
  return SCORE_TABLE[len] ?? 0
}
