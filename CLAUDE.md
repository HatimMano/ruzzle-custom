# Ruzzle — Directives projet

## Contexte
Ruzzle (alias Griddle en prod) est un jeu de mots quotidien type Ruzzle/Boggle, avec un défi par jour partagé par tous les joueurs et un classement.

L'utilisateur (Hatim) est PO/dev hybride. Il pilote la roadmap et le game design, mais souhaite comprendre les choix techniques pour pouvoir les reproduire sur d'autres projets et les expliquer.

## Stack
- **Frontend** : React 19 + Vite + TypeScript + Tailwind CSS
- **Backend** : Supabase (PostgreSQL + Auth + RLS + Edge Functions Deno)
- **Hébergement** : Vercel (frontend), Supabase managed (backend)
- **Auth** : anonyme par défaut (signInAnonymously) — pas d'email pour l'instant

Détails dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Pattern de travail "Plan → Code → Décision"

À appliquer pour toute tâche **non-triviale** : nouvelle dépendance, choix d'archi, pattern qui va se répéter, sécurité, performance, refacto significative.

À NE PAS appliquer pour : fix de typo, ajustement visuel mineur, bug évident.

### 1. Avant de coder
Présenter en chat un mini-brief :
```
**Problème** : ce qu'on résout
**Options** : 2-3 alternatives, pros/cons concrets
**Reco** : ma reco + pourquoi
**Effort** : ordre de grandeur
```
Attendre validation de l'utilisateur avant d'écrire du code.

### 2. Après l'implémentation
Ajouter une entrée dans [`docs/decisions.md`](docs/decisions.md) au format ADR :
```markdown
## YYYY-MM-DD — Titre court

**Trigger** : ce qui a poussé le changement
**Options envisagées** : a, b, c
**Choix** : ...
**Pourquoi** : raisons techniques + tradeoffs assumés
**À surveiller** : pièges, dépendances, ce qui peut casser
```

### 3. Glossaire qui grandit
Tout terme technique nouveau introduit en chat ou dans le code → 3 lignes dans [`docs/glossary.md`](docs/glossary.md).

## Règles spécifiques au projet

### Score daily (modes pyramide)
Le score = somme des **scores des créneaux pyramide remplis**, pas des mots trouvés. Un mot long peut remplir un créneau plus court (règle "plus long créneau vide ≤ longueur du mot"). Voir `pyramidSlotForWord` dans [`src/lib/dailyModes.ts`](src/lib/dailyModes.ts). Ne s'applique PAS à Ruddle (score Ruzzle standard cumulé) ni à Speedle (score composite survie/mots/mot le plus long).

### Anti-cheat
Modes **pyramide** (Pyramiddle, BiGriddle, Triddle) : toute soumission passe par l'Edge Function `submit_daily` ([`supabase/functions/submit_daily/`](supabase/functions/submit_daily/)). Le client ne dicte pas le score — le serveur régénère la grille et recalcule. RLS d'INSERT direct côté client toujours autorisée (auth.uid = user_id) mais seule l'Edge Function insère en pratique pour ces modes.

Modes **non-pyramide** (Ruddle, Speedle) : **insert direct client** (bypass Edge Function). Le score n'est pas anti-cheatable côté serveur car le mode n'est pas pyramidal (pas de canonique à recalculer). Compromis dev/prod assumé (v1). Liste hardcodée dans `DIRECT_INSERT_MODES` de [`src/lib/api.ts`](src/lib/api.ts).

### Génération de grille = déterministe
Même date → même grille pour tous les joueurs (et pour le serveur). Le PRNG est `mulberry32` seedé depuis `seedFromString(date)`. Toute modification de la génération doit être synchronisée entre [`src/lib/gridGenerator.ts`](src/lib/gridGenerator.ts) et [`supabase/functions/submit_daily/_shared/gridGenerator.ts`](supabase/functions/submit_daily/_shared/gridGenerator.ts) **avant** un déploiement, sinon le serveur valide une grille différente que celle vue par les joueurs.

### Modes de jeu
Architecture en union discriminée `DailyMode = PyramidMode | TriddleMode | RuddleMode | SpeedleMode`. 4 kinds, 4 moteurs distincts.

| Nom user | id | kind | Description |
|---|---|---|---|
| Pyramiddle | `classic` | `pyramid` | Pyramide 3→8+, illimité |
| BiGriddle | `bigriddle` | `pyramid` | Pyramide 3→10+, grille 5×5, dimanche |
| Triddle | `marathon` (compat DB) | `triddle` | 3 grilles 4×4 pyramide 3→7, dimanche |
| Ruddle | `ruddle` | `ruddle` | 2 min chrono, max de mots (ex-Blitz/Éclair) |
| Speedle | `speedle` | `speedle` | Sablier 45s, +Ns par mot (ex-Sablier/Infini) |

⚠ Triddle a `mode.id='marathon'` conservé pour compat DB (résultats existants du test 2026-05-17 + edge function accepte 'marathon'). Le nom code est Triddle partout (types, fichiers, adapter). Voir commentaire dans [`dailyModes.ts`](src/lib/dailyModes.ts).

**Calendrier hebdo** :
- Lundi–Samedi = Pyramiddle
- Dimanche = alternance Triddle / BiGriddle (semaine 0 = 2026-07-05 Triddle, semaine 1 = BiGriddle, etc.)
- Overrides `?mode=<id>` : `ruddle`, `speedle`, `triddle`, `bigriddle`, `classic`. Aliases historiques `eclair` (→ruddle), `infini` (→speedle), `marathon` (→triddle) conservés.

