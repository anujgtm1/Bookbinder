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
- **Vector & Print Generation:** Pure `1:1 mm` SVG generation, HTML5 Canvas 300 DPI compositor, `pdf-lib` + `@pdf-lib/fontkit` for embedded vector typography and multi-page print PDFs
- **Bundled Offline Fonts:** `@fontsource` packages (*EB Garamond, Libre Baskerville, Cormorant Garamond, Lora, Inter, Montserrat*) plus custom `.ttf`/`.otf`/`.woff`/`.woff2` runtime loading
- **Testing:** Vitest + Testing Library (`jsdom`) for unit/component tests, Playwright (Chromium) for end-to-end browser verification

## Project Architecture

```text
src/
├── types/          # Domain types with co-located serialize/deserialize/validate/math models
│                   #   (bookParams, geometry, studio, studioLayer, coverElements, project, units)
├── core/           # Pure 1:1 mm geometry engine, SVG & PDF exporters, localStorage/JSON persistence, theme
├── studio/         # Interactive cover & spine compositor, 300 DPI outer/pocket render engines,
│                   #   edge extension, preflight checker, Cricut/HTV vector SVG exporter,
│                   #   classic bookbindery foil ornaments & SVG stamp parser, 3D book preview,
│                   #   snap guides, and pointer interaction hooks
├── components/     # shadcn/ui Radix primitives + MeasureAndCutPanel, SidebarControls, CutListCard,
│                   #   OuterBlueprintCanvas, BlueprintDimensionLines, FloatingHudToolbar, Header
└── hooks/          # Shared React hooks (e.g., useFullPageCanvas)

e2e/                # Playwright Chromium end-to-end specs (smoke, Phase 1 templates, Phase 2 studio)

docs/
├── SPEC.md         # Full technical specification & millimeter geometry formulas
├── ROADMAP.md      # Completed milestones, next features, and backlog
├── FEATURE_IDEAS.md# Community feature roadmap & ideas
├── DEPLOYMENT.md   # GitHub Pages static CI/CD deployment guide
└── RESEARCH.md     # Affinity Connector research (JS Scripting API & MCP)
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
