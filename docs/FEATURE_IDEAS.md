# Bookbinder — Feature Ideas & Craft Roadmap (r/bookbinding & Hobbyist Research)

A prioritized backlog of feature ideas gathered from **r/bookbinding** discussions, **DAS Bookbinding** tutorials, and paperback-rebind hobby guides — filtered specifically for what complements Bookbinder's strength as a **1:1 mm structural case calculator + rapid cover & endpaper studio**.

---

## Tier 1 — High-Impact Wins for Hobby Binders (Biggest Audience Appeal)

### 1. Cricut / Silhouette / ScanNCut HTV & Foil SVG Export
- **Why binders ask for it:** A huge slice of r/bookbinding wraps boards in plain bookcloth and cuts **Heat Transfer Vinyl (HTV)** or **foil iron-on** titles/borders on a Cricut or Silhouette.
- **What it would do:**
  - Export a clean **cut-only monochrome vector SVG** (`cover_htv_cut.svg`) containing **outlined text paths** (no `<text>` tags that break in Cricut Design Space) + optional board-edge registration ticks so vinyl lands dead-center on the cloth.
  - Include a one-click **`Mirror Horizontally (for HTV Iron-On)`** toggle right in the export popover so users never waste a sheet of foil by forgetting to mirror.

### 2. Grain Direction Arrows on Every Blueprint & Print Sheet
- **Why binders ask for it:** *"Grain direction parallel to the spine"* is universally called the **#1 beginner mistake** in bookbinding (wrong grain makes covers bow like potato chips once PVA dries).
- **What it would do:**
  - Add subtle, toggleable **`↕ GRAIN DIRECTION (PARALLEL TO SPINE)`** double-headed arrows onto the Outer Blueprint, Cut PDF, Cut SVG, Inner Pockets, and Spine Liner (rotating automatically when a piece is rotated 90° for pagination!).
  - Adds authentic bindery credibility with almost zero UI clutter.

### 3. Front & Back Cover Typography + Classic Clothbound Frames
- **Why binders ask for it:** Many rebinders make *"Penguin Clothbound Classics"* or minimalist cloth-and-foil editions where they don't upload a full raster image — they just want crisp title/author lettering, decorative corner ornaments, or a double hairline rule frame centered on the Front Cover and Spine.
- **What it would do:**
  - Extend our existing `SpineTypographyCard` typography engine to optionally place **Front Cover Title / Subtitle / Author** and **Back Cover Blurb / Colophon** text + selectable vintage double-rule border frames (using the same curated & custom `.ttf`/`.otf` fonts and vector PDF embedding).

### 4. Permanent Glue-In Endpapers Option (Alongside Removable Slip-In Pockets)
- **Why binders ask for it:** Bookbinder started with removable slip-in pockets (awesome for non-destructive paperback cases!), while traditional paperback-to-hardcover rebinders rip off the paperback cover and glue **folded endpapers** (`pastedown + flyleaf`, double width `2 × PB_W × PB_H` with a center fold score line) directly onto the text block and boards.
- **What it would do:**
  - Add an **Interior Style** toggle on the Inner tab: **`Removable Slip-In Pockets`** vs. **`Folded Glue-In Endpapers (Traditional Rebind)`** — letting traditional rebinders use the exact same drag-and-drop / Tile Pattern studio to print 1:1 mm marbled or illustrated folded endpaper sheets!

### 5. Dust Jacket Generator Mode
- **Why binders ask for it:** Many hobbyists keep their hardcover cloth simple/clean and print an illustrated **paper dust jacket** on a home or copy-shop printer.
- **What it would do:**
  - Reuse our new `Softcover Slip-In Jacket` geometry with one crucial physical tweak: dust jackets wrap *over* an already-cased hardcover (`width = BOARD_W + 2 mm` fold clearance, `height = BOARD_H + 1 mm`, `spine = SPINE_W + 2 × BOARD_T + 2 mm`, and wider `65–85 mm` front/back blurb flaps).

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

