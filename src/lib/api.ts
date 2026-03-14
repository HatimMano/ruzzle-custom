import { supabase } from './supabase'

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function ensureAuth(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  let userId: string
  if (session?.user) {
    userId = session.user.id
  } else {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    userId = data.user!.id
  }
  // Toujours s'assurer que le profil existe (résiste au drop/recreate de la table)
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' })
  return userId
}

export async function getUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

export async function setDisplayName(name: string): Promise<void> {
  const userId = await ensureAuth()
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name })
    .eq('id', userId)
  if (error) throw error
}

// ─── Daily challenge ─────────────────────────────────────────────────────────

export interface DailyResultPayload {
  date: string
  elapsedSecs: number
  completed: boolean
  levelsFound: number
  score: number
  foundWords: string[]
  pyramidFound: Record<number, string>
}

export async function submitDailyResult(payload: DailyResultPayload): Promise<void> {
  const userId = await ensureAuth()
  const { error } = await supabase.from('daily_results').insert({
    user_id: userId,
    date: payload.date,
    elapsed_secs: payload.elapsedSecs,
    completed: payload.completed,
    levels_found: payload.levelsFound,
    score: payload.score,
    found_words: payload.foundWords,
    pyramid_found: payload.pyramidFound,
  })
  // 23505 = unique violation → already submitted today, ignore silently
  if (error && error.code !== '23505') console.error('submitDailyResult:', error)
}

export interface LeaderboardEntry {
  rank: number
  display_name: string | null
  elapsed_secs: number
  levels_found: number
  score: number
  completed: boolean
  is_me: boolean
  pyramid_found: Record<string, string> | null
}

export async function fetchDailyLeaderboard(date: string): Promise<LeaderboardEntry[]> {
  const myId = await getUserId()
  const { data, error } = await supabase
    .from('daily_results')
    .select('user_id, elapsed_secs, levels_found, score, completed, pyramid_found, profiles(display_name)')
    .eq('date', date)
    .order('score', { ascending: false })
    .order('elapsed_secs', { ascending: true })
    .limit(20)
  if (error) { console.error('fetchDailyLeaderboard:', error); return [] }
  return (data ?? []).map((row, i) => ({
    rank: i + 1,
    display_name: (row.profiles as unknown as { display_name: string | null } | null)?.display_name ?? null,
    elapsed_secs: row.elapsed_secs,
    levels_found: row.levels_found,
    score: row.score,
    completed: row.completed,
    is_me: row.user_id === myId,
    pyramid_found: row.pyramid_found as Record<string, string> | null,
  }))
}

// ─── Player stats ─────────────────────────────────────────────────────────────

export interface PlayerStats {
  games_played: number
  total_score: number
  total_words_found: number
  total_letters_found: number
  words_by_length: Record<string, number>
  longest_word: string | null
  daily_played: number
  daily_completed: number
  daily_streak: number
  best_daily_streak: number
  best_daily_score: number
  fastest_complete_secs: number | null
  total_pyramid_levels: number
  free_games_played: number
  best_free_score: number
  challenges_played: number
  challenges_won: number
}

export async function fetchMyStats(): Promise<PlayerStats | null> {
  const myId = await getUserId()
  if (!myId) return null
  const { data, error } = await supabase
    .from('player_stats')
    .select('*')
    .eq('user_id', myId)
    .single()
  if (error) { console.error('fetchMyStats:', error); return null }
  return data as PlayerStats
}

// ─── Normal game results ──────────────────────────────────────────────────────

export interface GameResultPayload {
  seed: string
  score: number
  foundWords: string[]
  minLetters: number
  durationSecs: number
}

export async function submitGameResult(payload: GameResultPayload): Promise<void> {
  const userId = await ensureAuth()
  const display_name = localStorage.getItem('griddle:display_name') ?? null
  const { error } = await supabase.from('game_results').insert({
    user_id: userId,
    display_name,
    seed: payload.seed,
    score: payload.score,
    found_words: payload.foundWords,
    min_letters: payload.minLetters,
    duration_secs: payload.durationSecs,
  })
  if (error) console.error('submitGameResult:', error)
}
