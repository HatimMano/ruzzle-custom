// Edge Function: submit_daily
// Anti-cheat: régénère la grille du défi serveur-side, valide chaque mot soumis
// (présence dico + chemin valide), recalcule le score canoniquement, puis insert.
//
// Le client envoie : { date, mode, elapsedSecs, foundWords, pyramidFound }.
// Le client n'a aucune autorité sur le score : la fonction le recalcule.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { loadDictionary, type Trie } from './_shared/dictionary.ts'
import {
  modeForDate,
  isMarathonMode,
  isPyramidMode,
  isRuddleMode,
  isSpeedleMode,
  pyramidSlotForWord,
  type DailyMode,
} from './_shared/dailyModes.ts'
import { findWordPath, type Grid } from './_shared/gridGenerator.ts'
import { scoreForLen } from './_shared/scoring.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SubmitPayload {
  date: string
  mode: string
  elapsedSecs: number
  foundWords: string[]
  pyramidFound: Record<number, string> | Record<string, Record<number, string>>
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Valide un mot proposé pour un créneau pyramide donné, sur une grille donnée.
// Retourne le slot effectivement rempli (peut différer du slot présumé si plus court),
// ou null si le mot est invalide.
function validateAndAssignSlot(
  grid: Grid,
  wordSet: Set<string>,
  word: string,
  pyramidLengths: readonly number[],
  alreadyFilled: Record<number, string>
): { slot: number; word: string } | null {
  const lower = word.toLowerCase()
  if (!wordSet.has(lower)) return null
  if (!findWordPath(grid, lower)) return null
  const slot = pyramidSlotForWord({ pyramidLengths }, lower, alreadyFilled)
  if (slot === null) return null
  return { slot, word: lower }
}

function rebuildPyramid(
  grid: Grid,
  wordSet: Set<string>,
  candidatePyramid: Record<number, string>,
  pyramidLengths: readonly number[]
): { canonical: Record<number, string>; rejectedCount: number } {
  // On reconstruit la pyramide en repassant les mots dans l'ordre du plus court au plus long
  // (l'ordre n'a pas vraiment d'impact car la règle pyramidSlotForWord gère, mais
  //  on évite ainsi de favoriser un cas particulier). Tout mot qui ne valide pas est rejeté.
  const canonical: Record<number, string> = {}
  let rejected = 0
  // On extrait les couples (slotKey, mot) puis on les revalide
  const entries = Object.entries(candidatePyramid).filter(([_, v]) => typeof v === 'string')
  // Trie par longueur de mot croissante : assure qu'un mot court ne squatte pas un slot élevé
  // qu'on remplirait sinon avec un mot exactement correspondant
  entries.sort((a, b) => (a[1] as string).length - (b[1] as string).length)
  for (const [, raw] of entries) {
    const word = (raw as string).toLowerCase()
    const ok = validateAndAssignSlot(grid, wordSet, word, pyramidLengths, canonical)
    if (!ok) {
      rejected++
      continue
    }
    canonical[ok.slot] = ok.word
  }
  return { canonical, rejectedCount: rejected }
}

function pyramidScore(pyramid: Record<number, string>): number {
  return Object.keys(pyramid).reduce((acc, k) => acc + scoreForLen(parseInt(k)), 0)
}

function isPyramidComplete(
  pyramidLengths: readonly number[],
  pyramid: Record<number, string>
): boolean {
  return pyramidLengths.every((l) => !!pyramid[l])
}

