import { mulberry32, seedFromString } from './prng'
import { Trie, addBonusWords } from './dictionary'
import {
  generateRandomGrid,
  generateGrid,
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

interface DailyModeBase {
  readonly id: string
  readonly name: string
  readonly subtitle: string
  readonly palette: DailyModePalette
  readonly intro?: DailyModeIntro
}

export interface PyramidMode extends DailyModeBase {
  readonly kind: 'pyramid'
  readonly size: number
  readonly maxWordLen: number
  readonly pyramidLengths: readonly number[]
  // Nombre minimum de mots requis au niveau plafond (le dernier de pyramidLengths,
  // qui agit comme "≥"). Permet de garantir des alternatives au mot le plus long.
  readonly minWordsAtCap?: number
  // Nombre MAXIMUM de mots au niveau plafond (≥ cap). Rejette les grilles trop
  // riches en longs mots pour garder de la difficulté. undefined = pas de cap.
  readonly maxWordsAtCap?: number
  generate(seed: string, trie: Trie): { grid: Grid; validWords: Set<string> }
}

export interface RuddleMode extends DailyModeBase {
  readonly kind: 'ruddle'
  readonly size: number
  readonly durationSecs: number
  readonly minWordLen: number
  generate(seed: string, trie: Trie): { grid: Grid; validWords: Set<string> }
}

export interface SpeedleMode extends DailyModeBase {
  readonly kind: 'speedle'
  readonly size: number
  readonly startSecs: number
  readonly minWordLen: number
  generate(seed: string, trie: Trie): { grid: Grid; validWords: Set<string> }
}

export interface TriddleMode extends DailyModeBase {
  readonly kind: 'triddle'
  readonly size: number
  readonly maxWordLen: number
  readonly pyramidLengths: readonly number[]
  readonly minWordsAtCap?: number
  readonly gridCount: number
  readonly perGridDurationSecs: number
  generate(seed: string, trie: Trie): { grids: Grid[]; validWordsPerGrid: Set<string>[] }
}

export type DailyMode = PyramidMode | TriddleMode | RuddleMode | SpeedleMode

// Alias historique. Les helpers existants (pyramidLevelKey, isPyramidComplete,
// pyramidRows, levelLabel) ne s'appliquent qu'aux PyramidMode.
export type DailyModeRules = PyramidMode

export function isPyramidMode(mode: DailyMode): mode is PyramidMode {
  return mode.kind === 'pyramid'
}

export function isTriddleMode(mode: DailyMode): mode is TriddleMode {
  return mode.kind === 'triddle'
}

export function isRuddleMode(mode: DailyMode): mode is RuddleMode {
  return mode.kind === 'ruddle'
}

export function isSpeedleMode(mode: DailyMode): mode is SpeedleMode {
  return mode.kind === 'speedle'
}

// Plafond de scoring du mode (longueur du dernier niveau pyramide).
export function scoreCap(mode: PyramidLike): number {
  return mode.pyramidLengths[mode.pyramidLengths.length - 1]
}

// Trouve le créneau pyramide à remplir pour un mot donné.
// Règle : remplit le plus long créneau encore vide ≤ longueur du mot (cap inclus).
// Renvoie null si aucun créneau ne peut être rempli (mot trop court ou tous remplis).
export function pyramidSlotForWord(
  rules: { pyramidLengths: readonly number[] },
  word: string,
  pyramidFound: Record<number, string>
): number | null {
  const lens = rules.pyramidLengths
  if (lens.length === 0) return null
  const min = lens[0]
  if (word.length < min) return null
  // Du plus long au plus court, premier créneau ≤ word.length non rempli
  for (let i = lens.length - 1; i >= 0; i--) {
    const slot = lens[i]
    if (slot <= word.length && !pyramidFound[slot]) return slot
  }
  return null
}

// Structurel : marche aussi bien pour PyramidMode que TriddleMode (les deux ont pyramidLengths)
type PyramidLike = { pyramidLengths: readonly number[] }

export function isPyramidComplete(
  rules: PyramidLike,
  pyramidFound: Record<number, string>
): boolean {
  return rules.pyramidLengths.every((l) => !!pyramidFound[l])
}

export function pyramidLevelsFound(
  rules: PyramidLike,
  pyramidFound: Record<number, string>
): number {
  return rules.pyramidLengths.filter((l) => !!pyramidFound[l]).length
}

// Layout pyramide (sommet en haut). Le 1er level (le plus court) est en bas.
// L'array de sortie est ordonné top→bottom, items dans chaque rangée gauche→droite.
export function pyramidRows(rules: PyramidLike): number[][] {
  const reversed = [...rules.pyramidLengths].reverse() // top = max → bottom = min
  const SHAPES: Record<number, number[]> = {
    1: [1],
    2: [1, 1],
    3: [1, 2],
    4: [1, 3],
    5: [2, 3],
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
export function levelLabel(rules: PyramidLike, len: number): string {
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
      // Cap "trop riche" : on rejette si on dépasse maxWordsAtCap
      if (maxWordsAtCap !== undefined) {
        const longCount = [...words].filter((w) => w.length >= cap).length
        if (longCount > maxWordsAtCap) {
          // Garder quand même comme fallback si meilleur que rien
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

// Override de seed (rejouer un défi avec un seed alternatif après changement de dico)
const SEED_OVERRIDES: Record<string, string> = {
  '2026-05-02': '2026-05-02-v2',
}

function effectiveSeed(date: string): string {
  return SEED_OVERRIDES[date] ?? date
}

export const classicMode: DailyModeRules = {
  kind: 'pyramid',
  id: 'classic',
  name: 'Pyramiddle',
  subtitle: 'Défi du jour · complète la pyramide',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  minWordsAtCap: 2,
  maxWordsAtCap: 5,
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
      this.minWordsAtCap ?? 1,
      this.maxWordsAtCap
    )
  },
}

export const bigriddleMode: DailyModeRules = {
  kind: 'pyramid',
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
      this.minWordsAtCap ?? 1,
      this.maxWordsAtCap
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
  kind: 'pyramid',
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

// ─── Mode anniversaire Fate (4×4 grille fixe avec MAMAN + AMOUR + BISOU) ─────

const FATE_BIRTHDAY_DATE = '2026-06-30'

// Grille déterministe (issue de scripts/optimize-birthday-fate.mjs) qui
// garantit MAMAN, AMOUR, BISOU + 508 mots dont 34 mots de 8L et 4 de 10L.
//   A M O U
//   M S S R
//   A E I A
//   N T B P
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

export const fateBirthdayMode: DailyModeRules = {
  kind: 'pyramid',
  id: 'birthday-fate-2026-06-30',
  name: 'Happy 59 Fate',
  subtitle: 'Joyeux anniversaire 🎂',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(236,72,153,0.32) 0%, rgba(251,113,133,0.22) 50%, rgba(248,113,113,0.18) 100%)',
    cardBorder: '1px solid rgba(236,72,153,0.5)',
    cardShadow: '0 0 32px rgba(236,72,153,0.22)',
    accent: '#ec4899',
    accentSoft: 'rgba(236,72,153,0.7)',
    slotBg: 'rgba(236,72,153,0.14)',
    slotBorder: '1px solid rgba(236,72,153,0.3)',
    buttonBg: 'rgba(236,72,153,0.55)',
    buttonBorder: '1px solid rgba(236,72,153,0.35)',
  },
  generate(seed, trie) {
    return generateFateBirthdayGrid(seed, trie)
  },
}

// ─── Mode anniversaire Taha (4×4 grille fixe avec DOCTEUR + GOURMAND + DONKEY) ─

const TAHA_BIRTHDAY_DATE = '2026-07-10'

// Grille déterministe (issue de scripts/optimize-birthday-taha.mjs) qui garantit
// DOCTEUR, GOURMAND, DONKEY (mot bonus injecté au dico) + 297 mots dont 5 de 8L
// (gourmand, autogera, cloutera, engouera, manegeat) — cap 8+ volontairement dur.
//   L D Y K
//   C O N E
//   T U G A
//   A E R M
const TAHA_GRID_LETTERS: string[][] = [
  ['l', 'd', 'y', 'k'],
  ['c', 'o', 'n', 'e'],
  ['t', 'u', 'g', 'a'],
  ['a', 'e', 'r', 'm'],
]

export const TAHA_BONUS_WORDS = ['donkey']

function generateTahaBirthdayGrid(
  _seed: string,
  trie: Trie
): { grid: Grid; validWords: Set<string> } {
  addBonusWords(TAHA_BONUS_WORDS)
  const grid: Grid = TAHA_GRID_LETTERS.map((row, r) =>
    row.map((letter, c) => ({ letter, row: r, col: c }))
  )
  const validWords = findAllWords(grid, trie, 3, 10)
  return { grid, validWords }
}

export const tahaBirthdayMode: DailyModeRules = {
  kind: 'pyramid',
  id: 'birthday-taha-2026-07-10',
  name: 'Happy 31 Taha M',
  subtitle: 'Joyeux anniversaire 🎂',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(56,189,248,0.32) 0%, rgba(99,102,241,0.22) 50%, rgba(168,85,247,0.18) 100%)',
    cardBorder: '1px solid rgba(56,189,248,0.5)',
    cardShadow: '0 0 32px rgba(56,189,248,0.22)',
    accent: '#38bdf8',
    accentSoft: 'rgba(56,189,248,0.7)',
    slotBg: 'rgba(56,189,248,0.14)',
    slotBorder: '1px solid rgba(56,189,248,0.3)',
    buttonBg: 'rgba(56,189,248,0.55)',
    buttonBorder: '1px solid rgba(56,189,248,0.35)',
  },
  generate(seed, trie) {
    return generateTahaBirthdayGrid(seed, trie)
  },
}

// ─── Mode anniversaire Hatim (4×4 grille fixe avec TRENTAINE + DREAMTIM) ──────

const HATIM_BIRTHDAY_DATE = '2026-07-11'

// Grille déterministe (scripts/optimize-birthday-taha.mjs, mots trentaine,dreamtim)
// garantissant TRENTAINE (9L, dico) + DREAMTIM (8L, mot bonus) + 423 mots dont
// 5 de 8L (elierait, maintien, mentirai, minerait, rentamee) et 1 seul 9L.
//   T R E D
//   D I A N
//   L M T I
//   E E N M
const HATIM_GRID_LETTERS: string[][] = [
  ['t', 'r', 'e', 'd'],
  ['d', 'i', 'a', 'n'],
  ['l', 'm', 't', 'i'],
  ['e', 'e', 'n', 'm'],
]

export const HATIM_BONUS_WORDS = ['dreamtim']

function generateHatimBirthdayGrid(
  _seed: string,
  trie: Trie
): { grid: Grid; validWords: Set<string> } {
  addBonusWords(HATIM_BONUS_WORDS)
  const grid: Grid = HATIM_GRID_LETTERS.map((row, r) =>
    row.map((letter, c) => ({ letter, row: r, col: c }))
  )
  const validWords = findAllWords(grid, trie, 3, 10)
  return { grid, validWords }
}

export const hatimBirthdayMode: DailyModeRules = {
  kind: 'pyramid',
  id: 'birthday-hatim-2026-07-11',
  name: 'Happy 30 Mano',
  subtitle: 'Le début d\'autre chose 🎂',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7, 8],
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(251,191,36,0.32) 0%, rgba(244,114,182,0.2) 50%, rgba(139,92,246,0.2) 100%)',
    cardBorder: '1px solid rgba(251,191,36,0.5)',
    cardShadow: '0 0 32px rgba(251,191,36,0.22)',
    accent: '#fcd34d',
    accentSoft: 'rgba(252,211,77,0.75)',
    slotBg: 'rgba(251,191,36,0.14)',
    slotBorder: '1px solid rgba(251,191,36,0.3)',
    buttonBg: 'rgba(217,119,6,0.55)',
    buttonBorder: '1px solid rgba(217,119,6,0.35)',
  },
  intro: {
    title: 'Happy 30 Mano',
    tagline: 'Le début d\'autre chose',
    bullets: [
      'À 20 ans on court. À 30 on choisit où aller.',
      'Merci de jouer chaque jour.',
    ],
    cta: 'Joyeux anniversaire 🎉',
  },
  generate(seed, trie) {
    return generateHatimBirthdayGrid(seed, trie)
  },
}

