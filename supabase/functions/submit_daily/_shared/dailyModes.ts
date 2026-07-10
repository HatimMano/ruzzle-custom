import { mulberry32, seedFromString } from './prng.ts'
import { Trie } from './dictionary.ts'
import {
  generateRandomGrid,
  findAllWords,
  weightedRandomLetter,
  type Grid,
} from './gridGenerator.ts'

// Variante minimale (sans palette ni intro) côté serveur — on ne fait pas de rendu UI.

export interface PyramidMode {
  readonly kind: 'pyramid'
  readonly id: string
  readonly size: number
  readonly maxWordLen: number
  readonly pyramidLengths: readonly number[]
  readonly minWordsAtCap?: number
  readonly maxWordsAtCap?: number
  generate(seed: string, trie: Trie): { grid: Grid; validWords: Set<string> }
}

export interface MarathonMode {
  readonly kind: 'marathon'
  readonly id: string
  readonly size: number
  readonly maxWordLen: number
  readonly pyramidLengths: readonly number[]
  readonly minWordsAtCap?: number
  readonly gridCount: number
  readonly perGridDurationSecs: number
  generate(seed: string, trie: Trie): { grids: Grid[]; validWordsPerGrid: Set<string>[] }
}

// Ruddle/Speedle : modes côté serveur uniquement pour cohérence dispatch.
// Ils passent par insert direct client (bypass anti-cheat), donc pas de generate ici.
// Si l'edge function reçoit un claim ruddle/speedle, elle renvoie une erreur explicite.
export interface RuddleMode {
  readonly kind: 'ruddle'
  readonly id: string
}
export interface SpeedleMode {
  readonly kind: 'speedle'
  readonly id: string
}

export type DailyMode = PyramidMode | MarathonMode | RuddleMode | SpeedleMode

export function isPyramidMode(m: DailyMode): m is PyramidMode {
  return m.kind === 'pyramid'
}
export function isMarathonMode(m: DailyMode): m is MarathonMode {
  return m.kind === 'marathon'
}
export function isRuddleMode(m: DailyMode): m is RuddleMode {
  return m.kind === 'ruddle'
}
export function isSpeedleMode(m: DailyMode): m is SpeedleMode {
  return m.kind === 'speedle'
}

export function pyramidSlotForWord(
  rules: { pyramidLengths: readonly number[] },
  word: string,
  pyramidFound: Record<number, string>
): number | null {
  const lens = rules.pyramidLengths
  if (lens.length === 0) return null
  const min = lens[0]
  if (word.length < min) return null
  for (let i = lens.length - 1; i >= 0; i--) {
    const slot = lens[i]
    if (slot <= word.length && !pyramidFound[slot]) return slot
  }
  return null
}

// ─── Génération paramétrée ────────────────────────────────────────────────────

const MAX_ATTEMPTS_DAILY = 800

function hasPyramidCoverage(
  words: Set<string>,
  lens: readonly number[],
  minWordsAtCap: number
): boolean {
  const max = lens[lens.length - 1]
  for (const len of lens) {
    if (len === max) {
      const count = [...words].filter((w) => w.length >= len).length
      if (count < minWordsAtCap) return false
    } else {
      if (![...words].some((w) => w.length === len)) return false
    }
  }
  return true
}

function pyramidCoverageScore(
  words: Set<string>,
  lens: readonly number[],
  minWordsAtCap: number
): number {
  const max = lens[lens.length - 1]
  let score = 0
  for (const len of lens) {
    if (len === max) {
      const count = [...words].filter((w) => w.length >= len).length
      score += Math.min(count, minWordsAtCap)
    } else {
      if ([...words].some((w) => w.length === len)) score++
    }
  }
  return score
}

function generatePyramidGrid(
  seed: string,
  trie: Trie,
  size: number,
  maxWordLen: number,
  pyramidLengths: readonly number[],
  minWordsAtCap: number,
  maxWordsAtCap?: number
): { grid: Grid; validWords: Set<string> } {
  const numericSeed = seedFromString(seed)
  const rand = mulberry32(numericSeed)
  const cap = pyramidLengths[pyramidLengths.length - 1]

  let bestGrid: Grid | null = null
  let bestWords: Set<string> = new Set()
  let bestScore = -1

  for (let attempt = 0; attempt < MAX_ATTEMPTS_DAILY; attempt++) {
    const grid = generateRandomGrid(rand, size)
    const words = findAllWords(grid, trie, 3, maxWordLen)
    if (hasPyramidCoverage(words, pyramidLengths, minWordsAtCap)) {
      if (maxWordsAtCap !== undefined) {
        const longCount = [...words].filter((w) => w.length >= cap).length
        if (longCount > maxWordsAtCap) {
          const score = pyramidCoverageScore(words, pyramidLengths, minWordsAtCap)
          if (score > bestScore) {
            bestScore = score
            bestGrid = grid
            bestWords = words
          }
          continue
        }
      }
      return { grid, validWords: words }
    }
    const score = pyramidCoverageScore(words, pyramidLengths, minWordsAtCap)
    if (score > bestScore) {
      bestScore = score
      bestGrid = grid
      bestWords = words
    }
  }

  return {
    grid: bestGrid ?? generateRandomGrid(rand, size),
    validWords: bestWords,
  }
}

