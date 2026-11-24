import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getPageSizeSpec } from '@/resources/paperSpecs';
import type { BookParameters, PageSizeId } from '@/types/bookParams';
import type { CaseGeometry, Point2D, Polygon2D } from '@/types/geometry';
import { UnitConverter, roundTo, type UnitSystem } from '@/types/units';
import { resolveBindingStrategy } from './bindingStyles';

export interface BenchRecipePdfOptions {
  readonly pageSizeId: PageSizeId;
  readonly unit: UnitSystem;
  readonly bookTitle?: string;
}

export interface BenchCutListRow {
  readonly item: string;
  readonly qty: string;
  readonly dims: string;
  readonly note?: string;
}

export interface MiterGaugeGeometry {
  /** 7-vertex clockwise L-shaped polygon in local mm coordinates (0..45 x 0..45) */
  readonly polygon: Polygon2D;
  /** Exact inner board registration corner (armWidthMm, armWidthMm) */
  readonly innerCorner: Point2D;
  /** Endpoints of the 45-degree diagonal cutting edge */
  readonly diagonalStart: Point2D;
  readonly diagonalEnd: Point2D;
  readonly outerArmMm: number;
  readonly armWidthMm: number;
  readonly miterGapMm: number;
}

const PAGE_MARGIN_MM = 12.0;
const COLUMN_GUTTER_MM = 6.0;
const JIG_STRIP_HEIGHT_MM = 110.0;
const MITER_OUTER_ARM_MM = 45.0;
const MITER_ARM_WIDTH_MM = 14.0;
const DEFAULT_GLUE_TAB_JIG_W_MM = 10.0;
const SCALE_RULER_LENGTH_MM = 50.0;

/**
 * Normalizes arbitrary Unicode text to WinAnsi-safe ASCII for PDF StandardFonts
 * (Helvetica / TimesRoman) so user titles and dimension symbols never throw encoding errors.
 */
export function sanitizePdfText(input: string): string {
  return input
    .replace(/[\u2014\u2013\u2212]/g, '-')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00B0/g, ' deg')
    .replace(/[\u2022\u00B7]/g, '|')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fmtDimPair(wMm: number, hMm: number, unit: UnitSystem): string {
  const w = UnitConverter.formatValue(wMm, unit);
  const h = UnitConverter.formatValue(hMm, unit);
  return `${w} x ${h} ${unit}`;
}

function fmtSingle(mm: number, unit: UnitSystem): string {
  return `${UnitConverter.formatValue(mm, unit)} ${unit}`;
}

/**
 * Computes the exact 45-degree L-shaped Corner Miter Gauge polygon (45 x 45 mm outer arms,
 * 14 mm arm width) whose diagonal cut edge sits at exact perpendicular distance `miterGapMm`
 * outward from the inner board corner at `(14, 14)`.
 */
export function computeMiterGaugeGeometry(miterGapMm: number): MiterGaugeGeometry {
  const outer = MITER_OUTER_ARM_MM;
  const arm = MITER_ARM_WIDTH_MM;
  const safeGap = Math.max(0.25, Math.min(18.0, Number.isFinite(miterGapMm) ? miterGapMm : 3.0));
  // Line x + y = k has perpendicular distance ((arm + arm) - k) / sqrt(2) from (arm, arm).
  const k = roundTo(Math.max(1.0, Math.min(arm * 2 - 0.35, arm * 2 - safeGap * Math.SQRT2)), 3);

  const diagonalEnd: Point2D = { x: k, y: 0 };
  const diagonalStart: Point2D = { x: 0, y: k };
  const polygon: Polygon2D = [
    diagonalEnd,
    { x: outer, y: 0 },
    { x: outer, y: arm },
    { x: arm, y: arm },
    { x: arm, y: outer },
    { x: 0, y: outer },
    diagonalStart,
  ];

  return {
    polygon,
    innerCorner: { x: arm, y: arm },
    diagonalStart,
    diagonalEnd,
    outerArmMm: outer,
    armWidthMm: arm,
    miterGapMm: roundTo(safeGap, 2),
  };
}

/**
 * Builds capability-driven Cut List & Material Spec rows for any registered binding strategy.
 */
