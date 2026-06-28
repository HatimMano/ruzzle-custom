# Decision log (ADR)

Format : Architecture Decision Records. Chaque entrée capture une décision technique non-triviale avec son contexte. Lecture chronologique du bas vers le haut (le plus récent en haut).

Format type :
```
## YYYY-MM-DD — Titre court
**Trigger** : ce qui a déclenché le besoin
**Options envisagées** : a, b, c (pros/cons brefs)
**Choix** : laquelle
**Pourquoi** : raisons techniques
**Tradeoffs assumés** : ce qu'on accepte de payer
**À surveiller** : pièges, dépendances qui peuvent casser
```

---

## 2026-06-28 — Classement Semaine/Mois + bonus hebdo (remplace cumul/mensuel)

**Trigger** : le classement all-time était biaisé envers les anciens joueurs (impossible de rattraper le top après 2-3 semaines de retard) → frustration des nouveaux. Besoin d'une compétition qui se renouvelle.

**Options envisagées** :
- a) Garder mensuel seul, virer all-time
- b) **Semaine + Mois avec bonus hebdo +5/+3/+1 injecté dans le mois**
- c) Semaine + Mois + Année (3 onglets)

**Choix** : b)

**Pourquoi** :
- La semaine donne une compétition à court terme renouvelable, le mois récompense la régularité.
- Le bonus hebdo crée un "trophée" hebdomadaire qui persiste dans le mois → la semaine "compte" sur la durée.
- Le all-time n'est pas regretté : `total_score`, `longest_word`, `best_daily_streak` dans la section "Vous" valorisent déjà l'historique long terme.

**Implémentation** :
- Semaine = lundi-dimanche (ISO, `date_trunc('week', date)`).
- Bonus calculé **à la clôture** : top1/2/3 d'une semaine ne sont crédités que quand la semaine est terminée (`week_start + 7 days <= current_date`). La semaine en cours = compétition pure, sans bonus visible. Au passage du lundi suivant, +5/+3/+1 sont figés.
- Bonus appartient au mois contenant le **lundi** de la semaine (cas simple : la quasi-totalité des semaines sont dans un seul mois ; le cas chevauchant tombe sur le mois du lundi).
- Tout calculé à la volée dans la RPC `top_aggregated_players(period, lim)` — aucun job cron, aucune table extra.
- RPC `my_aggregate_stats(my_id, period)` retourne aussi `weekly_bonus` pour l'afficher dans la section "Vous".

**Tradeoffs assumés** :
- Le calcul à la volée est O(n daily_results × log n) — OK tant qu'on est sous le million de résultats. Si on scale beaucoup, materialized view envisageable.
- Le bonus à la clôture = pas de "live" thrill pendant la semaine. Choix assumé : moins frustrant si on perd sa 1ʳᵉ place dimanche soir.
- API breaking : `fetchAggregateLeaderboard(yearMonth)` → `fetchAggregateLeaderboard(period)`. Cache local du drawer reset (state ré-init au reload).

**À surveiller** :
- Si la définition de la semaine doit changer (calendaire vs ISO), `date_trunc('week')` à remplacer.
- Une semaine qui chevauche mai/juin : son bonus tombe sur le mois du lundi. À ré-évaluer si confusion utilisateur.
- Le `period` parameter de la RPC est sans validation Postgres → si on en ajoute un nouveau (`year`), bien étendre les branches `case when`.

---

## 2026-06-25 — Classement cumul/mensuel + record du mode sur l'accueil

**Trigger** : besoin d'un vrai leaderboard pour engager les joueurs (au-delà du classement du jour). Le user voulait aussi un "record du défi" affiché sur l'accueil pour donner un challenge psychologique (battre HatimIL).

**Options envisagées** (stockage classement cumul) :
- a) **RPC PostgreSQL** (`function top_aggregated_players`) — agrégation à la demande, zero maintenance
- b) Materialized view + refresh planifié — plus rapide en lecture mais stale + complexité
- c) Table dédiée + triggers — rapidissime mais triggers complexes, rebuild si delete (cas déjà vécu)
- d) Calcul côté client — ne scale pas, sale

