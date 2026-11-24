# Bookbinder Studio — Feature Roadmap & Tracker

Living tracker for completed features, active milestones, and upcoming work.
Live app: **[https://anujgtm.com/Bookbinder/](https://anujgtm.com/Bookbinder/)**
Related docs: [SPEC.md](./SPEC.md) · [DEVELOPMENT.md](./DEVELOPMENT.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [FEATURE_IDEAS.md](./FEATURE_IDEAS.md) · [RESEARCH.md](./RESEARCH.md)

---

## Completed

### Milestone 1 — Core Geometry Engine & Structural Templates (Phase 1)
- [x] **Domain Models (`src/types/`):** Strongly typed `UnitSystem`/`UnitConverter`, `BookParametersModel` (presets, clamping, validation, serialize/deserialize), `CaseGeometry`/`GeometryPrimitives`, and versioned `BookbinderProjectModel`.
- [x] **Pure Millimeter Geometry Engine (`src/core/geometry.ts`):** Exact chipboard cut list, 45°-mitered outer wrap polygon (`MITER_CUT_LEG = 2*TURN_IN - MITER_GAP*√2`), 3-piece quarter-bound split panels, portrait & 90°-rotated desktop-sheet and large-format roll width evaluator, inner spine reinforcement liner, and mirrored front/back slip-in pocket envelopes with 45°-mitered glue flaps.
- [x] **2 × 2 Structural Export Matrix (`src/core/svgExport.ts`, `src/core/pdfExport.ts`):**
  - Outer Case Wrap `.SVG` (`1:1` mm with named Affinity `<g>` layers) & `.PDF` (`1:1` mm vector print template, single, 3-piece, centered single-sheet, or 2-sheet tiled).
  - Inner Pockets & Spine Liner `.SVG` (`1:1` mm Affinity/cutter layers) & `.PDF` (auto-paginated/auto-rotated across Letter/A4/Legal/Tabloid with optional `50 × 50 mm` calibration square & legend).
- [x] **Workspace UI (`src/components/`):** Craft-meets-CAD light/dark atelier theme (`modern-web-guidance` compliant), shadcn/ui + Radix primitives, `SidebarControls`, `CutListCard` (with Roll/Home-Sheet badge & 9 mm hinge spacer SVG diagram), zoomable/pannable `OuterBlueprintCanvas`, and co-located workspace tabs.
- [x] **Persistence:** Automatic `localStorage` save with image-quota fallback + `.json` project export/import.

### Milestone 2 — Interactive Cover & Spine Styler (Phase 2)
- [x] **Free-Form Multi-Image Canvas (`src/studio/CoverStyler.tsx`, `src/types/studioLayer.ts`):** Upload/drop unlimited PNG/JPG/WEBP/SVG images, click to select, drag anywhere across the wrap, pull 4 corner resize handles proportionally, scroll to zoom, reorder layer stack, delete via keyboard or button, zone-aware `Fit Front` / `Fit Spine` / `Fit Back` / `Full Wrap`, Flip H/V, and per-zone clip masks.
- [x] **Colors & Eyedropper:** Independent Back, Spine & Hinges, and Front base color pickers plus click-to-sample eyedropper mapped via SVG `getScreenCTM`.
- [x] **Spine & Cover Typography (`src/studio/fonts.ts`, `src/studio/SpineTypographyCard.tsx`, `src/studio/CoverTextCard.tsx`):** Separate Spine Title/Author inputs (Inline vs. Stacked, US/UK vs. European reading orientation, Vertical vs. Horizontal author), plus unlimited draggable Cover Text blocks (`+ Text` with direct inline list renaming synced `1:1` with the cover, plus Front Title / Front Author / Back Blurb presets), 6 bundled offline `@fontsource/*` fonts, custom `.ttf`/`.otf`/`.woff`/`.woff2` `FontFace` uploader, automatic spine font clamping, and `±2.0 mm` optical nudge.
- [x] **17 Classic Foil Ornaments & Custom SVG Stamps (`src/resources/ornaments/`, `src/studio/ornaments/`, `src/studio/svgStampParser.ts`):** Bundled SVG & parametric frames, corner flourishes, dividers, emblems, and 6 spine motifs, plus custom `.svg` stamp import with `Fill` / `Outline` / `Fill + Thicken` line-weight control, 4-corner resize, Flip H/V, and 1-click Margin Fit presets (`Tight 6 mm`, `Classic 12 mm`, `Wide 18 mm`, `Center`).
- [x] **3-Tab Hybrid Workbench, 3D Book Preview & Full-Page Focus Mode (`src/App.tsx`, `src/studio/Book3DPreview.tsx`, `src/hooks/useFullPageCanvas.ts`):** Dedicated **Measure & Cut**, **Cover Studio** (with 6-tab Tool Dock), and **Inner Pockets** tabs, full-screen canvas expansion (`Esc` to exit), openable interactive CSS 3D book preview, and seamless tiled endpaper patterns.
- [x] **Turn-In Edge Extension & Magnetic Safe-Margin Snap Guides (`src/studio/edgeExtend.ts`, `src/studio/snapGuides.ts`):** Non-destructive `Edge Smear` / `Soft Mirror` / `Mirror` pasting-stub synthesis + live `3.5 mm` magnetic alignment snapping onto board centers, safe margins, spine lines, and bleed edges.
- [x] **Reusable Series Design Presets (`src/types/designPreset.ts`, `src/core/presetStorage.ts`, `src/studio/DesignPresetsCard.tsx`):** Dimension-independent normalized presets with 4 starter series themes, `localStorage` persistence, and portable `.json` export/import.

### Milestone 3 — 5 Binding Styles, Unified Export Dialog, Hybrid Cricut HTV & GitHub Pages Launch
- [x] **Open/Closed Binding Style Strategy Registry (`src/core/bindingStyles.ts`) & 5 Cover Styles:**
  - **Rigid 3-Board Hardcover**, **Flexible-Spine 2-Board**, **Fold-and-Glue Slip Cover** (both **1-Piece Integrated Flaps** with 4 wrap-over glue tabs AND **Separate Glue-In Pockets 2-Sheet** mode unlocking detached 1-flap pockets on Sheet 2 / Page 2), **Classic Dust Jacket** (4 vertical folds, `20–100 mm` flaps, zero glue tabs), and **Replacement Paperback Cover** (flush 1-piece cardstock wrap, 2 spine score folds).
  - Centralized declarative specs in `src/resources/paperSpecs.json` powering consistent labels and physical dimensions everywhere.
- [x] **Quarter-Turn Rotation (`Rotate 90°`) & Flip Controls:** Added `Rotate 90°` (`0° → 90° → 180° → 270°`) beside `Flip H` / `Flip V` across Outer Cover Artwork, Cover Text, Classic Ornaments & Custom SVG Stamps, and Inner Pocket Artwork (including rotated seamless tiles, baked Cricut curves, PDF CTM transforms, and Series Presets).
- [x] **Unified Native `<dialog>` Print & Export PDF Dialog (`src/components/PdfExportDialog.tsx`, `src/components/PdfSheetPreviewSvg.tsx`, `src/core/pdfSheetLayout.ts`):**
  - Wired to all 5 PDF buttons across Cover Studio, Measure & Cut, and Inner Pockets.
  - Live paper-fit cards (`US Letter`, `A4`, `US Legal`, `Tabloid`, `Exact Wrap Size`, `13"–44"` rolls), live 1-sheet centered & 2-sheet tiled preview, 1-click **Detach Flaps → 1-Sheet + Separate Pockets** fix & **Include Detached Pockets (Page 2)** toggle, configurable `10 / 15 / 20 mm` overlap + alignment crosshairs, optional `50 mm` Scale-Check Ruler, `300 / 600 DPI`, `Cut, Fold & Glue Guides` vs. Registration Marks Only, `Single Wrap` vs. `3-Piece Split`, and Inner Pockets auto-pagination (`Letter / A4 / Legal / Tabloid`).
- [x] **Live Preflight & Smart Flap-Depth Guardrails (`src/studio/preflight.ts`):** Coverage gaps, optional DPI checks, WCAG spine contrast, paper-fit overflow & tiling checks, and flap-depth recommendations (`≥ 35%` / `35 mm` for glued Slip Covers; `≥ 45%` / `45 mm` for unglued Dust Jackets) shown both inline beside the flap slider and in Preflight with canvas highlights & 1-click fixes.
- [x] **Cricut / Silhouette / ScanNCut HTV & Hybrid Printed Base Workflow (`src/studio/cricutExport.ts`, `src/studio/CricutExportDialog.tsx`):**
  - Flattened glyph & ornament paths (zero `<text>` tags or `transform` attributes), 4 cut scopes, weeding box, registration marks, HTV Mirror, always-light high-contrast carrier mat preview, **Split Mats by Foil Color**, and **Base Only (For HTV)** Print PDF (`outer_cover_base_for_htv.pdf`) with `3 mm` outer alignment ticks + 1-click handoff from the Cricut dialog.
- [x] **Modular Architecture Refactor:** Decomposed `CoverStyler`, `InnerPocketsStudio`, `CoverElementsCard`, and `renderEngine` into cohesive `src/lib/`, `src/resources/`, `src/studio/exporters/`, `src/studio/ornaments/`, `src/studio/pockets/`, and `src/studio/hooks/` modules.
- [x] **GitHub Pages CI/CD & Live Deployment:** `.github/workflows/ci.yml` + `.github/workflows/deploy.yml` live at **[https://anujgtm.com/Bookbinder/](https://anujgtm.com/Bookbinder/)**.
- [x] **Automated Test Suite:** **44 Vitest test files / 199 unit & component tests** + **31 Playwright Chromium E2E tests** covering every major user workflow and real PDF/SVG downloads.

---

## Planned / Backlog

### Milestone 4 — Affinity Connector (see [RESEARCH.md](./RESEARCH.md))
- [ ] **Environment Spike:** Verify installed Affinity version (`Scripting Studio`, `affinity.d.ts`, MCP Server availability).
- [ ] **Phase A — Native Affinity Script Export:** Add `src/core/affinityScriptExport.ts` to generate a ready-to-run Affinity JS script creating a native 300 DPI document with true Document Bleed, snapping Ruler Guides, locked Cut/Guide layers, artwork layers, and editable spine Artistic Text.
- [ ] **Phase B — Local Companion Bridge:** Optional local bridge (`pnpm affinity-bridge`) enabling a one-click *"Send to Affinity"* button via Affinity MCP or macOS `open -a` fallback.

### Next Craft Enhancements (see [FEATURE_IDEAS.md](./FEATURE_IDEAS.md))
- [ ] **Folded Glue-In Endpapers** mode alongside Removable Slip-In Pockets for traditional paperback-to-hardcover rebinds.
- [ ] **Bradel Binding** & **Rounded / Backed Spine Arc** calculators.
- [ ] **Matching Slipcase Box** `1:1 mm` cut list & wrap generator.
- [ ] **Spine Thickness Estimator** (from page count & paper GSM/PPI) with measured-block confirmation reminder.
- [ ] **Printable Bench Recipe Card & Reusable Cutting Jigs** (exact hinge spacer & 45° corner miter gauge in PDF whitespace).
- [ ] **Layer Rotation & Opacity** controls on the outer cover canvas + 1-click **Load Sample Book** showcase mode.
