import TriddleGameScreen, { type TriddleResult } from '../../components/TriddleGameScreen'
import TriddleResultsScreen from '../../components/TriddleResultsScreen'
import type { Grid as GridType } from '../gridGenerator'
import { isTriddleMode, isPyramidComplete, pyramidLevelsFound } from '../dailyModes'
import type { ModeAdapter, ModeGameScreenProps, ModeResultsScreenProps } from './types'

export interface TriddleState {
  grids: GridType[]
  validWordsPerGrid: Set<string>[]
}

function Game({ mode, state, onComplete, onAbandon, onRequestConfirm }: ModeGameScreenProps<TriddleState, TriddleResult>) {
  if (!isTriddleMode(mode)) return null
  return (
    <TriddleGameScreen
      mode={mode}
      grids={state.grids}
      validWordsPerGrid={state.validWordsPerGrid}
      onComplete={onComplete}
      onAbandon={onAbandon}
      onRequestConfirm={onRequestConfirm}
    />
  )
}

function Results({ mode, date, state, result, onBack }: ModeResultsScreenProps<TriddleState, TriddleResult>) {
  if (!isTriddleMode(mode)) return null
  return (
    <TriddleResultsScreen
      mode={mode}
      date={date}
      result={result}
      grids={state.grids}
      validWordsPerGrid={state.validWordsPerGrid}
      onBack={onBack}
    />
  )
}

export const triddleAdapter: ModeAdapter<TriddleState, TriddleResult> = {
  init(mode, date, trie) {
    if (!isTriddleMode(mode)) throw new Error('triddleAdapter.init called with non-triddle mode')
    const { grids, validWordsPerGrid } = mode.generate(date, trie)
    return { grids, validWordsPerGrid }
  },
  GameScreen: Game,
  ResultsScreen: Results,
  buildSubmitPayload(result, mode, date) {
    if (!isTriddleMode(mode)) return null
    const allFull = result.pyramidFoundPerGrid.every((p) => isPyramidComplete(mode, p))
    const totalLevels = result.pyramidFoundPerGrid.reduce(
      (acc, p) => acc + pyramidLevelsFound(mode, p),
      0,
    )
    const nestedPyramid = result.pyramidFoundPerGrid.reduce(
      (acc, p, i) => { acc[String(i)] = p; return acc },
      {} as Record<string, Record<number, string>>,
    )
    return {
      date,
      mode: mode.id, // reste 'marathon' pour compat DB (voir dailyModes.ts)
      elapsedSecs: result.totalElapsedSecs,
      completed: allFull,
      levelsFound: totalLevels,
      score: result.totalScore,
      foundWords: result.foundWordsPerGrid.flat(),
      pyramidFound: nestedPyramid,
    }
  },
}
