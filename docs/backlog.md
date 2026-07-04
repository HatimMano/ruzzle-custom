# Backlog — Ruzzle

Features et chantiers techniques à venir. Ordonnés par priorité. À déplacer dans `decisions.md` une fois fait (avec date de réalisation).

---

## Priorité haute

### Mode anniversaire Hatim 30 ans (11/07/2026)

**Deadline** : samedi 11/07/2026 (dans 6 jours au moment de l'ajout).

**Concept** : mode pyramide spécial pour la journée. Grille 4×4 avec le mot **TRENTAINE** (9 lettres) placé en dur — le trouver donne une immense satisfaction et remplit d'un coup un long créneau pyramide. Rien de plus — pas d'ajout de mot secondaire, pas de mise en scène lourde.

**Implémentation** :
- Nouveau mode `birthday30Mode: PyramidMode` dans [`src/lib/dailyModes.ts`](src/lib/dailyModes.ts) sur le pattern de `birthdayMode` (30/04) / `fateBirthdayMode` (30/06).
- Grille 4×4 pré-optimisée via un script `scripts/optimize-birthday-30.mjs` (dupliquer `optimize-birthday-fate.mjs`) : DFS + trie pour maximiser le nb de mots long autour de TRENTAINE fixé.
- Placement TRENTAINE : chemin de 9 cases sur 16 respectant l'adjacence. Il en reste 7 pour le remplissage bruteforce optimisé.
- Palette or/rose (au choix) + éventuellement chiffres "30" flottants en background via le check `isBirthday` dans HomeScreen (déjà en place, à étendre à birthday30).
- Entrée dans `SPECIAL_DATES` : `'2026-07-11': birthday30Mode`.
- Sync côté edge function `supabase/functions/submit_daily/_shared/dailyModes.ts` **impératif** (règle d'or) : le mode est pyramide donc validé serveur.

**Effort estimé** : 1-1h30 (script d'opti + intégration + tests + sync edge + deploy).

**Note perso** : premier mode "cadeau" du projet, faisable en dernière minute mais prévoir de le tester le 09 ou 10/07 pour ne pas se lever le jour J avec un bug.

---

### Authentification email (magic link)

**Pourquoi** : aujourd'hui auth anonyme uniquement. Chaque clear cache / changement de device / changement d'URL = perte du `user_id` et donc de tout l'historique. À l'épisode 25/06/2026 (rename rapide vers playgriddle puis rollback), on a frôlé la perte d'identité pour tous les joueurs actifs.

**Tant que cette feature n'est pas en place, on ne peut pas** :
- Renommer le projet Vercel sans risque (URL change = origin change = localStorage différent = perte d'identité)
- Pousser vers + de joueurs (chaque inconnue de cache devient un risque)
- Passer en PWA proprement (l'install ne protège pas contre les autres origins)
- Promettre une persistance de données aux joueurs

**Approche envisagée** :
- Flow magic link via `supabase.auth.signInWithOtp({ email })`
- Lier l'email au `user_id` anon existant via `linkIdentity()` — **à vérifier dispo en free tier** (point critique)
- Si `linkIdentity()` est en Pro only : alternative = créer le compte email, puis migrer les données via UPDATE SQL (`UPDATE daily_results SET user_id = new WHERE user_id = old`) en exposant la migration via Edge Function authentifiée
- UI : bouton "Sécuriser mon compte" sur la modale pseudo ; petite ✉️ ou ☑️ sur le bouton pseudo si déjà sécurisé

**Effort estimé** : 3-4h.

**À surveiller** :
- Personnaliser le template de mail Supabase (sujet, FROM, contenu)
- URL de redirection après clic du lien = `ruzzle-custom.vercel.app` (ou nouveau si renommé)
- Migration des 4-5 joueurs anon actuels : leur proposer le flow à leur prochaine ouverture

---

## Priorité moyenne

### PWA (install mobile)

**Pourquoi** : engagement +50-200% post-install. Icône sur écran d'accueil, plein écran, splash.

**Pré-requis** : auth email d'abord (sinon install = identité volatile).

**Approche** : `vite-plugin-pwa` qui auto-génère manifest + service worker. Icônes à fournir (192×192, 512×512).

**Effort estimé** : 2-3h.

---

### Partage de résultat (Wordle-style)

**Pourquoi** : viralité gratuite. Chaque résultat partagé = 1 prospect.

**Approche** : générer un bloc emoji (🟩🟦⬜ ou variantes par mode) à copier dans WhatsApp/SMS. Format `Ruzzle Classic 25/06 · 27 pts · 1m23s\n🥇🥈🥉◻️◻️◻️\nplaygriddle.vercel.app` (ou URL active).

**Effort estimé** : 1-2h.

---

### Onboarding 30s au premier lancement

**Pourquoi** : réduit le churn jour 1. Aujourd'hui un nouvel utilisateur arrive et doit deviner les règles.

**Approche** : 3-4 slides expliquant pyramide + dragger + scoring, dismissable, vu une fois.

**Effort estimé** : 1-2h.

---

## Priorité basse / nice-to-have

### Notifications push

Nécessite auth email + service worker (déjà via PWA). Rappel quotidien "le défi du jour t'attend".

### Sentry / error tracking

Avant 100 joueurs réels, pour détecter les crashs silencieux.

### Tests unitaires

`dailyModes`, `scoring`, `gridGenerator`. Donne confiance pour refacto.

### Anti-cheat sur le chrono (session backend)

Aujourd'hui : localStorage anti-refresh, mais clear cache = reset chrono. Pour une protection forte, session DB côté serveur. Effort 4-5h.

### Page stats perso

Tableau de bord pour le joueur : son score moyen, sa distribution de longueurs, ses streaks, son record perso. Plus engageant que le simple classement.

### Mode "Thématique" (Sunday)

Grille générée pour contenir surtout des mots d'un thème (cuisine, animaux, sport). Thème révélé en fin de partie. Originalité forte.

### Achievement system

"100 mots trouvés", "Streak 7", "Premier marathon", etc. Engagement long terme.

### Replay des dailies passés

Code déjà déterministe (PRNG seedé). Manque juste l'UI pour parcourir les dates passées.

---

## Notes

- Ce fichier est éditable à la volée. Quand une feature est faite : déplacer l'entrée vers `decisions.md` (avec format ADR) + supprimer ici.
- Si une feature est rejetée définitivement : commenter brièvement pourquoi avant de supprimer.
