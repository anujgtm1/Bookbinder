import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';

export interface MarginTestSheetOptions {
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly mediaLabel: string;
  readonly unit?: UnitSystem;
}

const RULER_MAX_MM = 40;
const LABELED_TICKS_MM = new Set([0, 2, 4, 6, 8, 10, 15, 20, 25, 30, 35, 40]);
const CONCENTRIC_INSETS_MM = [5, 10, 15, 20, 30] as const;
const SCALE_SQUARE_MM = 50;

/** Convert arbitrary user/spec labels into strict WinAnsi-safe ASCII for StandardFonts. */
function toAsciiSafe(input: string): string {
  return input
    .replaceAll('\u00d7', 'x')
    .replaceAll('\u2014', '-')
    .replaceAll('\u2013', '-')
    .replaceAll('\u00b7', '|')
    .replaceAll('\u2192', '->')
    .replace(/[^\x20-\x7e]/g, '');
}

function drawDashedRectMm(
  page: PDFPage,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  color: ReturnType<typeof rgb>,
  thickness: number,
  dashArray: number[],
): void {
  const x0 = UnitConverter.mmToPoints(xMm);
  const y0 = UnitConverter.mmToPoints(yMm);
  const x1 = UnitConverter.mmToPoints(xMm + widthMm);
  const y1 = UnitConverter.mmToPoints(yMm + heightMm);

  const segments: readonly [number, number, number, number][] = [
    [x0, y0, x1, y0],
    [x1, y0, x1, y1],
    [x1, y1, x0, y1],
    [x0, y1, x0, y0],
  ];

  for (const [sx, sy, ex, ey] of segments) {
    page.drawLine({
      start: { x: sx, y: sy },
      end: { x: ex, y: ey },
      color,
      thickness,
      dashArray,
    });
  }
}

/**
 * Draw a vertical inward-radiating millimeter ruler along the Top or Bottom physical edge.
 * `edge === 'top'` starts at `y = pageHeightMm` and counts inward downward.
 * `edge === 'bottom'` starts at `y = 0` and counts inward upward.
 */
function drawVerticalEdgeRuler(
  page: PDFPage,
  boldFont: PDFFont,
  centerXMm: number,
  pageHeightMm: number,
  edge: 'top' | 'bottom',
  maxMm: number,
): void {
  const dark = rgb(0.1, 0.1, 0.1);
  const mid = rgb(0.32, 0.32, 0.32);
  const centerXPt = UnitConverter.mmToPoints(centerXMm);
  const startYMm = edge === 'top' ? pageHeightMm : 0;
  const endYMm = edge === 'top' ? pageHeightMm - maxMm : maxMm;

  // Spine line
  page.drawLine({
    start: { x: centerXPt, y: UnitConverter.mmToPoints(startYMm) },
    end: { x: centerXPt, y: UnitConverter.mmToPoints(endYMm) },
    color: dark,
    thickness: 0.65,
  });

  const labelFontSizePt = 4.6;
  const labeledOrder = [0, 2, 4, 6, 8, 10, 15, 20, 25, 30, 35, 40];

  for (let mm = 0; mm <= maxMm; mm += 1) {
    const isLabeled = LABELED_TICKS_MM.has(mm);
    const isMedium = mm % 5 === 0;
    const halfTickMm = isLabeled ? 5.5 : isMedium ? 4.0 : 2.2;
    const thickness = isLabeled ? 0.75 : isMedium ? 0.55 : 0.3;
    const yMm = edge === 'top' ? pageHeightMm - mm : mm;
    const yPt = UnitConverter.mmToPoints(yMm);

    page.drawLine({
      start: { x: UnitConverter.mmToPoints(centerXMm - halfTickMm), y: yPt },
      end: { x: UnitConverter.mmToPoints(centerXMm + halfTickMm), y: yPt },
      color: isLabeled ? dark : mid,
      thickness,
    });

    if (isLabeled) {
      const text = String(mm);
      const textW = boldFont.widthOfTextAtSize(text, labelFontSizePt);
      const idx = labeledOrder.indexOf(mm);
      // Alternate right/left for tightly spaced 0..10 mm ticks so adjacent labels never collide
      const placeLeft = mm <= 10 && idx % 2 === 1;
      const textXPt = placeLeft
        ? UnitConverter.mmToPoints(centerXMm - halfTickMm - 1.0) - textW
        : UnitConverter.mmToPoints(centerXMm + halfTickMm + 1.0);

      // Keep d = 0 label strictly inside the physical page edge
      let textYPt = yPt - labelFontSizePt * 0.34;
      if (mm === 0) {
        textYPt =
          edge === 'top'
            ? UnitConverter.mmToPoints(pageHeightMm) - labelFontSizePt * 0.85
            : labelFontSizePt * 0.15;
      }

      page.drawText(text, {
        x: textXPt,
        y: textYPt,
        size: labelFontSizePt,
        font: boldFont,
        color: dark,
      });
    }
  }
}

