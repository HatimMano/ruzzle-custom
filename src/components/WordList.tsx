import { scoreForWord } from '../lib/scoring'

interface WordListProps {
  words: string[]
  totalPossible?: number
}

export default function WordList({ words, totalPossible }: WordListProps) {
  const scoreColors: Record<number, string> = {
    2: 'text-blue-400',
    4: 'text-purple-400',
    7: 'text-yellow-400',
    12: 'text-orange-400',
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between items-baseline text-xs text-slate-400 px-1">
        <span>Mots trouvés</span>
        {totalPossible !== undefined && (
          <span>{words.length} / {totalPossible}</span>
        )}
      </div>
      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
        {words.length === 0 && (
          <p className="text-slate-600 text-sm text-center py-4">Aucun mot trouvé</p>
        )}
        {[...words].reverse().map((word, i) => {
          const score = scoreForWord(word)
          return (
            <div
              key={word}
              className={`flex justify-between items-center px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm animate-slideIn ${i === 0 ? 'border-slate-600' : ''}`}
            >
              <span className="font-medium tracking-wide uppercase text-slate-200">{word}</span>
              <span className={`font-bold text-xs ${scoreColors[score] ?? 'text-slate-400'}`}>+{score}pts</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