// ─── Modes ────────────────────────────────────────────────────────────────────

const SEED_OVERRIDES: Record<string, string> = {
  '2026-05-02': '2026-05-02-v2',
}
function effectiveSeed(date: string): string {
  return SEED_OVERRIDES[date] ?? date
}

export const classicMode: PyramidMode = {
  kind: 'pyramid',
  id: 'classic',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  minWordsAtCap: 2,
  maxWordsAtCap: 5,
  generate(seed, trie) {
    return generatePyramidGrid(
      effectiveSeed(seed),
      trie,
      this.size,
      this.maxWordLen,
      this.pyramidLengths,
      this.minWordsAtCap ?? 1,
      this.maxWordsAtCap
    )
  },
}

export const bigriddleMode: PyramidMode = {
  kind: 'pyramid',
  id: 'bigriddle',
  size: 5,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8, 9, 10],
  minWordsAtCap: 3,
  generate(seed, trie) {
    return generatePyramidGrid(
      effectiveSeed(seed),
      trie,
      this.size,
      this.maxWordLen,
      this.pyramidLengths,
      this.minWordsAtCap ?? 1
    )
  },
}

// Anniversaire 30/04/2026 : grille 4×4 avec "soixante" forcé sur les 2 premières rangées
const BIRTHDAY_DATE = '2026-04-30'

function generateBirthdayGrid(
  seed: string,
  trie: Trie
): { grid: Grid; validWords: Set<string> } {
  const numericSeed = seedFromString(seed)
  const rand = mulberry32(numericSeed)
  const WORD = 'soixante'
  const PATH: [number, number][] = [
    [0, 0], [0, 1], [0, 2], [0, 3],
    [1, 3], [1, 2], [1, 1], [1, 0],
  ]

  let bestGrid: Grid | null = null
  let bestWords: Set<string> = new Set()
  let bestScore = -1

  for (let attempt = 0; attempt < 5000; attempt++) {
    const grid: Grid = Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => ({ letter: '', row: r, col: c }))
    )
    PATH.forEach(([r, c], i) => {
      grid[r][c] = { letter: WORD[i], row: r, col: c }
    })
    for (let r = 2; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        grid[r][c] = { letter: weightedRandomLetter(rand), row: r, col: c }
      }
    }

    const words = findAllWords(grid, trie, 3, 10)
    if (!words.has(WORD)) continue

    const longWords = [...words].filter((w) => w.length >= 8)
    if (longWords.length !== 1 || longWords[0] !== WORD) continue

    if (hasPyramidCoverage(words, [3, 4, 5, 6, 7, 8], 1)) {
      return { grid, validWords: words }
    }
    const score = pyramidCoverageScore(words, [3, 4, 5, 6, 7, 8], 1)
    if (score > bestScore) {
      bestScore = score
      bestGrid = grid
      bestWords = words
    }
  }

  return { grid: bestGrid!, validWords: bestWords }
}

export const birthdayMode: PyramidMode = {
  kind: 'pyramid',
  id: 'birthday-2026-04-30',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  generate(seed, trie) {
    return generateBirthdayGrid(seed, trie)
  },
}

// Anniversaire Fate 30/06/2026 : grille 4×4 entièrement fixe (déterministe)
const FATE_BIRTHDAY_DATE = '2026-06-30'

const FATE_GRID_LETTERS: string[][] = [
  ['a', 'm', 'o', 'u'],
  ['m', 's', 's', 'r'],
  ['a', 'e', 'i', 'a'],
  ['n', 't', 'b', 'p'],
]

function generateFateBirthdayGrid(
  _seed: string,
  trie: Trie
): { grid: Grid; validWords: Set<string> } {
  const grid: Grid = FATE_GRID_LETTERS.map((row, r) =>
    row.map((letter, c) => ({ letter, row: r, col: c }))
  )
  const validWords = findAllWords(grid, trie, 3, 10)
  return { grid, validWords }
}

