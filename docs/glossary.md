# Glossaire technique

Ordre alphabétique. Format : terme — définition courte — pourquoi ça nous concerne.

---

## ADR (Architecture Decision Record)
Format standard pour documenter une décision archi : problème, options envisagées, choix, raisons. On en tient un dans [`decisions.md`](decisions.md). Pas inventé pour ce projet — c'est une pratique répandue dans l'industrie depuis ~2011.

## Anonymous Auth
Connexion automatique sans email/mot de passe. Supabase crée un utilisateur unique avec un `user_id` (UUID) et un JWT stocké côté navigateur. Avantage : zéro friction. Inconvénient : si le navigateur perd le JWT (clear cache, navigation privée), le compte est orphelin.

## Bundle / Bundler
Un bundler (chez nous : **Vite**) prend tous tes fichiers source (JS, TS, CSS, images) et les concatène/optimise en un nombre minimal de fichiers servis au navigateur. Évite que le browser fasse 200 requêtes pour charger ton app.

## Cold start
Pour les fonctions serverless (Edge Functions, Vercel Functions...) : la première fois que la fonction est appelée après un moment d'inactivité, l'infra doit "réveiller" un container. Latence ajoutée (100ms-1s selon la techno). Les invocations suivantes utilisent le même container, donc rapides.

## CORS (Cross-Origin Resource Sharing)
Mécanisme de sécurité du navigateur qui empêche un site (`a.com`) d'appeler un autre site (`b.com`) sans autorisation explicite. Notre Edge Function envoie des headers `Access-Control-Allow-Origin: *` pour autoriser n'importe quel front à l'appeler.

## Deno
Runtime JavaScript/TypeScript alternatif à Node.js, créé par le même auteur que Node. Plus moderne, sécurisé par défaut, supporte TS nativement. Les Edge Functions Supabase tournent en Deno (pas Node). Conséquence : on importe les libs via URL ou `npm:` prefix, pas de `node_modules`.

## Determinism (déterminisme)
Une fonction est déterministe si les mêmes entrées produisent toujours la même sortie. Notre génération de grille est déterministe sur la date (PRNG seedé depuis le date string). Crucial pour : (1) tous les joueurs voient la même grille un jour donné, (2) le serveur peut régénérer la grille pour valider une soumission.

## Edge Function
Code serveur qui tourne "à la périphérie" du réseau (proche des utilisateurs ou de la DB), souvent sur des runtimes serverless comme Cloudflare Workers ou Deno. Chez Supabase, c'est du Deno qui tourne dans la même région que la DB. On l'utilise pour `submit_daily` (anti-cheat).

## ER (Entity-Relationship) diagram
Schéma qui montre les tables d'une DB et les liens entre elles (foreign keys). Voir [`ARCHITECTURE.md`](ARCHITECTURE.md) section "Modèle de données".

## HMR (Hot Module Replacement)
Quand tu sauvegardes un fichier en mode dev (Vite), seul ce module est rechargé dans le navigateur — pas un full refresh. Tu gardes ton state, ton scroll, ta partie en cours. C'est ce qui rend `npm run dev` aussi rapide à itérer.

## Idempotent
Une opération est idempotente si la rejouer N fois produit le même résultat qu'une seule fois. Exemple : `UPDATE table SET x=5 WHERE id=1` est idempotent. `INSERT INTO table VALUES (...)` ne l'est pas (deux inserts = deux lignes). Notre `submitDailyResult` n'est PAS idempotent au sens strict — un retry crée un conflit `unique (user_id, date)`.

## Isolate (Deno isolate)
Un environnement d'exécution JS isolé. Chaque invocation d'Edge Function démarre dans un isolate. Si l'isolate est encore "chaud" (utilisé récemment), c'est rapide. S'il a été recyclé, c'est un cold start. Notre dico est chargé une fois par isolate via cache module-level.

## JSX / TSX
Syntaxe étendue de JS/TS qui permet d'écrire du HTML directement dans le code : `<div>{count}</div>`. Convertie en appels `React.createElement(...)` au build. C'est ce qui fait des fichiers `.tsx` au lieu de `.ts`.

## JWT (JSON Web Token)
Token signé qui prouve l'identité de l'utilisateur sans nécessiter de session côté serveur. Format : 3 parties séparées par `.` (header.payload.signature). Notre app stocke le JWT en localStorage ; à chaque requête Supabase, le SDK l'attache automatiquement.

## LocalStorage
Stockage clé/valeur persistant côté navigateur, ~5-10 MB par site. Survit aux refreshs et redémarrages. **Ne survit pas** au clear cache, navigation privée, ou changement de device. On l'utilise pour : JWT (géré par Supabase SDK), display_name, session de défi en cours, best scores des parties libres, historique.

## Magic Link
Login sans mot de passe : l'utilisateur entre son email, reçoit un lien, clique → connecté. Plus sécurisé qu'un mdp (rien à fuiter), moins fluide (round-trip mail). Alternative à email+password ; on n'a pas encore implémenté.

