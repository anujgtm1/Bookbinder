import {
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
import { drawScaleCheckBar } from './pdfSheetLayout';
import { SCALE_BAR_BOX_H_MM, SCALE_BAR_BOX_W_MM } from './scaleBarPlacement';

export { SCALE_BAR_BOX_H_MM, SCALE_BAR_BOX_W_MM };

export interface NestPlacedRectLike {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
}

/**
 * Draws the 50 mm physical scale-check calibration bar at PDF bottom-up millimeter origin
 * `(originXMm, originYMm)` in either horizontal (`rotated90 = false`) or 90° CCW vertical orientation.
 */
export function drawNestScaleCheckBar(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  originXMm: number,
  originYMm: number,
  rotated90 = false,
): void {
  drawScaleCheckBar(page, font, boldFont, {
    xMm: originXMm,
    yMm: originYMm,
    rotated90,
  });
}

/**
 * Stamps an embedded 1:1 mm PDF page into its target top-down placement rectangle on `page`,
 * clipping strictly to the placed bounds and applying exact `-90°` CW rotation when `rect.rotated90` is true.
 */
export function stampEmbeddedPdfRect(
  page: PDFPage,
  embedded: PDFEmbeddedPage,
  sourceWidthMm: number,
  sourceHeightMm: number,
  rect: NestPlacedRectLike,
  pageHeightMm: number,
): void {
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
      width: UnitConverter.mmToPoints(sourceWidthMm),
      height: UnitConverter.mmToPoints(sourceHeightMm),
      rotate: degrees(-90),
    });
  } else {
    page.drawPage(embedded, {
      x: UnitConverter.mmToPoints(pdfLeftMm),
      y: UnitConverter.mmToPoints(pdfBottomMm),
      width: UnitConverter.mmToPoints(sourceWidthMm),
      height: UnitConverter.mmToPoints(sourceHeightMm),
    });
  }

  page.pushOperators(popGraphicsState());
}

/**
 * Draws corner crop ticks around every placed piece and hairline dashed cut-gutter guides
 * midway between adjacent shelf pieces and consecutive shelf rows.
 */
export function drawNestCropMarksAndGutterGuides(
  page: PDFPage,
  placements: readonly NestPlacedRectLike[],
  boundsWidthMm: number,
  pageHeightMm: number,
  gutterXStartMm: number,
  gutterXEndMm: number,
): void {
  const cropColor = rgb(0.45, 0.45, 0.45);
  const gutterColor = rgb(0.58, 0.58, 0.58);
  const markOffsetMm = 0.8;
  const markLenMm = 2.6;

  // 1. Subtle corner crop ticks around every placed piece
  for (const rect of placements) {
    const leftMm = rect.xMm;
    const rightMm = rect.xMm + rect.widthMm;
    const pdfBottomMm = pageHeightMm - rect.yMm - rect.heightMm;
    const pdfTopMm = pageHeightMm - rect.yMm;

    const corners: readonly {
      readonly x: number;
      readonly y: number;
      readonly dx: -1 | 1;
      readonly dy: -1 | 1;
    }[] = [
      { x: leftMm, y: pdfTopMm, dx: -1, dy: 1 },
      { x: rightMm, y: pdfTopMm, dx: 1, dy: 1 },
      { x: leftMm, y: pdfBottomMm, dx: -1, dy: -1 },
      { x: rightMm, y: pdfBottomMm, dx: 1, dy: -1 },
    ];

    for (const c of corners) {
      const hx1 = Math.max(0, Math.min(boundsWidthMm, c.x + c.dx * markOffsetMm));
      const hx2 = Math.max(0, Math.min(boundsWidthMm, c.x + c.dx * (markOffsetMm + markLenMm)));
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
  const shelfRows = new Map<number, NestPlacedRectLike[]>();
  for (const rect of placements) {
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
      const lineStartXMm = Math.max(0, gutterXStartMm);
      const lineEndXMm = Math.min(boundsWidthMm, gutterXEndMm);

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
