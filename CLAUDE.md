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
**TOUS les modes passent par l'Edge Function `submit_daily`** ([`supabase/functions/submit_daily/`](supabase/functions/submit_daily/)) depuis le 2026-07-25. Le client ne dicte jamais le score — le serveur régénère la grille et recalcule :
- **Pyramide** (Pyramiddle, BiGriddle, Triddle) : pyramide canonique reconstruite mot par mot.
- **Speedle** (depuis 12/07) : mots revalidés (dico + traçables), temps de survie **borné par `startSecs + Σ bonus des mots validés`** (un claim de 5000s avec 3 mots retombe à ~61s), score composite recalculé.
- **Ruddle** (depuis 25/07) : mots revalidés, score = Σ `scoreForLen`, temps borné à `durationSecs` (120s).

⚠ **Piège historique (incident 12/07)** : la policy RLS d'INSERT client sur `daily_results` n'existe PAS en prod (supprimée à la mise en place de l'edge function). L'ancien chemin "insert direct client" de Ruddle/Speedle échouait **silencieusement** (42501) → leaderboard Speedle vide à son premier dimanche. `DIRECT_INSERT_MODES` a été supprimé de [`src/lib/api.ts`](src/lib/api.ts) — ne jamais réintroduire d'insert direct sans recréer la policy.

⚠ **Trigger `player_stats`** (`update_stats_on_daily`, [`supabase_migration.sql`](supabase_migration.sql)) : Speedle/Ruddle sont **exclus** de `best_daily_score`, `fastest_complete_secs` et `total_score` (leur score est un composite de tri et leur elapsed = survie, pas une complétion — une survie de 5s écraserait le record vitesse ⚡).

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
| Spinddle | `spinddle` | `pyramid` | Pyramiddle dont le plateau bascule toutes les 15s, dimanche |

⚠ Triddle a `mode.id='marathon'` conservé pour compat DB (résultats existants du test 2026-05-17 + edge function accepte 'marathon'). Le nom code est Triddle partout (types, fichiers, adapter). Voir commentaire dans [`dailyModes.ts`](src/lib/dailyModes.ts).

**Calendrier hebdo** :
- Lundi–Samedi = Pyramiddle (sauf dates spéciales `SPECIAL_DATES` : anniversaires avec grilles fixes — `birthday-2026-04-30` Happy 60, `birthday-fate-2026-06-30`, `birthday-taha-2026-07-10`, `birthday-hatim-2026-07-11` Happy 30 Mano, `birthday-ay-2026-08-01` Happy 29 Ay). L'âge fêté vit dans `BIRTHDAY_AGE` ([dailyModes.ts](src/lib/dailyModes.ts)), consommé par HomeScreen (chiffres flottants, confettis, 🎂) et DailyResultsScreen (overlay « Happy N ») — **ajouter un anniversaire = 1 mode + 1 ligne**, ne pas réintroduire de chaîne de ternaires par `mode.id` dans les composants.
- Dimanche = **cycle 5 semaines** depuis `SUNDAY_REF = 2026-07-26` : Triddle → Ruddle → Speedle → BiGriddle → **Spinddle** (premier Spinddle : 23/08/2026). ⚠ **Tout nouveau mode dominical doit être ajouté EN FIN de `SUNDAY_CYCLE`** — l'insérer ailleurs décale tous les dimanches déjà calés. ⚠ `modeForDate` sur les dimanches AVANT le 26/07 ne reflète plus l'historique réel (documenté dans le code, sans impact).
- Overrides `?mode=<id>` : `ruddle`, `speedle`, `triddle`, `bigriddle`, `classic`, `spinddle`. Aliases historiques `eclair` (→ruddle), `infini` (→speedle), `marathon` (→triddle) conservés. Preview d'un jour futur : `?daily=YYYY-MM-DD`.
- `SEED_OVERRIDES` (client + serveur) : permet de remplacer la grille d'une date (ex : `2026-07-12` → `-v2` lors du reset Speedle). À utiliser pour tout reset de défi en cours de journée — coupler avec `HIDE_WORDS_DATES` dans [`LeaderboardDrawer.tsx`](src/components/LeaderboardDrawer.tsx) (masque l'onglet Mots du jour pour que les "déjà soumis" du matin ne spoilent pas la nouvelle grille).
- **Mots bonus hors dico** (ex : `donkey`, `dreamtim` pour les anniversaires) : `addBonusWords` client ([`dictionary.ts`](src/lib/dictionary.ts)) + `MODE_BONUS_WORDS` serveur (injectés dans wordSet/trie avant validation).

