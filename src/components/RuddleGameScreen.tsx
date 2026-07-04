import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import Grid from './Grid'
import { isValidWord } from '../lib/dictionary'
import { scoreForWord } from '../lib/scoring'
import { type RuddleMode } from '../lib/dailyModes'
import { useScoreAnimation } from '../hooks/useScoreAnimation'
import { useCountdown } from '../hooks/useCountdown'
import CountdownScreen from './CountdownScreen'
import { playValid, playInvalid, playDuplicate } from '../lib/audio'
import { getDailyAbandonMessage } from '../lib/abandonMessages'
import type { Cell, Grid as GridType } from '../lib/gridGenerator'

type FeedbackType = 'valid' | 'duplicate' | 'invalid' | null

export interface RuddleResult {
  score: number
  foundWords: string[]
  elapsedSecs: number
}

interface Props {
  mode: RuddleMode
  grid: GridType
  validWords: Set<string>
  onComplete: (result: RuddleResult) => void
  onAbandon: (result: RuddleResult) => void
  onRequestConfirm: (message: string, onYes: () => void) => void
}

function fmtTimer(secs: number): string {
  const m = Math.floor(Math.max(0, secs) / 60)
  const s = Math.max(0, secs) % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RuddleGameScreen({
  mode, grid, validWords, onComplete, onAbandon, onRequestConfirm,
}: Props) {
  const [foundWords, setFoundWords] = useState<string[]>([])
  const [score, setScore] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState(mode.durationSecs)
  const [isDone, setIsDone] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  const { anim: scoreAnim, trigger: triggerScoreAnim } = useScoreAnimation()
  const startedAtRef = useRef<number>(0)
  const tickerRef = useRef<number>(0)
  const foundWordsRef = useRef<string[]>([])
  const scoreRef = useRef(0)
  const doneRef = useRef(false)
  foundWordsRef.current = foundWords
  scoreRef.current = score

  const countdown = useCountdown(true, () => {
    startedAtRef.current = Date.now()
    setIsRunning(true)
  })

  const buildResult = useCallback((elapsed: number): RuddleResult => ({
    score: scoreRef.current,
    foundWords: foundWordsRef.current,
    elapsedSecs: elapsed,
  }), [])

  const finish = useCallback((abandon: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    clearInterval(tickerRef.current)
    setIsDone(true)
    const elapsed = Math.min(mode.durationSecs, Math.floor((Date.now() - startedAtRef.current) / 1000))
    const result = buildResult(elapsed)
    if (abandon) onAbandon(result)
    else onComplete(result)
  }, [mode.durationSecs, buildResult, onComplete, onAbandon])

  useEffect(() => {
    if (!isRunning) return
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
      const remaining = mode.durationSecs - elapsed
      setTimeRemaining(Math.max(0, remaining))
      if (remaining <= 0 && !doneRef.current) finish(false)
    }
    tick()
    tickerRef.current = window.setInterval(tick, 250)
    return () => clearInterval(tickerRef.current)
  }, [isRunning, mode.durationSecs, finish])

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

    const pts = scoreForWord(word)
    setFoundWords(prev => [...prev, word])
    setScore(prev => prev + pts)
    if (pts > 0) triggerScoreAnim(pts)
    playValid()
    if ('vibrate' in navigator) navigator.vibrate(40)
    return 'valid'
  }, [isDone, isRunning, mode.minWordLen, triggerScoreAnim])

  if (countdown !== null) return <CountdownScreen value={countdown} />

  const pct = timeRemaining / mode.durationSecs
  const isLow = timeRemaining <= 20
  const isMed = timeRemaining <= 45
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
          <span style={{ color: mode.palette.accent }}>⚡ RUDDLE · DÉFI DU JOUR</span>
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

      {/* Score + timer bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0.75rem 1.25rem', gap: '1rem',
        background: 'rgba(15,23,42,0.6)',
        borderBottom: '1px solid rgba(30,41,59,0.6)',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
          <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {score}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>pts</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem', minWidth: '3.5rem' }}>
          <span style={{ fontSize: '0.65rem', color: '#475569' }}>{foundWords.length} mots</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: timerColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {fmtTimer(timeRemaining)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', background: 'rgba(30,41,59,0.8)' }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: timerColor, transition: 'width 0.25s linear, background 0.3s',
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
              +{scoreAnim.pts}
            </div>
          )}
        </div>

        {/* Found words strip */}
        {foundWords.length > 0 && (
          <div className="w-full overflow-x-auto flex gap-2 pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {[...foundWords].reverse().slice(0, 12).map((w, i) => {
              const s = scoreForWord(w)
              const color = s >= 12 ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                : s >= 7 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                : s >= 4 ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
              return (
                <span
                  key={w}
                  className={`flex-none px-2.5 py-1 rounded-full border text-[11px] font-mono uppercase whitespace-nowrap ${color} ${i === 0 ? 'animate-slideIn' : ''}`}
                >
                  {w} <span className="opacity-50">+{s}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
