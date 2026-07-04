import PyramidGameScreen, { type PyramidResult } from '../../components/PyramidGameScreen'
import DailyResultsScreen from '../../components/DailyResultsScreen'
import type { Grid as GridType } from '../gridGenerator'
import { isPyramidMode, isPyramidComplete, pyramidLevelsFound } from '../dailyModes'
import { loadDailySession } from '../dailySession'
import type { ModeAdapter, ModeGameScreenProps, ModeResultsScreenProps } from './types'

export interface PyramidState {
  grid: GridType
  validWords: Set<string>
  // Optionnels : présents si on reprend une session en cours
  initialFoundWords?: string[]
  initialPyramidFound?: Record<number, string>
  initialStartedAt?: number
}

function Game({ mode, state, onComplete, onAbandon, onRequestConfirm }: ModeGameScreenProps<PyramidState, PyramidResult>) {
  if (!isPyramidMode(mode)) return null
  return (
    <PyramidGameScreen
      mode={mode}
      grid={state.grid}
      validWords={state.validWords}
      initialFoundWords={state.initialFoundWords}
      initialPyramidFound={state.initialPyramidFound}
      initialStartedAt={state.initialStartedAt}
      onComplete={onComplete}
      onAbandon={onAbandon}
      onRequestConfirm={onRequestConfirm}
    />
  )
}

function Results({ mode, date, state, result, onBack }: ModeResultsScreenProps<PyramidState, PyramidResult>) {
  if (!isPyramidMode(mode)) return null
  return (
    <DailyResultsScreen
      date={date}
      mode={mode}
      elapsedSeconds={result.elapsedSecs}
      pyramidFound={result.pyramidFound}
      foundWords={result.foundWords}
      validWords={state.validWords}
      grid={state.grid}
      onBack={onBack}
    />
  )
}

export const pyramidAdapter: ModeAdapter<PyramidState, PyramidResult> = {
  init(mode, date, trie) {
    if (!isPyramidMode(mode)) throw new Error('pyramidAdapter.init called with non-pyramid mode')
    const { grid, validWords } = mode.generate(date, trie)
    // Vérifie une éventuelle session en cours (refresh / fermeture d'onglet)
    const session = loadDailySession(date)
    if (session) {
      return {
        grid,
        validWords,
        initialFoundWords: session.foundWords,
        initialPyramidFound: session.pyramidFound,
        initialStartedAt: session.startedAt,
      }
    }
    return { grid, validWords }
  },
  GameScreen: Game,
  ResultsScreen: Results,
  buildSubmitPayload(result, mode, date) {
    if (!isPyramidMode(mode)) return null
    return {
      date,
      mode: mode.id,
      elapsedSecs: result.elapsedSecs,
      completed: isPyramidComplete(mode, result.pyramidFound),
      levelsFound: pyramidLevelsFound(mode, result.pyramidFound),
      score: result.score,
      foundWords: result.foundWords,
      pyramidFound: result.pyramidFound,
    }
  },
}
