/**
 * Génère public/words_fr.txt depuis :
 *   - Lexique383 (lexique.org) : pour les fréquences par lemme
 *   - GLAFF v1.2.2 (Wiktionnaire, univ Toulouse) : pour la couverture exhaustive
 *     des formes fléchies (passé simple, subjonctif imparfait, accords rares...)
 *
 * Filtrage dégressif selon la longueur du mot :
 *   - 3-5L : freq lemme >= 0.01 (tolérant — faux positifs peu graves)
 *   - 6L   : freq lemme >= 0.1
 *   - 7L   : freq lemme >= 0.5
 *   - 8-10L: freq lemme >= 1.0  (strict — c'est là qu'on score gros)
 *
 * Usage : node scripts/build-dict.mjs  (~30-60s, télécharge ~165 Mo)
 */

import { writeFile } from 'fs/promises'
import { readFile, stat } from 'fs/promises'
import { execSync } from 'child_process'
import https from 'https'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'public', 'words_fr.txt')
const AUDIT_OUT = path.join(__dirname, 'audit_long_words.txt')

const URL_LEXIQUE = 'http://www.lexique.org/databases/Lexique383/Lexique383.tsv'
const URL_GLAFF = 'http://redac.univ-tlse2.fr/lexicons/glaff/GLAFF-1.2.2.tar.bz2'

const VALID_CHARS = /^[a-z]{3,10}$/
const FREQ_MIN = 0.01

// Seuil de fréquence du lemme par longueur du mot
function freqThresholdForLength(len) {
  if (len <= 6) return 0      // tolérant : tout mot avec un lemme connu de Lexique passe
  if (len === 7) return 0.5
  return 1.0
}

// Mots anglais sans équivalent français qui passent les filtres automatiques
const BLOCKLIST = new Set([
  // 3-5L
  'about', 'same',
  // 6L+
  'reader', 'butter', 'golden', 'ground', 'please', 'damage', 'escape',
  'events', 'finish', 'hunter', 'issues', 'living', 'matter', 'rocket',
  'sample', 'spring', 'switch', 'update', 'system', 'desire',
])

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchText(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

console.log('Téléchargement de Lexique383...')
const tsv = await fetchText(URL_LEXIQUE)

const lines = tsv.split('\n')
const header = lines[0].split('\t')
const idxOrtho = header.indexOf('ortho')
const idxCgram = header.indexOf('cgram')
const idxLemme = header.indexOf('lemme')
const idxFreqlivres = header.indexOf('freqlivres')

if (idxOrtho === -1 || idxCgram === -1 || idxLemme === -1 || idxFreqlivres === -1) {
  console.error('Colonnes non trouvées. Header:', header.slice(0, 15))
  process.exit(1)
}

console.log(`Lignes brutes : ${lines.length}`)

// Passe 1 : pour chaque lemme, garder la freqlivres MAX trouvée parmi toutes ses formes.
// Idée : si un verbe/nom est connu (au moins une forme dépasse FREQ_MIN), on accepte
// toutes ses formes fléchies — y compris les conjugaisons rares (passé simple,
// subjonctif imparfait...) qu'un filtre par forme exclurait.
// Bonus : on trace les lemmes verbaux (cgram=VER) pour bypass total côté Passe 2 + GLAFF.
const lemmeMaxFreq = new Map()
const verbLemmes = new Set()       // lemmes normalisés (sans accents) dont cgram === 'VER' (infinitifs)
const verbalOrthos = new Set()     // orthos normalisés observés avec cgram === 'VER' (formes : "soulant", "soulé", ...)
const rows = []

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t')
  if (cols.length < 2) continue

  const ortho = cols[idxOrtho]?.trim()
  const cgram = cols[idxCgram]?.trim()
  const lemme = cols[idxLemme]?.trim()
  const freqlivres = parseFloat(cols[idxFreqlivres]) || 0

  if (!ortho) continue
  if (ortho[0] === ortho[0].toUpperCase() && ortho[0] !== ortho[0].toLowerCase()) continue

  rows.push({ ortho, cgram, lemme, freqlivres })

  if (lemme) {
    // Sentinel -1 pour distinguer "lemme jamais vu" de "lemme vu mais toutes formes à freq=0".
    // Important : un mot comme "cation" ou "ria" a freqlivres=0 mais est un lemme légitime.
    const prev = lemmeMaxFreq.get(lemme) ?? -1
    if (freqlivres > prev) lemmeMaxFreq.set(lemme, freqlivres)
    if (cgram === 'VER') verbLemmes.add(removeAccents(lemme).toLowerCase())
  }
  if (cgram === 'VER') {
    // L'ortho (forme fléchie) est utile aussi : ça permet de détecter qu'un mot
    // type "soulant" est une forme verbale, ce qui justifie de bypass les adjectifs
    // dérivés (ex: "soulante" = ADJ lemme=soulant → reconnu comme verbal participle).
    verbalOrthos.add(removeAccents(ortho).toLowerCase())
  }
}