export function buildBenchCutListRows(
  geometry: CaseGeometry,
  unit: UnitSystem,
): readonly BenchCutListRow[] {
  const strategy = resolveBindingStrategy(geometry);
  const { capabilities } = strategy;
  const { cutList, outerWrap, frontPocket, spineLiner } = geometry;
  const rows: BenchCutListRow[] = [];

  if (capabilities.usesChipboard) {
    rows.push({
      item: 'Cover Boards (Chipboard)',
      qty: `${cutList.coverBoards.quantity}x`,
      dims: fmtDimPair(cutList.coverBoards.widthMm, cutList.coverBoards.heightMm, unit),
      note: `${fmtSingle(cutList.boardThicknessMm, unit)} thick`,
    });

    if (capabilities.hasRigidSpine) {
      rows.push({
        item: 'Spine Strip (Chipboard)',
        qty: `${cutList.spineStrip.quantity}x`,
        dims: fmtDimPair(cutList.spineStrip.widthMm, cutList.spineStrip.heightMm, unit),
        note: `${fmtSingle(cutList.boardThicknessMm, unit)} thick`,
      });
    } else {
      rows.push({
        item: 'Flex Cloth Spine Gap',
        qty: '0 boards',
        dims: fmtDimPair(cutList.spineStrip.widthMm, cutList.spineStrip.heightMm, unit),
        note: 'Cloth bridge channel',
      });
    }

    if (capabilities.hasHingeSpacers && cutList.hingeSpacerMm > 0) {
      rows.push({
        item: 'Hinge Spacer Width',
        qty: '2 joints',
        dims: fmtSingle(cutList.hingeSpacerMm, unit),
        note: 'Use Hinge Jig below',
      });
    }
  } else {
    rows.push({
      item: 'Cover Panels (Cardstock)',
      qty: '2 panels',
      dims: fmtDimPair(cutList.coverBoards.widthMm, cutList.coverBoards.heightMm, unit),
      note: '0 chipboard',
    });
    rows.push({
      item: 'Spine Panel',
      qty: '1 panel',
      dims: fmtDimPair(cutList.spineStrip.widthMm, cutList.spineStrip.heightMm, unit),
    });
  }

  rows.push({
    item: 'Outer Wrap (Overall)',
    qty: '1x',
    dims: fmtDimPair(outerWrap.widthMm, outerWrap.heightMm, unit),
    note: outerWrap.includeBleed
      ? `+ ${fmtSingle(outerWrap.bleedMm, unit)} bleed`
      : 'Trim to cut line',
  });

  if (capabilities.hasTurnIns) {
    rows.push({
      item: 'Turn-In / 45 deg Miter Gap',
      qty: '4 edges',
      dims: `${fmtSingle(outerWrap.turnInMm, unit)} / ${fmtSingle(outerWrap.miterGapMm, unit)}`,
      note: 'Use Miter Jig below',
    });
  }

  if (capabilities.hasFlaps && outerWrap.jacketFlapWidthMm > 0) {
    rows.push({
      item: 'Fold-In Fore-Edge Flaps',
      qty: '2x',
      dims: `${fmtSingle(outerWrap.jacketFlapWidthMm, unit)} wide`,
    });
  }

  if (capabilities.hasGlueTabs && outerWrap.jacketGlueTabHeightMm > 0) {
    rows.push({
      item: 'Wrap-Over Glue Tabs',
      qty: '4x',
      dims: `${fmtSingle(outerWrap.jacketGlueTabHeightMm, unit)} tall`,
      note: 'Outer cover top/bottom',
    });
  }

  if (capabilities.usesInnerPockets) {
    rows.push({
      item: 'Inner Pockets (Face)',
      qty: '2x',
      dims: fmtDimPair(frontPocket.pocketWidthMm, frontPocket.pocketHeightMm, unit),
      note: `Cut ${fmtDimPair(frontPocket.totalWidthMm, frontPocket.totalHeightMm, unit)}`,
    });

    if (capabilities.usesChipboard) {
      rows.push({
        item: 'Spine Reinforcement Liner',
        qty: '1x',
        dims: fmtDimPair(spineLiner.widthMm, spineLiner.heightMm, unit),
        note: `${roundTo(spineLiner.boardOverlapMm, 0)} mm overlap/side`,
      });
    }
  }

  return rows;
}

/**
 * Builds capability-driven numbered bench assembly check-off steps.
 */
