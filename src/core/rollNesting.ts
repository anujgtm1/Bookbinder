import {
  PDFDocument,
  StandardFonts,
  clip,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFEmbeddedPage,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { UnitConverter, roundTo } from '@/types/units';

export interface RollNestItem {
  readonly id: string;
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly copies: number;
}

export interface RollPlacedRect {
  readonly itemId: string;
  readonly label: string;
  readonly copyIndex: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
}

export interface RollNestPlan {
  readonly rollWidthMm: number;
  readonly sideMarginMm: number;
  readonly printableWidthMm: number;
  readonly gutterMm: number;
  readonly usedLengthMm: number;
  readonly placements: readonly RollPlacedRect[];
  readonly unplacedIds: readonly string[];
  readonly efficiencyPct: number;
  readonly maxCopiesAcrossUnrotated: number;
  readonly maxCopiesAcrossRotated: number;
  readonly recommendedMaxAcross: number;
  readonly recommendedRotated: boolean;
}

export interface SingleItemRollCapacity {
  readonly printableWidthMm: number;
  readonly maxAcrossUnrotated: number;
  readonly maxAcrossRotated: number;
  readonly recommendedMaxAcross: number;
  readonly recommendedRotated: boolean;
  readonly widthUtilizationPct: number;
}

export interface PackRollOptions {
  readonly rollWidthMm: number;
  readonly sideMarginMm?: number;
  readonly leadingMarginMm?: number;
  readonly gutterMm?: number;
  readonly allowRotation?: boolean;
}

export interface RollPdfSource {
  readonly id: string;
  readonly label: string;
  readonly pdfBytes: Uint8Array;
  readonly copies: number;
}

export interface ComposeNestedRollPdfOptions extends PackRollOptions {
  readonly includeScaleBar?: boolean;
}

export interface ComposeNestedRollPdfResult {
  readonly bytes: Uint8Array;
  readonly plan: RollNestPlan;
}

const DEFAULT_SIDE_MARGIN_MM = 5;
const DEFAULT_LEADING_MARGIN_MM = 5;
const DEFAULT_GUTTER_MM = 10;
const FIT_EPS_MM = 0.05;

const SCALE_BAR_LENGTH_MM = 50;
const SCALE_BAR_PAD_X_MM = 2.0;
const SCALE_BAR_BOX_W_MM = SCALE_BAR_LENGTH_MM + SCALE_BAR_PAD_X_MM * 2;
const SCALE_BAR_BOX_H_MM = 8.4;

function computeMaxAcross(spanMm: number, printableWidthMm: number, gutterMm: number): number {
  if (!Number.isFinite(spanMm) || spanMm <= 0 || printableWidthMm <= 0) {
    return 0;
  }
  if (spanMm > printableWidthMm + FIT_EPS_MM) {
    return 0;
  }
  const safeGutter = Math.max(0, gutterMm);
  return Math.max(1, Math.floor((printableWidthMm + safeGutter + FIT_EPS_MM) / (spanMm + safeGutter)));
}

/**
 * Evaluates how many copies of a single rectangular item fit side-by-side across a roll
 * in both unrotated and 90°-rotated orientations, returning the recommended orientation
 * and width utilization percentage.
 */
export function evaluateSingleItemRollCapacity(
  itemWidthMm: number,
  itemHeightMm: number,
  rollWidthMm: number,
  sideMarginMm = DEFAULT_SIDE_MARGIN_MM,
  gutterMm = DEFAULT_GUTTER_MM,
): SingleItemRollCapacity {
  const safeRollW = Math.max(0, Number.isFinite(rollWidthMm) ? rollWidthMm : 0);
  const safeSideMargin = Math.max(0, Number.isFinite(sideMarginMm) ? sideMarginMm : DEFAULT_SIDE_MARGIN_MM);
  const safeGutter = Math.max(0, Number.isFinite(gutterMm) ? gutterMm : DEFAULT_GUTTER_MM);
  const printableWidthMm = roundTo(Math.max(0, safeRollW - safeSideMargin * 2), 3);

  const maxAcrossUnrotated = computeMaxAcross(itemWidthMm, printableWidthMm, safeGutter);
  const maxAcrossRotated = computeMaxAcross(itemHeightMm, printableWidthMm, safeGutter);

  let recommendedRotated = false;
  let recommendedMaxAcross = 0;

  if (maxAcrossUnrotated === 0 && maxAcrossRotated === 0) {
    recommendedRotated = false;
    recommendedMaxAcross = 0;
  } else if (maxAcrossUnrotated === 0) {
    recommendedRotated = true;
    recommendedMaxAcross = maxAcrossRotated;
  } else if (maxAcrossRotated === 0) {
    recommendedRotated = false;
    recommendedMaxAcross = maxAcrossUnrotated;
  } else if (maxAcrossRotated > maxAcrossUnrotated) {
    recommendedRotated = true;
    recommendedMaxAcross = maxAcrossRotated;
  } else if (maxAcrossUnrotated > maxAcrossRotated) {
    recommendedRotated = false;
    recommendedMaxAcross = maxAcrossUnrotated;
  } else {
    // Same count across: prefer the orientation with smaller strip height along the roll feed
    recommendedRotated = itemWidthMm < itemHeightMm - FIT_EPS_MM;
    recommendedMaxAcross = recommendedRotated ? maxAcrossRotated : maxAcrossUnrotated;
  }

  const chosenSpanMm = recommendedRotated ? itemHeightMm : itemWidthMm;
  const widthUtilizationPct =
    printableWidthMm > 0 && recommendedMaxAcross > 0
      ? roundTo(Math.min(100, ((recommendedMaxAcross * chosenSpanMm) / printableWidthMm) * 100), 1)
      : 0;

  return {
    printableWidthMm,
    maxAcrossUnrotated,
    maxAcrossRotated,
    recommendedMaxAcross,
    recommendedRotated,
    widthUtilizationPct,
  };
}

interface PackEntry {
  readonly itemId: string;
  readonly label: string;
  readonly copyIndex: number;
  readonly itemOrder: number;
  readonly origW: number;
  readonly origH: number;
  readonly prefW: number;
  readonly prefH: number;
  readonly prefRotated: boolean;
  readonly altW: number | null;
  readonly altH: number | null;
  readonly altRotated: boolean;
}

interface ShelfRow {
  readonly yMm: number;
  readonly heightMm: number;
  cursorXMm: number;
  count: number;
}

/**
 * Deterministic First-Fit Decreasing Height (FFDH) shelf-strip 2D bin-packer
 * for nesting single-item N-up jobs or multi-book gang sheets onto a wide-format roll.
 */
export function packItemsOntoRoll(
  items: readonly RollNestItem[],
  options: PackRollOptions,
): RollNestPlan {
  const rollWidthMm = Math.max(0, Number.isFinite(options.rollWidthMm) ? options.rollWidthMm : 0);
  const sideMarginMm = Math.max(
    0,
    Number.isFinite(options.sideMarginMm) ? (options.sideMarginMm as number) : DEFAULT_SIDE_MARGIN_MM,
  );
  const leadingMarginMm = Math.max(
    0,
    Number.isFinite(options.leadingMarginMm)
      ? (options.leadingMarginMm as number)
      : DEFAULT_LEADING_MARGIN_MM,
  );
  const gutterMm = Math.max(
    0,
    Number.isFinite(options.gutterMm) ? (options.gutterMm as number) : DEFAULT_GUTTER_MM,
  );
  const allowRotation = options.allowRotation ?? true;
  const printableWidthMm = roundTo(Math.max(0, rollWidthMm - sideMarginMm * 2), 3);

  const firstItem = items[0];
  const primaryCapacity = firstItem
    ? evaluateSingleItemRollCapacity(
        firstItem.widthMm,
        firstItem.heightMm,
        rollWidthMm,
        sideMarginMm,
        gutterMm,
      )
    : {
        printableWidthMm,
        maxAcrossUnrotated: 0,
        maxAcrossRotated: 0,
        recommendedMaxAcross: 0,
        recommendedRotated: false,
        widthUtilizationPct: 0,
      };

  const recommendedRotated = allowRotation ? primaryCapacity.recommendedRotated : false;
  const recommendedMaxAcross = allowRotation
    ? primaryCapacity.recommendedMaxAcross
    : primaryCapacity.maxAcrossUnrotated;

  const entries: PackEntry[] = [];
  const unplacedIds: string[] = [];
  const unplacedSet = new Set<string>();

  items.forEach((item, itemOrder) => {
    const copies = Number.isFinite(item.copies) ? Math.max(0, Math.floor(item.copies)) : 0;
    if (copies === 0) return;

    const w = item.widthMm;
    const h = item.heightMm;
    const validDims = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
    const fitsUnrotated = validDims && w <= printableWidthMm + FIT_EPS_MM;
    const fitsRotated = allowRotation && validDims && h <= printableWidthMm + FIT_EPS_MM;

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
      const maxU = computeMaxAcross(w, printableWidthMm, gutterMm);
      const maxR = computeMaxAcross(h, printableWidthMm, gutterMm);
      const rowsU = Math.ceil(copies / Math.max(1, maxU));
      const rowsR = Math.ceil(copies / Math.max(1, maxR));
      const lengthU = rowsU * h + Math.max(0, rowsU - 1) * gutterMm;
      const lengthR = rowsR * w + Math.max(0, rowsR - 1) * gutterMm;

      if (lengthR < lengthU - FIT_EPS_MM) {
        preferRotated = true;
      } else if (lengthU < lengthR - FIT_EPS_MM) {
        preferRotated = false;
      } else if (maxR !== maxU) {
        preferRotated = maxR > maxU;
      } else {
        preferRotated = false;
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
        origW: w,
        origH: h,
        prefW,
        prefH,
        prefRotated: preferRotated,
        altW,
        altH,
        altRotated: !preferRotated,
      });
    }
  });

  // Deterministic FFDH ordering: tallest preferred shelf height first, then widest, then input order
  entries.sort((a, b) => {
    if (Math.abs(b.prefH - a.prefH) > FIT_EPS_MM) return b.prefH - a.prefH;
    if (Math.abs(b.prefW - a.prefW) > FIT_EPS_MM) return b.prefW - a.prefW;
    if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder;
    return a.copyIndex - b.copyIndex;
  });

  const shelves: ShelfRow[] = [];
  const placements: RollPlacedRect[] = [];
  const rightBoundaryMm = sideMarginMm + printableWidthMm;

  for (const entry of entries) {
    let placed = false;

    for (const shelf of shelves) {
      const startXMm = shelf.count === 0 ? sideMarginMm : shelf.cursorXMm + gutterMm;
      const remainingWMm = rightBoundaryMm - startXMm;

      const prefFits =
        entry.prefW <= remainingWMm + FIT_EPS_MM && entry.prefH <= shelf.heightMm + FIT_EPS_MM;
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

      placements.push({
        itemId: entry.itemId,
        label: entry.label,
        copyIndex: entry.copyIndex,
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

    if (!placed) {
      const prevShelf = shelves[shelves.length - 1];
      const newYMm = prevShelf
        ? prevShelf.yMm + prevShelf.heightMm + gutterMm
        : leadingMarginMm;
      const newShelf: ShelfRow = {
        yMm: newYMm,
        heightMm: entry.prefH,
        cursorXMm: sideMarginMm + entry.prefW,
        count: 1,
      };
      shelves.push(newShelf);

      placements.push({
        itemId: entry.itemId,
        label: entry.label,
        copyIndex: entry.copyIndex,
        xMm: roundTo(sideMarginMm, 3),
        yMm: roundTo(newYMm, 3),
        widthMm: roundTo(entry.prefW, 3),
        heightMm: roundTo(entry.prefH, 3),
        rotated90: entry.prefRotated,
      });
    }
  }

  let maxBottomMm = 0;
  let totalPlacedAreaMm2 = 0;
  for (const rect of placements) {
    const bottom = rect.yMm + rect.heightMm;
    if (bottom > maxBottomMm) maxBottomMm = bottom;
    totalPlacedAreaMm2 += rect.widthMm * rect.heightMm;
  }

  const usedLengthMm =
    placements.length > 0 ? roundTo(maxBottomMm + leadingMarginMm, 2) : 0;
  const totalRollAreaMm2 = rollWidthMm * usedLengthMm;
  const efficiencyPct =
    totalRollAreaMm2 > 0
      ? roundTo(Math.min(100, (totalPlacedAreaMm2 / totalRollAreaMm2) * 100), 1)
      : 0;

  return {
    rollWidthMm,
    sideMarginMm,
    printableWidthMm,
    gutterMm,
    usedLengthMm,
    placements,
    unplacedIds,
    efficiencyPct,
    maxCopiesAcrossUnrotated: primaryCapacity.maxAcrossUnrotated,
    maxCopiesAcrossRotated: primaryCapacity.maxAcrossRotated,
    recommendedMaxAcross,
    recommendedRotated,
  };
}

function formatRollInches(rollWidthMm: number): string {
  const inches = UnitConverter.mmToInches(rollWidthMm);
  const nearestInt = Math.round(inches);
  if (Math.abs(inches - nearestInt) < 0.06) {
    return String(nearestInt);
  }
  return String(roundTo(inches, 1));
}

function drawScaleCheckBar(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  originXMm: number,
  originYMm: number,
): void {
  const barX0Mm = originXMm + SCALE_BAR_PAD_X_MM;
  const baselineYMm = originYMm + 3.0;

  page.drawRectangle({
    x: UnitConverter.mmToPoints(originXMm),
    y: UnitConverter.mmToPoints(originYMm),
    width: UnitConverter.mmToPoints(SCALE_BAR_BOX_W_MM),
    height: UnitConverter.mmToPoints(SCALE_BAR_BOX_H_MM),
    color: rgb(1, 1, 1),
    opacity: 0.92,
    borderColor: rgb(0.72, 0.72, 0.72),
    borderWidth: 0.35,
  });

  const strokeColor = rgb(0.12, 0.12, 0.12);
  const mutedColor = rgb(0.32, 0.32, 0.32);

  page.drawLine({
    start: {
      x: UnitConverter.mmToPoints(barX0Mm),
      y: UnitConverter.mmToPoints(baselineYMm),
    },
    end: {
      x: UnitConverter.mmToPoints(barX0Mm + SCALE_BAR_LENGTH_MM),
      y: UnitConverter.mmToPoints(baselineYMm),
    },
    color: strokeColor,
    thickness: 0.75,
  });

  for (let mm = 0; mm <= SCALE_BAR_LENGTH_MM; mm += 5) {
    const isMajor = mm % 10 === 0;
    const tickHeightMm = isMajor ? 1.9 : 1.0;
    const txPt = UnitConverter.mmToPoints(barX0Mm + mm);
    page.drawLine({
      start: { x: txPt, y: UnitConverter.mmToPoints(baselineYMm) },
      end: { x: txPt, y: UnitConverter.mmToPoints(baselineYMm + tickHeightMm) },
      color: strokeColor,
      thickness: isMajor ? 0.65 : 0.4,
    });

    if (isMajor) {
      const tickLabel = String(mm);
      const labelW = font.widthOfTextAtSize(tickLabel, 4.8);
      page.drawText(tickLabel, {
        x: txPt - labelW / 2,
        y: UnitConverter.mmToPoints(originYMm + 0.8),
        size: 4.8,
        font,
        color: mutedColor,
      });
    }
  }

  page.drawText('50 mm Scale Check', {
    x: UnitConverter.mmToPoints(barX0Mm),
    y: UnitConverter.mmToPoints(originYMm + 5.6),
    size: 5.2,
    font: boldFont,
    color: strokeColor,
  });
}

function drawCropMarksAndGutterGuides(
  page: PDFPage,
  plan: RollNestPlan,
  pageHeightMm: number,
): void {
  const cropColor = rgb(0.45, 0.45, 0.45);
  const gutterColor = rgb(0.58, 0.58, 0.58);
  const markOffsetMm = 0.8;
  const markLenMm = 2.6;

  // 1. Subtle corner crop ticks around every placed piece
  for (const rect of plan.placements) {
    const leftMm = rect.xMm;
    const rightMm = rect.xMm + rect.widthMm;
    const pdfBottomMm = pageHeightMm - rect.yMm - rect.heightMm;
    const pdfTopMm = pageHeightMm - rect.yMm;

    const corners: readonly {
      x: number;
      y: number;
      dx: -1 | 1;
      dy: -1 | 1;
    }[] = [
      { x: leftMm, y: pdfTopMm, dx: -1, dy: 1 },
      { x: rightMm, y: pdfTopMm, dx: 1, dy: 1 },
      { x: leftMm, y: pdfBottomMm, dx: -1, dy: -1 },
      { x: rightMm, y: pdfBottomMm, dx: 1, dy: -1 },
    ];

    for (const c of corners) {
      const hx1 = Math.max(0, Math.min(plan.rollWidthMm, c.x + c.dx * markOffsetMm));
      const hx2 = Math.max(0, Math.min(plan.rollWidthMm, c.x + c.dx * (markOffsetMm + markLenMm)));
      if (Math.abs(hx2 - hx1) > 0.2) {
        page.drawLine({
          start: { x: UnitConverter.mmToPoints(hx1), y: UnitConverter.mmToPoints(c.y) },
          end: { x: UnitConverter.mmToPoints(hx2), y: UnitConverter.mmToPoints(c.y) },
          color: cropColor,
          thickness: 0.35,
        });
      }

      const vy1 = Math.max(0, Math.min(pageHeightMm, c.y + c.dy * markOffsetMm));
      const vy2 = Math.max(0, Math.min(pageHeightMm, c.y + c.dy * (markOffsetMm + markLenMm)));
      if (Math.abs(vy2 - vy1) > 0.2) {
        page.drawLine({
          start: { x: UnitConverter.mmToPoints(c.x), y: UnitConverter.mmToPoints(vy1) },
          end: { x: UnitConverter.mmToPoints(c.x), y: UnitConverter.mmToPoints(vy2) },
          color: cropColor,
          thickness: 0.35,
        });
      }
    }
  }

  // 2. Hairline dashed cut-gutter guides between nested pieces (vertical & horizontal gutters)
  const shelfRows = new Map<number, RollPlacedRect[]>();
  for (const rect of plan.placements) {
    const key = roundTo(rect.yMm, 2);
    const list = shelfRows.get(key) ?? [];
    list.push(rect);
    shelfRows.set(key, list);
  }

  const sortedRowYs = [...shelfRows.keys()].sort((a, b) => a - b);
  for (let rowIdx = 0; rowIdx < sortedRowYs.length; rowIdx += 1) {
    const rowY = sortedRowYs[rowIdx];
    const rowRects = (shelfRows.get(rowY) ?? []).slice().sort((a, b) => a.xMm - b.xMm);
    const rowMaxH = Math.max(...rowRects.map((r) => r.heightMm));

    // Vertical dashed cut lines midway between adjacent items in the same shelf
    for (let i = 0; i < rowRects.length - 1; i += 1) {
      const leftRect = rowRects[i];
      const rightRect = rowRects[i + 1];
      const midXMm = (leftRect.xMm + leftRect.widthMm + rightRect.xMm) / 2;
      const topPdfYMm = pageHeightMm - rowY;
      const bottomPdfYMm = pageHeightMm - (rowY + rowMaxH);

      page.drawLine({
        start: { x: UnitConverter.mmToPoints(midXMm), y: UnitConverter.mmToPoints(bottomPdfYMm) },
        end: { x: UnitConverter.mmToPoints(midXMm), y: UnitConverter.mmToPoints(topPdfYMm) },
        color: gutterColor,
        thickness: 0.3,
        dashArray: [2.5, 2.5],
      });
    }

    // Horizontal dashed cut line midway between consecutive shelves
    if (rowIdx < sortedRowYs.length - 1) {
      const nextRowY = sortedRowYs[rowIdx + 1];
      const midTopDownYMm = (rowY + rowMaxH + nextRowY) / 2;
      const midPdfYMm = pageHeightMm - midTopDownYMm;
      const lineStartXMm = Math.max(0, plan.sideMarginMm);
      const lineEndXMm = Math.min(plan.rollWidthMm, plan.sideMarginMm + plan.printableWidthMm);

      page.drawLine({
        start: { x: UnitConverter.mmToPoints(lineStartXMm), y: UnitConverter.mmToPoints(midPdfYMm) },
        end: { x: UnitConverter.mmToPoints(lineEndXMm), y: UnitConverter.mmToPoints(midPdfYMm) },
        color: gutterColor,
        thickness: 0.3,
        dashArray: [2.5, 2.5],
      });
    }
  }
}

/**
 * Composes one or more source 1:1 mm PDFs into a single-page wide-format roll PDF
 * sized to `rollWidthMm x plan.usedLengthMm`, embedding each source page once and
 * stamping every nested copy (including clean 90° clockwise rotation where selected).
 */
export async function composeNestedRollPdf(
  sources: readonly RollPdfSource[],
  options: ComposeNestedRollPdfOptions,
): Promise<ComposeNestedRollPdfResult> {
  interface LoadedSource {
    readonly source: RollPdfSource;
    readonly doc: PDFDocument;
    readonly widthMm: number;
    readonly heightMm: number;
  }

  const loadedSources = new Map<string, LoadedSource>();
  const nestItems: RollNestItem[] = [];

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

  const plan = packItemsOntoRoll(nestItems, options);

  const outDoc = await PDFDocument.create();
  const rollInchesLabel = formatRollInches(plan.rollWidthMm);
  outDoc.setTitle(`Bookbinder - Nested Roll Sheet (${rollInchesLabel}" Roll)`);
  outDoc.setCreator('Bookbinder Studio');

  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await outDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed each needed source PDF page ONCE and reuse across all stamped copies
  const embeddedPages = new Map<string, PDFEmbeddedPage>();
  const neededIds = new Set(plan.placements.map((p) => p.itemId));
  for (const id of neededIds) {
    const loaded = loadedSources.get(id);
    if (!loaded) continue;
    const embedded = await outDoc.embedPage(loaded.doc.getPage(0));
    embeddedPages.set(id, embedded);
  }

  const pageWidthMm = Math.max(1, plan.rollWidthMm);
  const pageHeightMm = plan.usedLengthMm > 0 ? plan.usedLengthMm : 50;
  const pageWPt = UnitConverter.mmToPoints(pageWidthMm);
  const pageHPt = UnitConverter.mmToPoints(pageHeightMm);
  const page = outDoc.addPage([pageWPt, pageHPt]);

  for (const rect of plan.placements) {
    const embedded = embeddedPages.get(rect.itemId);
    const loaded = loadedSources.get(rect.itemId);
    if (!embedded || !loaded) continue;

    const pdfLeftMm = rect.xMm;
    const pdfBottomMm = pageHeightMm - rect.yMm - rect.heightMm;
    const pdfTopMm = pageHeightMm - rect.yMm;

    page.pushOperators(
      pushGraphicsState(),
      rectangle(
        UnitConverter.mmToPoints(pdfLeftMm),
        UnitConverter.mmToPoints(pdfBottomMm),
        UnitConverter.mmToPoints(rect.widthMm),
        UnitConverter.mmToPoints(rect.heightMm),
      ),
      clip(),
      endPath(),
    );

    if (rect.rotated90) {
      // 90 deg CW rotation: local [0..origW] x [0..origH] maps to
      // x in [pdfLeftMm, pdfLeftMm + origH], y in [pdfTopMm - origW, pdfTopMm] = [pdfBottomMm, pdfTopMm]
      page.drawPage(embedded, {
        x: UnitConverter.mmToPoints(pdfLeftMm),
        y: UnitConverter.mmToPoints(pdfTopMm),
        width: UnitConverter.mmToPoints(loaded.widthMm),
        height: UnitConverter.mmToPoints(loaded.heightMm),
        rotate: degrees(-90),
      });
    } else {
      page.drawPage(embedded, {
        x: UnitConverter.mmToPoints(pdfLeftMm),
        y: UnitConverter.mmToPoints(pdfBottomMm),
        width: UnitConverter.mmToPoints(loaded.widthMm),
        height: UnitConverter.mmToPoints(loaded.heightMm),
      });
    }

    page.pushOperators(popGraphicsState());
  }

  if (plan.placements.length > 0) {
    drawCropMarksAndGutterGuides(page, plan, pageHeightMm);
  }

  // Clean WinAnsi-safe roll footer
  const footerText = `Roll ${rollInchesLabel}" (${Math.round(plan.rollWidthMm)} mm) | Used ${Math.round(plan.usedLengthMm)} mm | ${plan.efficiencyPct}% efficiency`;
  const footerSizePt = 6.0;
  const footerW = font.widthOfTextAtSize(footerText, footerSizePt);
  page.drawText(footerText, {
    x: Math.max(UnitConverter.mmToPoints(2), (pageWPt - footerW) / 2),
    y: UnitConverter.mmToPoints(1.6),
    size: footerSizePt,
    font,
    color: rgb(0.32, 0.32, 0.32),
  });

  if (options.includeScaleBar && pageWidthMm >= SCALE_BAR_BOX_W_MM + 4 && pageHeightMm >= SCALE_BAR_BOX_H_MM + 4) {
    const scaleOriginXMm = Math.min(plan.sideMarginMm, Math.max(2, pageWidthMm - SCALE_BAR_BOX_W_MM - 2));
    const scaleOriginYMm = Math.max(2, pageHeightMm - SCALE_BAR_BOX_H_MM - 2);
    drawScaleCheckBar(page, font, boldFont, scaleOriginXMm, scaleOriginYMm);
  }

  const bytes = await outDoc.save();
  return { bytes, plan };
}
