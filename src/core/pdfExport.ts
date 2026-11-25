import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { getPrintMediaSpec } from '@/resources/paperSpecs';
import { PAGE_SIZES, type PageSizeId, type PrintMediaId, type SplitMode } from '@/types/bookParams';
import {
  GeometryPrimitives,
  type CaseGeometry,
  type LineSegment2D,
  type PocketEnvelopeGeometry,
  type Point2D,
  type Polygon2D,
  type SpineLinerGeometry,
} from '@/types/geometry';
import {
  PdfGuideOptionsModel,
  type PdfGuideOptions,
  type PdfGuideOptionsInput,
} from '@/types/pdfGuides';
import { UnitConverter, roundTo } from '@/types/units';
import { resolveBindingStrategy } from './bindingStyles';
import {
  FOLD_GUIDE_TICK_GAP_MM,
  INNER_FOLD_GUIDE_TICK_LENGTH_MM,
  computeExternalFoldGuideTicks,
  deriveSplitPanelFoldLines,
  drawPdfFoldGuideTicks,
  transformTicks90CW,
} from './foldGuideTicks';
import { packRects2D, type PackableRect } from './innerTemplatePacker';
import {
  layoutPdfToPrintMedia,
  type PdfSheetLayoutOptions,
  type RollNestingExportOptions,
} from './pdfSheetLayout';
import {
  DEFAULT_PRINTER_MARGINS,
  clampCustomRollWidthMm,
  clampPrinterMargins,
  type PrinterMargins,
} from './printerMargins';
import { composeNestedRollPdf, type RollPdfSource } from './rollNesting';

export const INNER_PAGE_MARGIN_MM = 7.5;
export const INNER_PIECE_GAP_MM = 5.0;
const PAGE_MARGIN_MM = INNER_PAGE_MARGIN_MM;
const PIECE_GAP_MM = INNER_PIECE_GAP_MM;
const CALIBRATION_SIZE_MM = 50.0;
const CALIBRATION_BOX_H_MM = 84.0; // 50mm square + compact title & legend
const CALIBRATION_BOX_W_MM = 62.0;

export type InnerPieceKind = 'back-pocket' | 'front-pocket' | 'spine-liner' | 'calibration-legend';

export interface PlannedPlacement {
  readonly kind: InnerPieceKind;
  readonly pageIndex: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
  readonly clipped: boolean;
}

export interface InnerPdfLayoutPlan {
  readonly pageSizeId: PageSizeId;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly pageCount: number;
  readonly placements: readonly PlannedPlacement[];
}

export interface InnerPdfLayoutOptions {
  /** Include the 50×50 mm scale verification square & cut/score visual legend block. Defaults to false for tighter sheet packing. */
  readonly includeLegend?: boolean;
}

export function planInnerTemplateLayout(
  geometry: CaseGeometry,
  pageSizeId: PageSizeId,
  options?: InnerPdfLayoutOptions,
): InnerPdfLayoutPlan {
  const includeLegend = options?.includeLegend ?? false;
  const sheet = PAGE_SIZES[pageSizeId];

  const items: PackableRect<InnerPieceKind>[] = [
    {
      kind: 'back-pocket',
      widthMm: geometry.backPocket.totalWidthMm,
      heightMm: geometry.backPocket.totalHeightMm,
      allowRotate: true,
    },
    {
      kind: 'front-pocket',
      widthMm: geometry.frontPocket.totalWidthMm,
      heightMm: geometry.frontPocket.totalHeightMm,
      allowRotate: true,
    },
    {
      kind: 'spine-liner',
      widthMm: geometry.spineLiner.widthMm,
      heightMm: geometry.spineLiner.heightMm,
      allowRotate: true,
    },
  ];

  if (includeLegend) {
    items.push({
      kind: 'calibration-legend',
      widthMm: CALIBRATION_BOX_W_MM,
      heightMm: CALIBRATION_BOX_H_MM,
      allowRotate: false,
    });
  }

  const packed = packRects2D(items, {
    pageWidthMm: sheet.widthMm,
    pageHeightMm: sheet.heightMm,
    marginMm: PAGE_MARGIN_MM,
    gapMm: PIECE_GAP_MM,
    preferFirstPageKind: includeLegend ? 'calibration-legend' : undefined,
  });

  return {
    pageSizeId,
    pageWidthMm: sheet.widthMm,
    pageHeightMm: sheet.heightMm,
    pageCount: packed.pageCount,
    placements: packed.placements,
  };
}

class PdfMmWriter {
  private readonly page: PDFPage;
  private readonly pageHeightMm: number;

  constructor(page: PDFPage, pageHeightMm: number) {
    this.page = page;
    this.pageHeightMm = pageHeightMm;
  }

  private toPdfPoint(pt: Point2D): { x: number; y: number } {
    return {
      x: UnitConverter.mmToPoints(pt.x),
      y: UnitConverter.mmToPoints(this.pageHeightMm - pt.y),
    };
  }

  drawLine(
    a: Point2D,
    b: Point2D,
    options: {
      color: ReturnType<typeof rgb>;
      thicknessPt?: number;
      dashArray?: number[];
    },
  ): void {
    this.page.drawLine({
      start: this.toPdfPoint(a),
      end: this.toPdfPoint(b),
      color: options.color,
      thickness: options.thicknessPt ?? 0.8,
      dashArray: options.dashArray,
    });
  }

  drawPolygonOutline(
    polygon: Polygon2D,
    options: {
      color: ReturnType<typeof rgb>;
      thicknessPt?: number;
      dashArray?: number[];
    },
  ): void {
    for (let i = 0; i < polygon.length; i++) {
      const curr = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      this.drawLine(curr, next, options);
    }
  }