// ─── Triddle : 3 grilles d'affilée ────────────────────────────────────────────

export const triddleMode: TriddleMode = {
  kind: 'triddle',
  // id='marathon' conservé pour compat DB : les résultats du test grandeur nature
  // du 2026-05-17 sont indexés sous ce nom, et l'edge function submit_daily accepte
  // 'marathon' comme claim. Le nom code (Triddle*) reste aligné avec l'UI.
  id: 'marathon',
  name: 'Triddle',
  subtitle: '3 grilles · 5 min chacune · pyramide 3→7',
  size: 4,
  maxWordLen: 10,
  pyramidLengths: [3, 4, 5, 6, 7],
  minWordsAtCap: 5,
  gridCount: 3,
  perGridDurationSecs: 300,
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(239,68,68,0.32) 0%, rgba(249,115,22,0.18) 100%)',
    cardBorder: '1px solid rgba(239,68,68,0.5)',
    cardShadow: '0 0 32px rgba(239,68,68,0.18)',
    accent: '#fb923c',
    accentSoft: 'rgba(251,146,60,0.7)',
    slotBg: 'rgba(239,68,68,0.14)',
    slotBorder: '1px solid rgba(239,68,68,0.3)',
    buttonBg: 'rgba(239,68,68,0.55)',
    buttonBorder: '1px solid rgba(239,68,68,0.35)',
  },
  intro: {
    title: 'Triddle',
    tagline: '3 grilles d\'affilée',
    bullets: [
      '3 grilles 4×4 à la suite',
      'Pyramide 3→7 par grille (15 pts max)',
      '5 minutes par grille, ensuite ça passe',
    ],
    cta: 'C\'est parti',
  },
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

