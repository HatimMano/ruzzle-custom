import { useCallback, useEffect, useRef, useState } from 'react'
import Grid from './components/Grid'
import Timer from './components/Timer'
import ResultsScreen from './components/ResultsScreen'
import { loadDictionary, isValidWord, getTrie } from './lib/dictionary'
import { generateGrid } from './lib/gridGenerator'
import type { Cell, Grid as GridType } from './lib/gridGenerator'
import { scoreForWord } from './lib/scoring'
import { randomSeed } from './lib/prng'
import { saveToHistory, getHistory, clearHistory } from './lib/history'
import type { HistoryEntry } from './lib/history'
import { playValid, playInvalid, playDuplicate, playStreak, playCountdown, playGo } from './lib/audio'

const TIMER_DURATION = 60

const STREAK_BONUSES: [number, number][] = [[7, 5], [5, 3], [3, 1]]
function streakBonus(streak: number): number {
  for (const [threshold, bonus] of STREAK_BONUSES) {
    if (streak >= threshold) return bonus
  }
  return 0
}

type GameState = 'loading' | 'ready' | 'playing' | 'finished'
type FeedbackType = 'valid' | 'duplicate' | 'invalid' | null

function getSeedFromURL(): string | null {
  return new URLSearchParams(window.location.search).get('seed')
}

function setURLSeed(seed: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('seed', seed)
  window.history.replaceState({}, '', url)
}

function getBestScore(seed: string): number | null {
  const raw = localStorage.getItem(`ruzzle:best:${seed}`)
  return raw ? parseInt(raw) : null
}

function saveBestScore(seed: string, score: number): boolean {
  const prev = getBestScore(seed)
  if (prev === null || score > prev) {
    localStorage.setItem(`ruzzle:best:${seed}`, String(score))
    return true
  }
  return false
}


