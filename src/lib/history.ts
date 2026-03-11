export interface HistoryEntry {
  seed: string
  score: number
  words: string[]
  possible: number
  date: string // ISO
}

const KEY = 'ruzzle:history'
const MAX = 30

export function saveToHistory(entry: HistoryEntry) {
  const history = getHistory()
  history.unshift(entry)
  if (history.length > MAX) history.splice(MAX)
  localStorage.setItem(KEY, JSON.stringify(history))
}

export function getHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function clearHistory() {
  localStorage.removeItem(KEY)
}
