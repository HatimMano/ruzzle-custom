/**
 * Teste la viabilité de différentes tailles de grille pour BiGriddle.
 * Génère N grilles, mesure la couverture pyramide selon les niveaux requis.
 *
 * Usage : node scripts/test-grid-size.mjs [size=5] [iterations=1000] [maxLen=10]
 */

import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DICT_PATH = path.join(__dirname, '..', 'public', 'words_fr.txt')

const SIZE = parseInt(process.argv[2] ?? '5', 10)
const ITER = parseInt(process.argv[3] ?? '1000', 10)
const MAX_LEN = parseInt(process.argv[4] ?? '10', 10)

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
const CUM_WEIGHTS = WEIGHTS.reduce((acc, w, i) => {
  acc.push((acc[i - 1] ?? 0) + w)
  return acc
}, [])

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

function weightedRandom(rand) {
  const r = rand() * TOTAL_WEIGHT
  const idx = CUM_WEIGHTS.findIndex(cw => cw >= r)
  return LETTERS[idx >= 0 ? idx : LETTERS.length - 1]
}

class Trie {
  constructor() {
    this.children = new Map()
    this.isWord = false
  }
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
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
]

function getNeighbors(row, col, size) {
  const out = []
  for (const [dr, dc] of DIRECTIONS) {
    const r = row + dr, c = col + dc
    if (r >= 0 && r < size && c >= 0 && c < size) out.push([r, c])
  }
  return out
}

