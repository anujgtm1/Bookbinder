import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFEmbeddedPage,
} from 'pdf-lib';
import { getPrintMediaSpec } from '@/resources/paperSpecs';
import type { PrintMediaId } from '@/types/bookParams';
import type { LineSegment2D, Rect2D } from '@/types/geometry';
import { UnitConverter, roundTo } from '@/types/units';
import { drawPdfFoldGuideTicks, transformTicks90CW, translateTicks } from './foldGuideTicks';
import {
  SCALE_BAR_BOX_H_MM,
  SCALE_BAR_BOX_W_MM,
  drawNestCropMarksAndGutterGuides,
  drawNestScaleCheckBar,
  stampEmbeddedPdfRect,
} from './nestingPdfHelpers';
import {
  DEFAULT_PRINTER_MARGINS,
  clampPrinterMargins,
  computePrintableSafeBox,
  type PrintableSafeBox,
  type PrinterMargins,
} from './printerMargins';
import {
  planScaleBarPlacement,
  ticksToPdfAvoidRects,
  type PdfSafeBox,
} from './scaleBarPlacement';

export type SheetOrientation = 'portrait' | 'landscape';

export interface SheetNestItem {
  readonly id: string;
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly copies: number;
}

export interface SheetPlacedRect {
  readonly itemId: string;
  readonly label: string;
  readonly copyIndex: number;
  readonly pageIndex: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
}

export interface SheetNestPage {
  readonly pageIndex: number;
  readonly placements: readonly SheetPlacedRect[];
  readonly efficiencyPct: number;
}

export interface SheetNestPlan {
  readonly mediaId: PrintMediaId;
  readonly sheetWidthMm: number;
  readonly sheetHeightMm: number;
  readonly orientation: SheetOrientation;
  readonly printableSafeBox: PrintableSafeBox;
  readonly gutterMm: number;
  readonly pages: readonly SheetNestPage[];
  readonly unplacedIds: readonly string[];
  readonly totalPlacedCount: number;
  readonly overallEfficiencyPct: number;
}

export interface SingleItemSheetCapacity {
  readonly mediaId: PrintMediaId;
  readonly orientation: SheetOrientation;
  readonly printableSafeBox: PrintableSafeBox;
  readonly maxPerSheet: number;
  readonly recommendedRotated: boolean;
  readonly utilizationPct: number;
}

export interface PackSheetOptions {
  readonly mediaId: PrintMediaId;
  readonly printerMargins?: PrinterMargins;
  readonly gutterMm?: number;
  readonly allowRotation?: boolean;
}

export interface SheetPdfSource {
  readonly id: string;
  readonly label: string;
  readonly pdfBytes: Uint8Array;
  readonly copies: number;
  /** Optional wrap/piece-local external fold guide ticks (top-down mm, before source bleed). */
  readonly externalFoldGuideTicks?: readonly LineSegment2D[];
  /** Symmetric bleed margin (mm) baked into pdfBytes around the piece. Defaults to 0. */
  readonly bleedMm?: number;
}

export interface ComposeNestedSheetPdfOptions extends PackSheetOptions {
  readonly includeScaleBar?: boolean;
  readonly documentTitle?: string;
}

export interface ComposeNestedSheetPdfResult {
  readonly bytes: Uint8Array;
  readonly plan: SheetNestPlan;
}

const DEFAULT_SHEET_GUTTER_MM = 10;
const FIT_EPS_MM = 0.05;
const EMPTY_SAFE_BOX: PrintableSafeBox = {
  xMm: 0,
  yMm: 0,
  widthMm: 0,
  heightMm: 0,
};

function computeAxisCount(spanMm: number, printableSpanMm: number, gutterMm: number): number {
  if (!Number.isFinite(spanMm) || spanMm <= 0 || printableSpanMm <= 0) {
    return 0;
  }
  if (spanMm > printableSpanMm + FIT_EPS_MM) {
    return 0;
  }
  const safeGutter = Math.max(0, gutterMm);
  return Math.max(
    1,
    Math.floor((printableSpanMm + safeGutter + FIT_EPS_MM) / (spanMm + safeGutter)),
  );
}

