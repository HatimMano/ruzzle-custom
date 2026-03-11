import { useRef, useState } from 'react'
import Grid from './Grid'
import { scoreForWord } from '../lib/scoring'
import { findWordPath } from '../lib/gridGenerator'
import type { Cell, Grid as GridType } from '../lib/gridGenerator'

interface Props {
  seed: string
  score: number
  foundWords: string[]
  validWords: Set<string>
  grid: GridType
  timerDuration: number
  isNewBest: boolean
  bestScore: number | null
  onReplay: () => void
  onNewGame: () => void
  onCopyLink: () => void
}

type Tab = 'trouves' | 'rates'

const SCORE_COLOR: Record<number, string> = {
  2:  'text-slate-400',
  4:  'text-violet-400',
  7:  'text-yellow-400',
  12: 'text-orange-400',
}

const SCORE_BG: Record<number, string> = {
  2:  'bg-slate-800',
  4:  'bg-violet-900/40',
  7:  'bg-yellow-900/40',
  12: 'bg-orange-900/40',
}

export default function ResultsScreen({
  seed, score, foundWords, validWords, grid, timerDuration,
  isNewBest, bestScore, onReplay, onNewGame, onCopyLink,
}: Props) {
  const [tab, setTab] = useState<Tab>('trouves')
  const [discoveryWord, setDiscoveryWord] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number>(0)

  const missed = [...validWords]
    .filter(w => !foundWords.includes(w))
    .sort((a, b) => scoreForWord(b) - scoreForWord(a) || a.localeCompare(b))

  const pct = validWords.size > 0 ? Math.round(foundWords.length / validWords.size * 100) : 0
  const discoveryPath: Cell[] | null = discoveryWord ? findWordPath(grid, discoveryWord) : null

  const mins = Math.floor(timerDuration / 60)
  const secs = timerDuration % 60
  const timeStr = mins > 0 ? `${mins}m${secs > 0 ? secs + 's' : ''}` : `${secs}s`

  const summary = [
    `🎯 Ruzzle — seed: ${seed}`,
    `⏱ ${timeStr} | 🏆 ${score} pts | 📝 ${foundWords.length}/${validWords.size} mots`,
    '',
    ...foundWords.map(w => {
      const s = scoreForWord(w)
      return `${s >= 12 ? '🔥' : s >= 7 ? '⭐' : s >= 4 ? '✨' : '·'} ${w.toUpperCase()} (+${s}pts)`
    }),
  ].join('\n')

  function copySummary() {
    navigator.clipboard.writeText(summary)
    setCopied(true)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-dvh bg-slate-900 flex flex-col max-w-md mx-auto">

      {/* Hero */}
      <div className="px-5 pt-6 pb-5 flex-none">
        <p className="text-[10px] text-slate-600 font-mono tracking-widest mb-4">SEED : {seed}</p>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className={`text-6xl font-black tabular-nums leading-none ${isNewBest ? 'text-yellow-400' : 'text-white'}`}>
                {score}
              </span>
              <span className="text-slate-500 text-lg font-medium">pts</span>
            </div>
            {isNewBest
              ? <p className="text-yellow-500 text-xs font-semibold mt-1.5">🏆 Nouveau record !</p>
              : bestScore !== null
              ? <p className="text-slate-600 text-xs mt-1.5">record : {bestScore} pts</p>
              : null
            }
          </div>

          {/* Cercle progression */}
          <div className="relative w-20 h-20">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" strokeWidth="7" />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke={pct >= 80 ? '#22c55e' : pct >= 50 ? '#3b82f6' : '#64748b'}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-white font-black text-lg leading-none tabular-nums">{foundWords.length}</span>
              <span className="text-slate-500 text-[10px]">/{validWords.size}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — pill style */}
      <div className="flex-none px-5 pb-3">
        <div className="flex bg-slate-800/60 rounded-full p-1 gap-1">
          {([
            { id: 'trouves' as Tab, label: 'Trouvés', n: foundWords.length },
            { id: 'rates'   as Tab, label: 'Ratés',   n: missed.length },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setDiscoveryWord(null) }}
              className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500'
              }`}
            >
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-700 text-slate-500'
              }`}>
                {t.n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Liste — scrollable */}
      <div className="flex-1 overflow-y-auto px-5">

        {tab === 'trouves' && (
          <div className="pb-4">
            {foundWords.length === 0 && (
              <p className="text-slate-600 text-sm text-center py-12">Aucun mot trouvé</p>
            )}
            {[...foundWords].reverse().map((w, i) => {
              const s = scoreForWord(w)
              return (
                <div
                  key={w}
                  className={`flex items-center justify-between py-3 ${i > 0 ? 'border-t border-slate-800/80' : ''}`}
                >
                  <span className="font-semibold text-white uppercase tracking-wide text-[15px]">{w}</span>
                  <span className={`text-xs font-bold tabular-nums px-2 py-1 rounded-full ${SCORE_BG[s] ?? 'bg-slate-800'} ${SCORE_COLOR[s] ?? 'text-slate-400'}`}>+{s} pts</span>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'rates' && (
          <div className="pb-4">
            {missed.length === 0 && (
              <p className="text-green-500 text-sm text-center py-12">🎉 Tu as tout trouvé !</p>
            )}

            {discoveryWord && (
              <div className="mb-4 p-4 rounded-3xl bg-slate-800/80 border border-violet-500/20 flex flex-col items-center gap-2">
                <p className="text-violet-300 font-bold tracking-widest uppercase text-sm">{discoveryWord}</p>
                {discoveryPath
                  ? <Grid grid={grid} onWordSubmit={() => null} disabled discoveryPath={discoveryPath} />
                  : <p className="text-slate-500 text-sm">Chemin non trouvé</p>
                }
              </div>
            )}

            {missed.map((w, i) => {
              const s = scoreForWord(w)
              const active = discoveryWord === w
              return (
                <button
                  key={w}
                  onClick={() => setDiscoveryWord(prev => prev === w ? null : w)}
                  className={`flex items-center justify-between py-3 w-full text-left ${
                    i > 0 ? 'border-t border-slate-800/80' : ''
                  }`}
                >
                  <span className={`font-semibold uppercase tracking-wide text-[15px] transition-colors ${active ? 'text-violet-300' : 'text-slate-400'}`}>
                    {w}
                  </span>
                  <span className={`text-xs font-bold tabular-nums px-2 py-1 rounded-full ${SCORE_BG[s] ?? 'bg-slate-800'} ${active ? 'text-violet-300' : SCORE_COLOR[s] ?? 'text-slate-500'}`}>+{s} pts</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="flex-none px-6 pt-4 pb-7 border-t border-slate-800/80">
        <div className="flex justify-around">
          {[
            { icon: copied ? '✓' : '📋', label: copied ? 'Copié !' : 'Résumé', onClick: copySummary, primary: true },
            { icon: '🔗', label: 'Partager', onClick: onCopyLink, primary: false },
            { icon: '↺', label: 'Rejouer', onClick: onReplay, primary: false },
            { icon: '✨', label: 'Nouvelle', onClick: onNewGame, primary: false },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              className="flex flex-col items-center gap-1 active:opacity-60 transition-opacity"
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg ${
                btn.primary
                  ? 'bg-blue-600 shadow-blue-600/30'
                  : 'bg-slate-800'
              }`}>
                {btn.icon}
              </div>
              <span className="text-[10px] text-slate-500 font-medium mt-0.5">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
