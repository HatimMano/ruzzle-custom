/**
 * Cherche une grille 4×4 contenant GOURMAND + DOCTEUR (ou MEDECIN) + DONKEY,
 * tous traçables en chemins adjacents (roi) sans réutiliser une case.
 *
 * Phase 1 : backtracking de placement des 3 mots (partage de cases si même lettre).
 * Phase 2 : remplissage des cases libres (échantillonnage pondéré) + score dico
 *           + contrainte couverture pyramide 3→8.
 *
 * Usage : node scripts/optimize-birthday-taha.mjs [fillsPerPlacement=150] [word7=docteur]
 */

import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DICT_PATH = path.join(__dirname, '..', 'public', 'words_fr.txt')
const FILLS = parseInt(process.argv[2] ?? '150', 10)
const WORD7 = (process.argv[3] ?? 'docteur').toLowerCase()

const SIZE = 4
const MAX_LEN = 10
const TOP_K = 5
const WORDS = ['gourmand', WORD7, 'donkey'] // ordre décroissant = pruning maximal

// ─── Helpers grille ───────────────────────────────────────────────────────────

const NEIGHBORS = []
for (let i = 0; i < SIZE * SIZE; i++) {
  const r = Math.floor(i / SIZE), c = i % SIZE
  const out = []
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const nr = r + dr, nc = c + dc
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push(nr * SIZE + nc)
  }
  NEIGHBORS.push(out)
}

// ─── Phase 1 : placement des mots ────────────────────────────────────────────

// Place `word` sur `cells` (array de 16, lettre ou null). Yield les nouveaux
// états de cells (copies) où le mot est traçable.
function* placements(word, cells) {
  const n = word.length
  function* dfs(i, cell, used, assigned) {
    if (i === n) { yield assigned; return }
    const ch = word[i]
    const candidates = i === 0 ? [...Array(SIZE * SIZE).keys()] : NEIGHBORS[cell]
    for (const nxt of candidates) {
      if (used.has(nxt)) continue
      const cur = assigned.get(nxt) ?? cells[nxt]
      if (cur !== null && cur !== ch) continue
      const newAssigned = cur === null ? new Map(assigned).set(nxt, ch) : assigned
      used.add(nxt)
      yield* dfs(i + 1, nxt, used, newAssigned)
      used.delete(nxt)
    }
  }
  yield* dfs(0, -1, new Set(), new Map())
}

function collectSolutions() {
  const base = Array(SIZE * SIZE).fill(null)
  const solutions = []
  const seen = new Set()
  for (const a1 of placements(WORDS[0], base)) {
    const g1 = base.map((v, i) => a1.get(i) ?? v)
    for (const a2 of placements(WORDS[1], g1)) {
      const g2 = g1.map((v, i) => a2.get(i) ?? v)
      for (const a3 of placements(WORDS[2], g2)) {
        const g3 = g2.map((v, i) => a3.get(i) ?? v)
        const key = g3.map(x => x ?? '.').join('')
        if (seen.has(key)) continue
        seen.add(key)
        solutions.push(g3)
      }
    }
  }
  return solutions
}

// ─── Phase 2 : remplissage + scoring ─────────────────────────────────────────

const LETTER_WEIGHTS = [
  ['e', 14.7], ['a', 8.2], ['s', 7.9], ['i', 7.5], ['n', 7.1],
  ['t', 7.2], ['r', 6.6], ['u', 6.3], ['o', 5.8], ['l', 5.7],
  ['d', 3.7], ['c', 3.3], ['m', 3.0], ['p', 3.0], ['v', 1.6],
  ['g', 1.2], ['f', 1.1], ['b', 0.9], ['h', 0.7],
]
const TOTAL_W = LETTER_WEIGHTS.reduce((a, [, w]) => a + w, 0)

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
  let r = rand() * TOTAL_W
  for (const [l, w] of LETTER_WEIGHTS) { r -= w; if (r <= 0) return l }
  return 'e'
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

function findAllWords(grid, trie) {
  const found = new Set()
  function dfs(cell, word, visited, node) {
    const next = node.children.get(grid[cell])
    if (!next) return
    const w = word + grid[cell]
    if (next.isWord && w.length >= 3) found.add(w)
    if (w.length >= MAX_LEN || next.children.size === 0) return
    visited[cell] = true
    for (const n of NEIGHBORS[cell]) if (!visited[n]) dfs(n, w, visited, next)
    visited[cell] = false
  }
  const visited = Array(SIZE * SIZE).fill(false)
  for (let i = 0; i < SIZE * SIZE; i++) dfs(i, '', visited, trie)
  return found
}