### 8. Matching Slipcase Box Calculator (1:1 mm Cut List & Wrap)
- **Why binders ask for it:** Slipcases are one of the most popular next-step projects on r/bookbinding — and notoriously annoying to calculate by hand because you have to add `1.5–2.0 mm` slide clearance plus chipboard wall thicknesses on 5 panels (`2 walls + spine wall + head wall + tail wall`) and a thumb-notch cutout!
- **What it would do:**
  - Optional **"Matching Slipcase"** panel/export computed directly from the finished hardcover's outer dimensions (`BOARD_W × BOARD_H × CASE_THICKNESS + clearance`), outputting all 5 chipboard panel cuts, thumb-notch arc guide, and outer wrap strip.

### 9. Spine Thickness Estimator (From Page Count & Paper GSM / PPI)
- **Why binders ask for it:** People planning a typeset book *before* printing often want a ballpark spine width from page count and paper weight (e.g., 320 pages of 80 gsm cream paper).
- **What it would do:**
  - A tiny optional **"Estimate from page count"** helper popover next to `PB_THICK` (with an explicit craft warning echoing r/bookbinding consensus: *"Use for rough planning only — always measure the actual pressed text block before cutting board!"*).

---

## Tier 3 — Home-Printer & Bench Ergonomics

### 10. Tiled Poster Print Mode (Letter / A4 Desktop Printers)
- **Why binders ask for it:** Many home binders don't own a 13"+ roll printer and don't always want a 3-piece quarter-bound split — sometimes they want to print a full-bleed continuous cover across **2 overlapping Letter/A4 sheets** (or test-fit a full-size paper template at home before paying a print shop).
- **What it would do:**
  - Add a **`Tiled 2-Sheet Print PDF (Letter / A4)`** option that splits the outer wrap cleanly with a `10 mm` glue/tape overlap strip and crosshair registration marks.

### 11. Printable "Bench Recipe Card" & Step-by-Step Cut Checklist
- **Why binders ask for it:** At the cutting mat, people don't want to keep unlocking their phone with gluey fingers to check `143 × 223 mm` or `9 mm` spacer dimensions.
- **What it would do:**
  - A clean printable 1-page **Bindery Spec Sheet** (or footer strip on Page 1 of the PDF) listing exact chipboard cuts, grain direction, spacer width, corner miter gap, and a check-off assembly sequence.

### 12. Printable Cutting Jigs (Corner Miter Gauge + Hinge Spacer Strips)
- **Why binders ask for it:** Beginners often buy plastic "bookbinding L-spacers" and corner miter guides on Etsy.
- **What it would do:**
  - Include a bonus cut-out **exact-width hinge spacer guide** (`HINGE_W`) and **exact-clearance 45° corner miter template** (`MITER_GAP = BOARD_T × MITER_FACTOR`) right in the empty whitespace of Page 1 of the Inner Templates PDF so users can glue them onto scrap chipboard and reuse them at the bench!

### 13. Visual Material & Foil Preview + 1-Click Demo Book (Showcase Polish)
- **Material Preview (2D/3D):** Optional non-printing visual shader overlay (*Matte Paper*, *Woven Bookcloth Linen*, *Pebbled Leather*, and *Metallic Gold/Silver Foil* sheen on spine lettering) so clothbound designs look realistic in 3D before ordering cloth.
- **1-Click "Load Sample Book" Button:** Preloads a public-domain classic cover + styled marbled endpaper pockets so first-time visitors arriving from Reddit can orbit the 3D book, open the cover, and test dragging/snapping within 3 seconds.

---

## Intentional Scope Guardrails (What *Not* to Build)
To keep Bookbinder fast, focused, and joyful rather than bloated:
- **Skip full text-block signature imposition** — excellent dedicated open-source tools already exist for that (`bookbinder-js`, `Wynkyn`), and linking to them as companion tools is far better than duplicating them.
- **Skip heavy photo-editing / brush tools** — keep our 1:1 mm Affinity / Inkscape SVG & 300 DPI PNG round-trip exports crisp for users who want complex illustration workflows.