function computeGridCount(
  itemWMm: number,
  itemHMm: number,
  safeWMm: number,
  safeHMm: number,
  gutterMm: number,
): number {
  const cols = computeAxisCount(itemWMm, safeWMm, gutterMm);
  if (cols === 0) return 0;
  const rows = computeAxisCount(itemHMm, safeHMm, gutterMm);
  return cols * rows;
}

function normalizeGutterMm(gutterMm: number | undefined): number {
  if (gutterMm === undefined || !Number.isFinite(gutterMm)) {
    return DEFAULT_SHEET_GUTTER_MM;
  }
  return Math.max(0, gutterMm);
}

/**
 * Evaluates how many copies of a single rectangular item fit inside the printable safe box
 * of one fixed cut sheet across both portrait and landscape orientations (and 90° item rotation
 * when `allowRotation` is enabled).
 */
export function evaluateSingleItemSheetCapacity(
  itemWidthMm: number,
  itemHeightMm: number,
  mediaId: PrintMediaId,
  margins?: PrinterMargins,
  gutterMm = DEFAULT_SHEET_GUTTER_MM,
  allowRotation = true,
): SingleItemSheetCapacity {
  const spec = getPrintMediaSpec(mediaId);
  if (spec.kind !== 'sheet' || spec.shortMm === null || spec.longMm === null) {
    return {
      mediaId,
      orientation: 'portrait',
      printableSafeBox: EMPTY_SAFE_BOX,
      maxPerSheet: 0,
      recommendedRotated: false,
      utilizationPct: 0,
    };
  }

  const effectiveMargins = margins ? clampPrinterMargins(margins) : DEFAULT_PRINTER_MARGINS;
  const safeGutter = normalizeGutterMm(gutterMm);
  const validDims =
    Number.isFinite(itemWidthMm) &&
    Number.isFinite(itemHeightMm) &&
    itemWidthMm > 0 &&
    itemHeightMm > 0;

  const orientationDims: readonly {
    readonly orientation: SheetOrientation;
    readonly widthMm: number;
    readonly heightMm: number;
  }[] = [
    { orientation: 'portrait', widthMm: spec.shortMm, heightMm: spec.longMm },
    { orientation: 'landscape', widthMm: spec.longMm, heightMm: spec.shortMm },
  ];

  let best: SingleItemSheetCapacity | null = null;

  for (const dim of orientationDims) {
    const safeBox = computePrintableSafeBox(dim.widthMm, dim.heightMm, effectiveMargins);
    const safeAreaMm2 = safeBox.widthMm * safeBox.heightMm;
    const rotations: readonly boolean[] = allowRotation ? [false, true] : [false];

    for (const rotated of rotations) {
      const placedW = rotated ? itemHeightMm : itemWidthMm;
      const placedH = rotated ? itemWidthMm : itemHeightMm;
      const count = validDims
        ? computeGridCount(placedW, placedH, safeBox.widthMm, safeBox.heightMm, safeGutter)
        : 0;
      const utilizationPct =
        safeAreaMm2 > 0 && count > 0
          ? roundTo(Math.min(100, ((count * itemWidthMm * itemHeightMm) / safeAreaMm2) * 100), 1)
          : 0;

      const candidate: SingleItemSheetCapacity = {
        mediaId,
        orientation: dim.orientation,
        printableSafeBox: safeBox,
        maxPerSheet: count,
        recommendedRotated: count > 0 ? rotated : false,
        utilizationPct,
      };

      if (!best) {
        best = candidate;
        continue;
      }

      if (candidate.maxPerSheet > best.maxPerSheet) {
        best = candidate;
      } else if (candidate.maxPerSheet === best.maxPerSheet) {
        if (candidate.utilizationPct > best.utilizationPct + 0.05) {
          best = candidate;
        } else if (
          Math.abs(candidate.utilizationPct - best.utilizationPct) <= 0.05 &&
          !candidate.recommendedRotated &&
          best.recommendedRotated
        ) {
          best = candidate;
        }
      }
    }
  }

  return (
    best ?? {
      mediaId,
      orientation: 'portrait',
      printableSafeBox: computePrintableSafeBox(spec.shortMm, spec.longMm, effectiveMargins),
      maxPerSheet: 0,
      recommendedRotated: false,
      utilizationPct: 0,
    }
  );
}

