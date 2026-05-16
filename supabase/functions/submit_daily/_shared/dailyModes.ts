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

export type DailyMode = PyramidMode | MarathonMode

export function isPyramidMode(m: DailyMode): m is PyramidMode {
  return m.kind === 'pyramid'
}
export function isMarathonMode(m: DailyMode): m is MarathonMode {
  return m.kind === 'marathon'
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
  minWordsAtCap: number
): { grid: Grid; validWords: Set<string> } {
  const numericSeed = seedFromString(seed)
  const rand = mulberry32(numericSeed)

  let bestGrid: Grid | null = null
  let bestWords: Set<string> = new Set()
  let bestScore = -1

  for (let attempt = 0; attempt < MAX_ATTEMPTS_DAILY; attempt++) {
    const grid = generateRandomGrid(rand, size)
    const words = findAllWords(grid, trie, 3, maxWordLen)
    if (hasPyramidCoverage(words, pyramidLengths, minWordsAtCap)) {
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

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const SPECIAL_DATES: Record<string, DailyMode> = {
  [BIRTHDAY_DATE]: birthdayMode,
  '2026-05-17': marathonMode,  // Premier Triddle (override BiGriddle dominical)
}

function isSunday(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`)
  return d.getUTCDay() === 0
}

export function modeForDate(date: string, override?: string | null): DailyMode {
  if (override === 'marathon') return marathonMode
  if (override === 'bigriddle') return bigriddleMode
  if (override === 'classic') return classicMode
  const special = SPECIAL_DATES[date]
  if (special) return special
  if (isSunday(date)) return bigriddleMode
  return classicMode
}
