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

// pyramid_found est jsonb côté DB. Pour les modes pyramide simples : Record<number, string>.
// Pour marathon : Record<string, Record<number, string>> (clé = index de la grille).
export type PyramidFoundPayload =
  | Record<number, string>
  | Record<string, Record<number, string>>

export interface DailyResultPayload {
  date: string
  mode: string
  elapsedSecs: number
  completed: boolean
  levelsFound: number
  score: number
  foundWords: string[]
  pyramidFound: PyramidFoundPayload
}

// Soumission via Edge Function `submit_daily` (anti-cheat) :
// le serveur régénère la grille, valide chaque mot, recalcule le score canoniquement
// et fait l'insert avec service role. Le client ne dicte plus le score.
export async function submitDailyResult(payload: DailyResultPayload): Promise<void> {
  await ensureAuth()
  const { data, error } = await supabase.functions.invoke('submit_daily', {
    body: {
      date: payload.date,
      mode: payload.mode,
      elapsedSecs: payload.elapsedSecs,
      foundWords: payload.foundWords,
      pyramidFound: payload.pyramidFound,
    },
  })
  if (error) {
    console.error('[submitDailyResult] edge function error:', error)
    return
  }
  if (data && (data as { ok?: boolean }).ok === false) {
    console.error('[submitDailyResult] server rejected:', data)
    return
  }
  console.log('[submitDailyResult] success', data)
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
  mode: string
}

export async function fetchDailyLeaderboard(date: string): Promise<LeaderboardEntry[]> {
  const myId = await getUserId()
  const { data, error } = await supabase
    .from('daily_results')
    .select('user_id, elapsed_secs, levels_found, score, completed, pyramid_found, mode, profiles(display_name)')
    .eq('date', date)
    .order('score', { ascending: false })
    .order('elapsed_secs', { ascending: true })
    .order('created_at', { ascending: true })  // tiebreaker : premier qui finit gagne
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
    mode: (row as { mode?: string }).mode ?? 'classic',
  }))
}

// ─── Classement Semaine / Mois ───────────────────────────────────────────────

export type LeaderboardPeriod = 'week' | 'month'

export interface AggregateLeaderboardEntry {
  rank: number
  user_id: string
  display_name: string | null
  points: number
  top1: number
  top2: number
  top3: number
  total_played: number
  weekly_bonus: number
  is_me: boolean
}

// period : 'week' (lundi-dimanche en cours) ou 'month' (mois en cours).
// Pour 'month', les points incluent un bonus +5/+3/+1 pour le top1/2/3 de
// chaque semaine TERMINÉE appartenant au mois.
// Source : RPC SQL `top_aggregated_players` (voir supabase_migration_leaderboard.sql).
export async function fetchAggregateLeaderboard(
  period: LeaderboardPeriod = 'month',
  lim = 10
): Promise<AggregateLeaderboardEntry[]> {
  const myId = await getUserId()
  const { data, error } = await supabase.rpc('top_aggregated_players', {
    period,
    lim,
  })
  if (error) { console.error('fetchAggregateLeaderboard:', error); return [] }
  return ((data as Array<{
    user_id: string
    display_name: string | null
    points: number
    top1: number
    top2: number
    top3: number
    total_played: number
    weekly_bonus: number
  }>) ?? []).map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id,
    display_name: row.display_name,
    points: row.points,
    top1: row.top1,
    top2: row.top2,
    top3: row.top3,
    total_played: row.total_played,
    weekly_bonus: row.weekly_bonus ?? 0,
    is_me: row.user_id === myId,
  }))
}

// ─── Mes stats agrégées (pour la section "Vous" du classement) ───────────────

export interface MyAggregateStats {
  rank: number | null  // null si pas encore classé (0 podium)
  points: number
  top1: number
  top2: number
  top3: number
  total_played: number
  total_ranked: number  // nombre total de joueurs avec ≥ 1 podium
  weekly_bonus: number
}

export async function fetchMyAggregateStats(period: LeaderboardPeriod = 'month'): Promise<MyAggregateStats | null> {
  const myId = await getUserId()
  if (!myId) return null
  const { data, error } = await supabase.rpc('my_aggregate_stats', {
    my_id: myId,
    period,
  })
  if (error) { console.error('fetchMyAggregateStats:', error); return null }
  const row = (data as MyAggregateStats[] | null)?.[0]
  if (!row) return null
  return {
    rank: row.rank ?? null,
    points: row.points ?? 0,
    top1: row.top1 ?? 0,
    top2: row.top2 ?? 0,
    top3: row.top3 ?? 0,
    total_played: row.total_played ?? 0,
    total_ranked: row.total_ranked ?? 0,
    weekly_bonus: row.weekly_bonus ?? 0,
  }
}

// ─── Record d'un mode (pour la carte d'accueil) ──────────────────────────────

export interface ModeRecord {
  display_name: string | null
  elapsed_secs: number
  date: string
}

// Renvoie le record (temps le plus rapide, défi complété) pour un mode donné, all-time.
export async function fetchModeRecord(modeId: string): Promise<ModeRecord | null> {
  const { data, error } = await supabase
    .from('daily_results')
    .select('elapsed_secs, date, profiles(display_name)')
    .eq('mode', modeId)
    .eq('completed', true)
    .order('elapsed_secs', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) { console.error('fetchModeRecord:', error); return null }
  if (!data) return null
  return {
    display_name: (data.profiles as unknown as { display_name: string | null } | null)?.display_name ?? null,
    elapsed_secs: data.elapsed_secs,
    date: data.date,
  }
}

// Renvoie le record du défi du JOUR (date + mode précis). Si personne n'a complété
// encore aujourd'hui, renvoie null.
export async function fetchDailyRecord(date: string, modeId: string): Promise<ModeRecord | null> {
  const { data, error } = await supabase
    .from('daily_results')
    .select('elapsed_secs, date, profiles(display_name)')
    .eq('date', date)
    .eq('mode', modeId)
    .eq('completed', true)
    .order('elapsed_secs', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) { console.error('fetchDailyRecord:', error); return null }
  if (!data) return null
  return {
    display_name: (data.profiles as unknown as { display_name: string | null } | null)?.display_name ?? null,
    elapsed_secs: data.elapsed_secs,
    date: data.date,
  }
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

