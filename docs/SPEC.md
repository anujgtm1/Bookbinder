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

### 3.3 Construction & Layout Defaults (Collapsible Panel)
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
  - **Spec & Cut List Strip (`CutListCard.tsx`):**
    - Displays exact dimensions for **2× Cover Boards**, **1× Spine Strip**, **Outer Wrap**, and the **Roll Printer Size & Orientation Badge**.
    - Includes a clean inline **SVG Assembly Diagram** visually reminding the user to place their **`9 mm` spacer** between the spine strip and front/back boards during gluing.
  - **Folder-Style Paper Index Tabs:** `Structural Templates` and `Cover & Spine Styler` attach directly to the top edge of the workbench panel.
- **Interactive Blueprint Preview (`BlueprintPreview.tsx`):**
  - Full-bleed cutting-mat `1:1` proportional SVG viewport with a **Floating Bottom-Center HUD Toolbar** (`role="toolbar"` with roving keyboard navigation) for sheet switching (`Outer Case Wrap` / `Inner Pockets & Spine Liner`) and zoom/reset controls:
    - Outer Case Wrap: Solid Red (`#FF0000`) 45°-mitered cut polygon, Dashed Blue (`#0066FF`) board/spine placement boxes, Dashed Green (`#00AA44`) optional bleed box.
    - Inner Spine Liner & Front/Back Pocket Envelopes with dashed score lines and labeled open edges.
  - **2 × 2 Structural Export Matrix:**
    - **Outer Case Wrap:** `.SVG` (Affinity `1:1` mm layers) and `.PDF` (`1:1` mm vector print template, single-piece or 3-piece split)
    - **Inner Pockets & Spine Liner:** `.SVG` (`1:1` mm vector cut/score/glue layers) and `.PDF` (`1:1` mm auto-paginated sheet PDF)

---

## 6. Phase 1 Export Specifications

### 6.1 Outer Case Wrap Exports (`outer_case_wrap.svg` & `outer_case_wrap.pdf`)
- **SVG (`outer_case_wrap.svg`):** Root `<svg>` explicitly defines physical millimeter dimensions (`width="{WRAP_W}mm" height="{WRAP_H}mm" viewBox="0 0 {WRAP_W} {WRAP_H}"`, expanding symmetrically when bleed is enabled) so Affinity Designer/Publisher/Photo opens it at exact `1:1` physical scale without DPI scaling errors. Organized into clean named `<g id="...">` groups (`cut-lines`, `board-guides`, `bleed-box`, `dimensions-notes`) so guide layers can be locked or toggled before printing.
- **PDF (`outer_case_wrap.pdf`):** Generated client-side via `pdf-lib` at exact `1:1` physical millimeter scale (`1 mm = 2.83465 pt`) for both Single-Piece Continuous Wrap (roll-size page) and 3-Piece Quarter-Bound Split (3 exact panels), including the 45°-mitered cut polygon, dashed blue board/hinge guides, optional bleed frame, and a `50.0 mm × 50.0 mm` scale verification note.

### 6.2 Inner Envelopes & Spine Liner Exports (`inner_pockets_and_liner.pdf` & `inner_pockets_and_liner.svg`)
- **PDF (`inner_pockets_and_liner.pdf`):** Generated client-side via `pdf-lib` in exact millimeter coordinates (`1 mm = 2.83465 pt`).
  - **Auto-Pagination & Rotation:** Automatically arranges Front Pocket, Back Pocket, and Spine Liner across 1 or 2 pages depending on selected sheet size (`Letter`, `A4`, or `Tabloid`), automatically rotating pieces 90° if needed to prevent clipping.
  - **Calibration Square:** Includes a `50.0 mm × 50.0 mm` verification square on Page 1 labeled *"Verify 50mm × 50mm — Print at 100% / Actual Size"*.
  - **Visual Legend:** Solid lines = Cut; Dashed lines = Score & Fold; Shaded/hatched tabs = Apply Glue Here.
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
  - **Layer Stack & Quick-Fit Helpers:**
    - Reorder layers (bring forward / send backward), remove individual layers, or reset.
    - One-click **Quick Fit** presets for the selected layer (`Fit Front`, `Fit Spine`, `Fit Back`, `Fit Full Wrap`) plus an optional **Clip to Zone** mask (`None`, `Front`, `Spine`, `Back`) for crisp edges at board/spine seams.
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
  - Renders a physically proportioned CSS 3D hardcover volume using exact `BOARD_W × BOARD_H × SPINE_W` ratios, mapping the live Front Cover, Spine (with live vertical/horizontal typography), and Back Cover artwork onto the 3D book faces alongside cream paper page-block edges inset inside the hardcover overhang.
  - Supports free pointer drag-to-orbit (`Yaw` / `Pitch`), keyboard arrow rotation, and one-click angle presets (`Front 3/4`, `Spine`, `Back 3/4`, `Reset`).

### 7.3 Dual High-Resolution Exports (Exact `WRAP_W × WRAP_H` Physical Scale)
1. **Print-Ready Roll PDF (`outer_cover_print.pdf`):**
   - Composited at **300 DPI** (`pixels = mm / 25.4 * 300`) for uploaded raster artwork, with true vector typography and cut/registration marks via `pdf-lib`.
   - **Cut-Line Toggle:**
     - *Full Cut & Miter Guides* (thin hairline cut polygon + 45° corner miters overlaid for manual cutting).
     - *Bleed + Outer Corner Registration Marks Only* (keeps cut lines outside the artwork area so slight hand-cutting variance never leaves visible lines on the finished book).
2. **Affinity Round-Trip Export (`outer_cover_300dpi.png` / `.svg`):**
   - Exports the composed 300 DPI flat cover + centered spine strip at exact `1:1` millimeter scale so it can be dropped straight into Affinity for advanced graphic textures, foil overlays, or custom back-cover layouts.

---

## 8. Recommended Tech Stack (Local Build)
- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS
- **PDF Generation:** `pdf-lib` (true millimeter vector paths, custom `.ttf`/`.otf` font embedding, and lossless 300 DPI image embedding)
- **Icons:** `lucide-react`
