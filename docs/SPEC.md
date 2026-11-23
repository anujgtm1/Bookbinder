# Project Specification: Hardcover Slip-Cover Case & Pocket Generator

## 1. Overview & Purpose
A client-side web application for DIY bookbinders to generate exact 1:1 millimeter-accurate templates for **removable hardcover slip-cover cases** (outer case wrap + inner spine reinforcement liner + front/back slip-in pocket envelopes) designed to house existing paperbacks without damaging or removing their original covers.

- **Core Architecture Philosophy:** Clean separation between the **Pure Geometry & Template Engine** (`src/core/geometry.ts`) and the decoupled **Cover & Spine Styler Module** (`src/studio/`), allowing fast, friction-free cover composition in-browser while preserving seamless export compatibility with Affinity and large-format roll printers.
- **Target Workflow:**
  1. Enter paperback dimensions (`Height/Length`, `Width`, `Spine Thickness`) and verify material defaults (`9.0 mm` hinge spacer, `2.0 mm` chipboard).
  2. Review exact chipboard cutting dimensions, minimum large-format roll printer width (checking both portrait and 90°-rotated feed orientations), and the interactive blueprint (with a visual reminder to use the `9 mm` hinge spacer).
  3. **Phase 1 Exports (Structural Templates):**
     - **Outer Case Wrap SVG** (`1:1` physical `mm` scale with 45° corner miters, optional bleed frame, and vector placement guides) for import into Affinity.
     - **Inner Envelopes & Spine Liner PDF** (`1:1` physical `mm` scale laid out on US Letter / A4 / Tabloid sheets with a `50 × 50 mm` calibration square, cut lines, score lines, and 45° flap miters).
  4. **Phase 2 Exports (Decoupled Cover & Spine Styler):**
     - Drag-and-drop cover image onto the front cover (or full wrap), pan/zoom to align, sample matching colors for the spine/back, add auto-centered spine typography (Title + Author), and export either a **300 DPI Print-Ready PDF** for roll printing or a **300 DPI PNG / SVG** for deeper editing in Affinity.

---

## 2. Module Architecture (Separation of Concerns)

```text
src/
├── core/
│   ├── geometry.ts        # Pure math engine: calculates CaseGeometry, CutList, and RollWidth
│   ├── svgExport.ts       # Generates 1:1 physical mm SVG for Outer Case Wrap (single or 3-piece)
│   ├── pdfExport.ts       # Generates 1:1 physical mm paginated PDF for Pocket Envelopes & Spine Liner
│   └── storage.ts         # localStorage auto-save + JSON project export/import
├── studio/                # Decoupled Phase 2 Cover & Spine Compositor
│   ├── CoverStyler.tsx    # Lightweight drag/pan/zoom UI + spine typography controls
│   └── renderEngine.ts    # Offscreen 300 DPI canvas compositor + pdf-lib vector/raster export
└── components/
    ├── SidebarControls.tsx
    ├── CutListCard.tsx    # Chipboard cut list, roll size badge, and 9mm spacer visual diagram
    └── BlueprintPreview.tsx
```

---

## 3. Units, Inputs & Default Parameters

### 3.1 Unit System
- **Default Unit:** Millimeters (`mm`), stored internally in `mm` at full floating-point precision.
- **Optional Toggle:** Inches (`in`) conversion toggle (`1 in = 25.4 mm`) for user input convenience; all file exports remain strictly `1:1` physical millimeter scale.

### 3.2 Primary Inputs (Paperback Dimensions)
- `PB_H` — Paperback Height / Length (default: `216.0 mm` / `8.5 in`)
- `PB_W` — Paperback Width (default: `140.0 mm` / `5.5 in`)
- `PB_THICK` — Paperback Spine Thickness (default: `24.0 mm`)
- **Quick Presets Dropdown:**
  - Mass Market Paperback (`106.0 × 174.0 mm`)
  - US Trade Digest (`139.7 × 215.9 mm` / `5.5 × 8.5 in`)
  - US Trade Standard (`152.4 × 228.6 mm` / `6.0 × 9.0 in`)
  - Manga / B6 (`128.0 × 182.0 mm`)
  - A6 Pocket Notebook (`105.0 × 148.0 mm`, minimum thickness supported down to `2.0 mm`)