**Mode Adapter Pattern** (refacto 2026-07-04) : chaque mode expose un `ModeAdapter<TState, TResult>` dans [`src/lib/modes/<mode>.tsx`](src/lib/modes/) avec `init()`, `GameScreen`, `ResultsScreen`, `buildSubmitPayload()`. Dispatch par `mode.kind` dans [`registry.ts`](src/lib/modes/registry.ts). Ajouter un nouveau mode = 1 fichier `<mode>.tsx` + 1 GameScreen + 1 ResultsScreen + 1 entrée dans le registry. App.tsx opère sur le state/result opaque via l'adapter, aucune branche par mode.

**Difficulté par mode pyramide** :
- `minWordsAtCap` = force au moins N mots au niveau plafond de la pyramide (garantit qu'il existe des alternatives au mot le plus long).
- `maxWordsAtCap` = limite le nombre de mots ≥ cap. Appliqué sur `classicMode` (=5) pour éviter les grilles trop faciles. À réévaluer avant d'étendre à d'autres modes.

**Scoring Speedle** : score composite 3 tiers `survivedSecs × 1_000_000 + wordCount × 100 + maxWordLen`. Ordre de tri : survie > nb mots > mot le plus long. Défini dans [`speedle.tsx`](src/lib/modes/speedle.tsx) (adapter). Bonus temps par mot : courbe convexe `3=1, 4=2, 5=4, 6=7, 7=11, 8+=15` dans [`speedleScoring.ts`](src/lib/speedleScoring.ts).

**Scoring Ruddle** : `scoreForWord` standard (`3=1, 4=1, 5=2, 6=4, 7=7, 8+=12`) cumulé sur 2 min.

### Classement Semaine / Mois
- Points daily = 3/2/1 pour top1/2/3 par (date, mode).
- Bonus hebdo = +5/+3/+1 pour top1/2/3 de chaque semaine **close** (lundi-dimanche), injecté dans le mois qui contient le lundi de la semaine.
- La semaine en cours ne donne PAS de bonus tant que dimanche 23:59 Paris n'est pas passé.
- Tiebreakers agrégats : `points DESC, top1 DESC, top2 DESC, total_played ASC`. Égalité parfaite = même rang (Olympic ranking `1, 1, 3, 4...`) → bonus partagé.
- Tiebreakers Jour : `score DESC, elapsed_secs ASC`. `created_at` sert seulement à l'ordre d'affichage, pas au rang.
- Filtre par mode : `fetchDailyLeaderboard(date, mode.id)` filtre les entries par mode.id. Utile en dev où l'override URL peut créer des résultats de plusieurs modes le même jour ; en prod garantit qu'on compare Speedle avec Speedle et pas avec Pyramiddle.
- Sources : RPC SQL dans [`supabase_migration_leaderboard.sql`](supabase_migration_leaderboard.sql). Timezone `Europe/Paris` hardcodée dans toutes les bornes date (pas `current_date` UTC).

### Sync Edge Function : règle d'or
S'applique aux **modes pyramide uniquement** (Ruddle/Speedle passent par insert direct client, cf. Anti-cheat). Toute modification qui affecte le calcul serveur doit être répercutée dans [`supabase/functions/submit_daily/_shared/`](supabase/functions/submit_daily/_shared/) **avant** ou en même temps que le deploy Vercel. Fichiers concernés typiques :
- `dailyModes.ts` (nouveau mode pyramide, nouvelle date spéciale, `maxWordsAtCap`, etc.)
- `gridGenerator.ts` (logique de génération, distribution des lettres)
- `dictionary.ts` (mots ajoutés/retirés)
- `scoring.ts` (règles de points)

Sans redéploiement de l'Edge Function, les soumissions pyramide des joueurs seront **rejetées silencieusement** (le serveur régénère une grille différente que celle vue par le client).

### Scripts d'optimisation offline
Pour les grilles thématiques (anniversaires, événements), utiliser un script node en DFS sur la grille avec le trie du dico complet. Exemple : [`scripts/optimize-birthday-fate.mjs`](scripts/optimize-birthday-fate.mjs) — teste 30k combinaisons des cases libres et garde la meilleure au sens weighted-score par longueur. Réutilisable : modifier `FIXED` (cases fixes) et `FREE_CELLS`, re-run.

## Flow de déploiement

```
git push origin main         → trigger Vercel auto (frontend)
supabase functions deploy X  → deploy Edge Function (manuel)
```

Vercel auto-deploy ne marche pas toujours sur ce projet — fallback `vercel --prod --yes` depuis le dossier projet.

**Alias Vercel** : `ruzzle-custom.vercel.app` ne se ré-alias PAS automatiquement au deploy. Après `vercel --prod`, faire `vercel alias set <new-deploy-url> ruzzle-custom.vercel.app` (l'URL du deploy est affichée par la commande précédente).

**Supabase CLI** : pas installé globalement. Utiliser `npx supabase functions deploy submit_daily` (avec `nvm use 20` pour éviter le bug node symbol du homebrew).

## Pour démarrer une session sur Ruzzle

1. Lire [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) si nouveau dans le projet.
2. Suivre le pattern Plan → Code → Décision.
3. Si l'utilisateur dit "go" sans plan, vérifier que c'est trivial. Sinon, briefer quand même.