function pyramidLevelsFound(
  pyramidLengths: readonly number[],
  pyramid: Record<number, string>
): number {
  return pyramidLengths.filter((l) => !!pyramid[l]).length
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  // Auth : récupère le user_id depuis le JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'missing_auth' }, 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const supabaseUserClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
  const userId = userData.user.id

  // Body
  let payload: SubmitPayload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }
  if (
    typeof payload.date !== 'string' ||
    typeof payload.mode !== 'string' ||
    typeof payload.elapsedSecs !== 'number' ||
    !Array.isArray(payload.foundWords) ||
    typeof payload.pyramidFound !== 'object' ||
    payload.pyramidFound === null
  ) {
    return jsonResponse({ error: 'invalid_payload' }, 400)
  }
  if (payload.elapsedSecs < 0 || payload.elapsedSecs > 7200) {
    return jsonResponse({ error: 'invalid_elapsed' }, 400)
  }

  // Resolve mode server-side from date (ignore client-claimed mode for the most part,
  // mais on vérifie que ce que le client revendique correspond bien à ce que le serveur calcule)
  // Pour le moment, on accepte aussi un override implicite via l'id : si le client envoie
  // un mode différent (ex marathon), c'est qu'il a explicitement demandé ce mode dans l'URL.
  // On résout donc à partir de l'id réclamé.
  const claimedId = payload.mode
  let mode: DailyMode
  if (claimedId === 'marathon' || claimedId === 'bigriddle' || claimedId === 'classic') {
    mode = modeForDate(payload.date, claimedId)
  } else {
    // mode spécial (birthday) ou normal — on calcule via la date
    mode = modeForDate(payload.date)
    if (mode.id !== claimedId) {
      return jsonResponse({ error: 'mode_mismatch', expected: mode.id, got: claimedId }, 400)
    }
  }

  // Ruddle/Speedle : anti-cheat non implémenté côté serveur (score non pyramidal, pas de canonique).
  // Ces modes sont censés être soumis via insert direct client (DIRECT_INSERT_MODES). Si on reçoit
  // un claim ruddle/speedle ici, c'est probablement un bug côté client (ou une tentative). On refuse.
  if (isRuddleMode(mode) || isSpeedleMode(mode)) {
    return jsonResponse({ error: 'submit_via_direct_insert', mode: mode.id }, 400)
  }

  // Charge le dico
  const { wordSet, trie } = await loadDictionary()

  // ─── Validation pyramide pyramide vs marathon ───────────────────────────────
  let canonicalScore = 0
  let canonicalCompleted = false
  let canonicalLevelsFound = 0
  let canonicalPyramid: unknown
  let canonicalFoundWords: string[] = []

  if (isPyramidMode(mode)) {
    const { grid } = mode.generate(payload.date, trie)
    const submitted = payload.pyramidFound as Record<number, string>
    const { canonical } = rebuildPyramid(grid, wordSet, submitted, mode.pyramidLengths)
    canonicalScore = pyramidScore(canonical)
    canonicalCompleted = isPyramidComplete(mode.pyramidLengths, canonical)
    canonicalLevelsFound = pyramidLevelsFound(mode.pyramidLengths, canonical)
    canonicalPyramid = canonical
    // Filtrer foundWords pour ne garder que ceux qui sont dans le dico ET trouvables
    canonicalFoundWords = (payload.foundWords || [])
      .filter((w) => typeof w === 'string')
      .map((w) => w.toLowerCase())
      .filter((w) => wordSet.has(w) && findWordPath(grid, w))
  } else if (isMarathonMode(mode)) {
    const { grids } = mode.generate(payload.date, trie)
    const submittedNested = payload.pyramidFound as Record<string, Record<number, string>>
    const canonicalPerGrid: Record<number, string>[] = []
    let totalFoundWords: string[] = []
    for (let i = 0; i < grids.length; i++) {
      const grid = grids[i]
      const submitted = submittedNested[String(i)] ?? {}
      const { canonical } = rebuildPyramid(grid, wordSet, submitted, mode.pyramidLengths)
      canonicalPerGrid.push(canonical)
      canonicalScore += pyramidScore(canonical)
      canonicalLevelsFound += pyramidLevelsFound(mode.pyramidLengths, canonical)
      // foundWords par grille : on les recroise avec les words findable sur cette grille
      const submittedFoundFlat = (payload.foundWords || []).filter((w) => typeof w === 'string').map((w) => w.toLowerCase())
      const grilleWords = submittedFoundFlat.filter((w) => wordSet.has(w) && findWordPath(grid, w))
      totalFoundWords = totalFoundWords.concat(grilleWords)
    }
    canonicalCompleted = canonicalPerGrid.every((p) => isPyramidComplete(mode.pyramidLengths, p))
    canonicalPyramid = canonicalPerGrid.reduce((acc, p, i) => { acc[String(i)] = p; return acc }, {} as Record<string, Record<number, string>>)
    // Dedup found words across grids (for the column, c'est juste un trace)
    canonicalFoundWords = [...new Set(totalFoundWords)]
  } else {
    return jsonResponse({ error: 'unknown_mode_kind' }, 500)
  }

  // ─── Insert avec service role (bypass RLS) ──────────────────────────────────
  const adminClient = createClient(supabaseUrl, serviceKey)
  const { error: insertErr } = await adminClient.from('daily_results').insert({
    user_id: userId,
    date: payload.date,
    mode: mode.id,
    elapsed_secs: Math.floor(payload.elapsedSecs),
    completed: canonicalCompleted,
    levels_found: canonicalLevelsFound,
    score: canonicalScore,
    found_words: canonicalFoundWords,
    pyramid_found: canonicalPyramid,
  })

  if (insertErr) {
    // 23505 = unique_violation (déjà soumis)
    if ((insertErr as { code?: string }).code === '23505') {
      return jsonResponse({ error: 'already_submitted' }, 409)
    }
    console.error('insert error', insertErr)
    return jsonResponse({ error: 'insert_failed' }, 500)
  }

  return jsonResponse({
    ok: true,
    score: canonicalScore,
    completed: canonicalCompleted,
    levelsFound: canonicalLevelsFound,
  })
})
