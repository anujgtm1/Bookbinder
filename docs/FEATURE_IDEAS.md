# Bookbinder — Feature Ideas & Craft Roadmap (r/bookbinding & Hobbyist Research)

A prioritized backlog of feature ideas gathered from **r/bookbinding** discussions, **DAS Bookbinding** tutorials, and paperback-rebind hobby guides — filtered specifically for what complements Bookbinder's strength as a **1:1 mm structural case calculator + rapid cover & endpaper studio**.

---

## Tier 1 — High-Impact Wins for Hobby Binders (Biggest Audience Appeal)

### 1. [Shipped] Cricut / Silhouette / ScanNCut HTV & Foil SVG Export
- **Implemented in:** `src/studio/cricutExport.ts`, `src/studio/CricutExportDialog.tsx`, `src/components/PdfExportDialog.tsx`.
- Includes flattened `1:1 mm` glyph & ornament paths (zero `<text>` tags), 4 cut scopes (`Spine`, `Front`, `Back`, `Full Wrap`), weeding box, corner alignment marks, HTV Mirror toggle, always-light carrier mat preview, **Split Mats by Foil Color**, and the **Hybrid Printed Base + HTV Foil** workflow (`Base Only (For HTV)` PDF with `3 mm` outer alignment ticks + 1-click handoff).

### 2. [Shipped] Grain Direction Arrows on Every Blueprint & Print Sheet
- **Implemented in:** `src/components/OuterBlueprintCanvas.tsx`, `src/studio/pockets/PocketBlueprintDimensions.tsx`, `src/core/svgExport.ts`, `src/core/pdfExport.ts`.
- Renders `↕ GRAIN DIRECTION` arrows parallel to the spine across outer blueprints, inner pockets, and spine liners (rotating automatically with 90° sheet pagination).

### 3. [Shipped] Front & Back Cover Typography + Classic Clothbound Frames
- **Implemented in:** `src/studio/CoverTextCard.tsx`, `src/studio/ClassicDesignsCard.tsx`, `src/studio/ornaments/`, `src/resources/ornaments/`, `src/studio/svgStampParser.ts`, `src/studio/DesignPresetsCard.tsx`.
- Includes generic `+ Text` with inline list renaming synced `1:1` with the cover, Front/Back presets, custom `.ttf`/`.otf`/`.woff` font upload, 17 classic foil frames/corners/dividers/emblems/spine motifs, custom SVG stamp import (`Fill` / `Outline` / `Fill + Thicken`), Safe-Margin Snap Guides + Fit presets, Flip H/V, and Reusable Series Design Presets.

### 4. [Shipped] Permanent Glue-In Endpapers Option (Alongside Removable Slip-In Pockets)
- **Implemented in:** `src/core/geometry.ts`, `src/core/pdfExport.ts`, `src/core/svgExport.ts`, `src/studio/InnerPocketsStudio.tsx`, `src/studio/pockets/PocketPieceSvg.tsx`, `src/studio/pockets/PocketBlueprintDimensions.tsx`.
- Adds an **Interior Style** toggle on the Inner tab switching cleanly between **`Removable Slip-In Pockets`** and **`Folded Glue-In Endpapers`** (`pastedown + flyleaf` double-width sheets with center fold score lines and mirrored `PASTEDOWN` / `FLYLEAF` annotations), reusing the full drag-and-drop & seamless Tile Pattern studio and SVG/PDF exporters.

### 5. [Shipped] Dust Jacket Generator Mode (+ Replacement Paperback Cover)
- **Implemented in:** `src/core/bindingStyles.ts` (`dust-jacket` and `paperback-wrap` strategies), `src/components/SidebarControls.tsx`, `src/studio/preflight.ts`.
- Classic Dust Jacket wraps over an existing cover with `+1.0 mm` fore-edge ease, `+1.5 mm` spine ease, flush height, 4 vertical score folds, zero glue tabs, adjustable `20–100 mm` flaps, and smart flap-depth recommendations (`≥ 45%` / `45 mm` floor). Also shipped **Replacement Paperback Cover** (flush 1-piece cardstock wrap with 2 spine score folds).

---

## Tier 2 — Intermediate Bindery Structures & Math Calculators

### 6. Bradel Binding Mode
- **Why binders ask for it:** Popularized heavily by DAS Bookbinding and r/bookbinding as cleaner and more forgiving than standard case binding — you glue the spine strip and boards to a thin paper/card connector strip *first*, test-fit the hinges on the book, and wrap cloth afterward.
- **What it would do:**
  - Add **`Bradel Binding`** to the Binding Style picker, outputting the exact **Bradel Spine Wrapper Strip** cut piece (`spine + 2 × hinge + 2 × 20 mm board lap`) alongside the cover boards and wrap.

