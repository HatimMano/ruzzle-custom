/**
 * Génère public/words_fr.txt depuis Lexique383
 * Inclut toutes les formes orthographiques (pluriels, conjugaisons, etc.)
 * sans filtre de fréquence.
 *
 * Usage : node scripts/build-dict.mjs
 */

import { createWriteStream, existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { createGunzip } from 'zlib'
import https from 'https'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'public', 'words_fr.txt')

// Lexique383 TSV — colonnes : ortho, phon, lemme, cgram, genre, nombre, freqfilms2, freqlivres, ...
const URL = 'http://www.lexique.org/databases/Lexique383/Lexique383.tsv'

const VALID_CHARS = /^[a-z]{3,10}$/

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
const tsv = await fetchText(URL)

const lines = tsv.split('\n')
const header = lines[0].split('\t')
const idxOrtho = header.indexOf('ortho')
const idxCgram = header.indexOf('cgram')

if (idxOrtho === -1 || idxCgram === -1) {
  console.error('Colonnes non trouvées. Header:', header.slice(0, 10))
  process.exit(1)
}

console.log(`Lignes brutes : ${lines.length}`)

const words = new Set()

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t')
  if (cols.length < 2) continue

  const ortho = cols[idxOrtho]?.trim()
  const cgram = cols[idxCgram]?.trim()

  if (!ortho) continue

  // Exclure les noms propres (commencent par une majuscule dans Lexique383)
  if (ortho[0] === ortho[0].toUpperCase() && ortho[0] !== ortho[0].toLowerCase()) continue

  // Normaliser : supprimer accents, mettre en minuscules
  const normalized = removeAccents(ortho).toLowerCase()

  if (VALID_CHARS.test(normalized)) {
    words.add(normalized)
  }
}

const sorted = [...words].sort()
await writeFile(OUT, sorted.join('\n'), 'utf8')

console.log(`✓ ${sorted.length} mots écrits dans public/words_fr.txt`)