**Choix** : a) RPC PostgreSQL.

**Pourquoi** :
- Volume actuel : <10k lignes daily_results. Rank() over partition + group by reste <100ms.
- Zero maintenance : pas de refresh à planifier, pas de triggers à débugger sur delete.
- Test de scalabilité : à 1M lignes, encore acceptable (~1s, qui peut être amélioré via index si besoin).
- Si jamais on atteint vraiment des limites de perf, on pourra passer à b) ou c) sans changer le contrat de l'API client.

**Tradeoffs** :
- 1 RPC à maintenir dans le SQL (déployé manuellement via SQL Editor — MCP read-only)
- Filtre temporel par préfixe `date like 'YYYY-MM-%'` : pas optimal pour très gros volumes, mais simple. Index sur `date` à ajouter si besoin futur.

**Système de points** : 3pts top1, 2pts top2, 1pt top3 par (date, mode). `rank()` avec tiebreaker `created_at` → premier qui finit gagne, jamais d'ex-aequo silencieux.

**Filtrage mode** : tous modes confondus (Classic + BiGriddle + Triddle agrégés). Justification : sinon les classements deviennent trop fragmentés et les nouveaux modes (peu de tirages) ne génèrent pas de points significatifs.

**UI** : 2 onglets seulement (Jour + Classement), onglet Séries supprimé (peu utilisé). Sous-toggle Cumul / Ce mois sur Classement. Format compact : `1. HatimIL  8pts  2/1/0  23j`.

**Record sur l'accueil** : `fetchModeRecord(mode.id)` = `SELECT` direct avec ORDER BY elapsed_secs ASC LIMIT 1 sur les défis complétés du mode. Mis à jour à chaque rendu de HomeScreen (todayMode.id change quand on bascule de jour).

**À surveiller** :
- Si nombre de joueurs explose (>1k), monitorer latence du RPC. Plan B : index sur `daily_results(date, mode, score DESC)`.
- Le tiebreaker `created_at` repose sur le moment de l'INSERT côté Edge Function. Si le réseau du joueur lague et qu'il submit 30s après avoir vraiment fini, il perd l'égalité. Acceptable.

**À ne pas oublier** : appliquer `supabase_migration_leaderboard.sql` dans le SQL Editor avant que l'onglet Classement marche en prod. Sans la fonction RPC, l'appel échoue silencieusement et affiche "Aucun classement encore".

---

## 2026-05-21 — Whitelist conjugaisons verbales dans le dico

**Trigger** : trous récurrents (notait, citait, soulantes, etc.). Cause racine systémique : filtre par fréquence-lemme trop strict sur les formes ≥8L. ~1 plainte tous les 1-2 jours, bloquant avant industrialisation.

**Options envisagées** :
- a) Abaisser le seuil 8-10L de 1.0 à 0.5 — fix partiel, ~5-10% du gap résolu
- b) **Whitelist conjugaisons verbales** — toute forme de lemme VER acceptée
- c) Changer de source (Wiktionnaire brut, Reverso) — refacto majeur

**Choix** : b)

**Pourquoi** : résout 80%+ des cas (les verbes sont la majorité des plaintes). Reste léger (~30 lignes ajoutées dans `scripts/build-dict.mjs`). Risque de faux positifs limité car cgram=VER est curé par Lexique383.

**Implémentation** :
- Set `verbLemmes` : lemmes normalisés où cgram=VER (= infinitifs)
- Set `verbalOrthos` : orthos normalisés observés avec cgram=VER (= participes/conjugaisons)
- Passe 2 (Lexique) : bypass si forme=VER, OU si forme=ADJ/NOM mais lemme ∈ verbalOrthos (= adjectif verbal)
- Passe GLAFF : bypass si lemme ∈ (verbLemmes ∪ verbalOrthos)
- Filtre rétroactif : protège les `verbForms` du purge fréquence

