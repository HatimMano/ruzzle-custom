import { useRef, useState } from 'react'

interface ScoreAnim {
  pts: number
  id: number
}

const FADE_MS = 700

export function useScoreAnimation() {
  const [anim, setAnim] = useState<ScoreAnim | null>(null)
  const timer = useRef<number>(0)

  const trigger = (pts: number) => {
    clearTimeout(timer.current)
    setAnim({ pts, id: Date.now() })
    timer.current = window.setTimeout(() => setAnim(null), FADE_MS)
  }

  const clear = () => {
    clearTimeout(timer.current)
    setAnim(null)
  }

  return { anim, trigger, clear }
}