### 3.3 Binding Style & Construction Defaults
- **`BINDING_STYLE` (selectable in Book Spec Rail):**
  1. **`rigid-case` — Rigid 3-Board Hardcover Case (Default, recommended ≥ 8 mm):** 2 Cover Boards + 1 Rigid Spine Strip, two `9.0 mm` hinge channels, `18.0 mm` mitered turn-ins, and separate Inner Pockets + Spine Liner.
  2. **`flexible-spine` — Flexible Spine 2-Board Hardcover (recommended 3–8 mm thin notebooks):** 2 Cover Boards (`0` rigid spine strip). Replaces `hinge + rigid spine + hinge` with one unified flexible spine channel (`FLEX_SPINE_W = PB_THICK + BOARD_T * 2 + 2.0 mm`, `effectiveHinge = 0`) reinforced by the inner spine liner so thin notebooks open smoothly without hinge shear stress.
  3. **`softcover-jacket` — Fold-and-Glue Slip Cover (0-Board, 1-Piece Printable Sheet):** `0` chipboard pieces and no separate inner pocket sheets required. Uses snug slip ease (`COVER_W = PB_W + 1.0 mm`, `COVER_H = PB_H + 2.0 mm`, `SPINE_W = PB_THICK + 1.0 mm`) plus integrated left & right slip-in pocket flaps (adjustable `20–65 mm` via the **Slip Flap Width** slider with **`Fit Letter`**, **`Fit A4`**, and **`Deep (38 mm)`** quick presets; defaults to `clamp(PB_W * 0.23, 24, 48) mm`, e.g. `24.2 mm` on A6 so the entire `266.4 × 170.0 mm` sheet fits on **1× US Letter / A4 home-printer sheet**, while deeper flaps up to ~`38 mm` fit **US Legal** or larger) and **4 mitered wrap-over glue tabs** (`TAB_H = 10 mm`) on the outer top & bottom edges of the Back and Front covers. Folding the side flaps inward first and gluing the blank reverse of the 4 tabs down *over* the flaps preserves the full `PB_H + 2.0 mm` vertical pocket opening with zero glue inside the pocket. When `Cut & Fold Lines` are enabled on Print PDF, a concise 1-2-3 fold-and-glue instruction strip prints inside the top cut-off waste margin so it trims cleanly away after cutting.
- `BOARD_T` — Chipboard Thickness (default: `2.0 mm` / ~80 pt)
- `HINGE_W` — Hinge Spacer Width (default: `9.0 mm`)
- `OVERHANG_TB` — Top & Bottom Board Overhang total (default: `7.0 mm`, i.e., `3.5 mm` top + `3.5 mm` bottom)
- `OVERHANG_FORE` — Fore-edge Board Overhang (default: `3.0 mm`)
- `SPINE_ALLOWANCE` — Extra Spine Width Allowance for removable pocket clearance (default: `1.0 × BOARD_T`, adjustable)
- `TURN_IN` — Outer Wrap Turn-In Margin (default: `18.0 mm`)
- `MITER_FACTOR` — Corner Miter Gap Multiplier (default: `1.5 × BOARD_T` clearance from board corner)
- `BLEED` — Outer Artwork Bleed Margin (default: `3.0 mm`, toggleable on/off)
- `POCKET_DEPTH_PCT` — Inner Pocket Width Ratio (default: `72%` of `BOARD_W`, slider `65%–80%`)
- `POCKET_FLAP` — Pocket Glue Flap Width (default: `12.0 mm`)
- `SPLIT_MODE` — Default: `Single-Piece Continuous Wrap` (optimized for large-format roll printers). Secondary toggle: `3-Piece / Quarter-Bound Split` (separate Front, Back, and Spine wraps for standard desktop sheet printers).
- `PRINT_MEDIA` — User's target printer media / paper size (`exact-auto` default, or desktop sheets `letter` `8.5×11"`, `a4` `210×297 mm`, `legal` `8.5×14"`, `tabloid` `11×17"`, or large-format rolls `roll-13`, `roll-17`, `roll-24`, `roll-36`, `roll-44`):
  - When a desktop sheet is selected and the cover fits, **Print PDF (300 DPI)** and **Cut-Only Outer PDF** output on an exact centered sheet page (auto-oriented Portrait or Landscape at strict `1:1 mm` / 100% scale).
  - When a cover exceeds the selected desktop sheet, **Print Preflight** flags a paper-fit error with smart 1-click Quick Fixes: shrink softcover flaps to fit the sheet (when `≥ 22 mm` flaps fit), switch to a larger compatible sheet/roll, switch to **Flexible Spine + Separate Inner Pockets + 3-Piece Split**, or export a **Tiled 2-Sheet PDF** (with a `10 mm` glue/tape overlap strip and alignment crosshairs).

---

## 4. Core Geometry & Calculation Engine (`src/core/geometry.ts`)

### 4.1 Chipboard Cut List (Exact Output)
- **Cover Boards (Qty: 2 — Front & Back):**
  - `BOARD_W = PB_W + OVERHANG_FORE`
  - `BOARD_H = PB_H + OVERHANG_TB`
- **Spine Strip (Qty: 1):**
  - `SPINE_W = PB_THICK + SPINE_ALLOWANCE`
  - `SPINE_H = BOARD_H`