**Résultat** : dico 87k → 153k mots (+76%). Tous les cas du backlog résolus sauf "soulantes" (absent des sources Lexique+GLAFF, pas un problème de filtre).

**Tradeoffs** :
- Dico passe de ~600 KB à ~1.3 MB (gzipped ~250 KB → ~400 KB). Bundle dico +66%, négligeable au regard du gain.
- Edge Function : **redeploy obligatoire** après chaque rebuild du dico (sinon les isolates Deno chauds gardent l'ancien dico en mémoire et rejettent les nouveaux mots).

**À surveiller** :
- Faux positifs verbes archaïques/régionaux qui pollueraient — surveiller plaintes joueurs ("ce mot existe pas !")
- Si la sample manuelle révèle des trucs zarbis : ajouter un seuil-lemme minimum (ex: ≥ 0.1) sur le bypass pour filtrer les verbes hyperrares

**Procédure de déploiement obligatoire** : `node scripts/build-dict.mjs` → vérif manuelle sample → `git push` + `vercel --prod --yes` (front) + `supabase functions deploy submit_daily` (edge). Skipper le dernier step = désynchro silencieuse.

---

## 2026-05-17 — Extraction ProgressStrip par mode (OCP)

**Trigger** : le rendu du strip de progression dans le classement venait d'être patché avec un `if (isMarathonMode) ... else ...` dans `LeaderboardDrawer.tsx`. Anticipation : à 3-5 modes, le dispatcher devient laid et chaque modif d'un mode oblige à toucher ce gros fichier.

**Options envisagées** :
- a) **Composant par mode dans un dossier dédié** + dispatch léger dans `ProgressStrip.tsx`
- b) Convention "metric agnostique" (extraire `completionPercent`, `topLevelReached` du mode et un seul renderer générique) → plus pauvre visuellement, impossible de faire des spécificités par mode
- c) Mode embarque sa fonction de rendu (`mode.renderLeaderboard()`) → couple game logic et React, et casserait la copie Deno de l'Edge Function

**Choix** : a)

**Pourquoi** :
- a) suit OCP : ajouter un mode = créer 1 fichier `XxxStrip.tsx` + ajouter un case dans `ProgressStrip.tsx`. Aucun autre fichier ne change.
- c) écarté car il ferait fuiter React dans `dailyModes.ts` (le module qui doit rester pur pour la copie Deno côté Edge Function)
- b) écarté car le user vient de demander un rendu différent pour Triddle → on veut explicitement de la liberté visuelle par mode

**Structure** :
```
src/components/leaderboard/
├── ProgressStrip.tsx   — dispatcher (branche sur mode.kind)
├── PyramidStrip.tsx    — pour PyramidMode (1 dot/créneau, doré au cap)
└── MarathonStrip.tsx   — pour MarathonMode (1 dot/grille, doré si complète)
```

**Tradeoffs assumés** :
- 3 fichiers pour ~70 lignes au lieu d'un `if/else` inline. Acceptable, c'est la lisibilité long-terme.
- Le dispatcher est toujours un `if/else if`. Pas grave : c'est UN endroit, court, explicite.

**À surveiller** : si un jour on veut afficher le `ProgressStrip` dans d'autres contextes (ex: `MarathonResultsScreen` → tab Classement), les composants sont déjà importables tels quels. Le dispatcher fait le bon choix automatiquement.

---

## 2026-05-16 — Triddle : `minWordsAtCap=5` (garantir 5 mots de 7L+ par grille)

**Trigger** : test du Triddle sur le dimanche 17/05 (override programmé). Au feedback initial, le mode était jugé "trop dur" — avec un seul mot 7L+ possible par grille, le joueur peut être coincé sur le top de la pyramide sans alternative.

**Options envisagées** :
- a) **Bump `minWordsAtCap: 5`** → garantit au moins 5 mots de 7L+ par grille
- b) Élargir la pyramide ou modifier le cap → change la mécanique de scoring
- c) Refacto plus profond (générer la grille à partir d'un pool prédéfini de mots) → trop d'effort pour un tuning

**Choix** : a)