**Mode Adapter Pattern** (refacto 2026-07-04) : chaque mode expose un `ModeAdapter<TState, TResult>` dans [`src/lib/modes/<mode>.tsx`](src/lib/modes/) avec `init()`, `GameScreen`, `ResultsScreen`, `buildSubmitPayload()`. Dispatch par `mode.kind` dans [`registry.ts`](src/lib/modes/registry.ts). Ajouter un nouveau mode = 1 fichier `<mode>.tsx` + 1 GameScreen + 1 ResultsScreen + 1 entrée dans le registry. App.tsx opère sur le state/result opaque via l'adapter, aucune branche par mode.

**Difficulté par mode pyramide** :
- `minWordsAtCap` = force au moins N mots au niveau plafond de la pyramide (garantit qu'il existe des alternatives au mot le plus long).
- `maxWordsAtCap` = limite le nombre de mots ≥ cap. Appliqué sur `classicMode` (=5) pour éviter les grilles trop faciles. À réévaluer avant d'étendre à d'autres modes.

**Scoring Speedle** : score composite 3 tiers `survivedSecs × 1_000_000 + wordCount × 100 + maxWordLen`. Ordre de tri : survie > nb mots > mot le plus long. **Le composite ne doit JAMAIS être affiché brut** — afficher `elapsed_secs` (survie) + `levels_found` (mots), cf. `speedleLeaderboardLabel` et le cas `isSpeedleEntry` du drawer. Bonus temps par mot : `3=1, 4=2, 5=4, 6=5, 7=7, 8+=10` dans [`speedleScoring.ts`](src/lib/speedleScoring.ts) (courbe aplatie le 11/07, 8L+ relevé à +10 car la grille garantit la rareté). Barème dupliqué serveur dans `_shared/dailyModes.ts` — à modifier ensemble. **Grille Speedle contrainte** : `generateSpeedleGrid` exige ≥100 mots et **2-5 mots de 8L+** (vérifiable via [`scripts/check-speedle-grid.mjs`](scripts/check-speedle-grid.mjs) pour les dimanches à venir).

**Scoring Ruddle** : `scoreForWord` standard (`3=1, 4=1, 5=2, 6=4, 7=7, 8+=12`) cumulé sur 2 min.

**Spinddle — la bascule est 100% cosmétique côté client.** Les 8 symétries du carré (4 rotations + 4 miroirs) préservent l'adjacence roi : l'ensemble des mots trouvables est **rigoureusement identique** dans les 8 orientations (vérifié sur 4 grilles). Conséquences à ne pas perdre de vue :
- Le **DOM ne bouge pas** — seule une transform CSS oriente le plateau dans [`Grid.tsx`](src/components/Grid.tsx). `data-row`/`data-col`, l'adjacence, le tracé et la validation ignorent l'orientation. Le mode réutilise `kind: 'pyramid'` sans un seul `if` par mode ailleurs dans le code.
- Le **serveur n'a rien à savoir de l'orientation** : il valide sur la grille canonique. `_shared/dailyModes.ts` déclare `spinddleMode` uniquement pour que `modeForDate` résolve le bon id — pas de logique de bascule côté serveur.
- **Contre-transform obligatoire sur le contenu des cases** (`T⁻¹ = S·R(−θ)`), sinon les lettres se retrouvent couchées ou en miroir. Le calque de contenu **doit** porter `pointer-events-none` : sans ça `elementFromPoint` tombe sur lui au lieu de la case et le tracé au doigt ne trouve plus rien.
- **La bascule a lieu même en plein tracé, et le mot en cours n'est pas perdu** : la sélection est mémorisée par identité de case (`selectedCells`), pas par position à l'écran — le DOM ne bougeant pas, elle survit telle quelle et le joueur finit son mot après s'être réorienté. En revanche la saisie est **verrouillée pendant les 550 ms d'animation** (`spinning` ref) : sinon une case adjacente qui défile sous un doigt immobile s'ajouterait au mot toute seule.
- Séquence de bascules tirée d'un PRNG **seedé sur la date** : tous les joueurs subissent les mêmes bascules aux mêmes moments.
- Config par mode via `spin?: SpinConfig` sur `PyramidMode` (`everySecs`, `transforms`). Poser `spin` sur n'importe quel mode pyramide suffit à le faire basculer.

### Couleur et emblème par mode
Chaque mode a **sa** couleur d'accent et **son** emblème — c'est ce qui permet de reconnaître le défi du jour d'un coup d'œil sur l'accueil.
- Accents des 5 modes permanents : Pyramiddle `#fbbf24` ambre · Triddle `#fb923c` orange · Ruddle `#60a5fa` bleu · Speedle `#34d399` émeraude · BiGriddle `#c084fc` violet · Spinddle `#fb7185` rose. ⚠ Vérifier la distance à l'existant avant d'en choisir une (Spinddle était initialement en `#a78bfa`, trop proche du violet BiGriddle). ⚠ Ambre Pyramiddle et orange Triddle restent voisins — à retravailler si un 7e mode arrive.
- `emblem: EmblemId` est **obligatoire** sur `DailyModeBase` : un nouveau mode ne compile pas sans le sien. Rendu par [`ModeEmblem.tsx`](src/components/ModeEmblem.tsx) à partir d'icônes `lucide-react` (déjà une dépendance, traits homogènes). Ajouter un mode = 1 valeur dans `EmblemId` + 1 entrée dans `ICONS`.

### Classement Semaine / Mois
- Points daily = 3/2/1 pour top1/2/3 par (date, mode).
- Bonus hebdo = +5/+3/+1 pour top1/2/3 de chaque semaine **close** (lundi-dimanche), injecté dans le mois qui contient le lundi de la semaine.
- La semaine en cours ne donne PAS de bonus tant que dimanche 23:59 Paris n'est pas passé.
- Tiebreakers agrégats : `points DESC, top1 DESC, top2 DESC, total_played ASC`. Égalité parfaite = même rang (Olympic ranking `1, 1, 3, 4...`) → bonus partagé.
- Tiebreakers Jour : `score DESC, elapsed_secs ASC`. `created_at` sert seulement à l'ordre d'affichage, pas au rang.
- Filtre par mode : `fetchDailyLeaderboard(date, mode.id)` filtre les entries par mode.id. Utile en dev où l'override URL peut créer des résultats de plusieurs modes le même jour ; en prod garantit qu'on compare Speedle avec Speedle et pas avec Pyramiddle.
- Sources : RPC SQL dans [`supabase_migration_leaderboard.sql`](supabase_migration_leaderboard.sql). Timezone `Europe/Paris` hardcodée dans toutes les bornes date (pas `current_date` UTC).

### Sync Edge Function : règle d'or
S'applique à **tous les modes** (tout passe par l'edge function depuis le 25/07). Toute modification qui affecte le calcul serveur doit être répercutée dans [`supabase/functions/submit_daily/_shared/`](supabase/functions/submit_daily/_shared/) **avant** ou en même temps que le deploy Vercel, puis `npx supabase functions deploy submit_daily`. Fichiers concernés typiques :
- `dailyModes.ts` (nouveau mode, date spéciale, `SUNDAY_CYCLE`/`SUNDAY_REF`, `SEED_OVERRIDES`, générateurs `generateSpeedleGrid`/`generateRuddleGrid`, barème Speedle, `MODE_BONUS_WORDS`)
- `gridGenerator.ts` (logique de génération, distribution des lettres)
- `dictionary.ts` (mots ajoutés/retirés)
- `scoring.ts` (règles de points)