// ─── Ruddle : 2 minutes, max de mots 3L+ ─────────────────────────────────────

export const ruddleMode: RuddleMode = {
  kind: 'ruddle',
  id: 'ruddle',
  name: 'Ruddle',
  subtitle: 'Défi du jour · 2 minutes · le plus de mots',
  size: 4,
  durationSecs: 120,
  minWordLen: 3,
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(59,130,246,0.32) 0%, rgba(99,102,241,0.18) 100%)',
    cardBorder: '1px solid rgba(59,130,246,0.5)',
    cardShadow: '0 0 32px rgba(59,130,246,0.18)',
    accent: '#60a5fa',
    accentSoft: 'rgba(96,165,250,0.7)',
    slotBg: 'rgba(59,130,246,0.14)',
    slotBorder: '1px solid rgba(59,130,246,0.3)',
    buttonBg: 'rgba(59,130,246,0.55)',
    buttonBorder: '1px solid rgba(59,130,246,0.35)',
  },
  intro: {
    title: 'Ruddle',
    tagline: '2 minutes chrono',
    bullets: [
      'Trouve le plus de mots possible',
      'Mots de 3 lettres minimum',
      'Plus le mot est long, plus il rapporte',
    ],
    cta: 'Go !',
  },
  generate(seed, trie) {
    return generateGrid(effectiveSeed(seed), trie, 3)
  },
}