  drawRect(
    xMm: number,
    yMm: number,
    widthMm: number,
    heightMm: number,
    options: {
      borderColor?: ReturnType<typeof rgb>;
      borderWidthPt?: number;
      fillColor?: ReturnType<typeof rgb>;
      opacity?: number;
      dashArray?: number[];
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
    color = rgb(0.15, 0.15, 0.15),
  ): void {
    this.page.drawText(text, {
      x: UnitConverter.mmToPoints(xMm),
      y: UnitConverter.mmToPoints(this.pageHeightMm - yMm),
      font,
      size: sizePt,
      color,
    });
  }

  drawHatchedPolygon(polygon: Polygon2D): void {
    const bbox = GeometryPrimitives.boundingBox(polygon);
    // Light shading fill via bounding rect approximation + crisp diagonal hatch strokes
    const hatchStepMm = 3.5;
    const hatchColor = rgb(0.75, 0.68, 0.58);
    for (let d = -bbox.height; d <= bbox.width + bbox.height; d += hatchStepMm) {
      const p1 = { x: bbox.x + d, y: bbox.y };
      const p2 = { x: bbox.x + d - bbox.height, y: bbox.y + bbox.height };
      const clipped = clipSegmentToConvexPolygon(p1, p2, polygon);
      if (clipped) {
        this.drawLine(clipped[0], clipped[1], { color: hatchColor, thicknessPt: 0.45 });
      }
    }
  }
}

/** Clips a 2D line segment against a clockwise convex polygon (Cyrus-Beck). */
function clipSegmentToConvexPolygon(
  p0: Point2D,
  p1: Point2D,
  polygon: Polygon2D,
): [Point2D, Point2D] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  // Determine winding so outward normals work regardless of CW/CCW input
  let signedArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    signedArea += a.x * b.y - b.x * a.y;
  }
  const windingSign = signedArea >= 0 ? 1 : -1;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    // Inward normal
    const nx = -ey * windingSign;
    const ny = ex * windingSign;

    const num = nx * (p0.x - a.x) + ny * (p0.y - a.y);
    const den = nx * dx + ny * dy;

    if (Math.abs(den) < 1e-9) {
      if (num < 0) return null;
      continue;
    }

    const t = -num / den;
    if (den > 0) {
      if (t > t0) t0 = t;
    } else if (t < t1) {
      t1 = t;
    }

    if (t0 > t1) return null;
  }

  return [
    { x: p0.x + t0 * dx, y: p0.y + t0 * dy },
    { x: p0.x + t1 * dx, y: p0.y + t1 * dy },
  ];
}

function transformPoint(
  pt: Point2D,
  placement: PlannedPlacement,
  originalHeightMm: number,
): Point2D {
  const rotated = placement.rotated90
    ? GeometryPrimitives.rotatePoint90CW(pt, originalHeightMm)
    : pt;
  return GeometryPrimitives.translatePoint(rotated, placement.xMm, placement.yMm);
}

function transformPolygon(
  poly: Polygon2D,
  placement: PlannedPlacement,
  originalHeightMm: number,
): Polygon2D {
  return poly.map((pt) => transformPoint(pt, placement, originalHeightMm));
}

function transformLine(
  line: LineSegment2D,
  placement: PlannedPlacement,
  originalHeightMm: number,
): { a: Point2D; b: Point2D } {
  return {
    a: transformPoint({ x: line.x1, y: line.y1 }, placement, originalHeightMm),
    b: transformPoint({ x: line.x2, y: line.y2 }, placement, originalHeightMm),
  };
}

