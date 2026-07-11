/**
 * Réplique generateSpeedleGrid (src/lib/dailyModes.ts) pour vérifier la grille
 * d'une date donnée : nombre de mots 8L+ (cible 2-5) + richesse totale.
 *
 * Usage : node scripts/check-speedle-grid.mjs [date=2026-07-12]
 */
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED = process.argv[2] ?? '2026-07-12'

// ── Répliques exactes de src/lib (prng.ts + gridGenerator.ts) ────────────────
function mulberry32(seed) {
  let s = seed >>> 0
  return function () {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function seedFromString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return h >>> 0
}

const LETTER_WEIGHTS = [
  ['e', 14.7], ['a', 8.2], ['s', 7.9], ['i', 7.5], ['n', 7.1],
  ['t', 7.2], ['r', 6.6], ['u', 6.3], ['o', 5.8], ['l', 5.7],
  ['d', 3.7], ['c', 3.3], ['m', 3.0], ['p', 3.0], ['v', 1.6],
  ['g', 1.2], ['f', 1.1], ['b', 0.9], ['h', 0.7], ['q', 0.9],
  ['j', 0.5], ['x', 0.4], ['z', 0.3], ['y', 0.3], ['w', 0.1], ['k', 0.1],
]
const LETTERS = LETTER_WEIGHTS.map(([l]) => l)
const WEIGHTS = LETTER_WEIGHTS.map(([, w]) => w)
const TOTAL_WEIGHT = WEIGHTS.reduce((a, b) => a + b, 0)
const CUM_WEIGHTS = WEIGHTS.reduce((acc, w, i) => { acc.push((acc[i - 1] ?? 0) + w); return acc }, [])

function weightedRandomLetter(rand) {
  const r = rand() * TOTAL_WEIGHT
  const idx = CUM_WEIGHTS.findIndex(cw => cw >= r)
  return LETTERS[idx >= 0 ? idx : LETTERS.length - 1]
}

function generateRandomGrid(rand, size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({ letter: weightedRandomLetter(rand), row, col }))
  )
}

class Trie {
  constructor() { this.children = new Map(); this.isWord = false }
  insert(word) {
    let node = this
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new Trie())
      node = node.children.get(ch)
    }
    node.isWord = true
  }
}

const DIRECTIONS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
function findAllWords(grid, trie, minLen, maxLen) {
  const found = new Set()
  const size = grid.length
  function dfs(row, col, path, visited, node) {
    const letter = grid[row][col].letter
    const next = node.children.get(letter)
    if (!next) return
    const word = path + letter
    if (next.isWord && word.length >= minLen) found.add(word)
    if (next.children.size === 0 || word.length >= maxLen) return
    visited[row][col] = true
    for (const [dr, dc] of DIRECTIONS) {
      const r = row + dr, c = col + dc
      if (r >= 0 && r < size && c >= 0 && c < size && !visited[r][c]) dfs(r, c, word, visited, next)
    }
    visited[row][col] = false
  }
  const visited = Array.from({ length: size }, () => Array(size).fill(false))
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dfs(r, c, '', visited, trie)
  return found
}

// ── Réplique de generateSpeedleGrid (dailyModes.ts) ──────────────────────────
const MAX_ATTEMPTS_DAILY = 800

function generateSpeedleGrid(seed, trie) {
  const rand = mulberry32(seedFromString(seed))
  let bestGrid = null
  let bestWords = new Set()
  let bestScore = -1
  for (let attempt = 0; attempt < MAX_ATTEMPTS_DAILY; attempt++) {
    const grid = generateRandomGrid(rand, 4)
    const words = findAllWords(grid, trie, 3, 10)
    const capCount = [...words].filter((w) => w.length >= 8).length
    if (words.size >= 100 && capCount >= 2 && capCount <= 5) {
      return { grid, words, capCount, attempt, constrained: true }
    }
    const score = words.size - Math.abs(capCount - 3) * 100
    if (score > bestScore) { bestScore = score; bestGrid = grid; bestWords = words }
  }
  const capCount = [...bestWords].filter((w) => w.length >= 8).length
  return { grid: bestGrid, words: bestWords, capCount, attempt: -1, constrained: false }
}

const text = await readFile(path.join(__dirname, '..', 'public', 'words_fr.txt'), 'utf-8')
const trie = new Trie()
for (const w of text.split('\n').filter(w => w.length >= 3 && w.length <= 10)) trie.insert(w)

const { grid, words, capCount, attempt, constrained } = generateSpeedleGrid(SEED, trie)
const byLen = {}
for (const w of words) byLen[w.length] = (byLen[w.length] ?? 0) + 1
const capWords = [...words].filter(w => w.length >= 8).sort()

console.log(`Seed : ${SEED} ${constrained ? `(contrainte OK, tentative #${attempt})` : '⚠ FALLBACK (contrainte non satisfaite)'}`)
console.log(grid.map(row => row.map(c => c.letter.toUpperCase()).join(' ')).join('\n'))
console.log(`Total : ${words.size} mots · Distribution : ${Object.entries(byLen).map(([L, n]) => `${L}L=${n}`).join('  ')}`)
console.log(`Mots 8L+ (${capCount}) : ${capWords.join(', ') || '—'}`)
