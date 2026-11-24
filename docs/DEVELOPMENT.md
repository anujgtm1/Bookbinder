# Development Guide

Technical setup, project architecture, and testing guide for contributors working on **Bookbinder Studio**.

## Prerequisites

- **Node.js 22+**
- **`pnpm`**

## Quick Start

```bash
pnpm install
pnpm dev
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start local Vite dev server |
| `pnpm build` | Type-check (`tsc -b`) and build production static bundle to `dist/` |
| `pnpm preview` | Serve the production `dist/` build locally |
| `pnpm typecheck` | Run strict TypeScript checking (`tsc -b --noEmit`) |
| `pnpm lint` | Run ESLint across the codebase |
| `pnpm test` | Run Vitest unit and component tests (`vitest run`) |
| `pnpm test:watch` | Run Vitest in interactive watch mode |
| `pnpm test:coverage` | Run Vitest with v8 coverage report |
| `pnpm test:e2e` | Run Playwright Chromium end-to-end behavioral tests (`playwright test`) |

## Tech Stack

- **Framework & Language:** React 19, TypeScript 5.8, Vite 6
- **UI & Styling:** Tailwind CSS v4, Radix UI / shadcn primitives, Lucide icons
- **Vector & Print Generation:** Pure `1:1 mm` SVG generation, HTML5 Canvas `300 / 600 DPI` compositor, `pdf-lib` + `@pdf-lib/fontkit` for embedded vector typography, asymmetric safe-box single-sheet / 2-sheet tiled PDF layouts (`pdfSheetLayout.ts`), wide-format roll multi-up / gang-sheet nesting (`rollNesting.ts`), printable printer-margin calibration sheets (`marginTestSheetPdf.ts`), bench recipe & cutting jigs PDFs (`benchRecipePdf.ts`), slipcase box SVG/PDF exporters (`slipcaseExport.ts`), and auto-paginated inner pocket / folded endpaper PDFs
- **Bundled Offline Assets & Fonts:** `@fontsource` packages (*EB Garamond, Libre Baskerville, Cormorant Garamond, Lora, Inter, Montserrat*), custom `.ttf`/`.otf`/`.woff`/`.woff2` runtime loading, and bespoke Tokyo Bindery Desk craft assets (`src/assets/atelier/`)
- **Testing:** Vitest + Testing Library (`jsdom`) for unit/component tests (**57 test files / 312 tests**), Playwright (Chromium) for end-to-end browser verification (**40 E2E tests**)

## Project Architecture

```text
src/
├── assets/atelier/         # Bespoke bundled Tokyo Bindery Desk craft assets
│                           #   (desk-walnut.jpg, washi-paper.jpg, atelier-colophon.jpg)
├── types/                  # Domain types with co-located serialize/deserialize/validate/math models
│                           #   (bookParams, geometry, studio, studioLayer, coverElements,
│                           #    designPreset, project, units)
├── lib/                    # Shared pure utilities (canvasImage, color, svgFormat, utils)
├── resources/              # Declarative JSON & static catalogs (paperSpecs.json, paperSpecs.ts,
│   │                       #   palettes.ts, designPresets.ts, sampleProject.ts)
│   └── ornaments/          # Bundled SVG ornament assets & registry (index.ts, divider-*.svg, emblem-*.svg)
├── core/                   # Open/closed binding strategy registry (bindingStyles), pure 1:1 mm geometry
│                           #   engine (geometry), slipcase calculator & exporters (slipcaseGeometry,
│                           #   slipcaseExport), SVG & PDF blueprint exporters (svgExport, pdfExport),
│                           #   bench recipe & jigs PDF (benchRecipePdf), asymmetric printer margins &
│                           #   calibration sheet (printerMargins, marginTestSheetPdf), wide-format roll
│                           #   multi-up & gang-sheet nesting (rollNesting), print-media sheet centering &
│                           #   2-sheet tiling (pdfSheetLayout), persistence (storage, presetStorage), theme
├── studio/                 # Interactive Cover & Inner Pockets / Endpapers workbench
│   ├── exporters/          # Cover output engines (coverPdfExporter, coverRasterExporter,
│   │                       #   coverAffinitySvgExporter)
│   ├── ornaments/          # Parametric foil frame/spine generators & SVG primitives
│   │                       #   (parametricGenerators, primitives)
│   ├── pockets/            # Inner pocket & folded endpaper SVG renderer, CAD dimensions & controls
│   │                       #   (PocketPieceSvg, PocketBlueprintDimensions, PocketStyleControls)
│   ├── hooks/              # Studio state actions, history & element drag/resize hooks
│   │                       #   (useCoverStudioActions, useCoverElementsInteraction, useStudioHistory)
│   ├── CoverStyler.tsx     # 3-column cover studio shell coordinating:
│   │                       #   CoverWorkbenchHeader, CanvasSelectionBar, CoverCanvas2D,
│   │                       #   CoverStudioToolDock (docked right Design Inspector on xl:),
│   │                       #   CoverTextCard, ClassicDesignsCard, CoverElementsCard,
│   │                       #   ArtworkControlsCard, SpineTypographyCard, DesignPresetsCard,
│   │                       #   PreflightCard, CricutExportDialog, Book3DPreview,
│   │                       #   LayerSelectionOverlay, and InnerPocketsStudio
│   └── *.ts                # Studio engines (canvasSpec, renderEngine, pocketRenderEngine,
│                           #   studioClipboard, studioGeometryRemap, materialPreview, edgeExtend,
│                           #   preflight, cricutExport, classicOrnaments, svgStampParser,
│                           #   fonts, book3d, snapGuides, useInteractiveLayers)
├── components/             # Shared UI & Measure/Cut views:
│   ├── ui/                 # shadcn/ui Radix primitives
│   ├── PdfExportDialog.tsx # Unified modal Print & Export PDF dialog (paper fit, custom roll, roll
│   │                       #   nesting & gang-sheet upload, asymmetric printer margins, DPI, guides)
│   ├── PdfSheetPreviewSvg.tsx # Live SVG sheet-layout, unprintable dead-zone & roll-strip preview
│   ├── SlipcaseCard.tsx    # Collapsible 5-panel Matching Slipcase Box Calculator & SVG/PDF exports
│   ├── BindingStyleIcon.tsx # 5 bespoke architectural 1px binding cross-section schematics
│   └── *.tsx               # MeasureAndCutPanel, SidebarControls, CutListCard,
│                           #   OuterBlueprintCanvas, BlueprintDimensionLines,
│                           #   FloatingHudToolbar, Header
├── hooks/                  # Shared React hooks (useFullPageCanvas)
└── test/                   # Vitest/Testing Library global test setup (setup.ts)

e2e/                        # Playwright Chromium end-to-end specs (40 tests across 6 specs:
                            #   smoke, phase1-templates, phase2-studio, studio-craft-workflows,
                            #   roll-and-selection, geometry-remap-stability)

docs/
├── SPEC.md                 # Full technical specification & millimeter geometry formulas
├── ROADMAP.md              # Completed milestones, next features, and backlog
├── FEATURE_IDEAS.md        # Community feature roadmap & ideas
├── DEPLOYMENT.md           # GitHub Pages static CI/CD deployment guide
└── RESEARCH.md             # Affinity Connector research (JS Scripting API & MCP)
```

## Development Workflow

This codebase follows a **spec-first** workflow: design and geometry requirements are authored and updated in [`docs/SPEC.md`](./SPEC.md) prior to implementation, with features backed by Vitest unit/component tests and Playwright end-to-end behavioral tests.

Before opening a PR or releasing changes, verify all checks pass:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

## Further Documentation

- [Project Specification](./SPEC.md)
- [Feature Roadmap & Tracker](./ROADMAP.md)
- [Community Feature Ideas](./FEATURE_IDEAS.md)
- [GitHub Pages Deployment Guide](./DEPLOYMENT.md)
- [Affinity Connector Research](./RESEARCH.md)