function findAllWords(grid, trie, minLetters, maxLen) {
  const found = new Set()
  const size = grid.length

  function dfs(row, col, path, visited, node) {
    const letter = grid[row][col]
    const nextNode = node.children.get(letter)
    if (!nextNode) return

    const word = path + letter
    if (nextNode.isWord && word.length >= minLetters) found.add(word)
    if (nextNode.children.size === 0) return
    if (word.length >= maxLen) return

    visited[row][col] = true
    for (const [nr, nc] of getNeighbors(row, col, size)) {
      if (!visited[nr][nc]) dfs(nr, nc, word, visited, nextNode)
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

function generateRandomGrid(rand, size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => weightedRandom(rand))
  )
}

function pyramidCoverage(words, requiredLengths, maxBucketLen) {
  // Pour chaque longueur requise : a-t-on un mot ?
  // La dernière longueur agit comme "≥ maxBucketLen"
  const result = {}
  for (const len of requiredLengths) {
    if (len === maxBucketLen) {
      result[len] = [...words].some(w => w.length >= len)
    } else {
      result[len] = [...words].some(w => w.length === len)
    }
  }
  return result
}

async function main() {
  console.log(`\n=== Test grille ${SIZE}×${SIZE}, ${ITER} itérations, max ${MAX_LEN}L ===\n`)

  const text = await readFile(DICT_PATH, 'utf-8')
  const words = text.split('\n').filter(w => w.length >= 3 && w.length <= MAX_LEN)
  const trie = new Trie()
  for (const w of words) trie.insert(w)
  console.log(`Dico chargé : ${words.length} mots (3-${MAX_LEN}L)\n`)

  const PYRAMIDS = [
    { name: 'marathon 3→7 (actuel)',  lengths: [3, 4, 5, 6, 7], cap: 7, minAtCap: 1 },
    { name: 'marathon 3→7 + 2×7L+',   lengths: [3, 4, 5, 6, 7], cap: 7, minAtCap: 2 },
    { name: 'marathon 3→7 + 3×7L+',   lengths: [3, 4, 5, 6, 7], cap: 7, minAtCap: 3 },
    { name: 'marathon 3→7 + 5×7L+',   lengths: [3, 4, 5, 6, 7], cap: 7, minAtCap: 5 },
    { name: 'marathon 3→7 + 7×7L+',   lengths: [3, 4, 5, 6, 7], cap: 7, minAtCap: 7 },
  ]

  // Stats par longueur : combien de grilles ont ≥1 mot de cette longueur
  const lenCount = {}
  for (let L = 3; L <= MAX_LEN; L++) lenCount[L] = 0

  // Stats pyramide : combien de grilles couvrent chaque pyramide
  const pyramidHits = PYRAMIDS.map(() => 0)

  // Distribution du nombre de mots par grille
  const wordCounts = []

  // Distribution des longueurs max trouvées
  const maxLenCounts = {}
  for (let L = 0; L <= MAX_LEN; L++) maxLenCounts[L] = 0

  // Premier essai où on atteint chaque pyramide (échantillonnage avec seeds différentes)
  // On simule 50 "défis quotidiens" : pour chacun, combien d'attempts avant succès ?
  const SAMPLES = 50
  const attemptsToCover = PYRAMIDS.map(() => [])

  const startTime = Date.now()
  let baseRand = mulberry32(42)

  for (let i = 0; i < ITER; i++) {
    const grid = generateRandomGrid(baseRand, SIZE)
    const found = findAllWords(grid, trie, 3, MAX_LEN)

    wordCounts.push(found.size)

    const lengthsPresent = new Set([...found].map(w => w.length))
    for (let L = 3; L <= MAX_LEN; L++) {
      if (lengthsPresent.has(L) || (L === MAX_LEN && [...lengthsPresent].some(l => l >= L))) {
        lenCount[L]++
      }
    }

    let maxL = 0
    for (const w of found) if (w.length > maxL) maxL = w.length
    maxLenCounts[Math.min(maxL, MAX_LEN)]++

    PYRAMIDS.forEach((p, idx) => {
      const cov = pyramidCoverage(found, p.lengths, p.cap)
      if (!Object.values(cov).every(Boolean)) return
      if (p.minAtCap) {
        const cnt = [...found].filter(w => w.length >= p.cap).length
        if (cnt < p.minAtCap) return
      }
      pyramidHits[idx]++
    })
  }

  // Maintenant : pour chaque pyramide, combien d'essais médian / max pour atteindre la couverture
  for (let s = 0; s < SAMPLES; s++) {
    const seedRand = mulberry32(1000 + s * 97)
    const reached = new Set()
    let attempts = 0
    while (reached.size < PYRAMIDS.length && attempts < 5000) {
      attempts++
      const grid = generateRandomGrid(seedRand, SIZE)
      const found = findAllWords(grid, trie, 3, MAX_LEN)
      PYRAMIDS.forEach((p, idx) => {
        if (reached.has(idx)) return
        const cov = pyramidCoverage(found, p.lengths, p.cap)
        if (!Object.values(cov).every(Boolean)) return
        if (p.minAtCap) {
          const cnt = [...found].filter(w => w.length >= p.cap).length
          if (cnt < p.minAtCap) return
        }
        reached.add(idx)
        attemptsToCover[idx].push(attempts)
      })
    }
    // Pyramides non atteintes = max
    PYRAMIDS.forEach((_, idx) => {
      if (!reached.has(idx)) attemptsToCover[idx].push(5000)
    })
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`Génération : ${elapsed}s\n`)

  // === Rapport ===
  console.log('--- Mots/grille (distribution) ---')
  wordCounts.sort((a, b) => a - b)
  const median = wordCounts[Math.floor(wordCounts.length / 2)]
  const p10 = wordCounts[Math.floor(wordCounts.length * 0.1)]
  const p90 = wordCounts[Math.floor(wordCounts.length * 0.9)]
  console.log(`  p10=${p10}  median=${median}  p90=${p90}  min=${wordCounts[0]}  max=${wordCounts[wordCounts.length - 1]}\n`)

  console.log('--- Présence par longueur (% grilles avec ≥1 mot de cette longueur) ---')
  for (let L = 3; L <= MAX_LEN; L++) {
    const pct = (lenCount[L] / ITER * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(lenCount[L] / ITER * 50))
    console.log(`  ${L}L : ${pct.padStart(5)}%  ${bar}`)
  }
  console.log()

  console.log('--- Longueur max atteinte (distribution) ---')
  for (let L = 3; L <= MAX_LEN; L++) {
    if (maxLenCounts[L] === 0) continue
    const pct = (maxLenCounts[L] / ITER * 100).toFixed(1)
    console.log(`  max=${L}L : ${pct.padStart(5)}%`)
  }
  console.log()

  // Distribution du nombre de mots ≥ MAX_LEN par grille
  console.log(`--- Nombre de mots ≥${MAX_LEN}L par grille ---`)
  // recompute en passant — on regenere une seconde passe avec la même seed
  const count10 = {}
  let baseRand2 = mulberry32(42)
  for (let i = 0; i < ITER; i++) {
    const grid = generateRandomGrid(baseRand2, SIZE)
    const found = findAllWords(grid, trie, 3, MAX_LEN)
    const c10 = [...found].filter(w => w.length >= MAX_LEN).length
    count10[c10] = (count10[c10] ?? 0) + 1
  }
  const ks = Object.keys(count10).map(Number).sort((a, b) => a - b)
  for (const k of ks) {
    const pct = (count10[k] / ITER * 100).toFixed(1)
    const bar = '█'.repeat(Math.round(count10[k] / ITER * 50))
    console.log(`  ${k} mots : ${pct.padStart(5)}%  ${bar}`)
  }
  console.log()

  console.log('--- Couverture pyramide (% grilles satisfaisantes) ---')
  PYRAMIDS.forEach((p, idx) => {
    const pct = (pyramidHits[idx] / ITER * 100).toFixed(1)
    console.log(`  ${p.name.padEnd(18)} : ${pct.padStart(5)}%  (${pyramidHits[idx]}/${ITER})`)
  })
  console.log()

  console.log('--- Essais nécessaires pour trouver UNE grille viable (sur ' + SAMPLES + ' samples) ---')
  PYRAMIDS.forEach((p, idx) => {
    const attempts = attemptsToCover[idx].sort((a, b) => a - b)
    const med = attempts[Math.floor(attempts.length / 2)]
    const p90a = attempts[Math.floor(attempts.length * 0.9)]
    const failed = attempts.filter(a => a === 5000).length
    console.log(`  ${p.name.padEnd(18)} : médian=${med}  p90=${p90a}  échecs(>5000)=${failed}/${SAMPLES}`)
  })
  console.log()
}

main().catch(e => { console.error(e); process.exit(1) })
