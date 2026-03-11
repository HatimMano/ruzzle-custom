import { useState, useRef } from 'react'
import { scoreForWord } from '../lib/scoring'

const PYRAMID_LENGTHS = [3, 4, 5, 6, 7, 8] as const

const SCORE_COLOR: Record<number, string> = {
  1: 'text-slate-400', 2: 'text-slate-400',
  4: 'text-violet-400', 7: 'text-yellow-400', 12: 'text-orange-400',
}
const SCORE_BG: Record<number, string> = {
  1: 'bg-slate-800', 2: 'bg-slate-800',
  4: 'bg-violet-900/40', 7: 'bg-yellow-900/40', 12: 'bg-orange-900/40',
}

interface Props {
  date: string
  elapsedSeconds: number
  pyramidFound: Record<number, string>
  foundWords: string[]
  validWords: Set<string>
  onBack: () => void
}

type Tab = 'pyramide' | 'rates'

function fmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`
}

function PyramidSlot({ len, word }: { len: number; word?: string }) {
  const label = len === 8 ? '8L+' : `${len}L`
  const filled = !!word
  return (
    <div className={`w-24 h-[72px] flex flex-col items-center justify-center rounded-2xl border transition-all duration-300 ${
      filled
        ? 'bg-green-500/15 border-green-500/40 shadow-lg shadow-green-500/10'
        : 'bg-slate-800/60 border-slate-700'
    }`}>
      <span className={`text-[11px] font-bold ${filled ? 'text-green-400' : 'text-slate-600'}`}>{label}</span>
      {word
        ? <span className="text-[10px] text-green-300 uppercase font-mono mt-1 text-center leading-tight px-1 break-all">{word}</span>
        : <span className="text-slate-700 text-lg mt-0.5">·</span>
      }
    </div>
  )
}

export default function DailyResultsScreen({ date, elapsedSeconds, pyramidFound, foundWords, validWords, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('pyramide')
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number>(0)

  const completed = PYRAMID_LENGTHS.every(l => !!pyramidFound[l])
  const found = PYRAMID_LENGTHS.filter(l => !!pyramidFound[l]).length

  const missed = [...validWords]
    .filter(w => !foundWords.includes(w))
    .sort((a, b) => scoreForWord(b) - scoreForWord(a) || a.localeCompare(b))

  function copySummary() {
    const lines = [
      `⚡ Ruzzle — Défi du jour ${date}`,
      completed
        ? `🏆 Pyramide complète en ${fmtTime(elapsedSeconds)} !`
        : `🔶 ${found}/6 niveaux — ${fmtTime(elapsedSeconds)}`,
      '',
      ...PYRAMID_LENGTHS.map(l => {
        const w = pyramidFound[l]
        const lbl = l === 8 ? '8L+' : `${l}L`
        return `${w ? '✅' : '⬜'} ${lbl}${w ? ' · ' + w.toUpperCase() : ''}`
      }),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-dvh bg-slate-900 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 flex-none">
        <p className="text-[10px] text-slate-600 font-mono tracking-widest mb-3">⚡ DÉFI DU JOUR · {date}</p>

        {completed ? (
          <div>
            <span className="text-6xl font-black text-yellow-400 tabular-nums leading-none">{fmtTime(elapsedSeconds)}</span>
            <p className="text-yellow-500 text-xs font-semibold mt-2">🏆 Pyramide complète !</p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-white tabular-nums leading-none">{found}</span>
              <span className="text-slate-500 text-xl font-medium">/6 niveaux</span>
            </div>
            <p className="text-slate-500 text-xs mt-1.5">Pyramide incomplète · {fmtTime(elapsedSeconds)}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-none px-5 pb-3">
        <div className="flex bg-slate-800/60 rounded-full p-1 gap-1">
          {([
            { id: 'pyramide' as Tab, label: 'Pyramide' },
            { id: 'rates' as Tab, label: 'Mots ratés', n: missed.length },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
              {t.n !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.id ? 'bg-slate-100 text-slate-600' : 'bg-slate-700 text-slate-500'
                }`}>{t.n}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'pyramide' && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-6">
            <p className="text-slate-600 text-[10px] font-semibold tracking-widest uppercase mb-2">La Pyramide</p>
            <div className="flex justify-center">
              <PyramidSlot len={8} word={pyramidFound[8]} />
            </div>
            <div className="flex gap-2 justify-center">
              <PyramidSlot len={6} word={pyramidFound[6]} />
              <PyramidSlot len={7} word={pyramidFound[7]} />
            </div>
            <div className="flex gap-2 justify-center">
              <PyramidSlot len={3} word={pyramidFound[3]} />
              <PyramidSlot len={4} word={pyramidFound[4]} />
              <PyramidSlot len={5} word={pyramidFound[5]} />
            </div>
          </div>
        )}

        {tab === 'rates' && (
          <div className="px-5 pb-4">
            {missed.length === 0 && (
              <p className="text-green-500 text-sm text-center py-12">🎉 Tu as tout trouvé !</p>
            )}
            {missed.map((w, i) => {
              const s = scoreForWord(w)
              return (
                <div
                  key={w}
                  className={`flex items-center justify-between py-3 ${i > 0 ? 'border-t border-slate-800/80' : ''}`}
                >
                  <span className="font-semibold text-slate-400 uppercase tracking-wide text-[15px]">{w}</span>
                  <span className={`text-xs font-bold tabular-nums px-2 py-1 rounded-full ${SCORE_BG[s] ?? 'bg-slate-800'} ${SCORE_COLOR[s] ?? 'text-slate-500'}`}>+{s} pts</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-none px-6 pt-4 pb-7 border-t border-slate-800/80">
        <div className="flex justify-around">
          <button onClick={copySummary} className="flex flex-col items-center gap-1 active:opacity-60 transition-opacity">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg bg-blue-600 shadow-blue-600/30">
              {copied ? '✓' : '📋'}
            </div>
            <span className="text-[10px] text-slate-500 font-medium mt-0.5">{copied ? 'Copié !' : 'Résumé'}</span>
          </button>
          <button onClick={onBack} className="flex flex-col items-center gap-1 active:opacity-60 transition-opacity">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl bg-slate-800">🏠</div>
            <span className="text-[10px] text-slate-500 font-medium mt-0.5">Accueil</span>
          </button>
        </div>
      </div>
    </div>
  )
}