function renderPocket(
  page: PDFPage,
  writer: PdfMmWriter,
  pageWidthMm: number,
  pageHeightMm: number,
  pocket: PocketEnvelopeGeometry,
  placement: PlannedPlacement,
  font: PDFFont,
  boldFont: PDFFont,
  showInteriorLabels: boolean,
  guideOptions: PdfGuideOptions,
): void {
  const cutColor = rgb(0.85, 0.1, 0.1);
  const scoreColor = rgb(0.05, 0.35, 0.85);

  if (guideOptions.includeFoldLines) {
    for (const flap of pocket.glueFlapPolygons) {
      const transformedFlap = transformPolygon(flap, placement, pocket.totalHeightMm);
      writer.drawHatchedPolygon(transformedFlap);
    }
  }

  if (guideOptions.includeCutLines) {
    const cutPoly = transformPolygon(pocket.outerCutPolygon, placement, pocket.totalHeightMm);
    writer.drawPolygonOutline(cutPoly, { color: cutColor, thicknessPt: 0.9 });
  }

  if (guideOptions.includeFoldLines) {
    for (const score of pocket.scoreLines) {
      const { a, b } = transformLine(score, placement, pocket.totalHeightMm);
      writer.drawLine(a, b, { color: scoreColor, thicknessPt: 0.75, dashArray: [4, 3] });
    }
  }

  if (guideOptions.includeFoldGuideTicks) {
    const rawTicks = computeExternalFoldGuideTicks(pocket.outerCutPolygon, pocket.scoreLines, {
      gapMm: FOLD_GUIDE_TICK_GAP_MM,
      lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM,
    });
    const orientedTicks = placement.rotated90
      ? transformTicks90CW(rawTicks, pocket.totalHeightMm)
      : rawTicks;
    drawPdfFoldGuideTicks(page, orientedTicks, {
      pageHeightMm,
      offsetXMm: placement.xMm,
      offsetYMm: placement.yMm,
      clipRectMm: { x: 0, y: 0, width: pageWidthMm, height: pageHeightMm },
    });
  }

  if (
    !showInteriorLabels ||
    (!guideOptions.includeCutLines &&
      !guideOptions.includeFoldLines &&
      !guideOptions.includeFoldGuideTicks)
  ) {
    return;
  }

  const centerLocal = GeometryPrimitives.rectCenter(pocket.faceRect);
  const center = transformPoint(centerLocal, placement, pocket.totalHeightMm);

  if (pocket.kind === 'folded-endpaper') {
    const sheetDim = `${roundTo(pocket.totalWidthMm, 1)} × ${roundTo(pocket.totalHeightMm, 1)} mm`;
    const leafDim = `${roundTo(pocket.pocketWidthMm, 1)} × ${roundTo(pocket.pocketHeightMm, 1)} mm`;
    const halfSummary =
      pocket.side === 'front'
        ? 'Left: Pastedown • Right: Flyleaf'
        : 'Left: Flyleaf • Right: Pastedown';

    writer.drawText(pocket.label.toUpperCase(), center.x - 28, center.y - 6, boldFont, 8.5);
    writer.drawText(
      `Sheet: ${sheetDim} (Leaf: ${leafDim})`,
      center.x - 28,
      center.y + 1,
      font,
      7.2,
      rgb(0.3, 0.3, 0.3),
    );
    writer.drawText(halfSummary, center.x - 28, center.y + 8, font, 6.8, scoreColor);
    writer.drawText(
      'Score & fold along center dashed line',
      center.x - 28,
      center.y + 14,
      font,
      6.5,
      rgb(0.45, 0.38, 0.3),
    );
    return;
  }

  const dimLabel = `${roundTo(pocket.pocketWidthMm, 1)} × ${roundTo(pocket.pocketHeightMm, 1)} mm`;

  writer.drawText(pocket.label.toUpperCase(), center.x - 24, center.y - 4, boldFont, 8.5);
  writer.drawText(`Face: ${dimLabel}`, center.x - 24, center.y + 3, font, 7.5, rgb(0.3, 0.3, 0.3));
  writer.drawText(
    `Open edge: ${pocket.openEdge.toUpperCase()} (faces spine)`,
    center.x - 24,
    center.y + 9,
    font,
    6.8,
    scoreColor,
  );
  writer.drawText(
    'Shaded tabs = Apply Glue',
    center.x - 24,
    center.y + 15,
    font,
    6.5,
    rgb(0.45, 0.38, 0.3),
  );
}

function renderSpineLiner(
  page: PDFPage,
  writer: PdfMmWriter,
  pageWidthMm: number,
  pageHeightMm: number,
  liner: SpineLinerGeometry,
  placement: PlannedPlacement,
  font: PDFFont,
  boldFont: PDFFont,
  showInteriorLabels: boolean,
  guideOptions: PdfGuideOptions,
): void {
  const cutColor = rgb(0.85, 0.1, 0.1);
  const scoreColor = rgb(0.05, 0.35, 0.85);

  const outlineLocal: Polygon2D = [
    { x: 0, y: 0 },
    { x: liner.widthMm, y: 0 },
    { x: liner.widthMm, y: liner.heightMm },
    { x: 0, y: liner.heightMm },
  ];

  if (guideOptions.includeCutLines) {
    const cutPoly = transformPolygon(outlineLocal, placement, liner.heightMm);
    writer.drawPolygonOutline(cutPoly, { color: cutColor, thicknessPt: 0.9 });
  }

  if (guideOptions.includeFoldLines) {
    for (const score of liner.scoreLines) {
      const { a, b } = transformLine(score, placement, liner.heightMm);
      writer.drawLine(a, b, { color: scoreColor, thicknessPt: 0.75, dashArray: [4, 3] });
    }
  }

  if (guideOptions.includeFoldGuideTicks) {
    const rawTicks = computeExternalFoldGuideTicks(outlineLocal, liner.scoreLines, {
      gapMm: FOLD_GUIDE_TICK_GAP_MM,
      lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM,
    });
    const orientedTicks = placement.rotated90
      ? transformTicks90CW(rawTicks, liner.heightMm)
      : rawTicks;
    drawPdfFoldGuideTicks(page, orientedTicks, {
      pageHeightMm,
      offsetXMm: placement.xMm,
      offsetYMm: placement.yMm,
      clipRectMm: { x: 0, y: 0, width: pageWidthMm, height: pageHeightMm },
    });
  }

  if (
    !showInteriorLabels ||
    (!guideOptions.includeCutLines &&
      !guideOptions.includeFoldLines &&
      !guideOptions.includeFoldGuideTicks)
  ) {
    return;
  }

  const center = transformPoint(
    { x: liner.widthMm / 2, y: liner.heightMm / 2 },
    placement,
    liner.heightMm,
  );
  const dimLabel = `${roundTo(liner.widthMm, 1)} × ${roundTo(liner.heightMm, 1)} mm`;
  writer.drawText('SPINE LINER', center.x - 16, center.y - 3, boldFont, 8);
  writer.drawText(dimLabel, center.x - 16, center.y + 3, font, 7, rgb(0.3, 0.3, 0.3));
  writer.drawText('15 mm board overlap/side', center.x - 18, center.y + 9, font, 6.2, scoreColor);
}