export default function App() {
  const [gameState, setGameState] = useState<GameState>('loading')
  const [seed, setSeed] = useState<string>('')
  const [grid, setGrid] = useState<GridType | null>(null)
  const [validWords, setValidWords] = useState<Set<string>>(new Set())
  const [foundWords, setFoundWords] = useState<string[]>([])
  const [score, setScore] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerKey, setTimerKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [isNewBest, setIsNewBest] = useState(false)

  const [countdown, setCountdown] = useState<number | null>(null)
  const [streak, setStreak] = useState(0)
  const [streakFlash, setStreakFlash] = useState<string | null>(null)
  const [scoreAnim, setScoreAnim] = useState<{ pts: number; id: number } | null>(null)

  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const copiedTimer = useRef<number>(0)
  const streakTimer = useRef<number>(0)
  const scoreAnimTimer = useRef<number>(0)
  const scoreRef = useRef(0)
  const foundWordsRef = useRef<string[]>([])
  scoreRef.current = score
  foundWordsRef.current = foundWords

  useEffect(() => {
    loadDictionary().then(() => {
      setHistory(getHistory())
      const s = getSeedFromURL() || randomSeed()
      initGame(s)
    })
  }, [])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      setGameState('playing')
      setTimerRunning(true)
      playGo()
      return
    }
    playCountdown()
    const t = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const initGame = (s: string) => {
    const trie = getTrie()
    if (!trie) return
    setURLSeed(s)
    setSeed(s)
    setBestScore(getBestScore(s))
    setIsNewBest(false)
    const { grid: g, validWords: vw } = generateGrid(s, trie)
    setGrid(g)
    setValidWords(vw)
    setFoundWords([])
    setScore(0)
    setStreak(0)
    setStreakFlash(null)
    setScoreAnim(null)
    setTimerRunning(false)
    setTimerKey(k => k + 1)
    setCountdown(null)
    setGameState('ready')
  }

  const startGame = () => setCountdown(3)

  const finishGame = useCallback((finalScore: number, finalWords: string[]) => {
    setTimerRunning(false)
    setGameState('finished')
    const newBest = saveBestScore(seed, finalScore)
    setIsNewBest(newBest)
    setBestScore(getBestScore(seed))
    const entry: HistoryEntry = {
      seed,
      score: finalScore,
      words: finalWords,
      possible: 0,
      date: new Date().toISOString(),
    }
    saveToHistory(entry)
    setHistory(getHistory())
  }, [seed])

  const endGame = useCallback(() => {
    finishGame(scoreRef.current, foundWordsRef.current)
  }, [finishGame])

  const stopGame = () => {
    setTimerRunning(false)
    setGameState('finished')
    const newBest = saveBestScore(seed, score)
    setIsNewBest(newBest)
    setBestScore(getBestScore(seed))
    saveToHistory({ seed, score, words: foundWords, possible: validWords.size, date: new Date().toISOString() })
    setHistory(getHistory())
  }

  const newGame = () => {
    if (gameState === 'playing' && !confirm('Abandonner la partie en cours ?')) return
    initGame(randomSeed())
  }

  const replayGame = () => initGame(seed)

  const handleWordSubmit = useCallback((cells: Cell[]): FeedbackType => {
    const word = cells.map(c => c.letter).join('').toLowerCase()

    if (foundWords.includes(word)) {
      playDuplicate()
      if ('vibrate' in navigator) navigator.vibrate(80)
      setStreak(0)
      return 'duplicate'
    }
    if (!isValidWord(word) || word.length < 5) {
      playInvalid()
      if ('vibrate' in navigator) navigator.vibrate([30, 30, 30])
      setStreak(0)
      return 'invalid'
    }

    const pts = scoreForWord(word)
    const newStreak = streak + 1
    const bonus = streakBonus(newStreak)
    const total = pts + bonus

    setFoundWords(prev => [...prev, word])
    setScore(prev => prev + total)
    setStreak(newStreak)

    // Animation score
    clearTimeout(scoreAnimTimer.current)
    setScoreAnim({ pts: total, id: Date.now() })
    scoreAnimTimer.current = window.setTimeout(() => setScoreAnim(null), 700)

    if (bonus > 0) {
      playStreak()
      clearTimeout(streakTimer.current)
      setStreakFlash(`🔥 Série ×${newStreak} ! +${bonus}pts bonus`)
      streakTimer.current = window.setTimeout(() => setStreakFlash(null), 1500)
    } else {
      playValid()
    }
    if ('vibrate' in navigator) navigator.vibrate(40)

    return 'valid'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundWords, streak])

  const copyLink = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('seed', seed)
    navigator.clipboard.writeText(url.toString())
    flash()
  }

  const flash = () => {
    setCopied(true)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  // === LOADING ===
  if (gameState === 'loading') {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-900">
        <div className="text-slate-400 text-lg animate-pulse">Chargement du dictionnaire…</div>
      </div>
    )
  }

  // === FINISHED ===
  if (gameState === 'finished' && grid) {
    return (
      <ResultsScreen
        seed={seed}
        score={score}
        foundWords={foundWords}
        validWords={validWords}
        grid={grid}
        timerDuration={TIMER_DURATION}
        isNewBest={isNewBest}
        bestScore={bestScore}
        onReplay={replayGame}
        onNewGame={newGame}
        onCopyLink={copyLink}
      />
    )
  }

  // Boutons header communs
  const headerButtons = [
    { icon: '📋', label: 'Historique', onClick: () => setShowHistory(h => !h) },
    { icon: copied ? '✓' : '🔗', label: copied ? 'Copié !' : 'Partager', onClick: copyLink },
    { icon: '✨', label: 'Nouvelle', onClick: newGame },
  ]

  // === READY ===
  if (gameState === 'ready') {
    return (
      <div className="h-dvh bg-slate-900 flex flex-col max-w-md mx-auto overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-black text-white tracking-tight">RUZZLE</h1>
            <span className="text-[10px] text-slate-600 font-mono tracking-widest">{seed}</span>
          </div>
          <div className="flex gap-4">
            {headerButtons.map(btn => (
              <button key={btn.label} onClick={btn.onClick} className="flex flex-col items-center gap-1 active:opacity-60 transition-opacity">
                <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center text-xl">{btn.icon}</div>
                <span className="text-[9px] text-slate-600 font-medium">{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Centre */}
        {countdown !== null ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[120px] font-black text-white animate-pop tabular-nums leading-none">
              {countdown}
            </span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-8 gap-8">
            <div className="text-center">
              <p className="text-7xl mb-5">🎯</p>
              <p className="text-slate-400 text-sm">5L=2 · 6L=4 · 7L=7 · 8L+=12 pts</p>
              {bestScore !== null && (
                <p className="text-yellow-600/80 text-xs mt-2 font-medium">🏆 Record : {bestScore} pts</p>
              )}
            </div>
            <button
              onClick={startGame}
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/40">
                <span className="text-4xl">▶</span>
              </div>
              <span className="text-white font-bold text-base">Démarrer</span>
            </button>
          </div>
        )}

        {/* Historique drawer */}
        {showHistory && (
          <div className="absolute inset-0 bg-slate-900/80 z-10 flex items-end" onClick={() => setShowHistory(false)}>
            <div className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[70vh] flex flex-col gap-3" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-white text-base">Historique</span>
                {history.length > 0 && (
                  <button onClick={() => { clearHistory(); setHistory([]) }} className="text-xs text-red-400 py-1 px-2">Effacer tout</button>
                )}
              </div>
              <div className="overflow-y-auto flex flex-col gap-2">
                {history.length === 0 && <p className="text-slate-600 text-sm text-center py-6">Aucune partie jouée</p>}
                {history.map((entry, i) => (
                  <button key={i} onClick={() => { setShowHistory(false); initGame(entry.seed) }}
                    className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-800 active:bg-slate-700 text-left w-full transition-colors">
                    <div>
                      <p className="font-mono text-slate-300 text-sm">{entry.seed}</p>
                      <p className="text-slate-600 text-xs mt-0.5">
                        {new Date(entry.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-yellow-400 text-lg">{entry.score}<span className="text-xs text-yellow-600 font-normal"> pts</span></p>
                      <p className="text-slate-600 text-xs">{entry.words.length} mots · Rejouer →</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // === PLAYING ===
  return (
    <div className="h-dvh bg-slate-900 flex flex-col max-w-md mx-auto overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-4 pb-5 border-b border-slate-800">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-black text-white tracking-tight">RUZZLE</h1>
          <span className="text-[10px] text-slate-600 font-mono tracking-widest">{seed}</span>
        </div>
        <div className="flex gap-4">
          {headerButtons.map(btn => (
            <button key={btn.label} onClick={btn.onClick} className="flex flex-col items-center gap-1 active:opacity-60 transition-opacity">
              <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center text-xl">{btn.icon}</div>
              <span className="text-[9px] text-slate-600 font-medium">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Score bar */}
      <div className="flex items-center px-5 py-3 gap-4 bg-slate-800/40">
        <div className="flex items-baseline gap-1 flex-1">
          <span className="text-4xl font-black text-white tabular-nums">{score}</span>
          <span className="text-slate-500 text-sm">pts</span>
        </div>
        {streak >= 3 && (
          <div className="flex items-center gap-1 text-orange-400 font-bold animate-pop">
            <span className="text-lg">🔥</span>
            <span className="text-sm">×{streak}</span>
          </div>
        )}
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-slate-300 tabular-nums">{foundWords.length}</span>
          <span className="text-slate-600 text-sm">/{validWords.size}</span>
        </div>
        <Timer key={timerKey} duration={TIMER_DURATION} running={timerRunning} onEnd={endGame} />
      </div>

      {/* Grille */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div className="relative">
          {grid && (
            <Grid
              grid={grid}
              onWordSubmit={handleWordSubmit}
              disabled={false}
            />
          )}
          {/* Animation score */}
          {scoreAnim && (
            <div
              key={scoreAnim.id}
              className="absolute -top-10 left-1/2 -translate-x-1/2 text-green-400 font-black text-2xl animate-floatScore pointer-events-none whitespace-nowrap"
            >
              +{scoreAnim.pts}
            </div>
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/85 rounded-2xl">
              <span className="text-9xl font-black text-white animate-pop tabular-nums">
                {countdown === 0 ? 'Go' : countdown}
              </span>
            </div>
          )}
        </div>

        {streakFlash && (
          <div className="px-5 py-2 rounded-full bg-orange-500/15 border border-orange-500/25 text-orange-300 text-sm font-bold animate-pop">
            {streakFlash}
          </div>
        )}

        {foundWords.length > 0 && (
          <div className="w-full overflow-x-auto flex gap-2 pb-0.5" style={{scrollbarWidth:'none'}}>
            {[...foundWords].reverse().slice(0, 12).map((w, i) => {
              const s = scoreForWord(w)
              const color = s >= 12 ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                : s >= 7 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                : s >= 4 ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
              return (
                <span key={w} className={`flex-none px-2.5 py-1 rounded-full border text-[11px] font-mono uppercase whitespace-nowrap ${color} ${i === 0 ? 'animate-slideIn' : ''}`}>
                  {w} <span className="opacity-50">+{s}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Bouton terminer */}
      <div className="px-5 pb-8 pt-2">
        <button
          onClick={stopGame}
          className="w-full py-4 rounded-full bg-slate-800 active:bg-slate-700 text-slate-500 active:text-slate-300 text-sm font-semibold transition-colors"
        >
          Terminer la partie
        </button>
      </div>

      {/* Historique drawer */}
      {showHistory && (
        <div className="absolute inset-0 bg-slate-900/80 z-10 flex items-end" onClick={() => setShowHistory(false)}>
          <div className="w-full bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[70vh] flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1" />
            <div className="flex justify-between items-center">
              <span className="font-bold text-white text-base">Historique</span>
              {history.length > 0 && (
                <button onClick={() => { clearHistory(); setHistory([]) }} className="text-xs text-red-400 py-1 px-2">Effacer tout</button>
              )}
            </div>
            <div className="overflow-y-auto flex flex-col gap-2">
              {history.length === 0 && <p className="text-slate-600 text-sm text-center py-6">Aucune partie jouée</p>}
              {history.map((entry, i) => (
                <button key={i} onClick={() => { setShowHistory(false); initGame(entry.seed) }}
                  className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-800 active:bg-slate-700 text-left w-full transition-colors">
                  <div>
                    <p className="font-mono text-slate-300 text-sm">{entry.seed}</p>
                    <p className="text-slate-600 text-xs mt-0.5">
                      {new Date(entry.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-yellow-400 text-lg">{entry.score}<span className="text-xs text-yellow-600 font-normal"> pts</span></p>
                    <p className="text-slate-600 text-xs">{entry.words.length} mots · Rejouer →</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
