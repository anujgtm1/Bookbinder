# Deployment Guide: GitHub Pages

## Can Bookbinder Studio Deploy to GitHub Pages?

**Yes — 100%.** Bookbinder Studio is a pure client-side static Vite + React application:
- All geometry calculations, SVG generation, 300 DPI canvas compositing, and `pdf-lib` PDF generation run entirely in the browser.
- All 6 curated literary fonts (`@fontsource/*`) are bundled as static assets inside `dist/` (no runtime external font CDNs required).
- Project auto-save uses browser `localStorage` + local `.json` import/export.
- There is no backend server, database, or secret API key required.

Target URL for this repository: `https://anujgtm1.github.io/Bookbinder/`

---

## Technical Requirements & Gotchas

### 1. Vite Base Path (`/Bookbinder/`)
GitHub Pages serves project repositories under a subpath (`/<repo-name>/`) rather than root (`/`).
- Update `vite.config.ts` to read an environment variable with a safe local default:
  ```ts
  base: process.env.VITE_BASE_PATH ?? '/',
  ```
- Local development (`pnpm dev`), local preview (`pnpm preview`), and Playwright tests continue to serve at `/`.
- The GitHub Actions deploy workflow builds with `VITE_BASE_PATH=/Bookbinder/`.
- Because all curated `.woff` font assets in `src/studio/fonts.ts` use Vite `?url` imports, Vite automatically rewrites every asset URL to `/Bookbinder/assets/...`—preventing broken font fetches in production.

### 2. Client-Side Routing & Refresh Behavior
- The app manages workspace tabs (`Structural Templates` / `Cover & Spine Styler`) in client state without nested URL paths, so browser refreshes on `https://anujgtm1.github.io/Bookbinder/` never trigger GitHub Pages `404` responses.

### 3. Branch Protection Compatibility
- Because direct pushes to `main` are blocked and changes land via PRs from `develop` → `main`, deploying via the official **GitHub Actions Pages workflow** (`actions/deploy-pages`) works seamlessly without needing a separate `gh-pages` branch or force-push permissions.

### 4. Compatibility with Future Local Affinity Bridge
- GitHub Pages serves over HTTPS. Modern browsers treat `http://127.0.0.1` / `http://localhost` as a potentially trustworthy loopback origin, so an optional local Affinity bridge (`docs/RESEARCH.md`) can still be called from the hosted GitHub Pages app once CORS headers are configured on the local bridge.

---

## CI/CD Workflows (Implemented)

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
   - `actions/configure-pages@v5` (automatically derives `base_path` for `/Bookbinder/` or a future custom domain)
   - `VITE_BASE_PATH=${{ steps.pages.outputs.base_path }}/ pnpm build`
   - `actions/upload-pages-artifact@v3` uploading `dist/`
4. Deploy job (`environment: github-pages`):
   - `actions/deploy-pages@v4`

---

## One-Time GitHub Repository Setup Checklist

Before the first deployment succeeds on GitHub:
1. Open **Repository Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. (Optional) Under **Repository Settings → Rules / Branch protection**, require the `ci` workflow check to pass before merging PRs into `main`.
4. (Optional) If switching to a custom domain later, add the custom domain in **Settings → Pages**, include a `public/CNAME` file, and set `VITE_BASE_PATH=/`.

---

## Post-Deploy Smoke Checklist
- [ ] App loads cleanly at `https://anujgtm1.github.io/Bookbinder/` with zero 404s in browser DevTools Network tab.
- [ ] All 6 curated spine fonts load and embed into `outer_cover_print.pdf` (verifying `/Bookbinder/assets/*.woff` paths resolve).
- [ ] All four Phase 1 structural downloads (`outer_case_wrap.svg`, `outer_case_wrap.pdf`, `inner_pockets_and_liner.svg`, `inner_pockets_and_liner.pdf`) succeed.
- [ ] Phase 2 multi-image drag/resize, eyedropper, and 300 DPI exports succeed.
- [ ] Light/dark theme toggle and `localStorage` auto-save persist across page reloads.