Sans redéploiement de l'Edge Function, les soumissions des joueurs seront **rejetées silencieusement** (le serveur régénère une grille différente que celle vue par le client).

**Race condition résolue (12/07)** : la validation serveur prend plusieurs secondes (régénération de grille) → l'onglet Classement post-partie re-fetch tant que `is_me` est absent (hook [`useDailyLeaderboard`](src/hooks/useDailyLeaderboard.ts), max 4×/2.5s), utilisé par les 3 écrans de résultats.

### Scripts d'optimisation offline
Pour les grilles thématiques (anniversaires, événements) :
- [`scripts/optimize-birthday-taha.mjs`](scripts/optimize-birthday-taha.mjs) — **le plus récent et générique** : backtracking de placement de N mots arbitraires (partage de cases si même lettre) puis remplissage optimisé des cases libres. Usage : `node scripts/optimize-birthday-taha.mjs [fills] "mot1,mot2,mot3" [maxCap8]`. Early-stop 200k placements (OOM sinon avec ≤2 mots), **réparti en quota par case de départ** — sans ça le plafond était atteint avant que le DFS n'ait quitté la case 0 et toutes les solutions démarraient dans le coin haut-gauche (corrigé le 30/07, cf. ADR). Faisabilité 4×4 : compter l'union des lettres avec multiplicité max par mot — si > 16 c'est mathématiquement infaisable, inutile de lancer.
  - **Mode furtif** (30/07) : `STEALTH_WORD=<mot>` trie les grilles par difficulté à repérer ce mot (visibilité du chemin le plus repérable : rectitude, compacité, sens de lecture, amorce, départ en coin) au lieu du score dico. Poser un plancher de qualité avec `MIN_WORDS` / `MIN_SCORE`, sinon on obtient une grille furtive mais pauvre. `EXTRA_LETTERS=y` autorise le tirage d'un leurre pour les lettres rares absentes de `LETTER_WEIGHTS` — en pratique ça coûte trop cher au dico en français. Utilisé pour la grille Ay du 01/08.
