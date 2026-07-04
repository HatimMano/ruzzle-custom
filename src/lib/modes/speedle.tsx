import SpeedleGameScreen, { type SpeedleResult } from '../../components/SpeedleGameScreen'
import SpeedleResultsScreen from '../../components/SpeedleResultsScreen'
import type { Grid as GridType } from '../gridGenerator'
import { isSpeedleMode } from '../dailyModes'
import type { ModeAdapter, ModeGameScreenProps, ModeResultsScreenProps } from './types'

export interface SpeedleState {
  grid: GridType
  validWords: Set<string>
}

function Game({ mode, state, onComplete, onAbandon, onRequestConfirm }: ModeGameScreenProps<SpeedleState, SpeedleResult>) {
  if (!isSpeedleMode(mode)) return null
  return (
    <SpeedleGameScreen
      mode={mode}
      grid={state.grid}
      validWords={state.validWords}
      onComplete={onComplete}
      onAbandon={onAbandon}
      onRequestConfirm={onRequestConfirm}
    />
  )
}

function Results({ mode, date, state, result, onBack }: ModeResultsScreenProps<SpeedleState, SpeedleResult>) {
  if (!isSpeedleMode(mode)) return null
  return (
    <SpeedleResultsScreen
      mode={mode}
      date={date}
      grid={state.grid}
      validWords={state.validWords}
      result={result}
      onBack={onBack}
    />
  )
}

// Score composite 3 tiers : survie prime, puis nb mots, puis mot le plus long.
// survivedSecs * 1_000_000 + wordCount * 100 + maxWordLen reste sous 2^31
// (limite : ~2100s = 35min de survie).
function speedleCompositeScore(result: SpeedleResult): number {
  const maxLen = result.foundWords.reduce((m, w) => Math.max(m, w.length), 0)
  return result.survivedSecs * 1_000_000 + result.wordCount * 100 + maxLen
}

export const speedleAdapter: ModeAdapter<SpeedleState, SpeedleResult> = {
  init(mode, date, trie) {
    if (!isSpeedleMode(mode)) throw new Error('speedleAdapter.init called with non-speedle mode')
    const { grid, validWords } = mode.generate(date, trie)
    return { grid, validWords }
  },
  GameScreen: Game,
  ResultsScreen: Results,
  buildSubmitPayload(result, mode, date) {
    if (!isSpeedleMode(mode)) return null
    return {
      date,
      mode: mode.id,
      elapsedSecs: result.survivedSecs,
      completed: true, // Speedle : le sablier finit toujours par tomber, résultat toujours valide
      levelsFound: result.wordCount,
      score: speedleCompositeScore(result),
      foundWords: result.foundWords,
      pyramidFound: {},
    }
  },
}
