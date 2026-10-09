# CLAUDE.md — EAGLEYE Autopilot

Fork d'Open Generative AI (MIT, garder le fichier LICENSE) avec un module **EAGLEYE Autopilot** : réseaux sociaux en pilote automatique pour TPE/PME.
Toujours écrire **EAGLEYE** en majuscules (jamais « EagleEye »).

## Produit
Le client donne son activité, son site et les réseaux à piloter → brand kit → semaine de posts (IG, FB, TikTok, LinkedIn, Google Business) → visuels/vidéos IA → contrôle de marque → validation 1 clic → programmation via Postiz.
Voir `AUTOPILOT.md` pour le détail fonctionnel.

## Commandes
```bash
npm install
npm run build:packages   # obligatoire avant dev/build (packages/studio, workflow, agents, design)
npm run dev              # http://localhost:3000/autopilot
npm run build
```
Clés optionnelles dans `.env.local` (modèle : `.env.autopilot.example`). Sans clé, chaque moteur passe en mode démo.
Idem pour la persistance : sans `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, l'app tourne telle quelle (localStorage, pas de connexion). Pour l'activer, voir `.env.autopilot.example` et `supabase/migrations/0001_autopilot_init.sql`.

## Où est le code Autopilot
- `app/autopilot/` — page + `autopilot.css` (design system) ; `app/autopilot/login/` — connexion par lien magique
- `app/auth/callback/` — échange le lien magique Supabase contre une session
- `app/api/autopilot/[action]/route.js` — status, brand, plan, rewrite, generate (submit + polling), check, integrations, publish, et la persistance : credentials, businesses, posts, import, logout
- `components/autopilot/` — Onboarding, BrandKit, Week, PostCard, Connections, store (localStorage **ou** Supabase selon la config, même API des deux côtés), LoginForm, ui
- `lib/autopilot/` — networks (règles par réseau + répartition des créneaux), brand (scraping avec garde SSRF), planner, media (MuAPI), guard (contrôle de marque), postiz, llm (API Anthropic), credentials (clés chiffrées en base), supabase/ (clients serveur/navigateur, mapping lignes ↔ JS)
- `supabase/migrations/` — schéma SQL (businesses, posts, api_credentials) + RLS, à appliquer une fois sur le projet Supabase
Le reste du repo est l'app d'origine (`/studio`) : ne pas la casser.

## Règles
- Style maison : fond noir encre, accents bronze `#C4945A` / `#E7BD82`, texte crème `#F1E9DA`, titres Bricolage Grotesque, données en IBM Plex Mono, mobile-first, cibles tactiles 44px, animations framer-motion, `prefers-reduced-motion` respecté.
- Jamais stocker d'identifiants de réseaux sociaux : connexion des comptes via Postiz (OAuth officiel), on ne garde que la clé API Postiz.
- Le contrôle de marque (`lib/autopilot/guard.js`) est refait côté serveur avant toute publication — ne pas le contourner.
- Toute URL fournie par l'utilisateur passe par `assertPublicUrl` (SSRF).
- Chaque moteur doit garder son fallback démo.
- Interface en français.

## Feuille de route
1. ✅ Base de données (Postgres/Supabase) + auth multi-clients, remplacer le localStorage. Code prêt (migration SQL, RLS, auth par lien magique, `components/autopilot/store.js` bascule automatiquement) — reste à créer le projet Supabase et renseigner les variables d'env pour l'activer en production. Mono-agence pour l'instant (toute l'équipe EAGLEYE voit tous les clients) ; si plusieurs agences doivent être isolées un jour, ajouter une table `organizations`.
2. Génération hebdo automatique (cron) + e-mail au client pour valider.
3. Boucle analytics : stats Postiz → planner.
4. Facturation par forfait avec quota de crédits MuAPI.
5. Upload du logo officiel EAGLEYE (aigle géométrique noir, ailes déployées, œil blanc, ®) à la place du logo simplifié de `components/autopilot/ui.jsx`.
