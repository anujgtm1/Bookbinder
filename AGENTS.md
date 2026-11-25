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
- **Subagent Delegation Workflow (Second-in-Command Orchestrator + Git Worktrees):**
  - Treat the main conversation as a lean **Second-in-Command Orchestrator** holding the big picture and user alignment — preserve main context window aggressively by delegating almost all file-heavy work to small, single-purpose subagents:
    - **Investigate / Diagnose:** Delegate bug root-cause tracing and broad codebase exploration to a `research` subagent returning a concise brief.
    - **Implement:** Launch each feature/refactor/fix (`> 30 lines`) in its own isolated git worktree (`.worktrees/<topic>`, branch `subagent/<topic>` off `develop`). Never combine unrelated tasks into one subagent.
    - **Independent Checker / Verifier:** Before the main orchestrator reads large diffs or raw test logs, delegate branch review (diff audit against `AGENTS.md` guardrails, `typecheck`/`lint`/`test`/`build`/Playwright E2E, and visual screenshot verification) to a fresh checker subagent that returns a concise pass/fail verdict.
  - Inside its worktree branch, each implementation subagent runs verification (`pnpm typecheck && pnpm lint && pnpm test`) and splits its work into tiny, separated Conventional Commits (`feat(...)`, `refactor(...)`, `test(unit):`, etc.).
  - When the checker clears a branch:
    - **Non-UI / Bugfix / Test branches:** Merge/cherry-pick cleanly into `develop`, delete the temporary worktree & `subagent/*` branch, and push `develop`.
    - **Major UI / Theme / Layout Overhauls (Visual Sign-Off Gate):** **Never** merge into `develop` until after visually verifying and starting a live local preview server from that worktree so the user can inspect and approve it first.
  - If a branch is off-spec, bloated, or fails checker review, discard it cleanly (`git worktree remove --force .worktrees/<topic> && git branch -D subagent/<topic>`) and relaunch a fresh subagent with sharper context.
  - **Tiny Fixes (`≤ 30 lines`):** Small, localized edits (`≤ 30 lines`) may be handled directly without delegation overhead.
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

2. **Declarative Resources — Zero Magic Strings (`src/resources/` & `src/assets/`):**
   - All paper sheet specs (`letter`, `a4`, `legal`, `tabloid`), wide-format rolls (`13"`–`44"` + `roll-custom`), paperback presets, and binding labels live in `src/resources/paperSpecs.json` and are accessed through `src/resources/paperSpecs.ts` (`getPrintMediaSpec`, `getPageSizeSpec`, `PRIMARY_SHEET_MEDIA_IDS`).
   - Pick the representation you need (`shortLabel`, `dimensionsLabel`, or `label`) from the canonical spec — do not hardcode `"US Legal"`, `"8.5 × 14"`, or millimeter sheet dimensions in components or exporters.
   - Static ornament SVG motifs belong as standalone `.svg` files in `src/resources/ornaments/*.svg` (loaded via Vite `?raw` + cached `parseSvgStampText`), and bespoke Tokyo Bindery Desk craft assets (`desk-walnut.jpg`, `washi-paper.jpg`, `atelier-colophon.jpg`) live in `src/assets/atelier/`.

3. **Background Bands vs. Artwork Fit/Clip Bounds (`src/studio/canvasSpec.ts`):**
   - Keep full-sheet background color bands (`backZoneRect`, `spineZoneRect`, `frontZoneRect`) separate from artwork fit & clip bounds (`backArtworkRect`, `spineArtworkRect`, `frontArtworkRect`).
   - On flap/glue-tab covers (`softcover-jacket`, `dust-jacket`), `Fit Front`/`Fit Back`, `front`/`back` clip masks, initial drops, and Preflight coverage checks MUST use `*ArtworkRect` so artwork frames the visible cover face without spilling onto tucked-in flaps or folded glue tabs, while solid base colors still seamlessly fill `*ZoneRect`.