console.log(`Lemmes verbaux détectés : ${verbLemmes.size}`)
console.log(`Orthos verbales détectées : ${verbalOrthos.size}`)

// Passe 2 : filtrage par seuil de fréquence dégressif selon la longueur.
// Pour les mots courts (≤5L), on accepte tout ce qui a un lemme répertorié
// dans Lexique (même freq=0) — sinon on perd "ria", "cation", etc.
// Bypass verbe : toute conjugaison d'un verbe Lexique passe sans condition de fréquence
// (résout les trous récurrents type "soulante", "citait", "relogeas"...).
const words = new Set()
const verbForms = new Set()  // formes ajoutées via bypass verbe, à protéger du filtre rétroactif
let keptShort = 0
let keptByOwnFreq = 0
let keptByLemmeFreq = 0
let keptVerbBypass = 0

for (const { ortho, cgram, lemme, freqlivres } of rows) {
  const normalized = removeAccents(ortho).toLowerCase()
  if (!VALID_CHARS.test(normalized)) continue
  if (BLOCKLIST.has(normalized)) continue
  if (words.has(normalized)) continue

  // BYPASS VERBE : forme VER directe, OU forme ADJ/NOM dont le lemme est lui-même
  // un participe verbal (ex: "soulante" = ADJ lemme=soulant ; "soulant" est aussi VER).
  const lemmeNormForm = lemme ? removeAccents(lemme).toLowerCase() : ''
  const isVerbForm = cgram === 'VER' || (lemmeNormForm && verbalOrthos.has(lemmeNormForm))
  if (isVerbForm) {
    words.add(normalized)
    verbForms.add(normalized)
    keptVerbBypass++
    continue
  }

  const threshold = freqThresholdForLength(normalized.length)
  const lemmePresent = !!lemme && lemmeMaxFreq.has(lemme)

  if (threshold === 0) {
    // Tolérant : il suffit que le lemme existe dans Lexique
    if (!lemmePresent) continue
    words.add(normalized)
    keptShort++
  } else {
    const lemmeFreq = lemmePresent ? lemmeMaxFreq.get(lemme) : -1
    if (freqlivres >= threshold) {
      words.add(normalized)
      keptByOwnFreq++
    } else if (lemmeFreq >= threshold) {
      words.add(normalized)
      keptByLemmeFreq++
    }
  }
}

console.log(`Mots Lexique courts (≤5L, lemme connu) : ${keptShort}`)
console.log(`Mots Lexique gardés par fréquence directe : ${keptByOwnFreq}`)
console.log(`Mots Lexique gardés via lemme connu : ${keptByLemmeFreq}`)
console.log(`Mots Lexique gardés via bypass verbe : ${keptVerbBypass}`)

// ─── GLAFF : couverture exhaustive des formes fléchies ─────────────────────
// Format : forme|tag_morpho|lemme|phon1|phon2|freq_corpus_1|...
// On utilise GLAFF pour récupérer les formes que Lexique383 n'a pas
// (passé simple, subjonctif imparfait, accords féminins/pluriels rares).
// Filtre : on accepte une forme GLAFF uniquement si son lemme est connu
// dans Lexique383 ET passe le seuil de fréquence pour cette longueur.

const GLAFF_CACHE = '/tmp/glaff/GLAFF-1.2.2/glaff-1.2.2.txt'
const GLAFF_TAR_CACHE = '/tmp/glaff/glaff.tar.bz2'

async function ensureGlaff() {
  try {
    await stat(GLAFF_CACHE)
    console.log('GLAFF en cache local, on saute le téléchargement.')
    return
  } catch {}
  console.log('Téléchargement de GLAFF (~13 Mo compressé)...')
  execSync(`mkdir -p /tmp/glaff && curl -sL "${URL_GLAFF}" -o "${GLAFF_TAR_CACHE}"`)
  console.log('Décompression...')
  execSync(`tar -xjf "${GLAFF_TAR_CACHE}" -C /tmp/glaff`)
}

await ensureGlaff()
console.log('Lecture GLAFF...')
const glaffData = await readFile(GLAFF_CACHE, 'utf8')

