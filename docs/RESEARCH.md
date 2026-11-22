# Post-Milestone Research: Affinity Connector

## Research Question
> "Can you check to see if we can create an affinity connector?"

---

## Executive Summary

**Yes — we can build a real Affinity Connector**, though not by writing `.af` / `.afdesign` binary files directly or calling a browser URL scheme.

Affinity (the unified Affinity creative suite by Canva, covering Designer/Photo/Publisher workflows) now ships two official automation surfaces that make a high-fidelity Bookbinder → Affinity connector practical:

1. **Native Affinity JavaScript Scripting API (`affinity.d.ts` / `affin.co/affinity-sdk`)** — runs inside Affinity's Scripts Studio with undo-safe `DocumentCommand` transactions, layer/vector/text creation, custom dialogs, and opt-in **File System Access** and **Access Networks** permissions.
2. **Built-in Affinity MCP (Model Context Protocol) Server** — can be enabled in *Settings > Scripting* on macOS to inspect documents and execute Affinity SDK scripts programmatically.

Because Bookbinder Studio already isolates all physical millimeter geometry inside `src/core/geometry.ts` (`CaseGeometry`) and serializes projects cleanly via `BookbinderProjectModel`, we can connect directly to Affinity without duplicating any geometry math.

---

## Platform Constraints Verified

| Capability | Status in Affinity | Implication for Bookbinder |
| --- | --- | --- |
| **Native `.af` / `.afdesign` binary generation** | Proprietary, undocumented binary format | Do **not** attempt to write raw `.af` files from the browser. |
| **Custom URL scheme (`affinity://`)** | Not supported | A static web app cannot launch Affinity directly via a link click alone. |
| **C++ Plugin SDK** | Not publicly offered | Extensions use the JavaScript Scripting API rather than native binary plugins. |
| **AppleScript dictionary** | Minimal (window activation / brittle UI scripting only) | Avoid AppleScript UI automation; prefer the official JS Scripting API. |
| **macOS CLI file launch** | `open -a "Affinity" <file>` works for SVG/PDF | Useful as a lightweight fallback in a local bridge. |
| **Affinity JavaScript Scripting API** | Official (`affinity.d.ts`), supports layers, curves, text, dialogs, undoable commands, opt-in FS & HTTP | **Primary target** for creating native Affinity documents with true bleed, snapping guides, and locked layers. |
| **Affinity MCP Server** | Official (opt-in in *Settings > Scripting*) | Enables live push from a local bridge or AI workflow straight into an active Affinity session. |

---

## Candidate Connector Architectures

### Option 1 — Native Affinity Script Generator + Companion Script (Recommended First Step)
**Zero backend, works 100% offline from the current client-side web app.**

- **How it works:**
  1. Add a pure exporter (`src/core/affinityScriptExport.ts`) that compiles `CaseGeometry` + `CoverStudioState` into a self-contained Affinity JavaScript script (`bookbinder_case.js`)—or pair it with a one-time installed Bookbinder companion script in Affinity's **Scripts Studio** that opens any exported Bookbinder `.json` project file (using Affinity's opt-in *File System Access* permission).
  2. When run inside Affinity, the script executes a single undoable `DocumentCommand` that creates a **native Affinity document** at exact `WRAP_W × WRAP_H` mm (300 DPI):
     - **True native Document Bleed** (`bleedMm` on all 4 sides, not just a drawn green rectangle).
     - **True snapping Ruler Guides** placed at every board, `9.0 mm` hinge, and spine boundary.
     - **Locked `Cut Lines (45° Miter)` Layer** with hairline stroke over the exact 8-point mitered polygon.
     - **Locked `Board & Hinge Guides` Layer** (easily toggled off before roll printing).
     - **Artwork Layer** (background fills + placed cover image if provided).
     - **Native Editable Spine Text** (real Affinity Artistic Text, rotated & centered with optical nudge).
- **Pros:** Solves the biggest limitation of SVG import (SVG imports flatten document bleed and cannot create native Affinity snapping guides or locked guide layers). Zero daemon/server required.
- **Cons:** User runs the script in Affinity's Scripts Studio (or drags the `.json` into the companion script dialog).

### Option 2 — Local Companion Bridge ("Send to Affinity" One-Click Push)
**Best desktop UX for local `pnpm dev` / self-hosted Bookbinder users.**

- **How it works:**
  - A tiny optional local bridge (`scripts/affinity-bridge.ts` or Vite dev-server middleware on `127.0.0.1`) accepts `POST /api/send-to-affinity` with the current `BookbinderProject` + `CaseGeometry`.
  - Two transport modes:
    - **2A (Live Script / MCP Push):** Communicates with Affinity's enabled local MCP server (or serves the latest project JSON at `http://127.0.0.1:<port>/latest.json` for a pinned Affinity script with *Access Networks* permission to pull in one click).
    - **2B (Instant Open Fallback on macOS):** Writes `outer_cover_300dpi.svg` (or `outer_case_wrap.svg`) to a temp/project workspace folder and runs `open -a "Affinity"` so the file opens immediately in Affinity with no Save/Open dialogs.
- **Pros:** True one-click *"Send to Affinity"* button inside Bookbinder Studio.
- **Cons:** Only works when Bookbinder runs locally (or with the local bridge CLI running alongside a hosted build).

### Option 3 — Enhanced SVG/PDF Round-Trip (Already Shipped Baseline)
- Already implemented in Phase 1 (`outer_case_wrap.svg`) and Phase 2 (`outer_cover_300dpi.svg` + `outer_cover_300dpi.png`) with exact `width="{W}mm" height="{H}mm"` root sizing and named `<g id="...">` groups.
- Remains the universal fallback for users on older Affinity v2 builds that predate the JavaScript Scripting API.

---

## Recommended Next-Milestone Roadmap

1. **Verify Local Environment First (15-min Spike):**
   - Check which Affinity version is installed on your Mac (`Affinity` unified by Canva vs. `Affinity Designer 2` / `Affinity Publisher 2`).
   - Confirm whether **Settings > Scripting → Enable Affinity Scripting** and **Enable MCP server** are present in your installed version.
   - Download the official `affinity.d.ts` definitions from `affin.co/affinity-sdk` to verify exact API signatures for creating documents with native bleed, ruler guides, curves, and rotated text.
2. **Phase A — `affinityScriptExport.ts` (Pure Client-Side Connector):**
   - If your Affinity build supports the JS Scripting API, add a `"Download Affinity Script (.js)"` button + reusable companion importer script (`.json` → native Affinity doc) with full Vitest unit tests.
3. **Phase B — Optional Local Bridge (`pnpm affinity-bridge`):**
   - Add a `"Send to Affinity"` button in the header/export bar that auto-detects the local bridge (gracefully hidden when offline/static) and pushes directly to Affinity via MCP or `open -a` fallback.

---

## Open Questions to Answer Before Implementing

1. Which Affinity app(s) and version do you have installed on this Mac (e.g., Affinity v2 Designer/Publisher vs. unified Affinity by Canva with Scripting Studio + MCP)?
2. Which workflow feels nicest for your physical bookbinding pipeline:
   - **A)** Clicking *"Send to Affinity"* in Bookbinder to auto-open a native document with guides, bleed, and layers (via local bridge),
   - **B)** Running a pinned Bookbinder script inside Affinity's Scripts Studio that pulls your latest project from Bookbinder, or
   - **C)** Both (script generator + optional local bridge)?
3. Do you want CMYK color space (`US Web Coated SWOP v2` / generic CMYK) as the default for Affinity documents created by the connector, or sRGB matching the browser preview?
