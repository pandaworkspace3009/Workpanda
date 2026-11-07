# WorkPanda

Next.js app (App Router) with Postgres cloud sync for calendar, roster, and shareholder settlement.

- UI: `app/page.tsx` + `public/css`, `public/js`
- API: `app/api/workspace` (Private/Team Cursor identity only)
- DB: `cursor-app.json` → platform `DATABASE_URL` + `migrations/`

```bash
npm install
npm run dev   # http://127.0.0.1:8765
```