/**
 * Draw a horizontal inward-radiating millimeter ruler along the Left or Right physical edge.
 * `edge === 'left'` starts at `x = 0` and counts inward rightward.
 * `edge === 'right'` starts at `x = pageWidthMm` and counts inward leftward.
 */
function drawHorizontalEdgeRuler(
  page: PDFPage,
  boldFont: PDFFont,
  centerYMm: number,
  pageWidthMm: number,
  edge: 'left' | 'right',
  maxMm: number,
): void {
  const dark = rgb(0.1, 0.1, 0.1);
  const mid = rgb(0.32, 0.32, 0.32);
  const centerYPt = UnitConverter.mmToPoints(centerYMm);
  const startXMm = edge === 'left' ? 0 : pageWidthMm;
  const endXMm = edge === 'left' ? maxMm : pageWidthMm - maxMm;

  // Spine line
  page.drawLine({
    start: { x: UnitConverter.mmToPoints(startXMm), y: centerYPt },
    end: { x: UnitConverter.mmToPoints(endXMm), y: centerYPt },
    color: dark,
    thickness: 0.65,
  });

  const labelFontSizePt = 4.6;
  const labeledOrder = [0, 2, 4, 6, 8, 10, 15, 20, 25, 30, 35, 40];

  for (let mm = 0; mm <= maxMm; mm += 1) {
    const isLabeled = LABELED_TICKS_MM.has(mm);
    const isMedium = mm % 5 === 0;
    const halfTickMm = isLabeled ? 5.5 : isMedium ? 4.0 : 2.2;
    const thickness = isLabeled ? 0.75 : isMedium ? 0.55 : 0.3;
    const xMm = edge === 'left' ? mm : pageWidthMm - mm;
    const xPt = UnitConverter.mmToPoints(xMm);

    page.drawLine({
      start: { x: xPt, y: UnitConverter.mmToPoints(centerYMm - halfTickMm) },
      end: { x: xPt, y: UnitConverter.mmToPoints(centerYMm + halfTickMm) },
      color: isLabeled ? dark : mid,
      thickness,
    });

    if (isLabeled) {
      const text = String(mm);
      const textW = boldFont.widthOfTextAtSize(text, labelFontSizePt);
      const idx = labeledOrder.indexOf(mm);
      // Alternate above/below for tightly spaced 0..10 mm ticks so horizontal labels never collide
      const placeBelow = mm <= 10 && idx % 2 === 1;
      const textYPt = placeBelow
        ? UnitConverter.mmToPoints(centerYMm - halfTickMm - 1.0) - labelFontSizePt * 0.85
        : UnitConverter.mmToPoints(centerYMm + halfTickMm + 1.0);

      let textXPt = xPt - textW / 2;
      if (mm === 0) {
        textXPt = edge === 'left' ? 0.8 : UnitConverter.mmToPoints(pageWidthMm) - textW - 0.8;
      }

      page.drawText(text, {
        x: textXPt,
        y: textYPt,
        size: labelFontSizePt,
        font: boldFont,
        color: dark,
      });
    }
  }
}