export function buildBenchChecklistSteps(
  geometry: CaseGeometry,
  unit: UnitSystem,
): readonly string[] {
  const { capabilities } = resolveBindingStrategy(geometry);
  const { cutList, outerWrap } = geometry;

  if (capabilities.usesChipboard && capabilities.hasRigidSpine) {
    return [
      'Cut 2 cover boards + 1 spine strip with grain parallel to spine.',
      'Trim outer wrap & verify the 50 mm scale check bar before gluing.',
      `Center spine strip on wrap; glue boards using ${fmtSingle(cutList.hingeSpacerMm, unit)} Hinge Spacer Jig.`,
      `Trim all 4 corners with the 45 deg Miter Jig (${fmtSingle(outerWrap.miterGapMm, unit)} gap) & fold turn-ins.`,
      'Glue spine reinforcement liner across both hinges; bone-folder grooves.',
      'Fold & glue front and back inner pockets with open edges facing spine.',
      'Press flat under even weight 20-30 min, then slip paperback into pockets.',
    ];
  }

  if (capabilities.usesChipboard && !capabilities.hasRigidSpine) {
    return [
      'Cut 2 cover boards (no spine board) with grain parallel to spine.',
      'Trim outer wrap & mark the center flexible cloth spine channel.',
      `Glue front & back boards leaving ${fmtSingle(cutList.spineStrip.widthMm, unit)} flexible spine gap.`,
      `Trim all 4 corners with the 45 deg Miter Jig (${fmtSingle(outerWrap.miterGapMm, unit)} gap) & fold turn-ins.`,
      'Glue spine reinforcement liner spanning the cloth spine & both boards.',
      'Fold & glue front and back inner pockets with open edges facing spine.',
      'Press flat under weight 20-30 min, then slip paperback into pockets.',
    ];
  }

  if (capabilities.hasGlueTabs && capabilities.hasFlaps) {
    return [
      'Print & trim 1-piece slip cover on 160-250 gsm cardstock (grain parallel to spine).',
      'Score 4 vertical folds (spine & flaps) plus all 4 horizontal glue-tab folds.',
      `Fold both ${fmtSingle(outerWrap.jacketFlapWidthMm, unit)} fore-edge flaps cleanly inward against covers.`,
      `Apply thin PVA glue to backs of all 4 mitered ${fmtSingle(outerWrap.jacketGlueTabHeightMm, unit)} glue tabs.`,
      'Fold glue tabs firmly over outside of tucked flaps to lock slip pockets.',
      'Burnish folds, press 10-15 min, & confirm full pocket height before inserting book.',
    ];
  }

  if (capabilities.hasGlueTabs && capabilities.usesInnerPockets) {
    return [
      'Print & trim outer shell (Sheet 1) + detached inner pockets (Sheet 2) on 200-250 gsm stock.',
      'Score 2 vertical spine folds & 4 horizontal wrap-over glue-tab folds on outer shell.',
      'Score fore-edge glue flaps on detached Front & Back pocket sheets.',
      'Glue pocket fore-edge flaps flush inside outer shell front & back fore-edges.',
      `Fold & glue all 4 ${fmtSingle(outerWrap.jacketGlueTabHeightMm, unit)} wrap-over tabs firmly over pocket edges.`,
      'Burnish edges, press 10-15 min, then slip paperback covers into pockets.',
    ];
  }

  if (capabilities.hasFlaps) {
    return [
      'Print & trim dust jacket on 130-200 gsm paper (grain parallel to spine).',
      'Lightly score all 4 vertical fold lines (2 spine edges + 2 fore-edge flaps).',
      'Wrap gently around existing book spine (no glue required).',
      `Fold both ${fmtSingle(outerWrap.jacketFlapWidthMm, unit)} flaps cleanly inside front & back covers.`,
      'Smooth spine creases with a bone folder for a crisp publisher fit.',
    ];
  }

  return [
    'Print & trim replacement paperback cover on 220-300 gsm cardstock (grain parallel to spine).',
    'Score both vertical spine fold lines cleanly with a bone folder.',
    'Dry-fit wrap around textblock to confirm flush fore-edge & head/tail alignment.',
    'Apply even PVA/EVA glue along textblock spine & seat squarely into scored wrap.',
    'Rub down spine firmly and press flat under weight until adhesive cures.',
  ];
}

class BenchPdfWriter {
  private readonly page: PDFPage;
  private readonly pageHeightMm: number;

  constructor(page: PDFPage, pageHeightMm: number) {
    this.page = page;
    this.pageHeightMm = pageHeightMm;
  }

  private toPt(pt: Point2D): { x: number; y: number } {
    return {
      x: UnitConverter.mmToPoints(pt.x),
      y: UnitConverter.mmToPoints(this.pageHeightMm - pt.y),
    };
  }

  drawLine(
    a: Point2D,
    b: Point2D,
    options: {
      readonly color: ReturnType<typeof rgb>;
      readonly thicknessPt?: number;
      readonly dashArray?: number[];
    },
  ): void {
    this.page.drawLine({
      start: this.toPt(a),
      end: this.toPt(b),
      color: options.color,
      thickness: options.thicknessPt ?? 0.75,
      dashArray: options.dashArray,
    });
  }

