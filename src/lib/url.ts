export interface URLGameConfig {
  minLetters: 3 | 4 | 5 | 6 | 7;
  duration: 30 | 60 | 120 | 0;
}

export function getDailyDate(): string {
  const param = new URLSearchParams(window.location.search).get('daily')
  if (param) return param
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getSeedFromURL(): string | null {
  return new URLSearchParams(window.location.search).get('seed')
}

export function getConfigFromURL(): URLGameConfig {
  const params = new URLSearchParams(window.location.search)
  const min = parseInt(params.get('min') || '5')
  const dur = parseInt(params.get('dur') || '60')
  return {
    minLetters: ([3, 4, 5, 6, 7].includes(min) ? min : 5) as URLGameConfig['minLetters'],
    duration: ([30, 60, 120, 0].includes(dur) ? dur : 60) as URLGameConfig['duration'],
  }
}

export function setURLParams(seed: string, config: URLGameConfig) {
  const url = new URL(window.location.href)
  url.searchParams.set('seed', seed)
  url.searchParams.set('min', String(config.minLetters))
  url.searchParams.set('dur', String(config.duration))
  window.history.replaceState({}, '', url)
}

// Override de mode pour test : ?mode=triddle, ?mode=bigriddle, ?mode=ruddle, ?mode=speedle, etc.
export function getModeOverride(): string | null {
  return new URLSearchParams(window.location.search).get('mode')
}

export function buildShareURL(seed: string, config: URLGameConfig): string {
  const url = new URL(window.location.href)
  url.searchParams.set('seed', seed)
  url.searchParams.set('min', String(config.minLetters))
  url.searchParams.set('dur', String(config.duration))
  return url.toString()
}