**Pourquoi** : c'est exactement le paramètre prévu (déjà utilisé pour classic = 2 et bigriddle = 3). Test de faisabilité via `scripts/test-grid-size.mjs` :
- 5×7L+ sur 4×4 → 34% de grilles passent, médian 3 essais, p90 = 6 (budget MAX_ATTEMPTS_DAILY = 800)
- Pour 3 grilles (sub-seeds indépendants) : ~18 essais p90 total, OK

**Tradeoffs assumés** :
- Génération un peu plus lente (~30 ms au lieu de ~10 ms par grille) — imperceptible
- Si on monte plus haut (7×7L+, 24% de grilles), p90 = 7 essais, encore OK. À garder en tête si futur réglage
- **Important** : ce changement modifie la grille générée pour la date 2026-05-17 vs ce qui aurait été généré avant ce commit. Si quelqu'un a déjà testé l'URL avant le deploy, il verra une nouvelle grille au prochain refresh. Pas critique car personne n'avait soumis (la date est demain).

**À surveiller** :
- Feedback joueurs dimanche : 5×7L+ rend-il le mode plus accessible sans trop le simplifier ?
- Si trop facile → on baisse à 3. Si trop dur encore → on monte à 7.

---

## 2026-05-16 — Premier Triddle programmé (override SPECIAL_DATES)

**Trigger** : besoin de tester le mode Marathon en condition réelle (jusqu'ici uniquement accessible via URL override `?mode=marathon`). Choix : renommer en "Triddle" (= Tri + Griddle, plus parlant que "Marathon") et le pousser sur le défi du dimanche 17/05/2026.

**Options envisagées** :
- a) **Override ponctuel SPECIAL_DATES** (1 date précise) — minimal, observe l'effet sans engagement
- b) Alterner dimanches pair/impair dans le dispatcher (BiGriddle/Triddle)
- c) Remplacer définitivement BiGriddle par Triddle le dimanche

**Choix** : a)

**Pourquoi** : premier passage en prod = test. On veut voir si les joueurs s'engagent dans 3 grilles enchaînées avec timer, sans casser leur habitude BiGriddle dominicale. Si engagement OK → b). Si rejet → on n'a sacrifié qu'un dimanche.

**Tradeoffs assumés** :
- `name` changé sur tous les écrans (intro, carte, header) — mais `id: 'marathon'` conservé en DB pour ne pas casser le typage et faciliter le rollback / migration future
- Sync requis entre `src/lib/dailyModes.ts` (front) et `supabase/functions/submit_daily/_shared/dailyModes.ts` (edge) sur l'override SPECIAL_DATES. Fait. Si on oublie, l'edge function rejetterait les submits comme `mode_mismatch`.

**À surveiller** :
- Engagement vs un dimanche BiGriddle classique (taux de complétion, temps moyen, abandons à grille 2 ou 3)
- Si on étend à b), virer cet override ponctuel (sinon il prend précédence sur la règle d'alternance)

---

## 2026-05-08 — Anti-cheat via Edge Function Supabase

**Trigger** : le score était calculé côté client et envoyé brut à Supabase. Avec les DevTools, n'importe qui pouvait soumettre `score: 9999` et la DB l'acceptait — la RLS validait juste que `auth.uid() = user_id`, pas la cohérence du score.

**Options envisagées** :
- a) Trigger SQL (PL/pgSQL) qui valide la grille et le score → SQL pour faire un DFS sur une grille c'est l'enfer, dépendance forte au format de stockage
- b) Backend Node custom (Express + Fly.io) → serveur à maintenir, coût fixe ~5$/mois, latence vers Supabase
- c) Vercel Functions → même langage que le front (réutilisation de code), latence vers Supabase EU correcte mais pas optimale
- d) **Supabase Edge Function (Deno)** → intégrée à la DB (latence <10ms), JWT auto-validé, free tier généreux, scale à zéro

**Choix** : d) Edge Function Supabase