- [`scripts/optimize-birthday-fate.mjs`](scripts/optimize-birthday-fate.mjs) — ancêtre à chemins fixes (`FIXED`/`FREE_CELLS` hardcodés).
- [`scripts/check-speedle-grid.mjs`](scripts/check-speedle-grid.mjs) — réplique `generateSpeedleGrid` pour auditer la grille d'une date (contrainte 2-5 mots 8L+).

## Flow de déploiement

```
git push origin main         → trigger Vercel auto (frontend)
supabase functions deploy X  → deploy Edge Function (manuel)
```

Vercel auto-deploy ne marche pas toujours sur ce projet — fallback `vercel --prod --yes` depuis le dossier projet.

**Alias Vercel** : `ruzzle-custom.vercel.app` est ré-aliasé **automatiquement** à chaque `vercel --prod` depuis le 05/07 (`"alias"` dans [`vercel.json`](vercel.json)). ⚠ Le projet Vercel s'appelle `griddle` (les URLs de deploy sont `griddle-*.vercel.app`), seul l'alias porte le nom ruzzle-custom.

**Cache navigateur** : `vercel.json` force `no-cache, must-revalidate` sur `index.html` (incident Kmano 05/07 : bundle stale = mauvais mode du jour affiché). Les assets JS hashés restent cachés infiniment — c'est le HTML qui doit revalider. Sur iPhone, un cache déjà stale se purge via un lien avec query param bidon (`?v=x`).

**Supabase CLI** : pas installé globalement. Utiliser `npx supabase functions deploy submit_daily` (avec `nvm use 20` pour éviter le bug node symbol du homebrew — `source ~/.nvm/nvm.sh && nvm use 20` requis aussi pour vite/vercel, le shell par défaut est sur Node 18).

**MCP Supabase non configuré pour ce projet** (token = projet Merveil). Pour requêter la DB : script node avec l'anon key de `.env.local` (RLS s'applique), ou SQL editor du dashboard (manuel, par Hatim).

## Pour démarrer une session sur Ruzzle

1. Lire [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) si nouveau dans le projet.
2. Suivre le pattern Plan → Code → Décision.
3. Si l'utilisateur dit "go" sans plan, vérifier que c'est trivial. Sinon, briefer quand même.