interface SheetPackEntry {
  readonly itemId: string;
  readonly label: string;
  readonly copyIndex: number;
  readonly itemOrder: number;
  readonly prefW: number;
  readonly prefH: number;
  readonly prefRotated: boolean;
  readonly altW: number | null;
  readonly altH: number | null;
  readonly altRotated: boolean;
}

interface SheetShelfRow {
  readonly yMm: number;
  readonly heightMm: number;
  cursorXMm: number;
  count: number;
}

interface MutableSheetPage {
  readonly pageIndex: number;
  readonly shelves: SheetShelfRow[];
  readonly placements: SheetPlacedRect[];
}

function packForSheetOrientation(
  items: readonly SheetNestItem[],
  mediaId: PrintMediaId,
  sheetWidthMm: number,
  sheetHeightMm: number,
  orientation: SheetOrientation,
  effectiveMargins: PrinterMargins,
  gutterMm: number,
  allowRotation: boolean,
): SheetNestPlan {
  const safeBox = computePrintableSafeBox(sheetWidthMm, sheetHeightMm, effectiveMargins);
  const rightBoundaryMm = safeBox.xMm + safeBox.widthMm;
  const bottomBoundaryMm = safeBox.yMm + safeBox.heightMm;

  const entries: SheetPackEntry[] = [];
  const unplacedIds: string[] = [];
  const unplacedSet = new Set<string>();

  items.forEach((item, itemOrder) => {
    const copies = Number.isFinite(item.copies) ? Math.max(0, Math.floor(item.copies)) : 0;
    if (copies === 0) return;

    const w = item.widthMm;
    const h = item.heightMm;
    const validDims = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
    const fitsUnrotated =
      validDims && w <= safeBox.widthMm + FIT_EPS_MM && h <= safeBox.heightMm + FIT_EPS_MM;
    const fitsRotated =
      allowRotation &&
      validDims &&
      h <= safeBox.widthMm + FIT_EPS_MM &&
      w <= safeBox.heightMm + FIT_EPS_MM;

    if (!fitsUnrotated && !fitsRotated) {
      if (!unplacedSet.has(item.id)) {
        unplacedSet.add(item.id);
        unplacedIds.push(item.id);
      }
      return;
    }

    let preferRotated = false;
    if (!fitsUnrotated && fitsRotated) {
      preferRotated = true;
    } else if (fitsUnrotated && fitsRotated) {
      const gridU = computeGridCount(w, h, safeBox.widthMm, safeBox.heightMm, gutterMm);
      const gridR = computeGridCount(h, w, safeBox.widthMm, safeBox.heightMm, gutterMm);
      if (gridR > gridU) {
        preferRotated = true;
      } else if (gridU > gridR) {
        preferRotated = false;
      } else {
        // Equal per-sheet grid capacity: prefer shorter shelf height to leave vertical room
        preferRotated = w < h - FIT_EPS_MM;
      }
    }

    const prefW = preferRotated ? h : w;
    const prefH = preferRotated ? w : h;
    const canUseAlt = preferRotated ? fitsUnrotated : fitsRotated;
    const altW = canUseAlt ? (preferRotated ? w : h) : null;
    const altH = canUseAlt ? (preferRotated ? h : w) : null;

    for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
      entries.push({
        itemId: item.id,
        label: item.label,
        copyIndex,
        itemOrder,
        prefW,
        prefH,
        prefRotated: preferRotated,
        altW,
        altH,
        altRotated: !preferRotated,
      });
    }
  });

  // Deterministic FFDH ordering: tallest preferred height, then widest, then input order
  entries.sort((a, b) => {
    if (Math.abs(b.prefH - a.prefH) > FIT_EPS_MM) return b.prefH - a.prefH;
    if (Math.abs(b.prefW - a.prefW) > FIT_EPS_MM) return b.prefW - a.prefW;
    if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder;
    return a.copyIndex - b.copyIndex;
  });

  const openPages: MutableSheetPage[] = [];

  for (const entry of entries) {
    let placed = false;

    for (const page of openPages) {
      // 1. Try existing shelves on this page
      for (const shelf of page.shelves) {
        const startXMm = shelf.count === 0 ? safeBox.xMm : shelf.cursorXMm + gutterMm;
        const remainingWMm = rightBoundaryMm - startXMm;

        const prefFits =
          entry.prefW <= remainingWMm + FIT_EPS_MM &&
          entry.prefH <= shelf.heightMm + FIT_EPS_MM;
        const altFits =
          entry.altW !== null &&
          entry.altH !== null &&
          entry.altW <= remainingWMm + FIT_EPS_MM &&
          entry.altH <= shelf.heightMm + FIT_EPS_MM;

        if (!prefFits && !altFits) continue;

        let chosenW = entry.prefW;
        let chosenH = entry.prefH;
        let chosenRotated = entry.prefRotated;

        if (!prefFits && altFits && entry.altW !== null && entry.altH !== null) {
          chosenW = entry.altW;
          chosenH = entry.altH;
          chosenRotated = entry.altRotated;
        }

        page.placements.push({
          itemId: entry.itemId,
          label: entry.label,
          copyIndex: entry.copyIndex,
          pageIndex: page.pageIndex,
          xMm: roundTo(startXMm, 3),
          yMm: roundTo(shelf.yMm, 3),
          widthMm: roundTo(chosenW, 3),
          heightMm: roundTo(chosenH, 3),
          rotated90: chosenRotated,
        });

        shelf.cursorXMm = startXMm + chosenW;
        shelf.count += 1;
        placed = true;
        break;
      }

      if (placed) break;

      // 2. Try opening a new shelf on this page
      const prevShelf = page.shelves[page.shelves.length - 1];
      const newYMm = prevShelf
        ? prevShelf.yMm + prevShelf.heightMm + gutterMm
        : safeBox.yMm;
      const remainingHMm = bottomBoundaryMm - newYMm;

      const prefShelfFits =
        entry.prefW <= safeBox.widthMm + FIT_EPS_MM &&
        entry.prefH <= remainingHMm + FIT_EPS_MM;
      const altShelfFits =
        entry.altW !== null &&
        entry.altH !== null &&
        entry.altW <= safeBox.widthMm + FIT_EPS_MM &&
        entry.altH <= remainingHMm + FIT_EPS_MM;

      if (prefShelfFits || altShelfFits) {
        const useAlt = !prefShelfFits && altShelfFits && entry.altW !== null && entry.altH !== null;
        const chosenW = useAlt && entry.altW !== null ? entry.altW : entry.prefW;
        const chosenH = useAlt && entry.altH !== null ? entry.altH : entry.prefH;
        const chosenRotated = useAlt ? entry.altRotated : entry.prefRotated;

        page.shelves.push({
          yMm: newYMm,
          heightMm: chosenH,
          cursorXMm: safeBox.xMm + chosenW,
          count: 1,
        });

        page.placements.push({
          itemId: entry.itemId,
          label: entry.label,
          copyIndex: entry.copyIndex,
          pageIndex: page.pageIndex,
          xMm: roundTo(safeBox.xMm, 3),
          yMm: roundTo(newYMm, 3),
          widthMm: roundTo(chosenW, 3),
          heightMm: roundTo(chosenH, 3),
          rotated90: chosenRotated,
        });

        placed = true;
        break;
      }
    }

    // 3. Overflow onto a new sheet page
    if (!placed) {
      const nextPageIndex = openPages.length;
      const newPage: MutableSheetPage = {
        pageIndex: nextPageIndex,
        shelves: [
          {
            yMm: safeBox.yMm,
            heightMm: entry.prefH,
            cursorXMm: safeBox.xMm + entry.prefW,
            count: 1,
          },
        ],
        placements: [
          {
            itemId: entry.itemId,
            label: entry.label,
            copyIndex: entry.copyIndex,
            pageIndex: nextPageIndex,
            xMm: roundTo(safeBox.xMm, 3),
            yMm: roundTo(safeBox.yMm, 3),
            widthMm: roundTo(entry.prefW, 3),
            heightMm: roundTo(entry.prefH, 3),
            rotated90: entry.prefRotated,
          },
        ],
      };
      openPages.push(newPage);
    }
  }

  const sheetAreaMm2 = sheetWidthMm * sheetHeightMm;
  let totalPlacedCount = 0;
  let totalPlacedAreaMm2 = 0;

  const pages: SheetNestPage[] = openPages.map((page) => {
    let pageAreaMm2 = 0;
    for (const rect of page.placements) {
      pageAreaMm2 += rect.widthMm * rect.heightMm;
    }
    totalPlacedCount += page.placements.length;
    totalPlacedAreaMm2 += pageAreaMm2;

    const efficiencyPct =
      sheetAreaMm2 > 0
        ? roundTo(Math.min(100, (pageAreaMm2 / sheetAreaMm2) * 100), 1)
        : 0;

    return {
      pageIndex: page.pageIndex,
      placements: page.placements,
      efficiencyPct,
    };
  });

  const overallEfficiencyPct =
    pages.length > 0 && sheetAreaMm2 > 0
      ? roundTo(Math.min(100, (totalPlacedAreaMm2 / (pages.length * sheetAreaMm2)) * 100), 1)
      : 0;

  return {
    mediaId,
    sheetWidthMm,
    sheetHeightMm,
    orientation,
    printableSafeBox: safeBox,
    gutterMm,
    pages,
    unplacedIds,
    totalPlacedCount,
    overallEfficiencyPct,
  };
}