export const fateBirthdayMode: PyramidMode = {
  kind: 'pyramid',
  id: 'birthday-fate-2026-06-30',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  generate(seed, trie) {
    return generateFateBirthdayGrid(seed, trie)
  },
}

// Anniversaire Taha 10/07/2026 : grille 4×4 fixe avec DOCTEUR + GOURMAND + DONKEY.
// DONKEY est un mot bonus hors dico — injecté dans wordSet/trie par index.ts pour ce mode.
const TAHA_BIRTHDAY_DATE = '2026-07-10'

export const TAHA_BONUS_WORDS = ['donkey']

const TAHA_GRID_LETTERS: string[][] = [
  ['l', 'd', 'y', 'k'],
  ['c', 'o', 'n', 'e'],
  ['t', 'u', 'g', 'a'],
  ['a', 'e', 'r', 'm'],
]

function generateTahaBirthdayGrid(
  _seed: string,
  trie: Trie
): { grid: Grid; validWords: Set<string> } {
  const grid: Grid = TAHA_GRID_LETTERS.map((row, r) =>
    row.map((letter, c) => ({ letter, row: r, col: c }))
  )
  const validWords = findAllWords(grid, trie, 3, 10)
  return { grid, validWords }
}

export const tahaBirthdayMode: PyramidMode = {
  kind: 'pyramid',
  id: 'birthday-taha-2026-07-10',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  generate(seed, trie) {
    return generateTahaBirthdayGrid(seed, trie)
  },
}

export const marathonMode: MarathonMode = {
  kind: 'marathon',
  id: 'marathon',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7],
  minWordsAtCap: 5,
  gridCount: 3,
  perGridDurationSecs: 300,
  generate(seed, trie) {
    const grids: Grid[] = []
    const validWordsPerGrid: Set<string>[] = []
    for (let i = 0; i < this.gridCount; i++) {
      const r = generatePyramidGrid(
        `${seed}-${i}`,
        trie,
        this.size,
        this.maxWordLen,
        this.pyramidLengths,
        this.minWordsAtCap ?? 1
      )
      grids.push(r.grid)
      validWordsPerGrid.push(r.validWords)
    }
    return { grids, validWordsPerGrid }
  },
}

// ─── Ruddle / Speedle (défense en profondeur, pas de generate) ────────────────

export const ruddleMode: RuddleMode = { kind: 'ruddle', id: 'ruddle' }
export const speedleMode: SpeedleMode = { kind: 'speedle', id: 'speedle' }

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const SPECIAL_DATES: Record<string, DailyMode> = {
  [BIRTHDAY_DATE]: birthdayMode,
  [FATE_BIRTHDAY_DATE]: fateBirthdayMode,
  [TAHA_BIRTHDAY_DATE]: tahaBirthdayMode,
  '2026-05-17': marathonMode,  // Premier Triddle (override BiGriddle dominical)
}

function isSunday(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`)
  return d.getUTCDay() === 0
}

// Dimanche = défi spécial en rotation depuis le 2026-07-05.
// Cycle 3 semaines : Triddle (marathonMode) → Speedle → BiGriddle → Triddle → ...
// DOIT rester en sync avec src/lib/dailyModes.ts côté client.
const SUNDAY_REF = new Date('2026-07-05T00:00:00Z')
const SUNDAY_CYCLE: readonly DailyMode[] = [marathonMode, speedleMode, bigriddleMode]
function sundayMode(date: string): DailyMode {
  const d = new Date(`${date}T00:00:00Z`)
  const weekOffset = Math.round((d.getTime() - SUNDAY_REF.getTime()) / (7 * 86400000))
  const idx = ((weekOffset % SUNDAY_CYCLE.length) + SUNDAY_CYCLE.length) % SUNDAY_CYCLE.length
  return SUNDAY_CYCLE[idx]
}

export function modeForDate(date: string, override?: string | null): DailyMode {
  if (override === 'triddle' || override === 'marathon') return marathonMode
  if (override === 'bigriddle') return bigriddleMode
  if (override === 'classic') return classicMode
  if (override === 'ruddle' || override === 'eclair') return ruddleMode
  if (override === 'speedle' || override === 'infini') return speedleMode
  const special = SPECIAL_DATES[date]
  if (special) return special
  if (isSunday(date)) return sundayMode(date)
  return classicMode
}