  drawPolygon(
    polygon: Polygon2D,
    options: {
      readonly color: ReturnType<typeof rgb>;
      readonly thicknessPt?: number;
      readonly dashArray?: number[];
    },
  ): void {
    for (let i = 0; i < polygon.length; i++) {
      this.drawLine(polygon[i], polygon[(i + 1) % polygon.length], options);
    }
  }

  drawRect(
    xMm: number,
    yMm: number,
    widthMm: number,
    heightMm: number,
    options: {
      readonly borderColor?: ReturnType<typeof rgb>;
      readonly borderWidthPt?: number;
      readonly fillColor?: ReturnType<typeof rgb>;
      readonly opacity?: number;
      readonly dashArray?: number[];
    },
  ): void {
    this.page.drawRectangle({
      x: UnitConverter.mmToPoints(xMm),
      y: UnitConverter.mmToPoints(this.pageHeightMm - (yMm + heightMm)),
      width: UnitConverter.mmToPoints(widthMm),
      height: UnitConverter.mmToPoints(heightMm),
      borderColor: options.borderColor,
      borderWidth: options.borderWidthPt ?? 0,
      color: options.fillColor,
      opacity: options.opacity,
      borderDashArray: options.dashArray,
    });
  }

  drawText(
    text: string,
    xMm: number,
    yMm: number,
    font: PDFFont,
    sizePt: number,
    color = rgb(0.14, 0.14, 0.14),
  ): void {
    const safe = sanitizePdfText(text);
    if (!safe) return;
    this.page.drawText(safe, {
      x: UnitConverter.mmToPoints(xMm),
      y: UnitConverter.mmToPoints(this.pageHeightMm - yMm),
      font,
      size: sizePt,
      color,
    });
  }

  drawWrappedText(
    text: string,
    xMm: number,
    startYMm: number,
    maxWidthMm: number,
    font: PDFFont,
    sizePt: number,
    lineHeightMm: number,
    color = rgb(0.16, 0.16, 0.16),
  ): number {
    const safe = sanitizePdfText(text);
    if (!safe) return startYMm;
    const maxWidthPt = UnitConverter.mmToPoints(maxWidthMm);
    const words = safe.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, sizePt) <= maxWidthPt || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);

    let y = startYMm;
    for (const line of lines) {
      this.drawText(line, xMm, y, font, sizePt, color);
      y += lineHeightMm;
    }
    return y;
  }
}

function drawScaleCheckRuler(
  writer: BenchPdfWriter,
  xMm: number,
  yMm: number,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  const dark = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.38, 0.38, 0.38);
  const border = rgb(0.75, 0.72, 0.66);
  const padX = 3.0;
  const boxW = SCALE_RULER_LENGTH_MM + padX * 2;
  const boxH = 16.0;

  writer.drawRect(xMm, yMm, boxW, boxH, {
    fillColor: rgb(0.985, 0.98, 0.965),
    borderColor: border,
    borderWidthPt: 0.6,
  });

  writer.drawText('50 mm Scale Check (Verify at 100%)', xMm + padX, yMm + 4.2, boldFont, 6.8, dark);

  const barX0 = xMm + padX;
  const baseY = yMm + 10.6;
  writer.drawLine({ x: barX0, y: baseY }, { x: barX0 + SCALE_RULER_LENGTH_MM, y: baseY }, {
    color: dark,
    thicknessPt: 0.85,
  });

  for (let mm = 0; mm <= SCALE_RULER_LENGTH_MM; mm += 5) {
    const isMajor = mm % 10 === 0;
    const tickH = isMajor ? 2.6 : 1.4;
    writer.drawLine(
      { x: barX0 + mm, y: baseY - tickH },
      { x: barX0 + mm, y: baseY },
      { color: dark, thicknessPt: isMajor ? 0.7 : 0.45 },
    );
    if (isMajor) {
      const label = String(mm);
      const labelWmm = UnitConverter.pointsToMm(font.widthOfTextAtSize(label, 5.4));
      writer.drawText(label, barX0 + mm - labelWmm / 2, yMm + 14.2, font, 5.4, muted);
    }
  }
}