function drawEdgeLabels(
  page: PDFPage,
  boldFont: PDFFont,
  pageWidthMm: number,
  pageHeightMm: number,
): void {
  const labelColor = rgb(0.18, 0.32, 0.58);
  const sizePt = 6.5;

  // Offset horizontally/vertically from the center 0..40 mm rulers so labels never overlap rulers
  const topLabel = 'TOP EDGE';
  const topXMm = Math.max(12, pageWidthMm * 0.22);
  page.drawText(topLabel, {
    x: UnitConverter.mmToPoints(topXMm),
    y: UnitConverter.mmToPoints(pageHeightMm - 8.5),
    size: sizePt,
    font: boldFont,
    color: labelColor,
  });

  const bottomLabel = 'BOTTOM / TRAILING EDGE';
  const bottomXMm = Math.max(12, pageWidthMm * 0.16);
  page.drawText(bottomLabel, {
    x: UnitConverter.mmToPoints(bottomXMm),
    y: UnitConverter.mmToPoints(6.2),
    size: sizePt,
    font: boldFont,
    color: labelColor,
  });

  const leftLabel = 'LEFT EDGE';
  const leftLabelW = boldFont.widthOfTextAtSize(leftLabel, sizePt);
  const leftYMm = Math.max(25, pageHeightMm * 0.24);
  page.drawText(leftLabel, {
    x: UnitConverter.mmToPoints(8.5),
    y: UnitConverter.mmToPoints(leftYMm) - leftLabelW / 2,
    size: sizePt,
    font: boldFont,
    color: labelColor,
    rotate: degrees(90),
  });

  const rightLabel = 'RIGHT EDGE';
  const rightLabelW = boldFont.widthOfTextAtSize(rightLabel, sizePt);
  const rightYMm = Math.max(25, pageHeightMm * 0.24);
  page.drawText(rightLabel, {
    x: UnitConverter.mmToPoints(pageWidthMm - 8.5),
    y: UnitConverter.mmToPoints(rightYMm) + rightLabelW / 2,
    size: sizePt,
    font: boldFont,
    color: labelColor,
    rotate: degrees(-90),
  });
}