**Pourquoi** :
- Co-localisée avec la DB → latences DB <10ms vs ~100ms depuis Vercel ou un autre cloud
- L'auth est déjà câblée : la fonction reçoit le JWT du user et peut faire `getUser()` sans config manuelle
- Pas d'infra à gérer, pas de coût fixe

**Tradeoffs assumés** :
- **Code dupliqué** entre `src/lib/` (Node/browser) et `supabase/functions/submit_daily/_shared/` (Deno). On accepte la duplication parce qu'unifier les deux runtimes est plus de travail que de tenir à jour ~300 lignes en doublon. Mitigation : `CLAUDE.md` impose de synchroniser avant deploy.
- **Cold start** ~200-500ms sur la première invocation après inactivité. Acceptable pour une soumission (pas un endpoint chaud).
- **Format Deno** : pas de `node_modules`, imports via URL ou `npm:` prefix. Légère friction.

**À surveiller** :
- Si `gridGenerator.ts`, `dailyModes.ts`, `scoring.ts` ou `prng.ts` changent côté front, **redeployer la function** sinon le serveur valide une grille différente que celle du joueur
- Le dico est fetché depuis `https://ruzzle-custom.vercel.app/words_fr.txt` au cold start. Si le domaine change, mettre à jour `DICT_URL` env var dans Supabase

**Implémentation** : `supabase/functions/submit_daily/`

---

## 2026-05-08 — Drop policy RLS `daily_results_insert`

**Trigger** : suite à la mise en place de l'Edge Function, le path d'insert direct via REST devait être fermé pour fermer le contournement.

**Options envisagées** :
- a) Garder la policy → l'Edge Function et l'insert direct cohabitent, mais l'insert direct reste cheatable
- b) **Drop la policy d'INSERT** → seul le service role peut insérer (qui bypass RLS, utilisé par l'Edge Function)
- c) Remplacer la policy par une policy `WITH CHECK (false)` qui bloque tout insert authentifié → équivalent à b) mais explicite

**Choix** : b) Drop la policy

**Pourquoi** : pas de policy = aucun INSERT autorisé pour les rôles `anon` et `authenticated`. C'est le comportement par défaut de RLS. Plus simple à comprendre que c).

**Tradeoffs** :
- **Tout client tournant l'ancien code** (avant le deploy de la nouvelle version) verra ses submits direct échouer. À ce stade du projet (~5 utilisateurs), risque acceptable.
- Si on veut rollback (Edge Function down), il faut re-créer la policy. SQL à garder sous le coude :
  ```sql
  create policy "daily_results_insert" on daily_results
    for insert with check (auth.uid() = user_id);
  ```

**À surveiller** : la policy de SELECT `daily_results_select` reste en place — n'importe qui peut lire le classement, c'est voulu.

---

## 2026-05-08 — Règle de scoring : "plus long créneau vide ≤ longueur du mot"

**Trigger** : le user a remarqué un cas non géré. En mode classic, si le 8L+ est déjà rempli et que le joueur trouve un 9L, l'ancienne règle (`Math.min(9, 8) = 8`) trouvait le slot 8 déjà rempli et donnait 0 pt. Frustrant : un joueur trouve un mot long et n'a rien.

**Options envisagées** :
- a) Statu quo (0 pt si le slot calculé est rempli)
- b) Donner les points du mot dans le dernier slot disponible (peu importe la longueur du slot) → un 9L vaudrait 12 pts dans le slot 6L par exemple
- c) **Donner les points du SLOT (pas du mot) dans le plus long créneau vide ≤ longueur du mot** → un 9L peut remplir le 6L pour les 4 pts du créneau 6L

**Choix** : c)

**Pourquoi** : c) est cohérent avec le "rang" pyramidal. Le slot a un score fixe ; ce qu'on remplit dedans, c'est secondaire. Évite aussi le bug en marathon (cap 7L) où un 8L+ devrait valoir 7 pts max.

