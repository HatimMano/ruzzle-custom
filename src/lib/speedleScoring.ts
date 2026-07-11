// Courbe Speedle : incite les mots longs sans rendre le sablier infini.
// 3L=+1s, 4L=+2s, 5L=+4s, 6L=+5s, 7L=+7s, 8L+=+10s (aplatie le 2026-07-11,
// l'ancienne courbe 7/11/15 rendait les parties trop longues ; 8L+ relevé à
// +10s car la grille garantit désormais 2-5 mots de 8L+ = récompense rare).
export const SPEEDLE_BONUS_TABLE: Record<number, number> = {
  3: 1, 4: 2, 5: 4, 6: 5, 7: 7, 8: 10,
}

export function speedleSecsBonus(len: number): number {
  if (len < 3) return 0
  if (len >= 8) return SPEEDLE_BONUS_TABLE[8]
  return SPEEDLE_BONUS_TABLE[len] ?? 0
}