function countRotatedPlacements(plan: SheetNestPlan): number {
  let count = 0;
  for (const page of plan.pages) {
    for (const rect of page.placements) {
      if (rect.rotated90) count += 1;
    }
  }
  return count;
}

function isPlanBetter(candidate: SheetNestPlan, current: SheetNestPlan): boolean {
  if (candidate.unplacedIds.length !== current.unplacedIds.length) {
    return candidate.unplacedIds.length < current.unplacedIds.length;
  }
  if (candidate.pages.length !== current.pages.length) {
    return candidate.pages.length < current.pages.length;
  }
  if (Math.abs(candidate.overallEfficiencyPct - current.overallEfficiencyPct) > 0.05) {
    return candidate.overallEfficiencyPct > current.overallEfficiencyPct;
  }
  const candRotated = countRotatedPlacements(candidate);
  const currRotated = countRotatedPlacements(current);
  if (candRotated !== currRotated) {
    return candRotated < currRotated;
  }
  const candSafeArea = candidate.printableSafeBox.widthMm * candidate.printableSafeBox.heightMm;
  const currSafeArea = current.printableSafeBox.widthMm * current.printableSafeBox.heightMm;
  return candSafeArea > currSafeArea + 0.05;
}

/**
 * Deterministic multi-page FFDH shelf 2D bin-packer for nesting single-item N-up jobs or
 * multi-book gang sheets onto fixed desktop cut sheets (Letter, A4, Legal, Tabloid).
 * Evaluates both portrait and landscape orientations and selects the best layout.
 */
