let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function beep(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.25) {
  const ac = getCtx()
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration)
  osc.start()
  osc.stop(ac.currentTime + duration)
}

export function playValid() {
  beep(660, 0.12)
  setTimeout(() => beep(880, 0.15), 80)
}

export function playStreak() {
  beep(660, 0.1)
  setTimeout(() => beep(880, 0.1), 70)
  setTimeout(() => beep(1100, 0.2), 140)
}

export function playInvalid() {
  beep(200, 0.15, 'sawtooth', 0.15)
}

export function playDuplicate() {
  beep(330, 0.1, 'triangle', 0.15)
}

export function playCountdown() {
  beep(440, 0.1)
}

export function playGo() {
  beep(660, 0.08)
  setTimeout(() => beep(880, 0.15), 60)
}