### 4.2 Outer Case Wrap Geometry
- `INNER_W = (BOARD_W * 2) + (HINGE_W * 2) + SPINE_W`
- `WRAP_W = INNER_W + (TURN_IN * 2)`
- `WRAP_H = BOARD_H + (TURN_IN * 2)`
- **45° Mitered Corner Polygon:**
  - `MITER_GAP = BOARD_T * MITER_FACTOR` (perpendicular clearance outside each chipboard corner)
  - `MITER_CUT_LEG = max(0, 2 * TURN_IN - MITER_GAP * √2)` (45° corner bevel leg measured along each outer wrap edge from the outer corner)
  - 8-point outer cut polygon beveling all four outer corners at 45° so folded turn-ins meet cleanly without overlapping chipboard corners or exposing raw board tips.
- **3-Piece / Quarter-Bound Split Panels (when `SPLIT_MODE = 3-Piece`):**
  - Spine wrap width = `SPINE_W + (HINGE_W * 2) + (QUARTER_BOUND_OVERLAP * 2)` (default `QUARTER_BOUND_OVERLAP = 20.0 mm`), height = `WRAP_H` (includes top/bottom `TURN_IN`).
  - Front & Back cover panels: each covers the remaining board face (`BOARD_W - QUARTER_BOUND_OVERLAP + 3.0 mm` lap overlap) plus outer fore-edge, top, and bottom `TURN_IN` with 45° miters on the two outer fore-edge corners.
