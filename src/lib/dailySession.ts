// Session daily persistée pour empêcher la triche par refresh + permettre la reprise

const KEY = (date: string) => `griddle:daily_session:${date}`

export interface DailySession {
  date: string
  startedAt: number  // epoch ms
  foundWords: string[]
  pyramidFound: Record<number, string>
}

export function loadDailySession(date: string): DailySession | null {
  try {
    const raw = localStorage.getItem(KEY(date))
    if (!raw) return null
    const s = JSON.parse(raw) as DailySession
    if (s.date !== date) return null
    if (typeof s.startedAt !== 'number') return null
    if (!Array.isArray(s.foundWords)) return null
    if (typeof s.pyramidFound !== 'object' || s.pyramidFound === null) return null
    return s
  } catch {
    return null
  }
}

export function saveDailySession(session: DailySession) {
  localStorage.setItem(KEY(session.date), JSON.stringify(session))
}

export function clearDailySession(date: string) {
  localStorage.removeItem(KEY(date))
}
