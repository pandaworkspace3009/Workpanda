# WorkPanda

## Hosting reality (Cursor Apps / grok.bot)

Probes of the published app at `workpanda.apps.grok.bot` showed:

| Path | Result when `public/index.html` present | Result when only Next `app/page.tsx` |
|------|----------------------------------------|--------------------------------------|
| `/`, static assets under `public/` | 200 (CDN) | `/` 404 if no HTML in `public/` |
| `/api/*`, `/_next/*` | **404** | **404** |

**Conclusion:** the existing app binding for repo root (`.`) deploys **`public/` as a static CDN only**. Next.js server routes are not what that binding serves—even with `package.json` + `app/api`.

### What to use

| Folder | Role |
|--------|------|
| **`.` (repo root)** | Static SPA in `public/` — LocalStorage + JSON import/export. Restores a working `/` on the current slug. |
| **`web/`** | Next.js + Postgres (`cursor-app.json`) + Private/Team identity API. **Publish this folder as a new/separate Cursor App** so server routes can deploy on first bind. |

Multi-device realtime sync requires the `web/` app (Private or Team visibility + Cursor sign-in). The static root app cannot run Postgres handlers on this host binding.
