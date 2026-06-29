/**
 * Cherche la meilleure grille 4×4 contenant MAMAN + AMOUR.
 * 8 cases fixes (chemins MAMAN et AMOUR garantis), 8 cases libres.
 * Score = poids des mots par longueur (plus on monte, plus c'est précieux).
 *
 * Usage : node scripts/optimize-birthday-fate.mjs [iterations=20000]
 */

import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DICT_PATH = path.join(__dirname, '..', 'public', 'words_fr.txt')
const ITER = parseInt(process.argv[2] ?? '20000', 10)
const TOP_K = 5
const MAX_LEN = 10

// Layout :
//   A M O U
//   M . S R
//   A . I .
//   N . B .
// MAMAN : M(0,1)→A(0,0)→M(1,0)→A(2,0)→N(3,0)
// AMOUR : A(0,0)→M(0,1)→O(0,2)→U(0,3)→R(1,3)
// BISOU : B(3,2)→I(2,2)→S(1,2)→O(0,2)→U(0,3)
const FIXED = {
  '0,0': 'a', '0,1': 'm', '0,2': 'o', '0,3': 'u',
  '1,0': 'm', '1,2': 's', '1,3': 'r',
  '2,0': 'a', '2,2': 'i',
  '3,0': 'n', '3,2': 'b',
}
const FREE_CELLS = [
  [1, 1],
  [2, 1], [2, 3],
  [3, 1], [3, 3],
]

const LETTER_WEIGHTS = [
  ['e', 14.7], ['a', 8.2], ['s', 7.9], ['i', 7.5], ['n', 7.1],
  ['t', 7.2], ['r', 6.6], ['u', 6.3], ['o', 5.8], ['l', 5.7],
  ['d', 3.7], ['c', 3.3], ['m', 3.0], ['p', 3.0], ['v', 1.6],
  ['g', 1.2], ['f', 1.1], ['b', 0.9], ['h', 0.7], ['q', 0.9],
  ['j', 0.5], ['x', 0.4], ['z', 0.3], ['y', 0.3],
]
const LETTERS = LETTER_WEIGHTS.map(([l]) => l)
const WEIGHTS = LETTER_WEIGHTS.map(([, w]) => w)
const TOTAL_W = WEIGHTS.reduce((a, b) => a + b, 0)
const CUM_W = WEIGHTS.reduce((acc, w, i) => { acc.push((acc[i-1] ?? 0) + w); return acc }, [])

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

function pickLetter(rand) {
  const r = rand() * TOTAL_W
  const idx = CUM_W.findIndex(cw => cw >= r)
  return LETTERS[idx >= 0 ? idx : LETTERS.length - 1]
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

const DIRECTIONS = [
  [-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],
]
function getNeighbors(row, col, size) {
  const out = []
  for (const [dr,dc] of DIRECTIONS) {
    const r = row+dr, c = col+dc
    if (r>=0 && r<size && c>=0 && c<size) out.push([r,c])
  }
  return out
}

function findAllWords(grid, trie, minLen, maxLen) {
  const found = new Set()
  const size = grid.length
  function dfs(row, col, path, visited, node) {
    const letter = grid[row][col]
    const next = node.children.get(letter)
    if (!next) return
    const word = path + letter
    if (next.isWord && word.length >= minLen) found.add(word)
    if (next.children.size === 0) return
    if (word.length >= maxLen) return
    visited[row][col] = true
    for (const [nr,nc] of getNeighbors(row, col, size)) {
      if (!visited[nr][nc]) dfs(nr, nc, word, visited, next)
    }
    visited[row][col] = false
  }
  const visited = Array.from({length:size}, () => Array(size).fill(false))
  for (let r=0; r<size; r++) for (let c=0; c<size; c++) dfs(r, c, '', visited, trie)
  return found
}

function buildGrid(freeLetters) {
  const g = Array.from({length:4}, () => Array(4).fill('?'))
  for (const [k, v] of Object.entries(FIXED)) {
    const [r,c] = k.split(',').map(Number)
    g[r][c] = v
  }
  FREE_CELLS.forEach(([r,c], i) => { g[r][c] = freeLetters[i] })
  return g
}

function scoreWords(words) {
  // Pondération : on veut surtout les 6-7-8L. 3-5L ont peu de poids.
  // 8L = 50, 7L = 25, 6L = 10, 5L = 3, 4L = 1, 3L = 0.5
  const W = { 3:0.5, 4:1, 5:3, 6:10, 7:25, 8:50, 9:80, 10:120 }
  let score = 0
  const byLen = {}
  for (const w of words) {
    const L = Math.min(w.length, 10)
    score += W[L] ?? 150
    byLen[L] = (byLen[L] ?? 0) + 1
  }
  return { score, byLen }
}

function gridToStr(g) {
  return g.map(row => row.map(c => c.toUpperCase()).join(' ')).join('\n')
}

async function main() {
  console.log(`\n=== Optimisation grille 4×4 avec MAMAN + AMOUR ===`)
  console.log(`Iterations : ${ITER}\n`)

  const text = await readFile(DICT_PATH, 'utf-8')
  const words = text.split('\n').filter(w => w.length >= 3 && w.length <= MAX_LEN)
  const trie = new Trie()
  for (const w of words) trie.insert(w)
  console.log(`Dico : ${words.length} mots (3-${MAX_LEN}L)\n`)

  // Verify MAMAN + AMOUR exist in dict
  console.log(`MAMAN dans dico : ${words.includes('maman')}`)
  console.log(`AMOUR dans dico : ${words.includes('amour')}\n`)

  const top = []  // {grid, score, byLen, longWords}
  const rand = mulberry32(20260630)
  const start = Date.now()

  for (let i = 0; i < ITER; i++) {
    const freeLetters = FREE_CELLS.map(() => pickLetter(rand))
    const grid = buildGrid(freeLetters)
    const found = findAllWords(grid, trie, 3, MAX_LEN)
    const { score, byLen } = scoreWords(found)

    // Doit contenir MAMAN, AMOUR et BISOU (vérification de cohérence)
    if (!found.has('maman') || !found.has('amour') || !found.has('bisou')) continue

    const longWords = [...found].filter(w => w.length >= 6).sort((a,b) => b.length - a.length || a.localeCompare(b))

    if (top.length < TOP_K || score > top[top.length-1].score) {
      top.push({ grid, score, byLen, longWords, totalWords: found.size })
      top.sort((a,b) => b.score - a.score)
      if (top.length > TOP_K) top.pop()
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`Génération : ${elapsed}s\n`)
  console.log(`Top ${TOP_K} grilles trouvées :\n`)

  top.forEach((g, idx) => {
    console.log(`─── #${idx+1} · score ${g.score.toFixed(0)} · ${g.totalWords} mots total ───`)
    console.log(gridToStr(g.grid))
    console.log()
    console.log(`Distribution : ${Object.entries(g.byLen).map(([L,n]) => `${L}L=${n}`).join('  ')}`)
    console.log(`Mots 6L+ (${g.longWords.length}) : ${g.longWords.slice(0, 20).join(', ')}${g.longWords.length > 20 ? '...' : ''}`)
    console.log()
  })
}

main().catch(e => { console.error(e); process.exit(1) })