- **Roll Printer Width Recommendation:**
  - Evaluates standard roll widths (`13" / 330 mm`, `17" / 432 mm`, `24" / 610 mm`, `36" / 914 mm`, `44" / 1118 mm`) minus `10.0 mm` total unprintable side margin (`5.0 mm` per edge).
  - Checks both **Unrotated Feed** (`WRAP_W` across roll width) and **90°-Rotated Landscape Feed** (`WRAP_H` across roll width) and recommends the narrowest compatible roll plus orientation (e.g., *"Fits on a 17" roll (rotated 90°) with 163 mm spare width"*).

### 4.3 Inner Spine Reinforcement Liner
- `LINER_W = SPINE_W + (HINGE_W * 2) + 30.0` (spans spine + both hinges + `15.0 mm` overlap onto each inner board)
- `LINER_H = BOARD_H - 2.0` (`1.0 mm` inset top & bottom)
- Includes dashed vertical score lines marking the spine and hinge boundaries.

### 4.4 Slip-In Pocket Envelopes (Qty: 2 — Front & Back)
- `POCKET_W = BOARD_W * (POCKET_DEPTH_PCT / 100)`
- `POCKET_H = BOARD_H - 2.0` (`1.0 mm` inset top & bottom)
- Glue flaps (`POCKET_FLAP = 12.0 mm`) on top, bottom, and outer fore-edge only; spine-facing vertical edge remains open (no flap).
- Outer corners of top/bottom/fore-edge flaps mitered at 45° to prevent double-layer bulk when folded behind the pocket face.

---

## 5. UI / UX & Visual Components

### 5.1 Aesthetic & Layout Architecture ("Bindery Cutting Mat" + "Folio Workbench")
- **Visual Theme ("Bindery Cutting Mat"):**
  - Pairs a deep spruce-teal self-healing cutting-mat drafting surface (`#1B3A34` light / `#112420` dark) with subtle dual-scale millimeter grid lines against warm cotton-rag paper control sheets (`#F8F4EC` / `#1C1917`), lampblack ink (`#231F1B` / `#F3EDE2`), antique brass foil (`#C59B48`), and vermilion cut-line (`#C84B31`) accents.
  - Display headings use `EB Garamond`, UI labels use `Inter`, and all millimeter/inch readouts use `tabular-nums` monospace typography for jitter-free editing.
  - Respects `prefers-reduced-motion` (opting into spatial transitions inside `@media (prefers-reduced-motion: no-preference)`) and dual-mode `color-scheme` (`light-dark()` with fallbacks).
- **Folio Workbench Layout:**
  - **Compact Single-Row Header:** Brand wordmark, collapsible Book Spec Rail toggle, live status readout, and light/dark theme toggle.
  - **Collapsible Left Book Spec Rail (`SidebarControls.tsx`):** Can be collapsed on demand to expand the drafting cutting mat edge-to-edge:
    - Unit toggle (`mm` / `in`) + Preset selector
    - Paperback Dimensions (`H`, `W`, `Spine Thickness`)
    - Collapsible "Construction & Hinge Settings" (`9.0 mm` hinge spacer, board thickness, turn-in, pocket depth %, bleed, 3-piece split toggle)
    - PDF Page Size selector for Inner Envelopes (`US Letter 8.5×11"`, `A4`, `Tabloid 11×17"`)
    - Project Save/Load (`Export .json` / `Import .json` + automatic `localStorage` persistence)
  - **3-Tab Hybrid Folio Workbench (Workflow Tabs + Compact Studio Tool Dock):**
    - **Tab 1 — `Measure & Cut`:** Dedicated clutter-free structural workbench for chipboard, leather, bookcloth, and paper cutting. Houses the full **Chipboard Cut List & Assembly Diagram** (`CutListCard.tsx`), full-bleed `1:1 mm` interactive CAD **Outer Blueprint Canvas** (45° miters, board guides, `9 mm` hinges, 3-piece split panels, zoom/pan, **Manual-Cutting CAD Dimension Lines**, running **Cumulative Steel-Ruler Datum Strip**, **45° Miter Callout**, and **Grain Direction** arrow), plus direct **Cut-Only SVG** and **Cut-Only PDF** downloads.
    - **Tab 2 — `Cover Studio` (Default Active Tab):** Focused interactive design studio with the live cutting-mat canvas (`Styled Cover` / `Blueprint` / `3D Book` HUD switcher), 300 DPI `Print PDF`, `PNG`, `Affinity SVG`, and `Cricut / HTV SVG` exports, plus a slim live sheet-fit spec badge. Directly beneath the canvas sits a single **Compact Tabbed Studio Tool Dock** (`Artwork & Fill` · `Cover Text` · `Classic Designs` · `Spine` · `Preflight`) with live count/status badges—eliminating long vertical scrolling while keeping every tool 1 click away (and auto-switching to the matching tab when selecting any image, text block, or ornament on the canvas).
    - **Tab 3 — `Inner Pockets`:** Full-bleed cutting-mat canvas for the mirrored Front/Back slip-in pockets and Spine Reinforcement Liner (`Styled Pockets` & `Blueprint` HUD switcher, CAD dimensions, endpaper color + `Match Cover Color`, drag/drop/resize/snap artwork, `Tile Pattern`, and Styled/Cut PDF & SVG exports). When **`Fold-and-Glue Slip Cover (0-Board, 1 Sheet)`** is active, the tab displays a **`Built-In`** badge (auto-switching back to `Cover Studio`) and explains that separate inner pockets are not required for the 1-piece slip cover.
    - **Full-Page Canvas Focus Mode (`useFullPageCanvas.ts`):** Every cutting-mat canvas (`Measure & Cut` Blueprint, `Cover Studio` 2D/Blueprint/3D, and `Inner Pockets` Styled/Blueprint) includes a 1-click **`Full Screen`** toggle in its `FloatingHudToolbar` that expands the interactive stage edge-to-edge across the entire viewport (`fixed inset-0 z-50 h-dvh w-screen`) with full drag/resize/orbit/zoom/drop support and instant `Esc` or button dismissal.

---

## 6. Phase 1 Export Specifications

### 6.1 Outer Case Wrap Exports (`outer_case_wrap.svg` & `outer_case_wrap.pdf`)
- **SVG (`outer_case_wrap.svg`):** Root `<svg>` explicitly defines physical millimeter dimensions (`width="{WRAP_W}mm" height="{WRAP_H}mm" viewBox="0 0 {WRAP_W} {WRAP_H}"`, expanding symmetrically when bleed is enabled) so Affinity Designer/Publisher/Photo opens it at exact `1:1` physical scale without DPI scaling errors. Organized into clean named `<g id="...">` groups (`cut-lines`, `board-guides`, `bleed-box`, `dimensions-notes`) so guide layers can be locked or toggled before printing.
- **PDF (`outer_case_wrap.pdf`):** Generated client-side via `pdf-lib` at exact `1:1` physical millimeter scale (`1 mm = 2.83465 pt`) for both Single-Piece Continuous Wrap (roll-size page) and 3-Piece Quarter-Bound Split (3 exact panels), including the 45°-mitered cut polygon, dashed blue board/hinge guides, optional bleed frame, and a `50.0 mm × 50.0 mm` scale verification note.

### 6.2 Inner Envelopes & Spine Liner Exports (`inner_pockets_and_liner.pdf` & `inner_pockets_and_liner.svg`)
- **PDF (`inner_pockets_and_liner.pdf`):** Generated client-side via `pdf-lib` in exact millimeter coordinates (`1 mm = 2.83465 pt`).
  - **Auto-Pagination & Rotation:** Automatically arranges Front Pocket, Back Pocket, and Spine Liner across 1 or 2 pages depending on selected sheet size (`Letter`, `A4`, or `Tabloid`), automatically rotating pieces 90° if needed to prevent clipping.
  - **Optional Calibration Square & Visual Legend (Off by Default):** Users can toggle **`Print Legend`** on when exporting either Styled or Cut PDF to include the `50.0 mm × 50.0 mm` scale verification square (*"Verify 50mm × 50mm — Print at 100% / Actual Size"*) and cut/score/glue visual legend on Page 1. Keeping it off by default maximizes printable piece density per sheet.
- **SVG (`inner_pockets_and_liner.svg`):** Exact `1:1` physical millimeter vector layout of Back Pocket, Spine Liner, Front Pocket, and `50 × 50 mm` calibration square organized into named `<g id="...">` groups (`glue-flaps`, `cut-lines`, `score-lines`, `dimensions-notes`) for Affinity or electronic cutting machines.

---

## 7. Phase 2 Specification: Decoupled Cover & Spine Styler (`src/studio/`)

### 7.1 Design Scope & Constraints
- Lightweight interactive layer-based compositor consuming `CaseGeometry` read-only from `geometry.ts`—intentionally focused on rapid cover artwork composition, spine typography, and print-ready export without duplicating full vector illustration tools.

### 7.2 Interactive Canvas & Controls
- **Free-Form Multi-Image Layer Stack (`layers: CoverImageLayer[]`):**
  - Upload or drag-and-drop **any number of images** (`PNG`, `JPG`, `WEBP`) directly onto the outer wrap canvas (e.g., front cover art, back cover art, spine artwork, emblems, textures, or a full-wrap panoramic image).
  - **Direct Canvas Manipulation:**
    - Click any image to select it (showing selection frame and 4 corner resize handles).
    - **Drag anywhere** across the wrap to position freely in millimeter coordinates.
    - **Drag corner handles** (or use mouse wheel / scale slider) to resize proportionally.
    - **Magnetic Smart Snap Guides (`src/studio/snapGuides.ts`):** While dragging or corner-resizing cover artwork, layers gently snap within `3.5 mm` to Front/Back board edges & centers, Spine edges & centerline, Turn-In cut boundaries, and Bleed edges—illuminating live golden-brass alignment guidelines and target badges on the canvas (toggleable via Floating HUD `Snap` or bypassed on the fly while holding `Alt`).
  - **Layer Stack & Quick-Fit Helpers:**
    - Reorder layers (bring forward / send backward), remove individual layers, or reset.
    - One-click **Quick Fit** presets for the selected layer (`Fit Front`, `Fit Spine`, `Fit Back`, `Fit Full Wrap`) automatically apply the matching **Clip to Zone** mask (`Front`, `Spine`, `Back`, or `None`) so cover artwork never spills across the spine after resizing book dimensions—and automatically re-synthesize active pasting-stub extensions for the updated book size.
  - **Turn-In / Pasting Stub Edge Extension (`src/studio/edgeExtend.ts`):**
    - Allows downloaded front-only (or back-only) covers to stay **100% uncropped on the chipboard face (`BOARD_W × BOARD_H`)** while automatically synthesizing seamless artwork across the surrounding **18 mm turn-in pasting stub + bleed** on Top, Bottom, and Fore-Edge (and optionally matching Spine & Back base colors to the spine-facing edge).
    - Supports three client-side canvas synthesis modes (non-destructive via preserved `originalDataUrl` so users can switch modes or revert to `None` at any time):
      - **`Edge Smear`:** Samples an inset perimeter strip (skipping 1–3 px scanner/JPEG border artifacts) and stretches each edge's exact colors/gradients smoothly across the turn-in + bleed with bilinear corner blends—preventing mirrored text or cropped borders.
      - **`Soft Mirror`:** Reflects the outer edges of the artwork across the turn-in + bleed with subtle feathering for organic paintings, clouds, and textures.
      - **`Mirror`:** Crisp gallery-wrap reflection along each edge.
    - Also surfaced directly as a one-click Quick Fix (`Extend Edges to Stub`) in the Print Preflight checker when a cover covers the board face but stops short of the outer turn-in/bleed.
- **Back Cover & Spine Background Fill:**
  - Solid color pickers for Back Cover, Spine, and Front base backgrounds (visible wherever no image is placed), plus an **Eyedropper Tool** to sample a matching color directly from the preview artwork.
- **Spine Typography:**
  - Separate **Spine Title** and **Spine Author** text inputs.
  - Layout preset: **Inline** (`Title — Author` centered along spine) vs. **Stacked** (`Title` upper-center, `Author` near bottom of spine).
  - Orientation toggle: **Top-to-Bottom (US/UK standard)** vs. **Bottom-to-Top (European standard)**.
  - **Author Orientation toggle:** **Vertical** (matches spine reading direction) vs. **Horizontal** (classic clothbound horizontal author block centered near the tail of the spine, auto-wrapping multi-word names and clamping width within `SPINE_W - 4.0 mm`).
  - Font selector: Curated classic literary serifs/sans-serifs (*EB Garamond, Libre Baskerville, Cormorant Garamond, Lora, Inter, Montserrat*) + **Custom Font Uploader** (`.ttf`, `.otf`, `.woff2` via `FontFace` API).
  - Automatic font-size clamping so text height never exceeds `SPINE_W - 4.0 mm` (preventing text from spilling into the `9 mm` hinge grooves), paired with a **`±2.0 mm` Optical Horizontal Nudge** slider.
- **Interactive 3D Folded Book Preview (`Book3DPreview.tsx`):**
  - Toggleable right inside the Cover & Spine Styler's floating HUD (`2D Flat Wrap` ↔ `3D Book Preview`).
  - Renders a physically proportioned CSS 3D volume using exact `BOARD_W × BOARD_H × SPINE_W` ratios, mapping the live Front Cover, Spine (with live vertical/horizontal typography and subtly curved styling for `flexible-spine`), and Back Cover artwork onto the 3D book faces alongside cream paper page-block edges inset inside the cover overhang.
  - Supports free pointer drag-to-orbit (`Yaw` / `Pitch`), keyboard arrow rotation, one-click angle presets (`Front 3/4`, `Spine`, `Back 3/4`, `Front`), and an **Open Cover / Close Cover** toggle that hinges the front board open (`rotateY(-118deg)`) to reveal the live styled **Inner Front Pocket** (endpaper color, positioned artwork, or tiled pattern) and first cream page inside.

### 7.3 Dual High-Resolution Exports (Exact `WRAP_W × WRAP_H` Physical Scale)
1. **Print-Ready Roll PDF (`outer_cover_print.pdf`):**
   - Composited at **300 DPI** (`pixels = mm / 25.4 * 300`) for uploaded raster artwork, with true vector typography and cut/fold marks via `pdf-lib`.
   - **Cut & Fold Lines Toggle (On by Default):**
     - *On (`full-cut-miter`, Default):* Overlays hairline red outer cut lines (including 45° corner miters) plus subtle dashed fold/score lines for turn-ins, board edges, spine hinges, and softcover tuck flaps so printed sheets can be cut and folded straight off the printer.
     - *Off (`bleed-registration`):* Keeps only outer corner registration/crop marks in the bleed zone with zero lines over the artwork.
2. **Affinity Round-Trip Export (`outer_cover_300dpi.png` / `.svg`):**
   - Exports the composed 300 DPI flat cover + centered spine strip at exact `1:1` millimeter scale so it can be dropped straight into Affinity for advanced graphic textures, foil overlays, or custom back-cover layouts.

### 7.4 Preflight & Print Consistency Verification System (`src/studio/preflight.ts`, `PreflightCard.tsx`)
- Real-time, pure pre-print audit evaluating `BookParameters`, `CaseGeometry`, and `CoverStudioState` for common bookbinding and print-production pitfalls:
  - **Cover & Turn-In / Bleed Coverage Gaps:** Detects when a cover artwork layer (covering ≥ 35% of the Front or Back board—avoiding false alarms on small centered emblems/medallions) leaves an uncovered strip on the board face or stops short of the outer turn-in / bleed edge. Computes exact uncovered gap rectangles (`Rect2D[]`) in canvas millimeter coordinates.
  - **Off-Canvas Layers:** Flags any layer whose bounds fall completely outside the printable wrap area.
  - **Effective Print Resolution (DPI — Optional):** Computes `min(naturalWidth / widthIn, naturalHeight / heightIn)` for every placed layer (showing the maximum physical size that stays 300 DPI); flags `< 150 DPI` as **Error** and `150–239 DPI` as **Warning**. Can be toggled on/off anytime via the **DPI Check** toggle in `PreflightCard`.
  - **Per-Warning Dismissal (`Ignore for now`):** Individual Preflight warnings/errors can be dismissed via an **Ignore** button (clearing their canvas highlights immediately) with a one-click **Restore** action when ignored items exist.
  - **Spine Typography Legibility & Clearance:**
    - Computes WCAG 2.1 relative luminance contrast between `spineText.textColor` and `spineBgColor` when no artwork covers the spine (`< 3.0:1` Error, `< 4.5:1` Warning).
    - Flags font sizes auto-clamped to `SPINE_W - 4.0 mm` (hinge safety), narrow-spine horizontal author text (`< 6.5 pt`), and overly long spine titles risking top/bottom board edge overflow.
  - **Structural & Binding Style Recommendations:** Checks whether outer artwork bleed is enabled when artwork layers exist, whether single-piece wrap fits standard roll widths, surfaces parameter validation errors/warnings, and provides physics-based one-click recommendations:
    - Thin books (`PB_THICK < 8 mm`) on `rigid-case` → recommend switching to **Flexible Spine (2-Board)**.
    - Thick books (`PB_THICK ≥ 18 mm`) on `flexible-spine` or `softcover-jacket` → recommend **Rigid 3-Board Spine**.
    - Pocket-width books (`PB_W ≤ 115 mm`) using thick `≥ 2.0 mm` board on hardcover styles → recommend pocket proportions (`1.5 mm` board, `14 mm` turn-in, `1.5 mm` fore-edge overhang).
- **Visual Canvas Overlays & One-Click Fixes:**
  - Preview-only red diagonal-hatched warning zones (`#EF4444`) and crimson outlines render directly on the 2D interactive cover canvas over uncovered strips, low-DPI layers, or low-contrast spines (never included in exported PDF/PNG/SVG files).
  - Toggleable via the Floating HUD (`Preflight`) and spotlighted when hovering or focusing an individual issue in `PreflightCard`.
  - Actionable issues provide one-click fixes (e.g. `Fit Front`, `Fit Back`, `Enable 3 mm Bleed`, `Switch to Vertical`, `High-Contrast Ink`).

### 7.5 Shared Interactive Layer Canvas & Inner Pockets Artwork (`useInteractiveLayers.ts`, `LayerSelectionOverlay.tsx`, `InnerPocketsStudio.tsx`)
- Both the **Outer Case Wrap** and **Inner Pockets & Liner** tabs share a unified interactive layer engine (`useInteractiveLayers` + `LayerSelectionOverlay`) so both sides of the book work identically—differing only in their underlying physical shapes and zone clip masks:
  - **Drag-and-Drop Upload:** Dropping `PNG`, `JPG`, or `WEBP` files directly onto either cutting mat places them right over the target piece/zone where they were dropped.
  - **Direct Manipulation:** Click to select, drag freely in 1:1 mm coordinates with live golden-brass **Magnetic Smart Snap Guides**, drag any of the 4 corner handles to resize proportionally, scroll-wheel to scale, or press `Backspace`/`Delete` to remove.
  - **Inner Pockets Shape Helpers:** Quick-Fit presets (`Fit Back Pocket`, `Fit Front Pocket`, `Fit Spine Liner`, `Fit All Pieces`), one-click **Copy to Other Pocket** (mirrors a layer cleanly between Front & Back pockets), a one-click **Tile Pattern** toggle on any selected layer (turning any swatch into a seamless repeating endpaper pattern whose repeat size and offset respond live to corner-handle resizing and dragging), plus `Pocket Faces Only` vs `Full Cut Envelope` clip scope and opacity control.
  - **Exact 300 DPI PDF Compositing (`pocketRenderEngine.ts`):** All positioned inner pocket layers composite at exact 1:1 mm alignment onto each auto-paginated (and 90°-rotated if needed) sheet underneath vector cut/score/glue lines.

### 7.6 Cricut / Silhouette / ScanNCut HTV & Foil SVG Export (`src/studio/cricutExport.ts`, `CricutExportDialog.tsx`)
- Dedicated cutting-machine vector exporter designed for **Cricut Design Space**, **Silhouette Studio**, and **Brother CanvasWorkspace (ScanNCut)** so binders can cut Heat Transfer Vinyl (HTV), foil iron-on lettering, or bookcloth wraps without font-substitution or scaling errors:
  - **True Vector Glyph Outlines (Zero `<text>` Tags, Zero `transform` Attributes):** Parses the active curated `.woff` font or custom uploaded `.ttf`/`.otf`/`.woff` font client-side via `@pdf-lib/fontkit`, lays out properly kerned glyphs, and bakes every curve (`M/L/Q/C/Z`) into flattened absolute millimeter coordinates inside a single compound `<path id="spine-lettering" />`.
  - **Strict `1:1 mm` Physical Scaling:** Root `<svg>` explicitly specifies `width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}"` with zero embedded rasters, filters, or gradients.
  - **Export Options Modal (Native `<dialog closedby="any">` with live preview & mat compatibility badges):**
    - **Scope:** `Spine Strip Only` (`SPINE_W × BOARD_H`), `Front Cover Only` (`BOARD_W × BOARD_H`), `Back Cover Only` (`BOARD_W × BOARD_H`), or `Full Cover Wrap` (`WRAP_W × WRAP_H`).
    - **Weeding Box (`+4 mm`):** Tight cut box around outlined lettering and classic ornaments for effortless HTV weeding.
    - **Alignment Corner Marks:** Thin closed-path L-brackets at exact spine/board corners for dead-center HTV transfer onto wrapped bookcloth.
    - **Outer Wrap Cut Outline:** Optional separate-color `#D93829` outer cut polygon (with 45° miters or fold-and-glue tabs) for cutting bookcloth or cardstock directly on a cutting machine.
    - **Mirror Horizontally (HTV Iron-On):** Optional horizontal coordinate flip (off by default to avoid double-mirroring with Cricut Design Space's *Make It → Mirror* toggle).

### 7.7 Cover Typography Layers, Classic Bookbindery Vector Library & SVG Stamps (`src/types/coverElements.ts`, `src/studio/classicOrnaments.ts`, `src/studio/CoverElementsCard.tsx`)
- **Draggable Front, Back & Spine Text Layers (`textLayers: CoverTextLayer[]`):**
  - Add unlimited editable multi-line text blocks directly onto the Front Cover, Back Cover, or Spine via one-click classic presets (*Front Title*, *Front Author*, *Back Blurb*) or custom placement.
  - Supports free pointer dragging in 1:1 mm coordinates with live golden-brass **Magnetic Smart Snap Guides** (snapping cleanly to `FRONT CENTER`, `BACK CENTER`, `SPINE CENTER`, and board margins), plus quick-align presets (*Upper ⅓*, *Center*, *Lower ⅓*).
  - Configurable font family (all curated literary serifs/sans-serifs + direct **Custom Font Uploader** `.ttf`/`.otf`/`.woff`/`.woff2` right inside the Cover Text panel, shared seamlessly with Spine Typography), font size (`7–96 pt`), letter spacing / tracking (`-0.05` to `0.40 em`), line height, uppercase transform, alignment (`Left / Center / Right`), **Flip Horizontal / Flip Vertical**, and ink/foil color.
  - Renders identically across the 2D Interactive Canvas, 3D Book Preview, 300 DPI Print PDF (as true vector PDF typography), Affinity SVG, and **Cricut / Silhouette / ScanNCut HTV SVG** (baked via `@pdf-lib/fontkit` into flattened `1:1 mm` Bezier `<path>` curves).
- **Horizontal & Vertical Flip (`flipX` / `flipY`):** Available as 1-click **`Flip H`** (`↔`) and **`Flip V`** (`↕`) controls on **Artwork Images** (Outer Cover & Inner Pockets), **Classic Ornaments & Custom SVG Stamps**, and **Cover Text Layers**, honored consistently across 2D Canvas, 3D Preview, 300 DPI Print PDF, Affinity SVG, and Cricut HTV SVG.
- **Parametric Classic Bookbindery Vector Ornament Library & Custom SVG Stamps (`ornaments: CoverOrnamentLayer[]`, `src/studio/svgStampParser.ts`):**
  - Built-in library of 17 timeless single-color vector book motifs generated parametrically in `1:1 mm` (never distorting across A6, Digest, or Trade book sizes):
    - **Cover Frames:** Single Hairline Rule, Classic Double Rule, Art Deco Stepped Frame, Notched Corner Frame.
    - **Mirrored 4-Corner Flourishes:** Classic Scroll Corners, Art Deco Chevron Corners.
    - **Title Dividers & Emblems:** Diamond Rule, Aldus Fleuron Leaf, Celestial Stars & Crescent, Compass Rose, Botanical Sprig.
    - **Spine Designs (6 classic motifs):** 5-Band Spine Rules, Spine Title Cartouche, Head & Tail Decorative Bands, Vertical Botanical Spine Vine, Vertical Celestial Spine Column, Art Deco Spine Lattice.
  - **Custom Vector SVG Stamp Import:** Upload any `.svg` design directly into the Classic Designs library; `svgStampParser.ts` parses shapes/paths into flattened absolute `1:1 mm` Bezier contours (zero `transform` attributes), enabling one-click foil/ink recoloring, adjustable stroke/line-weight thickening for HTV cutting, 4-corner canvas resizing, and direct export to 300 DPI Vector Print PDF, 3D Preview, Affinity SVG, and **Cricut / HTV SVG**.
  - Draggable with magnetic snap guides (including **Safe-Margin Snap Lines** `FRONT MARGIN` / `BACK MARGIN` inset evenly inside Front & Back covers during both drag and 4-corner resize so designs stop cleanly inside a balanced border instead of running flush to the raw edge), 4-corner resizable directly on the 2D canvas, 1-click **Margin Fit Presets** (`Tight 6 mm` · `Classic 12 mm` · `Wide 18 mm` + `Center`), recolorable to any foil/ink hex color, and exported cleanly to 300 DPI Print PDF, 3D Preview, Affinity SVG, and **Cricut / HTV SVG** as flattened cuttable vector paths.
- **SVG Artwork Uploads:** Image uploaders on both Outer Cover and Inner Pockets accept `.svg` (`image/svg+xml`) alongside `PNG`, `JPG`, and `WEBP`.

### 7.8 Reusable Series Design Presets (`src/types/designPreset.ts`, `src/core/presetStorage.ts`, `src/studio/DesignPresetsCard.tsx`)
- Lets bookbinders save any cover styling setup (background cloth colors, inner endpaper color, spine typography styling, Cover Text blocks, and Classic Ornaments / Custom SVG Stamps) as a reusable **Design Preset** and apply it across multiple books of completely different dimensions (e.g., matching a full multi-volume series or A6 journal set):
  - **Dimension-Independent Proportional Coordinates:** Captures every text layer and ornament in normalized `0..1` ratios relative to its target board (`front`, `back`, `spine`). Applying a preset to a new book size automatically scales and positions frames, corner flourishes, dividers, spine bands, and cover titles cleanly to the new `BOARD_W × BOARD_H × SPINE_W` while preserving the current book's existing spine title & author text.
  - **Starter Series Themes + Unlimited Custom Presets:** Ships with 4 built-in classic bookbindery themes (*Classic Clothbound Gold*, *Art Deco Midnight*, *Botanical Field Journal*, *Celestial Oxblood*) alongside user-saved presets persisted in `localStorage` with `.json` export/import backup support.
  - Accessible 1 click away via the **`Presets`** tab in the Cover Studio Tool Dock.

---

## 8. Recommended Tech Stack (Local Build)
- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **PDF Generation:** `pdf-lib` (true millimeter vector paths, custom `.ttf`/`.otf` font embedding, and lossless 300 DPI image embedding)
- **Icons:** `lucide-react`