function drawStripJig(
  writer: BenchPdfWriter,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  title: string,
  dimSubtitle: string,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  const cutRed = rgb(0.84, 0.12, 0.12);
  const guideBlue = rgb(0.1, 0.36, 0.78);
  const dark = rgb(0.14, 0.14, 0.14);
  const muted = rgb(0.38, 0.38, 0.38);

  writer.drawRect(xMm, yMm, widthMm, heightMm, {
    fillColor: rgb(0.995, 0.975, 0.975),
    borderColor: cutRed,
    borderWidthPt: 0.95,
  });

  // Center tick marks at midpoint (55 mm) + quarter marks
  const midY = yMm + heightMm / 2;
  const tickLen = Math.min(2.8, widthMm * 0.32);
  writer.drawLine({ x: xMm, y: midY }, { x: xMm + tickLen, y: midY }, {
    color: guideBlue,
    thicknessPt: 0.7,
  });
  writer.drawLine({ x: xMm + widthMm - tickLen, y: midY }, { x: xMm + widthMm, y: midY }, {
    color: guideBlue,
    thicknessPt: 0.7,
  });
  // Center vertical dashed axis
  writer.drawLine(
    { x: xMm + widthMm / 2, y: yMm + 4 },
    { x: xMm + widthMm / 2, y: yMm + heightMm - 4 },
    { color: guideBlue, thicknessPt: 0.45, dashArray: [3, 2.5] },
  );

  // Quarter ticks
  for (const ratio of [0.25, 0.75]) {
    const ty = yMm + heightMm * ratio;
    const smallTick = Math.min(1.6, widthMm * 0.22);
    writer.drawLine({ x: xMm, y: ty }, { x: xMm + smallTick, y: ty }, {
      color: guideBlue,
      thicknessPt: 0.45,
    });
    writer.drawLine({ x: xMm + widthMm - smallTick, y: ty }, { x: xMm + widthMm, y: ty }, {
      color: guideBlue,
      thicknessPt: 0.45,
    });
  }

  // Labels placed cleanly beside the strip so narrow spacers (e.g. 6-9 mm) remain legible
  const labelX = xMm + widthMm + 3.0;
  writer.drawText(title, labelX, yMm + 6.0, boldFont, 7.2, dark);
  writer.drawText(dimSubtitle, labelX, yMm + 10.2, font, 6.4, cutRed);
  writer.drawText('Cut along solid red lines', labelX, yMm + 14.5, font, 5.8, muted);
  writer.drawText('Glue to scrap chipboard', labelX, yMm + 18.3, font, 5.8, muted);
}

function drawCornerMiterJig(
  writer: BenchPdfWriter,
  xMm: number,
  yMm: number,
  miterGapMm: number,
  unit: UnitSystem,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  const cutRed = rgb(0.84, 0.12, 0.12);
  const guideBlue = rgb(0.1, 0.36, 0.78);
  const dark = rgb(0.14, 0.14, 0.14);
  const muted = rgb(0.38, 0.38, 0.38);

  const gauge = computeMiterGaugeGeometry(miterGapMm);
  const shiftedPoly: Polygon2D = gauge.polygon.map((pt) => ({ x: pt.x + xMm, y: pt.y + yMm }));

  // Subtle dashed reference showing full 45x45 outer bounds + removed corner triangle
  writer.drawLine(
    { x: xMm, y: yMm },
    { x: xMm + gauge.diagonalEnd.x, y: yMm },
    { color: rgb(0.75, 0.75, 0.75), thicknessPt: 0.4, dashArray: [2, 2] },
  );
  writer.drawLine(
    { x: xMm, y: yMm },
    { x: xMm, y: yMm + gauge.diagonalStart.y },
    { color: rgb(0.75, 0.75, 0.75), thicknessPt: 0.4, dashArray: [2, 2] },
  );

  // Solid red L-shaped cut outline (including exact 45-degree diagonal cutting edge)
  writer.drawPolygon(shiftedPoly, { color: cutRed, thicknessPt: 0.95 });

  // Crisp inner board corner registration mark at (xMm + 14, yMm + 14)
  const cx = xMm + gauge.innerCorner.x;
  const cy = yMm + gauge.innerCorner.y;
  const regLen = 4.5;
  writer.drawLine({ x: cx, y: cy }, { x: cx + regLen, y: cy }, { color: guideBlue, thicknessPt: 0.95 });
  writer.drawLine({ x: cx, y: cy }, { x: cx, y: cy + regLen }, { color: guideBlue, thicknessPt: 0.95 });
  // Small diagonal perpendicular clearance tick from inner corner toward 45-deg cut edge
  const offsetDiag = gauge.miterGapMm / Math.SQRT2;
  writer.drawLine(
    { x: cx, y: cy },
    { x: cx - offsetDiag, y: cy - offsetDiag },
    { color: guideBlue, thicknessPt: 0.6, dashArray: [1.5, 1.5] },
  );

  // Inner nook board placement annotation
  writer.drawText('BUTT BOARD', cx + 3.0, cy + 7.5, boldFont, 6.2, guideBlue);
  writer.drawText('CORNER HERE', cx + 3.0, cy + 11.3, boldFont, 6.2, guideBlue);
  writer.drawText(`45 deg cut = ${fmtSingle(gauge.miterGapMm, unit)}`, cx + 3.0, cy + 16.5, font, 5.8, dark);
  writer.drawText('gap from board corner', cx + 3.0, cy + 20.2, font, 5.4, muted);

  // Title & specs directly under the 45 x 45 mm jig
  const captionY = yMm + gauge.outerArmMm + 5.2;
  writer.drawText('45 deg Corner Miter Gauge (1:1)', xMm, captionY, boldFont, 7.2, dark);
  writer.drawText(
    `Outer 45 x 45 mm | Arm 14 mm | Gap ${fmtSingle(gauge.miterGapMm, unit)}`,
    xMm,
    captionY + 4.2,
    font,
    5.8,
    muted,
  );
  writer.drawWrappedText(
    'Seat chipboard corner into inner L & trim wrap flush along 45 deg bevel.',
    xMm,
    captionY + 8.2,
    56.0,
    font,
    5.6,
    2.6,
    muted,
  );
}

