import type { ComponentType } from 'react'
import type { DailyMode } from '../dailyModes'
import type { Trie } from '../dictionary'
import type { DailyResultPayload } from '../api'

// Callbacks partagés par tous les GameScreen daily.
export interface ModeGameScreenCallbacks<TResult> {
  onComplete: (result: TResult) => void
  onAbandon: (result: TResult) => void
  onRequestConfirm: (message: string, onYes: () => void) => void
}

export interface ModeGameScreenProps<TState, TResult> extends ModeGameScreenCallbacks<TResult> {
  mode: DailyMode
  state: TState
}

export interface ModeResultsScreenProps<TState, TResult> {
  mode: DailyMode
  date: string
  state: TState
  result: TResult
  onBack: () => void
}

// Un ModeAdapter encapsule tout ce qu'il faut savoir pour faire tourner
// un mode daily de bout en bout : init d'état, rendu du jeu, rendu des
// résultats, et sérialisation vers Supabase.
export interface ModeAdapter<TState = unknown, TResult = unknown> {
  // Prépare le state initial (grille, validWords, etc.) à partir du mode + date + trie.
  init(mode: DailyMode, date: string, trie: Trie): TState

  // Composant à rendre pendant PLAYING.
  GameScreen: ComponentType<ModeGameScreenProps<TState, TResult>>

  // Composant à rendre pendant FINISHED.
  ResultsScreen: ComponentType<ModeResultsScreenProps<TState, TResult>>

  // Convertit un result → payload Supabase. Retourne null si on ne veut pas soumettre.
  buildSubmitPayload(result: TResult, mode: DailyMode, date: string): DailyResultPayload | null
}
