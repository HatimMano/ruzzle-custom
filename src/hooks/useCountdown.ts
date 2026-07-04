import { useEffect, useState } from 'react'
import { playCountdown, playGo } from '../lib/audio'

// Countdown 3-2-1-Go avant démarrage du jeu.
// `enabled=false` pour skip (ex : reprise de session).
// `onEnd` déclenché quand le countdown atteint 0 (juste avant de disparaître).
// Retourne la valeur courante à afficher (3, 2, 1, 0=Go, ou null=terminé).
export function useCountdown(enabled: boolean, onEnd: () => void): number | null {
  const [value, setValue] = useState<number | null>(enabled ? 3 : null)

  useEffect(() => {
    if (value === null) return
    if (value === 0) {
      playGo()
      const t = setTimeout(() => {
        setValue(null)
        onEnd()
      }, 400)
      return () => clearTimeout(t)
    }
    playCountdown()
    const t = setTimeout(() => setValue((v) => (v ?? 1) - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return value
}