// ─── Speedle : sablier — commence à 45s, chaque mot ajoute du temps ───────────

// Grille Speedle : mêmes exigences de richesse que generateGrid, plus une
// contrainte 2-5 mots de 8L+ (le +10s doit exister mais rester rare).
function generateSpeedleGrid(
  seed: string,
  trie: Trie
): { grid: Grid; validWords: Set<string> } {
  const numericSeed = seedFromString(seed)
  const rand = mulberry32(numericSeed)

  let bestGrid: Grid | null = null
  let bestWords: Set<string> = new Set()
  let bestScore = -1

  for (let attempt = 0; attempt < MAX_ATTEMPTS_DAILY; attempt++) {
    const grid = generateRandomGrid(rand, 4)
    const words = findAllWords(grid, trie, 3, 10)
    const capCount = [...words].filter((w) => w.length >= 8).length
    if (words.size >= 100 && capCount >= 2 && capCount <= 5) {
      return { grid, validWords: words }
    }
    // Fallback : privilégier la proximité de la cible cap, puis la richesse
    const score = words.size - Math.abs(capCount - 3) * 100
    if (score > bestScore) {
      bestScore = score
      bestGrid = grid
      bestWords = words
    }
  }

  return { grid: bestGrid ?? generateRandomGrid(rand, 4), validWords: bestWords }
}

