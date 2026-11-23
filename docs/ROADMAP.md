# Bookbinder Studio — Feature Roadmap & Tracker

Living tracker for completed features, active milestones, and upcoming work.
Related docs: [SPEC.md](./SPEC.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [RESEARCH.md](./RESEARCH.md)

---

## Completed

### Milestone 1 — Core Geometry Engine & Structural Templates (Phase 1)
- [x] **Domain Models (`src/types/`):** Strongly typed `UnitSystem`/`UnitConverter`, `BookParametersModel` (presets, clamping, validation, serialize/deserialize), `CaseGeometry`/`GeometryPrimitives`, and versioned `BookbinderProjectModel`.
- [x] **Pure Millimeter Geometry Engine (`src/core/geometry.ts`):** Exact chipboard cut list, 45°-mitered outer wrap polygon (`MITER_CUT_LEG = 2*TURN_IN - MITER_GAP*√2`), 3-piece quarter-bound split panels, portrait & 90°-rotated large-format roll width evaluator, inner spine reinforcement liner, and mirrored front/back slip-in pocket envelopes with 45°-mitered glue flaps.
- [x] **2 × 2 Structural Export Matrix (`src/core/svgExport.ts`, `src/core/pdfExport.ts`):**
  - Outer Case Wrap `.SVG` (`1:1` mm with named Affinity `<g>` layers) & `.PDF` (`1:1` mm vector print template, single or 3-piece).
  - Inner Pockets & Spine Liner `.SVG` (`1:1` mm Affinity/cutter layers) & `.PDF` (auto-paginated/auto-rotated across Letter/A4/Tabloid with `50 × 50 mm` calibration square).
- [x] **Workspace UI (`src/components/`):** Craft-meets-CAD light/dark theme (`modern-web-guidance` compliant), shadcn/ui + Radix primitives, `SidebarControls`, `CutListCard` (with Roll Printer badge & 9 mm hinge spacer SVG diagram), zoomable/pannable `BlueprintPreview`, and co-located workspace tabs.
- [x] **Persistence:** Automatic `localStorage` save with image-quota fallback + `.json` project export/import.

### Milestone 2 — Interactive Cover & Spine Styler (Phase 2)
- [x] **Free-Form Multi-Image Canvas (`src/studio/CoverStyler.tsx`, `src/types/studioLayer.ts`):** Upload/drop unlimited PNG/JPG/WEBP images, click to select, drag anywhere across the wrap, pull 4 corner resize handles proportionally, scroll to zoom, reorder layer stack, delete via keyboard or button, one-click `Fit Front` / `Fit Spine` / `Fit Back` / `Full Wrap`, and optional per-zone clip masks.
- [x] **Colors & Eyedropper:** Independent Back, Spine & Hinges, and Front base color pickers plus click-to-sample eyedropper mapped via SVG `getScreenCTM`.
- [x] **Spine Typography (`src/studio/fonts.ts`, `src/studio/SpineTypographyCard.tsx`):** Separate Title/Author inputs, Inline vs. Stacked presets, US/UK vs. European reading orientation, Vertical vs. Horizontal author writing toggle, 6 bundled offline `@fontsource/*` fonts, custom `.ttf`/`.otf`/`.woff`/`.woff2` `FontFace` uploader, automatic font-size clamping (`≤ SPINE_W - 4.0 mm`), and `±2.0 mm` optical horizontal nudge.
- [x] **Bindery Cutting Mat UI & Interactive 3D Book Preview (`src/studio/Book3DPreview.tsx`, `src/components/FloatingHudToolbar.tsx`):** Self-healing spruce cutting-mat workbench, warm cotton-rag paper sheets, kettle-stitch dividers, collapsible Book Spec rail, folder-style paper index tabs, accessible floating HUD pill toolbars, and a live rotatable CSS 3D folded hardcover book mockup rendered at exact `BOARD_W × BOARD_H × SPINE_W` proportions.
- [x] **Live Print Preflight Consistency Checker (`src/studio/preflight.ts`, `src/studio/PreflightCard.tsx`):** Real-time verification of front/back board & turn-in/bleed coverage gaps, effective print DPI, WCAG 2.1 spine text contrast, spine hinge clearance, and structural readiness—with preview-only red diagonal-hatched canvas warning zones and one-click Quick Fix actions.
- [x] **300 DPI Dual Exports (`src/studio/renderEngine.ts`):** Print-Ready Roll PDF (`outer_cover_print.pdf`) with embedded vector spine typography and cut-line vs. bleed-registration mark toggle; Affinity Round-Trip 300 DPI PNG (`outer_cover_300dpi.png`) and `1:1` mm SVG (`outer_cover_300dpi.svg`).

### Quality & Research
- [x] **Automated Test Suite:** 79 Vitest unit/component tests (~85% coverage) + 9 Playwright Chromium behavioral E2E tests covering real downloads, interactive canvas manipulation, collapsible rail, 3D book orbiting, and live preflight warning overlays/quick fixes.
- [x] **Affinity Connector Research:** Documented feasibility and architectures in [RESEARCH.md](./RESEARCH.md).
- [x] **Deployment Plan:** Documented GitHub Pages CI/CD plan in [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Active / Ready to Ship

### Milestone 3 — GitHub Pages Deployment & CI Pipeline
- [x] Add configurable `base: process.env.VITE_BASE_PATH ?? '/'` to `vite.config.ts` and inline SVG favicon to `index.html`.
- [x] Add `.github/workflows/ci.yml` to run typecheck, lint, Vitest coverage, Playwright E2E, and production build on PRs into `main`.
- [x] Add `.github/workflows/deploy.yml` to build (using `actions/configure-pages@v5` `base_path`) and deploy `dist/` to GitHub Pages on merge to `main`.
- [ ] Enable GitHub Pages (**Settings → Pages → Source: GitHub Actions**) and merge PR `develop` → `main`.

---

## Planned / Backlog

### Milestone 4 — Affinity Connector (see [RESEARCH.md](./RESEARCH.md))
- [ ] **Environment Spike:** Verify installed Affinity version (`Scripting Studio`, `affinity.d.ts`, MCP Server availability).
- [ ] **Phase A — Native Affinity Script Export:** Add `src/core/affinityScriptExport.ts` to generate a ready-to-run Affinity JS script creating a native 300 DPI document with true Document Bleed, snapping Ruler Guides, locked Cut/Guide layers, artwork layers, and editable spine Artistic Text.
- [ ] **Phase B — Local Companion Bridge:** Optional local bridge (`pnpm affinity-bridge`) enabling a one-click *"Send to Affinity"* button via Affinity MCP or macOS `open -a` fallback.

### Future Craft Enhancements (Ideas)
- [ ] Layer rotation & opacity controls on the interactive cover canvas.
- [ ] Snap-to-guide magnetism while dragging images near board/spine edges.
- [ ] Custom user-saved paperback presets library in `localStorage`.
- [ ] Printable assembly instruction sheet / folding guide.
