const KEY_PREFIX = 'ruzzle:best:'

export function getBestScore(seed: string): number | null {
  const raw = localStorage.getItem(KEY_PREFIX + seed)
  return raw ? parseInt(raw) : null
}

// Renvoie true si c'est un nouveau record.
export function saveBestScore(seed: string, score: number): boolean {
  const prev = getBestScore(seed)
  if (prev === null || score > prev) {
    localStorage.setItem(KEY_PREFIX + seed, String(score))
    return true
  }
  return false
}
