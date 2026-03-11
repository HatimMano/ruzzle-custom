export const SCORE_TABLE: Record<number, number> = {
  3: 1,
  4: 1,
  5: 2,
  6: 4,
  7: 7,
  8: 12,
}

export function scoreForWord(word: string): number {
  const len = word.length
  if (len < 3) return 0
  if (len >= 8) return SCORE_TABLE[8]
  return SCORE_TABLE[len] ?? 0
}

export function scoreLabel(word: string): string {
  const s = scoreForWord(word)
  return `+${s}pt${s > 1 ? 's' : ''}`
}