function renderCalibrationAndLegend(
  writer: PdfMmWriter,
  placement: PlannedPlacement,
  geometry: CaseGeometry,
  font: PDFFont,
  boldFont: PDFFont,
): void {
  const x = placement.xMm;
  const y = placement.yMm;
  const dark = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.38, 0.38, 0.38);
  const isFoldedEndpapers = geometry.frontPocket.kind === 'folded-endpaper';

  writer.drawText('BOOKBINDER STUDIO', x, y + 3, boldFont, 8.5, dark);
  writer.drawText(
    isFoldedEndpapers
      ? 'Folded Endpapers (Pastedown + Flyleaf) & Spine Liner'
      : 'Inner Pockets & Spine Liner',
    x,
    y + 8,
    font,
    isFoldedEndpapers ? 6.0 : 6.8,
    muted,
  );

  // Exact 50.0 mm x 50.0 mm Calibration Square
  const sqY = y + 12;
  writer.drawRect(x, sqY, CALIBRATION_SIZE_MM, CALIBRATION_SIZE_MM, {
    borderColor: dark,
    borderWidthPt: 1.0,
  });

  // 10mm internal crosshair ruler ticks
  const midX = x + CALIBRATION_SIZE_MM / 2;
  const midY = sqY + CALIBRATION_SIZE_MM / 2;
  writer.drawLine({ x: midX - 4, y: midY }, { x: midX + 4, y: midY }, { color: muted, thicknessPt: 0.5 });
  writer.drawLine({ x: midX, y: midY - 4 }, { x: midX, y: midY + 4 }, { color: muted, thicknessPt: 0.5 });

  writer.drawText('50.0 mm × 50.0 mm', x + 7, sqY + 18, boldFont, 8, dark);
  writer.drawText('50 mm Scale Check', x + 7, sqY + 35, font, 6.8, muted);

  // Visual Legend
  const legY = sqY + CALIBRATION_SIZE_MM + 7;
  writer.drawText('LEGEND', x, legY, boldFont, 7.2, dark);

  writer.drawLine({ x, y: legY + 4 }, { x: x + 12, y: legY + 4 }, { color: rgb(0.85, 0.1, 0.1), thicknessPt: 0.9 });
  writer.drawText('Solid = Cut Line', x + 14, legY + 5, font, 6.6, dark);

  writer.drawLine(
    { x, y: legY + 9 },
    { x: x + 12, y: legY + 9 },
    { color: rgb(0.05, 0.35, 0.85), thicknessPt: 0.8, dashArray: [3, 2] },
  );
  writer.drawText(
    isFoldedEndpapers ? 'Dashed = Center Fold / Score' : 'Dashed = Score & Fold',
    x + 14,
    legY + 10,
    font,
    6.6,
    dark,
  );

  if (isFoldedEndpapers) {
    writer.drawText('Fold in half: Pastedown + Flyleaf', x, legY + 15.5, font, 6.4, muted);
  } else {
    writer.drawHatchedPolygon([
      { x, y: legY + 12.5 },
      { x: x + 12, y: legY + 12.5 },
      { x: x + 12, y: legY + 16.5 },
      { x, y: legY + 16.5 },
    ]);
    writer.drawRect(x, legY + 12.5, 12, 4, { borderColor: muted, borderWidthPt: 0.4 });
    writer.drawText('Hatched = Apply Glue Here', x + 14, legY + 15.5, font, 6.6, dark);
  }

  const spacerNote = `Hinge Spacer: ${roundTo(geometry.cutList.hingeSpacerMm, 1)} mm`;
  writer.drawText(spacerNote, x, legY + 23, boldFont, 6.8, rgb(0.05, 0.35, 0.85));
}

export interface InnerPdfRenderOptions extends PdfGuideOptionsInput {
  /** Optional 300 DPI pre-rendered PNG artwork keyed by inner piece kind */
  readonly pieceArtworkPng?: Partial<
    Record<Exclude<InnerPieceKind, 'calibration-legend'>, Uint8Array>
  >;
  /** Suppress centered dimension text on styled pieces so printed endpaper artwork stays clean */
  readonly hideFaceTextOnStyled?: boolean;
  /** Include the 50×50 mm calibration square & visual legend block. Defaults to false. */
  readonly includeLegend?: boolean;
}