### 7. Rounded & Backed Spine Arc Calculator
- **Why binders ask for it:** Sewn text blocks are often rounded with a hammer so the spine becomes a shallow circular arc instead of a flat rectangle; beginners constantly miscalculate the curved spine width.
- **What it would do:**
  - Add an optional **`Rounded Spine`** toggle with a rounding-depth / arc slider (or standard `1.10–1.18×` arc multiplier), updating `SPINE_W`, the spine stiffener card (flexible cardstock instead of rigid greyboard), and rendering a visibly curved spine in the 3D Book Preview.

### 8. [Shipped] Matching Slipcase Box Calculator (Cut List & Wrap)
- **Implemented in:** `src/core/slipcaseGeometry.ts`, `src/core/slipcaseExport.ts`, `src/components/SlipcaseCard.tsx`.
- Expandable **Matching Slipcase** calculator on the Measure & Cut tab computed directly from the finished hardcover's outer dimensions (`BOARD_W × BOARD_H × CASE_THICKNESS + clearance`), with live slide-clearance and thumb-notch radius sliders, 5-panel chipboard cut table, live SVG arc preview, and cut-ready `matching_slipcase.svg` / `matching_slipcase.pdf` exports.

### 9. Spine Thickness Estimator (From Page Count & Paper GSM / PPI)
- **Why binders ask for it:** People planning a typeset book *before* printing often want a ballpark spine width from page count and paper weight (e.g., 320 pages of 80 gsm cream paper).
- **What it would do:**
  - A tiny optional **"Estimate from page count"** helper popover next to `PB_THICK` (with an explicit craft warning echoing r/bookbinding consensus: *"Use for rough planning only — always measure the actual pressed text block before cutting board!"*).

---

## Tier 3 — Home-Printer & Bench Ergonomics

### 10. [Shipped] Tiled Poster Print Mode (Letter / A4 Desktop Printers)
- **Implemented in:** `src/core/pdfSheetLayout.ts`, `src/components/PdfExportDialog.tsx`, `src/components/PdfSheetPreviewSvg.tsx`.
- Unified Print & Export PDF Dialog compares `US Letter`, `A4`, `US Legal`, `Tabloid`, `Exact 1:1`, and `13"–44"` rolls with live `1 sheet` vs. `2 sheets (tiled)` fit badges, configurable `10 / 15 / 20 mm` overlap + alignment crosshairs, and an optional `50 mm` Scale-Check Ruler bar.

### 11. [Shipped] Printable "Bench Recipe Card" & Step-by-Step Cut Checklist
- **Implemented in:** `src/core/benchRecipePdf.ts`, `src/components/MeasureAndCutPanel.tsx`.
- One-click **Bench Recipe & Jigs PDF** (`bindery_bench_recipe_and_jigs.pdf`) listing exact chipboard cuts, grain direction, spacer width, corner miter gap, and a check-off assembly sequence right at the bench.

### 12. [Shipped] Printable Cutting Jigs (Corner Miter Gauge + Hinge Spacer Strips)
- **Implemented in:** `src/core/benchRecipePdf.ts`, `src/components/MeasureAndCutPanel.tsx`.
- Bundled inside `bindery_bench_recipe_and_jigs.pdf` with exact-width cut-out **hinge spacer strips** (`HINGE_W`) and an exact-clearance **45° corner miter gauge** (`MITER_GAP = BOARD_T × MITER_FACTOR`) ready to glue onto scrap chipboard.

### 13. [Shipped] Visual Material & Foil Preview + 1-Click Demo Book (Showcase Polish)
- **Implemented in:** `src/resources/sampleProject.ts`, `src/studio/materialPreview.ts`, `src/studio/CoverStyler.tsx`, `src/studio/Book3DPreview.tsx`.
- Includes a 1-click **Sample Book** loader (*Twenty Thousand Leagues Under the Seas* clothbound cover + marbled endpapers) plus non-printing 2D/3D **Matte Paper**, **Bookcloth Linen**, and **Pebbled Leather** surface shaders and metallic **Gold / Silver / Copper Foil** sheen previews.

---

## Intentional Scope Guardrails (What *Not* to Build)
To keep Bookbinder fast, focused, and joyful rather than bloated:
- **Skip full text-block signature imposition** — excellent dedicated open-source tools already exist for that (`bookbinder-js`, `Wynkyn`), and linking to them as companion tools is far better than duplicating them.
- **Skip heavy photo-editing / brush tools** — keep our 1:1 mm Affinity / Inkscape SVG & 300 DPI PNG round-trip exports crisp for users who want complex illustration workflows.