// Index Lexique : lemme normalisé (sans accents) → freqMax
// Sentinel -1 pour distinguer "lemme jamais vu" de "lemme à freq=0".
const lemmeNormFreq = new Map()
for (const [lemme, freq] of lemmeMaxFreq) {
  const norm = removeAccents(lemme).toLowerCase()
  const prev = lemmeNormFreq.get(norm) ?? -1
  if (freq > prev) lemmeNormFreq.set(norm, freq)
}

let glaffAdded = 0
let glaffAddedVerbBypass = 0
let glaffRejectedUnknownLemme = 0
let glaffRejectedFreq = 0
let glaffLines = 0

const glaffLines_arr = glaffData.split('\n')
for (const line of glaffLines_arr) {
  if (!line) continue
  glaffLines++
  const cols = line.split('|')
  if (cols.length < 3) continue
  const forme = cols[0]
  const lemme = cols[2]
  if (!forme || !lemme) continue
  if (forme[0] === forme[0].toUpperCase() && forme[0] !== forme[0].toLowerCase()) continue

  const formeNorm = removeAccents(forme).toLowerCase()
  if (!VALID_CHARS.test(formeNorm)) continue
  if (BLOCKLIST.has(formeNorm)) continue
  if (words.has(formeNorm)) continue

  const lemmeNorm = removeAccents(lemme).toLowerCase()
  if (!lemmeNormFreq.has(lemmeNorm)) { glaffRejectedUnknownLemme++; continue }

  // BYPASS VERBE : lemme = verbe (infinitif), OU lemme = participe verbal (ortho VER).
  if (verbLemmes.has(lemmeNorm) || verbalOrthos.has(lemmeNorm)) {
    words.add(formeNorm)
    verbForms.add(formeNorm)
    glaffAddedVerbBypass++
    continue
  }

  const lemmeFreq = lemmeNormFreq.get(lemmeNorm)
  const threshold = freqThresholdForLength(formeNorm.length)
  if (lemmeFreq < threshold) { glaffRejectedFreq++; continue }

  words.add(formeNorm)
  glaffAdded++
}

console.log(`GLAFF lignes lues : ${glaffLines}`)
console.log(`GLAFF formes ajoutées (filtre fréquence) : ${glaffAdded}`)
console.log(`GLAFF formes ajoutées (bypass verbe) : ${glaffAddedVerbBypass}`)
console.log(`GLAFF rejetées (lemme inconnu de Lexique) : ${glaffRejectedUnknownLemme}`)
console.log(`GLAFF rejetées (fréquence < seuil pour cette longueur) : ${glaffRejectedFreq}`)

// Filtre rétroactif : appliquer le seuil dégressif aussi aux mots Lexique
// (pour cohérence : on ne veut pas un mot rare 8L qui passait par freqlivres=0.02)
// Les formes verbales (bypass) sont protégées — elles sont toujours acceptées.
const before = words.size
let removed = 0
for (const w of [...words]) {
  if (verbForms.has(w)) continue  // forme verbale, protégée du filtre rétroactif
  const threshold = freqThresholdForLength(w.length)
  if (threshold <= FREQ_MIN) continue
  // chercher un lemme normalisé qui matche ce mot ou qui est préfixe
  // approximation : on accepte si le mot lui-même est un lemme connu
  // OU si un lemme connu a freq >= threshold ET dont la racine matche
  // Plus simple : on garde si lemmeNormFreq pour ce mot OU pour un préfixe long
  const directFreq = lemmeNormFreq.get(w) ?? 0
  if (directFreq >= threshold) continue
  // Cherche un lemme dont le mot dérive (préfixe long, au moins 4 lettres)
  let kept = false
  for (let cut = w.length; cut >= 4; cut--) {
    const prefix = w.slice(0, cut)
    const f = lemmeNormFreq.get(prefix) ?? 0
    if (f >= threshold) { kept = true; break }
    // tester aussi avec lemme = préfixe + 'er'/'ir'/'re' (verbes)
    for (const suf of ['er', 'ir', 're']) {
      const f2 = lemmeNormFreq.get(prefix + suf) ?? 0
      if (f2 >= threshold) { kept = true; break }
    }
    if (kept) break
  }
  if (!kept) { words.delete(w); removed++ }
}
console.log(`Filtrage rétroactif : ${removed} mots retirés (sur ${before}, longs et faiblement attestés).`)

// Audit : lister les mots ≥7L pour relecture manuelle
const longWords = [...words].filter(w => w.length >= 7).sort()
await writeFile(AUDIT_OUT, longWords.join('\n'), 'utf8')
console.log(`Audit ${longWords.length} mots ≥7L écrit dans ${AUDIT_OUT}`)

const sorted = [...words].sort()
await writeFile(OUT, sorted.join('\n'), 'utf8')

console.log(`✓ Total : ${sorted.length} mots écrits dans public/words_fr.txt`)
