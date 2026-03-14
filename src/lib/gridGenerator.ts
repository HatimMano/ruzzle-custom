import { mulberry32, seedFromString } from './prng'
import { Trie } from './dictionary'

// Fréquences relatives des lettres en français (normalisées sans accents)
const LETTER_WEIGHTS: [string, number][] = [
  ['e', 14.7], ['a', 8.2], ['s', 7.9], ['i', 7.5], ['n', 7.1],
  ['t', 7.2], ['r', 6.6], ['u', 6.3], ['o', 5.8], ['l', 5.7],
  ['d', 3.7], ['c', 3.3], ['m', 3.0], ['p', 3.0], ['v', 1.6],
  ['g', 1.2], ['f', 1.1], ['b', 0.9], ['h', 0.7], ['q', 0.9],
  ['j', 0.5], ['x', 0.4], ['z', 0.3], ['y', 0.3], ['w', 0.1], ['k', 0.1],
]

const LETTERS = LETTER_WEIGHTS.map(([l]) => l)
const WEIGHTS = LETTER_WEIGHTS.map(([, w]) => w)
const TOTAL_WEIGHT = WEIGHTS.reduce((a, b) => a + b, 0)
const CUM_WEIGHTS = WEIGHTS.reduce<number[]>((acc, w, i) => {
  acc.push((acc[i - 1] ?? 0) + w)
  return acc
}, [])

function weightedRandom(rand: () => number): string {
  const r = rand() * TOTAL_WEIGHT
  const idx = CUM_WEIGHTS.findIndex(cw => cw >= r)
  return LETTERS[idx >= 0 ? idx : LETTERS.length - 1]
}

export interface Cell {
  letter: string
  row: number
  col: number
}

export type Grid = Cell[][]

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
]

function getNeighbors(row: number, col: number, size = 4): [number, number][] {
  return DIRECTIONS
    .map(([dr, dc]) => [row + dr, col + dc] as [number, number])
    .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size)
}

// DFS pour trouver tous les mots valides dans une grille
function findAllWords(grid: Grid, trie: Trie, minLetters = 5): Set<string> {
  const found = new Set<string>()
  const size = grid.length

  function dfs(
    row: number, col: number,
    path: string,
    visited: boolean[][],
    node: Trie
  ) {
    const letter = grid[row][col].letter
    const nextNode = node.children.get(letter)
    if (!nextNode) return

    const word = path + letter
    if (nextNode.isWord && word.length >= minLetters) found.add(word)

    // Élagage : si aucun préfixe possible, on arrête
    if (nextNode.children.size === 0) return

    // Limite profondeur à 10 (mots max 10 chars)
    if (word.length >= 10) return

    visited[row][col] = true
    for (const [nr, nc] of getNeighbors(row, col, size)) {
      if (!visited[nr][nc]) {
        dfs(nr, nc, word, visited, nextNode)
      }
    }
    visited[row][col] = false
  }

  const visited = Array.from({ length: size }, () => Array(size).fill(false))

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      dfs(r, c, '', visited, trie)
    }
  }

  return found
}

function generateRandomGrid(rand: () => number): Grid {
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, col) => ({
      letter: weightedRandom(rand),
      row,
      col,
    }))
  )
}

const MAX_ATTEMPTS = 500
const MAX_ATTEMPTS_DAILY = 800

const PYRAMID_REQUIRED = [3, 4, 5, 6, 7, 8] as const

function hasPyramidCoverage(words: Set<string>): boolean {
  for (const len of PYRAMID_REQUIRED) {
    const has = len === 8
      ? [...words].some(w => w.length >= 8)
      : [...words].some(w => w.length === len)
    if (!has) return false
  }
  return true
}

function pyramidCoverageScore(words: Set<string>): number {
  let score = 0
  for (const len of PYRAMID_REQUIRED) {
    const has = len === 8
      ? [...words].some(w => w.length >= 8)
      : [...words].some(w => w.length === len)
    if (has) score++
  }
  return score
}

export function generateDailyGrid(seed: string, trie: Trie): { grid: Grid; validWords: Set<string> } {
  const numericSeed = seedFromString(seed)
  const rand = mulberry32(numericSeed)

  let bestGrid: Grid | null = null
  let bestWords: Set<string> = new Set()
  let bestScore = -1

  for (let attempt = 0; attempt < MAX_ATTEMPTS_DAILY; attempt++) {
    const grid = generateRandomGrid(rand)
    const words = findAllWords(grid, trie, 3)

    if (hasPyramidCoverage(words)) {
      return { grid, validWords: words }
    }

    const score = pyramidCoverageScore(words)
    if (score > bestScore) {
      bestScore = score
      bestGrid = grid
      bestWords = words
    }
  }

  return { grid: bestGrid ?? generateRandomGrid(rand), validWords: bestWords }
}

function minWordsForConfig(minLetters: number): number {
  if (minLetters <= 3) return 120
  if (minLetters === 4) return 100
  if (minLetters === 5) return 70
  if (minLetters === 6) return 30
  return 12
}

export function generateGrid(seed: string, trie: Trie, minLetters = 5): { grid: Grid; validWords: Set<string> } {
  const numericSeed = seedFromString(seed)
  const rand = mulberry32(numericSeed)
  const minWords = minWordsForConfig(minLetters)

  let bestGrid: Grid | null = null
  let bestWords: Set<string> = new Set()

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const grid = generateRandomGrid(rand)
    const words = findAllWords(grid, trie, minLetters)

    if (words.size >= minWords) {
      return { grid, validWords: words }
    }

    if (words.size > bestWords.size) {
      bestGrid = grid
      bestWords = words
    }
  }

  // Fallback : retourner la meilleure grille trouvée
  return { grid: bestGrid ?? generateRandomGrid(rand), validWords: bestWords }
}

// Vérifie si un chemin de cellules est valide (adjacence + pas de répétition)
export function isValidPath(cells: Cell[]): boolean {
  if (cells.length < 2) return true
  const visited = new Set<string>()
  for (let i = 0; i < cells.length; i++) {
    const key = `${cells[i].row},${cells[i].col}`
    if (visited.has(key)) return false
    visited.add(key)
    if (i > 0) {
      const prev = cells[i - 1]
      const dr = Math.abs(cells[i].row - prev.row)
      const dc = Math.abs(cells[i].col - prev.col)
      if (dr > 1 || dc > 1) return false
    }
  }
  return true
}

export function pathToWord(cells: Cell[]): string {
  return cells.map(c => c.letter).join('')
}

// Trouve un chemin valide pour un mot donné dans la grille
export function findWordPath(grid: Grid, word: string): Cell[] | null {
  const size = grid.length

  function dfs(r: number, c: number, idx: number, path: Cell[], visited: boolean[][]): Cell[] | null {
    if (grid[r][c].letter !== word[idx]) return null
    path.push(grid[r][c])
    if (idx === word.length - 1) return [...path]
    visited[r][c] = true
    for (const [nr, nc] of getNeighbors(r, c, size)) {
      if (!visited[nr][nc]) {
        const result = dfs(nr, nc, idx + 1, path, visited)
        if (result) { visited[r][c] = false; return result }
      }
    }
    path.pop()
    visited[r][c] = false
    return null
  }

  const visited = Array.from({ length: size }, () => Array(size).fill(false))
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const result = dfs(r, c, 0, [], visited)
      if (result) return result
    }
  }
  return null
}
