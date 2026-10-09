# EAGLEYE Autopilot

Social media on autopilot for SMBs, built on top of Open Generative AI. Route: **`/autopilot`**.

The client gives three things — what they do, their website, the networks to run — and gets:

1. **Brand kit** read from their site: palette, logo, fonts, tone, content pillars, visual direction, hashtags, banned words, CTA. Everything is editable.
2. **A week of posts** across Instagram, Facebook, TikTok, LinkedIn and Google Business Profile, spread evenly, at each network's best times, written natively for each network.
3. **Visuals and videos** generated at each network's format (4:5, 9:16, 4:3) through MuAPI.
4. **Brand guard**: every post is checked (banned words, misleading claims, length, hashtags, format, date). Blocking issues prevent scheduling — re-checked server-side.
5. **One-click approval** (per post or the whole week), or **autopilot** mode that approves whatever passes every check.
6. **Scheduling through Postiz**: the client connects their accounts in Postiz with the official OAuth flows. The app never sees or stores social-network passwords.

## Demo mode

No key → everything works with templates, branded placeholder visuals, and simulated scheduling. Good for a sales demo in front of a prospect.

| Engine | Key | Without the key |
| --- | --- | --- |
| Claude (brand kit, plan, captions) | `ANTHROPIC_API_KEY` | Templates + heuristic brand kit |
| MuAPI (images, videos) | `MUAPI_API_KEY` | Branded SVG placeholder |
| Postiz (publishing) | `POSTIZ_API_KEY`, `POSTIZ_API_URL` | Simulated scheduling |

Keys can be set server-side (`.env.local`, see `.env.autopilot.example`) — recommended in production — or entered in the **Connexions** tab (stored in the browser, sent only to this app's own API routes).

## Run

```bash
git submodule update --init --recursive
npm install
npm run build:packages
cp .env.autopilot.example .env.local   # optional
npm run dev                              # http://localhost:3000/autopilot
```

Deploy like any Next.js app (Vercel, Netlify, Docker). The generate route returns immediately and the client polls, so long video jobs never hit serverless timeouts.

## Onboarding a real client

1. Create a Postiz workspace (cloud or self-hosted) for the client and connect Instagram, Facebook, TikTok, LinkedIn and Google Business there.
2. In Autopilot: **+ Nouveau client**, fill in activity + website → brand kit.
3. **Connexions**: paste the Postiz API key; channels are auto-mapped by network.
4. **Semaine**: generate, review, approve, **Programmer**. Postiz publishes at the scheduled times.

## Code

```
app/autopilot/                 page + styles (house style)
app/api/autopilot/[action]/    status · brand · plan · rewrite · generate · check · integrations · publish
components/autopilot/          UI (Onboarding, BrandKit, Week, PostCard, Connections)
lib/autopilot/
  networks.js   per-network rules, formats, cadence, Postiz settings, slot planner
  brand.js      site scraping (SSRF-guarded) + brand kit
  planner.js    weekly plan + rewrite (Claude, template fallback)
  media.js      MuAPI submit/status + demo visuals
  guard.js      brand guard
  postiz.js     integrations, media upload, scheduling
```

## Known limits (v1 demo)

- State lives in the browser (localStorage). For a multi-user SaaS, move businesses/posts to a database and add auth + billing.
- No recurring auto-plan yet: the week is generated on demand. Next step: a weekly cron that plans + generates and notifies the client to approve.
- No analytics loop yet (Postiz stats → planner).
- Generation costs come out of the MuAPI balance — price client plans with a credit quota.
