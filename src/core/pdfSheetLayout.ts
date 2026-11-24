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
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { TILE_OVERLAP_MM, clampTileOverlapMm, evaluatePrintMediaFit } from '@/core/geometry';
import {
  DEFAULT_PRINTER_MARGINS,
  clampPrinterMargins,
  computePrintableSafeBox,
  type PrinterMargins,
} from '@/core/printerMargins';
import { getPrintMediaSpec } from '@/resources/paperSpecs';
import type { PrintMediaId } from '@/types/bookParams';
import type { PrintMediaFitEvaluation } from '@/types/geometry';
import { UnitConverter } from '@/types/units';

export interface RollGangQueueItem {
  readonly id: string;
  readonly label: string;
  readonly pdfBytes: Uint8Array;
  readonly copies: number;
}

export interface RollNestingExportOptions {
  readonly enabled: boolean;
  readonly copies: number;
  readonly gutterMm: number;
  readonly packInnerPockets: boolean;
  readonly allowRotation: boolean;
  readonly extraQueueItems?: readonly RollGangQueueItem[];
}

export interface PdfSheetLayoutOptions {
  readonly printMediaId: PrintMediaId;
  readonly tileOverlapMm?: number;
  readonly includeScaleBar?: boolean;
  readonly documentTitle?: string;
  /** Optional symmetric bleed margin on sourceBytes (mm per side) excluded from print-media fit bounds. */
  readonly bleedMm?: number;
  /** Optional per-edge hardware unprintable printer margins (defaults to 5 mm all sides). */
  readonly printerMargins?: PrinterMargins;
  /** Optional custom wide-format roll width in mm when printMediaId === 'roll-custom'. */
  readonly customRollWidthMm?: number;
}

interface PdfSafeBox {
  readonly leftMm: number;
  readonly bottomMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly topMm: number;
}

function computePdfSafeBox(
  sheetWMm: number,
  sheetHMm: number,
  margins?: PrinterMargins,
): PdfSafeBox {
  const effective = margins ? clampPrinterMargins(margins) : DEFAULT_PRINTER_MARGINS;
  const topDown = computePrintableSafeBox(sheetWMm, sheetHMm, effective);
  const bottomMm = Math.max(0, sheetHMm - topDown.yMm - topDown.heightMm);
  const topMm = Math.min(sheetHMm, bottomMm + topDown.heightMm);
  return {
    leftMm: topDown.xMm,
    bottomMm,
    widthMm: topDown.widthMm,
    heightMm: topDown.heightMm,
    topMm,
  };
}

const SCALE_BAR_LENGTH_MM = 50;
const SCALE_BAR_PAD_X_MM = 2.0;
const SCALE_BAR_BOX_W_MM = SCALE_BAR_LENGTH_MM + SCALE_BAR_PAD_X_MM * 2;
const SCALE_BAR_BOX_H_MM = 8.4;

/**
 * Draws a crisp 50.0 mm physical calibration ruler bar (0/10/20/30/40/50 mm ticks)
 * so users can verify 100% Actual Size printing with a ruler.
 */
