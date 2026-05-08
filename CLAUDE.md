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

### Score daily
Le score = somme des **scores des créneaux pyramide remplis**, pas des mots trouvés. Un mot long peut remplir un créneau plus court (règle "plus long créneau vide ≤ longueur du mot"). Voir `pyramidSlotForWord` dans [`src/lib/dailyModes.ts`](src/lib/dailyModes.ts).

### Anti-cheat
Toute soumission de défi quotidien passe par l'Edge Function `submit_daily` ([`supabase/functions/submit_daily/`](supabase/functions/submit_daily/)). Le client ne dicte plus le score — le serveur régénère la grille et recalcule. La policy RLS d'INSERT direct sur `daily_results` est désactivée : seul le service role (utilisé par l'Edge Function) peut insérer.

### Génération de grille = déterministe
Même date → même grille pour tous les joueurs (et pour le serveur). Le PRNG est `mulberry32` seedé depuis `seedFromString(date)`. Toute modification de la génération doit être synchronisée entre [`src/lib/gridGenerator.ts`](src/lib/gridGenerator.ts) et [`supabase/functions/submit_daily/_shared/gridGenerator.ts`](supabase/functions/submit_daily/_shared/gridGenerator.ts) **avant** un déploiement, sinon le serveur valide une grille différente que celle vue par les joueurs.

### Modes de jeu
Architecture en union discriminée `DailyMode = PyramidMode | MarathonMode`. Ajouter un nouveau mode = créer son objet dans `dailyModes.ts` + l'ajouter au dispatcher `modeForDate`. **Aucun toucher à App.tsx pour les couleurs/intro/règles** — elles vivent dans le mode lui-même.

## Flow de déploiement

```
git push origin main         → trigger Vercel auto (frontend)
supabase functions deploy X  → deploy Edge Function (manuel)
```

Vercel auto-deploy ne marche pas toujours sur ce projet — fallback `vercel --prod --yes` depuis le dossier projet.

## Pour démarrer une session sur Ruzzle

1. Lire [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) si nouveau dans le projet.
2. Suivre le pattern Plan → Code → Décision.
3. Si l'utilisateur dit "go" sans plan, vérifier que c'est trivial. Sinon, briefer quand même.
