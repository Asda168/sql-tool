# Website

The public site (landing, features, MySQL tools, editor, download, docs, changelog, releases, github, privacy, terms) is part of the
React app in `../frontend/src/pages/website/` and is served by the same build as the IDE (`/app`).

- Deploy: Vercel, Root Directory `frontend`, build `npm run build`, output `dist` (`frontend/vercel.json` adds the SPA rewrite).
- API: set `VITE_API_URL` to the Django API origin (default `/api`). Without an API the download page shows a "no release published yet" notice and links to GitHub Releases.
- SEO: default `<title>`/description/keywords are in `frontend/index.html`; each page sets its own via `usePageMeta`.
- Docs content lives in `frontend/src/pages/website/Docs.tsx`; longer developer docs are in `../docs/`.
