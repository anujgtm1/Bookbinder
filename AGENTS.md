# Bookbinder Studio — Agent & Contributor Guide

Essential architectural guardrails, bookbinding invariants, and workflow conventions for working in this repository.
For user docs see [`README.md`](./README.md); for module layout & scripts see [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md); for formulas see [`docs/SPEC.md`](./docs/SPEC.md).

---

## 1. Git & Release Workflow

- **Branching:** Work on `develop` only. Direct pushes to `main` are blocked by repository rules — changes ship to `main` via PR (`develop` → `main`).
- **Live Production URL:** `https://anujgtm.com/Bookbinder/` (deployed via `.github/workflows/deploy.yml` with `VITE_BASE_PATH=/Bookbinder/`).
- **Tiny, Separated Commits (Law of Small Atomic Commits):**
  - Keep commits tiny, focused, and independently green — never bundle mixed concerns into one commit.
  - Separate different types of changes into distinct commits using Conventional Commit prefixes:
    - Types & domain models (`feat(types):`)
    - Core geometry / business logic (`feat(core):`)
    - Exporters & renderers (`feat(exporters):`)
    - UI components (`feat(ui):` / `feat(studio):`)
    - Pure refactors (`refactor(...):`) — never mix behavior changes with structural refactors
    - Unit & E2E tests (`test(unit):`, `test(e2e):`)
    - Docs, specs & screenshots (`docs(readme):`, `docs(spec):`, `docs(screenshots):`)
- **Periodic Big-Picture Refactor Cadence (Every ~15–20 Commits):**
  - After every ~15–20 commits, pause and review the architecture holistically — not just file-by-file:
    - If a recent feature was awkward or touched too many files to add, treat that as a design smell and refactor toward a cleaner pattern (e.g., Strategy/Registry, shared lib, or Geometry IR).
    - Check whether modules should be split or combined, extract shared utilities into `src/lib/`, and pull static data/assets/magic strings out into `src/resources/`.
    - Audit end-to-end user-flow test coverage (`e2e/` + Vitest) and close any gaps before starting the next feature wave.
- **Subagent Delegation Workflow (Git Worktrees + Branch Review):**
  - Keep the main conversation lean by acting as an orchestrator: delegate multi-file features, architecture refactors, broad codebase audits, and test-hardening passes to focused subagents with tight, explicit file scopes.
  - Launch each subagent in its own isolated git worktree (`Workspace: 'share'`) on a dedicated short-lived branch created off `develop` (e.g., `subagent/<topic>`). Parallel subagents should still target disjoint file scopes so merges stay conflict-free.
  - Inside its worktree branch, each subagent runs verification (`pnpm typecheck && pnpm lint && pnpm test`) and splits its own work into tiny, separated Conventional Commits (`feat(...)`, `refactor(...)`, `test(unit):`, etc.) before reporting back.
  - When control returns to the main agent, review the subagent's commits and diff (`git log --stat develop..subagent/<topic>` and `git diff develop..subagent/<topic>`):
    - If everything makes sense and meets architectural guardrails, integrate the branch into `develop` (prefer linear rebase/fast-forward or clean cherry-pick/merge), delete the temporary `subagent/*` branch, run the integrated Verification Gate (`typecheck`, `lint`, `test`, `build`, and Playwright E2E), and push `develop`.
    - If a branch is off-spec, bloated, or introduces regressions, discard the branch cleanly (`git branch -D subagent/<topic>`) and relaunch a fresh subagent with sharper context instead of patching bad output onto `develop`.
  - Handle trivial 1–2 file fixes or targeted lookups directly without unnecessary delegation overhead.
- **Verification Gate:** Before pushing feature or refactor work, run:
  ```bash
  pnpm typecheck && pnpm lint && pnpm test && pnpm build
  pnpm exec playwright test
  ```
  *(Playwright E2E starts Vite on `127.0.0.1:4173` and needs loopback port binding + Chromium.)*

---

## 2. Core Architectural Rules

1. **Open/Closed Binding Style Strategy Registry (`src/core/bindingStyles.ts`):**
   - Every binding structure (`rigid-case`, `flexible-spine`, `softcover-jacket` integrated & separate pockets, `dust-jacket`, `paperback-wrap`) registers declaratively in `src/core/bindingStyles.ts` and is resolved via `resolveBindingStrategy(paramsOrGeometry)`.
   - Strategies emit a backend-neutral Geometry IR (`outerCutPolygon`, `foldLines`, `jacketGlueTabPolygons`, board/spine rects, `capabilities`, `panelLabels`, `flapConfig`, `innerPocketsNotice`, `materialNote`, `buildExportNote`).
   - **Never** scatter `bindingStyle === '...'` conditionals across UI components, SVG/PDF exporters, or preflight rules — add a capability flag or descriptor property to `BindingStyleStrategy` instead.
   - If future cover shapes ever need curved cutouts (e.g. thumb notches), extend the Geometry IR with backend-neutral vector path primitives rather than having strategies emit raw SVG strings, since 6 consumers (SVG, PDF, Canvas, 2D editor, 3D preview, Preflight) all share the IR.

