// Courbe convexe Speedle : incite fortement les mots longs.
// 3L=+1s, 4L=+2s, 5L=+4s, 6L=+7s, 7L=+11s, 8L+=+15s.
export const SPEEDLE_BONUS_TABLE: Record<number, number> = {
  3: 1, 4: 2, 5: 4, 6: 7, 7: 11, 8: 15,
}

export function speedleSecsBonus(len: number): number {
  if (len < 3) return 0
  if (len >= 8) return SPEEDLE_BONUS_TABLE[8]
  return SPEEDLE_BONUS_TABLE[len] ?? 0
}