**Tradeoffs** :
- Léger comportement contre-intuitif : un 9L peut valoir moins qu'un 7L si le 7L est déjà rempli (le 9L file dans un slot plus court). Mais c'est cohérent : on ne récompense pas la "trouvaille longue" deux fois.
- Implémentation : nouvelle fonction `pyramidSlotForWord(rules, word, pyramidFound)` dans `dailyModes.ts`. Remplace `pyramidLevelKey`.

**À surveiller** : si on ajoute des modes avec d'autres règles de pyramide (ex: bonus de longueur), bien revisiter cette logique.

---

## 2026-05-08 — Marathon : type discriminé `DailyMode = PyramidMode | MarathonMode`

**Trigger** : ajouter le mode marathon (3 grilles enchaînées, timer 5 min) sans casser les modes pyramide existants.

**Options envisagées** :
- a) Étendre l'interface `DailyModeRules` actuelle pour gérer 1 ou plusieurs grilles via des champs optionnels → l'interface devient un fourre-tout, le code branche partout
- b) Faire une interface avec `grids: Grid[]` toujours (longueur 1 pour pyramide) → moins propre côté typing pour les modes pyramides simples
- c) **Tagged union TypeScript** : `kind: 'pyramid' | 'marathon'` + interfaces séparées + type guards → code clair, OCP respecté

**Choix** : c) Tagged union

**Pourquoi** : pyramide et marathon ont des shapes vraiment différentes (1 grille vs N, timer optionnel vs obligatoire, scoring nested vs flat). Forcer un même type créerait du couplage. Le tagged union laisse chaque mode être lui-même tout en permettant un dispatch propre.

**Tradeoffs** :
- Quand on ajoute un mode (Marathon-style ou autre), il faut mettre à jour les helpers (`isPyramidMode`, `isMarathonMode`, branches dans App.tsx)
- Les helpers `isPyramidComplete`, `pyramidLevelsFound`, `pyramidRows`, `levelLabel` ont été rendus structurellement compatibles (`PyramidLike = { pyramidLengths }`) pour éviter de spéculer si on ajoute un 3e type

**À surveiller** : si on ajoute un mode totalement différent (ex: défi sans pyramide, "un mot par jour" type Wordle), prévoir un nouveau `kind` et adapter le dispatcher.

---

## 2026-05-08 — Anti-refresh marathon... non, juste pyramide

**Trigger** : un joueur peut refresh la page pendant un défi quotidien et tout reset (chrono, mots trouvés). Trichable.

**Options envisagées** :
- a) Ne rien faire → trichable (statu quo)
- b) Persister tout l'état dans localStorage à chaque mot, restaurer au boot → bouchon contre le refresh innocent. Pas anti-cheat profond (dev tools peuvent toujours wipe localStorage).
- c) Tracker la session côté serveur (DB row "in_progress") → vraie protection mais coût d'archi

**Choix** : b) pour pyramide. Marathon non couvert pour le MVP.

**Pourquoi** : b) coûte ~50 lignes et stoppe 99% des cas de triche par refresh. Le c) demanderait une vraie session backend, lourd pour MVP.

**Tradeoffs** :
- Quelqu'un de motivé peut clear localStorage manuellement. À ce moment-là, l'unique constraint `(user_id, date)` côté DB l'arrête s'il a déjà soumis. Sinon ça passe.
- Marathon non couvert pour gagner du temps — à faire si Marathon devient un mode régulier.

**À surveiller** : si on ajoute du marathon récurrent dans le dispatcher, il faudra étendre la session pour gérer multi-grille.

**Implémentation** : `src/lib/dailySession.ts` + branchements dans `App.tsx` (bootstrap restore + per-word save).

---

## 2026-05-04 — BiGriddle (mode 5×5 dimanche)

**Trigger** : besoin de varier le défi du jour. Ruzzle classique 4×4 = lassitude potentielle pour les joueurs réguliers. Idée user : 5×5 le dimanche, plus dur.

**Options envisagées** :
- a) Garder un seul mode et augmenter la difficulté autrement (timer, mots requis...)
- b) **Grille plus grande le dimanche** (5×5, pyramide étendue 3→10)
- c) Grille 6×6 → écran trop large sur mobile