2. **Declarative Resources — Zero Magic Strings (`src/resources/`):**
   - All paper sheet specs (`letter`, `a4`, `legal`, `tabloid`), wide-format rolls (`13"`–`44"`), paperback presets, and binding labels live in `src/resources/paperSpecs.json` and are accessed through `src/resources/paperSpecs.ts` (`getPrintMediaSpec`, `getPageSizeSpec`, `PRIMARY_SHEET_MEDIA_IDS`).
   - Pick the representation you need (`shortLabel`, `dimensionsLabel`, or `label`) from the canonical spec — do not hardcode `"US Legal"`, `"8.5 × 14"`, or millimeter sheet dimensions in components or exporters.
   - Static ornament SVG motifs belong as standalone `.svg` files in `src/resources/ornaments/*.svg` (loaded via Vite `?raw` + cached `parseSvgStampText`).

3. **Background Bands vs. Artwork Fit/Clip Bounds (`src/studio/canvasSpec.ts`):**
   - Keep full-sheet background color bands (`backZoneRect`, `spineZoneRect`, `frontZoneRect`) separate from artwork fit & clip bounds (`backArtworkRect`, `spineArtworkRect`, `frontArtworkRect`).
   - On flap/glue-tab covers (`softcover-jacket`, `dust-jacket`), `Fit Front`/`Fit Back`, `front`/`back` clip masks, initial drops, and Preflight coverage checks MUST use `*ArtworkRect` so artwork frames the visible cover face without spilling onto tucked-in flaps or folded glue tabs, while solid base colors still seamlessly fill `*ZoneRect`.

4. **Physical Bookbinding Invariants (Do Not Break):**
   - **Softcover Wrap-Over Glue Tabs:** On `softcover-jacket` (both `integrated` and `separate` pocket modes), the 4 mitered `10 mm` glue tabs live on the outer top & bottom edges of the Back and Front covers so flaps/pockets sit flush underneath and preserve full `PB_H + 2.0 mm` vertical pocket clearance. Never place glue tabs inside the pocket height.
   - **Detached 2-Sheet Slip Pockets:** In `softcoverPocketMode: 'separate'`, the outer shell keeps the 4 wrap-over top/bottom tabs while the detached inner pockets are 6-vertex 1-flap fore-edge envelopes at full `PB_H + 2.0 mm` height.
   - **Flap-Depth Recommendations (`evaluateFlapDepth`):** Glued Slip Covers require `≥ max(35 mm, 35% × PB_W)`; unglued Classic Dust Jackets require `≥ max(45 mm, 45% × PB_W)`. Both inline slider warnings and Preflight (`flap-too-shallow`) read from `flapConfig`.
   - **Cricut / Cutting-Machine SVG Hygiene (`src/studio/cricutExport.ts`):** Exported SVGs MUST have zero `<text>` tags, zero raster images, and zero `transform=` attributes — all font glyphs (`@pdf-lib/fontkit`), ornaments, flips (`flipX`/`flipY`), and rotations (`QuarterTurnDeg: 0 | 90 | 180 | 270`) are baked directly into absolute millimeter Bezier `<path>` coordinates.
   - **Unified PDF Export Flow:** Every PDF button across **Cover Studio**, **Measure & Cut**, and **Inner Pockets** opens `PdfExportDialog` (shared sheet centering, configurable `10/15/20 mm` 2-sheet tiling, optional `50 mm` Scale-Check Ruler, `300/600 DPI`, `Full Cover` vs. `Base Only (For HTV)`, and optional Page 2 detached pockets via `src/core/pdfSheetLayout.ts`).

---

## 3. UI, Accessibility & Copy Conventions

- **Native Modal `<dialog>` Pattern (`PdfExportDialog`, `CricutExportDialog`):**
  - Use native `<dialog closedby="any">` opened via `showModal()` (with jsdom guard in tests).
  - Do **not** add `role="dialog"`, `aria-modal`, manual `Esc` listeners, manual focus traps, or `overflow: hidden` on `html`/`body`.
  - Keep `overscroll-behavior: contain` on `dialog:modal` and `overflow: hidden; overscroll-behavior: contain` on `dialog::backdrop` in `src/index.css`; scope `display: flex` strictly to `dialog.bindery-modal[open]`.
  - Include the Safari `!('closedBy' in HTMLDialogElement.prototype)` `pointerdown`+`pointerup` outside-rect light-dismiss fallback, and reset `dialog.returnValue = ''` inside `onClose`.
- **Dark Mode Contrast:** Preview surfaces that display dark `#111/#222` cut vectors (such as `CricutExportDialog`) must use the always-light `.cricut-mat-surface` so cut paths never turn dark-on-dark.
- **Human-First Copy:** Keep UI labels, dialogs, badges, and `README.md` clear and direct — avoid repetitive CAD jargon like `1:1 mm`, `true-scale`, `actual size`, or `100%` everywhere (reserve `50 mm Scale Check` strictly for the printed calibration ruler/square).

---

## 4. Known Optional Cleanup Backlog (From Codebase Audit)

Current baseline: **44 Vitest test files (199 tests)** + **31 Playwright Chromium E2E tests** passing, 0 TypeScript errors, 0 ESLint warnings.

Optional follow-up refactors (not blocking, tackle only when touching these areas):
- `src/studio/preflight.ts` (~950 LOC) can be split into per-category rule modules (`src/studio/preflight/{resolution,coverage,typography,structure}Rules.ts`) if more rules are added.
- `src/studio/InnerPocketsStudio.tsx` (~1,000 LOC) can extract its 2D cutting-mat canvas stage into `src/studio/pockets/PocketCanvas2D.tsx`.
- Low-priority standalone unit tests (already exercised end-to-end by Playwright): `src/studio/ArtworkControlsCard.tsx`, `src/studio/SpineTypographyCard.tsx`, and `src/studio/LayerSelectionOverlay.tsx`.
