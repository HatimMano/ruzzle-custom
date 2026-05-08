import { useRef, useState } from 'react'
import { playStreak } from '../lib/audio'

const STREAK_BONUSES: [number, number][] = [
  [7, 5],
  [5, 3],
  [3, 1],
]

export function streakBonus(streak: number): number {
  for (const [threshold, bonus] of STREAK_BONUSES) {
    if (streak >= threshold) return bonus
  }
  return 0
}

const FLASH_MS = 1500

export function useStreakFlash() {
  const [flash, setFlash] = useState<string | null>(null)
  const timer = useRef<number>(0)

  const trigger = (streakCount: number, bonus: number) => {
    playStreak()
    clearTimeout(timer.current)
    setFlash(`🔥 Série ×${streakCount} ! +${bonus}pts bonus`)
    timer.current = window.setTimeout(() => setFlash(null), FLASH_MS)
  }

  const clear = () => {
    clearTimeout(timer.current)
    setFlash(null)
  }

  return { flash, trigger, clear }
}