/**
 * Generates a single-page, 1:1 physical mm printable Bench Recipe Card & Scrap-Chipboard
 * Cutting Jigs PDF tailored to the active binding strategy.
 */
export async function generateBenchRecipePdf(
  geometry: CaseGeometry,
  params: BookParameters,
  options: BenchRecipePdfOptions,
): Promise<Uint8Array> {
  const pageSpec = getPageSizeSpec(options.pageSizeId);
  const pageW = pageSpec.widthMm;
  const pageH = pageSpec.heightMm;
  const usableW = pageW - PAGE_MARGIN_MM * 2;

  const strategy = resolveBindingStrategy(geometry);
  const { capabilities } = strategy;

  const pdfDoc = await PDFDocument.create();
  const safeTitle = options.bookTitle?.trim()
    ? sanitizePdfText(options.bookTitle)
    : '';
  pdfDoc.setTitle(
    safeTitle
      ? `Bookbinder Bench Recipe - ${safeTitle}`
      : 'Bookbinder Studio - Bench Recipe & Cutting Jigs',
  );
  pdfDoc.setCreator('Bookbinder Studio');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const page = pdfDoc.addPage([
    UnitConverter.mmToPoints(pageW),
    UnitConverter.mmToPoints(pageH),
  ]);
  const writer = new BenchPdfWriter(page, pageH);

  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.38, 0.38, 0.4);
  const accent = rgb(0.55, 0.36, 0.12);
  const ruleColor = rgb(0.8, 0.76, 0.7);
  const cutRed = rgb(0.84, 0.12, 0.12);
  const guideBlue = rgb(0.1, 0.36, 0.78);

  // --- HEADER ---
  let cursorY = PAGE_MARGIN_MM + 4.5;
  writer.drawText(
    'Bookbinder Studio - Bench Recipe & Cutting Jigs',
    PAGE_MARGIN_MM,
    cursorY,
    serifBold,
    13.5,
    ink,
  );

  if (safeTitle) {
    cursorY += 5.4;
    writer.drawText(`Project: ${safeTitle.slice(0, 72)}`, PAGE_MARGIN_MM, cursorY, boldFont, 9.2, accent);
  }

  cursorY += 4.8;
  const blockDims = `${UnitConverter.formatValue(params.pbWidthMm, options.unit)} x ${UnitConverter.formatValue(params.pbHeightMm, options.unit)} x ${UnitConverter.formatValue(params.pbThicknessMm, options.unit)} ${options.unit}`;
  writer.drawText(
    `Binding Style: ${strategy.label}   |   Book Block: ${blockDims}   |   Sheet: ${pageSpec.shortLabel}`,
    PAGE_MARGIN_MM,
    cursorY,
    font,
    7.8,
    muted,
  );

  cursorY += 3.2;
  writer.drawLine(
    { x: PAGE_MARGIN_MM, y: cursorY },
    { x: pageW - PAGE_MARGIN_MM, y: cursorY },
    { color: ruleColor, thicknessPt: 0.9 },
  );

  // --- SECTIONS 1 & 2 (Side-by-Side Columns so 110 mm Jigs fit cleanly on Letter & A4) ---
  const topSectionY = cursorY + 5.2;
  const leftColW = roundTo(usableW * 0.51, 2);
  const rightColX = PAGE_MARGIN_MM + leftColW + COLUMN_GUTTER_MM;
  const rightColW = usableW - leftColW - COLUMN_GUTTER_MM;

  // Section 1: Cut List & Material Specs
  writer.drawText('1. CUT LIST & MATERIAL SPECS', PAGE_MARGIN_MM, topSectionY, boldFont, 8.6, ink);
  let leftY = topSectionY + 4.0;

  // Table header band
  writer.drawRect(PAGE_MARGIN_MM, leftY - 2.8, leftColW, 4.6, {
    fillColor: rgb(0.95, 0.93, 0.89),
  });
  writer.drawText('Piece / Spec', PAGE_MARGIN_MM + 1.5, leftY + 0.5, boldFont, 6.8, ink);
  writer.drawText('Qty', PAGE_MARGIN_MM + leftColW * 0.52, leftY + 0.5, boldFont, 6.8, ink);
  writer.drawText('Dimensions', PAGE_MARGIN_MM + leftColW * 0.65, leftY + 0.5, boldFont, 6.8, ink);
  leftY += 4.8;

  const cutRows = buildBenchCutListRows(geometry, options.unit);
  for (let i = 0; i < cutRows.length; i++) {
    const row = cutRows[i];
    const rowH = row.note ? 7.4 : 5.2;
    if (i % 2 === 1) {
      writer.drawRect(PAGE_MARGIN_MM, leftY - 2.8, leftColW, rowH, {
        fillColor: rgb(0.985, 0.982, 0.975),
      });
    }
    writer.drawText(row.item, PAGE_MARGIN_MM + 1.5, leftY, boldFont, 6.8, ink);
    writer.drawText(row.qty, PAGE_MARGIN_MM + leftColW * 0.52, leftY, font, 6.6, muted);
    writer.drawText(row.dims, PAGE_MARGIN_MM + leftColW * 0.65, leftY, boldFont, 6.7, ink);
    if (row.note) {
      writer.drawText(row.note, PAGE_MARGIN_MM + 1.5, leftY + 3.0, font, 5.8, muted);
    }
    leftY += rowH;
  }

  // Explicit Grain Direction Callout Box
  leftY += 1.8;
  const grainBoxH = 11.2;
  writer.drawRect(PAGE_MARGIN_MM, leftY - 2.4, leftColW, grainBoxH, {
    fillColor: rgb(0.98, 0.95, 0.88),
    borderColor: accent,
    borderWidthPt: 0.7,
  });
  writer.drawText(
    'GRAIN DIRECTION: PARALLEL TO SPINE',
    PAGE_MARGIN_MM + 2.2,
    leftY + 1.0,
    boldFont,
    7.0,
    accent,
  );
  writer.drawWrappedText(
    'Align chipboard, bookcloth, cover cardstock, & endpaper grain vertically along spine height so covers stay flat.',
    PAGE_MARGIN_MM + 2.2,
    leftY + 4.4,
    leftColW - 4.4,
    font,
    5.8,
    2.8,
    muted,
  );
  leftY += grainBoxH + 1.0;

  // Section 2: Bench Check-Off Assembly Sequence
  writer.drawText('2. BENCH CHECK-OFF ASSEMBLY', rightColX, topSectionY, boldFont, 8.6, ink);
  let rightY = topSectionY + 4.8;
  const steps = buildBenchChecklistSteps(geometry, options.unit);

  for (let i = 0; i < steps.length; i++) {
    // Crisp empty square checkbox
    writer.drawRect(rightColX, rightY - 2.6, 2.9, 2.9, {
      borderColor: ink,
      borderWidthPt: 0.65,
    });
    const nextY = writer.drawWrappedText(
      `${i + 1}. ${steps[i]}`,
      rightColX + 4.4,
      rightY,
      rightColW - 4.4,
      font,
      6.9,
      3.3,
      ink,
    );
    rightY = nextY + 1.5;
  }

  // Material note pill at bottom of right column
  rightY += 1.0;
  rightY = writer.drawWrappedText(
    `Material note: ${strategy.materialNote}`,
    rightColX,
    rightY,
    rightColW,
    font,
    5.9,
    2.9,
    muted,
  );

  // --- SECTION 3: EXACT PRINTABLE CUTTING JIGS (1:1 mm) ---
  const maxSection3TopY = pageH - PAGE_MARGIN_MM - 6.0 - JIG_STRIP_HEIGHT_MM - 12.0;
  const section3HeaderY = Math.min(maxSection3TopY, Math.max(leftY, rightY) + 4.5);

  writer.drawLine(
    { x: PAGE_MARGIN_MM, y: section3HeaderY - 3.0 },
    { x: pageW - PAGE_MARGIN_MM, y: section3HeaderY - 3.0 },
    { color: ruleColor, thicknessPt: 0.9 },
  );

  writer.drawText(
    '3. EXACT PRINTABLE CUTTING JIGS (1:1 mm)',
    PAGE_MARGIN_MM,
    section3HeaderY + 1.5,
    boldFont,
    8.6,
    ink,
  );
  writer.drawText(
    'Cut out & glue onto scrap chipboard for reusable bench jigs. Print at 100% scale (do not Fit to Page).',
    PAGE_MARGIN_MM,
    section3HeaderY + 5.4,
    font,
    6.8,
    muted,
  );

  const jigsTopY = section3HeaderY + 9.5;
  let nextJigX = PAGE_MARGIN_MM;

  // Jig A: Hinge Spacer Jig OR Boardless Glue-Tab / Fold-Guide Strip Jig
  if (capabilities.hasHingeSpacers && geometry.cutList.hingeSpacerMm > 0) {
    const spacerW = geometry.cutList.hingeSpacerMm;
    drawStripJig(
      writer,
      nextJigX,
      jigsTopY,
      spacerW,
      JIG_STRIP_HEIGHT_MM,
      'Hinge Spacer Jig',
      `${roundTo(spacerW, 1)} x ${JIG_STRIP_HEIGHT_MM} mm`,
      font,
      boldFont,
    );
    nextJigX += Math.max(spacerW + 34.0, 48.0);
  } else if (!capabilities.usesChipboard && (capabilities.hasGlueTabs || capabilities.hasFlaps)) {
    const stripW =
      geometry.outerWrap.jacketGlueTabHeightMm > 0
        ? geometry.outerWrap.jacketGlueTabHeightMm
        : DEFAULT_GLUE_TAB_JIG_W_MM;
    drawStripJig(
      writer,
      nextJigX,
      jigsTopY,
      stripW,
      JIG_STRIP_HEIGHT_MM,
      capabilities.hasGlueTabs ? 'Glue-Tab / Fold Strip' : 'Flap Fold Guide Strip',
      `${roundTo(stripW, 1)} x ${JIG_STRIP_HEIGHT_MM} mm`,
      font,
      boldFont,
    );
    nextJigX += Math.max(stripW + 38.0, 52.0);
  }

  // Jig B: 45 deg Corner Miter Gauge Jig (when binding has turn-ins)
  if (capabilities.hasTurnIns && geometry.outerWrap.miterGapMm > 0) {
    drawCornerMiterJig(
      writer,
      nextJigX,
      jigsTopY,
      geometry.outerWrap.miterGapMm,
      options.unit,
      font,
      boldFont,
    );
  }

  // Right-aligned 50 mm Scale-Check Ruler Bar + Legend (always fits inside right margin)
  const rulerBoxW = SCALE_RULER_LENGTH_MM + 6.0;
  const rulerX = pageW - PAGE_MARGIN_MM - rulerBoxW;
  drawScaleCheckRuler(writer, rulerX, jigsTopY, font, boldFont);

  // Compact Visual Key right below the Scale Check Ruler
  const legendY = jigsTopY + 21.0;
  writer.drawRect(rulerX, legendY, rulerBoxW, 25.0, {
    fillColor: rgb(0.985, 0.982, 0.975),
    borderColor: ruleColor,
    borderWidthPt: 0.55,
  });
  writer.drawText('JIG CUT & ALIGNMENT KEY', rulerX + 2.8, legendY + 4.4, boldFont, 6.4, ink);
  writer.drawLine(
    { x: rulerX + 2.8, y: legendY + 8.6 },
    { x: rulerX + 12.0, y: legendY + 8.6 },
    { color: cutRed, thicknessPt: 0.95 },
  );
  writer.drawText('Solid Red = Exact 1:1 Cut', rulerX + 14.0, legendY + 9.4, font, 6.0, ink);
  writer.drawLine(
    { x: rulerX + 2.8, y: legendY + 13.6 },
    { x: rulerX + 12.0, y: legendY + 13.6 },
    { color: guideBlue, thicknessPt: 0.75, dashArray: [3, 2] },
  );
  writer.drawText('Blue = Center / Board Corner', rulerX + 14.0, legendY + 14.4, font, 6.0, ink);
  writer.drawWrappedText(
    'Tip: Stick paper onto 2 mm scrap chipboard with glue stick, let dry 5 min, then trim with craft knife.',
    rulerX + 2.8,
    legendY + 18.6,
    rulerBoxW - 5.6,
    font,
    5.4,
    2.5,
    muted,
  );

  // --- FOOTER ---
  const footerY = pageH - 5.5;
  writer.drawText(
    `Bookbinder Studio Bench Recipe | ${strategy.label} | ${pageSpec.label} | Print at 100% Scale`,
    PAGE_MARGIN_MM,
    footerY,
    font,
    6.4,
    muted,
  );

  return pdfDoc.save();
}
