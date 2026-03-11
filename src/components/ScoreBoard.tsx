interface ScoreBoardProps {
  score: number
  wordCount: number
}

export default function ScoreBoard({ score, wordCount }: ScoreBoardProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center px-5 py-2 bg-slate-800 rounded-xl border border-slate-700">
        <span className="text-2xl font-bold text-white tabular-nums">{score}</span>
        <span className="text-xs text-slate-400">points</span>
      </div>
      <div className="flex flex-col items-center px-5 py-2 bg-slate-800 rounded-xl border border-slate-700">
        <span className="text-2xl font-bold text-white tabular-nums">{wordCount}</span>
        <span className="text-xs text-slate-400">mots</span>
      </div>
    </div>
  )
}
