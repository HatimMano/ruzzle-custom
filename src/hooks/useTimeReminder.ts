import { useEffect, useRef } from 'react'

const FIRST_THRESHOLD = 600   // 10 min
const REPEAT_INTERVAL = 300   // toutes les 5 min ensuite

interface Options {
  active: boolean
  elapsedSecs: number
  onRemind: (message: string) => void
}

// Déclenche un rappel "tu joues depuis longtemps" à 10 min, puis toutes les 5 min.
// Le message est passé au callback ; à charge à l'appelant d'afficher la modale.
export function useTimeReminder({ active, elapsedSecs, onRemind }: Options) {
  const lastReminderAtRef = useRef(0)

  useEffect(() => {
    if (!active) return
    if (elapsedSecs < FIRST_THRESHOLD) return
    if ((elapsedSecs - FIRST_THRESHOLD) % REPEAT_INTERVAL !== 0) return
    if (lastReminderAtRef.current === elapsedSecs) return
    lastReminderAtRef.current = elapsedSecs

    const minutes = Math.floor(elapsedSecs / 60)
    const message = elapsedSecs === FIRST_THRESHOLD
      ? `Ça fait déjà ${minutes} min... ça commence à faire long. Continuer ?`
      : `Toujours là ? ${minutes} min au compteur. Continuer ?`
    onRemind(message)
  }, [active, elapsedSecs, onRemind])
}