**Choix** : b)

**Pourquoi** : 5×5 reste lisible sur mobile (393px de large vs 470px pour 6×6, le second ne tient plus sur petit écran). Pyramide étendue à 10L donne de la profondeur sans être impossible (validé par script `scripts/test-grid-size.mjs`).

**Tradeoffs** :
- Le code de génération de grille devient paramétré sur la taille (anciennement hardcodé 4×4). Refacto modeste mais nécessaire.
- La carte mini-pyramide à l'accueil doit s'adapter (8 niveaux au lieu de 6).

**À surveiller** : `MAX_ATTEMPTS_DAILY` à monitorer. Sur 5×5 + pyramide 3→10 + ≥3 mots de 10L (comme on a configuré), p90 = 90 essais. Marge OK avec 800 d'attempts max.

**Implémentation** : `bigriddleMode` dans `dailyModes.ts`, dispatch via `modeForDate` (dimanche → bigriddle).

---

## ~2026-04-15 — Auth anonyme par défaut

**Trigger** : déployer Ruzzle vite sans tunnel d'inscription. Veut tester la rétention sans friction.

**Options envisagées** :
- a) Email + password → friction d'inscription, formulaire à coder, "mot de passe oublié" à gérer
- b) Magic link → meilleur UX qu'email+pw, mais round-trip mail à chaque login
- c) **Anonymous auth Supabase** → zéro friction, JWT auto en localStorage, l'utilisateur est créé en tâche de fond

**Choix** : c)

**Pourquoi** : tester la rétention en 0 friction. Pas besoin d'un compte pour jouer. On peut toujours migrer vers email plus tard via `linkIdentity`.

**Tradeoffs assumés** :
- **Cleared localStorage = compte perdu**. Le user_id et le JWT vivent dans localStorage. Si l'utilisateur clear son navigateur, son compte est orphelin (les données restent en DB mais inaccessibles). Acceptable pour un MVP, problématique à scale.
- **Pas de multi-device** : chaque device = un nouveau user. Idem inacceptable à terme.

**À surveiller** : à partir de ~50-100 joueurs réguliers, ajouter un flow email auth (linkIdentity ou migration manuelle). Voir glossary "Magic Link".

**Implémentation** : `ensureAuth()` dans `src/lib/api.ts`.

---

## ~2026-03-15 — Stack initial : React + Vite + TypeScript + Tailwind + Supabase + Vercel

**Trigger** : démarrer le projet from scratch, choisir une stack moderne et productive.

**Options envisagées** :
- a) Next.js (full-stack, SSR par défaut)
- b) **Vite + React (SPA)** — pas de SSR, pas de routing serveur, ultra rapide en dev
- c) Vue/Svelte au lieu de React → trop de risque de friction pour l'IA + le user

**Choix** : b)

**Pourquoi** :
- Ruzzle = SPA simple (pas de SEO besoin, pas de pages multiples). SSR/SSG inutile.
- Vite = HMR ultra-rapide → itération immédiate. Un changement de code = visible en <100ms dans le navigateur.
- React = plus gros écosystème, plus de support des outils IA, profil le plus standard.
- TypeScript = typage statique, autocomplete, refacto sûres. Quasi-mandatory en 2026.
- Tailwind = utility-first CSS, pas de noms de classes à inventer, pas de fichiers CSS en cascade.
- Supabase = backend complet (DB + Auth + functions) sans serveur à maintenir.
- Vercel = deploy zéro-config pour les sites Vite.

**Tradeoffs** :
- Pas de SSR → premier chargement plus lent (HTML quasi vide, JS doit télécharger et bootstrap). Compense par cache navigateur sur visites suivantes.
- Tailwind = fichier source plus verbeux (`className="flex items-center gap-2 ..."`).
- Supabase = vendor lock-in si on veut migrer plus tard.

**À surveiller** : si Ruzzle veut un blog ou des pages SEO un jour, migration vers Next.js à reconsidérer.