export const speedleMode: SpeedleMode = {
  kind: 'speedle',
  id: 'speedle',
  name: 'Speedle',
  subtitle: 'Défi du jour · résiste le plus longtemps',
  size: 4,
  startSecs: 45,
  minWordLen: 3,
  palette: {
    cardBg: 'linear-gradient(135deg, rgba(16,185,129,0.32) 0%, rgba(5,150,105,0.18) 100%)',
    cardBorder: '1px solid rgba(16,185,129,0.5)',
    cardShadow: '0 0 32px rgba(16,185,129,0.18)',
    accent: '#34d399',
    accentSoft: 'rgba(52,211,153,0.7)',
    slotBg: 'rgba(16,185,129,0.14)',
    slotBorder: '1px solid rgba(16,185,129,0.3)',
    buttonBg: 'rgba(16,185,129,0.55)',
    buttonBorder: '1px solid rgba(16,185,129,0.35)',
  },
  intro: {
    title: 'Speedle',
    tagline: 'Tiens face au sablier',
    bullets: [
      '45 secondes au départ',
      'Chaque mot rallonge le sablier',
      'Les mots longs rallongent bien plus (3L=+1s, 8L+=+10s)',
      'Le jeu finit quand le sablier tombe',
    ],
    cta: 'Go !',
  },
  generate(seed, trie) {
    return generateSpeedleGrid(effectiveSeed(seed), trie)
  },
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const SPECIAL_DATES: Record<string, DailyMode> = {
  [BIRTHDAY_DATE]: birthdayMode,
  [FATE_BIRTHDAY_DATE]: fateBirthdayMode,
  [TAHA_BIRTHDAY_DATE]: tahaBirthdayMode,
  [HATIM_BIRTHDAY_DATE]: hatimBirthdayMode,
  // Premier test grandeur nature du Triddle (dimanche 17/05/2026, override BiGriddle)
  '2026-05-17': triddleMode,
}

function utcDay(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

function isSunday(date: string): boolean { return utcDay(date) === 0 }


// Dimanche = défi spécial en rotation depuis le 2026-07-05.
// Cycle 3 semaines : Triddle → Speedle → BiGriddle → Triddle → ...
// Modulo positif pour supporter les dates avant SUNDAY_REF.
const SUNDAY_REF = new Date('2026-07-05T00:00:00Z')
const SUNDAY_CYCLE: readonly DailyMode[] = [triddleMode, speedleMode, bigriddleMode]
function sundayMode(date: string): DailyMode {
  const d = new Date(`${date}T00:00:00Z`)
  const weekOffset = Math.round((d.getTime() - SUNDAY_REF.getTime()) / (7 * 86400000))
  const idx = ((weekOffset % SUNDAY_CYCLE.length) + SUNDAY_CYCLE.length) % SUNDAY_CYCLE.length
  return SUNDAY_CYCLE[idx]
}

export function modeForDate(date: string, override?: string | null): DailyMode {
  if (override === 'triddle' || override === 'marathon') return triddleMode
  if (override === 'bigriddle') return bigriddleMode
  if (override === 'classic') return classicMode
  if (override === 'ruddle' || override === 'eclair') return ruddleMode
  if (override === 'speedle' || override === 'infini') return speedleMode
  const special = SPECIAL_DATES[date]
  if (special) return special
  if (isSunday(date)) return sundayMode(date)
  return classicMode
}
