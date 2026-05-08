# Ruzzle — Architecture technique

Document de référence pour comprendre comment Ruzzle est construit. Lecture séquentielle recommandée pour qui prend le projet à froid. Glossaire dans [`glossary.md`](glossary.md), historique des décisions dans [`decisions.md`](decisions.md).

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Stack technique](#2-stack-technique)
3. [Modèle de données](#3-modèle-de-données)
4. [Authentification](#4-authentification)
5. [Flow de jeu](#5-flow-de-jeu)
6. [Anti-cheat](#6-anti-cheat)
7. [Modes de jeu](#7-modes-de-jeu)
8. [Anti-refresh](#8-anti-refresh)
9. [Déploiement](#9-déploiement)
10. [Limites connues & roadmap](#10-limites-connues--roadmap)

---

## 1. Vue d'ensemble

Ruzzle (alias **Griddle** en prod) est un jeu de mots quotidien type Ruzzle/Boggle. Chaque jour, tous les joueurs voient **la même grille** et doivent compléter une "pyramide" de mots de longueurs croissantes (3L, 4L, ..., 8L+). Classement par jour, streaks, partie libre en bonus.

### Architecture en un coup d'œil

```
┌─────────────────────────┐                     ┌──────────────────────┐
│  Navigateur (mobile)    │                     │  Supabase (cloud)    │
│                         │                     │                      │
│  ┌───────────────────┐  │  HTTPS + JWT       │  ┌────────────────┐  │
│  │  React App (SPA)  │ ─┼─────────────────────┼─►│  PostgreSQL    │  │
│  │  - state          │  │                     │  │  - profiles    │  │
│  │  - rendu UI       │  │                     │  │  - daily_results│ │
│  │  - génère grille  │  │                     │  │  - game_results│  │
│  │  - valide mots    │  │                     │  │  - player_stats│  │
│  │  - calcule score  │  │                     │  └────────────────┘  │
│  └───────────────────┘  │                     │                      │
│         │ │             │                     │  ┌────────────────┐  │
│         │ │ localStorage│                     │  │  Auth          │  │
│         │ │ JWT, state  │                     │  │  (anonymous)   │  │
│         └─┴─────────────┘                     │  └────────────────┘  │
│                         │                     │                      │
│                         │  POST /functions/v1│  ┌────────────────┐  │
│                         │ ─────────────────►  │  │  Edge Function │  │
│                         │                     │  │  submit_daily  │  │
│                         │                     │  │  (anti-cheat)  │  │
│                         │                     │  └────────┬───────┘  │
│                         │                     │           │ insert   │
│                         │                     │           ▼          │
│                         │                     │     daily_results    │
└─────────────────────────┘                     └──────────────────────┘

Frontend hébergé sur Vercel (CDN statique : HTML, JS, CSS, dico)
Backend = Supabase (managed, region eu-west-1)
```

**Points-clés** :
- Le rendu UI tourne **côté navigateur** uniquement (SPA).
- Pas de backend custom à maintenir : tout est managed par Supabase.
- La logique critique (anti-cheat) tourne dans une **Edge Function Deno** chez Supabase, à côté de la DB.
- Authentification anonyme : zéro friction d'inscription.

---

## 2. Stack technique

### Frontend

| Techno | Rôle | Pourquoi (vs alternative) |
|---|---|---|
| **React 19** | Framework UI | Écosystème massif, composants déclaratifs. Vs Vue/Svelte : plus de support outils + IA, moins de friction. |
| **TypeScript** | Typage statique | Refacto sans peur, autocomplete partout. Standard 2026. |
| **Vite** | Bundler + dev server | HMR <100ms (vs ~1s avec Webpack). Build de prod via Rollup. |
| **Tailwind CSS** | Styling utility-first | Pas de fichiers CSS en cascade, pas de classnames à inventer. `className="flex items-center gap-2"` direct dans le JSX. |
| **lucide-react** | Icônes | Tree-shakable, design cohérent, gratuit. |
| **@supabase/supabase-js** | SDK Supabase | Wrapper officiel pour parler à la DB et l'Auth. Gère le JWT en localStorage automatiquement. |

### Backend

| Techno | Rôle | Pourquoi |
|---|---|---|
| **Supabase** | Backend-as-a-service | Postgres + Auth + Functions + Storage en une plateforme. Free tier généreux. Open-source (pas de vendor lock-in dur). |
| **PostgreSQL 17** | DB | RDBMS le plus robuste, support jsonb, triggers, fonctions stockées. |
| **Supabase Edge Functions** | Logique serveur custom | Tournent en Deno, co-localisées avec la DB. Utilisé pour `submit_daily`. |

### Hébergement & CI/CD

| Service | Rôle | Pourquoi |
|---|---|---|
| **Vercel** | Hébergement frontend | Deploy auto à chaque push. Free tier large. Bon pour les SPA. |
| **GitHub** | Source control + CI trigger | Standard. |

---

## 3. Modèle de données

### Tables principales

```
┌─────────────────┐       ┌────────────────────────┐
│  profiles       │       │  daily_results         │
│─────────────────│       │────────────────────────│
│  id (PK, UUID)  │◄──────┤  user_id (FK)          │
│  display_name   │       │  date (text)           │
│  created_at     │       │  mode (text)           │
└─────────────────┘       │  score (int)           │
        ▲                 │  elapsed_secs          │
        │                 │  completed (bool)      │
        │                 │  levels_found (int)    │
        │                 │  found_words (text[])  │
        │                 │  pyramid_found (jsonb) │
        │                 │  unique(user_id, date) │
        │                 └────────────────────────┘
        │
        │                 ┌────────────────────────┐
        ├─────────────────┤  game_results          │
        │                 │  (parties libres)       │
        │                 └────────────────────────┘
        │
        │                 ┌────────────────────────┐
        └─────────────────┤  player_stats          │
                          │  (agrégats — calculés  │
                          │   par triggers SQL)    │
                          └────────────────────────┘
```

### Champs notables de `daily_results`

- **`pyramid_found`** est `jsonb`. Pour pyramide simple : `{ "3": "abc", "4": "abcd", ... }`. Pour marathon : `{ "0": { "3": "abc", ... }, "1": { ... }, "2": { ... } }`.
- **`mode`** identifie le type : `'classic'`, `'bigriddle'`, `'birthday-2026-04-30'`, `'marathon'`. Permet de séparer les classements et les stats selon le mode.
- **`unique(user_id, date)`** : un joueur ne peut pas soumettre deux fois pour le même jour.

### Row Level Security (RLS)

Postgres permet des règles d'accès **au niveau ligne**. Quelques policies clés :
- `profiles_select` : tout le monde peut lire les profiles (pour afficher les pseudos dans le classement)
- `profiles_update` : un user peut modifier SON profile (`auth.uid() = id`)
- `daily_results_select` : tout le monde peut lire (classement public)
- `daily_results_insert` : **désactivée** depuis l'anti-cheat. Seul le service role (utilisé par l'Edge Function) peut insérer.

### Triggers SQL

Lorsqu'une ligne est insérée dans `daily_results`, le trigger `update_stats_on_daily` agrège automatiquement :
- `player_stats.daily_played += 1`
- `player_stats.daily_completed += 1` si la pyramide est complète
- `player_stats.total_score += score`
- Calcul de la streak (`daily_streak`, `best_daily_streak`)
- Mise à jour de `longest_word`, `best_word_score`, `words_by_length`

→ Les stats agrégées sont **toujours cohérentes**, pas de risque d'oubli côté code applicatif.

Le SQL complet est dans [`supabase_migration.sql`](../supabase_migration.sql).

---

## 4. Authentification

### Le choix : anonyme par défaut

Quand un visiteur ouvre l'app pour la première fois :
1. `loadDictionary()` charge le dico
2. `ensureAuth()` est appelé
3. Si pas de session existante : `supabase.auth.signInAnonymously()` crée un user (UUID) et un JWT
4. Le SDK Supabase stocke le JWT dans `localStorage` (clé `sb-arqxihyinubljndjdsgw-auth-token`)
5. Toutes les requêtes ultérieures attachent ce JWT automatiquement

```
Browser (1st visit)              Supabase Auth
─────────────────────            ─────────────
loadDictionary()
ensureAuth()
  └─► signInAnonymously() ──────► crée user uuid-xxx
                          ◄────── renvoie JWT
JWT → localStorage
profiles.upsert({ id })  ──────► insert dans profiles
```

### Limites assumées

- **Clear localStorage = compte perdu**. Le user_id et le JWT sont en localStorage. Effacer = orphelin (la ligne `profiles` reste, plus accessible). Pas critique pour un MVP, problématique à terme.
- **Pas de multi-device**. Chaque device crée son propre compte anonyme.
- **Pas de récupération**. Si tu perds ton compte, t'en fais un nouveau.

→ À mettre en place quand on aura ~50-100 joueurs : email auth (magic link probablement, voir `glossary.md`).

---

## 5. Flow de jeu

### 5.1. Génération de grille (côté client)

La grille du jour doit être **identique pour tous les joueurs**. C'est la règle d'or — sans ça, pas de classement comparable.

```
date → seedFromString(date) → mulberry32(seed) → PRNG déterministe
                                                       │
                                                       ▼
                                              tirage des lettres
                                              (weightedRandom)
                                                       │
                                                       ▼
                                              construction grille
                                                       │
                                                       ▼
                                              findAllWords(grid, trie)
                                              vérifie pyramide complète
                                                       │
                                                       ▼
                                              si OK : retourne grille
                                              sinon : nouvelle tentative
                                              (jusqu'à MAX_ATTEMPTS_DAILY)
```

#### Le PRNG : `mulberry32`

```ts
function mulberry32(seed: number) {
  let s = seed >>> 0
  return function () {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- Prend une seed (uint32)
- Renvoie une fonction qui génère un float [0, 1) pseudo-aléatoire
- Même seed → même séquence, **toujours**
- Très rapide (5 opérations par tirage)

`seedFromString('2026-05-08')` produit toujours le même nombre. Donc tous les joueurs avec la même date voient la même grille.

#### Sélection des lettres

`weightedRandomLetter(rand)` tire une lettre selon les fréquences en français : `e` à 14.7%, `a` à 8.2%, ..., `k` à 0.1%. Évite d'avoir des grilles inutilisables (trop de Q et W).

#### Le critère "grille viable"

Pour le mode classic, on cherche une grille qui contient **au moins** :
- 1 mot de 3L
- 1 mot de 4L
- 1 mot de 5L
- 1 mot de 6L
- 1 mot de 7L
- ≥ 2 mots de 8L+ (pour qu'il y ait toujours un plan B)

Si la grille générée ne satisfait pas → on en génère une nouvelle (jusqu'à 800 tentatives). En pratique, p90 = ~6 essais (statistiques dans `scripts/test-grid-size.mjs`).

### 5.2. Validation des mots (côté client)

Quand un joueur trace un mot sur la grille :
1. **Mot dans le dico ?** Lookup dans `wordSet` (87k mots français, chargé une fois au démarrage)
2. **Chemin valide sur la grille ?** Implicit (le joueur a tracé le chemin lui-même, vérifié par `Grid.tsx`)
3. **Pas déjà trouvé ?** Lookup dans `foundWords`

Si OK → on cherche dans quel **créneau pyramide** placer le mot.

### 5.3. La règle du créneau (slot rule)

> Un mot trouvé remplit le **plus long créneau pyramide vide** ≤ longueur du mot.

```ts
function pyramidSlotForWord(rules, word, pyramidFound) {
  for (let i = lens.length - 1; i >= 0; i--) {  // du plus long au plus court
    const slot = lens[i]
    if (slot <= word.length && !pyramidFound[slot]) return slot
  }
  return null
}
```

**Exemple** : pyramide classic 3-8. Joueur a déjà rempli 3L, 5L, 7L, 8L+. Il trouve un mot de 9 lettres :
- `min(9, 8) = 8` → mais 8L+ est déjà rempli
- Cherche le plus long slot vide ≤ 9 → 6L (4L est aussi vide mais plus court)
- → remplit 6L, score += 4 pts (le score du créneau, **pas** du mot)

Le score est lié au **slot**, pas au mot trouvé. Un 10L qui remplit un 6L vaut 4 pts (pas 12).

### 5.4. Soumission

À la fin du défi (pyramide complète, ou abandon, ou timer expiré pour marathon) :
1. Le client appelle `submitDailyResult({ date, mode, elapsedSecs, foundWords, pyramidFound })`
2. Cette fonction appelle l'**Edge Function** `submit_daily` (voir section anti-cheat)
3. La fonction valide tout serveur-side et insère dans `daily_results`
4. Le trigger SQL met à jour `player_stats`

---

## 6. Anti-cheat

### Le problème

**Avant** la mise en place de l'Edge Function :
- Le client calculait le score localement
- Envoyait `INSERT INTO daily_results (..., score: 27)` directement à Supabase
- La RLS validait juste `auth.uid() = user_id` → pas le score
- → Avec les DevTools, n'importe qui pouvait envoyer `score: 9999` et la DB l'acceptait

```
[AVANT — vulnérable]

Browser ─► Supabase REST API ─► INSERT INTO daily_results (score: 9999)
                                          │
                                          ▼
                                    RLS check : auth.uid() = user_id ✅
                                          │
                                          ▼
                                    INSERT effectué ❌ (score bidon en DB)
```

### La solution : un "juge" serveur

On insère une étape entre le client et la DB. Ce juge :
1. Reçoit ce que le client prétend
2. Re-fait tout le calcul de zéro
3. Insère **sa version**, pas celle du client

```
[APRÈS — sécurisé]

Browser ─► Edge Function submit_daily
              │
              ├─ Vérifie le JWT → identifie le user
              ├─ Régénère la grille du jour avec le même PRNG
              ├─ Pour chaque mot soumis :
              │     - Existe dans le dico ?
              │     - Trouvable sur la grille ? (DFS)
              │     - Quel slot pyramide remplir ?
              ├─ Recalcule le score canoniquement
              └─ INSERT (avec service role qui bypass RLS)
                          │
                          ▼
                    daily_results (score canonique)
```

### Pourquoi une "Edge Function" et pas autre chose ?

| Option | Pros | Cons |
|---|---|---|
| Trigger SQL | Pas de service externe | Faire un DFS sur grille en SQL = enfer |
| Backend Node custom | Code partageable | 5$/mois, serveur à maintenir, latence DB |
| Vercel Functions | Mêmes outils que le front | Latence DB ~100ms (Vercel ≠ DB region) |
| **Supabase Edge Function** | Co-localisée DB (<10ms), JWT auto, scale à zéro | Deno (pas Node), code dupliqué front/edge |

→ Le critère décisif : la fonction doit accéder à la DB rapidement. Les Edge Functions Supabase sont littéralement à côté de Postgres.

### Implémentation concrète

```
supabase/functions/submit_daily/
├── index.ts              ← handler principal
├── _shared/
│   ├── prng.ts           ← copie de src/lib/prng.ts
│   ├── scoring.ts        ← copie de src/lib/scoring.ts
│   ├── gridGenerator.ts  ← copie (Deno-compatible)
│   ├── dailyModes.ts     ← copie minimale (sans palette/intro)
│   └── dictionary.ts     ← fetch le dico au cold start depuis Vercel
```

#### Le code dupliqué : pourquoi on accepte

Idéalement, le front et l'edge function partagent le même code. Mais :
- Front = Node/browser, imports relatifs `./gridGenerator`
- Edge = Deno, imports `./gridGenerator.ts` (extension obligatoire)
- Dépendances : Front importe via `npm`, Edge via `npm:@supabase/supabase-js@2`

Unifier les deux runtimes (monorepo + bundler partagé) coûterait plus que la duplication. **Discipline** : à chaque modif de la génération côté front, mettre à jour l'edge avant deploy. La règle est dans `CLAUDE.md`.

#### Le dico : pas embarqué dans la function

Le dico fait 758 KB. Plutôt que l'embarquer dans le code de la function (ça gonflerait chaque deploy), on le fetche depuis l'URL publique Vercel au **cold start** :

```ts
const url = Deno.env.get('DICT_URL') ?? 'https://ruzzle-custom.vercel.app/words_fr.txt'
const res = await fetch(url)
const text = await res.text()
// build le wordSet + trie, cache en mémoire de l'isolate
```

→ Une seule fois par cold start, ensuite c'est en RAM jusqu'à ce que l'isolate soit recyclé.

### La policy RLS d'INSERT supprimée

Sans cette étape, le client pouvait toujours bypasser l'edge function et insérer directement. On a fait :

```sql
drop policy "daily_results_insert" on daily_results;
```

→ Plus aucune policy d'INSERT existante = aucun INSERT autorisé via REST. Le service role (utilisé par l'Edge Function via la `SUPABASE_SERVICE_ROLE_KEY`) bypass automatiquement la RLS.

---

## 7. Modes de jeu

### Architecture en union discriminée

Pour permettre des modes vraiment différents (1 grille vs N, scoring different, palette différente...) sans tout fourrer dans une interface unique :

```ts
type DailyMode = PyramidMode | MarathonMode

interface PyramidMode {
  kind: 'pyramid'
  id: string                    // 'classic' | 'bigriddle' | 'birthday-...'
  size: number                  // 4 ou 5
  pyramidLengths: readonly number[]  // [3,4,5,6,7,8] etc
  minWordsAtCap?: number        // ex: 2 pour garantir 2 mots de 8L+
  palette: DailyModePalette     // couleurs de la carte
  intro?: DailyModeIntro        // modal d'intro première fois
  generate(seed, trie): { grid, validWords }
}

interface MarathonMode {
  kind: 'marathon'
  id: 'marathon'
  size: number                  // 4
  pyramidLengths: readonly number[]  // [3,4,5,6,7]
  gridCount: number             // 3
  perGridDurationSecs: number   // 300
  palette: DailyModePalette
  intro?: DailyModeIntro
  generate(seed, trie): { grids, validWordsPerGrid }
}
```

### Le dispatcher

```ts
function modeForDate(date: string, override?: string | null): DailyMode {
  if (override === 'marathon') return marathonMode
  if (override === 'bigriddle') return bigriddleMode
  if (override === 'classic') return classicMode
  if (SPECIAL_DATES[date]) return SPECIAL_DATES[date]   // birthday
  if (isSunday(date)) return bigriddleMode
  return classicMode
}
```

### Ajouter un nouveau mode

C'est la beauté du tagged union — c'est trivial :

1. Créer le mode dans `src/lib/dailyModes.ts` :
   ```ts
   export const newMode: PyramidMode = {
     kind: 'pyramid', id: 'new', size: 4, pyramidLengths: [...],
     palette: { ... }, generate(seed, trie) { ... },
   }
   ```
2. L'ajouter au dispatcher (`modeForDate`) selon la condition de déclenchement
3. Côté UI, **rien à faire** : la carte d'accueil, l'intro modal, le rendu de la pyramide consomment automatiquement les champs du mode.

OCP respecté : **aucune modification d'App.tsx pour ajouter un mode pyramide**.

### Modes existants

| Mode | Quand | Grille | Pyramide | Spécifique |
|---|---|---|---|---|
| `classic` | Lun-Sam (par défaut) | 4×4 | 3→8 | ≥2 mots 8L+ |
| `bigriddle` | Dimanche | 5×5 | 3→10 | ≥3 mots 10L+ |
| `birthday-2026-04-30` | 2026-04-30 | 4×4 | 3→8 | "soixante" forcé sur les 2 premières rangées |
| `marathon` | Test only (`?mode=marathon`) | 4×4 ×3 | 3→7 par grille | Timer 5 min/grille |

### Modes UI (palette + intro)

Chaque mode embarque sa palette de couleurs et son intro :
- **classic** : ambre/orange — "Défi du jour"
- **bigriddle** : violet — "Pyramide étendue · 5×5"
- **birthday** : rose-jaune-bleu (gradient) — "Édition spéciale"
- **marathon** : rouge/orange — "3 grilles · 5 min chacune"

Le composant `HomeScreen` lit `todayMode.palette` et applique. `DailyIntroModal` lit `mode.intro` et affiche au premier accès.

---

## 8. Anti-refresh

### Le problème

Pendant un défi quotidien, si l'utilisateur refresh la page, l'app perdait tout son state (chrono, mots trouvés, pyramide remplie). → Triche par refresh : "merde, j'ai mis 10 min, je refresh et je recommence avec un meilleur temps".

### La solution

À chaque mot trouvé, on persiste l'état en localStorage :
```ts
{
  date: '2026-05-08',
  startedAt: 1715190000000,   // epoch ms
  foundWords: ['chat', 'maison', ...],
  pyramidFound: { 3: 'rat', 4: 'chat', 5: 'maison', ... }
}
```

Au boot de l'app, si une session pour aujourd'hui existe :
1. Restaurer la grille (via `mode.generate(date, trie)` — déterministe)
2. Restaurer foundWords + pyramidFound depuis le localStorage
3. **Calculer `elapsed = (Date.now() - startedAt) / 1000`** → le chrono continue depuis le moment où il a commencé, pas réinitialisé

→ Refresh = retour dans la partie au même chrono. Plus de gain à reset.

### Limites assumées

- Quelqu'un de motivé peut clear localStorage manuellement → reset effectif. À ce moment-là, l'`unique(user_id, date)` côté DB l'arrête s'il a déjà soumis (sinon son nouveau temps doit battre l'ancien, ou il accepte de soumettre un mauvais score).
- Vraie protection contre le cheat sur le chrono = session côté serveur (DB row "in_progress") avec un `started_at` immuable. Pas implémenté pour MVP.

### Marathon

Pas de session anti-refresh pour marathon (pour l'instant). Refresh pendant un marathon = perte de la partie. Acceptable car marathon n'est pas dans le dispatcher (mode test seulement).

---

## 9. Déploiement

### Frontend (Vercel)

```bash
git push origin main           # déclenche un build Vercel automatique
# OU si webhook cassé :
vercel --prod --yes            # déploie depuis le dossier
```

Vercel sert les fichiers statiques générés par `vite build` (HTML, JS, CSS, assets) depuis son CDN global. Pas de Node serveur en prod — le frontend est 100% statique.

### Backend Supabase

Le backend (Postgres + Auth) est déjà déployé chez Supabase. Le seul "déploiement" qu'on fait régulièrement, c'est :
- **Migrations DB** (rarement) : appliquer du SQL dans le SQL Editor du dashboard, ou via `supabase db push` si on configurait les migrations local.
- **Edge Functions** : `supabase functions deploy submit_daily`

### Edge Functions

```bash
# Pré-requis (une fois) :
./node_modules/.bin/supabase login                       # token interactif
./node_modules/.bin/supabase link --project-ref xxx     # rattache au projet

# Deploy :
./node_modules/.bin/supabase functions deploy submit_daily
```

Output :
```
Uploading asset (submit_daily): supabase/functions/submit_daily/index.ts
Uploading asset (submit_daily): supabase/functions/submit_daily/_shared/...
Deployed Functions on project xxx: submit_daily
```

L'Edge Function est immédiatement live. Pas de versioning explicite — chaque deploy écrase le précédent.

---

## 10. Limites connues & roadmap

### Ce qui n'est pas pro aujourd'hui

| Sujet | Constat | Plan |
|---|---|---|
| Auth | Anonyme uniquement, perte de compte au clear cache | Email magic link à venir (~50-100 joueurs) |
| Tests | 0 % de couverture | Tests unit sur `gridGenerator`, `dailyModes`, `scoring` à terme |
| Error tracking | `console.error` dans le vide | Sentry à brancher avant scale (~100 joueurs) |
| Anti-cheat chrono | Pas de session serveur sur le chrono | Si compétition réelle, ajouter |
| PWA | Site web standard | À ajouter pour install mobile (impact UX énorme) |
| Marathon | Pas dans le dispatcher | Activer un dimanche sur deux (BiGriddle / Marathon en alternance) |

### Refacto futurs possibles

- **Hooks domain-driven** : `useDailyChallenge`, `useFreeGame` (actuellement la state est dans App.tsx, déjà bien décomposé en composants)
- **Composant CSS unifié** : aujourd'hui mix de Tailwind + inline styles. Pas grave pour MVP, à uniformiser à terme.
- **Word list pre-computed** : le `findAllWords` côté client à chaque génération coûte ~50ms. Pour des grilles complexes (5×5 BiGriddle), ça monte. Pré-calculer + cacher pourrait optimiser.

### Performance actuelle

| Métrique | Valeur |
|---|---|
| Bundle JS | 460 KB raw / 136 KB gzipped |
| Bundle CSS | 49 KB / 9 KB gzipped |
| Dico (chargé async) | 758 KB / ~250 KB gzipped |
| First Contentful Paint | ~700 ms (sur 4G) |
| Time to Interactive | ~2 s (dico chargé) |
| Build prod | ~2 s |

→ Acceptable. Si on doit optimiser : le dico pourrait être chargé en demand (au démarrage de la 1ère partie) au lieu d'au boot.

---

## Référence rapide

- **Code source** : tout est dans `src/`
- **Edge Function** : `supabase/functions/submit_daily/`
- **Migration DB** : `supabase_migration.sql`
- **Décisions** : [`docs/decisions.md`](decisions.md)
- **Glossaire** : [`docs/glossary.md`](glossary.md)
- **Directives projet** : [`CLAUDE.md`](../CLAUDE.md) (à la racine)

Pour creuser une partie spécifique, voir le sommaire en haut.