export async function generateInnerTemplatesPdf(
  geometry: CaseGeometry,
  pageSizeId: PageSizeId,
  options?: InnerPdfRenderOptions,
): Promise<{ readonly bytes: Uint8Array; readonly plan: InnerPdfLayoutPlan }> {
  const plan = planInnerTemplateLayout(geometry, pageSizeId, {
    includeLegend: options?.includeLegend,
  });
  const isFoldedEndpapers = geometry.frontPocket.kind === 'folded-endpaper';
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(
    isFoldedEndpapers
      ? 'Bookbinder — Folded Endpapers (Pastedown + Flyleaf) & Spine Liner'
      : 'Bookbinder — Inner Pockets & Spine Liner',
  );
  pdfDoc.setCreator('Bookbinder Studio');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidthPt = UnitConverter.mmToPoints(plan.pageWidthMm);
  const pageHeightPt = UnitConverter.mmToPoints(plan.pageHeightMm);

  const pages: PDFPage[] = [];
  for (let i = 0; i < plan.pageCount; i++) {
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
    pages.push(page);
    const footer = `Page ${i + 1} of ${plan.pageCount} • ${PAGE_SIZES[pageSizeId].label}`;
    page.drawText(footer, {
      x: UnitConverter.mmToPoints(PAGE_MARGIN_MM),
      y: UnitConverter.mmToPoints(4.5),
      size: 6.5,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  const showLabels = !options?.hideFaceTextOnStyled;
  const hasStyledArtwork = Boolean(
    options?.pieceArtworkPng && Object.keys(options.pieceArtworkPng).length > 0,
  );
  const guideOptions = PdfGuideOptionsModel.resolve(
    hasStyledArtwork || options?.hideFaceTextOnStyled ? 'print' : 'template',
    options,
  );

  for (const placement of plan.placements) {
    const page = pages[placement.pageIndex];
    const writer = new PdfMmWriter(page, plan.pageHeightMm);

    if (placement.kind !== 'calibration-legend') {
      const pngBytes = options?.pieceArtworkPng?.[placement.kind];
      if (pngBytes && pngBytes.byteLength > 0) {
        const embeddedPng = await pdfDoc.embedPng(pngBytes);
        page.drawImage(embeddedPng, {
          x: UnitConverter.mmToPoints(placement.xMm),
          y: UnitConverter.mmToPoints(plan.pageHeightMm - (placement.yMm + placement.heightMm)),
          width: UnitConverter.mmToPoints(placement.widthMm),
          height: UnitConverter.mmToPoints(placement.heightMm),
        });
      }
    }

    switch (placement.kind) {
      case 'back-pocket':
        renderPocket(
          page,
          writer,
          plan.pageWidthMm,
          plan.pageHeightMm,
          geometry.backPocket,
          placement,
          font,
          boldFont,
          showLabels,
          guideOptions,
        );
        break;
      case 'front-pocket':
        renderPocket(
          page,
          writer,
          plan.pageWidthMm,
          plan.pageHeightMm,
          geometry.frontPocket,
          placement,
          font,
          boldFont,
          showLabels,
          guideOptions,
        );
        break;
      case 'spine-liner':
        renderSpineLiner(
          page,
          writer,
          plan.pageWidthMm,
          plan.pageHeightMm,
          geometry.spineLiner,
          placement,
          font,
          boldFont,
          showLabels,
          guideOptions,
        );
        break;
      case 'calibration-legend':
        renderCalibrationAndLegend(writer, placement, geometry, font, boldFont);
        break;
    }
  }

  const bytes = await pdfDoc.save();
  return { bytes, plan };
}

export interface OuterWrapPdfOptions extends PdfSheetLayoutOptions, PdfGuideOptionsInput {
  /** When true on 2-sheet softcover-jacket ('separate'), appends detached inner pockets page(s) to the exported PDF. */
  readonly appendInnerPocketsPage?: boolean;
  /** Sheet size for appended inner pockets page(s). Defaults to 'letter'. */
  readonly innerPageSizeId?: PageSizeId;
  /** Optional wide-format roll multi-up nesting / gang-sheet configuration. */
  readonly rollNesting?: RollNestingExportOptions;
}

/**
 * Generates exact 1:1 mm individual PDF sources for inner pockets / endpapers (and spine liner on chipboard covers)
 * so they can be nested directly alongside the outer cover on a wide-format roll strip.
 */
export async function generateInnerPieceRollSources(
  geometry: CaseGeometry,
  copies = 1,
  guideInput?: PdfGuideOptionsInput,
): Promise<RollPdfSource[]> {
  const { capabilities } = resolveBindingStrategy(geometry);
  if (!capabilities.usesInnerPockets) {
    return [];
  }

  const guideOptions = PdfGuideOptionsModel.resolve('template', guideInput);
  const safeCopies = Math.max(1, Math.floor(copies));
  const sources: RollPdfSource[] = [];

  const buildSinglePocketPdf = async (
    pocket: PocketEnvelopeGeometry,
    id: string,
  ): Promise<RollPdfSource> => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const wMm = Math.max(1, pocket.totalWidthMm);
    const hMm = Math.max(1, pocket.totalHeightMm);
    const page = doc.addPage([UnitConverter.mmToPoints(wMm), UnitConverter.mmToPoints(hMm)]);
    const writer = new PdfMmWriter(page, hMm);
    const placement: PlannedPlacement = {
      kind: pocket.side === 'back' ? 'back-pocket' : 'front-pocket',
      pageIndex: 0,
      xMm: 0,
      yMm: 0,
      widthMm: wMm,
      heightMm: hMm,
      rotated90: false,
      clipped: false,
    };
    renderPocket(page, writer, wMm, hMm, pocket, placement, font, boldFont, true, {
      ...guideOptions,
      includeFoldGuideTicks: false,
    });
    const externalFoldGuideTicks = guideOptions.includeFoldGuideTicks
      ? computeExternalFoldGuideTicks(pocket.outerCutPolygon, pocket.scoreLines, {
          gapMm: FOLD_GUIDE_TICK_GAP_MM,
          lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM,
        })
      : undefined;
    return {
      id,
      label: pocket.label,
      pdfBytes: await doc.save(),
      copies: safeCopies,
      externalFoldGuideTicks,
    };
  };

  sources.push(await buildSinglePocketPdf(geometry.backPocket, 'inner-back-pocket'));
  sources.push(await buildSinglePocketPdf(geometry.frontPocket, 'inner-front-pocket'));

  if (capabilities.usesChipboard) {
    const liner = geometry.spineLiner;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const wMm = Math.max(1, liner.widthMm);
    const hMm = Math.max(1, liner.heightMm);
    const page = doc.addPage([UnitConverter.mmToPoints(wMm), UnitConverter.mmToPoints(hMm)]);
    const writer = new PdfMmWriter(page, hMm);
    const placement: PlannedPlacement = {
      kind: 'spine-liner',
      pageIndex: 0,
      xMm: 0,
      yMm: 0,
      widthMm: wMm,
      heightMm: hMm,
      rotated90: false,
      clipped: false,
    };
    renderSpineLiner(page, writer, wMm, hMm, liner, placement, font, boldFont, true, {
      ...guideOptions,
      includeFoldGuideTicks: false,
    });
    const linerOutline: Polygon2D = [
      { x: 0, y: 0 },
      { x: liner.widthMm, y: 0 },
      { x: liner.widthMm, y: liner.heightMm },
      { x: 0, y: liner.heightMm },
    ];
    const externalFoldGuideTicks = guideOptions.includeFoldGuideTicks
      ? computeExternalFoldGuideTicks(linerOutline, liner.scoreLines, {
          gapMm: FOLD_GUIDE_TICK_GAP_MM,
          lengthMm: INNER_FOLD_GUIDE_TICK_LENGTH_MM,
        })
      : undefined;
    sources.push({
      id: 'inner-spine-liner',
      label: 'Spine Liner',
      pdfBytes: await doc.save(),
      copies: safeCopies,
      externalFoldGuideTicks,
    });
  }

  return sources;
}

/**
 * Composes an outer cover PDF (+ optional inner pieces + optional extra gang-sheet PDFs)
 * onto a single wide-format roll strip PDF sized to the selected or custom roll width.
 */
export async function composeRollNestedCoverPdf(
  coverBytes: Uint8Array,
  geometry: CaseGeometry,
  printMediaId: PrintMediaId,
  options: {
    readonly rollNesting: RollNestingExportOptions;
    readonly customRollWidthMm?: number;
    readonly printerMargins?: PrinterMargins;
    readonly includeScaleBar?: boolean;
    readonly coverLabel?: string;
    readonly externalFoldGuideTicks?: readonly LineSegment2D[];
    readonly bleedMm?: number;
    readonly guideOptions?: PdfGuideOptionsInput;
  },
): Promise<Uint8Array> {
  const spec = getPrintMediaSpec(printMediaId);
  const rollWidthMm =
    spec.id === 'roll-custom'
      ? clampCustomRollWidthMm(options.customRollWidthMm)
      : (spec.rollWidthMm ?? clampCustomRollWidthMm(options.customRollWidthMm));
  const effectiveMargins = options.printerMargins
    ? clampPrinterMargins(options.printerMargins)
    : DEFAULT_PRINTER_MARGINS;
  const sideMarginMm = Math.max(effectiveMargins.leftMm, effectiveMargins.rightMm);
  const leadingMarginMm = Math.max(effectiveMargins.topMm, effectiveMargins.bottomMm);
  const copies = Math.max(1, Math.floor(options.rollNesting.copies));

  const sources: RollPdfSource[] = [
    {
      id: 'current-cover',
      label: options.coverLabel ?? 'Outer Cover',
      pdfBytes: coverBytes,
      copies,
      externalFoldGuideTicks: options.externalFoldGuideTicks,
      bleedMm: options.bleedMm,
    },
  ];

  if (
    options.rollNesting.packInnerPockets &&
    resolveBindingStrategy(geometry).capabilities.usesInnerPockets
  ) {
    const innerSources = await generateInnerPieceRollSources(
      geometry,
      copies,
      options.guideOptions,
    );
    sources.push(...innerSources);
  }

  for (const extra of options.rollNesting.extraQueueItems ?? []) {
    if (extra.pdfBytes.byteLength > 0 && extra.copies > 0) {
      sources.push({
        id: extra.id,
        label: extra.label,
        pdfBytes: extra.pdfBytes,
        copies: Math.max(1, Math.floor(extra.copies)),
      });
    }
  }

  const { bytes } = await composeNestedRollPdf(sources, {
    rollWidthMm,
    sideMarginMm,
    leadingMarginMm,
    gutterMm: options.rollNesting.gutterMm,
    includeScaleBar: options.includeScaleBar,
    allowRotation: options.rollNesting.allowRotation,
  });
  return bytes;
}

/**
 * Appends detached inner pockets template page(s) onto an already-generated outer cover PDF.
 */
export async function appendDetachedInnerPocketsPdf(
  outerBytes: Uint8Array,
  geometry: CaseGeometry,
  innerPageSizeId: PageSizeId = 'letter',
  guideOptions?: PdfGuideOptionsInput,
): Promise<Uint8Array> {
  const { bytes: innerBytes } = await generateInnerTemplatesPdf(geometry, innerPageSizeId, {
    includeLegend: false,
    ...guideOptions,
  });
  const mergedDoc = await PDFDocument.load(outerBytes);
  const innerDoc = await PDFDocument.load(innerBytes);
  const copiedPages = await mergedDoc.copyPages(innerDoc, innerDoc.getPageIndices());
  for (const copiedPage of copiedPages) {
    mergedDoc.addPage(copiedPage);
  }
  return mergedDoc.save();
}

/**
 * Generates an exact 1:1 physical mm structural PDF for the Outer Case Wrap
 * (1 page for Single-Piece Continuous Wrap; 3 pages for 3-Piece Quarter-Bound Split).
 */
export async function generateOuterWrapPdf(
  geometry: CaseGeometry,
  splitMode: SplitMode,
  options?: OuterWrapPdfOptions,
): Promise<Uint8Array> {
  const { outerWrap, splitPanels, cutList } = geometry;
  const bleed = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const guideOptions = PdfGuideOptionsModel.resolve('template', options);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Bookbinder — Outer Case Wrap Structural Template');
  pdfDoc.setCreator('Bookbinder Studio');

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cutColor = rgb(0.9, 0.1, 0.1);
  const guideColor = rgb(0.05, 0.38, 0.9);
  const bleedColor = rgb(0.0, 0.62, 0.28);
  const mutedColor = rgb(0.35, 0.35, 0.35);

  if (splitMode === 'three-piece') {
    for (const panel of splitPanels) {
      const pageW = panel.widthMm + bleed * 2;
      const pageH = panel.heightMm + bleed * 2;
      const page = pdfDoc.addPage([
        UnitConverter.mmToPoints(pageW),
        UnitConverter.mmToPoints(pageH),
      ]);
      const writer = new PdfMmWriter(page, pageH);

      if (bleed > 0) {
        writer.drawRect(0.2, 0.2, pageW - 0.4, pageH - 0.4, {
          borderColor: bleedColor,
          borderWidthPt: 0.7,
          dashArray: [4, 2.5],
        });
      }

      if (guideOptions.includeCutLines) {
        const shiftedCut = GeometryPrimitives.translatePolygon(panel.cutPolygon, bleed, bleed);
        writer.drawPolygonOutline(shiftedCut, { color: cutColor, thicknessPt: 0.9 });
      }

      if (guideOptions.includeFoldLines) {
        for (const guide of panel.guideRects) {
          writer.drawRect(
            guide.rect.x + bleed,
            guide.rect.y + bleed,
            guide.rect.width,
            guide.rect.height,
            {
              borderColor: guideColor,
              borderWidthPt: 0.7,
              dashArray: [4, 2.5],
            },
          );
        }
      }

      if (guideOptions.includeFoldGuideTicks) {
        const panelTicks = computeExternalFoldGuideTicks(
          panel.cutPolygon,
          deriveSplitPanelFoldLines(panel),
        );
        drawPdfFoldGuideTicks(page, panelTicks, {
          pageHeightMm: pageH,
          offsetXMm: bleed,
          offsetYMm: bleed,
          clipRectMm: { x: 0, y: 0, width: pageW, height: pageH },
        });
      }

      const cx = pageW / 2;
      const cy = pageH / 2;
      writer.drawText(panel.label.toUpperCase(), cx - 32, cy - 3, boldFont, 9, guideColor);
      writer.drawText(
        `${roundTo(panel.widthMm, 1)} × ${roundTo(panel.heightMm, 1)} mm`,
        cx - 32,
        cy + 5,
        font,
        7.5,
        mutedColor,
      );
    }

    return pdfDoc.save();
  }

  // Single-Piece Continuous Wrap
  const pageW = outerWrap.widthMm + bleed * 2;
  const pageH = outerWrap.heightMm + bleed * 2;
  const page = pdfDoc.addPage([UnitConverter.mmToPoints(pageW), UnitConverter.mmToPoints(pageH)]);
  const writer = new PdfMmWriter(page, pageH);

  if (bleed > 0) {
    writer.drawRect(0.2, 0.2, pageW - 0.4, pageH - 0.4, {
      borderColor: bleedColor,
      borderWidthPt: 0.7,
      dashArray: [4, 2.5],
    });
  }

  const shiftedCut = GeometryPrimitives.translatePolygon(outerWrap.outerCutPolygon, bleed, bleed);
  const strategy = resolveBindingStrategy(outerWrap);
  const { capabilities, panelLabels } = strategy;
  const usesPlacementRects = capabilities.usesChipboard || capabilities.hasGlueTabs;

  if (capabilities.hasGlueTabs && outerWrap.jacketGlueTabPolygons.length > 0 && guideOptions.includeFoldLines) {
    const tabFoldStyle = { color: guideColor, thicknessPt: 0.65, dashArray: [3.5, 2] };
    for (const tabPoly of outerWrap.jacketGlueTabPolygons) {
      const shiftedTab = GeometryPrimitives.translatePolygon(tabPoly, bleed, bleed);
      writer.drawHatchedPolygon(shiftedTab);
      const bbox = GeometryPrimitives.boundingBox(shiftedTab);
      const isTopTab = bbox.y < bleed + outerWrap.heightMm / 2;
      const foldY = isTopTab ? bbox.y + bbox.height : bbox.y;
      writer.drawLine({ x: bbox.x, y: foldY }, { x: bbox.x + bbox.width, y: foldY }, tabFoldStyle);
      writer.drawText(
        'GLUE',
        bbox.x + bbox.width / 2 - 5,
        bbox.y + bbox.height / 2 + 1.5,
        boldFont,
        5.5,
        rgb(0.48, 0.32, 0.08),
      );
    }
  }

  if (guideOptions.includeCutLines) {
    writer.drawPolygonOutline(shiftedCut, { color: cutColor, thicknessPt: 0.95 });
  }

  const drawCenteredLabel = (
    text: string,
    centerXMm: number,
    yMm: number,
    useFont: PDFFont,
    sizePt: number,
    color: ReturnType<typeof rgb>,
  ) => {
    const textWidthMm = UnitConverter.pointsToMm(useFont.widthOfTextAtSize(text, sizePt));
    writer.drawText(text, centerXMm - textWidthMm / 2, yMm, useFont, sizePt, color);
  };

  if (!usesPlacementRects && guideOptions.includeFoldLines) {
    const foldStyle = { color: guideColor, thicknessPt: 0.75, dashArray: [5, 2.5] };
    for (const line of outerWrap.foldLines) {
      writer.drawLine(
        { x: line.x1 + bleed, y: line.y1 + bleed },
        { x: line.x2 + bleed, y: line.y2 + bleed },
        foldStyle,
      );
    }
  }

  const boardRects = [
    { label: panelLabels.back, rect: outerWrap.backBoardRect, isSpine: false },
    { label: panelLabels.spine, rect: outerWrap.spineRect, isSpine: true },
    { label: panelLabels.front, rect: outerWrap.frontBoardRect, isSpine: false },
  ];
  for (const { label, rect, isSpine } of boardRects) {
    if (usesPlacementRects && guideOptions.includeFoldLines) {
      writer.drawRect(rect.x + bleed, rect.y + bleed, rect.width, rect.height, {
        borderColor: guideColor,
        borderWidthPt: 0.75,
        dashArray: [5, 2.5],
      });
    }
    const c = GeometryPrimitives.rectCenter(rect);
    const dim = `${roundTo(rect.width, 1)} × ${roundTo(rect.height, 1)} mm`;
    drawCenteredLabel(label, c.x + bleed, c.y + bleed - 3, boldFont, 8.5, guideColor);
    if (!isSpine) {
      drawCenteredLabel(dim, c.x + bleed, c.y + bleed + 4, font, 7.2, mutedColor);
    }
  }

  if (
    capabilities.hasFlaps &&
    outerWrap.jacketFlapWidthMm > 0 &&
    panelLabels.leftFlap &&
    panelLabels.rightFlap
  ) {
    const flapCenterY = bleed + outerWrap.heightMm / 2;
    const flapDim = `${roundTo(outerWrap.jacketFlapWidthMm, 1)} mm`;
    const leftCenterX = bleed + outerWrap.jacketFlapWidthMm / 2;
    const rightCenterX = bleed + outerWrap.widthMm - outerWrap.jacketFlapWidthMm / 2;
    drawCenteredLabel(panelLabels.leftFlap, leftCenterX, flapCenterY - 2, boldFont, 7.2, guideColor);
    drawCenteredLabel(flapDim, leftCenterX, flapCenterY + 4, font, 6.5, mutedColor);
    drawCenteredLabel(
      panelLabels.rightFlap,
      rightCenterX,
      flapCenterY - 2,
      boldFont,
      7.2,
      guideColor,
    );
    drawCenteredLabel(flapDim, rightCenterX, flapCenterY + 4, font, 6.5, mutedColor);
  }

  if (cutList.hingeSpacerMm > 0 && guideOptions.includeFoldLines) {
    for (const hinge of [outerWrap.leftHingeRect, outerWrap.rightHingeRect]) {
      writer.drawRect(hinge.x + bleed, hinge.y + bleed, hinge.width, hinge.height, {
        borderColor: guideColor,
        borderWidthPt: 0.5,
        dashArray: [2, 2],
      });
    }
  }

  const headerNote = strategy.buildExportNote(outerWrap, cutList);
  const headerX =
    bleed +
    (outerWrap.turnInMm > 0
      ? outerWrap.turnInMm
      : outerWrap.jacketGlueTabHeightMm > 0
        ? outerWrap.jacketFlapWidthMm * 2 + 4
        : outerWrap.jacketFlapWidthMm + 4);
  const headerY =
    bleed +
    (outerWrap.turnInMm > 0
      ? outerWrap.turnInMm * 0.6
      : outerWrap.jacketGlueTabHeightMm > 0
        ? outerWrap.jacketGlueTabHeightMm * 0.65
        : 6);
  writer.drawText(
    headerNote,
    headerX,
    headerY,
    font,
    capabilities.hasTurnIns ? 7.5 : 6.5,
    mutedColor,
  );

  const baseBytes = await pdfDoc.save();
  const externalFoldGuideTicks = guideOptions.includeFoldGuideTicks
    ? computeExternalFoldGuideTicks(outerWrap.outerCutPolygon, outerWrap.foldLines)
    : [];

  const mediaSpec = options ? getPrintMediaSpec(options.printMediaId) : null;
  if (options?.rollNesting?.enabled && mediaSpec?.kind === 'roll') {
    const nestedBytes = await composeRollNestedCoverPdf(
      baseBytes,
      geometry,
      options.printMediaId,
      {
        rollNesting: options.rollNesting,
        customRollWidthMm: options.customRollWidthMm,
        printerMargins: options.printerMargins,
        includeScaleBar: options.includeScaleBar,
        externalFoldGuideTicks,
        bleedMm: bleed,
        guideOptions,
      },
    );
    if (
      options.appendInnerPocketsPage &&
      !options.rollNesting.packInnerPockets &&
      geometry.bindingStyle === 'softcover-jacket' &&
      geometry.softcoverPocketMode === 'separate'
    ) {
      return appendDetachedInnerPocketsPdf(
        nestedBytes,
        geometry,
        options.innerPageSizeId ?? 'letter',
        guideOptions,
      );
    }
    return nestedBytes;
  }

  const needsMediaLayout = Boolean(
    (options && (options.printMediaId !== 'exact-auto' || options.includeScaleBar)) ||
      externalFoldGuideTicks.length > 0,
  );
  const outerBytes = needsMediaLayout
    ? await layoutPdfToPrintMedia(baseBytes, pageW, pageH, {
        printMediaId: options?.printMediaId ?? 'exact-auto',
        tileOverlapMm: options?.tileOverlapMm,
        includeScaleBar: options?.includeScaleBar,
        printerMargins: options?.printerMargins,
        customRollWidthMm: options?.customRollWidthMm,
        bleedMm: options?.bleedMm ?? bleed,
        externalFoldGuideTicks,
        documentTitle:
          options?.documentTitle ?? 'Bookbinder — Outer Case Wrap Structural Template',
      })
    : baseBytes;

  if (
    options?.appendInnerPocketsPage &&
    geometry.bindingStyle === 'softcover-jacket' &&
    geometry.softcoverPocketMode === 'separate'
  ) {
    return appendDetachedInnerPocketsPdf(
      outerBytes,
      geometry,
      options.innerPageSizeId ?? 'letter',
      guideOptions,
    );
  }

  return outerBytes;
}