export function packItemsOntoSheets(
  items: readonly SheetNestItem[],
  options: PackSheetOptions,
): SheetNestPlan {
  const gutterMm = normalizeGutterMm(options.gutterMm);
  const spec = getPrintMediaSpec(options.mediaId);

  if (spec.kind !== 'sheet' || spec.shortMm === null || spec.longMm === null) {
    const unplacedIds: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const copies = Number.isFinite(item.copies) ? Math.max(0, Math.floor(item.copies)) : 0;
      if (copies > 0 && !seen.has(item.id)) {
        seen.add(item.id);
        unplacedIds.push(item.id);
      }
    }
    return {
      mediaId: options.mediaId,
      sheetWidthMm: 0,
      sheetHeightMm: 0,
      orientation: 'portrait',
      printableSafeBox: EMPTY_SAFE_BOX,
      gutterMm,
      pages: [],
      unplacedIds,
      totalPlacedCount: 0,
      overallEfficiencyPct: 0,
    };
  }

  const effectiveMargins = options.printerMargins
    ? clampPrinterMargins(options.printerMargins)
    : DEFAULT_PRINTER_MARGINS;
  const allowRotation = options.allowRotation ?? true;

  const portraitPlan = packForSheetOrientation(
    items,
    options.mediaId,
    spec.shortMm,
    spec.longMm,
    'portrait',
    effectiveMargins,
    gutterMm,
    allowRotation,
  );

  const landscapePlan = packForSheetOrientation(
    items,
    options.mediaId,
    spec.longMm,
    spec.shortMm,
    'landscape',
    effectiveMargins,
    gutterMm,
    allowRotation,
  );

  return isPlanBetter(landscapePlan, portraitPlan) ? landscapePlan : portraitPlan;
}