function drawScaleCheckSquare(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  centerXMm: number,
  bottomYMm: number,
  unit: UnitSystem,
): void {
  const x0Mm = centerXMm - SCALE_SQUARE_MM / 2;
  const y0Mm = bottomYMm;
  const x0Pt = UnitConverter.mmToPoints(x0Mm);
  const y0Pt = UnitConverter.mmToPoints(y0Mm);
  const sidePt = UnitConverter.mmToPoints(SCALE_SQUARE_MM);
  const cxPt = UnitConverter.mmToPoints(centerXMm);
  const cyPt = UnitConverter.mmToPoints(y0Mm + SCALE_SQUARE_MM / 2);

  // Outer exact 50.0 x 50.0 mm border
  page.drawRectangle({
    x: x0Pt,
    y: y0Pt,
    width: sidePt,
    height: sidePt,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 0.9,
    color: rgb(0.985, 0.985, 0.985),
  });

  // Subtle internal 10 mm grid tick marks along bottom & left edges of the square
  for (let mm = 10; mm < SCALE_SQUARE_MM; mm += 10) {
    const tickLenPt = UnitConverter.mmToPoints(2.2);
    const txPt = UnitConverter.mmToPoints(x0Mm + mm);
    const tyPt = UnitConverter.mmToPoints(y0Mm + mm);

    page.drawLine({
      start: { x: txPt, y: y0Pt },
      end: { x: txPt, y: y0Pt + tickLenPt },
      color: rgb(0.45, 0.45, 0.45),
      thickness: 0.4,
    });
    page.drawLine({
      start: { x: x0Pt, y: tyPt },
      end: { x: x0Pt + tickLenPt, y: tyPt },
      color: rgb(0.45, 0.45, 0.45),
      thickness: 0.4,
    });
  }

  // Center alignment crosshairs (interrupted around the center text block)
  const armPt = UnitConverter.mmToPoints(4.5);
  const crossColor = rgb(0.55, 0.55, 0.55);
  page.drawLine({
    start: { x: x0Pt + UnitConverter.mmToPoints(2), y: cyPt },
    end: { x: x0Pt + UnitConverter.mmToPoints(2) + armPt, y: cyPt },
    color: crossColor,
    thickness: 0.4,
  });
  page.drawLine({
    start: { x: x0Pt + sidePt - UnitConverter.mmToPoints(2) - armPt, y: cyPt },
    end: { x: x0Pt + sidePt - UnitConverter.mmToPoints(2), y: cyPt },
    color: crossColor,
    thickness: 0.4,
  });
  page.drawLine({
    start: { x: cxPt, y: y0Pt + UnitConverter.mmToPoints(2) },
    end: { x: cxPt, y: y0Pt + UnitConverter.mmToPoints(2) + armPt },
    color: crossColor,
    thickness: 0.4,
  });
  page.drawLine({
    start: { x: cxPt, y: y0Pt + sidePt - UnitConverter.mmToPoints(2) - armPt },
    end: { x: cxPt, y: y0Pt + sidePt - UnitConverter.mmToPoints(2) },
    color: crossColor,
    thickness: 0.4,
  });

  // Centered square labels
  const line1 = '50.0 x 50.0 mm';
  const line2 = 'Scale Check';
  const line1Size = 8.5;
  const line2Size = 7.0;
  const line1W = boldFont.widthOfTextAtSize(line1, line1Size);
  const line2W = font.widthOfTextAtSize(line2, line2Size);

  page.drawText(line1, {
    x: cxPt - line1W / 2,
    y: cyPt + 3.0,
    size: line1Size,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(line2, {
    x: cxPt - line2W / 2,
    y: cyPt - 7.5,
    size: line2Size,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  if (unit === 'in') {
    const inText = `(${UnitConverter.formatValue(SCALE_SQUARE_MM, 'in', 2)} x ${UnitConverter.formatValue(SCALE_SQUARE_MM, 'in', 2)} in)`;
    const inSize = 5.8;
    const inW = font.widthOfTextAtSize(inText, inSize);
    page.drawText(inText, {
      x: cxPt - inW / 2,
      y: cyPt - 16.5,
      size: inSize,
      font,
      color: rgb(0.42, 0.42, 0.42),
    });
  }
}

/**
 * Generates a 1-page exact 1:1 mm Printer Unprintable Margin Calibration Sheet PDF.
 * Includes 0-40 mm edge rulers along all four edges, concentric inset guide boxes
 * (5, 10, 15, 20, 30 mm), step-by-step instructions, and a 50.0 x 50.0 mm Scale Check square.
 */
export async function generateMarginTestSheetPdf(
  options: MarginTestSheetOptions,
): Promise<Uint8Array> {
  const pageWidthMm = Math.max(60, Number.isFinite(options.pageWidthMm) ? options.pageWidthMm : 215.9);
  const pageHeightMm = Math.max(60, Number.isFinite(options.pageHeightMm) ? options.pageHeightMm : 279.4);
  const unit: UnitSystem = options.unit ?? 'mm';
  const safeMediaLabel = toAsciiSafe(options.mediaLabel || 'Custom Media');

  const doc = await PDFDocument.create();
  doc.setTitle(`Bookbinder - Printer Margin Calibration Sheet (${safeMediaLabel})`);
  doc.setCreator('Bookbinder Studio');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWPt = UnitConverter.mmToPoints(pageWidthMm);
  const pageHPt = UnitConverter.mmToPoints(pageHeightMm);
  const page = doc.addPage([pageWPt, pageHPt]);

  // 1. Concentric dashed guide boxes at 5, 10, 15, 20, 30 mm inset from all 4 edges
  for (const insetMm of CONCENTRIC_INSETS_MM) {
    const boxW = pageWidthMm - insetMm * 2;
    const boxH = pageHeightMm - insetMm * 2;
    if (boxW <= 12 || boxH <= 12) continue;

    const isMajorInset = insetMm === 10 || insetMm === 20 || insetMm === 30;
    drawDashedRectMm(
      page,
      insetMm,
      insetMm,
      boxW,
      boxH,
      isMajorInset ? rgb(0.42, 0.5, 0.64) : rgb(0.62, 0.66, 0.72),
      isMajorInset ? 0.55 : 0.35,
      isMajorInset ? [4, 2.5] : [2, 2.5],
    );

    const insetTag = `${insetMm} mm`;
    page.drawText(insetTag, {
      x: UnitConverter.mmToPoints(insetMm + 1.4),
      y: UnitConverter.mmToPoints(pageHeightMm - insetMm - 3.4),
      size: 5.2,
      font: isMajorInset ? boldFont : font,
      color: rgb(0.32, 0.38, 0.48),
    });
  }

  // 2. Edge millimeter tick rulers radiating inward 0..40 mm along all 4 physical edges
  const maxVerticalRulerMm = Math.min(RULER_MAX_MM, Math.floor(pageHeightMm / 2) - 4);
  const maxHorizontalRulerMm = Math.min(RULER_MAX_MM, Math.floor(pageWidthMm / 2) - 4);
  const centerXMm = pageWidthMm / 2;
  const centerYMm = pageHeightMm / 2;

  drawVerticalEdgeRuler(page, boldFont, centerXMm, pageHeightMm, 'top', maxVerticalRulerMm);
  drawVerticalEdgeRuler(page, boldFont, centerXMm, pageHeightMm, 'bottom', maxVerticalRulerMm);
  drawHorizontalEdgeRuler(page, boldFont, centerYMm, pageWidthMm, 'left', maxHorizontalRulerMm);
  drawHorizontalEdgeRuler(page, boldFont, centerYMm, pageWidthMm, 'right', maxHorizontalRulerMm);

  // 3. Clear edge labels
  drawEdgeLabels(page, boldFont, pageWidthMm, pageHeightMm);

  // 4. Center instructions + 50.0 x 50.0 mm Scale Check square
  const cxPt = UnitConverter.mmToPoints(centerXMm);
  const dimMmStr = `${roundTo(pageWidthMm, 1)} x ${roundTo(pageHeightMm, 1)} mm`;
  const dimDisplayStr =
    unit === 'in'
      ? `${UnitConverter.formatValue(pageWidthMm, 'in', 2)} x ${UnitConverter.formatValue(pageHeightMm, 'in', 2)} in (${dimMmStr})`
      : dimMmStr;

  const titleText = 'PRINTER MARGIN CALIBRATION SHEET';
  const subtitleText = `Media: ${safeMediaLabel} - ${dimDisplayStr}`;
  const instructions = [
    '1. Print at 100% / Actual Size (no scaling).',
    '2. Read the first visible mm tick along each edge.',
    '3. Enter Top / Bottom / Left / Right in Bookbinder -> Printer Margins.',
  ];

  // Vertically center the [header + instructions + 50 mm square] block inside the sheet
  const blockTotalHeightMm = 82;
  const blockBottomMm = Math.max(42, centerYMm - blockTotalHeightMm / 2);
  const squareBottomMm = blockBottomMm;
  const textStartYMm = squareBottomMm + SCALE_SQUARE_MM + 26;

  const titleSizePt = 10.0;
  const titleW = boldFont.widthOfTextAtSize(titleText, titleSizePt);
  page.drawText(titleText, {
    x: cxPt - titleW / 2,
    y: UnitConverter.mmToPoints(textStartYMm),
    size: titleSizePt,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  const subSizePt = 7.4;
  const subW = font.widthOfTextAtSize(subtitleText, subSizePt);
  page.drawText(subtitleText, {
    x: cxPt - subW / 2,
    y: UnitConverter.mmToPoints(textStartYMm - 5.2),
    size: subSizePt,
    font,
    color: rgb(0.32, 0.32, 0.32),
  });

  const stepSizePt = 7.2;
  instructions.forEach((line, index) => {
    const lineW = font.widthOfTextAtSize(line, stepSizePt);
    page.drawText(line, {
      x: cxPt - lineW / 2,
      y: UnitConverter.mmToPoints(textStartYMm - 12.2 - index * 4.4),
      size: stepSizePt,
      font,
      color: rgb(0.16, 0.16, 0.16),
    });
  });

  drawScaleCheckSquare(page, font, boldFont, centerXMm, squareBottomMm, unit);

  return doc.save();
}