const SCORE_W = { 3: 0.5, 4: 1, 5: 3, 6: 10, 7: 25, 8: 50, 9: 80, 10: 120 }
function scoreWords(words) {
  let score = 0
  const byLen = {}
  for (const w of words) {
    score += SCORE_W[w.length] ?? 150
    byLen[w.length] = (byLen[w.length] ?? 0) + 1
  }
  return { score, byLen }
}

const MAX_CAP8 = parseInt(process.argv[4] ?? '6', 10)

function hasCoverage(words) {
  // Pyramide 3→8 : un mot exact par niveau 3-7, 2 à MAX_CAP8 mots au cap 8+
  // (peu de 8L+ = grille dure, le mot du cap reste trouvable mais rare)
  for (const len of [3, 4, 5, 6, 7]) {
    let ok = false
    for (const w of words) if (w.length === len) { ok = true; break }
    if (!ok) return false
  }
  let cap = 0
  for (const w of words) if (w.length >= 8) cap++
  return cap >= 2 && cap <= MAX_CAP8
}

function gridToStr(g) {
  const rows = []
  for (let r = 0; r < SIZE; r++) rows.push(g.slice(r * SIZE, (r + 1) * SIZE).map(c => c.toUpperCase()).join(' '))
  return rows.join('\n')
}

async function main() {
  console.log(`\n=== Grille 4×4 avec ${WORDS.map(w => w.toUpperCase()).join(' + ')} ===\n`)

  console.log('Phase 1 : recherche des placements…')
  const t0 = Date.now()
  const solutions = collectSolutions()
  console.log(`→ ${solutions.length} placements uniques (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`)
  if (solutions.length === 0) {
    console.log('❌ INFAISABLE en 4×4 avec ces 3 mots.')
    process.exit(2)
  }

  let minFree = Infinity, maxFree = -Infinity
  for (const s of solutions) {
    const n = s.filter(x => x === null).length
    if (n < minFree) minFree = n
    if (n > maxFree) maxFree = n
  }
  console.log(`Cases libres : min ${minFree}, max ${maxFree}`)

  const text = await readFile(DICT_PATH, 'utf-8')
  const dictWords = text.split('\n').filter(w => w.length >= 3 && w.length <= MAX_LEN)
  const trie = new Trie()
  for (const w of dictWords) trie.insert(w)
  console.log(`Dico : ${dictWords.length} mots\n`)

  // Échantillonnage : max ~4000 placements (priorité aux plus de cases libres =
  // plus de latitude pour enrichir la grille en mots).
  const rand = mulberry32(20260710)
  let sample = solutions
  const MAX_PLACEMENTS = 4000
  if (solutions.length > MAX_PLACEMENTS) {
    sample = [...solutions]
    for (let i = sample.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[sample[i], sample[j]] = [sample[j], sample[i]]
    }
    sample.sort((a, b) => b.filter(x => x === null).length - a.filter(x => x === null).length)
    sample = sample.slice(0, MAX_PLACEMENTS)
  }
  console.log(`Phase 2 : ${sample.length} placements échantillonnés × ${FILLS} essais…`)
  const top = []
  const t1 = Date.now()

  for (const sol of sample) {
    const freeIdx = sol.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0)
    for (let f = 0; f < FILLS; f++) {
      const grid = [...sol]
      for (const i of freeIdx) grid[i] = pickLetter(rand)
      const found = findAllWords(grid, trie)
      if (!hasCoverage(found)) continue
      const { score, byLen } = scoreWords(found)
      if (top.length < TOP_K || score > top[top.length - 1].score) {
        const key = grid.join('')
        if (top.some(t => t.key === key)) continue
        top.push({ key, grid, score, byLen, totalWords: found.size, found })
        top.sort((a, b) => b.score - a.score)
        if (top.length > TOP_K) top.pop()
      }
    }
  }
  console.log(`→ ${((Date.now() - t1) / 1000).toFixed(1)}s\n`)

  if (top.length === 0) {
    console.log('❌ Aucune grille avec couverture pyramide 3→8. Relâcher les contraintes ?')
    process.exit(3)
  }

  top.forEach((g, idx) => {
    const longWords = [...g.found].filter(w => w.length >= 6).sort((a, b) => b.length - a.length || a.localeCompare(b))
    console.log(`─── #${idx + 1} · score ${g.score.toFixed(0)} · ${g.totalWords} mots ───`)
    console.log(gridToStr(g.grid))
    console.log(`Distribution : ${Object.entries(g.byLen).map(([L, n]) => `${L}L=${n}`).join('  ')}`)
    console.log(`Mots 6L+ (${longWords.length}) : ${longWords.slice(0, 25).join(', ')}${longWords.length > 25 ? '…' : ''}`)
    console.log()
  })
}

main().catch(e => { console.error(e); process.exit(1) })
