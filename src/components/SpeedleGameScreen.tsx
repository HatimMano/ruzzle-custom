import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import Grid from './Grid'
import { isValidWord } from '../lib/dictionary'
import { type SpeedleMode } from '../lib/dailyModes'
import { useScoreAnimation } from '../hooks/useScoreAnimation'
import { useCountdown } from '../hooks/useCountdown'
import CountdownScreen from './CountdownScreen'
import { playValid, playInvalid, playDuplicate } from '../lib/audio'
import { getDailyAbandonMessage } from '../lib/abandonMessages'
import type { Cell, Grid as GridType } from '../lib/gridGenerator'

type FeedbackType = 'valid' | 'duplicate' | 'invalid' | null

export interface SpeedleResult {
  wordCount: number
  foundWords: string[]
  survivedSecs: number
  totalSecsGained: number
}

interface Props {
  mode: SpeedleMode
  grid: GridType
  validWords: Set<string>
  onComplete: (result: SpeedleResult) => void
  onAbandon: (result: SpeedleResult) => void
  onRequestConfirm: (message: string, onYes: () => void) => void
}

import { speedleSecsBonus as secsBonus } from '../lib/speedleScoring'

export default function SpeedleGameScreen({
  mode, grid, validWords, onComplete, onAbandon, onRequestConfirm,
}: Props) {
  const [foundWords, setFoundWords] = useState<string[]>([])
  const [timeMs, setTimeMs] = useState(mode.startSecs * 1000)
  const [isDone, setIsDone] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [bonusFlash, setBonusFlash] = useState<number | null>(null)

  const { anim: scoreAnim, trigger: triggerScoreAnim } = useScoreAnimation()
  const timeMsRef = useRef(mode.startSecs * 1000)
  const totalSecsGainedRef = useRef(0)
  const sessionStartRef = useRef(0)
  const lastTickRef = useRef(0)
  const tickerRef = useRef<number>(0)
  const foundWordsRef = useRef<string[]>([])
  const doneRef = useRef(false)
  foundWordsRef.current = foundWords

  const countdown = useCountdown(true, () => {
    sessionStartRef.current = Date.now()
    lastTickRef.current = Date.now()
    setIsRunning(true)
  })

  const buildResult = useCallback((): SpeedleResult => ({
    wordCount: foundWordsRef.current.length,
    foundWords: foundWordsRef.current,
    survivedSecs: Math.floor((Date.now() - sessionStartRef.current) / 1000),
    totalSecsGained: totalSecsGainedRef.current,
  }), [])

  const finish = useCallback((abandon: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    clearInterval(tickerRef.current)
    setIsDone(true)
    const result = buildResult()
    if (abandon) onAbandon(result)
    else onComplete(result)
  }, [buildResult, onComplete, onAbandon])

  useEffect(() => {
    if (!isRunning) return
    tickerRef.current = window.setInterval(() => {
      const now = Date.now()
      const delta = now - lastTickRef.current
      lastTickRef.current = now
      timeMsRef.current = Math.max(0, timeMsRef.current - delta)
      setTimeMs(timeMsRef.current)
      if (timeMsRef.current <= 0 && !doneRef.current) finish(false)
    }, 50)
    return () => clearInterval(tickerRef.current)
  }, [isRunning, finish])

  const handleWordSubmit = useCallback((cells: Cell[]): FeedbackType => {
    if (isDone || !isRunning) return null
    const word = cells.map(c => c.letter).join('').toLowerCase()
    if (word.length < mode.minWordLen) return null

    if (foundWordsRef.current.includes(word)) {
      playDuplicate()
      if ('vibrate' in navigator) navigator.vibrate(80)
      return 'duplicate'
    }
    if (!isValidWord(word)) {
      playInvalid()
      if ('vibrate' in navigator) navigator.vibrate([30, 30, 30])
      return 'invalid'
    }

    const bonus = secsBonus(word.length)
    // Cap à 2× le temps de départ
    timeMsRef.current = Math.min(timeMsRef.current + bonus * 1000, mode.startSecs * 2000)
    totalSecsGainedRef.current += bonus
    setFoundWords(prev => [...prev, word])
    if (bonus > 0) {
      triggerScoreAnim(bonus)
      setBonusFlash(bonus)
      setTimeout(() => setBonusFlash(null), 700)
    }
    playValid()
    if ('vibrate' in navigator) navigator.vibrate(40)
    return 'valid'
  }, [isDone, isRunning, mode.minWordLen, mode.startSecs, triggerScoreAnim])

  if (countdown !== null) return <CountdownScreen value={countdown} />

  const secs = Math.ceil(timeMs / 1000)
  const pct = Math.max(0, Math.min(1, timeMs / (mode.startSecs * 1000)))
  const isLow = secs <= 10
  const isMed = secs <= 20
  const timerColor = isLow ? '#ef4444' : isMed ? '#fb923c' : mode.palette.accent

  return (
    <div className="h-dvh bg-slate-900 flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem 0.875rem',
        borderBottom: '1px solid rgba(30,41,59,0.8)',
      }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.05em' }}>
          <span style={{ color: mode.palette.accent }}>⌛ SPEEDLE · DÉFI DU JOUR</span>
        </h1>
        <button
          onClick={() => onRequestConfirm(getDailyAbandonMessage(), () => finish(true))}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.45rem 0.75rem', borderRadius: '0.75rem',
            background: 'rgba(185,28,28,0.2)', border: '1px solid rgba(185,28,28,0.35)',
            color: '#fca5a5', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
          }}
        >
          <X size={13} />
          Quit
        </button>
      </div>

      {/* Score + timer */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0.75rem 1.25rem', gap: '1rem',
        background: 'rgba(15,23,42,0.6)',
        borderBottom: '1px solid rgba(30,41,59,0.6)',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {foundWords.length}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            / {validWords.size} mots
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem', minWidth: '4rem' }}>
          {bonusFlash !== null && (
            <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 700, textAlign: 'right' }}>
              +{bonusFlash}s ↑
            </span>
          )}
          <span style={{
            fontSize: '2rem', fontWeight: 900, color: timerColor,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1,
            animation: isLow ? 'pulse 0.6s ease-in-out infinite' : undefined,
          }}>
            {secs}s
          </span>
        </div>
      </div>

      {/* Timer bar (descend de gauche à droite) */}
      <div style={{ height: '5px', background: 'rgba(30,41,59,0.8)' }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: timerColor,
          transition: 'background 0.3s',
        }} />
      </div>

      {/* Grid */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div className="relative">
          <Grid grid={grid} onWordSubmit={handleWordSubmit} disabled={isDone || !isRunning} minLetters={mode.minWordLen} />
          {scoreAnim && (
            <div
              key={scoreAnim.id}
              className="absolute -top-10 left-1/2 -translate-x-1/2 text-green-400 font-black text-2xl animate-floatScore pointer-events-none whitespace-nowrap"
            >
              +{scoreAnim.pts}s
            </div>
          )}
        </div>

        {/* Found words strip */}
        {foundWords.length > 0 && (
          <div className="w-full overflow-x-auto flex gap-2 pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {[...foundWords].reverse().slice(0, 12).map((w, i) => {
              const b = secsBonus(w.length)
              const color = b >= 6 ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                : b >= 4 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                : b >= 2 ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
              return (
                <span
                  key={w}
                  className={`flex-none px-2.5 py-1 rounded-full border text-[11px] font-mono uppercase whitespace-nowrap ${color} ${i === 0 ? 'animate-slideIn' : ''}`}
                >
                  {w} <span className="opacity-50">+{b}s</span>
                </span>
              )
            })}
          </div>
        )}

        {/* Bonus hint */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {[3, 4, 5, 6, 7, 8].map(len => (
            <span
              key={len}
              style={{
                padding: '0.15rem 0.45rem', borderRadius: '0.4rem', fontSize: '0.6rem',
                color: '#475569', background: 'rgba(30,41,59,0.5)',
                border: '1px solid rgba(71,85,105,0.25)',
              }}
            >
              {len}L +{secsBonus(len)}s
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
