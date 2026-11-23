# Deployment Guide: GitHub Pages

> **Status: Live** — Bookbinder Studio is deployed and served at **[https://anujgtm1.github.io/Bookbinder/](https://anujgtm1.github.io/Bookbinder/)**.

## Architecture Fit for GitHub Pages

Bookbinder Studio is a 100% client-side static Vite + React application:
- All geometry calculations, `1:1 mm` SVG generation, `300 / 600 DPI` canvas compositing, `@pdf-lib/fontkit` glyph outlining, and `pdf-lib` single-sheet / 2-sheet tiled PDF generation run entirely in the browser.
- All 6 curated literary fonts (`@fontsource/*`) and declarative specs (`src/resources/paperSpecs.json`, `src/resources/ornaments/*.svg`) are bundled as static assets inside `dist/` with zero runtime CDN dependencies.
- Project auto-save and Series Design Presets use browser `localStorage` + local `.json` import/export.
- No backend server, database, or secret API key is required.

Production URL: **[https://anujgtm1.github.io/Bookbinder/](https://anujgtm1.github.io/Bookbinder/)**

---

## Technical Setup & Notes

### 1. Vite Base Path (`/Bookbinder/`)
GitHub Pages serves project repositories under `/<repo-name>/`:
- `vite.config.ts` reads `base: process.env.VITE_BASE_PATH ?? '/'`.
- Local development (`pnpm dev`), local preview (`pnpm preview`), and Playwright tests serve cleanly at `/`.
- The GitHub Actions deploy workflow builds with `VITE_BASE_PATH=/Bookbinder/` (derived automatically by `actions/configure-pages@v5`).
- All curated `.woff` font assets (`?url` imports in `src/studio/fonts.ts`) and bundled `.svg` ornaments (`?raw` imports in `src/resources/ornaments/index.ts`) are automatically rewritten or inlined by Vite so production asset paths never 404.

### 2. Client-Side State & Refresh Behavior
- Workspace navigation (**Measure & Cut**, **Cover Studio**, **Inner Pockets**) is managed in client state without nested URL paths, so browser refreshes on `https://anujgtm1.github.io/Bookbinder/` never trigger GitHub Pages `404` responses.

### 3. Branch Protection & PR Workflow
- Direct pushes to `main` are blocked; work lands via PRs from `develop` → `main`.
- Deploying via the official **GitHub Actions Pages workflow** (`actions/deploy-pages`) builds and publishes straight from `main` merges without needing a separate `gh-pages` branch.

### 4. Compatibility with Future Local Affinity Bridge
- GitHub Pages serves over HTTPS. Modern browsers treat `http://127.0.0.1` / `http://localhost` as a potentially trustworthy loopback origin, so an optional local Affinity bridge (`docs/RESEARCH.md`) can still be called from the hosted GitHub Pages app once CORS headers are configured on the local bridge.

---

## CI/CD Workflows

### 1. PR Verification Workflow (`.github/workflows/ci.yml`)
Runs automatically on every pull request targeting `main` and push to `develop`:
1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test:coverage`
5. `pnpm exec playwright install --with-deps chromium` + `pnpm test:e2e`
6. `VITE_BASE_PATH=/Bookbinder/ pnpm build`

### 2. GitHub Pages Deploy Workflow (`.github/workflows/deploy.yml`)
Runs automatically on every push/merge to `main` (plus manual `workflow_dispatch`):
1. Permissions: `contents: read`, `pages: write`, `id-token: write`
2. Concurrency group: `pages` (`cancel-in-progress: false`)
3. Build job:
   - `pnpm install --frozen-lockfile`
   - `pnpm typecheck && pnpm lint && pnpm test`
   - `actions/configure-pages@v5`
   - `VITE_BASE_PATH=${{ steps.pages.outputs.base_path }}/ pnpm build`
   - `actions/upload-pages-artifact@v3` uploading `dist/`
4. Deploy job (`environment: github-pages`):
   - `actions/deploy-pages@v4`

---

## Repository Setup & Live Verification Checklist

- [x] **Settings → Pages → Source:** Configured to **GitHub Actions**.
- [x] **Branch Protection:** `main` protected via PR workflow (`develop` → `main`).
- [x] **Live Deployment:** Published and accessible at **[https://anujgtm1.github.io/Bookbinder/](https://anujgtm1.github.io/Bookbinder/)**.

### Quick Post-Release Smoke Checks (After Each Merge to `main`)
- [ ] App loads cleanly at `https://anujgtm1.github.io/Bookbinder/` with zero 404s in browser DevTools Network tab.
- [ ] Curated spine/cover fonts load and embed into Print PDFs and outline cleanly in Cricut HTV SVG exports.
- [ ] Unified PDF Export Dialog (`Print PDF`, `Cut PDF`, `Styled Pockets PDF`) renders live paper-fit previews and downloads valid 1-sheet and 2-sheet tiled PDFs.
- [ ] Light/dark theme toggle, project auto-save, and Series Design Presets persist across reloads.
