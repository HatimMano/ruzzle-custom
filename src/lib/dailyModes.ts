import { mulberry32, seedFromString } from './prng'
import { Trie } from './dictionary'
import {
  generateRandomGrid,
  findAllWords,
  weightedRandomLetter,
  type Grid,
} from './gridGenerator'

export interface DailyModePalette {
  cardBg: string
  cardBorder: string
  cardShadow: string
  accent: string
  accentSoft: string
  slotBg: string
  slotBorder: string
  buttonBg: string
  buttonBorder: string
}

export interface DailyModeIntro {
  title: string
  tagline: string
  bullets: string[]
  cta: string
}

export interface DailyModeRules {
  readonly id: string
  readonly name: string
  readonly subtitle: string
  readonly size: number
  readonly maxWordLen: number
  readonly pyramidLengths: readonly number[]
  // Nombre minimum de mots requis au niveau plafond (le dernier de pyramidLengths,
  // qui agit comme "≥"). Permet de garantir des alternatives au mot le plus long.
  readonly minWordsAtCap?: number
  readonly palette: DailyModePalette
  // Modal d'intro affiché à la première rencontre du mode (skip si absent).
  readonly intro?: DailyModeIntro
  generate(seed: string, trie: Trie): { grid: Grid; validWords: Set<string> }
}

export function pyramidLevelKey(
  rules: DailyModeRules,
  word: string
): number | null {
  const lens = rules.pyramidLengths
  if (lens.length === 0) return null
  const min = lens[0]
  const max = lens[lens.length - 1]
  if (word.length < min) return null
  return Math.min(word.length, max)
}

export function isPyramidComplete(
  rules: DailyModeRules,
  pyramidFound: Record<number, string>
): boolean {
  return rules.pyramidLengths.every((l) => !!pyramidFound[l])
}

export function pyramidLevelsFound(
  rules: DailyModeRules,
  pyramidFound: Record<number, string>
): number {
  return rules.pyramidLengths.filter((l) => !!pyramidFound[l]).length
}

// Layout pyramide (sommet en haut). Le 1er level (le plus court) est en bas.
// L'array de sortie est ordonné top→bottom, items dans chaque rangée gauche→droite.
export function pyramidRows(rules: DailyModeRules): number[][] {
  const reversed = [...rules.pyramidLengths].reverse() // top = max → bottom = min
  const SHAPES: Record<number, number[]> = {
    1: [1],
    2: [1, 1],
    3: [1, 2],
    4: [1, 3],
    5: [1, 2, 2],
    6: [1, 2, 3],
    7: [1, 2, 4],
    8: [1, 3, 4],
    9: [2, 3, 4],
    10: [1, 2, 3, 4],
  }
  const shape = SHAPES[reversed.length]
  if (!shape) {
    // fallback : empile 1, 2, 3... et tasse le reste sur la dernière ligne
    const rows: number[][] = []
    let i = 0
    let w = 1
    while (i < reversed.length) {
      const size = Math.min(w, reversed.length - i)
      rows.push(reversed.slice(i, i + size))
      i += size
      w++
    }
    return rows
  }
  const rows: number[][] = []
  let cursor = 0
  for (const w of shape) {
    rows.push(reversed.slice(cursor, cursor + w))
    cursor += w
  }
  return rows
}

// Étiquette de niveau ("3L", "10L+", ...). Le dernier niveau est "≥".
export function levelLabel(rules: DailyModeRules, len: number): string {
  const max = rules.pyramidLengths[rules.pyramidLengths.length - 1]
  if (len === max) return `${len}L+`
  return `${len}L`
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
      // Score 0/1/2... selon combien de mots au cap on a, plafonné par minWordsAtCap
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

// Override de seed (rejouer un défi avec un seed alternatif après changement de dico)
const SEED_OVERRIDES: Record<string, string> = {
  '2026-05-02': '2026-05-02-v2',
}

function effectiveSeed(date: string): string {
  return SEED_OVERRIDES[date] ?? date
}

export const classicMode: DailyModeRules = {
  id: 'classic',
  name: 'Pyramiddle',
  subtitle: 'Défi du jour · complète la pyramide',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  minWordsAtCap: 1,
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(217,119,6,0.3) 0%, rgba(234,179,8,0.1) 100%)',
    cardBorder: '1px solid rgba(217,119,6,0.45)',
    cardShadow: '0 0 28px rgba(217,119,6,0.12)',
    accent: '#fbbf24',
    accentSoft: 'rgba(251,191,36,0.7)',
    slotBg: 'rgba(251,191,36,0.12)',
    slotBorder: '1px solid rgba(251,191,36,0.25)',
    buttonBg: 'rgba(217,119,6,0.5)',
    buttonBorder: '1px solid rgba(217,119,6,0.3)',
  },
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

export const bigriddleMode: DailyModeRules = {
  id: 'bigriddle',
  name: 'BiGriddle',
  subtitle: 'Pyramide étendue · 5×5 · jusqu\'à 10 lettres',
  size: 5,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8, 9, 10],
  minWordsAtCap: 3,
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(168,85,247,0.32) 0%, rgba(99,102,241,0.18) 100%)',
    cardBorder: '1px solid rgba(168,85,247,0.5)',
    cardShadow: '0 0 32px rgba(168,85,247,0.18)',
    accent: '#c084fc',
    accentSoft: 'rgba(192,132,252,0.7)',
    slotBg: 'rgba(168,85,247,0.14)',
    slotBorder: '1px solid rgba(168,85,247,0.3)',
    buttonBg: 'rgba(168,85,247,0.55)',
    buttonBorder: '1px solid rgba(168,85,247,0.35)',
  },
  intro: {
    title: 'BiGriddle',
    tagline: 'Le défi du dimanche',
    bullets: [
      'Grille 5×5 au lieu de 4×4',
      'Pyramide étendue : 3L jusqu\'à 10L (8 niveaux)',
      'Plus de mots, plus de chemins, plus de fun',
    ],
    cta: 'Compris, j\'attaque',
  },
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

// ─── Mode anniversaire (4×4 avec mot "soixante" forcé) ────────────────────────

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

export const birthdayMode: DailyModeRules = {
  id: 'birthday-2026-04-30',
  name: 'Happy 60',
  subtitle: 'Édition spéciale · complète la pyramide',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(244,114,182,0.32) 0%, rgba(251,191,36,0.18) 50%, rgba(96,165,250,0.22) 100%)',
    cardBorder: '1px solid rgba(244,114,182,0.5)',
    cardShadow: '0 0 32px rgba(244,114,182,0.18)',
    accent: '#f472b6',
    accentSoft: 'rgba(244,114,182,0.7)',
    slotBg: 'rgba(244,114,182,0.14)',
    slotBorder: '1px solid rgba(244,114,182,0.3)',
    buttonBg: 'rgba(244,114,182,0.55)',
    buttonBorder: '1px solid rgba(244,114,182,0.35)',
  },
  generate(seed, trie) {
    return generateBirthdayGrid(seed, trie)
  },
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const SPECIAL_DATES: Record<string, DailyModeRules> = {
  [BIRTHDAY_DATE]: birthdayMode,
}

// Dimanche = BiGriddle
function isSunday(date: string): boolean {
  // Attention : new Date('2026-05-10') interprète en UTC. On veut un jour stable.
  const d = new Date(`${date}T00:00:00Z`)
  return d.getUTCDay() === 0
}

export function modeForDate(date: string): DailyModeRules {
  const special = SPECIAL_DATES[date]
  if (special) return special
  if (isSunday(date)) return bigriddleMode
  return classicMode
}