function drawScaleCheckBar(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  originXMm: number,
  originYMm: number,
): void {
  const barX0Mm = originXMm + SCALE_BAR_PAD_X_MM;
  const baselineYMm = originYMm + 3.0;

  // Light semi-opaque backing strip so ticks & label stay readable over artwork or margins
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

  // Exact 50.0 mm horizontal baseline
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

  // 0, 10, 20, 30, 40, 50 mm major ticks (+ 5 mm half-cm ticks)
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

function drawCenteredSheetFooter(
  targetPage: PDFPage,
  footerFont: PDFFont,
  safeBox: PdfSafeBox,
  text: string,
): void {
  const fontSizePt = 6.5;
  const textW = footerFont.widthOfTextAtSize(text, fontSizePt);
  const centerXPt = UnitConverter.mmToPoints(safeBox.leftMm + safeBox.widthMm / 2);
  const footerYMm = Math.max(2.0, safeBox.bottomMm + 1.5);
  targetPage.drawText(text, {
    x: centerXPt - textW / 2,
    y: UnitConverter.mmToPoints(footerYMm),
    size: fontSizePt,
    font: footerFont,
    color: rgb(0.32, 0.32, 0.32),
  });
}

function drawCenteredSheetHeader(
  targetPage: PDFPage,
  boldFont: PDFFont,
  safeBox: PdfSafeBox,
  sheetHMm: number,
  text: string,
): void {
  const fontSizePt = 7.0;
  const textW = boldFont.widthOfTextAtSize(text, fontSizePt);
  const centerXPt = UnitConverter.mmToPoints(safeBox.leftMm + safeBox.widthMm / 2);
  const headerYMm = Math.min(sheetHMm - 4.2, safeBox.topMm - 3.2);
  targetPage.drawText(text, {
    x: centerXPt - textW / 2,
    y: UnitConverter.mmToPoints(headerYMm),
    size: fontSizePt,
    font: boldFont,
    color: rgb(0.18, 0.18, 0.18),
  });
}

function drawTileOverlapOverlay(
  tilePage: PDFPage,
  boldFont: PDFFont,
  safeBox: PdfSafeBox,
  sheetHMm: number,
  seamXMm: number,
  overlapMm: number,
  side: 'left' | 'right',
): void {
  const halfOverlapMm = overlapMm / 2;
  const zoneLeftMm = seamXMm - halfOverlapMm;
  const zoneRightMm = seamXMm + halfOverlapMm;
  const seamXPt = UnitConverter.mmToPoints(seamXMm);
  const zoneLeftPt = UnitConverter.mmToPoints(zoneLeftMm);
  const zoneRightPt = UnitConverter.mmToPoints(zoneRightMm);
  const lineBottomMm = Math.max(5.5, safeBox.bottomMm + 1.5);
  const lineTopMm = Math.min(sheetHMm - 6.0, safeBox.topMm - 1.5);
  const lineBottomPt = UnitConverter.mmToPoints(lineBottomMm);
  const lineTopPt = UnitConverter.mmToPoints(lineTopMm);

  // Translucent shaded overlap & tape strip
  tilePage.drawRectangle({
    x: zoneLeftPt,
    y: lineBottomPt,
    width: UnitConverter.mmToPoints(overlapMm),
    height: UnitConverter.mmToPoints(Math.max(0, lineTopMm - lineBottomMm)),
    color: rgb(0.12, 0.42, 0.88),
    opacity: 0.08,
  });

  // Dashed outer boundaries of the overlap & tape zone
  for (const edgeXPt of [zoneLeftPt, zoneRightPt]) {
    tilePage.drawLine({
      start: { x: edgeXPt, y: lineBottomPt },
      end: { x: edgeXPt, y: lineTopPt },
      color: rgb(0.45, 0.45, 0.45),
      thickness: 0.35,
      dashArray: [2, 2.5],
    });
  }

  // Crisp dashed seam centerline where Sheet 1 & Sheet 2 align
  tilePage.drawLine({
    start: { x: seamXPt, y: lineBottomPt },
    end: { x: seamXPt, y: lineTopPt },
    color: rgb(0.12, 0.42, 0.88),
    thickness: 0.55,
    dashArray: [3.5, 2],
  });

  // Top & bottom alignment crosshair targets along the seam centerline (strictly inside safe box)
  const crossRadiusPt = UnitConverter.mmToPoints(2.0);
  const crossArmPt = UnitConverter.mmToPoints(3.2);
  const crossYPositionsMm = [
    Math.min(lineTopMm - 4.0, lineBottomMm + 3.5),
    Math.max(lineBottomMm + 4.0, lineTopMm - 3.5),
  ];
  const crossColor = rgb(0.12, 0.42, 0.88);
  for (const cyMm of crossYPositionsMm) {
    const cyPt = UnitConverter.mmToPoints(cyMm);
    tilePage.drawCircle({
      x: seamXPt,
      y: cyPt,
      size: crossRadiusPt,
      borderColor: crossColor,
      borderWidth: 0.5,
    });
    tilePage.drawLine({
      start: { x: seamXPt - crossArmPt, y: cyPt },
      end: { x: seamXPt + crossArmPt, y: cyPt },
      color: crossColor,
      thickness: 0.45,
    });
    tilePage.drawLine({
      start: { x: seamXPt, y: cyPt - crossArmPt },
      end: { x: seamXPt, y: cyPt + crossArmPt },
      color: crossColor,
      thickness: 0.45,
    });
  }

  // Vertical overlap zone label tucked alongside the seam centerline
  const zoneLabel = `OVERLAP & TAPE ZONE (${overlapMm} mm)`;
  const labelSizePt = 5.5;
  const labelWidthPt = boldFont.widthOfTextAtSize(zoneLabel, labelSizePt);
  const labelCenterXMm = seamXMm + (side === 'left' ? -halfOverlapMm / 2 : halfOverlapMm / 2);
  const labelXPt = UnitConverter.mmToPoints(labelCenterXMm) + labelSizePt * 0.34;
  const labelYPt = UnitConverter.mmToPoints((lineBottomMm + lineTopMm) / 2) - labelWidthPt / 2;
  tilePage.drawText(zoneLabel, {
    x: labelXPt,
    y: labelYPt,
    size: labelSizePt,
    font: boldFont,
    color: rgb(0.12, 0.34, 0.72),
    rotate: degrees(90),
  });
}

async function layoutSingleSheetCenteredPdf(
  sourceBytes: Uint8Array,
  sourceWidthMm: number,
  sourceHeightMm: number,
  fit: PrintMediaFitEvaluation,
  sheetWMm: number,
  sheetHMm: number,
  options: PdfSheetLayoutOptions,
): Promise<Uint8Array> {
  const mediaLabel = getPrintMediaSpec(fit.mediaId).label;
  const outDoc = await PDFDocument.create();
  outDoc.setTitle(
    options.documentTitle ?? `Bookbinder — Print-Ready Outer Cover (${mediaLabel})`,
  );
  outDoc.setCreator('Bookbinder Studio');

  const [embeddedSource] = await outDoc.embedPdf(sourceBytes);
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const sheetWPt = UnitConverter.mmToPoints(sheetWMm);
  const sheetHPt = UnitConverter.mmToPoints(sheetHMm);
  const sourceWPt = UnitConverter.mmToPoints(sourceWidthMm);
  const sourceHPt = UnitConverter.mmToPoints(sourceHeightMm);
  const safeBox = computePdfSafeBox(sheetWMm, sheetHMm, options.printerMargins);

  const sheetPage = outDoc.addPage([sheetWPt, sheetHPt]);
  const offsetXMm = safeBox.leftMm + (safeBox.widthMm - sourceWidthMm) / 2;
  const offsetYMm = safeBox.bottomMm + (safeBox.heightMm - sourceHeightMm) / 2;
  const offsetXPt = UnitConverter.mmToPoints(offsetXMm);
  const offsetYPt = UnitConverter.mmToPoints(offsetYMm);

  sheetPage.pushOperators(
    pushGraphicsState(),
    rectangle(0, 0, sheetWPt, sheetHPt),
    clip(),
    endPath(),
  );
  sheetPage.drawPage(embeddedSource, {
    x: offsetXPt,
    y: offsetYPt,
    width: sourceWPt,
    height: sourceHPt,
  });
  sheetPage.pushOperators(popGraphicsState());

  drawCenteredSheetFooter(
    sheetPage,
    font,
    safeBox,
    `Centered on ${mediaLabel}`,
  );

  if (options.includeScaleBar) {
    const scaleXMm = Math.max(2.0, safeBox.leftMm + 1.0);
    const scaleYMm = Math.max(safeBox.bottomMm + 1.0, safeBox.topMm - SCALE_BAR_BOX_H_MM - 1.5);
    drawScaleCheckBar(sheetPage, font, boldFont, scaleXMm, scaleYMm);
  }

  return outDoc.save();
}

async function layoutTwoSheetTiledPdf(
  sourceBytes: Uint8Array,
  sourceWidthMm: number,
  sourceHeightMm: number,
  bleedMm: number,
  fit: PrintMediaFitEvaluation,
  sheetWMm: number,
  sheetHMm: number,
  options: PdfSheetLayoutOptions,
): Promise<Uint8Array> {
  const mediaLabel = getPrintMediaSpec(fit.mediaId).label;
  const outDoc = await PDFDocument.create();
  outDoc.setTitle(
    options.documentTitle ?? `Bookbinder — Print-Ready Outer Cover (${mediaLabel})`,
  );
  outDoc.setCreator('Bookbinder Studio');

  const [embeddedSource] = await outDoc.embedPdf(sourceBytes);
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const sheetWPt = UnitConverter.mmToPoints(sheetWMm);
  const sheetHPt = UnitConverter.mmToPoints(sheetHMm);
  const sourceWPt = UnitConverter.mmToPoints(sourceWidthMm);
  const sourceHPt = UnitConverter.mmToPoints(sourceHeightMm);
  const safeBox = computePdfSafeBox(sheetWMm, sheetHMm, options.printerMargins);

  const overlapMm = fit.tileOverlapMm;
  const halfOverlapMm = overlapMm / 2;
  const contentWMm = Math.max(1, sourceWidthMm - bleedMm * 2);
  const wrapHalfWithOverlapMm = contentWMm / 2 + halfOverlapMm;
  const leftMarginMm = safeBox.leftMm + (safeBox.widthMm - wrapHalfWithOverlapMm) / 2;
  const drawOriginYMm = safeBox.bottomMm + (safeBox.heightMm - sourceHeightMm) / 2;
  const drawOriginYPt = UnitConverter.mmToPoints(drawOriginYMm);
  const midXMm = sourceWidthMm / 2;

  // Sheet 1: Left half [0 .. midX + halfOverlap]
  const page1 = outDoc.addPage([sheetWPt, sheetHPt]);
  const p1OriginXMm = leftMarginMm - bleedMm;
  const p1ClipX1Mm = Math.max(0, p1OriginXMm);
  const p1ClipX2Mm = leftMarginMm + wrapHalfWithOverlapMm;

  page1.pushOperators(
    pushGraphicsState(),
    rectangle(
      UnitConverter.mmToPoints(p1ClipX1Mm),
      0,
      UnitConverter.mmToPoints(Math.max(0, p1ClipX2Mm - p1ClipX1Mm)),
      sheetHPt,
    ),
    clip(),
    endPath(),
  );
  page1.drawPage(embeddedSource, {
    x: UnitConverter.mmToPoints(p1OriginXMm),
    y: drawOriginYPt,
    width: sourceWPt,
    height: sourceHPt,
  });
  page1.pushOperators(popGraphicsState());

  const p1SeamXMm = leftMarginMm + contentWMm / 2;
  drawTileOverlapOverlay(page1, boldFont, safeBox, sheetHMm, p1SeamXMm, overlapMm, 'left');
  drawCenteredSheetHeader(page1, boldFont, safeBox, sheetHMm, 'SHEET 1 OF 2 (LEFT)');
  drawCenteredSheetFooter(
    page1,
    font,
    safeBox,
    `SHEET 1 OF 2 (LEFT) — ALIGN & TAPE ${overlapMm} mm OVERLAP (${mediaLabel})`,
  );

  if (options.includeScaleBar) {
    const scaleXMm = Math.max(2.0, safeBox.leftMm + 1.0);
    const scaleYMm = Math.max(safeBox.bottomMm + 1.0, safeBox.topMm - SCALE_BAR_BOX_H_MM - 1.5);
    drawScaleCheckBar(page1, font, boldFont, scaleXMm, scaleYMm);
  }

  // Sheet 2: Right half [midX - halfOverlap .. sourceWidthMm]
  const page2 = outDoc.addPage([sheetWPt, sheetHPt]);
  const p2OriginXMm = leftMarginMm - (midXMm - halfOverlapMm);
  const p2ClipX1Mm = leftMarginMm;
  const p2ClipX2Mm = Math.min(sheetWMm, p2OriginXMm + sourceWidthMm);

  page2.pushOperators(
    pushGraphicsState(),
    rectangle(
      UnitConverter.mmToPoints(p2ClipX1Mm),
      0,
      UnitConverter.mmToPoints(Math.max(0, p2ClipX2Mm - p2ClipX1Mm)),
      sheetHPt,
    ),
    clip(),
    endPath(),
  );
  page2.drawPage(embeddedSource, {
    x: UnitConverter.mmToPoints(p2OriginXMm),
    y: drawOriginYPt,
    width: sourceWPt,
    height: sourceHPt,
  });
  page2.pushOperators(popGraphicsState());

  const p2SeamXMm = leftMarginMm + halfOverlapMm;
  drawTileOverlapOverlay(page2, boldFont, safeBox, sheetHMm, p2SeamXMm, overlapMm, 'right');
  drawCenteredSheetHeader(page2, boldFont, safeBox, sheetHMm, 'SHEET 2 OF 2 (RIGHT)');
  drawCenteredSheetFooter(
    page2,
    font,
    safeBox,
    `SHEET 2 OF 2 (RIGHT) — ALIGN & TAPE ${overlapMm} mm OVERLAP (${mediaLabel})`,
  );

  return outDoc.save();
}

/**
 * Lays out a 1:1 physical mm single-page PDF onto a target print media:
 * - exact-auto / roll-* / does-not-fit: keeps exact 1:1 dimensions (optionally stamping a 50 mm calibration scale bar).
 * - fits-1-sheet: centers onto 1 exact desktop paper sheet inside the printable safe box with footer and optional 50 mm scale bar.
 * - fits-2-sheet-tile: horizontally tiles across 2 sheets inside the printable safe box with shaded overlap zone, alignment crosshairs, sheet headers/footers, and optional 50 mm scale bar on Sheet 1.
 */
export async function layoutPdfToPrintMedia(
  sourceBytes: Uint8Array,
  sourceWidthMm: number,
  sourceHeightMm: number,
  options: PdfSheetLayoutOptions,
): Promise<Uint8Array> {
  const overlapMm = clampTileOverlapMm(options.tileOverlapMm ?? TILE_OVERLAP_MM);
  const bleedMm = Math.max(0, options.bleedMm ?? 0);
  const fitWidthMm = Math.max(1, sourceWidthMm - bleedMm * 2);
  const fitHeightMm = Math.max(1, sourceHeightMm - bleedMm * 2);

  const fit = evaluatePrintMediaFit(options.printMediaId, fitWidthMm, fitHeightMm, overlapMm, {
    customRollWidthMm: options.customRollWidthMm,
    margins: options.printerMargins,
  });

  // Case A: exact-auto, wide-format roll, or does-not-fit -> keep exact 1-page 1:1 mm dimensions
  if (
    (fit.status !== 'fits-1-sheet' && fit.status !== 'fits-2-sheet-tile') ||
    fit.sheetPageWidthMm === null ||
    fit.sheetPageHeightMm === null
  ) {
    if (!options.includeScaleBar) {
      return sourceBytes;
    }

    const doc = await PDFDocument.load(sourceBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.getPage(0);
    const safeOriginXMm = Math.min(6.0, Math.max(1.0, sourceWidthMm - SCALE_BAR_BOX_W_MM - 1.0));
    drawScaleCheckBar(page, font, boldFont, safeOriginXMm, 4.0);
    return doc.save();
  }

  // Case B: Centered on 1 exact desktop sheet page at 100% scale
  if (fit.status === 'fits-1-sheet') {
    return layoutSingleSheetCenteredPdf(
      sourceBytes,
      sourceWidthMm,
      sourceHeightMm,
      fit,
      fit.sheetPageWidthMm,
      fit.sheetPageHeightMm,
      options,
    );
  }

  // Case C: 2-sheet horizontally tiled PDF with configurable overlap & alignment crosshairs
  return layoutTwoSheetTiledPdf(
    sourceBytes,
    sourceWidthMm,
    sourceHeightMm,
    bleedMm,
    fit,
    fit.sheetPageWidthMm,
    fit.sheetPageHeightMm,
    options,
  );
}