## Modulo (`%`)
L'opérateur reste de la division entière. `7 % 3 = 1`. On l'utilise pour cycler dans une liste : `phrases[dayIndex % phrases.length]` donne une phrase différente chaque jour, en cyclant quand on a fait le tour.

## OAuth
Protocole standard pour se connecter via un fournisseur tiers (Google, Apple, GitHub...). L'utilisateur clique "Sign in with Google", Google confirme l'identité, ton site reçoit un token. Pas implémenté chez nous.

## OCP (Open-Closed Principle)
Un des principes SOLID. Le code doit être ouvert à l'extension (ajouter du nouveau) mais fermé à la modification (sans toucher à l'existant). Exemple chez nous : ajouter un mode de jeu = créer un fichier de mode, l'enregistrer dans le dispatcher. Aucune modification de App.tsx.

## PRNG (Pseudo-Random Number Generator)
Générateur "aléatoire" mais déterministe. À partir d'une seed (graine), produit toujours la même séquence de nombres. Utile pour : tests reproductibles, jeux où tout le monde voit la même grille, debugging. On utilise **mulberry32** : très rapide, bonne qualité statistique, 7 lignes de code.

## RLS (Row Level Security)
Mécanisme PostgreSQL où chaque ligne d'une table peut avoir des règles d'accès. Au lieu de `GRANT SELECT ON table` global, on dit "le user X peut voir SES lignes uniquement". Côté Supabase, c'est le mécanisme principal de sécurité — sans RLS bien configurée, n'importe qui peut lire/modifier n'importe quelle donnée.

## Serverless
Modèle où ton code tourne sans qu'un serveur soit perpétuellement allumé. La plateforme (AWS Lambda, Vercel Functions, Supabase Edge Functions) lance ton code à la demande, le shut down après. Tu paies à l'invocation. Avantage : scale à zéro, pas de maintenance. Inconvénient : cold starts, état non-persistant entre invocations.

## Service Role
Clé Supabase qui bypass la RLS — utilisée pour des opérations admin/serveur. À ne **jamais** exposer côté client. Notre Edge Function l'utilise pour insérer dans `daily_results` (puisqu'on a viré la policy RLS d'insert public).

## SOLID
5 principes de design objet (Single responsibility, Open-closed, Liskov, Interface segregation, Dependency inversion). On les applique à l'archi de Ruzzle (notamment Open-closed pour les modes).

## SSR / SSG / SPA
- **SPA** (Single Page App) : tout le rendu en JS côté navigateur. C'est ce qu'on a (Vite + React). Premier chargement plus lent, navigation interne très rapide.
- **SSR** (Server-Side Rendering) : le serveur renvoie du HTML déjà rendu. Meilleur SEO, premier rendu plus rapide.
- **SSG** (Static Site Generation) : pré-rendu au build. Pour des contenus qui ne changent pas (blog, doc).

## Supabase
Backend-as-a-service open-source basé sur PostgreSQL. Fournit : DB, Auth, Storage, Edge Functions, Realtime, dashboard. Alternative à Firebase. Free tier généreux (500 MB DB, 50 K MAU).

## Tagged union (TS)
Pattern TypeScript où plusieurs types partagent un champ "tag" littéral pour permettre le narrowing. Exemple chez nous :
```ts
type DailyMode = PyramidMode | MarathonMode
// PyramidMode a kind: 'pyramid', MarathonMode a kind: 'marathon'
if (mode.kind === 'pyramid') {
  mode.pyramidLengths // TS sait qu'on a un PyramidMode ici
}
```

## Trie
Structure de donnée d'arbre où chaque nœud représente un caractère. Permet de chercher rapidement si un mot existe ou si un préfixe est valide (utile pour élaguer un DFS). Notre génération de grille construit un trie du dico pour vérifier vite "est-ce qu'il existe un mot commençant par AZE...".

## Type Guard (TS)
Fonction qui retourne un boolean ET informe TypeScript du type narrow. Exemple :
```ts
function isPyramidMode(m: DailyMode): m is PyramidMode {
  return m.kind === 'pyramid'
}
```
Le `m is PyramidMode` est la signature qui dit à TS "si je retourne true, c'est un PyramidMode".

## URL Search Params
La partie après `?` dans une URL : `?daily=2026-05-10&mode=marathon`. On les utilise pour : forcer une date de défi, override le mode, partager un seed précis.

## Vercel
Plateforme de déploiement (créée par les auteurs de Next.js). Branche un repo Git, deploy automatique à chaque push. Free tier suffisant pour Ruzzle. On l'utilise pour le frontend (le HTML/JS/CSS statique).

## Vite
Bundler/dev server moderne. Ultra rapide en dev grâce à HMR + ESM natif (pas de bundle en dev, juste les fichiers servis tels quels). Build de prod via Rollup. Alternative à Webpack. C'est ce que `npm run dev` lance.

## WeightedRandom
Tirage aléatoire pondéré. Au lieu de `random()` qui donne une valeur uniforme, certaines valeurs sont plus probables que d'autres. Notre `weightedRandomLetter` tire les lettres selon leur fréquence en français : `e` est ~150× plus probable que `k`.
