import RuddleGameScreen, { type RuddleResult } from '../../components/RuddleGameScreen'
import RuddleResultsScreen from '../../components/RuddleResultsScreen'
import type { Grid as GridType } from '../gridGenerator'
import { isRuddleMode } from '../dailyModes'
import type { ModeAdapter, ModeGameScreenProps, ModeResultsScreenProps } from './types'

export interface RuddleState {
  grid: GridType
  validWords: Set<string>
}

function Game({ mode, state, onComplete, onAbandon, onRequestConfirm }: ModeGameScreenProps<RuddleState, RuddleResult>) {
  if (!isRuddleMode(mode)) return null
  return (
    <RuddleGameScreen
      mode={mode}
      grid={state.grid}
      validWords={state.validWords}
      onComplete={onComplete}
      onAbandon={onAbandon}
      onRequestConfirm={onRequestConfirm}
    />
  )
}

function Results({ mode, date, state, result, onBack }: ModeResultsScreenProps<RuddleState, RuddleResult>) {
  if (!isRuddleMode(mode)) return null
  return (
    <RuddleResultsScreen
      mode={mode}
      date={date}
      grid={state.grid}
      validWords={state.validWords}
      result={result}
      onBack={onBack}
    />
  )
}

export const ruddleAdapter: ModeAdapter<RuddleState, RuddleResult> = {
  init(mode, date, trie) {
    if (!isRuddleMode(mode)) throw new Error('ruddleAdapter.init called with non-ruddle mode')
    const { grid, validWords } = mode.generate(date, trie)
    return { grid, validWords }
  },
  GameScreen: Game,
  ResultsScreen: Results,
  buildSubmitPayload(result, mode, date) {
    if (!isRuddleMode(mode)) return null
    return {
      date,
      mode: mode.id,
      elapsedSecs: result.elapsedSecs,
      completed: true, // Ruddle : le temps s'écoule inévitablement, résultat toujours valide
      levelsFound: result.foundWords.length,
      score: result.score,
      foundWords: result.foundWords,
      pyramidFound: {},
    }
  },
}