function toPdfSafeBox(
  safeBox: PrintableSafeBox,
  pageHeightMm: number,
): PdfSafeBox {
  const bottomMm = Math.max(0, pageHeightMm - safeBox.yMm - safeBox.heightMm);
  const topMm = Math.min(pageHeightMm, bottomMm + safeBox.heightMm);
  return {
    leftMm: safeBox.xMm,
    bottomMm,
    widthMm: safeBox.widthMm,
    heightMm: safeBox.heightMm,
    topMm,
  };
}

/**
 * Composes one or more source 1:1 mm PDFs into a multi-page fixed cut-sheet PDF
 * sized strictly to `[plan.sheetWidthMm, plan.sheetHeightMm]`, embedding each needed source
 * page once and stamping every nested copy inside the printable safe box.
 */
export async function composeNestedSheetPdf(
  sources: readonly SheetPdfSource[],
  options: ComposeNestedSheetPdfOptions,
): Promise<ComposeNestedSheetPdfResult> {
  interface LoadedSource {
    readonly source: SheetPdfSource;
    readonly doc: PDFDocument;
    readonly widthMm: number;
    readonly heightMm: number;
  }

  const loadedSources = new Map<string, LoadedSource>();
  const nestItems: SheetNestItem[] = [];

  for (const src of sources) {
    const doc = await PDFDocument.load(src.pdfBytes);
    const firstPage = doc.getPage(0);
    const { width, height } = firstPage.getSize();
    const widthMm = roundTo(UnitConverter.pointsToMm(width), 3);
    const heightMm = roundTo(UnitConverter.pointsToMm(height), 3);

    loadedSources.set(src.id, { source: src, doc, widthMm, heightMm });
    nestItems.push({
      id: src.id,
      label: src.label,
      widthMm,
      heightMm,
      copies: src.copies,
    });
  }

  const plan = packItemsOntoSheets(nestItems, options);
  const mediaSpec = getPrintMediaSpec(plan.mediaId);

  const outDoc = await PDFDocument.create();
  outDoc.setTitle(
    options.documentTitle ?? `Bookbinder - Nested Cut Sheets (${mediaSpec.shortLabel})`,
  );
  outDoc.setCreator('Bookbinder Studio');

  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await outDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed each needed source PDF page ONCE and reuse across all pages and copies
  const embeddedPages = new Map<string, PDFEmbeddedPage>();
  const neededIds = new Set<string>();
  for (const sheetPage of plan.pages) {
    for (const rect of sheetPage.placements) {
      neededIds.add(rect.itemId);
    }
  }
  for (const id of neededIds) {
    const loaded = loadedSources.get(id);
    if (!loaded) continue;
    const embedded = await outDoc.embedPage(loaded.doc.getPage(0));
    embeddedPages.set(id, embedded);
  }

  const pageWidthMm = plan.sheetWidthMm > 0 ? plan.sheetWidthMm : 50;
  const pageHeightMm = plan.sheetHeightMm > 0 ? plan.sheetHeightMm : 50;
  const pageWPt = UnitConverter.mmToPoints(pageWidthMm);
  const pageHPt = UnitConverter.mmToPoints(pageHeightMm);
  const pageClipRectMm: Rect2D = { x: 0, y: 0, width: pageWidthMm, height: pageHeightMm };
  const pdfSafeBox = toPdfSafeBox(plan.printableSafeBox, pageHeightMm);
  const orientationLabel = plan.orientation === 'landscape' ? 'Landscape' : 'Portrait';

  const pagesToRender: readonly SheetNestPage[] =
    plan.pages.length > 0
      ? plan.pages
      : [{ pageIndex: 0, placements: [], efficiencyPct: 0 }];
  const totalSheets = pagesToRender.length;

  for (const sheetPage of pagesToRender) {
    const page = outDoc.addPage([pageWPt, pageHPt]);
    const scaleBarAvoidRects: Rect2D[] = [];

    for (const rect of sheetPage.placements) {
      const embedded = embeddedPages.get(rect.itemId);
      const loaded = loadedSources.get(rect.itemId);
      if (!embedded || !loaded) continue;

      const pdfLeftMm = rect.xMm;
      const pdfBottomMm = pageHeightMm - rect.yMm - rect.heightMm;
      scaleBarAvoidRects.push({
        x: pdfLeftMm,
        y: pdfBottomMm,
        width: rect.widthMm,
        height: rect.heightMm,
      });

      stampEmbeddedPdfRect(page, embedded, loaded.widthMm, loaded.heightMm, rect, pageHeightMm);

      if (
        loaded.source.externalFoldGuideTicks &&
        loaded.source.externalFoldGuideTicks.length > 0
      ) {
        const srcBleedMm = Math.max(0, loaded.source.bleedMm ?? 0);
        const localTicks = translateTicks(
          loaded.source.externalFoldGuideTicks,
          srcBleedMm,
          srcBleedMm,
        );
        const orientedTicks = rect.rotated90
          ? transformTicks90CW(localTicks, loaded.heightMm)
          : localTicks;
        drawPdfFoldGuideTicks(page, orientedTicks, {
          pageHeightMm,
          offsetXMm: rect.xMm,
          offsetYMm: rect.yMm,
          clipRectMm: pageClipRectMm,
        });
        scaleBarAvoidRects.push(
          ...ticksToPdfAvoidRects(orientedTicks, {
            pageHeightMm,
            offsetXMm: rect.xMm,
            offsetYMm: rect.yMm,
            clipRectMm: pageClipRectMm,
          }),
        );
      }
    }

    if (sheetPage.placements.length > 0) {
      drawNestCropMarksAndGutterGuides(
        page,
        sheetPage.placements,
        pageWidthMm,
        pageHeightMm,
        plan.printableSafeBox.xMm,
        plan.printableSafeBox.xMm + plan.printableSafeBox.widthMm,
      );
    }

    // Clean WinAnsi-safe centered footer strictly inside the printable safe box
    const footerText = `Sheet ${sheetPage.pageIndex + 1} of ${totalSheets} | ${mediaSpec.shortLabel} ${orientationLabel} | ${sheetPage.placements.length} pcs`;
    const footerSizePt = 6.5;
    const footerW = font.widthOfTextAtSize(footerText, footerSizePt);
    const safeCenterXPt = UnitConverter.mmToPoints(
      pdfSafeBox.leftMm + pdfSafeBox.widthMm / 2,
    );
    const footerYMm = Math.max(2.0, pdfSafeBox.bottomMm + 1.5);
    page.drawText(footerText, {
      x: Math.max(UnitConverter.mmToPoints(pdfSafeBox.leftMm), safeCenterXPt - footerW / 2),
      y: UnitConverter.mmToPoints(footerYMm),
      size: footerSizePt,
      font,
      color: rgb(0.32, 0.32, 0.32),
    });

    const canFitHorizontal =
      pdfSafeBox.widthMm >= SCALE_BAR_BOX_W_MM && pdfSafeBox.heightMm >= SCALE_BAR_BOX_H_MM;
    const canFitVertical =
      pdfSafeBox.widthMm >= SCALE_BAR_BOX_H_MM && pdfSafeBox.heightMm >= SCALE_BAR_BOX_W_MM;

    if (options.includeScaleBar && (canFitHorizontal || canFitVertical)) {
      const footerTopMm = footerYMm + 2.6;
      const footerStrip: Rect2D = {
        x: pdfSafeBox.leftMm,
        y: pdfSafeBox.bottomMm,
        width: pdfSafeBox.widthMm,
        height: Math.max(4.0, footerTopMm - pdfSafeBox.bottomMm),
      };
      const placement = planScaleBarPlacement({
        safeBox: pdfSafeBox,
        barWidthMm: SCALE_BAR_BOX_W_MM,
        barHeightMm: SCALE_BAR_BOX_H_MM,
        avoidRects: [...scaleBarAvoidRects, footerStrip],
      });
      drawNestScaleCheckBar(
        page,
        font,
        boldFont,
        placement.xMm,
        placement.yMm,
        placement.rotated90,
      );
    }
  }

  const bytes = await outDoc.save();
  return { bytes, plan };
}
