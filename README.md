# WorkPanda

## Apps

| Path | Cursor App | Hosting |
|------|------------|---------|
| `public/` (+ root `index.html`) | `workpanda` | **Static CDN** — calendar UI + LocalStorage |
| `web/` | `workpanda-sync` | **Next.js** — `/api/workspace` + Postgres |

The `workpanda` app binding only serves static files under `public/` (and root `index.html`). Multi-device Postgres sync uses **workpanda-sync**; set that app to Private or Team and sign in with Cursor on each device.
