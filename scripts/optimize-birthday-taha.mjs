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
// argv[3] : mots à placer, séparés par des virgules (défaut = grille Taha)
const WORDS = (process.argv[3] ?? 'gourmand,docteur,donkey')
  .toLowerCase()
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean)
  .sort((a, b) => b.length - a.length) // ordre décroissant = pruning maximal

const SIZE = 4
const MAX_LEN = 10
const TOP_K = 5

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
function* placements(word, cells, forcedStart = null) {
  const n = word.length
  function* dfs(i, cell, used, assigned) {
    if (i === n) { yield assigned; return }
    const ch = word[i]
    const candidates = i === 0
      ? (forcedStart !== null ? [forcedStart] : [...Array(SIZE * SIZE).keys()])
      : NEIGHBORS[cell]
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

// Cap mémoire : on stocke les grilles en strings (16 chars) et on arrête
// la collecte à MAX_SOLUTIONS (l'espace explose avec peu de mots à placer).
const MAX_SOLUTIONS = 200000

// ⚠ Le plafond MAX_SOLUTIONS était atteint avant que le DFS n'ait fini d'explorer
// la case de départ 0 du premier mot : toutes les solutions collectées démarraient
// dans le coin haut-gauche. On impose donc un quota PAR case de départ, sinon la
// recherche de furtivité n'a qu'un seul coin de grille à se mettre sous la dent.
function collectSolutions() {
  const seen = new Set()
  const QUOTA = Math.ceil(MAX_SOLUTIONS / (SIZE * SIZE))
  for (let start = 0; start < SIZE * SIZE; start++) {
    let taken = 0
    let full = false
    const rec = (wordIdx, cells) => {
      if (full) return
      if (wordIdx === WORDS.length) {
        const key = cells.map(x => x ?? '.').join('')
        if (!seen.has(key)) {
          seen.add(key)
          if (++taken >= QUOTA) full = true
        }
        return
      }
      for (const a of placements(WORDS[wordIdx], cells, wordIdx === 0 ? start : null)) {
        if (full) return
        rec(wordIdx + 1, cells.map((v, i) => a.get(i) ?? v))
      }
    }
    rec(0, Array(SIZE * SIZE).fill(null))
  }
  return [...seen].map(key => key.split('').map(c => (c === '.' ? null : c)))
}

// ─── Phase 2 : remplissage + scoring ─────────────────────────────────────────

const LETTER_WEIGHTS = [
  ['e', 14.7], ['a', 8.2], ['s', 7.9], ['i', 7.5], ['n', 7.1],
  ['t', 7.2], ['r', 6.6], ['u', 6.3], ['o', 5.8], ['l', 5.7],
  ['d', 3.7], ['c', 3.3], ['m', 3.0], ['p', 3.0], ['v', 1.6],
  ['g', 1.2], ['f', 1.1], ['b', 0.9], ['h', 0.7],
]
// Les lettres rares (y, k, z…) sont absentes des poids ci-dessus : elles ne
// produisent quasi aucun mot. Mais si le mot à cacher en contient une, elle est
// UNIQUE dans la grille et sert d'ancre visuelle — le joueur repère le Y et
// inspecte ses voisins. `EXTRA_LETTERS=y` autorise le tirage d'un leurre.
for (const l of (process.env.EXTRA_LETTERS ?? '').toLowerCase().split(',').filter(Boolean)) {
  const w = parseFloat(process.env.EXTRA_WEIGHT ?? '2.5')
  LETTER_WEIGHTS.push([l.trim(), w])
}
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

// ─── Furtivité (opt-in via STEALTH_WORD) ─────────────────────────────────────
// Un mot placé peut être trivial à repérer (lettres groupées, chemin rectiligne,
// dans le sens de lecture) ou au contraire se fondre dans la grille. Sur les
// grilles anniversaire le mot perso est attendu par les joueurs : on veut qu'il
// se mérite. On mesure la visibilité du chemin LE PLUS repérable (pire cas pour
// nous) et on minimise cette valeur.
const STEALTH_WORD = (process.env.STEALTH_WORD ?? '').toLowerCase().trim()
const MIN_WORDS = parseInt(process.env.MIN_WORDS ?? '0', 10)
const MIN_SCORE = parseInt(process.env.MIN_SCORE ?? '0', 10)
const CORNERS = new Set([0, SIZE - 1, SIZE * (SIZE - 1), SIZE * SIZE - 1])

function allWordPaths(grid, word) {
  const paths = []
  const visited = Array(SIZE * SIZE).fill(false)
  const path = []
  function dfs(i, cell) {
    if (grid[cell] !== word[i]) return
    path.push(cell); visited[cell] = true
    if (i === word.length - 1) paths.push([...path])
    else for (const nb of NEIGHBORS[cell]) if (!visited[nb]) dfs(i + 1, nb)
    visited[cell] = false; path.pop()
  }
  for (let s = 0; s < SIZE * SIZE; s++) dfs(0, s)
  return paths
}

// Visibilité d'un chemin : haut = saute aux yeux.
function visibility(path) {
  const rc = path.map(i => [Math.floor(i / SIZE), i % SIZE])
  const steps = rc.length - 1
  let turns = 0, run = 1, maxRun = 1, forward = 0, prev = null
  for (let i = 1; i < rc.length; i++) {
    const dr = rc[i][0] - rc[i - 1][0], dc = rc[i][1] - rc[i - 1][1]
    // sens de lecture : vers la droite, ou vers le bas à colonne égale
    if (dc > 0 || (dc === 0 && dr > 0)) forward++
    if (prev && dr === prev[0] && dc === prev[1]) { run++; if (run > maxRun) maxRun = run }
    else { if (prev) turns++; run = 1 }
    prev = [dr, dc]
  }
  const rows = rc.map(x => x[0]), cols = rc.map(x => x[1])
  const bbox = (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1)
  // Amorce : les 3 premières lettres pilotent la découverte. Si elles se lisent
  // de gauche à droite sur une même ligne, le mot se donne tout seul.
  let opener = 0
  for (let i = 1; i <= Math.min(3, steps); i++) {
    const dr = rc[i][0] - rc[i - 1][0], dc = rc[i][1] - rc[i - 1][1]
    if (dr === 0 && dc === 1) opener += 2.0
    else if (dc === 1) opener += 0.8
  }
  return 2.0 * (steps - 1 - turns)      // segments rectilignes
       + 1.5 * (SIZE * SIZE - bbox) / 4 // lettres groupées = paquet repérable
       + 2.0 * (forward / steps)        // suit le sens de lecture
       + 1.5 * (maxRun / steps)         // plus longue ligne droite
       + opener
       + (CORNERS.has(path[0]) ? 2.0 : 0) // départ dans un coin = scanné en premier
}

// Lettres du mot présentes en surnombre = fausses pistes. Pondéré par la rareté :
// un second Y vaut infiniment plus qu'un second E (le E est partout de toute façon).
// ⚠ Rareté réelle en français, à ne PAS confondre avec LETTER_WEIGHTS qui pilote
// la probabilité de TIRAGE : monter EXTRA_WEIGHT pour faire sortir un Y plus
// souvent ne doit pas mécaniquement dévaluer ce Y comme leurre.
const FREQ = new Map([
  ...LETTER_WEIGHTS.filter(([l]) => !(process.env.EXTRA_LETTERS ?? '').includes(l)),
  ['y', 0.3], ['k', 0.05], ['x', 0.4], ['z', 0.1], ['j', 0.5], ['q', 1.0], ['w', 0.05],
])
function decoyCount(grid, word) {
  const need = new Map()
  for (const ch of word) need.set(ch, (need.get(ch) ?? 0) + 1)
  let extra = 0
  for (const [ch, n] of need) {
    const dup = Math.max(0, grid.filter(c => c === ch).length - n)
    extra += dup * (8 / (FREQ.get(ch) ?? 0.5))
  }
  return extra
}

// Bas = furtif. Retourne null si le mot n'est pas traçable (ne devrait pas arriver).
function stealthScore(grid, word) {
  const paths = allWordPaths(grid, word)
  if (paths.length === 0) return null
  const worst = Math.max(...paths.map(visibility))
  // Les leurres aident mais ne rachètent pas un chemin évident : plafond à 6.
  const decoys = Math.min(decoyCount(grid, word), 6)
  return {
    value: worst - 0.5 * decoys + 0.3 * (paths.length - 1),
    worst,
    paths: paths.length,
    decoys,
    bestPath: paths[paths.map(visibility).indexOf(worst)],
  }
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
      // Plancher de qualité : en mode furtif on trie sur autre chose que le score
      // dico, donc il faut garantir que la grille reste riche.
      if (found.size < MIN_WORDS || score < MIN_SCORE) continue
      const stealth = STEALTH_WORD ? stealthScore(grid, STEALTH_WORD) : null
      if (STEALTH_WORD && !stealth) continue
      // rank : plus haut = meilleur. Furtif = on minimise la visibilité.
      const rank = stealth ? -stealth.value : score
      if (top.length < TOP_K || rank > top[top.length - 1].rank) {
        const key = grid.join('')
        if (top.some(t => t.key === key)) continue
        top.push({ key, grid, rank, score, byLen, totalWords: found.size, found, stealth })
        top.sort((a, b) => b.rank - a.rank)
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
    const st = g.stealth
      ? ` · furtivité ${(-g.rank).toFixed(2)} (visib ${g.stealth.worst.toFixed(1)}, ${g.stealth.paths} chemin(s), ${g.stealth.decoys} leurres)`
      : ''
    console.log(`─── #${idx + 1} · score ${g.score.toFixed(0)} · ${g.totalWords} mots${st} ───`)
    console.log(gridToStr(g.grid))
    if (g.stealth) {
      const p = g.stealth.bestPath.map(i => `${String.fromCharCode(65 + (i % SIZE))}${Math.floor(i / SIZE) + 1}`)
      console.log(`Chemin ${STEALTH_WORD.toUpperCase()} le + repérable : ${p.join('→')}`)
    }
    console.log(`Distribution : ${Object.entries(g.byLen).map(([L, n]) => `${L}L=${n}`).join('  ')}`)
    console.log(`Mots 6L+ (${longWords.length}) : ${longWords.slice(0, 25).join(', ')}${longWords.length > 25 ? '…' : ''}`)
    console.log()
  })
}

main().catch(e => { console.error(e); process.exit(1) })