4. **Physical Bookbinding & Studio Invariants (Do Not Break):**
   - **Softcover Wrap-Over Glue Tabs:** On `softcover-jacket` (both `integrated` and `separate` pocket modes), the 4 mitered `10 mm` glue tabs live on the outer top & bottom edges of the Back and Front covers so flaps/pockets sit flush underneath and preserve full `PB_H + 2.0 mm` vertical pocket clearance. Never place glue tabs inside the pocket height.
   - **Detached 2-Sheet Slip Pockets:** In `softcoverPocketMode: 'separate'`, the outer shell keeps the 4 wrap-over top/bottom tabs while the detached inner pockets are 6-vertex 1-flap fore-edge envelopes at full `PB_H + 2.0 mm` height.
   - **Folded Glue-In Endpapers (`interiorStyle: 'folded-endpapers'`):** On chipboard styles (`capabilities.usesChipboard`), folded endpapers emit a clean `2 × PB_W × PB_H` 4-vertex rectangle with zero glue flaps and one center fold score line separating mirrored `PASTEDOWN` / `FLYLEAF` halves.
   - **Flap-Depth Recommendations (`evaluateFlapDepth`):** Glued Slip Covers require `≥ max(35 mm, 35% × PB_W)`; unglued Classic Dust Jackets require `≥ max(45 mm, 45% × PB_W)`. Both inline slider warnings and Preflight (`flap-too-shallow`) read from `flapConfig`.
   - **Invertible Geometry Remapping (`src/studio/studioGeometryRemap.ts`):** Parameter, preset, and binding-style changes atomically remap `CoverTextLayer` & `CoverOrnamentLayer` against visible board rects (`outerWrap.*BoardRect + bleedMm`) and `CoverImageLayer` against `*ArtworkRect` using exact invertible area-preserving scaling (`sqrt((wB·hB)/(wA·hA))` for emblems/images, per-axis for frames/corners) so `A → B → A` round-trips return with `< 0.01 mm` drift and never corrupt `pocketStyle.layers` across boardless styles.
   - **3D Backface Culling (`src/studio/materialPreview.ts`, `Book3DPreview.tsx`):** Never use `mix-blend-mode != normal` or `opacity < 1` on CSS 3D `preserve-3d` faces — encode subtlety directly in `rgba(...)` stops so `backface-visibility: hidden` never breaks when swinging the 3D cover open.
   - **Cricut / Cutting-Machine SVG Hygiene (`src/studio/cricutExport.ts`):** Exported SVGs MUST have zero `<text>` tags, zero raster images, and zero `transform=` attributes — all font glyphs (`@pdf-lib/fontkit`), ornaments, flips (`flipX`/`flipY`), and rotations (`QuarterTurnDeg: 0 | 90 | 180 | 270`) are baked directly into absolute millimeter Bezier `<path>` coordinates.
   - **Unified PDF Export Flow:** Every PDF button across **Cover Studio**, **Measure & Cut**, and **Inner Pockets** opens `PdfExportDialog` (shared safe-box sheet centering with configurable asymmetric **Printer Margins** + 1-click **Margin Calibration Sheet PDF**, configurable `10/15/20 mm` 2-sheet tiling, **Custom Roll Width** + **Wide-Format Roll Multi-Up / Gang-Sheet Nesting** via `src/core/rollNesting.ts`, optional `50 mm` Scale-Check Ruler, `300/600 DPI`, `Full Cover` vs. `Base Only (For HTV)`, and optional Page 2 detached pockets via `src/core/pdfSheetLayout.ts`).

---

## 3. UI, Accessibility & Copy Conventions

- **Native Modal `<dialog>` Pattern (`PdfExportDialog`, `CricutExportDialog`):**
  - Use native `<dialog closedby="any">` opened via `showModal()` (with jsdom guard in tests).
  - Do **not** add `role="dialog"`, `aria-modal`, manual `Esc` listeners, manual focus traps, or `overflow: hidden` on `html`/`body`.
  - Keep `overscroll-behavior: contain` on `dialog:modal` and `overflow: hidden; overscroll-behavior: contain` on `dialog::backdrop` in `src/index.css`; scope `display: flex` strictly to `dialog.bindery-modal[open]`.
  - Include the Safari `!('closedBy' in HTMLDialogElement.prototype)` `pointerdown`+`pointerup` outside-rect light-dismiss fallback, and reset `dialog.returnValue = ''` inside `onClose`.
- **Light & Dark Theme Contrast (`light-dark()`):**
  - Never use Tailwind `dark:` utilities for warning/danger/success surfaces (they read OS `prefers-color-scheme` and leak bright yellow text onto light *washi* cards when the user manually overrides `<meta name="color-scheme">`). Always use the `light-dark()` semantic status classes (`.status-warning-surface`, `.status-warning-text`, `.status-danger-surface`, `.status-success-surface`) in `src/index.css`.
  - Preview surfaces that display dark `#111/#222` cut vectors (such as `CricutExportDialog`) must use the always-light `.cricut-mat-surface` so cut paths never turn dark-on-dark.
- **Contextual Canvas Selection Bar & Rotate 90° Controls:**
  - Keep `CanvasSelectionBar` docked as an `absolute` top overlay inside `#studio-mat-viewport` so selecting an element never shifts the SVG canvas between `pointerdown` and `click`.
  - Show contextual board-margin presets (`6 mm`, `12 mm`, `18 mm`, `Center`) for frame/corner ornaments and `Top ⅓ / Center / Bottom ⅓` for text, emblems, dividers, and images. Keep Rotate 90° buttons displaying a static `90°` label beside `<RotateCw />` (tracking angle in `data-rotation` rather than mutating button text to `180°`/`270°`).
- **Human-First Copy:** Keep UI labels, dialogs, badges, and `README.md` clear and direct — avoid repetitive CAD jargon like `1:1 mm`, `true-scale`, `actual size`, or `100%` everywhere (reserve `50 mm Scale Check` strictly for the printed calibration ruler/square).

---

## 4. Known Optional Cleanup Backlog (From Codebase Audit)

Current baseline: **57 Vitest test files (312 tests)** + **40 Playwright Chromium E2E tests** passing, 0 TypeScript errors, 0 ESLint warnings.

Optional follow-up refactors (not blocking, tackle only when touching these areas):
- `src/studio/preflight.ts` (~950 LOC) can be split into per-category rule modules (`src/studio/preflight/{resolution,coverage,typography,structure}Rules.ts`) if more rules are added.
- `src/studio/InnerPocketsStudio.tsx` (~1,000 LOC) can extract its 2D cutting-mat canvas stage into `src/studio/pockets/PocketCanvas2D.tsx`.
- Low-priority standalone unit tests (already exercised end-to-end by Playwright): `src/studio/ArtworkControlsCard.tsx`, `src/studio/SpineTypographyCard.tsx`, and `src/studio/LayerSelectionOverlay.tsx`.
