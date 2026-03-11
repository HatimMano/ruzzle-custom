let wordSet: Set<string> | null = null
let loadPromise: Promise<Set<string>> | null = null

// Trie pour lookup de préfixes (optimisation de la génération)
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

  hasPrefix(prefix: string): boolean {
    let node: Trie = this
    for (const ch of prefix) {
      if (!node.children.has(ch)) return false
      node = node.children.get(ch)!
    }
    return true
  }

  isValidWord(word: string): boolean {
    let node: Trie = this
    for (const ch of word) {
      if (!node.children.has(ch)) return false
      node = node.children.get(ch)!
    }
    return node.isWord
  }
}

let trie: Trie | null = null

export async function loadDictionary(): Promise<Set<string>> {
  if (wordSet) return wordSet
  if (loadPromise) return loadPromise

  loadPromise = fetch('/words_fr.txt')
    .then(r => r.text())
    .then(text => {
      const words = text.split('\n').filter(w => w.length >= 5 && w.length <= 10)
      wordSet = new Set(words)
      trie = new Trie()
      for (const w of words) trie.insert(w)
      return wordSet
    })

  return loadPromise
}

export function isValidWord(word: string): boolean {
  if (!wordSet) return false
  return wordSet.has(word.toLowerCase())
}

export function hasPrefix(prefix: string): boolean {
  if (!trie) return false
  return trie.hasPrefix(prefix.toLowerCase())
}

export function getTrie(): Trie | null {
  return trie
}

export function getDictionary(): Set<string> | null {
  return wordSet
}
