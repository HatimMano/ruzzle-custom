// Trie pour validation préfixe pendant la génération de grille
export class Trie {
  children: Map<string, Trie> = new Map()
  isWord = false

  insert(word: string) {
    let node: Trie = this
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new Trie())
      node = node.children.get(ch)!
    }
    node.isWord = true
  }
}

let cache: { wordSet: Set<string>; trie: Trie } | null = null

// Charge le dico depuis l'URL publique (par défaut le site Vercel déployé).
// Override possible via env var DICT_URL si le projet bouge de domaine.
// Caché en mémoire pour la durée de vie de l'isolate Deno.
export async function loadDictionary(): Promise<{ wordSet: Set<string>; trie: Trie }> {
  if (cache) return cache
  const url = Deno.env.get('DICT_URL') ?? 'https://ruzzle-custom.vercel.app/words_fr.txt'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`dict_fetch_failed_${res.status}`)
  const text = await res.text()
  const words = text.split('\n').filter((w) => w.length >= 3 && w.length <= 10)
  const wordSet = new Set(words)
  const trie = new Trie()
  for (const w of words) trie.insert(w)
  cache = { wordSet, trie }
  return cache
}
